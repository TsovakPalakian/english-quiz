import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {ErrorBankService,SRS_STAGES} from '../src/learning-error-bank.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const args=command=>command.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={
    async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},
    async atomic(commands){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const result=commands.map(command=>{
          const query=sqlite.prepare(command.sql),rows=query.all(...args(command));
          return {cols:query.columns().map(c=>({name:c.name})),rows:rows.map(row=>Object.values(row).map(value=>({type:value==null?'null':typeof value==='number'?'integer':'text',value:String(value)})))};
        });
        sqlite.exec('COMMIT');
        return result;
      }catch(error){
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return {sqlite,db};
}

const student={id:'s_101',name:'Student',role:'USER'};

test('ErrorBankService schema initializes idempotently via ensure()',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    await bank.ensure();
    await bank.ensure();
    const table=f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_error_items'").get();
    assert.ok(table,'account_error_items table must exist');
  }finally{
    f.sqlite.close();
  }
});

test('ErrorBankService records sub-maximal scores and handles duplicate mistakes',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    const questions=[
      {part:{id:'p1',type:'quiz'},index:0,max:2,item:{prompt:'Choose option',answer:1,options:['Wrong','Correct']}},
      {part:{id:'p2',type:'text',allowedAnswers:'children'},index:0,max:3,item:{prompt:'Plural of child'}}
    ];

    // Student missed question p1 (scored 0 of 2), got p2 correct (3 of 3)
    const recorded=await bank.recordErrors(student.id,'exam-block',101,questions,{'p1':{0:'0'},'p2':{0:'children'}},{'p1':{0:0},'p2':{0:3}});
    assert.equal(recorded.length,1,'Only the missed question should be recorded');
    assert.equal(recorded[0].partId,'p1');

    const rows=f.sqlite.prepare('SELECT * FROM account_error_items WHERE account_id=?').all(student.id);
    assert.equal(rows.length,1);
    assert.equal(rows[0].error_count,1);
    assert.equal(rows[0].stage,1);
    assert.equal(rows[0].status,'active');

    // Student makes mistake again on the same question in another test
    await bank.recordErrors(student.id,'exam-block',101,questions,{'p1':{0:'0'}},{'p1':{0:0}});
    const updated=f.sqlite.prepare('SELECT * FROM account_error_items WHERE account_id=?').all(student.id);
    assert.equal(updated.length,1,'Item must be updated on conflict without duplicates');
    assert.equal(updated[0].error_count,2,'error_count must increment');
  }finally{
    f.sqlite.close();
  }
});

test('SRS 4-stage progression: Recognition -> Cued Gap -> Generation -> Speech -> Mastered',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    await bank.ensure();

    // Insert an item due today at Stage 1
    const now=Math.floor(Date.now()/1000);
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,given_answer,stage,interval_days,next_review_at,status)
      VALUES(1,'s_101',101,'exam-block','p1',0,'Choose correct word','children','childs',1,1,${now-10},'active')`);

    // 1. Queue returns Stage 1 (Recognition)
    const queue1=await bank.queue(student);
    assert.equal(queue1.length,1);
    assert.equal(queue1[0].stage,SRS_STAGES.RECOGNITION);
    assert.equal(queue1[0].exerciseType,'choice');

    // 2. Submit Stage 1 answer -> advances to Stage 2 (Cued Gap), interval 3 days
    const res1=await bank.submitReview(student,{itemId:1,answer:'children'});
    assert.equal(res1.correct,true);
    assert.equal(res1.stage,SRS_STAGES.CUED_GAP);
    assert.equal(res1.intervalDays,3);

    // Fast-forward timestamp to simulate review due date
    f.sqlite.exec(`UPDATE account_error_items SET next_review_at=${now-10} WHERE id=1`);

    // 3. Queue returns Stage 2 (Cued Gap)
    const queue2=await bank.queue(student);
    assert.equal(queue2.length,1);
    assert.equal(queue2[0].stage,SRS_STAGES.CUED_GAP);
    assert.equal(queue2[0].cuedHint,'c___');

    // 4. Submit Stage 2 answer -> advances to Stage 3 (Generation), interval 7 days
    const res2=await bank.submitReview(student,{itemId:1,answer:'children'});
    assert.equal(res2.correct,true);
    assert.equal(res2.stage,SRS_STAGES.GENERATION);
    assert.equal(res2.intervalDays,7);

    // Fast-forward timestamp
    f.sqlite.exec(`UPDATE account_error_items SET next_review_at=${now-10} WHERE id=1`);

    // 5. Queue returns Stage 3 (Generation)
    const queue3=await bank.queue(student);
    assert.equal(queue3.length,1);
    assert.equal(queue3[0].stage,SRS_STAGES.GENERATION);

    // 6. Submit Stage 3 answer (meaningful sentence) -> advances to Stage 4 (Speech), interval 21 days
    const res3=await bank.submitReview(student,{itemId:1,answer:'The children are playing outside.'});
    assert.equal(res3.correct,true);
    assert.equal(res3.stage,SRS_STAGES.SPEECH);
    assert.equal(res3.intervalDays,21);

    // Fast-forward timestamp
    f.sqlite.exec(`UPDATE account_error_items SET next_review_at=${now-10} WHERE id=1`);

    // 7. Submit Stage 4 answer (Speech) -> Mastered!
    const res4=await bank.submitReview(student,{itemId:1,answer:'children'});
    assert.equal(res4.correct,true);
    assert.equal(res4.status,'mastered','Item must be marked mastered after stage 4');

    // Verified: No longer in active queue
    const queueFinal=await bank.queue(student);
    assert.equal(queueFinal.length,0,'Mastered items must not appear in active queue');
  }finally{
    f.sqlite.close();
  }
});

test('Mistake resets success streak and demotes stage',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    await bank.ensure();
    const now=Math.floor(Date.now()/1000);
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,success_streak,status)
      VALUES(2,'s_101',101,'exam-block','p2',0,'Plural form','children',3,7,${now-10},2,'active')`);

    // Student makes a mistake on Stage 3
    const res=await bank.submitReview(student,{itemId:2,answer:'wrong answer'});
    assert.equal(res.correct,false);
    assert.equal(res.stage,2,'Stage must demote from 3 to 2');
    assert.equal(res.intervalDays,1,'Interval must reset to 1 day');

    const [row]=await f.db.read('SELECT success_streak,error_count FROM account_error_items WHERE id=2');
    assert.equal(row.success_streak,0,'Streak must reset to 0');
    assert.equal(row.error_count,2,'error_count must increment');
  }finally{
    f.sqlite.close();
  }
});

test('stats() provides accurate overview of errors, daily queue and mastered items',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    await bank.ensure();
    const now=Math.floor(Date.now()/1000);

    f.sqlite.exec(`INSERT INTO account_error_items(account_id,material_id,kind,part_id,question_index,prompt,expected_answer,next_review_at,status,success_streak)
      VALUES
        ('s_101',1,'exam','p1',0,'Q1','A',${now-100},'active',3),
        ('s_101',1,'exam','p2',0,'Q2','B',${now+10000},'active',1),
        ('s_101',1,'exam','p3',0,'Q3','C',${now-50},'mastered',4)`);

    const stats=await bank.stats(student);
    assert.equal(stats.totalErrors,3);
    assert.equal(stats.dueToday,1,'Only active items with next_review_at <= now are due today');
    assert.equal(stats.activeItems,2);
    assert.equal(stats.masteredItems,1);
    assert.equal(stats.maxStreak,4);
  }finally{
    f.sqlite.close();
  }
});
