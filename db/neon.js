import {neon} from '@neondatabase/serverless';
import {BaseAdapter} from './base.js';
import {DatabaseError} from './errors.js';
import {integer} from './sql.js';

function connection(value){
  let url;try{url=new URL(value);}catch{throw new DatabaseError('DB_CONFIG','DATABASE_URL must be a pooled Neon PostgreSQL connection string.',{status:500});}
  const allowedOptions=new Set(['sslmode','channel_binding','application_name']);
  if([...url.searchParams.keys()].some(key=>!allowedOptions.has(key)||url.searchParams.getAll(key).length!==1))throw new DatabaseError('DB_CONFIG','DATABASE_URL contains unsupported or repeated connection options.',{status:500});
  if(!['postgres:','postgresql:'].includes(url.protocol)||!/^ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)||!url.username||!url.password||url.port&&url.port!=='5432'||!/^\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.hash||!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw new DatabaseError('DB_CONFIG','DATABASE_URL requires a Neon -pooler host, credentials, database name and TLS.',{status:500});
  return url.href;
}
function rows(result){
  const integers=new Set(result.fields.filter(field=>Number(field.dataTypeID)===20).map(field=>field.name));
  return result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([name,value])=>[name,value!=null&&integers.has(name)?integer(BigInt(value)):value])));
}
const writeResult=result=>({rows:rows(result),rowsAffected:result.rowCount});

export class NeonAdapter extends BaseAdapter {
  #sql;
  constructor(env,options={}){
    super('neon',options);const url=connection(env.DATABASE_URL);
    try{this.#sql=(options.createNeon||neon)(url);}catch{throw new DatabaseError('DB_CONFIG','The Neon HTTP driver could not be initialized.',{status:500});}
  }
  #fetchOptions(){return {redirect:'manual',signal:AbortSignal.timeout(this.timeoutMs)};}
  async _query(command){
    const [value]=await this.#sql.transaction([this.#sql.query(command.sql,command.args)],{fullResults:true,readOnly:true,fetchOptions:this.#fetchOptions()});
    return rows(value);
  }
  async _execute(command){return writeResult(await this.#sql.query(command.sql,command.args,{fullResults:true,fetchOptions:this.#fetchOptions()}));}
  async _batch(commands,{write}){
    const values=await this.#sql.transaction(commands.map(command=>this.#sql.query(command.sql,command.args)),{fullResults:true,readOnly:!write,isolationLevel:'Serializable',fetchOptions:this.#fetchOptions()});
    return values.map((value,index)=>commands[index].operation==='query'?rows(value):writeResult(value));
  }
  _close(){} // neon() owns no request-spanning socket or pool.
}
