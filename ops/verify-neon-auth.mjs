import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {neonConnection} from '../src/database-administration.mjs';
import {neonAccountDatabase} from '../src/neon-account-database.mjs';
import {currentUser} from '../src/worker.js';
import {readNeonSecret} from './neon-secret-input.mjs';

try{
  const env={NEON_DATABASE_URL:neonConnection(await readNeonSecret()),AUTH_DATABASE_PROVIDER:'neon',SESSION_SECRET:randomBytes(32).toString('hex'),MEDIA:{head:async()=>null}};
  env.DB=neonAccountDatabase(env);
  const user=await env.DB.prepare('SELECT * FROM users WHERE login=?').bind('TsovakDev').first();
  assert.ok(user);assert.equal(user.role,'DEVELOPER');assert.equal(user.active,1);assert.equal(user.is_personal_data_revoked,0);
  assert.equal(user.password_iterations,100000);assert.match(user.password_salt,/^[a-f0-9]{32}$/);assert.match(user.password_hash,/^[a-f0-9]{64}$/);
  const payload={id:user.id,role:'USER',pwdv:user.password_hash.slice(0,24),idleSession:1,database:'neon',databaseRevision:0,exp:Math.floor(Date.now()/1000)+60};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),token=body+'.'+createHmac('sha256',env.SESSION_SECRET).update(body).digest('base64url');
  const request=new Request('https://verification.invalid/',{headers:{Cookie:'enquiz_sid='+token}});
  const live=await currentUser(env,request);assert.equal(live.id,user.id);assert.equal(live.role,'DEVELOPER');
  assert.equal(await currentUser({...env,AUTH_DATABASE_PROVIDER:'d1'},request),null);
  assert.equal(await currentUser({...env,DATABASE_SELECTION:{revision:1}},request),null);
  console.log(JSON.stringify({provider:'neon',login:'TsovakDev',liveSessionVerified:true,liveRoleVerified:true,passwordParametersValid:true,crossProviderSessionRejected:true,staleConfigurationSessionRejected:true,databaseWrites:0,siteSwitched:false}));
}catch{console.error('Neon authentication verification failed. No credentials or tokens were printed.');process.exitCode=1;}
