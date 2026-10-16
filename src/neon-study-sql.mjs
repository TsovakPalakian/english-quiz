import {StudyError} from './learning-study.mjs';
import {studyTracking} from './neon-study-helpers.mjs';
import {neonStudyTables} from './neon-study-schema.mjs';

const denied=()=>{throw new StudyError(500,'Unsupported PostgreSQL study query.');};
const temporary=new Set(['mutation_guard','created_rows','saved_ids','group_guard','chat_guard','assessment_guard','recording_guard','copy_ids','essential_guard']);
const tables=new Map(neonStudyTables.map(table=>[table.name,table]));

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
const upper=value=>String(value).toUpperCase();
const join=tokens=>tokens.join(' ');
function comparisonTypes(tokens,params){
  const aliases=new Map(),sources=new Set(),reserved=new Set(['WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','CROSS','ON','SET','VALUES','ORDER','GROUP','LIMIT','UNION','RETURNING']);
  for(let i=0;i<tokens.length;i++)if(['FROM','JOIN','UPDATE','INTO'].includes(upper(tokens[i]))){
    const table=tables.get(String(tokens[i+1]).toLowerCase());if(!table)continue;
    sources.add(table);aliases.set(table.name,table);
    const alias=upper(tokens[i+2])==='AS'?tokens[i+3]:tokens[i+2];
    if(/^[a-z_][a-z_0-9]*$/i.test(alias||'')&&!reserved.has(upper(alias)))aliases.set(alias,table);
  }
  for(let i=0;i<tokens.length;i++)if(/^\$\d+(?:::[a-z]+)?$/.test(tokens[i])&&['=','!=','<>','<','>','<=','>='].includes(tokens[i-1])){
    const column=tokens[i-2],qualified=tokens[i-3]==='.',owner=qualified?aliases.get(tokens[i-4]):null;
    const candidates=qualified?(owner?[owner]:[]):[...sources].filter(table=>table.columns?.includes(column));
    if(!candidates.length)continue;
    const kinds=candidates.map(table=>table.types?.[column]).filter(Boolean),number=kinds.every(kind=>/INT|REAL|NUMERIC/i.test(kind));
    const binding=Number(tokens[i].match(/^\$(\d+)/)[1])-1,value=params[binding];
    if(kinds.length&&number&&typeof value==='string'&&!/^[+-]?\d+$/.test(value)){
      const begin=qualified?i-4:i-2,reference=tokens.slice(begin,i-1).join('');
      tokens.splice(begin,i-1-begin,'('+reference+')::text');i=begin+2;
    }else if(kinds.length&&!number&&typeof value==='number')tokens[i]='$'+(binding+1)+'::text';
  }
}
function argumentsAt(tokens,start){
  let depth=0,first=start+1;const args=[];
  for(let i=start;i<tokens.length;i++){
    if(tokens[i]==='(')depth++;
    if(tokens[i]===')'){
      depth--;
      if(depth===0){args.push(tokens.slice(first,i));return {args:args.length===1&&!args[0].length?[]:args,end:i};}
    }
    if(tokens[i]===','&&depth===1){args.push(tokens.slice(first,i));first=i+1;}
  }
  denied();
}
function castBind(tokens,args){
  if(tokens.length!==1||!/^\$\d+$/.test(tokens[0]))return join(tokens);
  const value=args[Number(tokens[0].slice(1))-1];
  return tokens[0]+'::'+(typeof value==='number'?'numeric':'text');
}
function expression(tokens,args){
  tokens=[...tokens];
  const output=[];
  for(let i=0;i<tokens.length;i++){
    const name=upper(tokens[i]);
    if(/^[A-Z_][A-Z_0-9]*$/.test(name)&&tokens[i+1]==='('){
      const call=argumentsAt(tokens,i+1),parts=call.args.map(part=>expression(part,args));i=call.end;
      if(name==='UNIXEPOCH'&&!parts.length){output.push('floor(extract(epoch FROM statement_timestamp()))::bigint');continue;}
      if(name==='DATE'&&parts.length===1&&parts[0]==="'now'"){output.push("to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD')");continue;}
      if(name==='CHANGES'&&!parts.length){output.push("COALESCE(NULLIF(current_setting('english_study.changes',true),''),'0')::bigint");continue;}
      if(name==='LAST_INSERT_ROWID'&&!parts.length){output.push("COALESCE(NULLIF(current_setting('english_study.last_id',true),''),'0')::bigint");continue;}
      if(['MAX','MIN'].includes(name)&&parts.length>1){output.push((name==='MAX'?'greatest':'least')+'('+parts.join(',')+')');continue;}
      if(name==='JSON_OBJECT'){
        if(parts.length%2)denied();
        output.push('jsonb_build_object('+parts.map((part,index)=>index%2?castBind(studyTokensForExpression(part),args):'('+part+')::text').join(',')+')');continue;
      }
      if(name==='JSON_GROUP_ARRAY'){
        if(parts.length!==1)denied();
        let depth=0,order=-1,end=tokens.length;
        for(let j=call.end+1;j<tokens.length;j++){
          if(tokens[j]==='(')depth++;
          if(tokens[j]===')'&&--depth<0){end=j;break;}
          if(depth===0&&upper(tokens[j])==='ORDER'&&upper(tokens[j+1])==='BY')order=j;
          if(depth===0&&order>=0&&['LIMIT','OFFSET'].includes(upper(tokens[j]))){end=j;break;}
        }
        const sorted=order<0?'':' ORDER BY '+expression(tokens.slice(order+2,end),args);
        if(order>=0)tokens.splice(order,end-order);
        output.push("COALESCE(jsonb_agg("+parts[0]+sorted+"),'[]'::jsonb)");continue;
      }
      if(name==='JSON'){if(parts.length!==1)denied();output.push('('+parts[0]+')::jsonb');continue;}
      if(name==='COALESCE'&&parts.length===2&&/^\d+(?:\.\d+)?$/.test(parts[1])&&/^english_study\.json_extract\(/.test(parts[0]))parts[0]='english_study.json_number('+parts[0]+')';
      if(name==='IN'&&parts.length===2&&parts[0]==='1'&&parts[1]==="'true'")parts[1]='1';
      if(name==='JSON_EXTRACT'){
        if(parts.length!==2)denied();
        if(['archived','client_id'].includes(tokens[i+1])){output.push('english_study.json_scalar('+parts.join(',')+')');continue;}
        const extraction='english_study.json_extract('+parts.join(',')+')';
        output.push(/^(?:=|<>|!=|<|>|<=|>=)$/.test(tokens[i+1]||'')&&/^(?:\d+|\$\d+::(?:bigint|numeric))$/.test(tokens[i+2]||'')?'('+extraction+')::numeric':extraction);continue;
      }
      if(['JSON_SET','JSON_PATCH','JSON_REMOVE','JSON_TYPE','JSON_VALID','INSTR'].includes(name)){
        if(name==='JSON_SET'){
          if(parts.length<3||parts.length%2!==1)denied();
          let value='('+parts[0]+')::jsonb';
          for(let n=1;n<parts.length;n+=2){
            const raw=castBind(studyTokensForExpression(parts[n+1]),args);
            value='english_study.json_put('+value+',english_study.json_path('+parts[n]+'),COALESCE(to_jsonb('+raw+"),'null'::jsonb))";
          }
          output.push(value);continue;
        }
        if(name==='JSON_REMOVE'){
          let value='('+parts[0]+')::jsonb';for(const path of parts.slice(1))value='('+value+' #- english_study.json_path('+path+'))';output.push(value);continue;
        }
        if(name==='JSON_PATCH'){output.push('english_study.json_patch(('+parts[0]+')::jsonb,('+parts[1]+')::jsonb)');continue;}
        output.push('english_study.'+name.toLowerCase()+'('+parts.join(',')+')');continue;
      }
      output.push(name+'('+parts.join(',')+')');continue;
    }
    if(['0','1'].includes(tokens[i])&&((!tokens[i-1]||tokens[i-1]==='(')&&['AND','OR'].includes(upper(tokens[i+1]))||['WHERE','AND','OR','NOT','WHEN'].includes(upper(tokens[i-1]))&&(!tokens[i+1]||[')', 'AND','OR','ORDER','LIMIT','GROUP','THEN'].includes(upper(tokens[i+1])))))output.push(tokens[i]==='1'?'true':'false');
    else if(name==='INTEGER')output.push('bigint');else if(name==='REAL')output.push('double precision');
    else if(/^[a-z_][A-Za-z_0-9]*$/.test(tokens[i])&&/[A-Z]/.test(tokens[i]))output.push('"'+tokens[i]+'"');
    else output.push(tokens[i]);
  }
  return output.join(' ');
}
// Expressions have already been lexed and bound; only a bare bind needs a cast.
function studyTokensForExpression(value){return /^\$\d+$/.test(value)?[value]:[value,''];}

export function studyQuery(source,params=[]){
  if(source==="CREATE TRIGGER IF NOT EXISTS chat_notice_outbox AFTER INSERT ON chat_messages WHEN NEW.category='learning' BEGIN INSERT OR IGNORE INTO chat_delivery_outbox(message_id) VALUES(NEW.id); END"&&params.length===0)return {text:'SELECT 1 WHERE false',params:[],write:false};
  let tokens=studyTokens(source);let count=0;
  tokens=tokens.map(token=>{
    if(token!=='?')return token;
    const index=count++,value=params[index];return '$'+(index+1)+(typeof value==='number'?'::'+(Number.isInteger(value)?'bigint':'numeric'):'');
  });
  if(count!==params.length||params.some(value=>value!==null&&!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)))denied();
  const original=join(tokens),verb=upper(tokens[0]);
  const pragma=/^PRAGMA table_info \( ([a-z_]+) \)$/i.exec(original);
  if(pragma)return {text:"SELECT column_name AS name FROM information_schema.columns WHERE table_schema='english_study' AND table_name=$1 ORDER BY ordinal_position",params:[pragma[1]],write:false};
  const ensure=/^CREATE TABLE IF NOT EXISTS ([a-z_]+) /i.exec(original);
  if(ensure&&!tables.has(ensure[1]))denied();
  if(/^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS /i.test(original)||ensure)return {text:'SELECT 1 WHERE false',params:[],write:false};
  const add=/^ALTER TABLE ([a-z_]+) ADD COLUMN ([a-z_]+) /i.exec(original);
  if(add)throw new StudyError(503,'PostgreSQL study schema needs a migration.');
  const drop=/^DROP TABLE (?:IF EXISTS )?(?:temp \. )?([a-z_]+)$/i.exec(original);
  if(drop){if(!temporary.has(drop[1]))denied();return {text:'DROP TABLE IF EXISTS pg_temp.'+drop[1],params:[],write:false};}
  const temp=/^CREATE TEMP TABLE (?:IF NOT EXISTS )?([a-z_]+) /i.exec(original);
  if(temp){
    if(!temporary.has(temp[1]))denied();
    let text=expression(tokens,params).replace(/^CREATE TEMP TABLE /i,'CREATE TEMP TABLE ');
    if(/_guard$/.test(temp[1]))text=text.replace(/ok bigint/gi,'ok boolean').replace(/ok = 1/g,'ok');
    const sequence=/seq bigint PRIMARY KEY/i.test(text);
    if(sequence)text=text.replace(/seq bigint PRIMARY KEY/gi,'seq bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY');
    else text=text.slice(0,-1)+',_runtime_rowid bigint GENERATED ALWAYS AS IDENTITY)';
    return {text:text+' ON COMMIT DROP',params,write:false,after:studyTracking('pg_temp.'+temp[1],sequence?'seq':'_runtime_rowid')};
  }
  if(!['SELECT','INSERT','UPDATE','DELETE'].includes(verb))denied();
  const ignore=verb==='INSERT'&&upper(tokens[1])==='OR'&&upper(tokens[2])==='IGNORE';if(ignore)tokens.splice(1,2);
  comparisonTypes(tokens,params);
  const target=verb==='SELECT'?null:verb==='UPDATE'?tokens[1]:tokens[2];
  if(target&&!tables.has(target.toLowerCase())&&!temporary.has(target.toLowerCase()))denied();
  const update=tokens.findIndex((token,index)=>upper(token)==='DO'&&upper(tokens[index+1])==='UPDATE'&&upper(tokens[index+2])==='SET');
  if(update>=0){
    const columns=new Set(tables.get(target.toLowerCase())?.columns||[]);let depth=0,start=true;
    for(let i=update+3;i<tokens.length;i++){
      const token=tokens[i];if(start&&tokens[i+1]==='='){start=false;continue;}
      if(token==='(')depth++;if(token===')')depth--;
      if(token===','&&depth===0){start=true;continue;}
      if(columns.has(token)&&tokens[i-1]!=='.'&&tokens[i+1]!=='.'&&tokens[i+1]!=='(')tokens[i]=target+'.'+token;
    }
  }
  for(let i=0;i<tokens.length;i++)if(upper(tokens[i])==='FROM'&&tokens[i+1]==='('){
    const end=argumentsAt(tokens,i+1).end,next=upper(tokens[end+1]);
    if(!tokens[end+1]||['WHERE','ORDER','GROUP','JOIN','LEFT','INNER','RIGHT','CROSS','FULL','LIMIT','UNION','EXCEPT','INTERSECT','HAVING','ON',')',','].includes(next))tokens.splice(end+1,0,'AS','study_result');
  }
  let text=expression(tokens,params);
  if(ignore){if(/ON CONFLICT/i.test(text))denied();text+=' ON CONFLICT DO NOTHING';}
  text=text.replace(/\bsqlite_master\b/g,"(SELECT table_name AS name,'table'::text AS type FROM information_schema.tables WHERE table_schema='english_study') AS sqlite_master");
  const write=verb!=='SELECT';
  if(target&&!/^[a-z_]+$/i.test(target))denied();
  return {text,params,write,target};
}

