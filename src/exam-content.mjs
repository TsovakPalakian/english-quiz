export const examPalette=['#247b78','#9265ad','#ac6741','#4e78a8','#988024','#b64d70','#44845c','#986173'];
export function examBlockColor(part){
  if(/^#[a-f0-9]{6}$/i.test(part.blockColor||part.color||''))return part.blockColor||part.color;
  return examPalette[crypto.getRandomValues(new Uint32Array(1))[0]%examPalette.length];
}
export function prepareExamContent(content,type){
  content.blockColor=examBlockColor(content);
  if(type==='text'&&content.answerEnabled){
    content.checkMode||='teacher';content.answerPurpose||='reference';
    if(!['exact','meaning','teacher'].includes(content.checkMode)||!['reference','example'].includes(content.answerPurpose))throw Error('Invalid answer checking settings.');
    if(content.allowedAnswers!=null&&(typeof content.allowedAnswers!=='string'||content.allowedAnswers.length>10000))throw Error('Invalid allowed answers.');
    for(const key of ['ignoreCase','ignoreWhitespace','ignorePunctuation'])if(content[key]!=null&&typeof content[key]!=='boolean')throw Error('Invalid answer normalization.');
  }
  return content;
}
export function exactAnswerScore(part,value,max){
  if(part.checkMode!=='exact'||part.answerPurpose==='example'||typeof value!=='string')return null;
  const normalize=input=>{
    let text=String(input).normalize('NFKC');
    if(part.ignoreCase!==false)text=text.toLowerCase();
    if(part.ignorePunctuation)text=text.replace(/[\p{P}\p{S}]/gu,'');
    if(part.ignoreWhitespace!==false)text=text.trim().replace(/\s+/g,' ');
    return text;
  };
  const accepted=String(part.allowedAnswers||'').split('\n').filter(line=>line.trim());
  if(!accepted.length)return null;
  return accepted.some(answer=>normalize(answer)===normalize(value))?max:0;
}
