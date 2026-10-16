import {StudyError,statement as s,recordId} from './learning-study.mjs';
import {GroupService} from './learning-groups.mjs';
import {ExamService} from './learning-exams.mjs';
import {instanceCommands} from './learning-exam-instances.mjs';
import {validateColorDocument} from './text-formatting.mjs';
import {chatDatabaseCipher} from './chat-encryption.mjs';

const staff = actor => ['ADMIN','DEVELOPER'].includes(actor?.role);
const fail = (status,message) => { throw new StudyError(status,message); };
const name = actor => actor.role === 'DEVELOPER' ? 'Support' : actor.name || actor.login || 'Teacher';
const schema = [
  `CREATE TABLE IF NOT EXISTS chat_rooms(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('direct','group')),group_id INTEGER,created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE TABLE IF NOT EXISTS chat_members(room_id TEXT NOT NULL REFERENCES chat_rooms(id),account_id TEXT NOT NULL,joined_seq INTEGER NOT NULL DEFAULT 0,group_epoch INTEGER NOT NULL DEFAULT 0,read_personal INTEGER NOT NULL DEFAULT 0,read_learning INTEGER NOT NULL DEFAULT 0,muted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,account_id))`,
  `CREATE TABLE IF NOT EXISTS chat_assignments(id TEXT PRIMARY KEY,exam_id INTEGER NOT NULL REFERENCES exams(id),target_kind TEXT NOT NULL CHECK(target_kind IN ('group','student')),target_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL DEFAULT(unixepoch()))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS chat_active_assignment ON chat_assignments(exam_id,target_kind,target_id) WHERE active=1`,
  `CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT NOT NULL REFERENCES chat_rooms(id),sender_id TEXT NOT NULL,sender_name TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('personal','learning')),body TEXT NOT NULL,reply_to INTEGER REFERENCES chat_messages(id),assignment_id TEXT REFERENCES chat_assignments(id),client_key TEXT NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()),UNIQUE(sender_id,client_key))`,
  `CREATE INDEX IF NOT EXISTS chat_room_sequence ON chat_messages(room_id,id)`,
  `CREATE TABLE IF NOT EXISTS chat_mutations(actor_id TEXT NOT NULL,client_key TEXT NOT NULL,result_json TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(actor_id,client_key))`,
  `CREATE TABLE IF NOT EXISTS chat_send_budget(account_id TEXT PRIMARY KEY,window_start INTEGER NOT NULL,n INTEGER NOT NULL)`,
];
const ready = new WeakMap();
function signed(actor) { if (!actor?.id || !['USER','ADMIN','DEVELOPER'].includes(actor.role)) fail(401,'Sign in to open messages.'); }
function key(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(value)) fail(400,'Invalid message reference.'); return value; }
function category(value) { if (!['personal','learning'].includes(value)) fail(400,'Choose a message category.'); return value; }
function directId(a,b) { return 'direct:' + [a,b].sort().join(':'); }

