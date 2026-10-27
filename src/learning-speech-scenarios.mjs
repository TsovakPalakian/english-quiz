import {StudyError,StudyService,statement as s,recordId,lessonAccess} from './learning-study.mjs';
import {kitSigned} from './learning-kits.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {validateSpeechRubric} from './speech-assessment.mjs';

export const DEFAULT_SHADOWING_RUBRIC=validateSpeechRubric({
  id:'standard-shadowing-v1',
  version:'v1',
  weights:{accuracy:0.4,fluency:0.4,prosody:0.2},
  scales:Object.fromEntries(['accuracy','fluency','prosody','grammar','vocabulary','task'].map(key=>[key,{min:0,max:100,direction:'higher'}])),
  minimumSeconds:1.0,
  findingConfidence:0.8,
  approvedBy:null
});

export function buildLessonSpeechScenario(block){
  if(!block||typeof block!=='object')return null;
  const type=block.type;
  let reference='',title=block.title||block.name||'',ipa=block.ipa||null;
  const hasAudio=Boolean(block.fileId||block.localMediaKey||block.hasFile||block.mediaId||(block.sample&&block.url));
  const audioUrl=block.fileId?`/api/media?fileId=${encodeURIComponent(block.fileId)}`:block.mediaId?`/local/media/${encodeURIComponent(block.mediaId)}`:block.url||null;

  if(type==='pronunciation'){
    reference=(block.word||block.text||block.ipa||'').trim();
    title=title||block.word||'Pronunciation';
  }else if(type==='audio'){
    reference=(block.transcript||block.text||block.caption||block.title||'').trim();
    title=title||'Audio phrase';
  }else if(type==='phrase'){
    reference=(block.phrase||block.text||'').trim();
    title=title||'Phrase';
  }else if(type==='word'||type==='wordcard'){
    reference=(block.en||block.word||'').trim();
    title=title||block.word||'Word';
  }else if(type==='text'&&block.audioShadowingEnabled){
    reference=(block.text||'').trim();
    title=title||'Text passage';
  }

  if(!reference)return null;

  const modes=[];
  if(hasAudio)modes.push('shadowing');
  modes.push('pronunciation');

  return {
    blockId:block.id,
    type,
    title,
    reference,
    ipa,
    hasAudio,
    audioUrl,
    modes
  };
}

export class LearningSpeechScenariosService extends StudyService {
  constructor(db,{rubrics=[],rubric=null,now=Date.now}={}){
    super(db);
    this.rubrics=rubrics.map(validateSpeechRubric);
    this.rubric=rubric?validateSpeechRubric(rubric):this.rubrics[0]||DEFAULT_SHADOWING_RUBRIC;
    this.now=now;
  }

  async checkAccess(actor,context){
    kitSigned(actor);
    recordId(context.groupId);
    recordId(context.lessonId);
    const staff=['ADMIN','DEVELOPER'].includes(actor?.role);
    const sql=`SELECT l.id FROM class_groups g
      JOIN class_group_lessons gl ON gl.group_id=g.id
      JOIN lessons l ON l.id=gl.lesson_id
      WHERE g.id=? AND l.id=? AND g.deleted_at IS NULL AND l.deleted_at IS NULL
      AND (?=1 OR (g.hidden_from_students=0 AND EXISTS(SELECT 1 FROM class_group_students gs WHERE gs.group_id=g.id AND gs.account_id=?)))
      AND ${lessonAccess}`;
    const [row]=await this.db.read(sql,[context.groupId,context.lessonId,+staff,actor.id,+staff,actor.id,actor.id]);
    if(!row)throw new StudyError(403,'This lesson is not available for this account.');
    return row;
  }

  async listLessonScenarios(actor,{groupId,lessonId}){
    await this.checkAccess(actor,{groupId,lessonId});
    const rows=await this.db.read(
      'SELECT id,position,type,tab,card_id,content_json FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL ORDER BY position,id',
      [lessonId]
    );
    const scenarios=[];
    for(const row of rows){
      let content={};
      try{content=JSON.parse(row.content_json||'{}');}catch{}
      const candidate=buildLessonSpeechScenario({id:row.id,type:row.type,...content});
      if(candidate&&candidate.modes.length)scenarios.push(candidate);
    }
    return {groupId,lessonId,scenarios};
  }

