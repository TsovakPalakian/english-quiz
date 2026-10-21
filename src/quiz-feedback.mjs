import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitSigned} from './learning-kits.mjs';
export const FEEDBACK_ADDRESS='info@lumiscia.org';
const fail=(status,message)=>{throw new StudyError(status,message);};
export class QuizFeedback{
  constructor(kits,media){this.kits=kits;this.review=kits.review;this.db=kits.db;this.media=media;}
  async create(actor,body){
    kitSigned(actor);exactFields(body,['mutationId','cardId','senseId','versionId','category','description','attachments']);
    if(!['complaint','remark','suggestion','bug'].includes(body.category)||!Array.isArray(body.attachments)||body.attachments.length>5||new Set(body.attachments).size!==body.attachments.length)fail(400,'Invalid report category or attachments.');
    const description=reviewText(body.description,4000);await this.kits.card(actor,body.cardId);
    if(!(await this.kits.senses(actor,body.cardId)).some(sense=>sense.id===body.senseId))fail(400,'Select a linked meaning.');
    if(body.versionId!==null){
      const q=await this.review.version(body.versionId);if(q.sense_id!==body.senseId)fail(400,'Version does not match the meaning.');
      if(q.state!=='approved')await this.review.access(actor,q);
    }
    return this.review.mutation(actor,body,['quiz-feedback'],async()=>{
      const attachments=[];for(const id of body.attachments){const row=await this.media.row(id);if(row.owner_id!==actor.id||row.purpose!=='feedback')fail(403,'Choose your own private report attachments.');attachments.push(row);}
      const id=crypto.randomUUID(),at=Date.now();
      return {statements:[this.kits.cardGuard(actor,body.cardId),s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_card_senses WHERE card_id=? AND sense_id=?)',[body.cardId,body.senseId]),s('INSERT INTO mutation_guard SELECT count(*)<10 FROM qr_feedback WHERE owner_id=? AND created_at>?',[actor.id,at-86400000]),
        ...attachments.map(row=>s("INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_media WHERE id=? AND owner_id=? AND purpose='feedback' AND deleted_at IS NULL)",[row.id,actor.id])),
        s('INSERT INTO qr_feedback(id,owner_id,card_id,sense_id,version_id,category,description,attachments_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,actor.id,body.cardId,body.senseId,body.versionId,body.category,description,JSON.stringify(body.attachments),at])],
      result:{id,state:'saved_locally',recipient:FEEDBACK_ADDRESS,delivered:false}};
    });
  }
  async mine(actor){kitSigned(actor);const rows=await this.db.read('SELECT id,card_id AS cardId,sense_id AS senseId,version_id AS versionId,category,description,attachments_json AS attachments,created_at AS createdAt FROM qr_feedback WHERE owner_id=? ORDER BY created_at DESC LIMIT 50',[actor.id]);return rows.map(row=>({...row,attachments:JSON.parse(row.attachments),recipient:FEEDBACK_ADDRESS,state:'saved_locally',delivered:false}));}
}
