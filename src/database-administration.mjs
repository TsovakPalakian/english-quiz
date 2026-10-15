import {StudyError} from './turso-study.mjs';
import {neonFoundation,neonTables,NEON_FOUNDATION_VERSION} from './neon-foundation.mjs';
import {changeDatabaseSelection,DATABASE_CONTROL} from './database-selection.mjs';
import {neonAccountDatabase} from './neon-account-database.mjs';
import {neonClient} from './neon-connection.mjs';
import {neonStudyMigration} from './neon-study-migration.mjs';
import {neonProductionReadiness} from './database-readiness.mjs';
export {neonClient,neonConnection} from './neon-connection.mjs';
export function databaseStatus(env){
  const selection=env.DATABASE_SELECTION||{provider:env.DB_PROVIDER||'turso',revision:0,scope:'site'};
  return {active:selection.provider,scope:'site',revision:selection.revision,authentication:env.AUTH_DATABASE_PROVIDER==='neon'?'neon':'cloudflare-d1',chat:'cloudflare-durable-objects',providers:[
    {id:'turso',name:'Turso',configured:!!(env.TURSO_URL&&env.TURSO_AUTH_TOKEN),adapterReady:true,authenticationAdapterReady:true,active:selection.provider==='turso'},
    {id:'neon',name:'Neon PostgreSQL',configured:!!env.NEON_DATABASE_URL,adapterReady:true,authenticationAdapterReady:true,active:selection.provider==='neon'}
  ]};
}
export async function databaseAction(env,body,{createNeon=neonClient,readTurso,actor}={}){
  if(!body||Object.keys(body).some(key=>!['action','provider',...(body.action==='activate'?['expectedRevision']:[])].includes(key))||!['check','prepare','activate'].includes(body.action)||!['neon','turso'].includes(body.provider))throw new StudyError(400,'Invalid database action.');
  if(body.action==='activate'){
    if(actor?.role!=='DEVELOPER'||!actor.id)throw new StudyError(403,'Developers only.');
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw new StudyError(400,'A valid configuration revision is required.');
    if((env.DATABASE_SELECTION?.provider||env.DB_PROVIDER||'turso')===body.provider)return {...databaseStatus(env),message:'This database is already active for all users.'};
    const selection=await changeDatabaseSelection(env[DATABASE_CONTROL]||env.CONTENT_MEDIA,{provider:body.provider,expectedRevision:body.expectedRevision,actor,defaultProvider:env.DB_PROVIDER||'turso',verifyTarget:async()=>{
      if(body.provider==='neon'){
        const sql=createNeon(env),readiness=await neonProductionReadiness(env,{sql});
        if(!readiness.ready)throw new StudyError(409,'Neon runtime preparation or developer verification is incomplete. The active database was not changed.');
        const row=await neonAccountDatabase(env,{sql}).prepare('SELECT id,role,active,is_personal_data_revoked FROM users WHERE id=?').bind(actor.id).first();
        if(!row||row.role!=='DEVELOPER'||row.active!==1||row.is_personal_data_revoked)throw new StudyError(409,'The current developer account is not available in Neon.');
      }else{try{await readTurso();}catch{throw new StudyError(503,'Turso connection check failed. The global database was not changed.');}}
    }});
    return {...databaseStatus({...env,DATABASE_SELECTION:selection,AUTH_DATABASE_PROVIDER:selection.provider==='neon'?'neon':undefined}),message:'The database was activated for all users. Sign in again.'};
  }
  if(body.provider==='turso'){
    if(body.action!=='check')throw new StudyError(400,'Turso schema preparation is not supported here.');
    try{await readTurso();return {provider:'turso',connected:true};}catch{throw new StudyError(503,'Turso connection check failed. No database was changed.');}
  }
  try{
    const sql=createNeon(env);
    if(body.action==='prepare')await sql.transaction([...neonFoundation,...neonStudyMigration].map(query=>sql.query(query,[])));
    const rows=await sql.query("SELECT current_database() AS database,to_regclass('english_app.schema_migrations') IS NOT NULL AS schema_exists,(SELECT count(*)::int FROM information_schema.tables WHERE table_schema='english_app' AND table_type='BASE TABLE' AND table_name IN ("+neonTables.map(name=>"'"+name+"'").join(',')+")) AS table_count",[]);
    const status=rows[0];if(!status)throw new Error('Missing status');
    let schemaVersion=0;
    if(status.schema_exists){const versions=await sql.query('SELECT COALESCE(max(version),0) AS version FROM english_app.schema_migrations',[]);schemaVersion=Number(versions[0]?.version||0);}
    const views=await sql.query("SELECT to_regclass('english_auth.users') IS NOT NULL AND to_regclass('english_auth.registrations') IS NOT NULL AND to_regclass('english_auth.account_changes') IS NOT NULL AS ready",[]);
    const authReady=views[0]?.ready===true;
    let developerAvailable=null;
    if(authReady){
      const db=neonAccountDatabase(env,{sql});
      if(actor){const row=await db.prepare('SELECT id,role,active,is_personal_data_revoked FROM users WHERE id=?').bind(actor.id).first();developerAvailable=!!(row&&row.role==='DEVELOPER'&&row.active===1&&!row.is_personal_data_revoked);}
      else await db.prepare('SELECT id FROM users LIMIT 1').first();
    }
    const readiness=await neonProductionReadiness(env,{sql});
    return {provider:'neon',connected:true,database:status.database,schemaVersion,tableCount:Number(status.table_count||0),expectedTableCount:neonTables.length,schemaReady:schemaVersion===NEON_FOUNDATION_VERSION&&Number(status.table_count)===neonTables.length,authenticationAdapterReady:true,authenticationSchemaReady:authReady,developerAvailable,adapterReady:true,runtimeReady:readiness.ready,readiness,dataTransferred:false};
  }catch(error){if(error instanceof StudyError)throw error;throw new StudyError(503,'Neon operation failed. Check the server connection secret and Neon availability.');}
}
export async function verifyNeonSchema(env){
  try{
    const sql=neonClient(env);
    const tables=await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema='english_app' AND table_type='BASE TABLE' ORDER BY table_name",[]);
    const names=new Set(tables.map(row=>row.table_name)),missing=neonTables.filter(name=>!names.has(name));
    if(missing.length)throw new Error('Missing tables');
    const versions=await sql.query('SELECT version FROM english_app.schema_migrations ORDER BY version',[]);
    if(Number(versions.at(-1)?.version)!==NEON_FOUNDATION_VERSION)throw new Error('Wrong version');
    const rows=await sql.query(neonTables.map(name=>"SELECT '"+name+"' AS table_name,count(*)::text AS rows FROM english_app."+name).join(' UNION ALL '),[]);
    const [constraints]=await sql.query("SELECT count(*) FILTER(WHERE contype='f')::int AS foreign_keys,count(*) FILTER(WHERE NOT convalidated)::int AS invalid_constraints FROM pg_constraint WHERE connamespace='english_app'::regnamespace",[]);
    const [indexes]=await sql.query("SELECT count(*)::int AS indexes,count(*) FILTER(WHERE NOT i.indisvalid)::int AS invalid_indexes FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='english_app'::regnamespace",[]);
    if(constraints.invalid_constraints||indexes.invalid_indexes)throw new Error('Invalid constraints or indexes');
    return {schema:'english_app',version:NEON_FOUNDATION_VERSION,tables:neonTables.length,businessRows:rows.filter(row=>row.table_name!=='schema_migrations').reduce((sum,row)=>sum+Number(row.rows),0),foreignKeys:constraints.foreign_keys,indexes:indexes.indexes,valid:true};
  }catch{throw new StudyError(503,'Neon schema verification failed. No data was changed.');}
}
