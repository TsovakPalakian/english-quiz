import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const hooks=readFileSync(new URL('../staging/main-hooks.js',import.meta.url),'utf8');
const preview=readFileSync(new URL('../preview.js',import.meta.url),'utf8');
const missing=()=>Object.assign(new Error('Missing'),{code:'CARD_NOT_FOUND'});
function fixture(overrides={}){
  const added=[],calls=[],scope={authUser:{id:'fixture',role:'USER'},accountReady:true,viewAccount:null,viewGen:1,viewSwitching:false,
    cardIndex:()=>new Map(added.map(row=>[row.word,{en:row.word}])),loadAdded:()=>added,
    lyricTokens:text=>text.toLowerCase().split(/\s+/),lookupLyricWord:async word=>({found:true,word,ru:'translation'}),
    document:{addEventListener(){},getElementById(){return null;},querySelector(){return null;}},
    window:{LearningMain:{findCard:async()=>{throw missing();},newCard:async(word,ru,place)=>{calls.push(word);return {revision:1,card:{word,ru,place}};}}},...overrides};
  runInNewContext(hooks,scope);scope.stageStampLinks=()=>{};return {scope,added,calls};
}
test('Song writes are sequential and successful words are all acknowledged',async()=>{
  const {scope,calls}=fixture();let active=0,peak=0;
  scope.window.LearningMain.newCard=async(word,ru,place)=>{peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,3));active--;calls.push(word);return {revision:calls.length,card:{word,ru,place}};};
  const marks={};await scope.stageMarkLyricWords({lyrics:'man night train'},marks,()=>{});
  assert.equal(peak,1);assert.equal(calls.length,3);assert.ok(Object.values(marks).every(mark=>mark.state==='new'));
});
test('Server card lookup precedes external dictionaries and uses the lemma',async()=>{
  const {scope,calls}=fixture();let lookups=0;
  scope.lookupLyricWord=async()=>{lookups++;throw Error('Should not reach dictionary');};
  scope.window.LearningMain.findCard=async word=>{if(word==='run')return {id:7,en:'run'};throw missing();};
  scope.window.LearningMain.linkCard=async()=>({revision:1,card:{word:'run',stageId:7,place:'music'}});
  const marks={};await scope.stageMarkLyricWords({lyrics:'running'},marks,()=>{},{running:'run'});
  assert.equal(marks.running.word,'run');assert.equal(marks.running.state,'have');assert.equal(lookups,0);assert.equal(calls.length,0);
});
test('Transient and ambiguous lookups never create cards or turn previous success red',async()=>{
  for(const error of [Object.assign(Error('Offline'),{status:503}),Object.assign(Error('Choose a card'),{code:'CARD_AMBIGUOUS'})]){
    const {scope,calls}=fixture();scope.window.LearningMain.findCard=async()=>{throw error;};
    const marks={man:{state:'new',word:'man'}};await scope.stageMarkLyricWords({lyrics:'man night'},marks,()=>{});
    assert.equal(marks.man.state,'new');assert.equal(marks.man.needsRetry,true);assert.equal(marks.night.state,'error');assert.equal(calls.length,0);
  }
});
test('Dictionary absence, unavailable definition and request failure stay distinct',async()=>{
  const {scope}=fixture();scope.lookupLyricWord=async word=>word==='missing'?null:word==='empty'?{found:true}:word==='oxford'?{found:true,oxford:{definition:'An adult male person'}}:Promise.reject(Error('Timeout'));
  const marks={};await scope.stageMarkLyricWords({lyrics:'missing empty oxford failed'},marks,()=>{});
  assert.equal(marks.missing.state,'miss');assert.equal(marks.empty.state,'untranslated');assert.equal(marks.oxford.state,'new');assert.equal(marks.failed.state,'error');
});
test('Ordinary words cannot resolve to inherited object properties',async()=>{
  const {scope,calls}=fixture();const marks={};await scope.stageMarkLyricWords({lyrics:'constructor'},marks,()=>{});
  assert.equal(marks.constructor.state,'new');assert.deepEqual(calls,['constructor']);
});
test('A failed link cannot fall through into new-card creation',async()=>{
  const {scope,calls}=fixture();scope.window.LearningMain.findCard=async()=>({id:7,en:'man'});scope.window.LearningMain.linkCard=async()=>{throw Object.assign(Error('Conflict'),{status:409});};
  await assert.rejects(()=>scope.stageKeepExpression({word:'man',ru:'translation',place:'music'}),/Conflict/);assert.equal(calls.length,0);
});
test('AI review continues past the first batch and preserves earlier decisions',async()=>{
  const {scope}=fixture(),offsets=[];
  const a={type:'PHRASAL_VERB',canonicalForm:'give up',exactText:'gave up'},b={type:'IDIOM',canonicalForm:'take it easy',exactText:'take it easy'};
  scope.accountFetch=async(_path,options)=>{
    const offset=JSON.parse(options.body).reviewOffset||0;offsets.push(offset);
    return {expressions:offset?[a,{...b,llmDecision:{applied:true}}]:[{...a,llmDecision:{applied:true}},b],wordLemmas:{gave:'give'},stats:{llmCandidates:2,llmPartial:true,reviewedExpressions:[offset?b:a],nextReviewOffset:offset?null:1}};
  };
  const result=await scope.stageRequestAnalysis('text','LYRICS',()=>{});
  assert.deepEqual(offsets,[0,1]);assert.equal(result.stats.llmReviewed,2);assert.equal(result.stats.llmPartial,false);assert.ok(result.expressions.every(item=>item.llmDecision));
});
test('Failed continuation keeps the useful result but reports partial analysis',async()=>{
  const {scope}=fixture();let calls=0;
  scope.accountFetch=async()=>{if(calls++)throw Error('Unavailable');return {expressions:[{type:'IDIOM',canonicalForm:'take it easy'}],stats:{llmCandidates:2,llmPartial:true,nextReviewOffset:1}};};
  const result=await scope.stageRequestAnalysis('text','LYRICS');assert.equal(result.expressions.length,1);assert.equal(result.stats.llmPartial,true);assert.equal(result.error,'Unavailable');
});
function extract(name,next){return preview.slice(preview.indexOf('    function '+name+'('),preview.indexOf('    function '+next+'('));}
test('Rendering uses saved surface aliases, does not cross sentence boundaries and distinguishes failures',()=>{
  const scope={cardIndex:()=>new Map([['give up',{en:'give up'}],['run',{en:'run'}]]),lemmaVerb:word=>({running:'run'}[word]||word),esc:value=>String(value),loadLearned:()=>new Set(),lyricCard:()=>null};
  runInNewContext(extract('cardForLyric','lyricCard')+extract('lyricShownMark','mediaDb')+extract('lyricPieces','lyricCountLine')+extract('lyricMark','setSongHead'),scope);
  assert.equal(scope.cardForLyric('running').en,'run');
  const html=scope.lyricHtml('gave it up',{ 'gave it up':{state:'have',word:'give up'}});
  assert.match(html,/data-lyric-open="give up"/);assert.doesNotMatch(html,/lyric-miss/);
  assert.equal(scope.lyricPieces('give. Up').raw.some(row=>row.phrase),false);
  assert.match(scope.lyricMark('man','man',{state:'error'}),/lyric-unchecked/);
  assert.doesNotMatch(scope.lyricMark('man','man',{state:'error'}),/lyric-miss/);
});
