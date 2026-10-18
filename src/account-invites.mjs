import {StudyError,statement as s,recordId} from './learning-study.mjs';
import {AccountGroupTeachers} from './account-group-teachers.mjs';

const namespace='account-invites';
const staff=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const fail=(status,message)=>{throw new StudyError(status,message);};
const encoder=new TextEncoder();

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function randomSecret(){
  const bytes=new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function parseInviteToken(raw){
  const text=String(raw||'').trim();
  const match=text.match(/^([a-zA-Z0-9_-]{8,64})\.([a-f0-9]{32,128})$/);
  if(!match)fail(400,'Invalid invite link.');
  return {id:match[1],secret:match[2]};
}

export class AccountInvites{
  constructor(db){this.db=db;}

  async #row(id){
    const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,id]);
    return row?JSON.parse(row.value_json):null;
  }

  async #save(id,value,previous=null){
    const payload=JSON.stringify(value);
    if(previous==null){
      try{
        await this.db.atomic([s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[namespace,id,payload])]);
      }catch(error){
        if(/UNIQUE|unique|PRIMARY/i.test(error.message||''))fail(409,'Invite already exists.');
        throw error;
      }
      return value;
    }
    const before=JSON.stringify(previous);
    try{
      await this.db.atomic([
        s('DROP TABLE IF EXISTS temp.invite_guard'),
        s('CREATE TEMP TABLE invite_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
        s('INSERT INTO invite_guard SELECT EXISTS(SELECT 1 FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?)',[namespace,id,before]),
        s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=? AND value_json=?',[payload,namespace,id,before]),
        s('INSERT INTO invite_guard SELECT changes()=1'),
        s('DROP TABLE invite_guard'),
      ]);
    }catch(error){
      if(/CHECK constraint|check constraint|invite_guard/i.test(error.message||''))fail(409,'Invite changed. Try again.');
      throw error;
    }
    return value;
  }

  async create(actor,body,users){
    if(!staff(actor))fail(403,'Teachers only.');
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid invite.');
    recordId(body.groupId);
    const teacherId=String(body.teacherId||actor.id);
    const directory=new Map((users||[]).map(user=>[user.id,user]));
    const teacher=directory.get(teacherId);
    if(!teacher||!staff(teacher)||teacher.active===false||teacher.active===0||teacher.revoked)fail(400,'Choose an active teacher or developer.');
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[body.groupId]);
    if(!group)fail(404,'Group not found.');
    const maxUses=body.maxUses==null?50:Number(body.maxUses);
    if(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>500)fail(400,'maxUses must be 1–500.');
    const days=body.days==null?30:Number(body.days);
    if(!Number.isSafeInteger(days)||days<1||days>365)fail(400,'days must be 1–365.');
    const id=crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const secret=randomSecret();
    const now=Date.now();
    const value={
      secretHash:await sha256Hex(secret),
      groupId:Number(group.id),
      teacherId,
      createdBy:actor.id,
      createdAt:now,
      expiresAt:now+days*86400000,
      maxUses,
      uses:0,
      revoked:false,
    };
    await this.#save(id,value);
    const teachers=new AccountGroupTeachers(this.db);
    const listed=await teachers.list(actor,users);
    const current=listed.assignments.find(row=>row.groupId===Number(group.id));
    const teacherIds=new Set(current?.teacherIds||[]);
    if(!teacherIds.has(teacherId)){
      teacherIds.add(teacherId);
      await teachers.save(actor,{groupId:Number(group.id),teacherIds:[...teacherIds],expectedRevision:current?.revision||0},users);
    }
    return {
      id,
      token:id+'.'+secret,
      groupId:Number(group.id),
      groupTitle:group.title,
      teacherId,
      expiresAt:value.expiresAt,
      maxUses,
      uses:0,
    };
  }

  async list(actor){
    if(!staff(actor))fail(403,'Teachers only.');
    const rows=await this.db.read('SELECT key,value_json FROM catalog_documents WHERE namespace=?',[namespace]);
    const now=Date.now();
    return {
      invites:rows.map(row=>{
        const value=JSON.parse(row.value_json);
        return {
          id:row.key,
          groupId:value.groupId,
          teacherId:value.teacherId,
          createdBy:value.createdBy,
          createdAt:value.createdAt,
          expiresAt:value.expiresAt,
          maxUses:value.maxUses,
          uses:value.uses,
          revoked:!!value.revoked,
          expired:value.expiresAt<=now,
          active:!value.revoked&&value.expiresAt>now&&value.uses<value.maxUses,
        };
      }).filter(row=>row.createdBy===actor.id||row.teacherId===actor.id||actor.role==='DEVELOPER')
        .sort((a,b)=>b.createdAt-a.createdAt),
    };
  }

  async revoke(actor,body){
    if(!staff(actor))fail(403,'Teachers only.');
    const id=String(body?.id||'');
    if(!/^[a-zA-Z0-9_-]{8,64}$/.test(id))fail(400,'Invalid invite.');
    const previous=await this.#row(id);
    if(!previous)fail(404,'Invite not found.');
    if(previous.createdBy!==actor.id&&previous.teacherId!==actor.id&&actor.role!=='DEVELOPER')fail(403,'Teachers only.');
    if(previous.revoked)return {id,revoked:true};
    await this.#save(id,{...previous,revoked:true,revokedAt:Date.now(),revokedBy:actor.id},previous);
    return {id,revoked:true};
  }

  async peek(token){
    const {id,secret}=parseInviteToken(token);
    const value=await this.#row(id);
    if(!value||value.revoked)fail(404,'Invite not found.');
    if(value.expiresAt<=Date.now())fail(410,'Invite expired.');
    if(value.uses>=value.maxUses)fail(410,'Invite already used up.');
    if(value.secretHash!==await sha256Hex(secret))fail(404,'Invite not found.');
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[value.groupId]);
    if(!group)fail(404,'Group not found.');
    return {groupId:Number(group.id),groupTitle:group.title,teacherId:value.teacherId,expiresAt:value.expiresAt};
  }

  async redeem(actor,token,assignStudent){
    if(!actor?.id)fail(401,'Sign in first.');
    if(actor.role!=='USER')fail(403,'Only students can redeem an invite.');
    const {id,secret}=parseInviteToken(token);
    const previous=await this.#row(id);
    if(!previous||previous.revoked)fail(404,'Invite not found.');
    if(previous.expiresAt<=Date.now())fail(410,'Invite expired.');
    if(previous.uses>=previous.maxUses)fail(410,'Invite already used up.');
    if(previous.secretHash!==await sha256Hex(secret))fail(404,'Invite not found.');
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[previous.groupId]);
    if(!group)fail(404,'Group not found.');
    await assignStudent({id:previous.createdBy,role:'ADMIN'},actor.id,previous.groupId);
    const next={...previous,uses:previous.uses+1,lastRedeemedAt:Date.now(),lastRedeemedBy:actor.id};
    await this.#save(id,next,previous);
    return {groupId:Number(group.id),groupTitle:group.title,teacherId:previous.teacherId,uses:next.uses};
  }
}
