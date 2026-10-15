import {neonClient} from './neon-connection.mjs';
import {StudyError} from './turso-study.mjs';
import {studyQuery} from './neon-study-sql.mjs';
import {studyNamespace} from './neon-study-migration.mjs';

const reset="SELECT set_config('search_path','english_study,pg_catalog',true),set_config('english_study.changes','0',true),set_config('english_study.pending','0',true),set_config('english_study.last_id','0',true)";
function value(item){
  if(typeof item==='bigint'){const number=Number(item);if(!Number.isSafeInteger(number))throw new StudyError(503,'Study integer exceeds the supported range.');return number;}
  if(typeof item==='boolean')return +item;
  if(item&&typeof item==='object')return JSON.stringify(item);
  return item;
}
function rows(result){
  const integers=new Set((result.fields||[]).filter(field=>[20,21,23].includes(field.dataTypeID)).map(field=>field.name)),decimals=new Set((result.fields||[]).filter(field=>field.dataTypeID===1700).map(field=>field.name));
  return result.rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='_runtime_rowid').map(([key,item])=>[key,integers.has(key)&&item!=null?value(BigInt(item)):decimals.has(key)&&item!=null?Number(item):value(item)])));
}
function hrana(result){
  const records=rows(result),names=(result.fields||[]).map(field=>field.name).filter(name=>name!=='_runtime_rowid');
  return {cols:names.map(name=>({name})),rows:records.map(row=>names.map(name=>row[name]==null?{type:'null'}:typeof row[name]==='number'?{type:Number.isInteger(row[name])?'integer':'float',value:String(row[name])}:{type:'text',value:String(row[name])})),affected_row_count:['INSERT','UPDATE','DELETE'].includes(result.command)?result.rowCount:0};
}
function args(command){return (command.args||[]).map(arg=>arg.type==='null'?null:['integer','float'].includes(arg.type)?Number(arg.value):arg.value);}
function safeError(error){
  if(error instanceof StudyError)return error;
  if(['23502','23503','23505','23514','40001','40P01'].includes(error?.code))return new StudyError(409,'The record changed. Reload it before editing.');
  return new StudyError(503,'PostgreSQL study operation failed. No fallback was used.');
}

export class NeonStudyClient{
  constructor(env,{createSql=neonClient,namespace='english_study'}={}){this.env=env;this.createSql=createSql;this.namespace=studyNamespace(namespace);}
  async perform(commands,{readOnly=false}={}){
    if(!Array.isArray(commands)||commands.length<1||commands.length>2000)throw new StudyError(500,'Invalid study transaction size.');
    const compiled=commands.map(command=>studyQuery(command.sql,args(command)));
    if(readOnly&&compiled.some(command=>command.write||!/^SELECT\b/.test(command.text)))throw new StudyError(500,'Only study SELECTs are allowed in a read snapshot.');
    for(let attempt=0;attempt<2;attempt++){
      try{
        const sql=this.createSql(this.env),mapped=text=>text.replaceAll('english_study',this.namespace),queries=[sql.query(mapped(reset),[])],positions=[];
        for(const command of compiled){
          positions.push(queries.length);queries.push(sql.query(mapped(command.text),command.params));
          for(const after of command.after||[])queries.push(sql.query(mapped(after),[]));
        }
        const result=await sql.transaction(queries,{readOnly,fullResults:true,isolationLevel:readOnly?'RepeatableRead':'Serializable',fetchOptions:{redirect:'manual',signal:AbortSignal.timeout(readOnly?45000:20000)}});
        return positions.map(index=>result[index]);
      }catch(error){
        const transient=['08000','08003','08006','53300','57P03'].includes(error?.code)||['TypeError','AbortError','TimeoutError'].includes(error?.name);
        if(readOnly&&attempt===0&&transient){await new Promise(resolve=>setTimeout(resolve,80));continue;}
        throw safeError(error);
      }
    }
  }
  async read(sql,params=[]){
    const result=await this.perform([{sql,args:params.map(value=>value===null?{type:'null'}:typeof value==='number'?{type:'float',value:String(value)}:{type:'text',value})}],{readOnly:true});
    return rows(result[0]);
  }
  async readMany(commands){return (await this.perform(commands,{readOnly:true})).map(rows);}
  async atomic(commands,options){return (await this.perform(commands,options)).map(hrana);}
}
