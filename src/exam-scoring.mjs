const answered = part => ['task','quiz','exercise'].includes(part.type);
const number = value => Number(String(value).replace(',','.'));
export const scoringKey = part => part.assignmentKey || part.assignmentId || ('part-'+part.id);
export function examChildren(parts,part){
  return parts.filter(child=>child!==part&&answered(child)&&child.assignmentKey&&(child.assignmentKey===(part.assignmentId||('part-'+part.id))));
}
export function examElementMax(part){
  const criteria=String(part.criteria||'').split('\n').filter(line=>line.includes('|'));
  return criteria.length?criteria.reduce((sum,line)=>sum+number(line.split('|')[1]),0):number(part.maxPoints??(part.type==='task'?'':1));
}
export function examTaskMax(parts,part){const children=examChildren(parts,part);return children.length?Number(children.reduce((sum,child)=>sum+examTaskMax(parts,child),0).toFixed(10)):examElementMax(part);}
export function examGrading(parts){return parts.filter(part=>answered(part)&&!examChildren(parts,part).length).map(part=>({part,index:0,item:part,max:examElementMax(part)}));}
export function validateExamScoring(parts){
  if(!parts.some(part=>part.scoringVersion===2))return;
  const ids=new Set(parts.filter(answered).map(part=>part.assignmentId||('part-'+part.id)));
  for(const part of parts){
    if(part.assignmentKey&&!ids.has(part.assignmentKey))throw new Error('Choose an existing task for Assignment.');
    const seen=new Set();let current=part;
    while(current?.assignmentKey){if(seen.has(current))throw new Error('Tasks cannot contain each other in a cycle.');seen.add(current);current=parts.find(row=>(row.assignmentId||('part-'+row.id))===current.assignmentKey);}
  }
  for(const {part,max} of examGrading(parts))if(part.maxPoints==null||part.maxPoints===''||!Number.isFinite(max)||max<=0||max>1e12)throw new Error('Set Maximum points explicitly for '+(part.title||part.type)+'.');
}
