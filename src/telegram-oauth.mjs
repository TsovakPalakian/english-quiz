import {createRemoteJWKSet,jwtVerify} from 'jose';
import {StudyError} from './learning-study.mjs';
import {FederatedOAuthState} from './federated-oauth-state.mjs';

const issuer='https://oauth.telegram.org';
const keys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'),{timeoutDuration:10000});
export const telegramConfigured=env=>!!(env.TELEGRAM_CLIENT_ID&&env.TELEGRAM_CLIENT_SECRET);
export const telegramCookie=request=>request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-lumiscia-telegram=([A-Za-z0-9_-]+)/)?.[1]||'';
export const telegramCookieHeader=(token='')=>'__Host-lumiscia-telegram='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(token?'600':'0');
const redirectUri=url=>url.origin+'/api/auth/telegram/callback';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function telegramAuthorizeUrl(env,url,token,state){
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state.verifier))));
  return issuer+'/auth?'+new URLSearchParams({client_id:env.TELEGRAM_CLIENT_ID,response_type:'code',redirect_uri:redirectUri(url),scope:'openid profile',state:token,nonce:state.nonce,code_challenge:challenge,code_challenge_method:'S256'});
}
export async function verifyTelegramIdToken(env,token,nonce,{keySet=keys}={}){
  let payload;
  try{({payload}=await jwtVerify(token,keySet,{issuer,audience:String(env.TELEGRAM_CLIENT_ID),algorithms:['RS256'],requiredClaims:['sub','iat','exp'],clockTolerance:30,maxTokenAge:'10m'}));}
  catch{throw new StudyError(401,'Telegram identity could not be verified.');}
  // PKCE and the one-use cookie-bound state bind the code; validate nonce when returned.
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256||payload.nonce!==undefined&&payload.nonce!==nonce)throw new StudyError(401,'Telegram identity does not match this sign-in.');
  const subject=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(issuer+'\0'+payload.sub))));
  return {subject,name:String(payload.name||'').trim().slice(0,80),emailSuggestion:''};
}
export async function exchangeTelegramCode(env,url,code,state){
  if(typeof code!=='string'||!code||code.length>8192)throw new StudyError(400,'Missing Telegram authorization code.');
  const body=new URLSearchParams({client_id:env.TELEGRAM_CLIENT_ID,grant_type:'authorization_code',code,redirect_uri:redirectUri(url),code_verifier:state.verifier});
  const response=await fetch(issuer+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+btoa(env.TELEGRAM_CLIENT_ID+':'+env.TELEGRAM_CLIENT_SECRET)},body,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new StudyError(401,'Telegram sign-in failed.');
  const result=await response.json();return verifyTelegramIdToken(env,result.id_token,state.nonce);
}
export class TelegramOAuth extends FederatedOAuthState{
  constructor(db,origin){super(db,origin,'telegram','Telegram');}
}
