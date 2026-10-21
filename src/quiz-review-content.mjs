// Draft review payloads are separate from legacy quiz definitions.
import {StudyError,QUIZ_TYPES} from './learning-study.mjs';
const bad=()=>{throw new StudyError(400,'Invalid quiz content for this type.');};
export function exactFields(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))bad();
}
export function reviewText(value,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))bad();return value.trim();}
const distinct=values=>new Set(values.map(v=>v.trim().toLowerCase())).size===values.length;
export function validateReviewContent(type,value,{mediaQuizzes=false}={}){
  if(!QUIZ_TYPES.includes(type)&&!(mediaQuizzes&&type==='Video choice'))bad();
  exactFields(value,['explanation','items']);reviewText(value.explanation,4000);
  if(!Array.isArray(value.items)||!value.items.length||value.items.length>50||JSON.stringify(value).length>50000)bad();
  const pairs=['Match','Memory'].includes(type);
  if(pairs&&value.items.length<2)bad();
  for(const item of value.items){
    let fields={Flip:['front','back'],Reverse:['front','back','options','answer'],Choice:['prompt','options','answer'],Listen:['prompt','word','options','answer'],Definition:['prompt','word','options','answer'],Type:['prompt','answer'],Gap:['shown','answer','hint'],Build:['parts','answer'],Match:['left','right'],Memory:['left','right'],'True / false':['prompt','answer'],Tap:['text','answer'],'Select all':['prompt','options','answers'],Spell:['word','hint'],Letters:['word','hint'],Hangman:['word','hint'],'Odd one out':['prompt','options','answer']}[type];
    if(mediaQuizzes&&type==='Listen')fields.push('mediaId');
    if(mediaQuizzes&&type==='Video choice')fields=['prompt','options','answer','mediaId','transcript'];
    exactFields(item,fields);
    for(const key of fields.filter(k=>!['options','answers','answer','word','hint','back','mediaId'].includes(k)))reviewText(item[key]);
    if(item.mediaId!==undefined||type==='Video choice')if(typeof item.mediaId!=='string'||!/^[a-f0-9-]{36}$/.test(item.mediaId))bad();
    if(['Flip','Reverse'].includes(type))reviewText(item.back);
    if(['Spell','Letters','Hangman','Listen','Definition'].includes(type))reviewText(item.word,200);
    if(item.hint!==undefined)reviewText(item.hint);
    if(fields.includes('options')){
      if(!Array.isArray(item.options)||item.options.length<2||item.options.length>12)bad();
      item.options.forEach(o=>reviewText(o,1000));if(!distinct(item.options))bad();
      if(type==='Select all'){
        if(!Array.isArray(item.answers)||!item.answers.length||new Set(item.answers).size!==item.answers.length||item.answers.some(i=>!Number.isSafeInteger(i)||i<0||i>=item.options.length))bad();
      }else if(!Number.isSafeInteger(item.answer)||item.answer<0||item.answer>=item.options.length)bad();
    }else if(fields.includes('answer')){
      reviewText(item.answer);
      if(type==='True / false'&&!['true','false'].includes(item.answer))bad();
      if(type==='Gap'&&!/_{3,}/.test(item.shown))bad();
      if(type==='Tap'&&!item.text.toLowerCase().includes(item.answer.toLowerCase()))bad();
      if(type==='Build'&&item.parts.trim().split(/\s+/).sort().join(' ')!==item.answer.trim().split(/\s+/).sort().join(' '))bad();
    }
  }
  if(pairs&&(!distinct(value.items.map(i=>i.left))||!distinct(value.items.map(i=>i.right))))bad();
  return structuredClone(value);
}
