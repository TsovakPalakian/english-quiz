import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {kitSigned} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const safe=value=>typeof value==='string'&&value.length<=200&&!/[@\u0000-\u001f]|https?:\/\//i.test(value)?value:null;
export function publicQuizAuthor({name,group,date,kind},visibility){
  if(kind==='automatic')return {name:'Automatic generator',group:null,date};
  return {name:visibility?.public_name?safe(name)||'Quiz author':'Quiz author',group:visibility?.public_group?safe(group):null,date};
}
export class QuizAuthorVisibility{
  constructor(review){this.review=review;this.db=review.db;}
  async owned(actor,id){kitSigned(actor);const q=await this.review.version(id);if(q.author_id!==actor.id||q.author_kind==='automatic')fail(403,'Only the human author can change public attribution.');return q;}
  async get(actor,id){await this.owned(actor,id);const [row]=await this.db.read('SELECT revision,public_name,public_group FROM qr_author_visibility WHERE version_id=?',[id]);return {revision:row?.revision||0,publicName:!!row?.public_name,publicGroup:!!row?.public_group};}
  async set(actor,id,body){
    exactFields(body,['mutationId','expectedRevision','publicName','publicGroup']);await this.owned(actor,id);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.publicName!=='boolean'||typeof body.publicGroup!=='boolean')fail(400,'Confirm the current public attribution settings.');
    return this.review.mutation(actor,body,['author-visibility',id],async()=>({statements:[
      s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_versions WHERE id=? AND author_id=? AND author_kind<>'automatic')",[id,actor.id]),
      body.expectedRevision===0?s('INSERT INTO qr_author_visibility(version_id,author_id,public_name,public_group,revision,changed_at) VALUES(?,?,?,?,1,?)',[id,actor.id,+body.publicName,+body.publicGroup,Date.now()]):s('UPDATE qr_author_visibility SET public_name=?,public_group=?,revision=revision+1,changed_at=? WHERE version_id=? AND author_id=? AND revision=?',[+body.publicName,+body.publicGroup,Date.now(),id,actor.id,body.expectedRevision]),this.review.guard()
    ],result:{revision:body.expectedRevision+1,publicName:body.publicName,publicGroup:body.publicGroup}}));
  }
}
