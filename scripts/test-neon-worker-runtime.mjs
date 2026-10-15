import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/miniflare');
const {build}=require('/Users/tsovakpalakian/.npm/_npx/32026684e21afda6/node_modules/esbuild');
const source=`
import {neonConfig} from '@neondatabase/serverless';
import {neonClient} from './src/neon-connection.mjs';
import {neonAccountDatabase} from './src/neon-account-database.mjs';
import {NeonStudyClient} from './src/neon-study.mjs';
import {NeonAdapter} from './db/neon.js';
export default {async fetch(request){
  let redirects=[],blocked=false;
  neonConfig.fetchFunction=async(url,options)=>{
    const outbound=new Request(url,options);redirects.push(outbound.redirect);
    if(new URL(request.url).pathname==='/redirect')return new Response(null,{status:302,headers:{Location:'https://example.invalid/'}});
    const body=await outbound.json(),row={fields:[{name:'ok',dataTypeID:23}],rows:[['1']],rowCount:1,command:'SELECT'};
    return Response.json(body.queries?{results:body.queries.map(()=>row)}:row);
  };
  const connection='postgresql://fixture:fake@ep-fixture-pooler.c-8.eu-central-1.aws.neon.tech/english?sslmode=require';
  const env={NEON_DATABASE_URL:connection,DATABASE_URL:connection};
  if(new URL(request.url).pathname==='/redirect'){
    try{await neonAccountDatabase(env).prepare('SELECT id FROM users LIMIT 1').first()}catch{blocked=true}
    return Response.json({blocked,redirects});
  }
  const account=await neonAccountDatabase(env).prepare('SELECT id FROM users LIMIT 1').first();
  const study=await new NeonStudyClient(env).read('SELECT 1 AS ok');
  const adapter=new NeonAdapter(env),common=await adapter.query('SELECT ? AS ok',[1]);await adapter.close();
  return Response.json({account,study,common,redirects});
}};`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'neon-runtime-fixture.mjs'},bundle:true,write:false,format:'esm',platform:'browser'});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-01'}));
try{
  const result=await (await mf.dispatchFetch('http://fixture/')).json();
  assert.deepEqual(result,{account:{ok:1},study:[{ok:1}],common:[{ok:1}],redirects:['manual','manual','manual']});
  const redirect=await (await mf.dispatchFetch('http://fixture/redirect')).json();
  assert.equal(redirect.blocked,true);assert.deepEqual(redirect.redirects,['manual']);
  console.log('Workers runtime: real Neon HTTP account, study and common adapters passed; redirects were not followed.');
}finally{await mf.dispose();}
