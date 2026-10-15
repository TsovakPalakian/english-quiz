import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';
import {neonStudyTables} from '../src/neon-study-schema.mjs';
import {NeonStudyClient} from '../src/neon-study.mjs';

let engine,tail=Promise.resolve(),operations=0;
const initialize=async()=>{if(!engine){engine=new PGlite();for(const sql of neonStudyMigration)await engine.exec(sql);}return engine;};
const identifier=name=>{assert.match(name,/^[a-z_][a-z_0-9]*$/i);return '"'+name+'"';};
function canonical(value){
  if(typeof value==='string'&&/^[\[{]/.test(value)){try{return canonical(JSON.parse(value));}catch{}}
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function normalizeRows(rows,reference=[]){
  return rows.map((row,index)=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
    const expected=reference[index]?.[key];
    if(typeof expected==='number'&&typeof value==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(value))value=Number(value);
    if(typeof value==='number'&&typeof expected==='number'&&/(?:_at|At)$/.test(key)&&Math.abs(value-expected)<=2)value=expected;
    return [key,canonical(value)];
  })));
}
function comparableOrder(sql,rows){
  const compare=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
  if(!/\bORDER\s+BY\b/i.test(sql))return rows.sort(compare);
  const order=/\bORDER\s+BY\s+([a-z_0-9.,\s]+?)(?:\s+LIMIT\b|$)/i.exec(sql);
  if(!order)return rows;
  const keys=order[1].split(',').map(part=>part.trim().split(/\s/)[0].split('.').at(-1));
  if(!rows.length||!keys.every(key=>Object.hasOwn(rows[0],key)))return rows;
  const result=[];
  for(let first=0;first<rows.length;){
    let end=first+1;while(end<rows.length&&keys.every(key=>rows[first][key]===rows[end][key]))end++;
    result.push(...rows.slice(first,end).sort(compare));first=end;
  }
  return result;
}
async function snapshot(sqlite,pg){
  const existing=new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  const tables=neonStudyTables.filter(table=>existing.has(table.name)).map(table=>({...table,sourceColumns:sqlite.prepare('PRAGMA table_info('+identifier(table.name)+')').all().map(column=>column.name),records:sqlite.prepare('SELECT * FROM '+identifier(table.name)).all()}));
  await pg.transaction(async tx=>{
    await tx.exec('SET LOCAL search_path=english_study,pg_catalog');
    await tx.exec('TRUNCATE '+neonStudyTables.map(table=>'english_study.'+identifier(table.name)).join(',')+' RESTART IDENTITY CASCADE');
    for(const table of tables){
      for(const row of table.records)await tx.query('INSERT INTO english_study.'+identifier(table.name)+'('+table.sourceColumns.map(identifier).join(',')+') VALUES('+table.sourceColumns.map((_,index)=>'$'+(index+1)).join(',')+')',table.sourceColumns.map(column=>row[column]));
      if(table.identity!=='_runtime_rowid'&&table.records.length){
        const max=Math.max(...table.records.map(row=>Number(row[table.identity])));
        await tx.query('SELECT setval(pg_get_serial_sequence($1,$2),$3,true)',['english_study.'+table.name,table.identity,max]);
      }
    }
  });
}
function pgDriver(pg){
  return {query(text,params){return {text,params};},async transaction(commands,options){
    return pg.transaction(async tx=>{
      await tx.exec(options.readOnly?'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY':'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      const results=[];
      for(const command of commands){
        try{const result=await tx.query(command.text,command.params);results.push({...result,command:command.text.split(/\s/)[0],rowCount:result.affectedRows||0});}
        catch(error){error.studySql=command.text;throw error;}
      }
      return results;
    });
  }};
}
const metadata=sql=>/^\s*PRAGMA\b/i.test(sql)||sql.includes('sqlite_master');
function serial(fn){const job=tail.then(fn);tail=job.catch(()=>{});return job;}

export function neonShadow(sqlite,original){
  const invoke=async(method,commands,legacy)=>serial(async()=>{
    const pg=await initialize();await snapshot(sqlite,pg);let diagnostic;
    const driver=pgDriver(pg),db=new NeonStudyClient({}, {createSql:()=>({query:driver.query,async transaction(...args){try{return await driver.transaction(...args);}catch(error){diagnostic={message:error.message,sql:error.studySql};throw error;}}})});
    const filtered=method==='atomic'?commands.filter(command=>!/^\s*(?:CREATE (?!TEMP\b)|ALTER TABLE)/i.test(command.sql)):commands;
    let result,failure;
    try{result=filtered.length?await db[method](filtered):[];}catch(error){failure=error;}
    let expected,legacyError;
    try{expected=await legacy();}catch(error){legacyError=error;}
    operations++;
    if(legacyError){assert.ok(failure,'PostgreSQL accepted a rejected SQLite transaction.');throw legacyError;}
    if(failure)throw new Error('PostgreSQL shadow failed: '+JSON.stringify(diagnostic||{message:failure.message,sql:filtered.map(command=>command.sql)}));
    if(method==='readMany'){
      for(let index=0;index<commands.length;index++)if(!metadata(commands[index].sql)){
        const actual=normalizeRows(result[index],expected[index]),wanted=normalizeRows(expected[index]);
        assert.deepEqual(comparableOrder(commands[index].sql,actual),comparableOrder(commands[index].sql,wanted),'PostgreSQL projection differs: '+commands[index].sql);
      }
    }
    return expected;
  });
  return {
    read(sql,args=[]){return invoke('readMany',[{sql,args:args.map(value=>value===null?{type:'null'}:typeof value==='number'?{type:'integer',value:String(value)}:{type:'text',value})}],async()=>[await original.read(sql,args)]).then(rows=>rows[0]);},
    readMany(commands){return invoke('readMany',commands,()=>original.readMany(commands));},
    atomic(commands){return invoke('atomic',commands,()=>original.atomic(commands));}
  };
}
export async function closeNeonShadow(){await tail;await engine?.close();console.log('PostgreSQL shadow operations checked:',operations);}
