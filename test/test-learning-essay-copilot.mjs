import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {AssessmentService} from '../src/learning-assessment.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {MessageService} from '../src/learning-messages.mjs';
import {analyzeEssayText,mapAnalysisToRubric,essayCopilot} from '../src/learning-essay-copilot.mjs';

async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  applyLearningSchema(sqlite);
  const sqlArgs=statement=>statement.args.map(a=>a.type==='null'?null:a.type==='integer'?Number(a.value):a.value);
  const db={
    async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},
    async atomic(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{for(const s of statements)sqlite.prepare(s.sql).run(...sqlArgs(s));sqlite.exec('COMMIT');}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  await new ExamService(db).ensure();
  await new MessageService(db,async()=>[]).ensure();
  sqlite.exec(`INSERT INTO account_refs(id) VALUES('teacher1'),('student1'),('outsider');
    INSERT INTO study_profiles(id,kind) VALUES(1,'personal');
    INSERT INTO profile_members VALUES('student1',1);
    INSERT INTO exams(id,title,published) VALUES(10,'Final Exam',1);
    INSERT INTO exam_blocks(id,exam_id,position,title,published) VALUES(20,10,0,'Essay Block',1);
    INSERT INTO class_groups(id,title) VALUES(1,'Group 1');
    INSERT INTO class_group_students(group_id,account_id,assigned_by) VALUES(1,'student1','teacher1');
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES('accounts-group-teachers','1','{"teacherIds":["teacher1"]}');
    INSERT INTO chat_assignments(id,exam_id,target_kind,target_id) VALUES('assign-10-student1',10,'student','student1');
  `);
  return {sqlite,db};
}

const SAMPLE_ESSAY=`
In recent years, the rapid advancement of artificial intelligence has significantly transformed modern education. Many educators argue that digital tools provide fundamental benefits for students of all backgrounds. However, others express substantial concerns regarding screen time and reduced face-to-face interaction.

On the one hand, innovative learning platforms offer alternative perspectives and personalized learning pathways. Furthermore, adaptive systems enable learners to acknowledge their weaknesses and practice essential skills at their own pace. Consequently, students can achieve considerable progress in language acquisition.

On the other hand, over-reliance on automated tools can have detrimental consequences on interpersonal communication. For instance, collaborative discussions facilitate critical thinking, which cannot be entirely replicated by algorithms. Therefore, educational institutions must establish balanced policies that combine technology with human guidance.

In conclusion, while technological integration provides unprecedented opportunities, it is crucial to maintain personal pedagogical engagement. Only by implementing a comprehensive framework can we maximize the potential of modern education.
`.trim();

const SHORT_WEAK_ESSAY=`
Technology is good thing. I like computers because they are nice. It is a good thing for school.
`.trim();

test('analyzeEssayText evaluates word count, discourse markers, academic vocabulary, and complex grammar', ()=>{
  // 1. Comprehensive essay analysis
  const fullAnalysis=analyzeEssayText(SAMPLE_ESSAY,{minWords:150});
  assert.ok(fullAnalysis.wordCount>=150);
  assert.ok(fullAnalysis.paragraphCount>=3);
  assert.ok(fullAnalysis.detectedConnectors.length>=4);
  assert.ok(fullAnalysis.detectedConnectors.includes('however'));
  assert.ok(fullAnalysis.detectedConnectors.includes('furthermore'));
  assert.ok(fullAnalysis.detectedConnectors.includes('in conclusion'));
  assert.ok(fullAnalysis.academicVocabulary.length>=4);
  assert.ok(fullAnalysis.academicVocabulary.includes('significant'));
  assert.ok(fullAnalysis.academicVocabulary.includes('fundamental'));

  // All 4 CEFR dimensions should be solid
  const {metrics}=fullAnalysis;
  assert.ok(metrics.taskAchievement>=80);
  assert.ok(metrics.coherenceCohesion>=80);
  assert.ok(metrics.lexicalResource>=70);
  assert.ok(metrics.grammarAccuracy>=70);
  assert.ok(fullAnalysis.overallScore>=75);

  assert.ok(fullAnalysis.strengths.length>=3);
  assert.ok(fullAnalysis.feedback.includes('Key Strengths'));

  // 2. Short, weak essay analysis
  const weakAnalysis=analyzeEssayText(SHORT_WEAK_ESSAY,{minWords:150});
  assert.ok(weakAnalysis.wordCount<50);
  assert.ok(weakAnalysis.metrics.taskAchievement<40);
  assert.ok(weakAnalysis.areasForGrowth.some(a=>a.includes('Word count')));
  assert.ok(weakAnalysis.areasForGrowth.some(a=>a.includes('distinct paragraphs')));

  // 3. Empty input
  const emptyAnalysis=analyzeEssayText('',{minWords:150});
  assert.equal(emptyAnalysis.wordCount,0);
  assert.equal(emptyAnalysis.overallScore,0);
  assert.ok(emptyAnalysis.areasForGrowth.length>0);
});

