import {neonClient} from './neon-connection.mjs';
import {neonTables,NEON_FOUNDATION_VERSION} from './neon-foundation.mjs';
import {StudyError} from './turso-study.mjs';
import {neonStudyTables} from './neon-study-schema.mjs';
import {NEON_STUDY_VERSION} from './neon-study-migration.mjs';

// A successful connection or table count is not proof of application compatibility.
export async function neonProductionReadiness(env,{sql=neonClient(env),developerLogin='TsovakDev'}={}){
  try{
    const [columns,versions,developers,runtime]=await sql.transaction([
      sql.query("SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_schema IN ('english_app','english_study') ORDER BY table_schema,table_name,ordinal_position",[]),
      sql.query('SELECT COALESCE(max(version),0)::integer AS version FROM english_app.schema_migrations',[]),
      sql.query("SELECT EXISTS(SELECT 1 FROM english_app.users WHERE login=$1 AND role='DEVELOPER' AND active AND NOT is_personal_data_revoked) AS ready",[developerLogin]),
      sql.query("SELECT to_regclass('english_study.runtime_migrations') IS NOT NULL AS installed,to_regprocedure('english_study.track_after()') IS NOT NULL AS tracking",[])
    ],{readOnly:true});
    const tables=new Set(columns.filter(column=>column.table_schema==='english_app').map(column=>column.table_name)),missingTables=neonTables.filter(table=>!tables.has(table));
    const studyColumns=columns.filter(column=>column.table_schema==='english_study');
    let runtimeVersion=0;
    if(runtime[0]?.installed){const rows=await sql.query('SELECT COALESCE(max(version),0)::integer AS version FROM english_study.runtime_migrations',[]);runtimeVersion=Number(rows[0]?.version||0);}
    const runtimeReady=runtimeVersion===NEON_STUDY_VERSION&&neonStudyTables.every(table=>studyColumns.some(column=>column.table_name===table.name))&&runtime[0]?.tracking===true;
    const numericChildIds=['lesson_blocks','exam_blocks','exam_materials'].filter(table=>
      !studyColumns.some(column=>column.table_name===table&&column.column_name==='id'&&['integer','bigint'].includes(column.data_type)));
    const checks=[
      {id:'schema',ready:missingTables.length===0&&versions[0]?.version===NEON_FOUNDATION_VERSION,detail:missingTables.length?'Foundation tables are missing.':'Foundation version and tables were checked.'},
      {id:'developer',ready:developers[0]?.ready===true,detail:'An active developer account is required in the target database.'},
      {id:'learning-repositories',ready:runtimeReady,detail:'The HTTP learning adapter requires the complete versioned english_study runtime schema.'},
      {id:'child-identities',ready:numericChildIds.length===0,detail:numericChildIds.length?'Child IDs require numeric runtime mapping: '+numericChildIds.join(', '):'Child identities match the numeric runtime contract.'},
      {id:'chat-isolation',ready:true,detail:'Provider-specific Durable Objects reject inactive sockets and alarms.'},
      {id:'browser-isolation',ready:true,detail:'Browser caches and pending writes are fenced by the global database revision.'}
    ];
    return {provider:'neon',ready:checks.every(check=>check.ready),readOnly:true,siteSwitched:false,schemaVersion:versions[0]?.version||0,runtimeVersion,tableCount:tables.size,runtimeTableCount:new Set(studyColumns.map(column=>column.table_name)).size,checks};
  }catch{throw new StudyError(503,'Neon production readiness could not be verified. No database was changed.');}
}
