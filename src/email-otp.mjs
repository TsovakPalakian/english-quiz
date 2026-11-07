import {StudyError,statement as s} from './learning-study.mjs';

const namespace='email-otp';
const ipNamespace='email-otp-ip';
const banNamespace='email-otp-ban';
const TTL_MS=60*60*1000;
const MAX_ATTEMPTS=3;
const RESEND_MS=12*60*60*1000;
const BAN_MS=48*60*60*1000;
const IP_WINDOW_MS=15*60*1000;
const IP_RATE_LIMIT=5;
const encoder=new TextEncoder();
const fail=(status,message)=>{throw new StudyError(status,message);};

function normalizeEmail(raw){
  const email=String(raw||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120)fail(400,'Enter a valid email.');
  return email;
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function timingSafeHexEqual(a, b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  const aBuf=encoder.encode(a),bBuf=encoder.encode(b);
  if(typeof crypto?.subtle?.timingSafeEqual==='function'){
    return crypto.subtle.timingSafeEqual(aBuf,bBuf);
  }
  let diff=0;
  for(let i=0;i<aBuf.length;i++)diff|=aBuf[i]^bBuf[i];
  return diff===0;
}

export class EmailOtp{
  constructor(db){this.db=db;}

  async #load(key){
    const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key]);
    if(!row)return null;
    try{
      const value=JSON.parse(row.value_json);
      return {...value,raw:row.value_json};
    }catch{
      return null;
    }
  }

  async #save(key,next,previous){
    const payload=JSON.stringify({
      codeHash:next.codeHash,
      email:next.email,
      expiresAt:next.expiresAt,
      attempts:next.attempts||0,
      sentAt:next.sentAt,
      purpose:next.purpose||'login',
    });
    if(!previous){
      await this.db.atomic([s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[namespace,key,payload])]);
      return;
    }
    await this.db.atomic([
      s('DROP TABLE IF EXISTS temp.email_otp_guard'),
      s('CREATE TEMP TABLE email_otp_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
      s('INSERT INTO email_otp_guard SELECT EXISTS(SELECT 1 FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?)',[namespace,key,previous.raw]),
      s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=? AND value_json=?',[payload,namespace,key,previous.raw]),
      s('INSERT INTO email_otp_guard SELECT changes()=1'),
      s('DROP TABLE email_otp_guard'),
    ]);
  }

  async #remove(key,previous,singleUse=false){
    if(!previous)return;
    await this.db.atomic([
      ...(singleUse?[s('DROP TABLE IF EXISTS temp.email_otp_consume_guard'),s('CREATE TEMP TABLE email_otp_consume_guard(ok INTEGER NOT NULL CHECK(ok=1))')]:[]),
      s('DELETE FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?',[namespace,key,previous.raw]),
      ...(singleUse?[s('INSERT INTO email_otp_consume_guard SELECT changes()=1'),s('DROP TABLE email_otp_consume_guard')]:[]),
    ]);
  }

  async #loadIp(ipKey, now){
    const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[ipNamespace,ipKey]);
    if(!row)return [];
    try{
      const parsed=JSON.parse(row.value_json);
      if(Array.isArray(parsed?.timestamps)){
        return parsed.timestamps.filter(t=>typeof t==='number'&&now-t<IP_WINDOW_MS);
      }
    }catch{}
    return [];
  }

  async #saveIp(ipKey, timestamps){
    const payload=JSON.stringify({ipKey,timestamps});
    await this.db.atomic([
      s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[ipNamespace,ipKey]),
      s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[ipNamespace,ipKey,payload]),
    ]);
  }

  async #loadBan(banKey, now){
    const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[banNamespace,banKey]);
    if(!row)return null;
    try{
      const parsed=JSON.parse(row.value_json);
      if(parsed?.bannedUntil&&parsed.bannedUntil>now)return parsed;
    }catch{}
    return null;
  }

  async #setBan(banKey, details, now){
    const payload=JSON.stringify({bannedUntil:now+BAN_MS,bannedAt:now,...details});
    await this.db.atomic([
      s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[banNamespace,banKey]),
      s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[banNamespace,banKey,payload]),
    ]);
  }

  async issue(rawEmail,{purpose='login',clientIp=''}={}){
    const email=normalizeEmail(rawEmail);
    const now=Date.now();
    const cleanIp=String(clientIp||'').trim();
    let ipKey=null,ipHistory=[];
    if(cleanIp){
      ipKey=await sha256Hex('ip:'+cleanIp);
      const ipBan=await this.#loadBan(ipKey,now);
      if(ipBan)fail(429,'Too many invalid attempts. Suspended for 48 hours.');
      ipHistory=await this.#loadIp(ipKey,now);
      if(ipHistory.length>=IP_RATE_LIMIT){
        await this.#setBan(ipKey,{reason:'ip_rate_limit',ip:cleanIp},now);
        fail(429,'Too many OTP requests from this address. Try again later.');
      }
    }
    const emailKey=await sha256Hex('ban:email:'+email);
    const emailBan=await this.#loadBan(emailKey,now);
    if(emailBan)fail(429,'Too many invalid attempts. Suspended for 48 hours.');
    const key=await sha256Hex(email);
    const current=await this.#load(key);
    if(current?.sentAt&&now-current.sentAt<RESEND_MS)fail(429,'Wait a moment before requesting another code.');
    const code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
    const next={
      email,
      codeHash:await sha256Hex(code+':'+email),
      expiresAt:now+TTL_MS,
      attempts:0,
      sentAt:now,
      purpose,
    };
    if(current){
      await this.db.atomic([s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key])]);
    }
    await this.#save(key,next,null);
    if(cleanIp&&ipKey){
      ipHistory.push(now);
      await this.#saveIp(ipKey,ipHistory);
    }
    return {email,code,expiresAt:next.expiresAt,ttlSec:Math.floor(TTL_MS/1000)};
  }

  async consume(rawEmail,rawCode,options={}){
    const clientIp=typeof options==='string'?options:options?.clientIp||'';
    const email=normalizeEmail(rawEmail);
    const code=String(rawCode||'').trim();
    const now=Date.now();
    const cleanIp=String(clientIp||'').trim();
    let ipKey=null;
    if(cleanIp){
      ipKey=await sha256Hex('ip:'+cleanIp);
      const ipBan=await this.#loadBan(ipKey,now);
      if(ipBan)fail(429,'Too many invalid attempts. Suspended for 48 hours.');
    }
    const emailKey=await sha256Hex('ban:email:'+email);
    const emailBan=await this.#loadBan(emailKey,now);
    if(emailBan)fail(429,'Too many invalid attempts. Suspended for 48 hours.');
    if(!/^\d{6}$/.test(code))fail(400,'Enter the 6-digit code.');
    const key=await sha256Hex(email);
    const current=await this.#load(key);
    if(!current)fail(400,'Request a new code first.');
    if(current.expiresAt<=now){
      await this.#remove(key,current);
      fail(400,'Code expired. Request a new one.');
    }
    if((current.attempts||0)>=MAX_ATTEMPTS){
      await this.#remove(key,current);
      if(ipKey)await this.#setBan(ipKey,{reason:'max_attempts',ip:cleanIp},now);
      await this.#setBan(emailKey,{reason:'max_attempts',email},now);
      fail(429,'Too many invalid attempts. Suspended for 48 hours.');
    }
    const ok=timingSafeHexEqual(current.codeHash,await sha256Hex(code+':'+email));
    if(!ok){
      const nextAttempts=(current.attempts||0)+1;
      if(nextAttempts>=MAX_ATTEMPTS){
        await this.#remove(key,current);
        if(ipKey)await this.#setBan(ipKey,{reason:'max_attempts',ip:cleanIp},now);
        await this.#setBan(emailKey,{reason:'max_attempts',email},now);
        fail(429,'Too many invalid attempts. Suspended for 48 hours.');
      }
      const bumped={...current,attempts:nextAttempts};
      delete bumped.raw;
      try{await this.#save(key,bumped,current);}
      catch{
        await this.#remove(key,current);
        fail(401,'Wrong code. Request a new one.');
      }
      fail(401,'Wrong code.');
    }
    try{await this.#remove(key,current,true);}catch{fail(400,'Code already used. Request a new one.');}
    return {email,purpose:current.purpose||'login'};
  }
}

export {normalizeEmail, IP_WINDOW_MS, IP_RATE_LIMIT, TTL_MS, RESEND_MS, BAN_MS, MAX_ATTEMPTS, banNamespace};
