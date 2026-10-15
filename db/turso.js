import {createClient} from '@libsql/client/web';
import {BaseAdapter} from './base.js';
import {DatabaseError} from './errors.js';
import {integer} from './sql.js';

function configuration(env){
  let url;try{url=new URL(env.TURSO_DATABASE_URL);}catch{throw new DatabaseError('DB_CONFIG','TURSO_DATABASE_URL must be a remote TLS Turso URL.',{status:500});}
  if(!['https:','libsql:'].includes(url.protocol)||!url.hostname.endsWith('.turso.io')||url.username||url.password||url.port&&url.port!=='443'||!['','/'].includes(url.pathname)||url.search||url.hash||typeof env.TURSO_AUTH_TOKEN!=='string'||!env.TURSO_AUTH_TOKEN.trim())throw new DatabaseError('DB_CONFIG','Turso requires a TLS .turso.io endpoint and TURSO_AUTH_TOKEN.',{status:500});
  // libsql: can select WebSockets in other clients; HTTPS forces HTTP here.
  return {url:'https://'+url.hostname,authToken:env.TURSO_AUTH_TOKEN,intMode:'bigint',concurrency:4};
}
const rows=value=>value.rows.map(row=>Object.fromEntries(value.columns.map(name=>[name,integer(row[name])])));
const writeResult=value=>({rows:rows(value),rowsAffected:value.rowsAffected});
const statement=command=>({sql:command.sql,args:command.args.map(value=>typeof value==='number'&&Number.isInteger(value)?BigInt(value):value)});

export class TursoAdapter extends BaseAdapter {
  #client;
  constructor(env,options={}){
    super('turso',options);const config=configuration(env),timeout=this.timeoutMs,fetchImpl=options.fetch||fetch;
    config.fetch=(input,init={})=>{
      const caller=init.signal||input.signal;
      const deadline=AbortSignal.timeout(timeout);
      return (0,fetchImpl)(input,{...init,redirect:'manual',signal:caller?AbortSignal.any([caller,deadline]):deadline});
    };
    try{this.#client=(options.createLibsql||createClient)(config);}catch{throw new DatabaseError('DB_CONFIG','The Turso HTTP driver could not be initialized.',{status:500});}
    if(this.#client.protocol!=='http'){this.#client.close();throw new DatabaseError('DB_CONFIG','Turso must use the HTTP transport.',{status:500});}
  }
  async _query(command){const [value]=await this.#client.batch([statement(command)],'read');return rows(value);}
  async _execute(command){return writeResult(await this.#client.execute(statement(command)));}
  async _batch(commands,{write}){const values=await this.#client.batch(commands.map(statement),write?'write':'read');return values.map((value,index)=>commands[index].operation==='query'?rows(value):writeResult(value));}
  _close(){this.#client.close();}
}
