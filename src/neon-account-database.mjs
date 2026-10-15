import {StudyError} from './turso-study.mjs';
import {neonClient} from './neon-connection.mjs';
import {authColumns} from './neon-auth-schema.mjs';
import {databaseMedia} from './database-media.mjs';

const tables=new Set(['users','registrations','account_changes']);
const words=new Set(['SELECT','INSERT','UPDATE','DELETE','FROM','JOIN','LEFT','INNER','OUTER','ON','INTO','SET','VALUES','WHERE','AND','OR','NOT','IS','NULL','IN','AS','ORDER','BY','ASC','DESC','LIMIT','OFFSET','DISTINCT','COALESCE','U','R',...Object.values(authColumns).flat().map(column=>column.toUpperCase()),...Array.from(tables).map(table=>table.toUpperCase())]);
const migrations=new Set([
  "CREATE TABLE IF NOT EXISTS account_changes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', from_login TEXT NOT NULL, from_email TEXT NOT NULL, from_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'USER', status TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER)",
  ...['user_id','login','email'].map(column=>`CREATE UNIQUE INDEX IF NOT EXISTS account_changes_${column==='user_id'?'user':column}_pending ON account_changes(${column}) WHERE status = 'pending'`)
]);
const normalize=sql=>sql.trim().replace(/\s+/g,' ');
const denied=()=>{throw new StudyError(500,'Only supported account queries are allowed.');};

// Only binds and allowlisted account table names are changed. SQL expressions
// stay untouched: PostgreSQL compatibility views implement the account types.
export function accountQuery(source){
  if(typeof source!=='string'||source.length>8192)denied();
  if(migrations.has(normalize(source)))return {text:'SELECT 1 WHERE false',count:0};
  if(/^\s*DELETE FROM (user_state|user_added|user_card_gone) WHERE user_id\s*=\s*\?\s*$/i.test(source))return {text:'SELECT 1 WHERE false AND $1::text IS NULL',count:1};
  const tokens=[];
  for(let offset=0;offset<source.length;){
    const rest=source.slice(offset);
    const match=/^(?:\s+|'(?:[^']|'')*'|[A-Za-z_][A-Za-z_0-9]*|\d+|\?|<>|!=|<=|>=|[(),.*=<>+-])/s.exec(rest);
    if(!match)denied();
    tokens.push(match[0]);offset+=match[0].length;
  }
  const significant=tokens.map((value,index)=>({value,index})).filter(token=>token.value.trim());
  const operation=significant[0]?.value.toUpperCase();
  if(!['SELECT','INSERT','UPDATE','DELETE'].includes(operation))denied();
  let count=0,found=0;
  for(let i=0;i<significant.length;i++){
    const token=significant[i],upper=token.value.toUpperCase();
    if(/^[A-Za-z_]/.test(token.value)&&!words.has(upper))denied();
    if(token.value==='?'){tokens[token.index]='$'+(++count);continue;}
    if(['FROM','JOIN','INTO','UPDATE'].includes(upper)){
      // UPDATE is a table introducer, except the DO UPDATE branch of an upsert.
      if(upper==='UPDATE'&&i!==0)denied();
      const target=significant[++i];
      if(!target||!tables.has(target.value.toLowerCase())||significant[i+1]?.value==='.')denied();
      tokens[target.index]='english_auth.'+target.value.toLowerCase();found++;continue;
    }
    if(['PRAGMA','ATTACH','DETACH','COPY','CALL','EXECUTE','WITH','UNION','INTERSECT','EXCEPT','RETURNING','INTO'].includes(upper)&&upper!=='INTO')denied();
    // No comments, quoted identifiers, arbitrary functions or stacked commands.
    if(token.value==='-'&&significant[i+1]?.value==='-')denied();
    if(/^[A-Za-z_]/.test(token.value)&&significant[i+1]?.value==='('&&!['IN','VALUES','AND','OR','NOT','WHERE','SELECT','COALESCE'].includes(upper))denied();
  }
  if(!found||count>100)denied();
  return {text:tokens.join(''),count};
}
function safeError(error){
  if(error instanceof StudyError)return error;
  console.error(JSON.stringify({event:'neon-account-operation-failed',code:/^[A-Z0-9]{5}$/.test(error?.code||'')?error.code:null,kind:['TypeError','AbortError','TimeoutError','NeonDbError','Error'].includes(error?.name)?error.name:'DatabaseError',reason:/password authentication failed/i.test(error?.message||'')?'credentials':/does not exist/i.test(error?.message||'')?'missing-schema':/fetch|network|connect/i.test(error?.message||'')?'transport':/rows|map|undefined/i.test(error?.message||'')?'result-shape':'query'}));
  if(error?.code==='23505'){
    const constraint=String(error.constraint||'');
    if(/^(users|registrations|account_changes)_(login|email)/.test(constraint))return new StudyError(409,'Account conflict: '+constraint.match(/^(users|registrations|account_changes)_(login|email)/)[0]+'.');
    return new StudyError(409,'That account record already exists.');
  }
  if(['23502','23503','23514','22P02'].includes(error?.code))return new StudyError(400,'Invalid account data.');
  return new StudyError(503,'Neon account database is unavailable. No fallback was used.');
}
function result(value){
  const rows=value.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,item])=>[key,['created_at','revoked_at','decided_at'].includes(key)&&item!=null?Number(item):item])));
  return {results:rows,success:true,meta:{changes:['INSERT','UPDATE','DELETE'].includes(value.command)?Number(value.rowCount):0},fields:value.fields};
}
export function neonAccountDatabase(env,{sql}={}){
  const prepared=new WeakMap();
  function wrap(query,args=[]){
    const execute=async()=>{
      if(args.length!==query.count)throw new StudyError(400,'Account query parameter count mismatch.');
      try{return result(await (sql||neonClient(env)).query(query.text,args,{fullResults:true}));}catch(error){throw safeError(error);}
    };
    const statement={
      bind(...values){if(values.some(value=>value!==null&&!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)))throw new StudyError(400,'Invalid account query parameter.');return wrap(query,values);},
      async first(column){const row=(await execute()).results[0]||null;return column&&row?row[column]:row;},
      async all(){const {fields,...value}=await execute();return value;},
      async run(){const {fields,...value}=await execute();return value;},
      async raw({columnNames=false}={}){const value=await execute(),names=value.fields.map(field=>field.name);return [...(columnNames?[names]:[]),...value.results.map(row=>names.map(name=>row[name]))];}
    };
    prepared.set(statement,{query,args});return statement;
  }
  return {prepare:source=>wrap(accountQuery(source)),
    async exec(){denied();},
    async batch(statements){
      if(!Array.isArray(statements)||!statements.length||statements.length>10||statements.some(statement=>!prepared.has(statement)))denied();
      const commands=statements.map(statement=>prepared.get(statement));
      if(commands.some(({query,args})=>args.length!==query.count))throw new StudyError(400,'Account query parameter count mismatch.');
      try{const client=sql||neonClient(env);return (await client.transaction(commands.map(({query,args})=>client.query(query.text,args)),{fullResults:true})).map(value=>{const {fields,...formatted}=result(value);return formatted;});}catch(error){throw safeError(error);}
    }};
}

export function neonAccountMedia(bucket){
  return databaseMedia(bucket,'auth/neon/');
}

export function neonAccountEnvironment(env,options){
  return {...env,AUTH_DATABASE_PROVIDER:'neon',DB:neonAccountDatabase(env,options),MEDIA:neonAccountMedia(env.MEDIA)};
}
