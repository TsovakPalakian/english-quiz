// Derived coverage and lifecycle extensions. Existing review/generation remain authoritative.
import {StudyError,statement as s,recordId,cardAccess,accessArgs,QUIZ_TYPES} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export const kitSigned=actor=>{if(!actor?.id||!['USER','ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)fail(401,'Active account required.');};
export const kitTeacher=actor=>{kitSigned(actor);if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher access required.');};
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const defaults=()=>({level:null,forms:[],examples:[],source:null});
const contextTypes=new Set(['Match','Memory','Select all','Odd one out']);
export function validateSenseMetadata(value){
  exactFields(value,['level','forms','examples','source']);
  if(![null,'A1','A2','B1','B2','C1','C2'].includes(value.level)||!Array.isArray(value.forms)||value.forms.length>30||!Array.isArray(value.examples)||value.examples.length>20)fail(400,'Invalid meaning metadata.');
  const forms=value.forms.map(form=>reviewText(form,200));if(new Set(forms.map(form=>form.toLowerCase())).size!==forms.length)fail(400,'Duplicate forms.');
  const examples=value.examples.map(example=>{exactFields(example,['en','translation']);return {en:reviewText(example.en),translation:reviewText(example.translation)};});
  let source=null;
  if(value.source!==null){exactFields(value.source,['title','url','license']);source={title:reviewText(value.source.title,200),url:reviewText(value.source.url,1000),license:reviewText(value.source.license,500)};
    try{const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{fail(400,'Use an HTTPS source without credentials.');}}
  return {level:value.level,forms,examples,source};
}
export class LearningKits{
  constructor(review,{generation=null,availability=async()=>({enabled:false,remaining:null})}={}){
    if(!review.extendedLifecycle)fail(503,'Extended quiz lifecycle is not enabled.');
    this.review=review;this.db=review.db;this.generation=generation;this.availability=availability;
  }
  async card(actor,id){kitSigned(actor);recordId(id);const [card]=await this.db.read(`SELECT c.id,c.scope FROM cards c WHERE c.id=? AND c.deleted_at IS NULL AND ${cardAccess}`,[id,...accessArgs(actor)]);if(!card)fail(404,'Card not available.');return card;}
  cardGuard(actor,id){return s(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM cards c WHERE c.id=? AND c.deleted_at IS NULL AND ${cardAccess})`,[id,...accessArgs(actor)]);}
  async metadata(senseId){const [row]=await this.db.read('SELECT * FROM qr_sense_metadata WHERE sense_id=?',[senseId]);return {revision:row?.revision||0,...(row?JSON.parse(row.value_json):defaults())};}
  async senses(actor,cardId){await this.card(actor,cardId);const rows=await this.db.read(`SELECT m.id,m.en,m.translation,m.definition,m.part_of_speech FROM qr_senses m JOIN qr_card_senses cs ON cs.sense_id=m.id WHERE cs.card_id=? ORDER BY m.id`,[cardId]);
    return Promise.all(rows.map(async row=>({...row,metadata:await this.metadata(row.id)})));}
  async setMetadata(actor,body){
    kitTeacher(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','expectedRevision','metadata']);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'Use the current metadata revision.');
    const value=validateSenseMetadata(body.metadata);await this.review.checkContext(actor,body);
    return this.review.mutation(actor,body,['sense-metadata',body.senseId],async()=>({statements:[this.review.accessGuard(actor,body),
      body.expectedRevision===0?s('INSERT INTO qr_sense_metadata(sense_id,revision,value_json) VALUES(?,1,?)',[body.senseId,JSON.stringify(value)]):s('UPDATE qr_sense_metadata SET revision=revision+1,value_json=? WHERE sense_id=? AND revision=?',[JSON.stringify(value),body.senseId,body.expectedRevision]),this.review.guard(),
      s('INSERT INTO qr_sense_metadata_events(sense_id,revision,actor_id,value_json,changed_at) VALUES(?,?,?,?,?)',[body.senseId,body.expectedRevision+1,actor.id,JSON.stringify(value),Date.now()])],result:{revision:body.expectedRevision+1,...value}}));
  }
  async coverage(actor,{cardId,senseId=null,groupId=null,lessonId=null}){
    const card=await this.card(actor,cardId),senses=await this.senses(actor,cardId);
    if(!senseId&&senses.length===1)senseId=senses[0].id;
    const meaning=senses.find(row=>row.id===senseId);
    if(!meaning){if(senseId)fail(400,'Select a meaning explicitly linked to this card.');return {senses,selectionRequired:true,types:[],counts:null,meaning:null};}
    const teacher=['ADMIN','DEVELOPER'].includes(actor.role),context=groupId!==null&&lessonId!==null&&card.scope==='shared'?{groupId,lessonId,cardId,senseId}:null;
    if(context)await this.review.checkContext(actor,context);
    const shared=(await this.review.sharedForCard(actor,cardId)).filter(q=>q.senseId===senseId);
    const proposals=await this.db.read(`SELECT id,type,state FROM qr_versions WHERE sense_id=? AND state<>'approved' ${teacher?'':'AND author_id=?'}`,[senseId,...(teacher?[]:[actor.id])]);
    const jobs=teacher&&context?await this.db.read('SELECT * FROM qr_generation_jobs WHERE group_id=? AND lesson_id=? AND card_id=? AND sense_id=?',[groupId,lessonId,cardId,senseId]):[];
    const withdrawn=await this.db.read(`SELECT DISTINCT q.type FROM qr_versions q JOIN qr_publication p ON p.version_id=q.id AND p.available=0 WHERE q.sense_id=? AND q.state='approved'`,[senseId]);
    let policy={enabled:false,remaining:null};if(teacher&&context){try{policy=await this.availability();}catch{policy={enabled:false,remaining:null,unavailable:true};}}
    const audioReady=this.review.mediaQuizzes&&shared.some(q=>q.type==='Listen'&&q.mediaReady);
    const types=[...QUIZ_TYPES,...(this.review.mediaQuizzes?['Video choice']:[])].map(type=>{
      const ready=shared.filter(q=>q.type===type),pending=proposals.filter(q=>q.type===type),job=jobs.find(q=>q.type===type);
      let status='missing',reason='not_generated';
      if(ready.length){status='ready';reason=null;}
      else if(pending.length){status=pending.some(q=>q.state==='submitted')?'pending_review':'needs_changes';reason=pending.some(q=>q.state==='returned')?'returned':null;}
      else if(job&&['queued','retry','running'].includes(job.state)){status='preparing';reason=null;}
      else if(withdrawn.some(q=>q.type===type)){status='needs_changes';reason='withdrawn_template';}
      else if(contextTypes.has(type))reason='word_set_required';
      else if(type==='Listen')reason='audio_required';
      else if(type==='Video choice')reason='video_required';
      else if(job?.state==='review'){status='failed';reason=job.issue||'preparation_failed';}
      // Legacy Listen JSON contains a word, not a validated playable audio asset.
      if(type==='Listen'&&ready.length&&!audioReady){status='missing';reason='audio_required';}
      if(['missing','failed'].includes(status)&&reason!=='word_set_required'&&reason!=='audio_required'&&teacher&&context){
        if(policy.unavailable)reason='quota_unavailable';else if(!policy.enabled)reason='provider_not_configured';else if(policy.remaining===0)reason='quota_exceeded';
      }
      const canPrepare=teacher&&!!context&&policy.enabled&&policy.remaining>0&&['missing','failed'].includes(status)&&!contextTypes.has(type)&&!['Listen','Video choice'].includes(type)&&(!job||job.state==='review'&&!job.version_id&&job.cycle<2);
      return {type,status,reason,approvedCount:ready.length,proposalCount:pending.length,canPrepare:!!canPrepare,
        versionIds:ready.map(q=>q.id),...(teacher?{jobId:job?.id||null,proposalIds:pending.map(q=>q.id)}:{})};
    });
    const library=teacher?await this.db.read(`SELECT q.id,q.type,q.family_id AS familyId,q.version,q.author_name AS author,q.author_group AS authorGroup,q.created_date AS date,
      COALESCE(p.revision,0) AS publicationRevision,COALESCE(p.available,1) AS available,
      NOT EXISTS(SELECT 1 FROM qr_versions newer WHERE newer.family_id=q.family_id AND newer.state='approved' AND newer.version>q.version) AS current
      FROM qr_versions q LEFT JOIN qr_publication p ON p.version_id=q.id
      WHERE q.sense_id=? AND q.state='approved' ORDER BY q.type,q.family_id,q.version DESC LIMIT 100`,[senseId]):[];
    const baseTypes=types.filter(row=>QUIZ_TYPES.includes(row.type));
    return {senses,meaning,library,selectionRequired:false,types:baseTypes,additionalTypes:types.filter(row=>!QUIZ_TYPES.includes(row.type)),counts:{total:QUIZ_TYPES.length,ready:baseTypes.filter(t=>t.status==='ready').length,pending:baseTypes.filter(t=>['pending_review','needs_changes'].includes(t.status)).length,preparing:baseTypes.filter(t=>t.status==='preparing').length,missing:baseTypes.filter(t=>t.status==='missing').length,failed:baseTypes.filter(t=>t.status==='failed').length}};
  }
  async fill(actor,body){
    kitTeacher(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','types']);if(!uuid(body.mutationId)||!this.generation)fail(400,'Invalid preparation request.');
    await this.review.checkContext(actor,body);
    return this.generation.enqueue(actor,body,{skipProposals:true,retryFailed:true,excludeTypes:[...contextTypes,'Listen'],beforeEnqueue:async()=>{
      let policy;try{policy=await this.availability();}catch{fail(503,'Preparation settings unavailable.');}
      if(!policy.enabled||policy.remaining<1)fail(409,'Generation is off or its shared quota is exhausted.');
    }});
  }
  async queue(actor,{limit=50,offset=0}={}){
    kitTeacher(actor);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail(400,'Invalid coverage page.');
    const contexts=await this.db.read(`SELECT DISTINCT g.id AS groupId,l.id AS lessonId,c.id AS cardId,cs.sense_id AS senseId,g.title AS groupName,l.title AS lessonName,c.en AS word
      FROM class_groups g JOIN class_group_lessons gl ON gl.group_id=g.id JOIN lessons l ON l.id=gl.lesson_id
      JOIN lesson_blocks b ON b.lesson_id=l.id AND b.type IN ('word','wordcard') AND b.deleted_at IS NULL JOIN cards c ON c.id=b.card_id
      JOIN qr_card_senses cs ON cs.card_id=c.id WHERE g.deleted_at IS NULL AND l.deleted_at IS NULL AND c.deleted_at IS NULL AND c.scope='shared'
      ORDER BY g.id,l.id,c.id,cs.sense_id LIMIT ? OFFSET ?`,[limit+1,offset]);
    const rows=[];for(const context of contexts.slice(0,limit)){const data=await this.coverage(actor,context);rows.push({...context,types:data.types,counts:data.counts});}
    return {rows,nextOffset:contexts.length>limit?offset+limit:null};
  }
  async publication(actor,id,body){
    kitTeacher(actor);exactFields(body,['mutationId','expectedRevision','available','reason']);
    if(typeof body.available!=='boolean'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'Invalid publication revision.');
    const reason=reviewText(body.reason,1000),q=await this.review.version(id);await this.review.access(actor,q);if(q.state!=='approved')fail(409,'Only approved versions have publication settings.');
    return this.review.mutation(actor,body,['publication',id],async()=>({statements:[this.review.accessGuard(actor,{groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,senseId:q.sense_id}),
      body.expectedRevision===0?s('INSERT INTO qr_publication(version_id,revision,available) VALUES(?,1,?)',[id,+body.available]):s('UPDATE qr_publication SET revision=revision+1,available=? WHERE version_id=? AND revision=?',[+body.available,id,body.expectedRevision]),this.review.guard(),
      s('INSERT INTO qr_publication_events(version_id,revision,available,actor_id,reason,changed_at) VALUES(?,?,?,?,?,?)',[id,body.expectedRevision+1,+body.available,actor.id,reason,Date.now()])],result:{revision:body.expectedRevision+1,available:body.available}}));
  }
  async opinions(actor,id){kitTeacher(actor);const q=await this.review.version(id);await this.review.access(actor,q);
    return this.db.read(`SELECT o.id,o.content_revision AS revision,o.requester_id AS requesterId,o.comment,o.created_at AS createdAt,d.reviewer_id AS reviewerId,d.decision,d.comment AS response
      FROM qr_opinions o LEFT JOIN qr_opinion_decisions d ON d.opinion_id=o.id WHERE o.version_id=? ORDER BY o.created_at,o.id`,[id]);}
  async requestOpinion(actor,id,body){
    kitTeacher(actor);exactFields(body,['mutationId','expectedRevision','comment']);const comment=reviewText(body.comment,2000);
    return this.review.mutation(actor,body,['opinion',id],async()=>{const q=await this.review.version(id);await this.review.access(actor,q);if(q.state!=='submitted'||q.revision!==body.expectedRevision)fail(409,'Select the current submitted version.');const opinionId=crypto.randomUUID();
      return {statements:[this.review.accessGuard(actor,{groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,senseId:q.sense_id}),s(`INSERT INTO qr_opinions(id,version_id,content_revision,requester_id,comment,created_at)
        SELECT ?,id,revision,?,?,? FROM qr_versions WHERE id=? AND revision=? AND state='submitted'`,[opinionId,actor.id,comment,Date.now(),id,body.expectedRevision]),this.review.guard()],result:{id:opinionId}};});
  }
  async decideOpinion(actor,id,body){
    kitTeacher(actor);exactFields(body,['mutationId','expectedRevision','opinionId','decision','comment']);if(!uuid(body.opinionId)||!['confirm','needs_changes'].includes(body.decision))fail(400,'Invalid opinion decision.');const comment=reviewText(body.comment,2000);
    return this.review.mutation(actor,body,['opinion-decision',id],async()=>{const q=await this.review.version(id);await this.review.access(actor,q);
      if(q.state!=='submitted'||q.revision!==body.expectedRevision||q.author_id===actor.id)fail(409,'An independent teacher must review the current version.');
      return {statements:[this.review.accessGuard(actor,{groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,senseId:q.sense_id}),s(`INSERT INTO qr_opinion_decisions(opinion_id,reviewer_id,decision,comment,created_at)
        SELECT o.id,?,?,?,? FROM qr_opinions o JOIN qr_versions q ON q.id=o.version_id
        WHERE o.id=? AND o.version_id=? AND o.requester_id<>? AND o.content_revision=? AND q.revision=? AND q.state='submitted'`,[actor.id,body.decision,comment,Date.now(),body.opinionId,id,actor.id,body.expectedRevision,body.expectedRevision]),this.review.guard()],result:{decision:body.decision}};});
  }
}
