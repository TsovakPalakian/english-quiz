import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {StudyError} from '../src/learning-study.mjs';

export function sqliteStudyDatabase(sqlite,{afterCommit}={}){
  const args=command=>(command.args||[]).map(arg=>arg.type==='null'?null:['integer','float'].includes(arg.type)?Number(arg.value):arg.value);
  const cell=value=>value===null?{type:'null'}:typeof value==='number'?Number.isInteger(value)?{type:'integer',value:String(value)}:{type:'float',value}:{type:'text',value};
  const execute=command=>{
    const query=sqlite.prepare(command.sql),columns=query.columns();
    if(!columns.length){const result=query.run(...args(command));return {cols:[],rows:[],affected_row_count:Number(result.changes)};}
    return {cols:columns.map(c=>({name:c.name})),rows:query.all(...args(command)).map(row=>columns.map(c=>cell(row[c.name]))),affected_row_count:0};
  };
  return {
    read:async(sql,values=[])=>sqlite.prepare(sql).all(...values),
    async readMany(commands){sqlite.exec('BEGIN');try{const results=commands.map(c=>sqlite.prepare(c.sql).all(...args(c)));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
    async atomic(commands){
      sqlite.exec('BEGIN IMMEDIATE');let results;
      try{results=commands.map(execute);sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,'Local database transaction failed.');}
      afterCommit?.();return results;
    }
  };
}
export function openLocalStudyDatabase(){
  const path=process.env.STUDY_LOCAL_DATABASE;
  if(!path?.startsWith('/')||!existsSync(path))throw new Error('Set STUDY_LOCAL_DATABASE to an existing private SQLite copy.');
  const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON');return sqliteStudyDatabase(sqlite);
}
