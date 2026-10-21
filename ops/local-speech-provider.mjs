// Deterministic demonstration only: this does NOT analyze recorded speech.
export const LOCAL_SPEECH_RUBRIC={id:'local-practice',version:'fixture-v1',weights:{accuracy:0.6,fluency:0.4},scales:Object.fromEntries(['accuracy','fluency','prosody','grammar','vocabulary','task'].map(key=>[key,{min:0,max:100,direction:'higher'}])),minimumSeconds:0.5,findingConfidence:0.8,approvedBy:null};
export function localSpeechAdapter(){return {
  id:'local-speech-fixture',provider:'local-fixture',model:'synthetic-speech-not-an-assessor',version:'v1',billing:'self-hosted',
  capabilities:[{task:'pronunciation',locales:['en-US','en-GB'],modes:['scripted','unscripted']},{task:'stt',locales:['en-US','en-GB'],modes:['scripted','unscripted']},{task:'conversation',locales:['en-US','en-GB'],modes:['text']}],
  invoke:async(input,{source})=>({quality:'ok',transcript:source.task==='conversation'?null:input.reference||'Synthetic demonstration transcript, not recognized speech.',metrics:source.task==='pronunciation'?{accuracy:65,fluency:80,prosody:null}:source.task==='conversation'?{grammar:75,vocabulary:80,task:70}:{},findings:source.task==='pronunciation'?[{metric:'accuracy',wordIndex:0,phoneme:null,confidence:0.95,message:'Synthetic exercise: repeat the opening word slowly, then in the full phrase.'}]:[]}),
  validate:value=>value,
};}
