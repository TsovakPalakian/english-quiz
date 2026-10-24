import {statement as s,StudyError} from './learning-study.mjs';

const ready=new WeakMap();
const denied=(status,message)=>{throw new StudyError(status,message);};
export async function ensureAccountArchive(db){
  if(!ready.has(db))ready.set(db,db.atomic([s(`CREATE TABLE IF NOT EXISTS account_archives(
    account_id TEXT PRIMARY KEY,archived_by TEXT NOT NULL,archived_by_name TEXT NOT NULL,
    title TEXT NOT NULL,login TEXT NOT NULL,email TEXT NOT NULL,archived_at INTEGER NOT NULL DEFAULT(unixepoch()),
    hidden_at INTEGER,original_active INTEGER NOT NULL,original_hidden INTEGER NOT NULL,purge_started_at INTEGER
  )`),s('CREATE TABLE IF NOT EXISTS content_archive_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0))'),s('INSERT OR IGNORE INTO content_archive_state(id,revision) VALUES(1,1)')]).then(async()=>{
    if(!(await db.read('PRAGMA table_info(account_archives)')).some(column=>column.name==='purge_started_at')){
      try{await db.atomic([s('ALTER TABLE account_archives ADD COLUMN purge_started_at INTEGER')]);}
      catch(error){if(!(await db.read('PRAGMA table_info(account_archives)')).some(column=>column.name==='purge_started_at'))throw error;}
    }
  }).catch(error=>{ready.delete(db);throw error;}));
  return ready.get(db);
}
export class AccountArchive {
  constructor(db,accounts){this.db=db;this.accounts=accounts;}
  staff(actor){if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role))denied(403,'Teachers only.');}
  async entry(actor,id){
    this.staff(actor);await ensureAccountArchive(this.db);
    const [row]=await this.db.read('SELECT * FROM account_archives WHERE account_id=?',[id]);
    if(!row||actor.role!=='DEVELOPER'&&(row.archived_by!==actor.id||row.hidden_at))denied(404,'Archived account not found.');
    return row;
  }
  async list(actor){
    if(!['ADMIN','DEVELOPER'].includes(actor?.role))return [];
    await ensureAccountArchive(this.db);
    return (await this.db.read('SELECT * FROM account_archives WHERE ?=1 OR (archived_by=? AND hidden_at IS NULL) ORDER BY archived_at DESC',[+(actor.role==='DEVELOPER'),actor.id])).map(row=>({
      type:'account',id:row.account_id,title:row.title,login:row.login,email:row.email,
      archivedBy:row.archived_by,archivedByName:row.archived_by_name,archivedAt:row.archived_at,teacherHiddenAt:row.hidden_at,purging:!!row.purge_started_at
    }));
  }
  async archive(actor,id){
    this.staff(actor);if(id===actor.id)denied(400,'You cannot archive your own account.');
    const user=await this.accounts.prepare('SELECT id,role,name,login,email,active,hidden FROM users WHERE id=? AND is_personal_data_revoked=0').bind(id).first();
    if(!user||!['USER','ADMIN'].includes(user.role)||actor.role==='ADMIN'&&user.role!=='USER')denied(404,'Account unavailable.');
    await ensureAccountArchive(this.db);
    await this.db.atomic([s('INSERT OR IGNORE INTO account_archives(account_id,archived_by,archived_by_name,title,login,email,original_active,original_hidden) VALUES(?,?,?,?,?,?,?,?)',[
      id,actor.id,actor.name||actor.login||actor.id,user.name||user.login,user.login,user.email,user.active??1,user.hidden??0
    ]),s('UPDATE content_archive_state SET revision=revision+1 WHERE id=1')]);
    // Retain the archive record if the second database is unavailable: retry is safe.
    await this.accounts.prepare('UPDATE users SET active=0,hidden=1 WHERE id=?').bind(id).run();
    return {archived:true,type:'account',id};
  }
  async restore(actor,id){
    const row=await this.entry(actor,id);
    if(row.purge_started_at)denied(409,'Permanent deletion has started. Retry deletion instead of restoring partial data.');
    await this.accounts.prepare('UPDATE users SET active=?,hidden=? WHERE id=?').bind(row.original_active,row.original_hidden,id).run();
    await this.db.atomic([s('DELETE FROM account_archives WHERE account_id=?',[id]),s('UPDATE content_archive_state SET revision=revision+1 WHERE id=1')]);
    return {restored:true,type:'account',id};
  }
  async hide(actor,id){
    await this.entry(actor,id);
    if(actor.role==='DEVELOPER')denied(400,'Use permanent deletion for this account.');
    await this.accounts.prepare('UPDATE users SET active=0,hidden=1 WHERE id=?').bind(id).run();
    await this.db.atomic([s('UPDATE account_archives SET hidden_at=unixepoch() WHERE account_id=?',[id]),s('UPDATE content_archive_state SET revision=revision+1 WHERE id=1')]);
    return {hidden:true,type:'account',id};
  }
  async beginPurge(actor,id){
    if(actor?.role!=='DEVELOPER')denied(403,'Developer only.');
    await this.entry(actor,id);
    await this.db.atomic([s('UPDATE account_archives SET purge_started_at=COALESCE(purge_started_at,unixepoch()),hidden_at=COALESCE(hidden_at,unixepoch()) WHERE account_id=?',[id]),s('UPDATE content_archive_state SET revision=revision+1 WHERE id=1')]);
    await this.accounts.prepare('UPDATE users SET active=0,hidden=1 WHERE id=?').bind(id).run();
  }
  async preview(actor,id){
    const row=await this.entry(actor,id);
    return {type:'account',id,title:row.title,account:{name:row.title,login:row.login,email:row.email},documents:[]};
  }
}
