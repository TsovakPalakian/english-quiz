import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {TelegramOAuth,telegramAuthorizeUrl,telegramConfigured,telegramCookie,telegramCookieHeader,verifyTelegramIdToken} from '../src/telegram-oauth.mjs';
import {MicrosoftOAuth} from '../src/microsoft-oauth.mjs';
const env={TELEGRAM_CLIENT_ID:'123456789',TELEGRAM_CLIENT_SECRET:'synthetic-secret'};
const {privateKey,publicKey}=await generateKeyPair('RS256');
const keySet=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'fixture',alg:'RS256'}]});
const sign=(extra={},issuer='https://oauth.telegram.org',audience=env.TELEGRAM_CLIENT_ID)=>new SignJWT({nonce:'fixture-nonce',name:'Student',email:'untrusted@example.invalid',...extra}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(issuer).setSubject('telegram-user-1').setAudience(audience).setIssuedAt().setExpirationTime(extra.exp??'5m').sign(privateKey);
test('Telegram validates signatures, issuer, audience, expiry and optional nonce without trusting email',async()=>{
  const options={keySet};
  const profile=await verifyTelegramIdToken(env,await sign(),'fixture-nonce',options);
  assert.equal(profile.emailSuggestion,'');assert.equal(profile.name,'Student');assert.ok(profile.subject);
  await assert.rejects(verifyTelegramIdToken(env,await sign(),'wrong-nonce',options),error=>error.status===401);
  await assert.rejects(verifyTelegramIdToken(env,await sign({},'https://attacker.invalid'),'fixture-nonce',options),error=>error.status===401);
  await assert.rejects(verifyTelegramIdToken(env,await sign({},undefined,'other-client'),'fixture-nonce',options),error=>error.status===401);
  await assert.rejects(verifyTelegramIdToken(env,await sign({exp:1}),'fixture-nonce',options),error=>error.status===401);
  const token=await sign();await assert.rejects(verifyTelegramIdToken(env,token.slice(0,-10)+'AAAAAAAAAA','fixture-nonce',options),error=>error.status===401);
  assert.equal((await verifyTelegramIdToken(env,await sign({nonce:undefined}),'fixture-nonce',options)).subject,profile.subject);
  assert.equal(telegramConfigured(env),true);assert.equal(telegramConfigured({TELEGRAM_CLIENT_ID:'123'}),false);
});
test('Telegram PKCE flows and identities are isolated from Microsoft and consumed exactly once',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  const db={read:async(query,args=[])=>sql.prepare(query).all(...args),atomic:async commands=>{
    sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...c.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
  }};
  try{
    const telegram=new TelegramOAuth(db,'https://fixture.invalid'),microsoft=new MicrosoftOAuth(db,'https://fixture.invalid');
    const {token,state}=await telegram.start('invite-token','fixture-ip');
    const url=new URL(await telegramAuthorizeUrl(env,new URL('https://fixture.invalid'),token,state));
    assert.equal(url.origin,'https://oauth.telegram.org');assert.equal(url.pathname,'/auth');
    assert.equal(url.searchParams.get('scope'),'openid profile');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('redirect_uri'),'https://fixture.invalid/api/auth/telegram/callback');
    assert.notEqual(url.searchParams.get('code_challenge'),state.verifier);
    assert.equal(url.searchParams.get('state'),token);assert.equal(url.searchParams.get('nonce'),state.nonce);
    assert.ok(!url.toString().includes(env.TELEGRAM_CLIENT_SECRET));
    assert.equal(telegramCookie(new Request('https://fixture.invalid',{headers:{Cookie:'__Host-lumiscia-telegram='+token}})),token);
    assert.match(telegramCookieHeader(token),/HttpOnly; Secure; SameSite=Lax/);
    await assert.rejects(microsoft.peek(token,'authorize'),error=>error.status===410);
    const results=await Promise.allSettled([telegram.consume(token,'authorize'),telegram.consume(token,'authorize')]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await telegram.link('subject',{accountId:'',registrationId:'registration'});
    assert.equal(await microsoft.identity('subject'),null);
    await telegram.approved('registration','account');assert.equal((await telegram.identity('subject')).accountId,'account');
    await assert.rejects(telegram.link('subject',{accountId:'other',registrationId:''}),error=>error.status===409);
    await telegram.removeAccount('account');assert.equal(await telegram.identity('subject'),null);
  }finally{sql.close();}
});
