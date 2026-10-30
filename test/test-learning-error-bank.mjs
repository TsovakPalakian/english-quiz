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

test('ErrorBankService captures response latency, hints, and distractor telemetry via meta',async()=>{
  const f=fixture();
  try{
    const bank=new ErrorBankService(f.db);
    const questions=[
      {
        part:{id:'p_telemetry',type:'choice',allowedAnswers:'depend on'},
        index:0,
        max:1,
        item:{prompt:'Select correct preposition',answer:'depend on',options:['depend from','depend on']}
      }
    ];

    // Student chose distractor 'depend from' with 5200ms latency and hint
    const answers={'p_telemetry':{0:'depend from'}};
    const points={'p_telemetry':{0:0}};
    const meta={'p_telemetry':{0:{latencyMs:5200,hint:'Think about Russian transfer: зависеть от'}}};

    const recorded=await bank.recordErrors(student.id,'exam-block',301,questions,answers,points,meta);
    assert.equal(recorded.length,1);
    assert.equal(recorded[0].latencyMs,5200);

    const [row]=await f.db.read('SELECT latency_ms,diagnostic_note,error_tag,error_category FROM account_error_items WHERE account_id=? AND part_id=?',[student.id,'p_telemetry']);
    assert.equal(row.latency_ms,5200,'Latency must be persisted in account_error_items');
    assert.ok(row.diagnostic_note.includes('Selected distractor'),'Diagnostic note must identify chosen distractor');
    assert.ok(row.diagnostic_note.includes('Used hint'),'Diagnostic note must record hint usage');

    // Submit review updating latency
    const reviewResult=await bank.submitReview(student,{itemId:1,answer:'depend on',latencyMs:1850});
    assert.equal(reviewResult.correct,true);

    const [updatedRow]=await f.db.read('SELECT latency_ms FROM account_error_items WHERE id=1');
    assert.equal(updatedRow.latency_ms,1850,'Review latency must be updated');
  }finally{
    f.sqlite.close();
  }
});

test('ErrorBankService queue in fsrs_retrievability mode orders items dynamically by lowest retrievability', async () => {
  const f = fixture();
  try {
    const bank = new ErrorBankService(f.db);
    await bank.ensure();

    const now = Math.floor(Date.now() / 1000);

    // Card High Retrievability (stability 10, reviewed 1 day ago => R ~ 0.976)
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,status,stability,difficulty,reps,lapses,last_reviewed_at)
      VALUES(101,'${student.id}',500,'quiz','p1',0,'High R word','word1',1,10,${now + 864000},'active',10.0,5.0,2,0,${now - 1 * 86400})`);

    // Card Low Retrievability (stability 2, reviewed 4 days ago => R ~ 0.816)
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,status,stability,difficulty,reps,lapses,last_reviewed_at)
      VALUES(102,'${student.id}',500,'quiz','p2',0,'Low R word','word2',1,2,${now - 86400},'active',2.0,6.0,1,1,${now - 4 * 86400})`);

    // Card Unreviewed (stability 0 => R = 0.0)
    f.sqlite.exec(`INSERT INTO account_error_items(id,account_id,material_id,kind,part_id,question_index,prompt,expected_answer,stage,interval_days,next_review_at,status,stability,difficulty,reps,lapses,last_reviewed_at)
      VALUES(103,'${student.id}',500,'quiz','p3',0,'Unreviewed word','word3',1,1,${now - 500},'active',0,5.0,0,0,0)`);

    const q = await bank.queue(student, { limit: 10, mode: 'fsrs_retrievability' });
    assert.equal(q.length, 3);

    // Dynamic queue order must be ascending by R:
    // 1st: Unreviewed (R = 0)
    assert.equal(q[0].id, 103);
    assert.equal(q[0].retrievability, 0);

    // 2nd: Low R (~0.816)
    assert.equal(q[1].id, 102);
    assert.ok(q[1].retrievability < 0.85);

    // 3rd: High R (~0.976)
    assert.equal(q[2].id, 101);
    assert.ok(q[2].retrievability > 0.95);
    assert.ok(q[1].retrievability < q[2].retrievability);
  } finally {
    f.sqlite.close();
  }
});

test('ErrorBankService migrates legacy schema without error_category or retrievability and ensures subgroupDiagnostic succeeds', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const args = command => (command.args || []).map(a => a?.type === 'null' ? null : ['integer', 'float'].includes(a?.type) ? Number(a.value) : a?.value !== undefined ? a.value : a);
  const db = {
    async read(sql, queryArgs = []) {
      return sqlite.prepare(sql).all(...queryArgs);
    },
    async atomic(commands) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = commands.map(command => {
          const query = sqlite.prepare(command.sql);
          const rows = query.all(...args(command));
          return {
            cols: query.columns().map(c => ({ name: c.name })),
            rows: rows.map(row => Object.values(row).map(value => ({
              type: value == null ? 'null' : typeof value === 'number' ? 'integer' : 'text',
              value: String(value)
            })))
          };
        });
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };

  try {
    // 1. Simulate legacy production database table before FSRS columns were added
    sqlite.exec(`CREATE TABLE account_error_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      material_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      part_id TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      expected_answer TEXT NOT NULL DEFAULT '',
      given_answer TEXT NOT NULL DEFAULT '',
      error_tag TEXT NOT NULL DEFAULT 'grammar',
      stage INTEGER NOT NULL DEFAULT 1,
      interval_days INTEGER NOT NULL DEFAULT 1,
      next_review_at INTEGER NOT NULL,
      error_count INTEGER NOT NULL DEFAULT 1,
      success_streak INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT(unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
      UNIQUE(account_id, kind, material_id, part_id, question_index)
    )`);

    const initialCols = new Set(sqlite.prepare('PRAGMA table_info(account_error_items)').all().map(c => c.name));
    assert.equal(initialCols.has('error_category'), false, 'Legacy table must not have error_category');
    assert.equal(initialCols.has('retrievability'), false, 'Legacy table must not have retrievability');

    const bank = new ErrorBankService(db);
    // ensure() must safely migrate columns without failing index creation
    await bank.ensure();

    const migratedCols = new Set(sqlite.prepare('PRAGMA table_info(account_error_items)').all().map(c => c.name));
    for (const col of ['error_category', 'diagnostic_note', 'stability', 'difficulty', 'retrievability', 'last_reviewed_at', 'reps', 'lapses', 'latency_ms']) {
      assert.equal(migratedCols.has(col), true, 'Column ' + col + ' must be added');
    }

    const indexes = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='account_error_items'").all().map(i => i.name));
    assert.equal(indexes.has('idx_error_items_category'), true, 'idx_error_items_category index must exist');
    assert.equal(indexes.has('idx_error_items_retrievability'), true, 'idx_error_items_retrievability index must exist');

    // subgroupDiagnostic must succeed and ensure class_group_students schema automatically
    const dev = { id: 'dev_user', role: 'DEVELOPER' };
    const diag = await bank.subgroupDiagnostic(dev, { groupId: 18 });
    assert.equal(diag.groupId, 18);
    assert.equal(diag.totalErrors, 0);
  } finally {
    sqlite.close();
  }
});
