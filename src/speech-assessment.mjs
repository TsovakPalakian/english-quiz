import {StudyError} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
const fail=message=>{throw new StudyError(400,message);};
export const SPEECH_MODES=Object.freeze(['pronunciation','free','shadowing','retelling','dialogue']);
export const SPEECH_METRICS=Object.freeze(['accuracy','fluency','prosody','grammar','vocabulary','task']);
export function validateSpeechRubric(value){
  exactFields(value,['id','version','weights','scales','minimumSeconds','findingConfidence','approvedBy']);
  const id=reviewText(value.id,100),version=reviewText(value.version,100);
  if(!Number.isFinite(value.minimumSeconds)||value.minimumSeconds<0.5||value.minimumSeconds>30||!Number.isFinite(value.findingConfidence)||value.findingConfidence<0.8||value.findingConfidence>1)fail('Invalid speech sufficiency rules.');
  exactFields(value.weights,SPEECH_METRICS);exactFields(value.scales,SPEECH_METRICS);
  const keys=Object.keys(value.weights);if(!keys.length||keys.some(key=>!Number.isFinite(value.weights[key])||value.weights[key]<=0)||Math.abs(keys.reduce((sum,key)=>sum+value.weights[key],0)-1)>1e-8)fail('Speech weights must add to one.');
  for(const key of Object.keys(value.scales)){
    const scale=value.scales[key];exactFields(scale,['min','max','direction']);
    if(!Number.isFinite(scale.min)||!Number.isFinite(scale.max)||scale.min>=scale.max||!['higher','lower'].includes(scale.direction))fail('Invalid documented speech scale.');
  }
  if(keys.some(key=>!Object.hasOwn(value.scales,key)))fail('A weighted metric requires a documented scale.');
  return {id,version,weights:{...value.weights},scales:structuredClone(value.scales),minimumSeconds:value.minimumSeconds,findingConfidence:value.findingConfidence,approvedBy:value.approvedBy===null?null:reviewText(value.approvedBy,200)};
}
export function validateSpeechOutput(value,task){
  exactFields(value,['quality','transcript','metrics','findings']);
  if(!['ok','no_speech','noise','too_short'].includes(value.quality))fail('Invalid speech quality.');
  const transcript=value.transcript===null?null:reviewText(value.transcript,6000);
  if(value.quality==='ok'&&task!=='conversation'&&!transcript)fail('A successful speech result requires a transcript.');
  exactFields(value.metrics,task==='pronunciation'?['accuracy','fluency','prosody']:task==='conversation'?['grammar','vocabulary','task']:[]);
  for(const score of Object.values(value.metrics))if(score!==null&&!Number.isFinite(score))fail('Invalid speech metric.');
  if(!Array.isArray(value.findings)||value.findings.length>50)fail('Invalid speech findings.');
  const findings=value.findings.map(finding=>{
    exactFields(finding,['metric','wordIndex','phoneme','confidence','message']);
    if(!Object.hasOwn(value.metrics,finding.metric)||!Number.isFinite(finding.confidence)||finding.confidence<0||finding.confidence>1||
      finding.wordIndex!==null&&(!Number.isSafeInteger(finding.wordIndex)||finding.wordIndex<0||!transcript||finding.wordIndex>=transcript.split(/\s+/).length)||
      finding.phoneme!==null&&(task!=='pronunciation'||finding.wordIndex===null))fail('Invalid word or phoneme finding.');
    return {...finding,phoneme:finding.phoneme===null?null:reviewText(finding.phoneme,50),message:reviewText(finding.message,1000)};
  });
  if(task==='stt'&&findings.length)fail('Transcription is not pronunciation assessment.');
  return {quality:value.quality,transcript,metrics:{...value.metrics},findings};
}
export function scoreSpeech(outputs,rubric,{duration,synthetic=false}={}){
  rubric=validateSpeechRubric(rubric);
  const scores=Object.fromEntries(SPEECH_METRICS.map(key=>[key,null])),raw={},findings=[];
  let sufficient=duration>=rubric.minimumSeconds;
  for(const {task,data,source} of outputs){
    const out=validateSpeechOutput(data,task);if(out.quality!=='ok')sufficient=false;
    for(const [key,value] of Object.entries(out.metrics)){
      const scale=rubric.scales[key];if(value===null)continue;
      if(!scale||value<scale.min||value>scale.max||Object.hasOwn(raw,key))fail('Speech metric is outside its documented scale.');
      raw[key]={value,scale,source};const ratio=(value-scale.min)/(scale.max-scale.min);
      scores[key]=Math.round((scale.direction==='higher'?ratio:1-ratio)*1000)/10;
    }
    findings.push(...out.findings.filter(finding=>finding.confidence>=rubric.findingConfidence&&out.quality==='ok').map(finding=>({...finding,source})));
  }
  if(!sufficient)for(const key of SPEECH_METRICS)scores[key]=null;
  const missing=Object.keys(rubric.weights).filter(key=>scores[key]===null);
  const overall=sufficient&&!missing.length?Math.round(Object.entries(rubric.weights).reduce((sum,[key,weight])=>sum+scores[key]*weight,0)*10)/10:null;
  const training=sufficient?findings.filter(finding=>scores[finding.metric]!==null&&scores[finding.metric]<70).slice(0,3).map(finding=>({metric:finding.metric,message:finding.message,wordIndex:finding.wordIndex,phoneme:finding.phoneme})):[];
  return {scores,raw,overall,missing,sufficient,findings:sufficient?findings:[],training,synthetic,provisional:rubric.approvedBy===null,assessment:'automatic_practice_only',rubric};
}