  async startLessonSpeechTask(actor,body){
    exactFields(body,['groupId','lessonId','blockId','mode','locale']);
    const {groupId,lessonId,blockId,mode,locale}=body;
    recordId(groupId);recordId(lessonId);recordId(blockId);
    if(!['shadowing','pronunciation'].includes(mode))throw new StudyError(400,'Invalid speech practice mode.');
    if(!['en-US','en-GB'].includes(locale))throw new StudyError(400,'Invalid speech locale.');

    await this.checkAccess(actor,{groupId,lessonId});
    const [blockRow]=await this.db.read(
      'SELECT id,type,card_id,content_json FROM lesson_blocks WHERE lesson_id=? AND id=? AND deleted_at IS NULL',
      [lessonId,blockId]
    );
    if(!blockRow)throw new StudyError(404,'Lesson block not found.');
    let content={};
    try{content=JSON.parse(blockRow.content_json||'{}');}catch{}
    const scenario=buildLessonSpeechScenario({id:blockRow.id,type:blockRow.type,...content});
    if(!scenario||!scenario.reference)throw new StudyError(400,'Speech practice requires reference text.');
    if(mode==='shadowing'&&!scenario.hasAudio)throw new StudyError(400,'Shadowing requires reference audio.');

    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`lesson-speech:${groupId}:${lessonId}:${blockId}:${mode}`)));
    digest[6]=(digest[6]&15)|128;digest[8]=(digest[8]&63)|128;
    const hex=[...digest.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const taskId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');

    const reference=reviewText(scenario.reference,2000);
    const prompt=mode==='shadowing'
      ?'Listen to the model audio and shadow the phrase simultaneously, matching its rhythm, pitch, and pauses.'
      :`Pronounce the text clearly: "${reference.slice(0,80)}"`;
    const referenceMediaId=scenario.hasAudio?(content.mediaId||content.fileId||`block-audio-${blockId}`):null;
    const rubric=this.rubric;

    const taskValue={
      mode,
      locale,
      prompt,
      reference,
      referenceMediaId,
      rubric,
      evaluation:'pronunciation',
      languageReview:false,
      level:null,
      maxSeconds:30,
      lessonBlockId:blockId,
      audioUrl:scenario.audioUrl||`/api/speech-scenarios?action=audio&groupId=${groupId}&lessonId=${lessonId}&blockId=${blockId}`
    };

    await this.db.atomic([
      s(
        'INSERT OR IGNORE INTO qr_speech_tasks(id,group_id,lesson_id,card_id,sense_id,author_id,created_at,value_json) VALUES(?,?,?,NULL,NULL,?,?,?)',
        [taskId,groupId,lessonId,actor.id,this.now(),JSON.stringify(taskValue)]
      )
    ]);

    return {
      taskId,
      id:taskId,
      groupId,
      lessonId,
      blockId,
      mode,
      locale,
      prompt,
      reference,
      referenceMediaId,
      audioUrl:taskValue.audioUrl,
      evaluation:'pronunciation',
      rubric:{id:rubric.id,version:rubric.version}
    };
  }

  async getLessonScenarioAudio(actor,{groupId,lessonId,blockId}){
    await this.checkAccess(actor,{groupId,lessonId});
    const [blockRow]=await this.db.read(
      'SELECT id,type,content_json FROM lesson_blocks WHERE lesson_id=? AND id=? AND deleted_at IS NULL',
      [lessonId,blockId]
    );
    if(!blockRow)throw new StudyError(404,'Lesson block not found.');
    let content={};
    try{content=JSON.parse(blockRow.content_json||'{}');}catch{}
    if(!content.fileId&&!content.localMediaKey&&!content.mediaId)throw new StudyError(404,'No audio file attached to this block.');
    return {
      blockId,
      fileId:content.fileId||null,
      localMediaKey:content.localMediaKey||null,
      mediaId:content.mediaId||null,
      name:content.name||'audio.mp3',
      mime:content.fileType||'audio/mpeg'
    };
  }
}
