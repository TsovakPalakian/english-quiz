// The actor comes ONLY from successful live authentication, never request JSON.
// Account/password/role stay in D1. This provisions empty educational state only.
import {StudyError,statement as s} from './turso-study.mjs';
export async function ensureStudyProfile(db,actor){
  if(!actor||!/^[a-f0-9]{16,64}$/.test(actor.id)||actor.revoked||!['USER','ADMIN','DEVELOPER'].includes(actor.role))
    throw new StudyError(401,'Live authenticated account required.');
  const existing=await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
  if(existing.length===1)return existing[0].profile_id; // Preserve retained/pair IDs.
  if(existing.length)throw new StudyError(409,'Ambiguous profile membership.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['account',actor.id])));
  const profile='profile_'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  await db.atomic([
    s('INSERT OR IGNORE INTO account_refs(id) VALUES(?)',[actor.id]),
    s("INSERT OR IGNORE INTO study_profiles(id,kind) SELECT ?,'personal' WHERE NOT EXISTS(SELECT 1 FROM profile_members WHERE account_id=?)",[profile,actor.id]),
    s('INSERT OR IGNORE INTO profile_members(account_id,profile_id) VALUES(?,?)',[actor.id,profile])
  ]);
  const after=await db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[actor.id]);
  if(after.length!==1)throw new StudyError(503,'Educational profile not acknowledged. Retry sign-in.');
  return after[0].profile_id;
}
