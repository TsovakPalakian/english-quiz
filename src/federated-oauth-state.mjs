import {StudyError,statement as s} from './learning-study.mjs';
const TTL=10*60*1000,encoder=new TextEncoder();
const fail=(status,message)=>{throw new StudyError(status,message);};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const digest=async text=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export class FederatedOAuthState{
  constructor(db,origin,provider='microsoft',label='Microsoft'){this.db=db;this.origin=origin;this.flows=provider+'-flows';this.identities=provider+'-identities';this.label=label;}
  async row(namespace,key){const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key]);return row?{raw:row.value_json,value:JSON.parse(row.value_json)}:null;}
  guard(namespace,key,raw){return s('INSERT INTO microsoft_guard SELECT EXISTS(SELECT 1 FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?)',[namespace,key,raw]);}
  async atomic(commands){
    try{await this.db.atomic([s('DROP TABLE IF EXISTS temp.microsoft_guard'),s('CREATE TEMP TABLE microsoft_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,s('DROP TABLE microsoft_guard')]);}
    catch(error){if(/CHECK constraint|UNIQUE constraint|microsoft_guard/i.test(error.message||''))fail(409,this.label+' sign-in changed. Start again.');throw error;}
  }
  async save(namespace,key,value,previous){
    await this.atomic(previous?[this.guard(namespace,key,previous.raw),s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=?',[JSON.stringify(value),namespace,key])]:[s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[namespace,key,JSON.stringify(value)])]);
  }
  async newFlow(value){
    const token=random();
    await this.db.atomic([s("DELETE FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.expiresAt')<?",[this.flows,Date.now()])]);
    await this.save(this.flows,token,{...value,origin:this.origin,expiresAt:Date.now()+TTL});return token;
  }
  async start(invite,rateKey){
    const key='rate-'+await digest(rateKey||'unknown'),previous=await this.row(this.flows,key),now=Date.now();
    const rate=previous?.value.expiresAt>now?previous.value:{count:0,expiresAt:now+60000};
    if(rate.count>=60)fail(429,'Too many '+this.label+' sign-in requests. Try again shortly.');
    await this.save(this.flows,key,{...rate,count:rate.count+1},previous);
    const state={kind:'authorize',invite,nonce:random(),verifier:random()};
    const token=await this.newFlow(state);return {token,state};
  }
  async peek(token,kind){
    if(!valid(token))fail(400,'Start '+this.label+' sign-in again.');
    const row=await this.row(this.flows,token);
    if(!row||row.value.kind!==kind||row.value.origin!==this.origin||row.value.expiresAt<=Date.now())fail(410,this.label+' sign-in expired. Start again.');
    return row;
  }
  async consume(token,kind){
    const row=await this.peek(token,kind);
    await this.atomic([this.guard(this.flows,token,row.raw),s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[this.flows,token])]);return row.value;
  }
  async setEmail(token,email){const row=await this.peek(token,'email');await this.save(this.flows,token,{...row.value,email},row);}
  async identity(subject){return (await this.row(this.identities,subject))?.value||null;}
  async link(subject,target){
    const previous=await this.identity(subject);
    if(previous){if(previous.accountId!==target.accountId||previous.registrationId!==target.registrationId)fail(409,'This '+this.label+' account is already connected.');return;}
    await this.save(this.identities,subject,{...target,createdAt:Date.now()});
  }
  async approved(registrationId,accountId){
    const rows=await this.db.read("SELECT key,value_json FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.registrationId')=?",[this.identities,registrationId]);
    for(const row of rows)await this.save(this.identities,row.key,{...JSON.parse(row.value_json),accountId},{raw:row.value_json});
  }
  async removeAccount(accountId){await this.db.atomic([s("DELETE FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.accountId')=?",[this.identities,accountId])]);}
}
