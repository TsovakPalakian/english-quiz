export async function assignedExamIds(db,account){
  const tables=new Set((await db.read("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('exam_instances','chat_assignments')")).map(row=>row.name));
  const ids=new Set();
  if(tables.has('exam_instances'))for(const row of await db.read('SELECT exam_id FROM exam_instances WHERE account_id=? AND active=1',[account]))ids.add(row.exam_id);
  if(tables.has('chat_assignments'))for(const row of await db.read("SELECT exam_id FROM chat_assignments WHERE active=1 AND ((target_kind='student' AND target_id=?) OR (target_kind='group' AND EXISTS(SELECT 1 FROM class_group_students WHERE account_id=? AND CAST(group_id AS TEXT)=target_id)))",[account,account]))ids.add(row.exam_id);
  return ids;
}

export function assignedExamSql(column,ids){
  // Only database integer IDs enter this predicate, never user-supplied strings.
  const values=[...ids].filter(value=>Number.isSafeInteger(value)&&value>0);
  return values.length?column+' IN ('+values.join(',')+')':'0';
}
