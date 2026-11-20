import {exactAnswerScore} from './exam-content.mjs';
const norm=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');

export function parseGapsFromText(text) {
  if (typeof text !== 'string') return [];
  const re = /\[(?:(\d+):)?([^\]|]+)(?:\|([^\]]+))?\]/g;
  const gaps = [];
  let m;
  let autoIdx = 1;
  while ((m = re.exec(text)) !== null) {
    const rawIdx = m[1] ? parseInt(m[1], 10) : autoIdx;
    autoIdx++;
    const mainPart = m[2].trim();
    const extraPart = (m[3] || '').trim();
    let target = mainPart;
    let mode = 'open';
    let stem = '';
    let hint = '';
    let hints = [];
    let time = '';
    let options = [];
    let alternatives = [];
    if (mainPart.includes('/')) {
      options = mainPart.split('/').map(s => s.trim()).filter(Boolean);
      target = options[0] || '';
    }
    if (extraPart) {
      const parts = extraPart.split('|');
      for (const p of parts) {
        const colonIdx = p.indexOf(':');
        const k = (colonIdx > -1 ? p.slice(0, colonIdx) : p).trim();
        const v = (colonIdx > -1 ? p.slice(colonIdx + 1) : '').trim();
        if (k === 'correct' && v) target = v;
        else if (k === 'stem' && v) { stem = v; mode = 'stem'; }
        else if ((k === 'hint' || k === 'first') && v) hint = v;
        else if (k === 'time' && v) time = v;
        else if ((k === 'hint1' || k === 'hint2' || k === 'hint3') && v) hints.push(v);
        else if (k === 'hints' && v) hints.push(...v.split(/[,;/]+/).map(s => s.trim()).filter(Boolean));
        else if (k === 'mode' && v) mode = v;
        else if (k === 'alt' && v) alternatives.push(...v.split(',').map(s => s.trim()));
      }
    }
    if (options.length > 0 && mode === 'open') mode = 'dropdown';
    gaps.push({ index: rawIdx, target, mode, stem, hint, hints, time, options, alternatives });
  }
  return gaps;
}

export function examSuggestion({part,item,index,max},value){
  if(part.type==='text'&&part.answerEnabled)return exactAnswerScore(part,value??'',max);
  if(part.type==='task'||item.checkMode==='teacher'||item.checkMode==='meaning')return null;
  if(value==null||value==='')return 0;
  if(part.type==='exercise'&&item.kind==='text_gaps'){
    let given;
    try { given = typeof value === 'object' ? value : JSON.parse(value); } catch { return 0; }
    if (!given || typeof given !== 'object') return 0;
    const gaps = (Array.isArray(item.gaps) && item.gaps.length) ? item.gaps : parseGapsFromText(item.text);
    if (!gaps.length) return 0;
    let earnedPoints = 0;
    const pointPerGap = max / gaps.length;
    for (let i = 0; i < gaps.length; i++) {
      const sKey = String(gaps[i].index || i + 1);
      const studentVal = Array.isArray(given) ? given[i] : (given[sKey] ?? given[i + 1] ?? given[i] ?? given[String(i)]);
      const targetVal = gaps[i].target ?? gaps[i].answer;
      const firstChar = gaps[i].hint || '';
      const penalty = Number(given[sKey + '_penalty'] || given['_penalty_' + sKey] || 0);
      const isDirectMatch = norm(studentVal) === norm(targetVal) || (Array.isArray(gaps[i].alternatives) && gaps[i].alternatives.some(alt => norm(alt) === norm(studentVal)));
      const isPrefixedMatch = firstChar && (norm(firstChar + studentVal) === norm(targetVal) || (Array.isArray(gaps[i].alternatives) && gaps[i].alternatives.some(alt => norm(alt) === norm(firstChar + studentVal))));
      if (isDirectMatch || isPrefixedMatch) {
        const factor = Math.max(0, 1 - penalty);
        earnedPoints += pointPerGap * factor;
      }
    }
    return Number(earnedPoints.toFixed(10));
  }
  const kind=part.type==='exercise'?(item.kind==='write'?'Type':'Choice'):part.quizType;
  if(['Choice','Odd one out','Video choice'].includes(kind))return Number.isInteger(Number(value))&&Number(value)===Number(item.answer)?max:0;
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
