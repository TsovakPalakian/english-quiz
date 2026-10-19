import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {StudyError,statement as s} from './learning-study.mjs';
const credentials='passkey-credentials',challenges='passkey-challenges',rates='passkey-rates';
const encoder=new TextEncoder(),TTL=300000,algorithms=[-7,-257];
const fail=(code,message)=>{throw new StudyError(code,message);};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const digest=async value=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const id=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,2048}$/.test(value);
export const passkeyCookie=request=>request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-lumiscia-passkey=([A-Za-z0-9_-]+)/)?.[1]||'';
export const passkeyCookieHeader=token=>'__Host-lumiscia-passkey='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300';
export class Passkeys{
  constructor(db,origin){this.db=db;this.origin=origin;this.rpID=new URL(origin).hostname;}
  async row(namespace,key){const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key]);return row?{raw:row.value_json,value:JSON.parse(row.value_json)}:null;}
  guard(namespace,key,raw){return s('INSERT INTO passkey_guard SELECT EXISTS(SELECT 1 FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?)',[namespace,key,raw]);}
  async atomic(commands){
    try{return await this.db.atomic([s('DROP TABLE IF EXISTS temp.passkey_guard'),s('CREATE TEMP TABLE passkey_guard(ok INTEGER NOT NULL CHECK(ok=1))'),...commands,s('DROP TABLE passkey_guard')]);}
    catch(error){if(/CHECK constraint|UNIQUE constraint|passkey_guard/i.test(error.message||''))fail(409,'Passkey request changed or was already used. Try again.');throw error;}
  }
  async limit(key,max=20){
    const hash=await digest(key),previous=await this.row(rates,hash),now=Date.now();
    const value=previous?.value.expiresAt>now?previous.value:{count:0,expiresAt:now+60000};
    if(value.count>=max)fail(429,'Too many passkey requests. Try again in a minute.');
    const next=JSON.stringify({...value,count:value.count+1});
    await this.atomic(previous?[this.guard(rates,hash,previous.raw),s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=?',[next,rates,hash])]:[s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[rates,hash,next])]);
  }
  async list(account){
    const rows=await this.db.read("SELECT value_json FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.account')=?",[credentials,account]);
    return rows.map(row=>JSON.parse(row.value_json)).filter(row=>row.rpID===this.rpID);
  }
  async issue(kind,{actor,session,rateKey}={}){
    await this.limit(rateKey||actor?.id||'unknown',kind==='login'?120:20);
    await this.db.atomic([s("DELETE FROM catalog_documents WHERE namespace IN (?,?) AND json_extract(value_json,'$.expiresAt')<?",[challenges,rates,Date.now()])]);
    let options;
    if(kind==='register'){
      if(!actor?.id||!session?.sid)fail(401,'Sign in first.');
      const existing=await this.list(actor.id);if(existing.length>=10)fail(400,'Remove a passkey before adding another one.');
      options=await generateRegistrationOptions({rpName:'Lumiscia',rpID:this.rpID,userName:actor.login,userDisplayName:actor.name||actor.login,userID:encoder.encode(await digest(actor.id)),attestationType:'none',supportedAlgorithmIDs:algorithms,
        excludeCredentials:existing.map(row=>({id:row.id,transports:row.transports})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
    }else options=await generateAuthenticationOptions({rpID:this.rpID,userVerification:'required'});
    const token=id();
    await this.db.atomic([s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[challenges,token,JSON.stringify({kind,challenge:options.challenge,origin:this.origin,account:actor?.id||'',sid:session?.sid||'',expiresAt:Date.now()+TTL})])]);
    return {token,options};
  }
  async challenge(token,kind,actor,session){
    if(!valid(token))fail(400,'Start a new passkey request.');
    const row=await this.row(challenges,token),value=row?.value;
    if(!value||value.kind!==kind||value.expiresAt<=Date.now()||value.origin!==this.origin)fail(400,'Passkey request expired. Start again.');
    if(kind==='register'&&(value.account!==actor?.id||value.sid!==session?.sid))fail(403,'Sign in again before adding a passkey.');
    return row;
  }
  consume(token,row){return [this.guard(challenges,token,row.raw),s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[challenges,token])];}
  async register(token,response,actor,session,label){
    const challenge=await this.challenge(token,'register',actor,session);
    let result;
    try{result=await verifyRegistrationResponse({response,expectedChallenge:challenge.value.challenge,expectedOrigin:this.origin,expectedRPID:this.rpID,requireUserVerification:true,supportedAlgorithmIDs:algorithms});}
    catch{fail(400,'Passkey could not be verified. Try again.');}
    if(!result.verified||!result.registrationInfo)fail(400,'Passkey could not be verified.');
    const {credential}=result.registrationInfo;
    const value={id:credential.id,account:actor.id,handle:encode(encoder.encode(await digest(actor.id))),rpID:this.rpID,publicKey:encode(credential.publicKey),counter:credential.counter,transports:credential.transports||[],label:String(label||'Passkey').trim().slice(0,80)||'Passkey',createdAt:Date.now(),lastUsedAt:null};
    await this.atomic([...this.consume(token,challenge),s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[credentials,await digest(value.id),JSON.stringify(value)])]);
    return {ok:true};
  }
  async authenticate(token,response,rateKey){
    await this.limit(rateKey||'unknown',120);
    const challenge=await this.challenge(token,'login');
    if(!valid(response?.id))fail(401,'Passkey not recognized.');
    const key=await digest(response.id),stored=await this.row(credentials,key),value=stored?.value;
    if(!value||value.rpID!==this.rpID)fail(401,'Passkey not recognized.');
    if(response.response?.userHandle&&response.response.userHandle!==value.handle)fail(401,'Passkey account does not match.');
    let result;
    try{result=await verifyAuthenticationResponse({response,expectedChallenge:challenge.value.challenge,expectedOrigin:this.origin,expectedRPID:this.rpID,requireUserVerification:true,credential:{id:value.id,publicKey:decode(value.publicKey),counter:value.counter,transports:value.transports}});}
    catch{fail(401,'Passkey could not be verified.');}
    if(!result.verified)fail(401,'Passkey could not be verified.');
    await this.atomic([...this.consume(token,challenge),this.guard(credentials,key,stored.raw),s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=?',[JSON.stringify({...value,counter:result.authenticationInfo.newCounter,lastUsedAt:Date.now()}),credentials,key])]);
    return {accountId:value.account};
  }
  async remove(account,credentialId){
    if(!valid(credentialId))fail(400,'Invalid passkey.');
    const key=await digest(credentialId),row=await this.row(credentials,key);
    if(!row||row.value.account!==account||row.value.rpID!==this.rpID)fail(404,'Passkey not found.');
    await this.atomic([this.guard(credentials,key,row.raw),s('DELETE FROM catalog_documents WHERE namespace=? AND key=?',[credentials,key])]);return {ok:true};
  }
  async removeAccount(account){
    await this.db.atomic([s("DELETE FROM catalog_documents WHERE namespace IN (?,?) AND json_extract(value_json,'$.account')=?",[credentials,challenges,account])]);
  }
}
