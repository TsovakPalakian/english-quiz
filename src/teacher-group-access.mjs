// Server-side teacher ↔ group ↔ student authorization. Fail closed for ADMIN.

function parseTeacherIds(valueJson){
  try{
    const ids=JSON.parse(valueJson)?.teacherIds;
    return Array.isArray(ids)?ids.map(String):[];
  }catch{
    return [];
  }
}

export async function teacherMayManageStudent(db,actor,studentId){
  if(!actor?.id||typeof studentId!=='string'||!studentId)return false;
  if(actor.role==='DEVELOPER')return true;
  if(actor.role!=='ADMIN'||!db?.read)return false;
  try{
    const [membership]=await db.read(
      'SELECT group_id FROM class_group_students WHERE account_id=?',
      [studentId]
    );
    if(membership?.group_id==null)return false;
    const [doc]=await db.read(
      "SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers' AND key=?",
      [String(membership.group_id)]
    );
    if(!doc)return false;
    const ids=parseTeacherIds(doc.value_json);
    return ids.length>0&&ids.includes(String(actor.id));
  }catch{
    return false;
  }
}

export async function teacherGroupIds(db,actor){
  if(!actor?.id||!db?.read)return [];
  if(actor.role==='DEVELOPER'){
    try{
      return (await db.read('SELECT id FROM class_groups WHERE deleted_at IS NULL')).map(row=>Number(row.id));
    }catch{
      return [];
    }
  }
  if(actor.role!=='ADMIN')return [];
  try{
    const rows=await db.read(
      "SELECT key,value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'"
    );
    return rows.flatMap(row=>{
      const ids=parseTeacherIds(row.value_json);
      return ids.includes(String(actor.id))?[Number(row.key)]:[];
    }).filter(id=>Number.isSafeInteger(id));
  }catch{
    return [];
  }
}

export async function teacherMayTeachGroup(db,actor,groupId){
  if(!actor?.id||groupId==null||groupId==='')return false;
  if(actor.role==='DEVELOPER')return true;
  if(actor.role!=='ADMIN')return false;
  const id=Number(groupId);
  if(!Number.isSafeInteger(id))return false;
  return (await teacherGroupIds(db,actor)).includes(id);
}

export async function teachersVisibleTo(db,actor){
  const visible=new Set();
  if(!actor?.id)return visible;
  visible.add(String(actor.id));
  if(actor.role==='DEVELOPER')return visible;
  if(actor.role!=='ADMIN'||!db?.read)return visible;
  try{
    const rows=await db.read(
      "SELECT value_json FROM catalog_documents WHERE namespace='accounts-group-teachers'"
    );
    for(const row of rows){
      const ids=parseTeacherIds(row.value_json);
      if(ids.includes(String(actor.id)))for(const id of ids)visible.add(String(id));
    }
  }catch{}
  return visible;
}
