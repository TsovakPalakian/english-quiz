import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields} from './quiz-review-content.mjs';
import {kitSigned,kitTeacher} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
export function rejectReportSecrets(text){
  if(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+\/-]{12,}|\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*\S{4,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i.test(text))fail(400,'Remove passwords, keys and access tokens from the report.');
}
export class QuizFeedbackPrivacy{
  constructor(feedback){this.feedback=feedback;this.db=feedback.db;this.review=feedback.review;this.media=feedback.media;}
  gate(){if(!this.feedback.privacyEnabled)fail(503,'Report privacy management is off.');}
  async erase(actor,id,body){
    this.gate();kitSigned(actor);exactFields(body,['mutationId']);
    const [row]=await this.db.read('SELECT * FROM qr_feedback WHERE id=? AND owner_id=?',[id,actor.id]);if(!row)fail(404,'Report unavailable.');
    if(row.deleted_at!==null)return {id,deleted:true,mailboxCopyMayRemain:true};
    const at=this.feedback.now();
    return this.review.mutation(actor,body,['feedback-erase',id],async()=>({statements:[
      s("INSERT INTO mutation_guard SELECT NOT EXISTS(SELECT 1 FROM qr_feedback_delivery WHERE feedback_id=? AND state IN ('queued','started'))",[id]),
      ...JSON.parse(row.attachments_json).map(mediaId=>s('INSERT OR IGNORE INTO qr_feedback_purge(media_id,requested_at) VALUES(?,?)',[mediaId,at])),
      s("UPDATE qr_feedback SET deleted_at=?,description='',attachments_json='[]' WHERE id=? AND owner_id=? AND deleted_at IS NULL",[at,id,actor.id]),this.review.guard(),
      ...JSON.parse(row.attachments_json).map(mediaId=>s("UPDATE qr_media SET deleted_at=? WHERE id=? AND owner_id=? AND purpose='feedback' AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM qr_feedback f,json_each(f.attachments_json) i WHERE f.deleted_at IS NULL AND i.value=?)",[at,mediaId,actor.id,mediaId]))
    ],result:{id,deleted:true,mailboxCopyMayRemain:true}}));
  }
  // A trusted scheduled composition invokes this explicitly; no timer or delivery retry.
  async sweep(actor,{limit=50}={}){
    this.gate();kitSigned(actor);if(actor.role!=='DEVELOPER')fail(403,'Developer maintenance required.');
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'Invalid privacy batch.');
    const at=this.feedback.now(),retention=this.feedback.retentionDays*86400000,expired=await this.db.read("SELECT * FROM qr_feedback f WHERE deleted_at IS NULL AND COALESCE(expires_at,created_at+?)<=? AND NOT EXISTS(SELECT 1 FROM qr_feedback_delivery d WHERE d.feedback_id=f.id AND d.state IN ('queued','started')) ORDER BY created_at,id LIMIT ?",[retention,at,limit]);
    for(const row of expired)await this.db.atomic([
      ...JSON.parse(row.attachments_json).map(mediaId=>s('INSERT OR IGNORE INTO qr_feedback_purge(media_id,requested_at) VALUES(?,?)',[mediaId,at])),
      s("UPDATE qr_feedback SET deleted_at=?,description='',attachments_json='[]' WHERE id=? AND deleted_at IS NULL AND COALESCE(expires_at,created_at+?)<=? AND NOT EXISTS(SELECT 1 FROM qr_feedback_delivery WHERE feedback_id=? AND state IN ('queued','started'))",[at,row.id,retention,at,row.id])
    ]);
    await this.db.atomic([s("INSERT OR IGNORE INTO qr_feedback_purge(media_id,requested_at) SELECT m.id,? FROM qr_media m WHERE m.purpose='feedback' AND m.created_at+?<=? AND NOT EXISTS(SELECT 1 FROM qr_feedback f,json_each(f.attachments_json) i WHERE f.deleted_at IS NULL AND i.value=m.id) ORDER BY m.created_at,m.id LIMIT ?",[at,retention,at,limit])]);
    const queue=await this.db.read('SELECT media_id FROM qr_feedback_purge WHERE finished_at IS NULL ORDER BY requested_at,media_id LIMIT ?',[limit]);let removed=0;
    for(const entry of queue){
      const [row]=await this.db.read("SELECT m.* FROM qr_media m WHERE m.id=? AND m.purpose='feedback' AND NOT EXISTS(SELECT 1 FROM qr_feedback f,json_each(f.attachments_json) i WHERE f.deleted_at IS NULL AND i.value=m.id)",[entry.media_id]);if(!row)continue;
      try{
        if(row.deleted_at===null)await this.db.atomic([s("UPDATE qr_media SET deleted_at=? WHERE id=? AND purpose='feedback' AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM qr_feedback f,json_each(f.attachments_json) i WHERE f.deleted_at IS NULL AND i.value=?)",[at,row.id,row.id])]);
        const [marked]=await this.db.read('SELECT deleted_at FROM qr_media WHERE id=?',[row.id]);if(marked?.deleted_at==null)continue;
        await this.media.store.delete('quiz-media/'+row.id+'/'+row.digest);
        await this.db.atomic([s("UPDATE qr_media SET name='Deleted attachment',descriptor_json='{}',source_json='{}' WHERE id=? AND purpose='feedback' AND deleted_at IS NOT NULL",[row.id]),s('UPDATE qr_feedback_purge SET finished_at=?,error_code=NULL WHERE media_id=?',[at,row.id])]);removed++;
      }catch{await this.db.atomic([s("UPDATE qr_feedback_purge SET error_code='cleanup_pending' WHERE media_id=?",[row.id])]);}
    }
    return {expired:expired.length,objectsRemoved:removed,pending:queue.length-removed};
  }
  async signals(actor,{limit=50}={}){
    this.gate();kitTeacher(actor);if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'Invalid report signal page.');
    const rows=await this.db.read(`SELECT f.version_id AS versionId,q.type,q.state,count(*) AS reports,count(DISTINCT f.owner_id) AS reporters,max(f.created_at) AS latestAt
      FROM qr_feedback f JOIN qr_versions q ON q.id=f.version_id WHERE f.deleted_at IS NULL AND COALESCE(f.expires_at,f.created_at+?)>?
      GROUP BY f.version_id ORDER BY latestAt DESC,f.version_id LIMIT ?`,[this.feedback.retentionDays*86400000,this.feedback.now(),limit]);
    return {signals:rows,automaticAction:false};
  }
}