export function studyTableDDL(source,columns){
  const tokens=studyTokens(source),name=tokens[2].replace(/^"|"$/g,'');
  if(upper(tokens[0])!=='CREATE'||upper(tokens[1])!=='TABLE'||tokens[3]!=='('||!/^[a-z_]+$/.test(name))denied();
  const keys=columns.filter(column=>column.pk),identity=keys.length===1&&upper(keys[0].type)==='INTEGER'?keys[0].name:null;
  tokens.splice(0,3,'CREATE','TABLE','IF','NOT','EXISTS','english_study.'+name);
  for(let i=0;i<tokens.length;i++){
    if(upper(tokens[i])==='AUTOINCREMENT'){tokens.splice(i--,1);continue;}
    if(upper(tokens[i])==='REFERENCES')tokens[i+1]='english_study.'+tokens[i+1].replace(/^"|"$/g,'');
    if(identity&&tokens[i].replace(/^"|"$/g,'')===identity&&upper(tokens[i+1])==='INTEGER')tokens.splice(i+2,0,'GENERATED','BY','DEFAULT','AS','IDENTITY');
  }
  if(!identity)tokens.splice(tokens.length-1,0,',','_runtime_rowid','bigint','GENERATED','ALWAYS','AS','IDENTITY');
  return {name,text:expression(tokens,[]),identity:identity||'_runtime_rowid',columns:columns.map(column=>column.name),types:Object.fromEntries(columns.map(column=>[column.name,column.type]))};
}
export function studyIndexDDL(source){
  const tokens=studyTokens(source),on=tokens.findIndex(token=>upper(token)==='ON');
  if(upper(tokens[0])!=='CREATE'||on<3)denied();
  tokens[on+1]='english_study.'+tokens[on+1].replace(/^"|"$/g,'');
  const index=tokens.findIndex(token=>upper(token)==='INDEX');tokens.splice(index+1,0,'IF','NOT','EXISTS');
  return expression(tokens,[]);
}
