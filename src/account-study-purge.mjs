import {statement as s,StudyError} from './learning-study.mjs';

// A developer-only caller has already archived and disabled the account.
// Expand actual foreign keys, rather than keeping an incomplete list of tables.
export async function purgeStudyAccount(db,account,media){
  if(!/^[a-f0-9]{16,64}$/.test(account))throw new StudyError(400,'Invalid account.');
  const names=(await db.read("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).map(row=>row.name).filter(name=>/^[a-z][a-z_0-9]*$/.test(name)&&name!=='account_archives');
  const tables=new Map();
  for(const name of names){
    const columns=await db.read('PRAGMA table_info('+name+')');
    const keys=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
    if(keys.length)tables.set(name,{name,columns:columns.map(c=>c.name),keys,foreign:await db.read('PRAGMA foreign_key_list('+name+')'),rows:new Map()});
  }
  const add=(table,rows)=>{let count=0;for(const row of rows){const key=JSON.stringify(table.keys.map(k=>row[k]));if(!table.rows.has(key)){table.rows.set(key,row);count++;}}return count;};
  const collect=async(name,sql,args)=>{const table=tables.get(name);if(table)add(table,await db.read('SELECT * FROM '+name+' WHERE '+sql,args));};
  for(const table of tables.values()){
    const columns=table.columns.filter(c=>['account_id','user_id','student_id','sender_id','recipient_id','actor_id'].includes(c));
    if(columns.length)await collect(table.name,columns.map(c=>c+'=?').join(' OR '),columns.map(()=>account));
  }
  await collect('account_refs','id=?',[account]);
  const profiles=tables.has('profile_members')?await db.read('SELECT profile_id FROM profile_members WHERE account_id=? AND NOT EXISTS(SELECT 1 FROM profile_members other WHERE other.profile_id=profile_members.profile_id AND other.account_id<>?)',[account,account]):[];
  const profileIds=profiles.map(r=>r.profile_id);
  for(const table of tables.values())for(const column of ['owner_profile_id','profile_id'])if(table.columns.includes(column)&&profileIds.length)await collect(table.name,column+' IN (SELECT value FROM json_each(?))',[JSON.stringify(profileIds)]);
  if(profileIds.length)await collect('study_profiles','id IN (SELECT value FROM json_each(?))',[JSON.stringify(profileIds)]);
  const examIds=[...(tables.get('exam_instances')?.rows.values()||[])].map(r=>r.exam_id);
  if(examIds.length)await collect('exams','id IN (SELECT value FROM json_each(?))',[JSON.stringify(examIds)]);
  if(examIds.length&&tables.get('chat_messages')?.columns.includes('exam_instance_id'))await collect('chat_messages','exam_instance_id IN (SELECT value FROM json_each(?))',[JSON.stringify(examIds)]);
  await collect('chat_rooms',"kind='direct' AND (id LIKE ? OR id LIKE ?)",['direct:'+account+':%','direct:%:'+account]);
  await collect('chat_assignments',"target_kind='student' AND target_id=?",[account]);
  if(tables.has('catalog_documents'))await collect('catalog_documents',"EXISTS(SELECT 1 FROM json_tree(value_json) WHERE type='text' AND value=?) OR key=?",[account,account]);
  // Repeated expansion handles composite keys and references several levels deep.
  let changed=true;
  while(changed){
    changed=false;
    for(const table of tables.values()){
      const groups=new Map();
      for(const edge of table.foreign){if(edge.table===table.name)continue;const set=groups.get(edge.id)||[];set.push(edge);groups.set(edge.id,set);}
      for(const edges of groups.values()){
        edges.sort((a,b)=>a.seq-b.seq);
        const parent=tables.get(edges[0].table);if(!parent?.rows.size)continue;
        const values=[...parent.rows.values()].map(row=>edges.map((e,i)=>row[e.to||parent.keys[i]]));
        const predicate='EXISTS(SELECT 1 FROM json_each(?) target WHERE '+edges.map((e,i)=>table.name+'.'+e.from+"=json_extract(target.value,'$["+i+"]')").join(' AND ')+')';
        if(add(table,await db.read('SELECT * FROM '+table.name+' WHERE '+predicate,[JSON.stringify(values)])))changed=true;
      }
    }
  }
  const entityTables={'profile':'study_profiles','card':'cards','lesson':'lessons','exam':'exams','exam-block':'exam_blocks','song':'library_items','text':'library_items'};
  for(const [kind,name] of Object.entries(entityTables)){
    const ids=[...(tables.get(name)?.rows.values()||[])].filter(row=>name!=='library_items'||row.kind===kind).map(row=>String(row.id));
    if(!ids.length)continue;
    await collect('content_archive','entity_type=? AND entity_id IN (SELECT value FROM json_each(?))',[kind,JSON.stringify(ids)]);
    await collect('legacy_ids','entity_kind=? AND CAST(target_id AS TEXT) IN (SELECT value FROM json_each(?))',[kind,JSON.stringify(ids)]);
    await collect('entity_id_legacy','entity_kind=? AND CAST(new_id AS TEXT) IN (SELECT value FROM json_each(?))',[kind,JSON.stringify(ids)]);
  }
  const commands=[],ordered=[],seen=new Set(),visiting=new Set();
  const visit=table=>{if(seen.has(table.name))return;if(visiting.has(table.name))throw new StudyError(409,'Cyclic account references require explicit cleanup.');visiting.add(table.name);for(const child of tables.values())if(child.name!==table.name&&child.rows.size&&child.foreign.some(e=>e.table===table.name))visit(child);visiting.delete(table.name);seen.add(table.name);ordered.push(table);};
  for(const table of tables.values())if(table.rows.size)visit(table);
  const objectKeys=new Set();
  const inspect=value=>{if(typeof value==='string'){if(/^(stage-local\/|migration-inline\/)/.test(value))objectKeys.add(value);if(value.startsWith('{')||value.startsWith('[')){try{inspect(JSON.parse(value));}catch{}}}else if(value&&typeof value==='object')for(const v of Object.values(value))inspect(v);};
  for(const table of ordered){
    const values=[...table.rows.values()];for(const row of values)inspect(row);
    // Keep another person's reply; remove only its reference to a deleted message.
    for(const edge of table.foreign.filter(e=>e.table===table.name)){
      if(table.keys.includes(edge.from))throw new StudyError(409,'Unsupported self-reference in account data.');
      commands.push(s('UPDATE '+table.name+' SET '+edge.from+'=NULL WHERE '+edge.from+' IN (SELECT value FROM json_each(?))',[JSON.stringify(values.map(r=>r[edge.to||table.keys[0]]))]));
    }
    // Keep statements bounded even when a student has a large history.
    for(let offset=0;offset<values.length;offset+=100){
      const keys=values.slice(offset,offset+100).map(row=>table.keys.map(k=>row[k]));
      commands.push(s('DELETE FROM '+table.name+' WHERE EXISTS(SELECT 1 FROM json_each(?) target WHERE '+table.keys.map((k,i)=>table.name+'.'+k+"=json_extract(target.value,'$["+i+"]')").join(' AND ')+')',[JSON.stringify(keys)]));
    }
  }
  // Delete media before rows; failed storage operations leave retriable ownership records.
  for(const key of objectKeys){
    let shared=false;
    for(const table of tables.values()){
      const columns=table.columns.filter(c=>/json|media_key|object_key/.test(c));
      if(!columns.length)continue;
      const rows=await db.read('SELECT * FROM '+table.name+' WHERE '+columns.map(c=>'instr('+c+',?)>0').join(' OR '),columns.map(()=>key));
      if(rows.some(row=>!table.rows.has(JSON.stringify(table.keys.map(k=>row[k]))))){shared=true;break;}
    }
    if(!shared){if(!media?.delete)throw new StudyError(503,'Account media deletion unavailable.');await media.delete(key);}
  }
  if(commands.length)await db.atomic(commands);
  return {removed:true};
}
