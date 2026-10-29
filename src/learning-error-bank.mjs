import {StudyService,StudyError,statement as s} from './learning-study.mjs';
import {classifyError,synthesizeSubgroupDiagnostic,ERROR_TAGS,ERROR_CATEGORIES} from './learning-error-classifier.mjs';
import {analyzeTelemetry} from './learning-telemetry-analyzer.mjs';
import {
  FSRS_GRADES,
  DEFAULT_DESIRED_RETENTION,
  calculateRetrievability,
  calculateInterval,
  scheduleReview,
  previewIntervals
} from './fsrs-engine.mjs';

const fail=(status,message)=>{throw new StudyError(status,message);};
const ready=new WeakMap();

export const SRS_STAGES=Object.freeze({
  RECOGNITION:1,
  CUED_GAP:2,
  GENERATION:3,
  SPEECH:4
});

export const SRS_INTERVALS=Object.freeze({
  1:1,  // Day 1
  2:3,  // Day 3
  3:7,  // Day 7
  4:21  // Day 21
});

export {
  ERROR_TAGS,
  ERROR_CATEGORIES,
  FSRS_GRADES,
  DEFAULT_DESIRED_RETENTION,
  calculateRetrievability,
  calculateInterval,
  scheduleReview,
  previewIntervals
};

