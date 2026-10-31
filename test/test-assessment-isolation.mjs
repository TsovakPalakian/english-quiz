import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AssessmentService} from '../src/learning-assessment.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {StudyError} from '../src/learning-study.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  sqlite.exec(`
    INSERT INTO account_refs(id) VALUES('teacher-a'),('teacher-b'),('student-a'),('student-b');
    INSERT INTO study_profiles(id,kind) VALUES(1,'personal'),(2,'personal');
    INSERT INTO profile_members VALUES('teacher-a',1),('student-a',1),('teacher-b',2),('student-b',2);
    INSERT INTO lessons(id,title,published) VALUES(1,'Assessed',1);
    INSERT INTO lesson_blocks(id,lesson_id,position,type,content_json) VALUES(10,1,0,'task','{"assessed":true,"text":"Write","maxPoints":1}');
    INSERT INTO class_groups(id,title) VALUES(101,'A1 Alpha'),(102,'A1 Beta');
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('student-a',101,'teacher-a'),('student-b',102,'teacher-b');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES
      ('accounts-group-teachers','101','{"revision":1,"teacherIds":["teacher-a"]}'),
      ('accounts-group-teachers','102','{"revision":1,"teacherIds":["teacher-b"]}');
    INSERT INTO exams(id,title,published) VALUES(10,'Exam',1);
    INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(20,10,0,'Block',1);
    INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json) VALUES(30,10,20,0,'task','{"text":"Q","maxPoints":1}');
  `);
  const sqlArgs=statement=>statement.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
  const db={
    async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},
    async atomic(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{for(const s of statements)sqlite.prepare(s.sql).run(...sqlArgs(s));sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw new StudyError(/constraint/i.test(error.message)?409:503,'Fixture transaction failed');}
    }
  };
  return {sqlite,db,close:()=>sqlite.close()};
}

const teacherA={id:'teacher-a',role:'ADMIN'};
const teacherB={id:'teacher-b',role:'ADMIN'};
const studentA={id:'student-a',role:'USER'};

test('ADMIN cannot get or write another teacher student assessment',async()=>{
  const f=fixture();try{
    const service=new AssessmentService(f.db);
    await service.write(studentA,{kind:'lesson',id:1,action:'submit',answers:{10:{0:'Answer'}}});
    await assert.rejects(service.get(teacherB,{kind:'lesson',id:1,studentId:'student-a'}),e=>e.status===403);
    await assert.rejects(service.write(teacherB,{kind:'lesson',id:1,studentId:'student-a',action:'review',points:{10:{0:1}}}),e=>e.status===403);
    const own=await service.get(teacherA,{kind:'lesson',id:1,studentId:'student-a'});
    assert.equal(own.state,'submitted');
  }finally{f.close();}
});

test('ADMIN cannot list or legacy-save exam work for unmanaged student',async()=>{
  const f=fixture();try{
    const exams=new ExamService(f.db);
    await exams.ensure();
    await assert.rejects(exams.listWork(teacherB,'student-a'),e=>e.status===403);
    await assert.rejects(exams.legacySaveWork(teacherB,{examId:10,blockId:20,studentId:'student-a',corrections:{30:{0:'no'}},points:{30:{0:0}}}),e=>e.status===403);
    assert.deepEqual(await exams.listWork(teacherA,'student-a'),[]);
  }finally{f.close();}
});

test('exam-block review without instance still requires group teacher assignment',async()=>{
  const f=fixture();try{
    const service=new AssessmentService(f.db);
    await assert.rejects(service.get(teacherB,{kind:'exam-block',id:20,studentId:'student-a'}),e=>e.status===403);
    assert.equal((await service.get(teacherA,{kind:'exam-block',id:20,studentId:'student-a'})).state,'draft');
  }finally{f.close();}
});
