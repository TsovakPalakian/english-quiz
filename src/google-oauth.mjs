import {StudyError} from './learning-study.mjs';

const fail=(status,message)=>{throw new StudyError(status,message);};
const encoder=new TextEncoder();

function b64url(bytes){
  let bin='';
  for(const b of bytes)bin+=String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function b64urlJson(value){
  return b64url(encoder.encode(JSON.stringify(value)));
}

async function hmacHex(secret,text){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,encoder.encode(text));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function googleConfigured(env){
  return !!(env?.GOOGLE_CLIENT_ID&&env?.GOOGLE_CLIENT_SECRET&&(env.SESSION_SECRET||env.CONTENT_SESSION_SECRET));
}

export function googleRedirectUri(url){
  return `${url.origin}/api/auth/google/callback`;
}

export async function createGoogleState(env,extra={}){
  const secret=env.SESSION_SECRET||env.CONTENT_SESSION_SECRET;
  if(!secret)fail(503,'Sign-in is not configured.');
  const nonce=b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload={n:nonce,t:Date.now(),...extra};
  const body=b64urlJson(payload);
  const sig=await hmacHex(secret,body);
  return {state:body+'.'+sig,nonce};
}

export async function readGoogleState(env,raw){
  const secret=env.SESSION_SECRET||env.CONTENT_SESSION_SECRET;
  if(!secret)fail(503,'Sign-in is not configured.');
  const text=String(raw||'');
  const at=text.lastIndexOf('.');
  if(at<1)fail(400,'Invalid Google sign-in state.');
  const body=text.slice(0,at),sig=text.slice(at+1);
  const expect=await hmacHex(secret,body);
  if(sig.length!==expect.length)fail(400,'Invalid Google sign-in state.');
  let diff=0;for(let i=0;i<sig.length;i++)diff|=sig.charCodeAt(i)^expect.charCodeAt(i);
  if(diff)fail(400,'Invalid Google sign-in state.');
  let payload;
  try{
    const json=atob(body.replace(/-/g,'+').replace(/_/g,'/'));
    payload=JSON.parse(json);
  }catch{fail(400,'Invalid Google sign-in state.');}
  if(!payload?.n||!payload?.t||Date.now()-payload.t>15*60*1000)fail(400,'Google sign-in expired. Try again.');
  return payload;
}

export function googleAuthorizeUrl(env,url,state){
  if(!googleConfigured(env))fail(503,'Google sign-in is not configured.');
  const params=new URLSearchParams({
    client_id:env.GOOGLE_CLIENT_ID,
    redirect_uri:googleRedirectUri(url),
    response_type:'code',
    scope:'openid email profile',
    state,
    prompt:'select_account',
    access_type:'online',
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?'+params.toString();
}

export async function exchangeGoogleCode(env,url,code){
  if(!googleConfigured(env))fail(503,'Google sign-in is not configured.');
  if(!code)fail(400,'Missing Google code.');
  const body=new URLSearchParams({
    code:String(code),
    client_id:env.GOOGLE_CLIENT_ID,
    client_secret:env.GOOGLE_CLIENT_SECRET,
    redirect_uri:googleRedirectUri(url),
    grant_type:'authorization_code',
  });
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!tokenRes.ok)fail(401,'Google sign-in failed.');
  const token=await tokenRes.json();
  if(!token.access_token)fail(401,'Google sign-in failed.');
  const profileRes=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
  if(!profileRes.ok)fail(401,'Google profile unavailable.');
  const profile=await profileRes.json();
  const email=String(profile.email||'').trim().toLowerCase();
  if(!email||profile.email_verified===false)fail(403,'Google email is not verified.');
  return {
    email,
    name:String(profile.name||'').trim().slice(0,80),
    sub:String(profile.sub||'').slice(0,128),
  };
}
