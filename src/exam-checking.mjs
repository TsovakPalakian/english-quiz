import {exactAnswerScore} from './exam-content.mjs';
const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function examSuggestion({part,item,index,max},value){
  if(part.type==='text'&&part.answerEnabled)return exactAnswerScore(part,value??'',max);
  if(part.type==='task'||item.checkMode==='teacher'||item.checkMode==='meaning')return null;
  if(value==null||value==='')return 0;
  const kind=part.type==='exercise'?(item.kind==='write'?'Type':'Choice'):part.quizType;
  if(['Choice','Odd one out'].includes(kind))return Number.isInteger(Number(value))&&Number(value)===Number(item.answer)?max:0;
  if(kind==='Select all'){
    if(!Array.isArray(value)||!value.every(Number.isInteger)||new Set(value).size!==value.length)return 0;
    return JSON.stringify([...value].sort((a,b)=>a-b))===JSON.stringify([...(item.answers||[])].sort((a,b)=>a-b))?max:0;
  }
  if(kind==='Match'){
    let given;try{given=JSON.parse(value);}catch{return 0;}
    if(!given||typeof given!=='object'||Array.isArray(given))return 0;
    const pairs=part.items||[],correct=pairs.filter((pair,i)=>norm(given[i])===norm(pair.right)).length;
    return pairs.length?Number((max*correct/pairs.length).toFixed(10)):0;
  }
  if(kind==='Memory')return null;
  const right=part.type==='cards'?item.back:part.type==='vocab'?item.translation:item.answer??item.write??item.back??item.word;
  if(right==null||right==='')return null;
  return norm(value)===norm(right)?max:0;
}
