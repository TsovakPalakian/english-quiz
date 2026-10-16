import {StudyService,StudyError,recordId,statement as s} from './learning-study.mjs';

const tables={group:'class_groups',exam:'exams','exam-block':'exam_blocks'};
export async function materialVisibility(db,accountId){
  const rows=await db.read("SELECT key,value_json FROM account_settings WHERE account_id=? AND key LIKE 'visibility:%'",[accountId]);
  return new Set(rows.filter(row=>JSON.parse(row.value_json)===true).map(row=>row.key.slice(11)));
}
export class VisibilityService extends StudyService{
  async set(actor,accountId,body){
    if(!['ADMIN','DEVELOPER'].includes(actor?.role))throw new StudyError(403,'You cannot do that.');
    if(!/^[a-f0-9]{16,64}$/.test(accountId)||!body||Object.keys(body).some(key=>!['mutationId','type','id','expected','hidden'].includes(key))||!tables[body.type]||typeof body.expected!=='boolean'||typeof body.hidden!=='boolean')throw new StudyError(400,'Invalid visibility change.');
    recordId(body.id);
    const key='visibility:'+body.type+':'+body.id;
    return this.mutate(actor,body,['material-visibility',accountId,body.type,body.id],async()=>{
      const [item]=await this.db.read(`SELECT id FROM ${tables[body.type]} WHERE id=? AND deleted_at IS NULL`,[body.id]);
      if(!item)throw new StudyError(404,'Material not found.');
      const [old]=await this.db.read('SELECT value_json,revision FROM account_settings WHERE account_id=? AND key=?',[accountId,key]);
      if(!!(old&&JSON.parse(old.value_json))!==body.expected)throw new StudyError(409,'Visibility changed. Reload before saving.');
      const revision=old?.revision||0;
      return {statements:[s(`INSERT INTO account_settings(account_id,key,value_json,revision) VALUES(?,?,?,1)
        ON CONFLICT(account_id,key) DO UPDATE SET value_json=excluded.value_json,revision=account_settings.revision+1 WHERE account_settings.revision=?`,[accountId,key,JSON.stringify(body.hidden),revision]),this.guard()],
        result:{type:body.type,id:body.id,hidden:body.hidden,accountId,revision:revision+1}};
    });
  }
}
