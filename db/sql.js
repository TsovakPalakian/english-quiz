import {invalid} from './errors.js';

export function parameters(values){
  if(!Array.isArray(values))throw invalid('DB_PARAMETERS','Database parameters must be a positional array.');
  return Object.freeze(values.map(value=>{
    if(typeof value==='boolean')return value?1:0;
    if(value===null||typeof value==='string')return value;
    if(typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value)))return value;
    throw invalid('DB_PARAMETERS','Bind null, strings, booleans or finite safe numbers. Encode JSON and large integers explicitly.');
  }));
}

export function compile(sql,params,provider,operation){
  if(typeof sql!=='string'||!sql.trim()||sql.length>65536||sql.includes('\0'))throw invalid('DB_SQL','Provide one bounded SQL statement.');
  const args=parameters(params),words=[];let output='',index=0,count=0,terminated=false;
  // This is a placeholder lexer, not a SQL transpiler. Quoted text and comments
  // are copied verbatim; parameter values never become part of the SQL string.
  while(index<sql.length){
    const rest=sql.slice(index),char=rest[0];
    let match;
    if((match=/^\s+/.exec(rest))){output+=match[0];index+=match[0].length;continue;}
    if(rest.startsWith('--')){const end=rest.search(/[\r\n]/);const stop=end<0?sql.length:index+end;output+=sql.slice(index,stop);index=stop;continue;}
    if(rest.startsWith('/*')){const end=sql.indexOf('*/',index+2);if(end<0||sql.slice(index+2,end).includes('/*'))throw invalid('DB_SQL','Unclosed or nested SQL comment.');output+=sql.slice(index,end+2);index=end+2;continue;}
    if(terminated)throw invalid('DB_SQL','Only one SQL statement is allowed.');
    if(char===';' ){terminated=true;index++;continue;}
    if(char==="'"||char==='"'){
      let end=index+1,closed=false;
      while(end<sql.length){if(sql[end]===char){if(sql[end+1]===char){end+=2;continue;}end++;closed=true;break;}end++;}
      if(!closed)throw invalid('DB_SQL','Unclosed SQL quote.');output+=sql.slice(index,end);index=end;continue;
    }
    if(char==='?'){
      if(/[?0-9|&]/.test(rest[1]||' '))throw invalid('DB_PLACEHOLDERS','Use plain ? positional placeholders; JSON operators are outside the common SQL subset.');
      count++;output+=provider==='neon'?'$'+count:'?';index++;continue;
    }
    if(['$',':','@','`','[',']','\\'].includes(char))throw invalid('DB_SQL_DIALECT','Use the common SQL subset: ? placeholders, standard quotes and no provider-specific casts or operators.');
    if((match=/^[A-Za-z_][A-Za-z_0-9]*/.exec(rest))){
      const word=match[0].toUpperCase();
      if(word==='E'&&rest[match[0].length]==="'")throw invalid('DB_SQL_DIALECT','PostgreSQL escape strings are not portable. Bind the value instead.');
      words.push(word);output+=match[0];index+=match[0].length;continue;
    }
    output+=char;index++;
  }
  const verb=words[0];
  if(words.some(word=>['NOW','CURRENT_TIMESTAMP','CURRENT_DATE','UNIXEPOCH','STRFTIME','JSON_EXTRACT','JSON_SET','JSON_OBJECT','JSON_GROUP_ARRAY','JSONB_BUILD_OBJECT','LAST_INSERT_ROWID','CHANGES','AUTOINCREMENT','ILIKE','GLOB','TRUE','FALSE'].includes(word))||words.includes('INSERT')&&words.includes('IGNORE'))throw invalid('DB_SQL_DIALECT','Use portable value helpers or a provider-specific repository for this SQL dialect feature.');
  if(operation==='query'?verb!=='SELECT':!['INSERT','UPDATE','DELETE'].includes(verb))throw invalid('DB_SQL_OPERATION',operation==='query'?'query() accepts SELECT only.':'execute() accepts INSERT, UPDATE or DELETE only.');
  if(words.some(word=>['BEGIN','COMMIT','ROLLBACK','SAVEPOINT','RELEASE','PRAGMA','ATTACH','DETACH','CREATE','ALTER','DROP','TRUNCATE','VACUUM','COPY','CALL','EXECUTE','GRANT','REVOKE'].includes(word))||operation==='query'&&words.includes('INTO'))throw invalid('DB_SQL_OPERATION','Migration and transaction-control SQL is not allowed through the repository.');
  if(count!==args.length)throw invalid('DB_PARAMETERS','SQL placeholder count does not match the bound parameter array.');
  return Object.freeze({sql:output,args,operation});
}

export function integer(value){
  if(typeof value==='bigint')return value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)?Number(value):value.toString();
  return value;
}
