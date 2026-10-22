// Isolated foundation. Not imported by Workers, UI or deployment builders.
// actor comes from trusted authentication, never a JSON request body.
import {StudyService,StudyError,statement as s,recordId,lessonAccess,cardAccess,accessArgs} from './learning-study.mjs';
import {exactFields,reviewText,validateReviewContent} from './quiz-review-content.mjs';
import {validateGenerationMetadata} from './quiz-generation-metadata.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const signed=actor=>{if(!actor?.id||!['USER','ADMIN','DEVELOPER'].includes(actor.role)||actor.active===false||actor.active===0||actor.revoked)fail(401,'Sign in with an active account.');};
const teacher=actor=>{signed(actor);if(!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher access required.');};
const developer=actor=>{signed(actor);if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');};
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yerevan',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const name=actor=>reviewText(actor.name||actor.login||actor.id,200);
const uuid=()=>crypto.randomUUID();
const key=value=>{if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))fail(400,'Invalid review identity.');return value;};
const revision=value=>{if(!Number.isSafeInteger(value)||value<1)fail(400,'A current expectedRevision is required.');return value;};
const reviewAccess=`? IN ('ADMIN','DEVELOPER')`;
function context(actor,value){
  [value.groupId,value.lessonId,value.cardId].forEach(recordId);key(value.senseId);
  let sql=`SELECT c.id AS card_id,g.title AS group_name,l.title AS lesson_name FROM class_groups g
    JOIN class_group_lessons gl ON gl.group_id=g.id JOIN lessons l ON l.id=gl.lesson_id
    JOIN lesson_blocks b ON b.lesson_id=l.id AND b.card_id=? AND b.type IN ('word','wordcard') AND b.deleted_at IS NULL
    JOIN cards c ON c.id=b.card_id JOIN qr_card_senses cs ON cs.card_id=c.id AND cs.sense_id=?
    WHERE g.id=? AND l.id=? AND g.deleted_at IS NULL AND l.deleted_at IS NULL AND c.deleted_at IS NULL AND c.scope='shared'`;
  const args=[value.cardId,value.senseId,value.groupId,value.lessonId];
  if(actor.role==='USER'){
    sql+=` AND g.hidden_from_students=0 AND EXISTS(SELECT 1 FROM class_group_students gs WHERE gs.group_id=g.id AND gs.account_id=?) AND ${lessonAccess} AND ${cardAccess}`;
    args.push(actor.id,0,actor.id,actor.id,...accessArgs(actor));
  }else{sql+=' AND '+reviewAccess;args.push(actor.role);}
  return {sql,args};
}
const origin=q=>({cardId:q.card_id,senseId:q.sense_id,groupId:q.group_id,lessonId:q.lesson_id});
const dto=q=>({id:q.id,familyId:q.family_id,parentId:q.parent_id,version:q.version,revision:q.revision,senseId:q.sense_id,type:q.type,content:JSON.parse(q.content_json),generation:q.generation_json?JSON.parse(q.generation_json):null,state:q.state,author:{id:q.author_id,kind:q.author_kind,name:q.author_name,group:q.author_group,date:q.created_date},groupId:q.group_id,lessonId:q.lesson_id,cardId:q.card_id,submittedDate:q.submitted_date,feedback:q.feedback,reviewer:q.reviewer_id?{id:q.reviewer_id,name:q.reviewer_name,date:q.approved_date}:null});
export class QuizReviewService extends StudyService{
  constructor(db,{allowGlobalApproval=false,extendedLifecycle=false,mediaQuizzes=false,contentPolicy=null}={}){super(db);this.allowGlobalApproval=allowGlobalApproval===true;this.extendedLifecycle=extendedLifecycle===true;this.mediaQuizzes=mediaQuizzes===true;this.contentPolicy=contentPolicy;}
  validateContent(type,content){return validateReviewContent(type,content,{mediaQuizzes:this.mediaQuizzes});}
  async mediaGuards(actor,context,type,content){
    if(!this.mediaQuizzes)return [];
    if(!this.contentPolicy)fail(503,'Validated quiz media is not configured.');
    return this.contentPolicy.validate(actor,context,type,content);
  }
  async projection(q){const value=dto(q);if(this.mediaQuizzes&&this.contentPolicy)value.mediaSources=await this.contentPolicy.summaries(value.content);return value;}
  async mutation(actor,body,identity,build){
    signed(actor);
    try{return await this.mutate(actor,body,['quiz-review',...identity],build,{personal:true});}
    catch(error){if(error instanceof StudyError)throw error;if(/constraint|immutable|append only/i.test(error.message))fail(409,'The review changed. Reload before retrying.');throw error;}
  }
  accessGuard(actor,value){const c=context(actor,value);return s('INSERT INTO mutation_guard SELECT EXISTS('+c.sql+')',c.args);}
  async checkContext(actor,value){const c=context(actor,value),[row]=await this.db.read(c.sql,c.args);if(!row)fail(403,'This lesson word is not available for this account.');return row;}
  async version(id){key(id);const [q]=await this.db.read('SELECT * FROM qr_versions WHERE id=?',[id]);if(!q)fail(404,'Quiz version not found.');return q;}
  async access(actor,q){
    signed(actor);await this.checkContext(actor,origin(q));
    if(actor.role==='USER'&&q.author_id!==actor.id)fail(403,'Only your own proposals are available here.');
  }
  event(q,actor,action,details){return s('INSERT INTO qr_events(id,version_id,revision,action,actor_id,actor_name,event_date,details_json) VALUES(?,?,?,?,?,?,?,?)',[uuid(),q.id,q.revision,action,actor.id,name(actor),date(),JSON.stringify(details)]);}
  async createSense(actor,body){
    developer(actor);exactFields(body,['mutationId','cardId','meaning']);recordId(body.cardId);exactFields(body.meaning,['partOfSpeech','translation','definition']);
    const pos=reviewText(body.meaning.partOfSpeech,100),translation=reviewText(body.meaning.translation,2000),definition=reviewText(body.meaning.definition,2000);
    return this.mutation(actor,body,['sense',body.cardId],async()=>{
      const [card]=await this.db.read("SELECT en,word_key FROM cards WHERE id=? AND scope='shared' AND deleted_at IS NULL",[body.cardId]);if(!card)fail(404,'Choose an existing shared card.');
      const id=uuid();return {statements:[s('INSERT INTO qr_senses(id,en,word_key,part_of_speech,translation,definition,created_by,created_date) VALUES(?,?,?,?,?,?,?,?)',[id,card.en,card.word_key,pos,translation,definition,actor.id,date()]),s('INSERT INTO qr_card_senses(card_id,sense_id) SELECT id,? FROM cards WHERE id=? AND scope=\'shared\' AND deleted_at IS NULL',[id,body.cardId]),this.guard()],result:{senseId:id,cardId:body.cardId}};
    });
  }
  async linkCard(actor,body){
    developer(actor);exactFields(body,['mutationId','cardId','senseId']);recordId(body.cardId);key(body.senseId);
    return this.mutation(actor,body,['sense-link',body.cardId],async()=>({statements:[s(`INSERT INTO qr_card_senses(card_id,sense_id) SELECT c.id,m.id FROM cards c JOIN qr_senses m ON m.id=?
      WHERE c.id=? AND c.deleted_at IS NULL AND lower(trim(c.en))=lower(trim(m.en))`,[body.senseId,body.cardId]),this.guard()],result:{cardId:body.cardId,senseId:body.senseId}}));
  }
  async createDraft(actor,body){
    return this.#newDraft(actor,actor,body,'human');
  }
  async createGeneratedDraft(worker,requester,body,{guards=[]}={}){
    developer(worker);signed(requester);return this.#newDraft(worker,requester,body,'automatic',guards);
  }
  async #newDraft(actor,requester,body,kind,guards=[]){
    signed(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId','type','content',...(kind==='automatic'?['generation']:[])]);const content=this.validateContent(body.type,body.content);
    const generation=body.generation===undefined?null:validateGenerationMetadata(body.generation);
    const state=kind==='automatic'?'submitted':'draft';
    return this.mutation(actor,body,['create',kind,requester.id],async()=>{
      const ctx=await this.checkContext(requester,body),id=uuid(),q={id,revision:1};
      return {statements:[this.accessGuard(requester,body),...guards,...await this.mediaGuards(actor,body,body.type,content),s(`INSERT INTO qr_versions(id,family_id,version,sense_id,type,content_json,state,author_id,author_kind,generation_json,author_name,author_group,group_id,lesson_id,card_id,created_date,submitted_date)
        VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,id,body.senseId,body.type,JSON.stringify(content),state,actor.id,kind,generation?JSON.stringify(generation):null,kind==='automatic'?'Automatic generator':name(actor),ctx.group_name,body.groupId,body.lessonId,body.cardId,date(),kind==='automatic'?date():null]),this.guard(),this.event(q,actor,kind==='automatic'?'generated-for-review':'created',{content,requestedBy:requester.id,...(generation?{generation}:{})})],result:{id,version:1,revision:1,state}};
    });
  }
  async editDraft(actor,id,body){
    signed(actor);key(id);exactFields(body,['mutationId','expectedRevision','content']);revision(body.expectedRevision);
    return this.mutation(actor,body,['edit',id],async()=>{
      const q=await this.version(id);await this.access(actor,q);
      if(q.author_id!==actor.id||!['draft','returned'].includes(q.state))fail(403,'Only the author can edit a draft or returned version.');
      const content=this.validateContent(q.type,body.content),next=body.expectedRevision+1;
      return {statements:[this.accessGuard(actor,origin(q)),...await this.mediaGuards(actor,origin(q),q.type,content),s("UPDATE qr_versions SET content_json=?,revision=revision+1 WHERE id=? AND revision=? AND state IN ('draft','returned') AND author_id=?",[JSON.stringify(content),id,body.expectedRevision,actor.id]),this.guard(),this.event({id,revision:next},actor,'edited',{content})],result:{id,revision:next,state:q.state}};
    });
  }
  async submit(actor,id,body){return this.transition(actor,id,body,'submit');}
  async requestChanges(actor,id,body){return this.transition(actor,id,body,'return');}
  async approve(actor,id,body){return this.transition(actor,id,body,'approve');}
  async transition(actor,id,body,action){
    signed(actor);key(id);exactFields(body,action==='return'?['mutationId','expectedRevision','comment']:action==='approve'?['mutationId','expectedRevision','checks']:['mutationId','expectedRevision']);revision(body.expectedRevision);
    if(action!=='submit')teacher(actor);
    if(action==='approve'){
      if(!this.allowGlobalApproval)fail(503,'Global template approval is not enabled.');
      exactFields(body.checks,['meaning','answers','level',...(this.mediaQuizzes?['media']:[])]);if(!['meaning','answers','level'].every(k=>body.checks[k]===true))fail(400,'Complete every review check.');
    }
    const comment=action==='return'?reviewText(body.comment,2000):'';
    return this.mutation(actor,body,[action,id],async()=>{
      const q=await this.version(id);await this.access(actor,q);
      if(action==='submit'?(q.author_id!==actor.id||!['draft','returned'].includes(q.state)):q.state!=='submitted')fail(409,'This transition is not available.');
      if(action==='approve'&&q.author_id===actor.id)fail(403,'A different teacher must approve this version.');
      if(action==='approve'&&this.extendedLifecycle){const [unresolved]=await this.db.read(`SELECT o.id FROM qr_opinions o LEFT JOIN qr_opinion_decisions d ON d.opinion_id=o.id
        WHERE o.version_id=? AND o.content_revision=? AND (d.decision IS NULL OR d.decision<>'confirm') LIMIT 1`,[id,body.expectedRevision]);if(unresolved)fail(409,'Resolve the independent opinion or return this version for changes before approval.');}
      const content=this.validateContent(q.type,JSON.parse(q.content_json)),state=action==='submit'?'submitted':action==='return'?'returned':'approved',next=body.expectedRevision+1;
      if(action==='approve'&&(q.type==='Video choice'||q.type==='Listen'&&content.items.some(item=>item.mediaId))&&body.checks.media!==true)fail(400,'Confirm the media and its correspondence to the text.');
      const assignments=action==='approve'?'reviewer_id=?,reviewer_name=?,approved_date=?':action==='submit'?'submitted_date=?':'feedback=?';
      const values=action==='approve'?[actor.id,name(actor),date()]:[action==='submit'?date():comment];
      const opinionGuard=action==='approve'&&this.extendedLifecycle?[s(`INSERT INTO mutation_guard SELECT NOT EXISTS(
        SELECT 1 FROM qr_opinions o LEFT JOIN qr_opinion_decisions d ON d.opinion_id=o.id
        WHERE o.version_id=? AND o.content_revision=? AND (d.decision IS NULL OR d.decision<>'confirm'))`,[id,body.expectedRevision])]:[];
      return {statements:[this.accessGuard(actor,origin(q)),...await this.mediaGuards(actor,origin(q),q.type,content),...opinionGuard,s(`UPDATE qr_versions SET state=?,revision=revision+1,${assignments} WHERE id=? AND revision=? AND state=?`,[state,...values,id,body.expectedRevision,q.state]),this.guard(),this.event({id,revision:next},actor,action,{content,...(action==='approve'?{checks:body.checks}:{}),...(comment?{comment}:{})})],result:{id,state,revision:next}};
    });
  }
  async proposeRevision(actor,id,body){
    teacher(actor);key(id);exactFields(body,['mutationId','expectedRevision']);revision(body.expectedRevision);
    return this.mutation(actor,body,['revise',id],async()=>{
      const old=await this.version(id);await this.access(actor,old);if(old.state!=='approved'||old.revision!==body.expectedRevision)fail(409,'Choose a current approved version.');
      const [last]=await this.db.read('SELECT MAX(version) AS version FROM qr_versions WHERE family_id=?',[old.family_id]);const version=last.version+1,newId=uuid();
      return {statements:[this.accessGuard(actor,origin(old)),s(`INSERT INTO qr_versions(id,family_id,parent_id,version,sense_id,type,content_json,state,author_id,author_name,author_group,group_id,lesson_id,card_id,created_date)
        VALUES(?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?)`,[newId,old.family_id,id,version,old.sense_id,old.type,old.content_json,actor.id,name(actor),old.author_group,old.group_id,old.lesson_id,old.card_id,date()]),this.guard(),this.event({id:newId,revision:1},actor,'revision-created',{parentId:id,originalAuthor:{name:old.author_name,group:old.author_group,date:old.created_date}})],result:{id:newId,version,revision:1,state:'draft'}};
    });
  }
  async get(actor,id){signed(actor);const q=await this.version(id);await this.access(actor,q);const events=await this.db.read('SELECT action,actor_name,event_date,details_json FROM qr_events WHERE version_id=? ORDER BY revision',[id]);return {...await this.projection(q),history:events.map(e=>({action:e.action,actor:e.actor_name,date:e.event_date,details:JSON.parse(e.details_json)}))};}
  async mine(actor,{offset=0,limit=100,withPage=false}={}){
    signed(actor);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail(400,'Invalid page.');
    const candidates=await this.db.read('SELECT * FROM qr_versions WHERE author_id=? ORDER BY created_date DESC,id LIMIT ? OFFSET ?',[actor.id,limit,offset]),result=[];
    for(const q of candidates){try{await this.access(actor,q);result.push(await this.projection(q));}catch(error){if(error.status!==403)throw error;}}
    return withPage?{quizzes:result,nextOffset:candidates.length===limit?offset+limit:null}:result;
  }
  async queue(actor,{limit=100,offset=0}={}){
    teacher(actor);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail(400,'Invalid page.');
    const list=await this.db.read(`SELECT q.* FROM qr_versions q JOIN class_groups g ON g.id=q.group_id JOIN lessons l ON l.id=q.lesson_id
      WHERE g.deleted_at IS NULL AND l.deleted_at IS NULL AND q.state IN ('submitted','returned') AND ${reviewAccess}
      ORDER BY q.group_id,q.lesson_id,q.sense_id,q.type,q.created_date,q.id LIMIT ? OFFSET ?`,[actor.role,limit,offset]);
    const result=[];for(const q of list)result.push(await this.projection(q));return result;
  }
  async sharedForCard(actor,cardId){
    signed(actor);recordId(cardId);const [card]=await this.db.read(`SELECT c.id FROM cards c WHERE c.id=? AND ${cardAccess}`,[cardId,...accessArgs(actor)]);if(!card)fail(404,'Card not available.');
    const list=await this.db.read(`SELECT q.*,original.author_name AS original_name,original.author_group AS original_group,original.created_date AS original_date
      FROM qr_versions q JOIN qr_versions original ON original.id=q.family_id JOIN qr_card_senses cs ON cs.sense_id=q.sense_id WHERE cs.card_id=? AND q.state='approved'
      AND NOT EXISTS(SELECT 1 FROM qr_versions newer WHERE newer.family_id=q.family_id AND newer.state='approved' AND newer.version>q.version)
      ${this.extendedLifecycle?"AND NOT EXISTS(SELECT 1 FROM qr_publication p WHERE p.version_id=q.id AND p.available=0)":''}
      ORDER BY q.type,q.family_id`,[cardId]);
    // No private lesson IDs, account IDs, review feedback or internal audit content.
    const result=[];
    for(const q of list){
      let content=JSON.parse(q.content_json);
      if(this.mediaQuizzes&&(q.type==='Video choice'||q.type==='Listen'&&content.items.some(item=>item.mediaId))&&!await this.contentPolicy?.available(q.type,content))continue;
      const mediaReady=['Listen','Video choice'].includes(q.type)&&content.items.every(item=>item.mediaId);
      const restricted=actor.role==='USER'&&(q.type==='Video choice'||q.type==='Listen'&&mediaReady);
      if(restricted)content={items:content.items.map(item=>({prompt:item.prompt,options:item.options})),explanation:''};
      result.push({id:q.id,familyId:q.family_id,version:q.version,senseId:q.sense_id,type:q.type,content,mediaReady,previewRestricted:restricted,teacherChecked:true,author:{name:q.author_name,group:q.author_group,date:q.created_date},originalAuthor:{name:q.original_name,group:q.original_group,date:q.original_date},reviewer:{name:q.reviewer_name,date:q.approved_date}});
    }
    return result;
  }
}
