import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {neonClient,neonConnection} from '../src/database-administration.mjs';

const fields=['id','login','email','name','password_salt','password_hash','password_iterations','role','is_personal_data_revoked','revoked_at','hidden','active','created_at'];
export function developerValues(row){
  assert.equal(row.login,'TsovakDev');assert.equal(row.role,'DEVELOPER');
  assert.equal(Number(row.active),1);assert.equal(Number(row.is_personal_data_revoked),0);
  for(const key of ['id','email','password_salt','password_hash'])assert.ok(typeof row[key]==='string'&&row[key].length>0);
  assert.ok(Number.isSafeInteger(row.password_iterations)&&row.password_iterations>0);
  assert.ok([0,1].includes(Number(row.hidden)));
  return fields.map(key=>key==='created_at'||key==='revoked_at'
    ?row[key]==null?null:new Date(Number(row[key])*1000).toISOString()
    :['active','hidden','is_personal_data_revoked'].includes(key)?Boolean(Number(row[key])):row[key]);
}

export async function importDeveloper(sql,row){
  const values=developerValues(row);
  const matches=await sql.query('SELECT * FROM english_app.users WHERE id=$1 OR lower(login)=lower($2) OR lower(email)=lower($3)',values.slice(0,3));
  const same=existing=>fields.every((key,i)=>['created_at','revoked_at'].includes(key)
    ?(existing[key]==null?null:new Date(existing[key]).toISOString())===values[i]:existing[key]===values[i]);
  assert.ok(!matches.length||(matches.length===1&&same(matches[0])),'Conflicting Neon account; nothing overwritten.');
  await sql.transaction([
    sql.query(`INSERT INTO english_app.users (${fields.join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT (id) DO NOTHING`,values),
    sql.query('INSERT INTO english_app.account_refs(id) VALUES ($1) ON CONFLICT (id) DO NOTHING',[row.id])
  ]);
  const [saved]=await sql.query('SELECT * FROM english_app.users WHERE id=$1',[row.id]);
  assert.ok(saved&&same(saved),'Account verification failed.');
  return {login:row.login,role:row.role,stored:true,passwordPreserved:true,identityPreserved:true,activeAuthenticationChanged:false};
}

async function secretInput(){
  if(!process.stdin.isTTY){let value='';for await(const chunk of process.stdin)value+=chunk;return value.trim();}
  process.stdout.write('Neon URL (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const done=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const read=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){done();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){done();resolve(value.trim());return;}if(char==='\u007f')value=value.slice(0,-1);else value+=char;}};process.stdin.on('data',read);
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    assert.equal(process.argv.length,2);
    const connection=neonConnection(await secretInput());
    const source=spawnSync('npx',['wrangler','d1','execute','learn-english','--remote','--json','--command',`SELECT ${fields.join(',')} FROM users WHERE login='TsovakDev' LIMIT 2`],{encoding:'utf8',timeout:120_000,maxBuffer:1024*1024});
    assert.equal(source.status,0,'Source account read failed.');
    const batches=JSON.parse(source.stdout);assert.ok(batches.every(batch=>batch.success!==false));
    const rows=batches.flatMap(batch=>batch.results||[]);assert.equal(rows.length,1);
    console.log(JSON.stringify(await importDeveloper(neonClient({NEON_DATABASE_URL:connection}),rows[0])));
  }catch{console.error('Developer import stopped. Credentials were not printed; existing accounts were not overwritten.');process.exitCode=1;}
}