test('mapAnalysisToRubric correctly matches CEFR metrics to task rubric criteria', ()=>{
  const analysis=analyzeEssayText(SAMPLE_ESSAY,{minWords:150});
  const criteriaString=`
    Task Achievement|25
    Coherence & Cohesion|25
    Lexical Resource|25
    Grammatical Range & Accuracy|25
  `.trim();

  const mapped=mapAnalysisToRubric(analysis,criteriaString,100);
  assert.equal(mapped.maxPoints,100);
  assert.ok(mapped.criteriaScores['Task Achievement']>18);
  assert.ok(mapped.criteriaScores['Coherence & Cohesion']>18);
  assert.ok(mapped.criteriaScores['Lexical Resource']>16);
  assert.ok(mapped.criteriaScores['Grammatical Range & Accuracy']>16);
  assert.ok(mapped.totalPoints>=75&&mapped.totalPoints<=100);

  // Single-score task without multi-criteria rubric
  const singleMapped=mapAnalysisToRubric(analysis,'',10);
  assert.equal(singleMapped.maxPoints,10);
  assert.ok(singleMapped.totalPoints>=7&&singleMapped.totalPoints<=10);
});

test('essayCopilot provides draft recommendations for teachers and rejects unauthorized actors', async ()=>{
  const f=await fixture();
  try{
    const student={id:'student1',role:'USER'};
    const teacher={id:'teacher1',role:'ADMIN'};
    const outsider={id:'outsider',role:'USER'};

    // Set up exam with an open Task item and multi-criteria rubric
    const criteria=`
      Task Achievement|25
      Coherence & Cohesion|25
      Lexical Resource|25
      Grammatical Range & Accuracy|25
    `.trim();

    f.sqlite.prepare(`
      INSERT INTO exam_materials(id,exam_id,block_id,position,type,content_json)
      VALUES(50,10,20,0,'task',?)
    `).run(JSON.stringify({
      id:50,
      type:'task',
      title:'Education and AI Essay',
      criteria,
      maxPoints:100,
      checkMode:'meaning'
    }));

    const assessment=new AssessmentService(f.db);
    // Student submits essay
    const answers={50:{0:SAMPLE_ESSAY}};
    const submission=await assessment.write(student,{
      kind:'exam-block',
      id:20,
      action:'submit',
      answers,
      expectedRevision:0
    });
    assert.equal(submission.saved,true);

    // 1. Student cannot request AI copilot recommendation (teacher review only)
    await assert.rejects(
      essayCopilot(f.db,{},student,{
        id:20,
        studentId:'student1',
        partId:50,
        index:0,
        expectedRevision:submission.revision
      }),
      err=>err.status===403
    );

    // 2. Outsider user cannot request recommendation
    await assert.rejects(
      essayCopilot(f.db,{},outsider,{
        id:20,
        studentId:'student1',
        partId:50,
        index:0,
        expectedRevision:submission.revision
      }),
      err=>err.status===403
    );

    // 3. Stale revision rejected with 409
    await assert.rejects(
      essayCopilot(f.db,{},teacher,{
        id:20,
        studentId:'student1',
        partId:50,
        index:0,
        expectedRevision:999
      }),
      err=>err.status===409
    );

    // 4. Authorized teacher receives CEFR draft suggestion
    const copilotResult=await essayCopilot(f.db,{},teacher,{
      id:20,
      studentId:'student1',
      partId:50,
      index:0,
      expectedRevision:submission.revision,
      targetMinWords:150
    });

    assert.equal(copilotResult.status,'recommended');
    assert.equal(copilotResult.requiresTeacher,true);
    assert.equal(copilotResult.revision,submission.revision);
    assert.ok(copilotResult.criteriaScores['Task Achievement']>18);
    assert.ok(copilotResult.criteriaScores['Coherence & Cohesion']>18);
    assert.ok(copilotResult.criteriaScores['Lexical Resource']>16);
    assert.ok(copilotResult.criteriaScores['Grammatical Range & Accuracy']>16);
    assert.ok(copilotResult.totalPoints>=75);
    assert.ok(copilotResult.strengths.length>=2);
    assert.ok(copilotResult.feedback.includes('Key Strengths'));
  }finally{
    f.sqlite.close();
  }
});
