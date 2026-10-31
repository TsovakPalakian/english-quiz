import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {GroupService} from '../src/learning-groups.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';

const teacherA={id:'teacher-a',role:'ADMIN'};
const teacherB={id:'teacher-b',role:'ADMIN'};
const studentA='student-a';
const studentB='student-b';

async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    read:async(q,a=[])=>sqlite.prepare(q).all(...a),
    atomic:async commands=>{
      sqlite.exec('BEGIN');
      try{
        const results=[];
        for(const c of commands){
          const statement=sqlite.prepare(c.sql);
          if(/^\s*SELECT\b/i.test(c.sql))results.push({rows:statement.all(...args(c)).map(row=>Object.values(row).map(value=>({value})))});
          else{statement.run(...args(c));results.push({rows:[]});}
        }
        sqlite.exec('COMMIT');
        return results;
      }catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  const service=new GroupService(db);
  await service.ensure();
  sqlite.exec(`
    INSERT OR IGNORE INTO class_group_setup(key) VALUES('levels-v1'),('level-names-v2');
    DELETE FROM class_groups;
    INSERT INTO class_groups(id,title,revision) VALUES(101,'A1 Alpha',1),(102,'A1 Beta',1);
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('${studentA}',101,'teacher-a'),('${studentB}',102,'teacher-b');
    INSERT OR REPLACE INTO catalog_documents(namespace,key,value_json) VALUES
      ('accounts-group-teachers','101','{"revision":1,"teacherIds":["teacher-a"]}'),
      ('accounts-group-teachers','102','{"revision":1,"teacherIds":["teacher-b"]}');
  `);
  return {sqlite,service,close:()=>sqlite.close()};
}

test('ADMIN list and members are limited to assigned groups',async()=>{
  const f=await fixture();try{
    const a=await f.service.list(teacherA);
    assert.deepEqual(a.map(g=>g.id),[101]);
    const b=await f.service.list(teacherB);
    assert.deepEqual(b.map(g=>g.id),[102]);
    assert.deepEqual((await f.service.members(teacherA)).map(row=>({...row})),[{accountId:studentA,groupId:101}]);
    assert.deepEqual((await f.service.members(teacherB)).map(row=>({...row})),[{accountId:studentB,groupId:102}]);
  }finally{f.close();}
});

test('ADMIN cannot assign or steal students across groups',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.service.assignStudent(teacherA,studentB,101),e=>e.status===403);
    await assert.rejects(f.service.assignStudent(teacherA,studentA,102),e=>e.status===403);
    await assert.rejects(f.service.assignStudent(teacherA,studentB,null),e=>e.status===403);
    await f.service.assignStudent(teacherA,studentA,null);
    assert.equal((await f.service.members(teacherA)).length,0);
  }finally{f.close();}
});

test('ADMIN cannot rename another teacher group; create assigns self',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.service.manage(teacherA,{action:'rename',id:102,expectedRevision:1,title:'A1 Taken'}),e=>e.status===403);
    const created=await f.service.manage(teacherA,{action:'create',title:'A1 New',date:'2026-10-31'});
    assert.ok(created.groups.some(g=>g.title==='A1 New'&&g.teacherIds.includes('teacher-a')));
  }finally{f.close();}
});
