import {StudyError,statement as s,recordId} from './turso-study.mjs';
const namespace='accounts-group-teachers',reviewer=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const allowed=users=>new Set(users.filter(user=>['ADMIN','DEVELOPER'].includes(user.role)&&user.active!==false&&user.active!==0&&!user.revoked).map(user=>user.id));
const fail=(status,message)=>{throw new StudyError(status,message);};
export class AccountGroupTeachers{
  constructor(db){this.db=db;}
  async list(actor,users){
    if(!reviewer(actor))fail(403,'Teachers only.');const ids=allowed(users);
    const rows=await this.db.read('SELECT d.key,d.value_json FROM catalog_documents d JOIN class_groups g ON CAST(g.id AS TEXT)=d.key WHERE d.namespace=? AND g.deleted_at IS NULL',[namespace]);
    return {assignments:rows.map(row=>{const value=JSON.parse(row.value_json);return {groupId:Number(row.key),revision:value.revision,teacherIds:value.teacherIds.filter(id=>ids.has(id))};})};
  }
  async save(actor,body,users){
    if(!reviewer(actor))fail(403,'Teachers only.');
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['groupId','teacherIds','expectedRevision'].includes(key)))fail(400,'Invalid teacher assignment.');
    recordId(body.groupId);const ids=allowed(users);
    if(!Array.isArray(body.teacherIds)||body.teacherIds.length>100||new Set(body.teacherIds).size!==body.teacherIds.length||body.teacherIds.some(id=>!ids.has(id))||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail(400,'Choose active teachers and the current revision.');
    const [group]=await this.db.read('SELECT id FROM class_groups WHERE id=? AND deleted_at IS NULL',[body.groupId]);if(!group)fail(404,'Group not found.');
    const key=String(body.groupId),[old]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key]);
    if((old?JSON.parse(old.value_json).revision:0)!==body.expectedRevision)fail(409,'Teacher assignments changed. Reopen the group.');
    const retained=old?JSON.parse(old.value_json).teacherIds.filter(id=>!ids.has(id)):[];
    const value={revision:body.expectedRevision+1,teacherIds:[...body.teacherIds,...retained],updatedBy:actor.id,updatedAt:Date.now()};
    const write=old?s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=? AND value_json=?',[JSON.stringify(value),namespace,key,old.value_json]):s('INSERT OR IGNORE INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[namespace,key,JSON.stringify(value)]);
    try{await this.db.atomic([s('DROP TABLE IF EXISTS temp.group_guard'),s('CREATE TEMP TABLE group_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s('INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND deleted_at IS NULL)',[body.groupId]),write,s('INSERT INTO group_guard SELECT changes()=1'),s('DROP TABLE group_guard')]);}catch(error){if(/CHECK constraint|check constraint|group_guard/i.test(error.message))fail(409,'Teacher assignments changed. Reopen the group.');throw error;}
    return {groupId:body.groupId,revision:value.revision,teacherIds:body.teacherIds};
  }
}
