import {StudyError,statement as s,recordId} from './learning-study.mjs';
import {AccountGroupTeachers} from './account-group-teachers.mjs';

const namespace='account-invites';
const staff=actor=>['ADMIN','DEVELOPER'].includes(actor?.role);
const fail=(status,message)=>{throw new StudyError(status,message);};
const encoder=new TextEncoder();
const inviteExpiry=value=>Math.min(value.expiresAt,value.createdAt+3*86400000);

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function timingSafeHexEqual(a, b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  const aBuf=encoder.encode(a),bBuf=encoder.encode(b);
  if(typeof crypto?.subtle?.timingSafeEqual==='function'){
    return crypto.subtle.timingSafeEqual(aBuf,bBuf);
  }
  let diff=0;for(let i=0;i<aBuf.length;i++)diff|=aBuf[i]^bBuf[i];
  return diff===0;
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
    const kind=body.kind==='teacher'?'teacher':'student';
    if(body.kind!=null&&!['student','teacher'].includes(body.kind))fail(400,'Invalid invite type.');
    const teacherId=String(body.teacherId||actor.id);
    const directory=new Map((users||[]).map(user=>[user.id,user]));
    const teacher=directory.get(teacherId);
    if(kind==='student'&&(!teacher||!staff(teacher)||teacher.active===false||teacher.active===0||teacher.revoked))fail(400,'Choose an active teacher.');
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[body.groupId]);
    if(!group)fail(404,'Group not found.');
    const assignments=await new AccountGroupTeachers(this.db).list(actor,users);
    const assigned=assignments.assignments.find(row=>row.groupId===Number(group.id))?.teacherIds||[];
    if(assigned.length>0&&actor.role!=='DEVELOPER'&&!assigned.includes(actor.id))fail(403,'You must be assigned to this group to create an invite.');
    if(kind==='student'&&(!assigned.includes(teacherId)||(actor.role!=='DEVELOPER'&&!assigned.includes(actor.id))))fail(403,'Assign the teacher to this group before creating a student invite.');
    const email=String(body.email||'').trim().toLowerCase();
    if(kind==='teacher'&&email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120))fail(400,'Enter a valid email.');
    const maxUses=1,days=3;
    const id=crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const secret=randomSecret();
    const now=Date.now();
    const value={
      secretHash:await sha256Hex(secret),
      kind,email:kind==='teacher'?email:'',
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
    return {
      id,
      kind,
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
          expiresAt:inviteExpiry(value),
          maxUses:1,
          uses:value.uses,
          revoked:!!value.revoked,
          expired:inviteExpiry(value)<=now,
          active:!value.revoked&&inviteExpiry(value)>now&&value.uses<1,
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

  async peek(token,verifiedEmail){
    const {id,secret}=parseInviteToken(token);
    const value=await this.#row(id);
    if(!value||value.revoked)fail(404,'Invite not found.');
    if(inviteExpiry(value)<=Date.now())fail(410,'Invite expired.');
    if(value.uses>=1)fail(410,'Invite already used up.');
    if(!timingSafeHexEqual(value.secretHash,await sha256Hex(secret)))fail(404,'Invite not found.');
    if(value.kind==='teacher'&&value.email&&verifiedEmail!==undefined&&String(verifiedEmail).trim().toLowerCase()!==value.email)fail(403,'Use the invited teacher email.');
    if(value.kind!=='teacher')await this.#checkAssignedTeacher(value);
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[value.groupId]);
    if(!group)fail(404,'Group not found.');
    return {groupId:Number(group.id),groupTitle:group.title,teacherId:value.teacherId,kind:value.kind||'student',expiresAt:inviteExpiry(value)};
  }

  async redeem(actor,token,assignStudent,{verifiedEmail='',users=[]}={}){
    if(!actor?.id)fail(401,'Sign in first.');
    const {id,secret}=parseInviteToken(token);
    const previous=await this.#row(id);
    if(!previous||previous.revoked)fail(404,'Invite not found.');
    if(inviteExpiry(previous)<=Date.now())fail(410,'Invite expired.');
    const retry=previous.redemptionPending&&previous.lastRedeemedBy===actor.id;
    if(previous.uses>=1&&!retry)fail(410,'Invite already used up.');
    if(!timingSafeHexEqual(previous.secretHash,await sha256Hex(secret)))fail(404,'Invite not found.');
    const [group]=await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[previous.groupId]);
    if(!group)fail(404,'Group not found.');
    if(previous.kind==='teacher'){
      if(!staff(actor))fail(403,'Teachers only.');
      if(previous.email&&(String(verifiedEmail).toLowerCase()!==previous.email||String(actor.email||'').toLowerCase()!==previous.email))fail(403,'Use email code or Google with the invited teacher email.');
    }else{
      if(actor.role!=='USER')fail(403,'Only students can redeem this invite.');
      await this.#checkAssignedTeacher(previous);
    }
    // Claim before side effects: concurrent recipients cannot both join with one token.
    const claimed=retry?previous:{...previous,uses:1,lastRedeemedAt:Date.now(),lastRedeemedBy:actor.id,redemptionPending:true};
    if(!retry)await this.#save(id,claimed,previous);
    if(previous.kind==='teacher')await this.#assignTeacher(previous.groupId,actor,users,previous.createdBy);
    else await assignStudent({id:previous.createdBy,role:'ADMIN'},actor.id,previous.groupId);
    const next={...claimed,redemptionPending:false};
    await this.#save(id,next,claimed);
    return {groupId:Number(group.id),groupTitle:group.title,teacherId:previous.teacherId,uses:next.uses};
  }

  async #checkAssignedTeacher(invite){
    const [assignment]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',['accounts-group-teachers',String(invite.groupId)]);
    if(!assignment||!JSON.parse(assignment.value_json).teacherIds.includes(invite.teacherId))fail(403,'Invite teacher is no longer assigned to this group.');
  }

  async #assignTeacher(groupId,teacher,users,createdBy){
    const service=new AccountGroupTeachers(this.db),actor={id:createdBy,role:'DEVELOPER'};
    const directory=[...users.filter(user=>user.id!==teacher.id),teacher];
    const current=(await service.list(actor,directory)).assignments.find(row=>row.groupId===groupId);
    const ids=new Set(current?.teacherIds||[]);ids.add(teacher.id);
    await service.save(actor,{groupId,teacherIds:[...ids],expectedRevision:current?.revision||0},directory);
  }

  async acceptPendingTeacher(token,email,registrationId){
    return this.acceptPendingRegistration(token,email,registrationId,'teacher');
  }

  async acceptPendingRegistration(token,email,registrationId,kind='student'){
    await this.peek(token);
    const {id}=parseInviteToken(token),previous=await this.#row(id);
    if(previous.revoked||previous.uses>=1||inviteExpiry(previous)<=Date.now())fail(410,'Invite is no longer available.');
    if((previous.kind||'student')!==kind||(kind==='teacher'&&previous.email&&previous.email!==String(email).trim().toLowerCase()))fail(403,'Use the invited teacher email.');
    await this.#save(id,{...previous,uses:1,registrationEmail:String(email).trim().toLowerCase(),pendingRegistrationId:registrationId,acceptedAt:Date.now()},previous);
    return {pending:true};
  }

  async completeTeacherApproval(actor,registrationId,teacher,users){
    return this.completeApproval(actor,registrationId,teacher,users);
  }

  async registrationInvite(actor,registrationId){
    if(!staff(actor))fail(403,'Teachers only.');
    const rows=await this.db.read("SELECT key,value_json FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.pendingRegistrationId')=?",[namespace,registrationId]);
    if(!rows.length)return null;
    const value=JSON.parse(rows[0].value_json);
    if(actor.role!=='DEVELOPER'&&value.createdBy!==actor.id)fail(403,'Only the inviting teacher or a developer can approve this account.');
    if(value.revoked)fail(410,'This invitation was revoked.');
    return value;
  }

  async registrationPermissions(actor,registrations){
    if(!staff(actor))fail(403,'Teachers only.');
    const rows=await this.db.read("SELECT value_json FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.pendingRegistrationId') IS NOT NULL",[namespace]);
    const invites=new Map(rows.map(row=>{const value=JSON.parse(row.value_json);return [value.pendingRegistrationId,value];}));
    return registrations.map(row=>{
      const invite=invites.get(row.id);if(!invite)return row;
      return {...row,inviteGroupId:invite.groupId,inviteCanApprove:!invite.revoked&&(actor.role==='DEVELOPER'||invite.createdBy===actor.id)};
    });
  }

  async completeApproval(actor,registrationId,person,users,assignStudent){
    await this.registrationInvite(actor,registrationId);
    const rows=await this.db.read("SELECT key,value_json FROM catalog_documents WHERE namespace=? AND json_extract(value_json,'$.pendingRegistrationId')=?",[namespace,registrationId]);
    for(const row of rows){
      const value=JSON.parse(row.value_json);
      if(value.pendingRegistrationId!==registrationId||value.assignedAt||value.revoked)continue;
      const teacher=value.kind==='teacher';
      if(person.role!==(teacher?'ADMIN':'USER')||String(person.email).toLowerCase()!==(value.registrationEmail||value.email))fail(403,'Account does not match the invite.');
      if(teacher)await this.#assignTeacher(value.groupId,person,users,value.createdBy);
      else await assignStudent({id:value.createdBy,role:'ADMIN'},person.id,value.groupId);
      await this.#save(row.key,{...value,assignedAt:Date.now(),lastRedeemedBy:person.id},value);
    }
  }
}
