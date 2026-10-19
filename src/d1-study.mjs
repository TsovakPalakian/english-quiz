// SQLite study-data contract over a dedicated Cloudflare D1 binding.
import {StudyError} from './learning-study.mjs';

const denied=()=>{throw new StudyError(500,'Unsupported study query.');};
// This lexer handles trusted application SQL, never user-provided SQL or identifiers.
export function studyTokens(source){
  if(typeof source!=='string'||source.length>500000||source.includes('\0'))denied();
  const tokens=[];
  for(let offset=0;offset<source.length;){
    const match=/^(?:\s+|--[^\r\n]*|\/\*[^]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|\?|\|\||<>|!=|<=|>=|[(),.*=<>+\-\/;%])/s.exec(source.slice(offset));
    if(!match)denied();offset+=match[0].length;
    if(!/^\s|^--|^\/\*/.test(match[0]))tokens.push(match[0]);
  }
  if(tokens.at(-1)===';')tokens.pop();
  if(tokens.includes(';'))denied();
  return tokens;
}

const scratch=new Set(['mutation_guard','created_rows','saved_ids','group_guard','chat_guard','assessment_guard','recording_guard','copy_ids','essential_guard','invite_guard','email_otp_guard']);
// Existing application trigger; its internal semicolon is not a second query.
const noticeTrigger="CREATE TRIGGER IF NOT EXISTS chat_notice_outbox AFTER INSERT ON chat_messages WHEN NEW.category='learning' BEGIN INSERT OR IGNORE INTO chat_delivery_outbox(message_id) VALUES(NEW.id); END";
const fail=()=>{throw new StudyError(500,'Unsupported D1 study query or binding.');};
const upper=value=>String(value).toUpperCase();
const byteLength=value=>new TextEncoder().encode(value).length;
const overLimit=()=>{throw new StudyError(413,'The operation exceeds D1 statement or value limits. No batch was sent.');};
function value(arg){
  if(arg?.type==='null')return null;
  if(arg?.type==='text'&&typeof arg.value==='string')return arg.value;
  if(arg?.type==='integer'&&typeof arg.value==='string'&&/^-?\d+$/.test(arg.value)&&Number.isSafeInteger(Number(arg.value)))return Number(arg.value);
  if(arg?.type==='float'&&typeof arg.value==='number'&&Number.isFinite(arg.value))return arg.value;
  fail();
}
function typed(value){
  if(value===null)return {type:'null'};
  if(typeof value==='string')return {type:'text',value};
  if(typeof value==='number'&&Number.isFinite(value)){
    if(Number.isInteger(value)){if(!Number.isSafeInteger(value))throw new StudyError(503,'D1 returned an unsafe integer.');return {type:'integer',value:String(value)};}
    return {type:'float',value};
  }
  throw new StudyError(503,'Unexpected D1 value type.');
}
function hrana(result){
  if(!result?.success||!Array.isArray(result.results))throw new StudyError(503,'Unexpected D1 transaction response.');
  const names=Object.keys(result.results[0]||{});
  return {cols:names.map(name=>({name})),rows:result.results.map(row=>names.map(name=>typed(row[name]))),affected_row_count:result.meta?.changes||0};
}
function compile(command,{readOnly,inspection=false},used){
  if(!command||!Array.isArray(command.args))fail();
  if(!readOnly&&command.sql===noticeTrigger&&command.args.length===0)return {sql:noticeTrigger,args:[]};
  const tokens=studyTokens(command.sql),head=upper(tokens[0]);
  const info=inspection&&head==='PRAGMA'&&/^PRAGMA table_info \( (?:[a-z_][a-z_0-9]*|"(?:[^"]|"")+") \)$/i.test(tokens.join(' '));
  if(readOnly&&head!=='SELECT'&&!info)fail();
  if(!['SELECT','INSERT','UPDATE','DELETE','CREATE','DROP','ALTER'].includes(head)&&!info)fail();
  if(tokens.some(token=>/^_study_batch_/i.test(token)))fail();
  if(head==='CREATE'&&['TEMP','TEMPORARY'].includes(upper(tokens[1]))){
    if(upper(tokens[2])!=='TABLE')fail();
    const position=upper(tokens[3])==='IF'?6:3,name=tokens[position]?.toLowerCase();
    if(!scratch.has(name))fail();used.add(name);tokens.splice(1,1);
  }
  // Fixed private names are safe only inside a single transactional D1 batch.
  // Appended DROP statements also cover legacy operations that omit cleanup.
  for(let i=0;i<tokens.length;i++){
    if(upper(tokens[i])==='TEMP'&&tokens[i+1]==='.'){
      if(!scratch.has(tokens[i+2]?.toLowerCase()))fail();
      tokens.splice(i,2);
    }
    const name=tokens[i]?.toLowerCase();
    if(scratch.has(name)){
      if(i>0&&tokens[i-1]==='.')fail();
      if(readOnly)fail();
      tokens[i]='_study_batch_'+name;
    }
  }
  const values=command.args.map(value),packed=[],args=[];let cursor=0;
  for(let i=0;i<tokens.length;i++){
    if(upper(tokens[i])==='IN'&&tokens[i+1]==='('){
      let end=i+2,count=0;
      while(tokens[end]==='?'){count++;end++;if(tokens[end]!==',')break;end++;}
      if(count>=20&&tokens[end]===')'){
        packed.push('IN','(','SELECT','value','FROM','json_each','(','?',')',')');
        args.push(JSON.stringify(values.slice(cursor,cursor+count)));cursor+=count;i=end;continue;
      }
    }
    packed.push(tokens[i]);if(tokens[i]==='?')args.push(values[cursor++]);
  }
  if(cursor!==values.length)fail();
  const sql=packed.join(' ');
  if(args.length>100)overLimit();
  if(byteLength(sql)>100000||args.some(arg=>typeof arg==='string'&&byteLength(arg)>2000000))overLimit();
  return {sql,args};
}
export class D1StudyClient{
  constructor(binding){
    if(typeof binding?.prepare!=='function'||typeof binding?.batch!=='function')throw new StudyError(503,'Dedicated study D1 binding is unavailable.');
    this.binding=binding;
  }
  async perform(commands,{readOnly=false,inspection=false}={}){
    const used=new Set(),compiled=commands.map(command=>compile(command,{readOnly,inspection},used));
    if(!compiled.length)return [];
    const cleanup=[...used].map(name=>({sql:'DROP TABLE IF EXISTS _study_batch_'+name,args:[]}));
    try{
      const statements=[...compiled,...cleanup].map(command=>{
        const prepared=this.binding.prepare(command.sql);
        return command.args.length?prepared.bind(...command.args):prepared;
      });
      // Never split a mutation batch or retry a write after an uncertain result.
      const results=await this.binding.batch(statements);
      if(!Array.isArray(results)||results.length!==statements.length)throw new StudyError(503,'Unexpected D1 transaction response.');
      return results.slice(0,compiled.length).map(hrana);
    }catch(error){
      if(error instanceof StudyError)throw error;
      let constraint=false;
      for(let cause=error,depth=0;cause&&depth<5;cause=cause.cause,depth++)if(/SQLITE_CONSTRAINT|(?:CHECK|UNIQUE|NOT NULL|FOREIGN KEY) constraint failed/i.test(String(cause.message)))constraint=true;
      throw new StudyError(constraint?409:503,constraint?'The record changed. Reload it before editing.':'D1 operation failed. Check the saved state before retrying.');
    }
  }
  async read(sql,args=[]){
    const command={sql,args:args.map(item=>item===null?{type:'null'}:typeof item==='number'?Number.isInteger(item)?{type:'integer',value:String(item)}:{type:'float',value:item}:{type:'text',value:item})};
    const [result]=await this.perform([command],{readOnly:true,inspection:true});
    return decode(result);
  }
  async readMany(commands){return (await this.perform(commands,{readOnly:true})).map(decode);}
  async atomic(commands,options={}){return this.perform(commands,options);}
}
function decode(result){return result.rows.map(row=>Object.fromEntries(result.cols.map((col,index)=>{
  const cell=row[index];return [col.name,cell.type==='null'?null:['integer','float'].includes(cell.type)?Number(cell.value):cell.value];
})));}
