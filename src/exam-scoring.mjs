export const examAnswered = part => !part.contentGroup&&(['task','quiz','exercise'].includes(part.type)||part.scoringVersion>=3&&(['cards','vocab'].includes(part.type)||part.type==='text'&&part.answerEnabled===true));
const answered=examAnswered;
const number = value => Number(String(value).replace(',','.'));
export const scoringKey = part => part.assignmentKey || part.assignmentId || ('part-'+part.id);
export function examChildren(parts,part){
  const hasAnswer=(candidate,seen=new Set())=>{if(answered(candidate))return true;if(!candidate.contentGroup||seen.has(candidate))return false;seen.add(candidate);return parts.some(child=>child!==candidate&&child.assignmentKey===(candidate.assignmentId||'part-'+candidate.id)&&hasAnswer(child,new Set(seen)));};
  return parts.filter(child=>child!==part&&hasAnswer(child)&&child.assignmentKey&&(child.assignmentKey===(part.assignmentId||('part-'+part.id))));
}
export function examAnswerQuestions(parts){
  return parts.filter(part=>answered(part)&&!examChildren(parts,part).length).flatMap(part=>{
    if(part.scoringVersion>=3&&['Match','Memory'].includes(part.quizType))return [{part,index:0,item:part,max:examElementMax(part)}];
    const items=['task','text'].includes(part.type)?[part]:part.items||[];
    return items.map((item,index)=>({part,index,item,max:item.criteria?examElementMax(item):number(item.maxPoints??part.maxPoints??1)}));
  });
}
export function examElementMax(part){
  const criteria=String(part.criteria||'').split('\n').filter(line=>line.includes('|'));
  return criteria.length?criteria.reduce((sum,line)=>sum+number(line.split('|')[1]),0):number(part.maxPoints??(part.type==='task'?'':1));
}
export function examTaskMax(parts,part,seen=new Set()){
  if(seen.has(part))return 0;seen.add(part);
  const children=examChildren(parts,part);
  if(children.length)return Number(children.reduce((sum,child)=>sum+examTaskMax(parts,child,new Set(seen)),0).toFixed(10));
  if(part.contentGroup)return 0;
  return part.scoringVersion>=3?Number(examAnswerQuestions([part]).reduce((sum,q)=>sum+q.max,0).toFixed(10)):examElementMax(part);
}
export function examGrading(parts){return parts.flatMap(part=>{
  if(!answered(part)||examChildren(parts,part).length)return [];
  return part.scoringVersion>=3?examAnswerQuestions([part]):[{part,index:0,item:part,max:examElementMax(part)}];
});}
export function validateContentGroups(parts){
  if(!parts.some(part=>part.contentGroup))return;
  const byKey=new Map();for(const part of parts){byKey.set(part.assignmentId||'part-'+part.id,part);byKey.set(String(part.id),part);}
  for(const part of parts){if(part.contentGroup&&part.type!=='task')throw new Error('Invalid Content group.');const seen=new Set();let current=part;while(current?.assignmentKey){if(seen.has(current))throw new Error('Content groups cannot contain a cycle.');seen.add(current);current=byKey.get(current.assignmentKey);if(!current)throw new Error('Choose an existing Assignment.');}}
}
export function validateExamScoring(parts,allowIncomplete=false){
  validateContentGroups(parts);
  if(!parts.some(part=>part.scoringVersion>=2))return;
  const ids=new Set(parts.filter(part=>answered(part)||part.contentGroup).map(part=>part.assignmentId||('part-'+part.id)));
  for(const part of parts){
    if(part.scoringVersion>=3&&part.type==='quiz'){
      if(part.quizType==='Flip')throw new Error('Flip is not available in exams.');
      if(!allowIncomplete&&!(part.items||[]).length)throw new Error('Add at least one question.');
      if(!allowIncomplete&&['Match','Memory'].includes(part.quizType)&&(part.items||[]).length<2)throw new Error('Add at least two pairs.');
    }
    if(part.assignmentKey&&!ids.has(part.assignmentKey))throw new Error('Choose an existing task for Assignment.');
    const seen=new Set();let current=part;
    while(current?.assignmentKey){if(seen.has(current))throw new Error('Tasks cannot contain each other in a cycle.');seen.add(current);current=parts.find(row=>(row.assignmentId||('part-'+row.id))===current.assignmentKey);}
  }
  for(const {part,item,max} of examGrading(parts)){
    const source=part.scoringVersion>=3?item:part;
    if(allowIncomplete&&part.scoringVersion>=3&&(source.maxPoints==null||source.maxPoints===''))continue;
    if(source.maxPoints==null||source.maxPoints===''||!Number.isFinite(max)||max<=0||max>1e12)throw new Error('Set Maximum points explicitly for '+(part.title||part.type)+'.');
    if(part.scoringVersion>=3&&part.quizType==='Flip')throw new Error('Flip is not available in exams.');
    if(part.scoringVersion>=3&&['Match','Memory'].includes(part.quizType)&&(part.items||[]).length<2&&!allowIncomplete)throw new Error('Add at least two pairs.');
    if(part.scoringVersion>=3&&(['Choice','Select all','Odd one out'].includes(part.quizType)||part.type==='exercise'&&item.kind!=='write')&&(item.options||[]).length<2)throw new Error('At least two options are required.');
  }
}
export function memoryDeck(part){
  const faces=(part.items||[]).flatMap((pair,index)=>[{id:'l'+index,pair:index,text:pair.left||''},{id:'r'+index,pair:index,text:pair.right||''}]);
  let seed=String(part.id||'memory').split('').reduce((sum,c)=>(Math.imul(sum,31)+c.charCodeAt(0))>>>0,17);
  for(let i=faces.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[faces[i],faces[j]]=[faces[j],faces[i]];}
  return faces;
}
export function memoryScore(part,value,previous){
  let log;
  try{log=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('Invalid Memory history.');}
  if(!log||!Array.isArray(log.turns)||log.turns.length>4000)throw new Error('Invalid Memory history.');
  if(previous){let old;try{old=JSON.parse(previous);}catch{}if(old?.turns&&JSON.stringify(log.turns.slice(0,old.turns.length))!==JSON.stringify(old.turns))throw new Error('Memory history cannot be reset.');}
  const deck=new Map(memoryDeck(part).map(face=>[face.id,face])),seen=new Set(),done=new Set();let errors=0;
  for(const turn of log.turns){
    if(!Array.isArray(turn)||turn.length!==2||turn[0]===turn[1]||turn.some(id=>!deck.has(id)||done.has(deck.get(id).pair)))throw new Error('Invalid Memory turn.');
    const [first,second]=turn.map(id=>deck.get(id));
    if(first.pair===second.pair)done.add(first.pair);
    else if(seen.has('l'+first.pair)&&seen.has('r'+first.pair))errors++;
    turn.forEach(id=>seen.add(id));
  }
  const pairs=(part.items||[]).length,max=examElementMax(part),completed=pairs>0&&done.size===pairs;
  return {errors,pairs,matched:done.size,completed,max,points:completed?Number(Math.max(0,max-max/pairs*0.2*errors).toFixed(10)):0};
}
