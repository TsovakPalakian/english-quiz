import {StudyError,statement as s} from './learning-study.mjs';

const namespace='email-otp';
const TTL_MS=10*60*1000;
const MAX_ATTEMPTS=5;
const RESEND_MS=45*1000;
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

function timingSafeEqual(a,b){
  const left=String(a||''),right=String(b||'');
  if(left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);
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

  async issue(rawEmail,{purpose='login'}={}){
    const email=normalizeEmail(rawEmail);
    const key=await sha256Hex(email);
    const current=await this.#load(key);
    const now=Date.now();
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
    return {email,code,expiresAt:next.expiresAt,ttlSec:Math.floor(TTL_MS/1000)};
  }

  async consume(rawEmail,rawCode){
    const email=normalizeEmail(rawEmail);
    const code=String(rawCode||'').trim();
    if(!/^\d{6}$/.test(code))fail(400,'Enter the 6-digit code.');
    const key=await sha256Hex(email);
    const current=await this.#load(key);
    if(!current)fail(400,'Request a new code first.');
    if(current.expiresAt<=Date.now()){
      await this.#remove(key,current);
      fail(400,'Code expired. Request a new one.');
    }
    if((current.attempts||0)>=MAX_ATTEMPTS){
      await this.#remove(key,current);
      fail(429,'Too many attempts. Request a new code.');
    }
    const ok=timingSafeEqual(current.codeHash,await sha256Hex(code+':'+email));
    if(!ok){
      const bumped={...current,attempts:(current.attempts||0)+1};
      delete bumped.raw;
      try{await this.#save(key,bumped,current);}catch{}
      fail(401,'Wrong code.');
    }
    try{await this.#remove(key,current,true);}catch{fail(400,'Code already used. Request a new one.');}
    return {email,purpose:current.purpose||'login'};
  }
}

export {normalizeEmail};