export class ErrorBankService extends StudyService {
  ensure(){
    if(!ready.has(this.db)){
      ready.set(this.db,(async()=>{
        await this.db.atomic([
          s(`CREATE TABLE IF NOT EXISTS account_error_items(
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
            error_category TEXT NOT NULL DEFAULT '',
            diagnostic_note TEXT NOT NULL DEFAULT '',
            stage INTEGER NOT NULL DEFAULT 1,
            interval_days INTEGER NOT NULL DEFAULT 1,
            next_review_at INTEGER NOT NULL,
            error_count INTEGER NOT NULL DEFAULT 1,
            success_streak INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            stability REAL NOT NULL DEFAULT 0.0,
            difficulty REAL NOT NULL DEFAULT 0.0,
            retrievability REAL NOT NULL DEFAULT 0.0,
            last_reviewed_at INTEGER NOT NULL DEFAULT 0,
            reps INTEGER NOT NULL DEFAULT 0,
            lapses INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT(unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
            UNIQUE(account_id, kind, material_id, part_id, question_index)
          )`),
          s('CREATE INDEX IF NOT EXISTS idx_error_items_queue ON account_error_items(account_id, status, next_review_at)'),
          s('CREATE INDEX IF NOT EXISTS idx_error_items_category ON account_error_items(account_id, error_tag, error_category)'),
          s('CREATE INDEX IF NOT EXISTS idx_error_items_retrievability ON account_error_items(account_id, status, retrievability)')
        ]);
        const cols=await this.db.read('PRAGMA table_info(account_error_items)');
        const colNames=new Set(cols.map(c=>c.name));
        const alters=[];
        if(!colNames.has('error_category'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN error_category TEXT NOT NULL DEFAULT ''"));
        if(!colNames.has('diagnostic_note'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN diagnostic_note TEXT NOT NULL DEFAULT ''"));
        if(!colNames.has('stability'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN stability REAL NOT NULL DEFAULT 0.0"));
        if(!colNames.has('difficulty'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN difficulty REAL NOT NULL DEFAULT 0.0"));
        if(!colNames.has('retrievability'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN retrievability REAL NOT NULL DEFAULT 0.0"));
        if(!colNames.has('last_reviewed_at'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN last_reviewed_at INTEGER NOT NULL DEFAULT 0"));
        if(!colNames.has('reps'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN reps INTEGER NOT NULL DEFAULT 0"));
        if(!colNames.has('lapses'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0"));
        if(!colNames.has('latency_ms'))alters.push(s("ALTER TABLE account_error_items ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0"));
        if(alters.length)await this.db.atomic(alters);
      })());
    }
    return ready.get(this.db);
  }

  async recordErrors(account,kind,materialId,questions,answers={},points={},meta={}){
    if(!account||!materialId||!questions?.length)return [];
    await this.ensure();
    const now=Math.floor(Date.now()/1000);
    const commands=[];
    const recorded=[];

    for(const q of questions){
      const partId=String(q.part.id);
      const index=Number(q.index);
      const score=points[partId]?.[index];
      const max=q.max||1;

      // Detect incorrect or sub-maximal responses
      if(score!=null&&Number(score)<max){
        const given=String(answers[partId]?.[index]??'');
        let expected=q.item?.answer!=null?String(q.item.answer):q.part?.allowedAnswers?String(q.part.allowedAnswers).split('/')[0].trim():'';
        if(q.item?.options&&Number.isInteger(Number(q.item?.answer))&&isNaN(Number(given))){
          expected=String(q.item.options[q.item.answer]||expected);
        }
        if(!expected&&q.item?.options&&q.item?.answer!=null)expected=String(q.item.options[q.item.answer]||'');
        const prompt=q.item?.prompt||q.part?.title||q.item?.left||q.part?.html||'Language item';

        const itemMeta=meta[partId]?.[index]||meta[`${partId}_${index}`]||meta[index]||{};
        const latencyMs=Number(itemMeta.latencyMs)||0;
        const hintUsed=itemMeta.hint||null;
        const options=q.item?.options||[];

        const classification=classifyError({
          prompt,
          expected,
          given,
          partType:q.part?.type||'gap',
          options,
          hint:hintUsed,
          latencyMs
        })||{
          tag:['text','vocab','cards'].includes(q.part?.type)?'vocabulary':'grammar',
          category:'general_grammar',
          note:''
        };

        const errorTag=classification.tag||'grammar';
        const errorCategory=classification.category||'';
        const diagnosticNote=classification.note||'';

        commands.push(s(`INSERT INTO account_error_items(
            account_id,material_id,kind,part_id,question_index,prompt,expected_answer,given_answer,
            error_tag,error_category,diagnostic_note,stage,interval_days,next_review_at,error_count,
            success_streak,status,stability,difficulty,retrievability,last_reviewed_at,reps,lapses,latency_ms,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,1,?,1,0,'active',0.4026,7.1949,1.0,?,1,1,?,?)
          ON CONFLICT(account_id,kind,material_id,part_id,question_index) DO UPDATE SET
            given_answer=excluded.given_answer,
            error_tag=excluded.error_tag,
            error_category=excluded.error_category,
            diagnostic_note=excluded.diagnostic_note,
            error_count=error_count+1,
            success_streak=0,
            stage=CASE WHEN stage>2 THEN 2 ELSE stage END,
            interval_days=1,
            next_review_at=?,
            status='active',
            lapses=lapses+1,
            reps=reps+1,
            last_reviewed_at=?,
            latency_ms=excluded.latency_ms,
            updated_at=?`,
          [account,materialId,kind,partId,index,prompt,expected,given,errorTag,errorCategory,diagnosticNote,now+86400,now,latencyMs,now,now+86400,now,now]
        ));
        recorded.push({partId,index,expected,given,errorTag,errorCategory,diagnosticNote,latencyMs});
      }
    }

    if(commands.length)await this.db.atomic(commands);
    return recorded;
  }

  async queue(actor,{limit=20,mode='due'}={}){
    if(!actor?.id)fail(401,'Sign in first.');
    await this.ensure();
    const now=Math.floor(Date.now()/1000);
    const maxLimit=Math.min(Number(limit)||20,50);

    let rows;
    if(mode==='fsrs_retrievability'){
      rows=await this.db.read(
        `SELECT id,material_id materialId,kind,part_id partId,question_index questionIndex,
                prompt,expected_answer expectedAnswer,given_answer givenAnswer,
                error_tag errorTag,error_category errorCategory,diagnostic_note diagnosticNote,
                stage,interval_days intervalDays,next_review_at nextReviewAt,error_count errorCount,
                success_streak successStreak,
                stability,difficulty,retrievability,last_reviewed_at lastReviewedAt,
                reps,lapses,latency_ms latencyMs
         FROM account_error_items
         WHERE account_id=? AND status='active'
         ORDER BY next_review_at ASC, id ASC LIMIT 200`,
        [actor.id]
      );
    }else{
      rows=await this.db.read(
        `SELECT id,material_id materialId,kind,part_id partId,question_index questionIndex,
                prompt,expected_answer expectedAnswer,given_answer givenAnswer,
                error_tag errorTag,error_category errorCategory,diagnostic_note diagnosticNote,
                stage,interval_days intervalDays,next_review_at nextReviewAt,error_count errorCount,
                success_streak successStreak,
                stability,difficulty,retrievability,last_reviewed_at lastReviewedAt,
                reps,lapses,latency_ms latencyMs
         FROM account_error_items
         WHERE account_id=? AND status='active' AND next_review_at<=?
         ORDER BY next_review_at ASC, id ASC LIMIT ?`,
        [actor.id,now,maxLimit]
      );
    }

    const processed=rows.map(item=>{
      const stage=item.stage||1;
      const elapsedDays = item.lastReviewedAt > 0 ? Math.max((now - item.lastReviewedAt) / 86400, 0) : 1;
      const currentR = item.stability > 0 ? calculateRetrievability(elapsedDays, item.stability) : 0;
      const intervals = previewIntervals(item, now);

      let card={
        ...item,
        stageName:stage===1?'recognition':stage===2?'cued_gap':stage===3?'generation':'speech',
        retrievability: Number(currentR.toFixed(4)),
        previewIntervals: intervals
      };

      if(stage===SRS_STAGES.RECOGNITION){
        // Stage 1: Recognition with distractor options
        card.exerciseType='choice';
        card.instruction='Identify the correct form';
        card.hint=item.givenAnswer?`Previous attempt: "${item.givenAnswer}"`:'';
      }else if(stage===SRS_STAGES.CUED_GAP){
        // Stage 2: Cued recall with first letter hint
        card.exerciseType='cued_gap';
        const firstChar=item.expectedAnswer ? item.expectedAnswer.trim()[0] : '';
        card.instruction='Complete the gap with the correct form';
        card.cuedHint=firstChar?`${firstChar}___`:'';
      }else if(stage===SRS_STAGES.GENERATION){
        // Stage 3: Sentence generation with target item
        card.exerciseType='generation';
        card.instruction=`Write a complete sentence demonstrating "${item.expectedAnswer}"`;
      }else if(stage===SRS_STAGES.SPEECH){
        // Stage 4: Spoken retrieval
        card.exerciseType='speech';
        card.instruction=`Pronounce the complete target phrase correctly`;
        card.targetPhrase=item.prompt.includes('___')?item.prompt.replace('___',item.expectedAnswer):item.expectedAnswer;
      }

      return card;
    });

    if(mode==='fsrs_retrievability'){
      processed.sort((a,b)=>{
        if(a.retrievability!==b.retrievability)return a.retrievability-b.retrievability;
        if(a.nextReviewAt!==b.nextReviewAt)return a.nextReviewAt-b.nextReviewAt;
        return a.id-b.id;
      });
      return processed.slice(0,maxLimit);
    }

    return processed;
  }

  async submitReview(actor,{itemId,word,expectedAnswer,prompt,answer,grade,latencyMs,telemetry,desiredRetention,kind,materialId,partId,questionIndex}){
    if(!actor?.id)fail(401,'Sign in first.');
    await this.ensure();
    if(!itemId&&!word&&!expectedAnswer&&!prompt)fail(400,'Item identifier or word is required.');
    if(answer==null&&grade==null)fail(400,'Answer or grade is required.');

    let item;
    if(itemId){
      const rows=await this.db.read(
        `SELECT * FROM account_error_items WHERE id=? AND account_id=?`,
        [itemId,actor.id]
      );
      item=rows[0];
    }else{
      const target=String(expectedAnswer||word||prompt||'').trim().toLowerCase();
      const rows=await this.db.read(
        `SELECT * FROM account_error_items WHERE account_id=? AND (LOWER(expected_answer)=? OR LOWER(prompt)=?) ORDER BY id DESC LIMIT 1`,
        [actor.id,target,target]
      );
      item=rows[0];
    }

    let assignedGrade=grade!=null?Math.min(Math.max(Number(grade)||3,1),4):null;
    let correct=assignedGrade!=null?assignedGrade>FSRS_GRADES.AGAIN:false;

    if(!item){
      if(!correct){
        const targetPrompt=String(prompt||word||expectedAnswer||'Language item');
        const targetExpected=String(expectedAnswer||word||'');
        const targetGiven=String(answer||'');
        const recorded=await this.recordErrors(actor.id,kind||'quiz',materialId||1,[
          {part:{id:partId||'quiz',type:'quiz'},index:questionIndex||0,max:1,item:{prompt:targetPrompt,answer:targetExpected}}
        ],{[partId||'quiz']:{[questionIndex||0]:targetGiven}},{[partId||'quiz']:{[questionIndex||0]:0}},{
          [partId||'quiz']:{[questionIndex||0]:{latencyMs:Number(latencyMs)||0}}
        });
        return {ok:true,created:true,grade:assignedGrade||FSRS_GRADES.AGAIN,recorded};
      }
      return {ok:true,untracked:true};
    }

    if(answer!=null){
      const normalizedAnswer=String(answer).trim().toLowerCase().replace(/[.,!?;:]/g,'');
      const expectedNormalized=String(item.expected_answer).trim().toLowerCase().replace(/[.,!?;:]/g,'');

      if(item.stage===SRS_STAGES.RECOGNITION||item.stage===SRS_STAGES.CUED_GAP){
        correct=normalizedAnswer===expectedNormalized || (expectedNormalized && normalizedAnswer.includes(expectedNormalized));
      }else if(item.stage===SRS_STAGES.GENERATION){
        // Generation must contain the target expected form and meet minimum length
        correct=normalizedAnswer.includes(expectedNormalized)&&normalizedAnswer.split(/\s+/).length>=3;
      }else if(item.stage===SRS_STAGES.SPEECH){
        // Speech recall verification
        correct=normalizedAnswer===expectedNormalized || normalizedAnswer.length>0;
      }

      if(assignedGrade==null){
        assignedGrade=correct?FSRS_GRADES.GOOD:FSRS_GRADES.AGAIN;
      }
    }else{
      correct=assignedGrade>FSRS_GRADES.AGAIN;
    }

    const now=Math.floor(Date.now()/1000);
    const fsrsResult=scheduleReview({
      stability:item.stability,
      difficulty:item.difficulty,
      reps:item.reps,
      lapses:item.lapses,
      lastReviewedAt:item.last_reviewed_at
    },assignedGrade,now,{desiredRetention});

    let nextStage=item.stage;
    let nextInterval;
    let nextReviewAt;
    let newStatus=item.status;
    let newStreak=item.success_streak;

    if(correct){
      newStreak+=1;
      if(item.stage>=SRS_STAGES.SPEECH){
        // Mastered after passing all 4 stages
        newStatus='mastered';
        nextInterval=grade!=null?fsrsResult.intervalDays:SRS_INTERVALS[4];
        nextReviewAt=now+nextInterval*86400;
      }else{
        nextStage=item.stage+1;
        nextInterval=grade!=null?fsrsResult.intervalDays:(SRS_INTERVALS[nextStage]||(item.interval_days*2));
        nextReviewAt=now+nextInterval*86400;
      }
    }else{
      // Demote stage and reset interval on mistake
      newStreak=0;
      nextStage=Math.max(1,item.stage-1);
      nextInterval=grade!=null?fsrsResult.intervalDays:1;
      nextReviewAt=now+nextInterval*86400;
    }

    const telemetryAnalysis = analyzeTelemetry({
      latencyMs: latencyMs != null ? latencyMs : telemetry?.latencyMs,
      activeFocusMs: telemetry?.activeFocusMs,
      firstInteractionMs: telemetry?.firstInteractionMs,
      ok: correct,
      hintUsed: Boolean(telemetry?.hintUsed),
      distractorsClicked: telemetry?.distractorsClicked
    });
    const recordedLatency = telemetryAnalysis.effectiveLatencyMs || Number(latencyMs) || item.latency_ms || 0;

    await this.db.atomic([
      s(`UPDATE account_error_items
         SET stage=?,interval_days=?,next_review_at=?,status=?,success_streak=?,
             error_count=error_count+?,stability=?,difficulty=?,retrievability=?,
             last_reviewed_at=?,reps=?,lapses=?,latency_ms=?,updated_at=?
         WHERE id=? AND account_id=?`,
        [
          nextStage,nextInterval,nextReviewAt,newStatus,newStreak,
          correct?0:1,fsrsResult.stability,fsrsResult.difficulty,fsrsResult.retrievability,
          now,fsrsResult.reps,fsrsResult.lapses,recordedLatency,now,
          item.id,actor.id
        ]
      )
    ]);

    return {
      itemId:item.id,
      correct,
      grade:assignedGrade,
      stage:nextStage,
      intervalDays:nextInterval,
      nextReviewAt,
      status:newStatus,
      expected:item.expected_answer,
      stability:fsrsResult.stability,
      difficulty:fsrsResult.difficulty,
      retrievability:fsrsResult.retrievability,
      reps:fsrsResult.reps,
      lapses:fsrsResult.lapses,
      telemetry:telemetryAnalysis
    };
  }

  async stats(actor){
    if(!actor?.id)fail(401,'Sign in first.');
    await this.ensure();
    const now=Math.floor(Date.now()/1000);
    const [counts]=await this.db.read(
      `SELECT
         COUNT(*) totalErrors,
         SUM(CASE WHEN status='active' AND next_review_at<=? THEN 1 ELSE 0 END) dueToday,
         SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) activeItems,
         SUM(CASE WHEN status='mastered' THEN 1 ELSE 0 END) masteredItems,
         MAX(success_streak) maxStreak,
         AVG(CASE WHEN status='active' AND stability>0 THEN stability ELSE NULL END) avgStability,
         AVG(CASE WHEN status='active' AND difficulty>0 THEN difficulty ELSE NULL END) avgDifficulty
       FROM account_error_items
       WHERE account_id=?`,
      [now,actor.id]
    );

    return {
      totalErrors:counts?.totalErrors||0,
      dueToday:counts?.dueToday||0,
      activeItems:counts?.activeItems||0,
      masteredItems:counts?.masteredItems||0,
      maxStreak:counts?.maxStreak||0,
      avgStability:counts?.avgStability ? Number(counts.avgStability.toFixed(2)) : 0,
      avgDifficulty:counts?.avgDifficulty ? Number(counts.avgDifficulty.toFixed(2)) : 0
    };
  }

  async subgroupDiagnostic(actor,{groupId}){
    if(!actor?.id)fail(401,'Sign in first.');
    if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher review only.');
    const gid=Number(groupId);
    if(!Number.isSafeInteger(gid)||gid<=0)fail(400,'Valid group ID is required.');

    // IDOR Check: Ensure teacher is assigned to this group (developers have full access)
    if(actor.role==='ADMIN'){
      let assigned=false;
      const docs=await this.db.read("SELECT key,value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key=?",[String(gid)]);
      if(docs.length){
        try{
          const val=JSON.parse(docs[0].value_json);
          assigned=(val.teacherIds||[]).includes(actor.id);
        }catch{}
      }
      if(!assigned)fail(403,'Forbidden: Not assigned to this group.');
    }

    await this.ensure();
    const items=await this.db.read(
      `SELECT id,account_id accountId,material_id materialId,kind,part_id partId,
              question_index questionIndex,prompt,expected_answer expectedAnswer,
              given_answer givenAnswer,error_tag errorTag,error_category errorCategory,
              diagnostic_note diagnosticNote,stage,status,updated_at updatedAt
       FROM account_error_items
       WHERE account_id IN (SELECT account_id FROM class_group_students WHERE group_id=?)
       ORDER BY updated_at DESC LIMIT 500`,
      [gid]
    );

    return synthesizeSubgroupDiagnostic(items,{groupId:gid});
  }
}
