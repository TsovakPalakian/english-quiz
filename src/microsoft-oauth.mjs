import {decodeJwt,jwtVerify,createLocalJWKSet} from 'jose';
import {StudyError} from './learning-study.mjs';
import {FederatedOAuthState} from './federated-oauth-state.mjs';
const base='https://login.microsoftonline.com/common',encoder=new TextEncoder();
const fail=(status,message)=>{throw new StudyError(status,message);};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const digest=async text=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));
export const microsoftConfigured=env=>!!(env.MICROSOFT_CLIENT_ID&&env.MICROSOFT_CLIENT_SECRET);
export const microsoftCookie=request=>request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-lumiscia-microsoft=([A-Za-z0-9_-]+)/)?.[1]||'';
export const microsoftCookieHeader=(token='')=>'__Host-lumiscia-microsoft='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(token?'600':'0');
export const microsoftRedirectUri=url=>url.origin+'/api/auth/microsoft/callback';
export async function microsoftAuthorizeUrl(env,url,token,state){
  const query=new URLSearchParams({client_id:env.MICROSOFT_CLIENT_ID,response_type:'code',redirect_uri:microsoftRedirectUri(url),response_mode:'query',scope:'openid profile email',state:token,nonce:state.nonce,code_challenge:await digest(state.verifier),code_challenge_method:'S256',prompt:'select_account'});
  return base+'/oauth2/v2.0/authorize?'+query;
}
let keyCache=null,keyTime=0,keyFlight=null;
async function signingKeys(force=false){
  if(keyCache&&Date.now()-keyTime<(force?60000:3600000))return keyCache;
  if(!keyFlight)keyFlight=(async()=>{
    const response=await fetch(base+'/discovery/v2.0/keys',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)fail(503,'Microsoft signing keys unavailable.');
    const value=await response.json();if(!Array.isArray(value.keys))fail(503,'Microsoft signing keys unavailable.');
    keyCache=value;keyTime=Date.now();return value;
  })().finally(()=>{keyFlight=null;});
  return keyFlight;
}
export async function verifyMicrosoftIdToken(env,token,nonce,{jwks}={}){
  let untrusted;try{untrusted=decodeJwt(token);}catch{fail(401,'Invalid Microsoft identity.');}
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(untrusted.tid||''))fail(401,'Invalid Microsoft tenant.');
  const issuer='https://login.microsoftonline.com/'+untrusted.tid+'/v2.0';
  const verify=keys=>jwtVerify(token,createLocalJWKSet({keys:keys.keys.filter(key=>key.issuer===issuer||key.issuer==='https://login.microsoftonline.com/{tenantid}/v2.0')}),{
    issuer,audience:env.MICROSOFT_CLIENT_ID,algorithms:['RS256'],requiredClaims:['exp','iat','sub','tid','nonce'],clockTolerance:30,maxTokenAge:'10m',
  });
  let payload;
  try{({payload}=await verify(jwks||await signingKeys()));}
  catch(error){
    if(!jwks&&error.code==='ERR_JWKS_NO_MATCHING_KEY')try{({payload}=await verify(await signingKeys(true)));}catch{}
    if(!payload)fail(401,'Microsoft identity could not be verified.');
  }
  if(payload.nonce!==nonce||payload.ver!=='2.0'||!payload.sub||payload.azp&&payload.azp!==env.MICROSOFT_CLIENT_ID||Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==env.MICROSOFT_CLIENT_ID)fail(401,'Microsoft identity does not match this sign-in.');
  const suggested=String(payload.email||payload.preferred_username||'').trim().toLowerCase();
  return {subject:await digest(payload.iss+'\0'+payload.sub),name:String(payload.name||'').trim().slice(0,80),emailSuggestion:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suggested)&&suggested.length<=120?suggested:''};
}
export async function exchangeMicrosoftCode(env,url,code,state){
  if(typeof code!=='string'||!code||code.length>8192)fail(400,'Missing Microsoft authorization code.');
  const body=new URLSearchParams({client_id:env.MICROSOFT_CLIENT_ID,client_secret:env.MICROSOFT_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:microsoftRedirectUri(url),code_verifier:state.verifier,scope:'openid profile email'});
  const response=await fetch(base+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000)});
  if(!response.ok)fail(401,'Microsoft sign-in failed.');
  const result=await response.json();
  return verifyMicrosoftIdToken(env,result.id_token,state.nonce);
}
export class MicrosoftOAuth extends FederatedOAuthState{}