export class MessageService {
  constructor(db,directory,storage) { this.db = db; this.directory = directory;this.storage=storage;this.cipher=chatDatabaseCipher(db); }
  sealText(room,value,column='body'){return this.cipher?this.cipher.seal(value,'journal:'+room+':'+column):value;}
  openText(room,value,column='body'){return this.cipher?this.cipher.open(value,'journal:'+room+':'+column):value;}
  ensure() {
    if (!ready.has(this.db)) ready.set(this.db,(async () => {
      await new ExamService(this.db).ensure(); await new GroupService(this.db).ensure();
      await this.db.atomic(schema.map(sql => s(sql)));
      await this.db.atomic([s('CREATE TABLE IF NOT EXISTS chat_delivery_outbox(message_id INTEGER PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE)'),s("CREATE TRIGGER IF NOT EXISTS chat_notice_outbox AFTER INSERT ON chat_messages WHEN NEW.category='learning' BEGIN INSERT OR IGNORE INTO chat_delivery_outbox(message_id) VALUES(NEW.id); END")]);
      const columns = await this.db.read('PRAGMA table_info(chat_messages)');
      if(!columns.some(column=>column.name==='exam_instance_id')){
        try{await this.db.atomic([s('ALTER TABLE chat_messages ADD COLUMN exam_instance_id INTEGER')]);}catch(error){if(!(await this.db.read('PRAGMA table_info(chat_messages)')).some(column=>column.name==='exam_instance_id'))throw error;}
      }
      if(!columns.some(column=>column.name==='format_json')){
        try{await this.db.atomic([s('ALTER TABLE chat_messages ADD COLUMN format_json TEXT')]);}catch(error){if(!(await this.db.read('PRAGMA table_info(chat_messages)')).some(column=>column.name==='format_json'))throw error;}
      }
      if (!columns.some(column => column.name === 'created_ms')) {
        try { await this.db.atomic([s('ALTER TABLE chat_messages ADD COLUMN created_ms INTEGER')]); }
        catch (error) {
          if (!(await this.db.read('PRAGMA table_info(chat_messages)')).some(column => column.name === 'created_ms')) throw error;
        }
      }
    })().catch(error => { ready.delete(this.db); throw error; }));
    return ready.get(this.db);
  }
  async contacts(actor) {
    signed(actor); await this.ensure();
    const users = await this.directory();
    const enrolled = await this.db.read('SELECT account_id,group_id FROM class_group_students');
    const own = enrolled.find(row => row.account_id === actor.id)?.group_id;
    return users.filter(user => user.id !== actor.id && (staff(actor) || staff(user) || own && enrolled.some(row => row.account_id === user.id && row.group_id === own)))
      .map(user => ({id:user.id,name:name(user),role:user.role === 'USER' ? 'Student' : user.role === 'ADMIN' ? 'Teacher' : 'Support'}));
  }
  async groupAccess(actor,id) {
    const [group] = await this.db.read('SELECT id,title FROM class_groups WHERE id=? AND deleted_at IS NULL',[id]);
    if (!group) fail(404,'This group is unavailable.');
    const [enrolled] = await this.db.read('SELECT updated_at FROM class_group_students WHERE account_id=? AND group_id=?',[actor.id,id]);
    if (!staff(actor) && !enrolled) fail(403,'This chat is for members of the group.');
    return {group,epoch:staff(actor) ? 0 : enrolled.updated_at};
  }
  async member(actor,roomId) {
    signed(actor); key(roomId); await this.ensure();
    const [room] = await this.db.read('SELECT * FROM chat_rooms WHERE id=?',[roomId]);
    if (!room) fail(404,'Conversation not found.');
    if (room.kind === 'group') {
      const {epoch} = await this.groupAccess(actor,room.group_id);
      await this.db.atomic([s(`INSERT INTO chat_members(room_id,account_id,joined_seq,group_epoch,read_personal,read_learning)
        SELECT ?,?,CASE WHEN ?=0 THEN 0 ELSE COALESCE(MAX(id),0) END,?,COALESCE(MAX(id),0),COALESCE(MAX(id),0) FROM chat_messages WHERE room_id=?
        ON CONFLICT(room_id,account_id) DO UPDATE SET joined_seq=excluded.joined_seq,group_epoch=excluded.group_epoch,read_personal=excluded.read_personal,read_learning=excluded.read_learning
        WHERE chat_members.group_epoch<>excluded.group_epoch`,[roomId,actor.id,epoch,epoch,roomId])]);
    }
    const [member] = await this.db.read('SELECT * FROM chat_members WHERE room_id=? AND account_id=?',[roomId,actor.id]);
    if (!member) fail(403,'This is a private conversation.');
    return {room,member};
  }
  directCommands(actor,recipient) {
    const room = directId(actor.id,recipient);
    return [s("INSERT OR IGNORE INTO chat_rooms(id,kind) VALUES(?,'direct')",[room]),
      ...[actor.id,recipient].map(id => s('INSERT OR IGNORE INTO chat_members(room_id,account_id) VALUES(?,?)',[room,id]))];
  }
  groupMemberCommand(roomId,groupId) {
    return s(`INSERT OR IGNORE INTO chat_members(room_id,account_id,group_epoch,joined_seq,read_personal,read_learning)
      SELECT ?,c.account_id,c.updated_at,COALESCE((SELECT MAX(id) FROM chat_messages WHERE room_id=?),0),COALESCE((SELECT MAX(id) FROM chat_messages WHERE room_id=?),0),0
      FROM class_group_students c WHERE c.group_id=?`,[roomId,roomId,roomId,groupId]);
  }
  async open(actor,body) {
    signed(actor); await this.ensure();
    if (body.kind === 'group') {
      recordId(body.groupId); await this.groupAccess(actor,body.groupId);
      const id = 'group:' + body.groupId;
      await this.db.atomic([s("INSERT OR IGNORE INTO chat_rooms(id,kind,group_id) VALUES(?,'group',?)",[id,body.groupId]),this.groupMemberCommand(id,body.groupId)]);
      await this.member(actor,id); return {roomId:id};
    }
    if (body.kind !== 'direct' || !(await this.contacts(actor)).some(row => row.id === body.accountId)) fail(403,'Choose an available person.');
    await this.db.atomic(this.directCommands(actor,body.accountId));
    return {roomId:directId(actor.id,body.accountId)};
  }
  async summary(actor) {
    signed(actor); await this.ensure();
    const groups = await this.db.read(`SELECT g.id,g.title FROM class_groups g WHERE g.deleted_at IS NULL AND (?=1 OR EXISTS(SELECT 1 FROM class_group_students m WHERE m.group_id=g.id AND m.account_id=?)) ORDER BY g.title`,[+staff(actor),actor.id]);
    if (!staff(actor)) for (const group of groups) await this.open(actor,{kind:'group',groupId:group.id});
    const contacts = await this.contacts(actor), users = await this.directory();
    const rows = await this.db.read(`SELECT r.*,m.joined_seq,m.read_personal,m.read_learning,m.muted,
      (SELECT MAX(id) FROM chat_messages x WHERE x.room_id=r.id) last_id,
      (SELECT account_id FROM chat_members p WHERE p.room_id=r.id AND p.account_id<>? LIMIT 1) peer
      FROM chat_rooms r JOIN chat_members m ON m.room_id=r.id WHERE m.account_id=?
      AND (r.kind='direct' OR EXISTS(SELECT 1 FROM class_groups g WHERE g.id=r.group_id AND g.deleted_at IS NULL AND (?=1 OR EXISTS(SELECT 1 FROM class_group_students c WHERE c.group_id=g.id AND c.account_id=?))))
      ORDER BY last_id DESC,r.created_at DESC`,[actor.id,actor.id,+staff(actor),actor.id]);
    const totals = {personal:0,learning:0};
    const countsByRoom = await this.db.read(`SELECT x.room_id,x.category,COUNT(*) total,SUM(CASE WHEN x.sender_id<>? AND x.id>CASE WHEN x.category='learning' THEN m.read_learning ELSE m.read_personal END THEN 1 ELSE 0 END) unread
      FROM chat_messages x JOIN chat_members m ON m.room_id=x.room_id WHERE m.account_id=? AND (x.id>m.joined_seq OR x.category='learning') GROUP BY x.room_id,x.category`,[actor.id,actor.id]);
    const latest = await this.db.read(`SELECT x.id,x.room_id,x.body,x.category,x.sender_name FROM chat_messages x JOIN chat_members m ON m.room_id=x.room_id
      WHERE m.account_id=? AND x.id=(SELECT MAX(p.id) FROM chat_messages p WHERE p.room_id=x.room_id AND (p.id>m.joined_seq OR p.category='learning'))`,[actor.id]);
    const rooms = [];
    for (const row of rows) {
      const messages = countsByRoom.filter(message => message.room_id===row.id);
      const counts = {personal:0,learning:0}, has = {personal:false,learning:false};
      for (const message of messages) { counts[message.category] = Number(message.unread)||0; has[message.category] = message.total>0; totals[message.category] += counts[message.category]; }
      const last = latest.find(message => message.room_id===row.id);if(last)last.body=this.openText(row.id,last.body);
      rooms.push({id:row.id,kind:row.kind,groupId:row.group_id,title:row.kind === 'group' ? groups.find(g => g.id === row.group_id)?.title || 'Group' : name(users.find(u => u.id === row.peer)||{name:'Unavailable account'}),unread:counts,has,lastId:row.last_id||0,muted:!!row.muted,lastMessage:last?{id:last.id,text:last.body.slice(0,160),category:last.category,sender:last.sender_name}:null});
    }
    const [exams] = staff(actor) ? await this.db.read('SELECT COUNT(*) n,COALESCE(SUM(revision),0) revision FROM exams WHERE deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM exam_instances i WHERE i.exam_id=exams.id)') : [];
    return {rooms,groups,contacts,examRevision:exams?exams.n+':'+exams.revision:null,unread:totals,total:totals.personal+totals.learning,revision:rooms.map(row => [row.id,row.lastId,row.unread.personal,row.unread.learning].join(':')).join('|')};
  }
  async history(actor,roomId,{before=0,after=0,category:kind='personal',query=''}={}) {
    category(kind); const {member} = await this.member(actor,roomId);
    if (![before,after].every(n => Number.isSafeInteger(n) && n>=0) || before && after || typeof query !== 'string' || query.length>120) fail(400,'Invalid message search.');
    if(this.cipher&&query){
      const matches=[];let page,cursor=after||before;
      do{page=await this.history(actor,roomId,{category:kind,before:after?0:cursor,after:after?cursor:0});matches.push(...page.messages.filter(message=>message.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())));if(!page.more||!page.messages.length||matches.length>50)break;cursor=after?page.messages.at(-1).id:page.messages[0].id;}while(true);
      matches.sort((a,b)=>a.id-b.id);return {...page,messages:after?matches.slice(0,50):matches.slice(-50),more:matches.length>50};
    }
    const rows = await this.db.read(`SELECT m.*,CASE WHEN m.exam_instance_id IS NOT NULL THEN 1 ELSE a.active END assignment_active,COALESCE(m.exam_instance_id,a.exam_id) exam_id,
      (SELECT body FROM chat_messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND (p.id>? OR p.category='learning')) reply_body,
      (SELECT sender_name FROM chat_messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND (p.id>? OR p.category='learning')) reply_name,
      (SELECT category FROM chat_messages p WHERE p.id=m.reply_to AND p.room_id=m.room_id AND (p.id>? OR p.category='learning')) reply_category,
      (SELECT MIN(CASE WHEN m.category='learning' THEN p.read_learning ELSE p.read_personal END) FROM chat_members p WHERE p.room_id=m.room_id AND p.account_id<>?) peer_read
      FROM chat_messages m LEFT JOIN chat_assignments a ON a.id=m.assignment_id
      WHERE m.room_id=? AND m.category=? AND (m.id>? OR m.category='learning')
      AND (?=0 OR m.id<?) AND (?=0 OR m.id>?) AND (?='' OR instr(lower(m.body),lower(?))>0)
      ORDER BY m.id ${after?'ASC':'DESC'} LIMIT 51`,[member.joined_seq,member.joined_seq,member.joined_seq,actor.id,roomId,kind,member.joined_seq,before,before,after,after,query,query]);
    for(const row of rows){row.body=this.openText(roomId,row.body);row.reply_body=this.openText(roomId,row.reply_body);row.format_json=this.openText(roomId,row.format_json,'format_json');}
    const more = rows.length>50, page = rows.slice(0,50); if (!after) page.reverse();
    const [receipt] = await this.db.read(`SELECT MIN(${kind==='learning'?'read_learning':'read_personal'}) through FROM chat_members WHERE room_id=? AND account_id<>?`,[roomId,actor.id]);
    return {messages:page.map(row => ({id:row.id,senderId:row.sender_id,sender:row.sender_name,category:row.category,text:row.body,format:row.format_json?JSON.parse(row.format_json):null,created:row.created_at,createdMs:row.created_ms,replyTo:row.reply_to,replyText:row.reply_body,replySender:row.reply_name,replyCategory:row.reply_category,examId:row.exam_id,assignmentActive:row.assignment_active==null?null:!!row.assignment_active,read:row.peer_read>=row.id})),more,readThrough:kind==='learning'?member.read_learning:member.read_personal,peerReadThrough:Number(receipt?.through)||0};
  }
  async send(actor,body) {
    signed(actor); const {member,room} = await this.member(actor,body.roomId);
    const kind = category(body.category); key(body.clientKey);
    if (kind === 'learning' && !staff(actor)) fail(403,'Only a teacher can send announcements.');
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length>4000) fail(400,'Enter a message of up to 4000 characters.');
    const text = body.text.trim(), reply = body.replyTo == null ? null : recordId(body.replyTo);
    const format=body.format?validateColorDocument(body.format,text):null;
    if (reply) {
      const [parent] = await this.db.read("SELECT id FROM chat_messages WHERE id=? AND room_id=? AND (id>? OR category='learning')",[reply,body.roomId,member.joined_seq]);
      if (!parent) fail(404,'The original message is unavailable.');
    }
    const [previous] = await this.db.read('SELECT id,room_id,body,category,reply_to,format_json FROM chat_messages WHERE sender_id=? AND client_key=?',[actor.id,body.clientKey]);
    if(previous){previous.body=this.openText(previous.room_id,previous.body);previous.format_json=this.openText(previous.room_id,previous.format_json,'format_json');}
    if (previous) { if (previous.room_id!==body.roomId || previous.body!==text || previous.category!==kind || previous.reply_to!==reply || (previous.format_json||null)!==(format?JSON.stringify(format):null)) fail(409,'This message was already sent with different contents.'); return {id:previous.id,sent:true}; }
    const [budget] = await this.db.read('SELECT n,window_start FROM chat_send_budget WHERE account_id=?',[actor.id]);
    if (budget?.window_start>Math.floor(Date.now()/1000)-60 && budget.n>=30) fail(429,'Please wait a moment before sending more messages.');
    const result = await this.db.atomic([
      s('DROP TABLE IF EXISTS temp.chat_guard'),s('CREATE TEMP TABLE chat_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
      s(`INSERT INTO chat_guard SELECT EXISTS(SELECT 1 FROM chat_members m JOIN chat_rooms r ON r.id=m.room_id WHERE m.account_id=? AND r.id=? AND (r.kind='direct' OR ?=1 OR EXISTS(SELECT 1 FROM class_group_students c WHERE c.account_id=? AND c.group_id=r.group_id)))`,[actor.id,body.roomId,+staff(actor),actor.id]),
      ...(room.kind==='group' ? [this.groupMemberCommand(room.id,room.group_id)] : []),
      s(`INSERT INTO chat_send_budget(account_id,window_start,n) VALUES(?,unixepoch(),1) ON CONFLICT(account_id) DO UPDATE SET n=CASE WHEN window_start<=unixepoch()-60 THEN 1 ELSE n+1 END,window_start=CASE WHEN window_start<=unixepoch()-60 THEN unixepoch() ELSE window_start END`,[actor.id]),
      s('INSERT INTO chat_guard SELECT n<=30 FROM chat_send_budget WHERE account_id=?',[actor.id]),
      s('INSERT INTO chat_messages(room_id,sender_id,sender_name,category,body,reply_to,client_key,created_ms,format_json) VALUES(?,?,?,?,?,?,?,?,?)',[body.roomId,actor.id,name(actor),kind,this.sealText(body.roomId,text),reply,body.clientKey,Date.now(),this.sealText(body.roomId,format?JSON.stringify(format):null,'format_json')]),
      s('SELECT last_insert_rowid() id'),s('DROP TABLE temp.chat_guard')]);
    return {id:Number(result.at(-2)?.rows?.[0]?.[0]?.value),sent:true};
  }
  async read(actor,body) {
    const {member} = await this.member(actor,body.roomId); category(body.category);
    if (!Number.isSafeInteger(body.through) || body.through<0) fail(400,'Invalid reading position.');
    const [last] = await this.db.read("SELECT MAX(id) id FROM chat_messages WHERE room_id=? AND category=? AND id<=? AND (id>? OR category='learning')",[body.roomId,body.category,body.through,member.joined_seq]);
    const column = body.category === 'learning' ? 'read_learning' : 'read_personal';
    await this.db.atomic([s(`UPDATE chat_members SET ${column}=MAX(${column},?) WHERE room_id=? AND account_id=?`,[last.id||0,body.roomId,actor.id])]);
    return {read:true};
  }
  async mute(actor,body) {
    await this.member(actor,body.roomId); if (typeof body.muted !== 'boolean') fail(400,'Invalid notification setting.');
    await this.db.atomic([s('UPDATE chat_members SET muted=? WHERE room_id=? AND account_id=?',[+body.muted,body.roomId,actor.id])]);
    return {saved:true};
  }
  async assignStudent(actor,accountId,groupId) {
    signed(actor); if (!staff(actor)) fail(403,'Only a teacher can assign students.'); await this.ensure();
    if (!(await this.directory()).some(user => user.id===accountId && user.role==='USER')) fail(404,'Student not found.');
    const service = new GroupService(this.db);
    if (groupId!=null) await service.activeGroup(groupId);
    const [old] = await this.db.read('SELECT group_id FROM class_group_students WHERE account_id=?',[accountId]);
    if (old?.group_id===groupId) return {saved:true};
    const commands = groupId==null ? [s('DELETE FROM class_group_students WHERE account_id=?',[accountId])] : [
      s('INSERT INTO group_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND deleted_at IS NULL)',[groupId]),
      s('INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET group_id=excluded.group_id,assigned_by=excluded.assigned_by,updated_at=unixepoch()',[accountId,groupId,actor.id]),
      s('UPDATE class_groups SET revision=revision+1 WHERE id=?',[groupId]),
      s(`INSERT INTO chat_members(room_id,account_id,joined_seq,group_epoch,read_personal,read_learning)
        SELECT r.id,?,COALESCE((SELECT MAX(id) FROM chat_messages WHERE room_id=r.id),0),c.updated_at,COALESCE((SELECT MAX(id) FROM chat_messages WHERE room_id=r.id),0),0
        FROM chat_rooms r JOIN class_group_students c ON c.group_id=r.group_id WHERE c.account_id=? AND r.kind='group'
        ON CONFLICT(room_id,account_id) DO UPDATE SET joined_seq=excluded.joined_seq,group_epoch=excluded.group_epoch,read_personal=excluded.read_personal,read_learning=excluded.read_learning`,[accountId,accountId])];
    await service.groupTransaction(commands); return {saved:true};
  }
  noticeCommands(actor,recipients,assignment,body,clientKey) {
    return recipients.flatMap(recipient => [...this.directCommands(actor,recipient),
      s("INSERT OR IGNORE INTO chat_messages(room_id,sender_id,sender_name,category,body,assignment_id,client_key,created_ms) VALUES(?,?,?,'learning',?,?,?,?)",[directId(actor.id,recipient),actor.id,name(actor),this.sealText(directId(actor.id,recipient),body),assignment,clientKey+':'+recipient,Date.now()])]);
  }
  async assign(actor,body) {
    signed(actor); if (!staff(actor)) fail(403,'Only a teacher can assign exams.'); await this.ensure();
    recordId(body.examId); key(body.clientKey);
    if (!['group','student'].includes(body.targetKind) || !['assign','unassign'].includes(body.action)) fail(400,'Invalid assignment.');
    const targetId = String(body.targetId); key(targetId);
    const payload = JSON.stringify([body.targetKind,targetId,body.examId,body.action]);
    const [done] = await this.db.read('SELECT result_json,payload_json FROM chat_mutations WHERE actor_id=? AND client_key=?',[actor.id,body.clientKey]);
    if (done) { if (done.payload_json!==payload) fail(409,'Assignment request changed.'); return JSON.parse(done.result_json); }
    const [exam] = await this.db.read('SELECT id,title,published,hidden_from_students,lesson_date,revision FROM exams WHERE id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM exam_instances i WHERE i.exam_id=exams.id)',[body.examId]);
    if (!exam) fail(404,'Exam not found.');
    if(body.action==='assign'&&!exam.published)fail(409,'Publish the exam before assigning it.');
    let recipients, group,groupMembers;
    if (body.targetKind === 'group') {
      recordId(Number(targetId)); group = await new GroupService(this.db).activeGroup(Number(targetId));
      if (body.expectedRevision!=null && body.expectedRevision!==group.revision) fail(409,'The group changed. Reload Accounts.');
      recipients = (await this.db.read('SELECT account_id FROM class_group_students WHERE group_id=?',[group.id])).map(row => row.account_id);
      if(body.subgroupId!=null){groupMembers=[...recipients];const active=new Set((await this.directory()).filter(user=>user.role==='USER'&&user.active!==0&&user.active!==false&&!user.revoked&&!user.is_personal_data_revoked).map(user=>user.id));recipients=recipients.filter(id=>active.has(id));if(!recipients.length)fail(409,'No active students in this subgroup.');}
    } else {
      const student = (await this.directory()).find(user => user.id===targetId && user.role==='USER' && (body.subgroupId==null || user.active!==0&&user.active!==false&&!user.revoked&&!user.is_personal_data_revoked));
      if (!student) fail(404,'Student not found.'); recipients = [targetId];
    }
    const [current] = await this.db.read('SELECT id FROM chat_assignments WHERE exam_id=? AND target_kind=? AND target_id=? AND active=1',[exam.id,body.targetKind,targetId]);
    const [link] = body.targetKind==='group' ? await this.db.read('SELECT group_id FROM class_group_exams WHERE exam_id=?',[exam.id]) : [];
    const same = body.action==='assign' && (body.targetKind==='group' ? link?.group_id===group.id && current : current);
    const absent = body.action==='unassign' && !current && (body.targetKind==='student' || link?.group_id!==group.id);
    if (same || absent) return {saved:true,unchanged:true};
    const assignment = current?.id || crypto.randomUUID(), title = exam.published ? exam.title : 'Exam';
    const message = (body.action==='assign' ? 'Exam assigned: ' : 'Exam assignment cancelled: ') + title + (exam.lesson_date ? '\nDate: '+exam.lesson_date : '') + (group ? '\nGroup: '+group.title : '');
    const commands = [s('DROP TABLE IF EXISTS temp.chat_guard'),s('CREATE TEMP TABLE chat_guard(ok INTEGER NOT NULL CHECK(ok=1))')];
    commands.push(s('INSERT INTO chat_guard SELECT EXISTS(SELECT 1 FROM exams WHERE id=? AND revision=? AND deleted_at IS NULL)',[exam.id,exam.revision]));
    if(body.subgroupId!=null)commands.push(body.targetKind==='group'?s('INSERT INTO chat_guard SELECT EXISTS(SELECT 1 FROM class_groups g JOIN class_group_exams e ON e.group_id=g.id WHERE g.id=? AND e.exam_id=? AND g.deleted_at IS NULL)',[body.subgroupId,exam.id]):s('INSERT INTO chat_guard SELECT EXISTS(SELECT 1 FROM class_group_students s JOIN class_groups g ON g.id=s.group_id JOIN class_group_exams e ON e.group_id=g.id WHERE s.account_id=? AND g.id=? AND e.exam_id=? AND g.deleted_at IS NULL)',[targetId,body.subgroupId,exam.id]));
    if(body.action==='assign'&&!current)commands.push(...await instanceCommands(this.db,exam,assignment,recipients,this.storage,{reviewer:{id:actor.id,name:name(actor)},students:await this.directory()}));
    commands.push(s("INSERT INTO chat_guard SELECT COALESCE((SELECT id FROM chat_assignments WHERE exam_id=? AND target_kind=? AND target_id=? AND active=1),'')=?",[exam.id,body.targetKind,targetId,current?.id||'']));
    if (group) {
      commands.push(s('INSERT INTO chat_guard SELECT EXISTS(SELECT 1 FROM class_groups WHERE id=? AND revision=? AND deleted_at IS NULL)',[group.id,group.revision]));
      commands.push(s('INSERT INTO chat_guard SELECT COALESCE((SELECT group_id FROM class_group_exams WHERE exam_id=?),0)=?',[exam.id,link?.group_id||0]));
      const members=groupMembers||recipients;
      commands.push(s(`INSERT INTO chat_guard SELECT COUNT(*)=? AND COUNT(CASE WHEN account_id IN (${members.length?members.map(()=>'?').join(','):"''"}) THEN 1 END)=? FROM class_group_students WHERE group_id=?`,[members.length,...members,members.length,group.id]));
      if (body.action==='assign') {
        // Moving an existing assignment also cancels its old group's notices.
        if (link && link.group_id!==group.id) {
          const old = await this.db.read("SELECT id FROM chat_assignments WHERE exam_id=? AND target_kind='group' AND target_id=? AND active=1",[exam.id,String(link.group_id)]);
          const oldMembers = await this.db.read('SELECT account_id FROM class_group_students WHERE group_id=?',[link.group_id]);
          for (const row of old) commands.push(s('UPDATE chat_assignments SET active=0 WHERE id=?',[row.id]),s("UPDATE exam_instances SET active=0 WHERE assignment_id=? AND status<>'completed'",[row.id]),...this.noticeCommands(actor,oldMembers.map(m => m.account_id),row.id,'Exam assignment cancelled: '+title,body.clientKey+':cancel'));
        }
        commands.push(s('INSERT INTO class_group_exams(group_id,exam_id) VALUES(?,?) ON CONFLICT(exam_id) DO UPDATE SET group_id=excluded.group_id',[group.id,exam.id]));
      } else commands.push(s('DELETE FROM class_group_exams WHERE group_id=? AND exam_id=?',[group.id,exam.id]));
      commands.push(s('UPDATE class_groups SET revision=revision+1 WHERE id=?',[group.id]));
    }
    if (body.action==='assign' && !current) commands.push(s('INSERT INTO chat_assignments(id,exam_id,target_kind,target_id) VALUES(?,?,?,?)',[assignment,exam.id,body.targetKind,targetId]));
    if (body.action==='unassign') {
      commands.push(s("UPDATE exam_instances SET active=0 WHERE assignment_id=? AND status<>'completed'",[assignment]));
      if (!current) commands.push(s('INSERT INTO chat_assignments(id,exam_id,target_kind,target_id,active) VALUES(?,?,?,?,0)',[assignment,exam.id,body.targetKind,targetId]));
      else commands.push(s('UPDATE chat_assignments SET active=0 WHERE id=?',[assignment]));
    }
    commands.push(...this.noticeCommands(actor,recipients,assignment,message,body.clientKey));
    const result = {saved:true};
    commands.push(s('INSERT INTO chat_mutations(actor_id,client_key,result_json,payload_json) VALUES(?,?,?,?)',[actor.id,body.clientKey,JSON.stringify(result),payload]),s('DROP TABLE temp.chat_guard'));
    await this.db.atomic(commands); return result;
  }
  async assignInSubgroup(actor,body){
    signed(actor);if(!staff(actor))fail(403,'Only a teacher can assign exams.');
    recordId(body.groupId);recordId(body.examId);await this.ensure();
    const whole=body.targetKind==='group';
    if(body.targetKind!=null&&!['student','group'].includes(body.targetKind))fail(400,'Invalid assignment recipient.');
    const rows=await this.db.read(whole?'SELECT 1 FROM class_group_exams e JOIN class_groups g ON g.id=e.group_id WHERE e.exam_id=? AND g.id=? AND g.deleted_at IS NULL':`SELECT 1 FROM class_group_exams e JOIN class_groups g ON g.id=e.group_id JOIN class_group_students s ON s.group_id=g.id WHERE e.exam_id=? AND g.id=? AND g.deleted_at IS NULL AND s.account_id=?`,whole?[body.examId,body.groupId]:[body.examId,body.groupId,body.studentId]);
    if(!rows.length)fail(403,'Choose a student in the current exam subgroup.');
    return this.assign(actor,{examId:body.examId,targetKind:whole?'group':'student',targetId:whole?String(body.groupId):body.studentId,action:'assign',clientKey:body.clientKey,subgroupId:body.groupId});
  }
  async assignments(actor) {
    signed(actor); await this.ensure();
    return {assignments:await this.db.read(`SELECT a.id,a.exam_id AS examId,a.target_kind AS targetKind,a.target_id AS targetId FROM chat_assignments a WHERE a.active=1 AND (?=1 OR (a.target_kind='student' AND a.target_id=?) OR (a.target_kind='group' AND EXISTS(SELECT 1 FROM class_group_students c WHERE c.account_id=? AND CAST(c.group_id AS TEXT)=a.target_id)))`,[+staff(actor),actor.id,actor.id])};
  }
  async examLink(actor,id) {
    recordId(id);await this.ensure();
    const [exact]=await this.db.read('SELECT i.account_id,i.active FROM exam_instances i JOIN exams e ON e.id=i.exam_id WHERE i.exam_id=? AND e.deleted_at IS NULL',[id]);
    if(exact){
      if(!exact.active||!staff(actor)&&exact.account_id!==actor.id)fail(404,'This exam is not currently available.');
      return {examId:id,...(staff(actor)?{studentId:exact.account_id}:{})};
    }
    if(!staff(actor)){
      const [instance]=await this.db.read('SELECT exam_id FROM exam_instances WHERE (source_exam_id=? OR exam_id=?) AND account_id=? AND active=1 ORDER BY exam_id DESC LIMIT 1',[id,id,actor.id]);
      if(instance){const shown=await new ExamService(this.db).list(actor);if(!shown.some(exam=>exam.id===instance.exam_id))fail(404,'This exam is not currently available.');return {examId:instance.exam_id};}
    }
    const shown = await new ExamService(this.db).list(actor);
    if (!shown.some(exam => exam.id===id)) fail(404,'This exam is not currently available.');
    if (!staff(actor)) {
      const {assignments} = await this.assignments(actor);
      if (!assignments.some(row => row.examId===id)) fail(403,'This exam assignment is no longer active.');
    }
    return {examId:id};
  }
}
