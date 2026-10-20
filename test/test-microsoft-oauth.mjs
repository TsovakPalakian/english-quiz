import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {MicrosoftOAuth,microsoftAuthorizeUrl,microsoftConfigured,verifyMicrosoftIdToken} from '../src/microsoft-oauth.mjs';
const clientId='11111111-1111-4111-8111-111111111111';
const tenants=['9188040d-6c67-4c5b-b112-36a304b66dad','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'];
const {privateKey,publicKey}=await generateKeyPair('RS256');
const key={...await exportJWK(publicKey),kid:'fixture-key',alg:'RS256',use:'sig',issuer:'https://login.microsoftonline.com/{tenantid}/v2.0'},jwks={keys:[key]};
const env={MICROSOFT_CLIENT_ID:clientId,MICROSOFT_CLIENT_SECRET:'synthetic-secret-only'};
async function token(tenant=tenants[0],extra={},aud=clientId){
  return new SignJWT({tid:tenant,ver:'2.0',nonce:'fixture-nonce',email:'someone@example.invalid',name:'Microsoft User',...extra}).setProtectedHeader({alg:'RS256',kid:key.kid}).setIssuer('https://login.microsoftonline.com/'+tenant+'/v2.0').setSubject('fixture-subject').setAudience(aud).setIssuedAt().setExpirationTime(extra.exp??'5m').sign(privateKey);
}
test('Microsoft accepts personal and work/school identities without trusting their email for linking',async()=>{
  const personal=await verifyMicrosoftIdToken(env,await token(),'fixture-nonce',{jwks});
  const organization=await verifyMicrosoftIdToken(env,await token(tenants[1]),'fixture-nonce',{jwks});
  assert.equal(personal.emailSuggestion,'someone@example.invalid');assert.equal(personal.name,'Microsoft User');
  assert.notEqual(personal.subject,organization.subject,'Same email in different tenants is not the same identity');
  assert.equal(microsoftConfigured(env),true);assert.equal(microsoftConfigured({}),false);
});
test('Microsoft rejects nonce, audience, version, expiry, tenant and signing-key issuer mismatches',async()=>{
  await assert.rejects(verifyMicrosoftIdToken(env,await token(),'another-nonce',{jwks}),error=>error.status===401);
  await assert.rejects(verifyMicrosoftIdToken(env,await token(tenants[0],{},'another-app'),'fixture-nonce',{jwks}),error=>error.status===401);
  await assert.rejects(verifyMicrosoftIdToken(env,await token(tenants[0],{ver:'1.0'}),'fixture-nonce',{jwks}),error=>error.status===401);
  await assert.rejects(verifyMicrosoftIdToken(env,await token(tenants[0],{exp:1}),'fixture-nonce',{jwks}),error=>error.status===401);
  await assert.rejects(verifyMicrosoftIdToken(env,await token('invalid-tenant'),'fixture-nonce',{jwks}),error=>error.status===401);
  await assert.rejects(verifyMicrosoftIdToken(env,await token(),'fixture-nonce',{jwks:{keys:[{...key,issuer:'https://login.microsoftonline.com/'+tenants[1]+'/v2.0'}]}}),error=>error.status===401);
});
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
  const db={read:async(query,args=[])=>sql.prepare(query).all(...args),atomic:async commands=>{
    sql.exec('BEGIN');try{for(const command of commands)sql.prepare(command.sql).run(...command.args.map(arg=>arg.type==='null'?null:arg.type==='integer'?Number(arg.value):arg.value));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
  }};return {sql,service:new MicrosoftOAuth(db,'https://fixture.invalid')};
}
test('Microsoft authorization uses common, PKCE S256, nonce, narrow scopes and one-time state',async()=>{
  const f=fixture();try{
    const {token,state}=await f.service.start('invite-token','fixture-ip');
    const url=new URL(await microsoftAuthorizeUrl(env,new URL('https://fixture.invalid'),token,state));
    assert.equal(url.pathname,'/common/oauth2/v2.0/authorize');
    assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    assert.equal(url.searchParams.get('redirect_uri'),'https://fixture.invalid/api/auth/microsoft/callback');
    assert.equal(url.searchParams.get('scope'),'openid profile email');assert.ok(url.searchParams.get('nonce'));
    assert.notEqual(url.searchParams.get('code_challenge'),state.verifier);
    const results=await Promise.allSettled([f.service.consume(token,'authorize'),f.service.consume(token,'authorize')]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    const flow=await f.service.newFlow({kind:'email',profile:{subject:'subject'}});
    await f.service.setEmail(flow,'confirmed@example.invalid');assert.equal((await f.service.peek(flow,'email')).value.email,'confirmed@example.invalid');
    await f.service.link('subject',{accountId:'',registrationId:'registration'});
    await f.service.approved('registration','account');assert.equal((await f.service.identity('subject')).accountId,'account');
    await assert.rejects(f.service.link('subject',{accountId:'attacker',registrationId:''}),error=>error.status===409);
    await f.service.removeAccount('account');assert.equal(await f.service.identity('subject'),null);
  }finally{f.sql.close();}
});
