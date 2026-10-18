import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleState,readGoogleState,googleAuthorizeUrl,googleConfigured} from '../src/google-oauth.mjs';

test('google oauth state round-trips and authorize url is built',async()=>{
  const env={GOOGLE_CLIENT_ID:'cid.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'secret',SESSION_SECRET:'test-session-secret-value'};
  assert.equal(googleConfigured(env),true);
  const {state}=await createGoogleState(env,{invite:'abc.def'});
  const payload=await readGoogleState(env,state);
  assert.equal(payload.invite,'abc.def');
  const url=googleAuthorizeUrl(env,new URL('https://lumiscia.org/api/auth/google'),state);
  assert.match(url,/accounts\.google\.com/);
  assert.match(url,/client_id=cid/);
  assert.match(url,/redirect_uri=https%3A%2F%2Flumiscia\.org%2Fapi%2Fauth%2Fgoogle%2Fcallback/);
});

test('google oauth rejects bad state',async()=>{
  const env={SESSION_SECRET:'test-session-secret-value'};
  await assert.rejects(readGoogleState(env,'bad.state'),e=>e.status===400);
});
