import {StudyError,statement as s} from './turso-study.mjs';

const paired=actor=>['Tsovak','TsovakDev'].includes(actor?.login);
export async function themeAccount(db,actor){
  if(!paired(actor))return actor.id;
  const [row]=await db.read("SELECT value_json FROM account_settings WHERE account_id=? AND key='pairedThemeAccount'",[actor.id]);
  const value=row?JSON.parse(row.value_json):null;
  return typeof value==='string'&&/^[a-f0-9]{16,64}$/.test(value)?value:actor.id;
}
export async function themeProfiles(db,actor){
  const owner=await themeAccount(db,actor);
  const rows=await db.read(`SELECT DISTINCT m.profile_id FROM profile_members m WHERE m.account_id=?
    OR (?=1 AND m.account_id IN (SELECT account_id FROM account_settings WHERE key='pairedThemeAccount' AND value_json=?))`,[actor.id,+paired(actor),JSON.stringify(owner)]);
  return rows.map(row=>String(row.profile_id));
}
// Called only with the reserved twin ID obtained from the live account database.
export async function ensurePairedThemes(db,actor,twinId){
  if(!paired(actor)||! /^[a-f0-9]{16,64}$/.test(twinId||'')||twinId===actor.id)return;
  const ids=[actor.id,twinId].sort(),owner=ids[0];
  for(let attempt=0;attempt<3;attempt++){
    const rows=await db.read("SELECT account_id,key,value_json,revision FROM account_settings WHERE account_id IN (?,?) AND key IN ('theme','customThemes','pairedThemeAccount')",ids);
    if(ids.every(id=>rows.some(row=>row.account_id===id&&row.key==='pairedThemeAccount'&&JSON.parse(row.value_json)===owner)))return;
    const student=actor.login==='Tsovak'?actor.id:twinId;
    const first=rows.find(row=>row.account_id===student&&row.key==='customThemes');
    const second=rows.find(row=>row.account_id!==student&&row.key==='customThemes');
    const merged=new Map();
    for(const row of [first,second])for(const theme of row?JSON.parse(row.value_json):[]){
      if(!merged.has(theme.id))merged.set(theme.id,theme);
      else if(!merged.get(theme.id).photo&&theme.photo)merged.set(theme.id,theme);
    }
    const choice=rows.find(row=>row.account_id===student&&row.key==='theme')||rows.find(row=>row.key==='theme');
    const changes=ids.map(id=>s('INSERT OR IGNORE INTO account_refs(id) VALUES(?)',[id]));
    for(const key of ['customThemes','theme']){
      const old=rows.find(row=>row.account_id===owner&&row.key===key);
      const value=key==='customThemes'?JSON.stringify([...merged.values()]):choice?.value_json||'"almond"';
      changes.push(s(`INSERT INTO account_settings(account_id,key,value_json,revision) VALUES(?,?,?,1)
        ON CONFLICT(account_id,key) DO UPDATE SET value_json=excluded.value_json,revision=account_settings.revision+1 WHERE account_settings.revision=?`,[owner,key,value,old?.revision||0]),
        s('INSERT INTO mutation_guard SELECT changes()=1'));
    }
    for(const id of ids)changes.push(s("INSERT OR IGNORE INTO account_refs(id) VALUES(?)",[id]),
      s("INSERT OR IGNORE INTO account_settings(account_id,key,value_json) VALUES(?,'pairedThemeBackup',?)",[id,JSON.stringify(rows.filter(row=>row.account_id===id))]),
      s("INSERT INTO account_settings(account_id,key,value_json) VALUES(?,'pairedThemeAccount',?) ON CONFLICT(account_id,key) DO UPDATE SET value_json=excluded.value_json,revision=account_settings.revision+1",[id,JSON.stringify(owner)]));
    try{await db.atomic([s('CREATE TEMP TABLE IF NOT EXISTS mutation_guard(ok INTEGER CHECK(ok=1))'),...changes]);return;}
    catch(error){if(attempt===2)throw new StudyError(409,'Theme preferences changed. Please retry.');}
  }
}
