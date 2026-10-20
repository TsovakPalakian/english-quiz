import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const cards=readFileSync(new URL('../client/03c-cards.js',import.meta.url),'utf8');
const core=readFileSync(new URL('../client/03g-core.js',import.meta.url),'utf8');
const hooks=readFileSync(new URL('../client/main/main-hooks.js',import.meta.url),'utf8');
const dictionary=cards.slice(cards.indexOf('    async function dictionarySaveWord('),cards.indexOf('    function renderMade('));
const save=hooks.slice(hooks.indexOf('async function stageKeepExpression('),hooks.indexOf('function stageStoreTextExpression('));
const selection=core.slice(core.indexOf('    document.getElementById("selpopAdd").addEventListener'),core.indexOf('    document.addEventListener("mousedown", (e) => {',core.indexOf('    document.getElementById("selpopAdd").addEventListener')));
function fixture(){
  let list=[],click;const calls=[],events=[];
  const button={disabled:false,hidden:false},word={textContent:'harbour'},body={textContent:''};
  const scope={authUser:{id:'student',role:'USER'},accountReady:true,viewAccount:null,viewSwitching:false,viewGen:1,
    midTitle:value=>String(value).trim(),dictionaryPlace:()=> 'mine',cardArea:value=>value,
    dictionaryOwned:word=>list.some(card=>card.word.toLowerCase()===word.trim().toLowerCase()),
    loadAdded:()=>list,stageStampLinks:(rows,revision)=>{list=rows;calls.push(['stamp',revision]);},
    stageOwnReady:()=>!!(scope.authUser&&scope.accountReady&&!scope.viewAccount&&!scope.viewSwitching),
    saveAdded:()=>assert.fail('Legacy saveAdded must not run'),trackEvent:(...args)=>events.push(args),
    examStudentRestricted:()=>false,lookupBase:()=>'',
    document:{querySelector:()=>({id:'library'}),getElementById:id=>id==='selpopAdd'?{addEventListener:(type,handler)=>{click=handler;}}:id==='selpopWord'?word:body},
    fetch:async()=>({ok:true,json:async()=>({found:true,word:'harbour',ru:'гавань'})}),
    window:{LearningMain:{flushPersonal:async()=>{calls.push(['flush']);},findCard:async word=>{calls.push(['find',word]);return {id:7};},
      linkCard:async(card,place)=>{calls.push(['link',card.id,place]);return {revision:2,card:{stageId:card.id,word:'harbour',ru:'гавань',place}};},
      newCard:async(word,ru,place)=>{calls.push(['create',word,ru,place]);return {revision:2,card:{stageId:8,word,ru,place}};}}}};
  runInNewContext(save+'\n'+dictionary+'\n'+selection,scope);
  return {scope,calls,events,button,body,word,list:()=>list,click:()=>click({currentTarget:button,preventDefault(){},stopPropagation(){}})};
}
test('selection Add links a saved card by ID and acknowledges before updating local cards',async()=>{
  const f=fixture();let release;
  f.scope.window.LearningMain.linkCard=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.button.disabled,true);assert.equal(f.button.hidden,false);assert.equal(f.list().length,0);
  release({revision:2,card:{stageId:7,word:'harbour',ru:'гавань',place:'mine'}});await pending;
  assert.equal(f.list()[0].stageId,7);assert.equal(f.button.hidden,true);assert.equal(f.button.disabled,false);
  assert.deepEqual(f.events,[['card','mine','add']]);
  await f.scope.dictionarySaveWord('harbour',{ru:'гавань'});assert.equal(f.list().length,1);assert.equal(f.events.length,1);
});
test('new selected dictionary words use server creation and retain their expression category',async()=>{
  const f=fixture();f.scope.dictionaryPlace=()=> 'phrasal';
  f.scope.window.LearningMain.findCard=async()=>{throw Object.assign(new Error('Missing'),{code:'CARD_NOT_FOUND'});};
  await f.scope.dictionarySaveWord('harbour',{ru:'гавань',expressionType:'PHRASAL_VERB'});
  assert.deepEqual(f.calls.find(call=>call[0]==='create'),['create','harbour','гавань','phrasal']);
  assert.equal(f.list()[0].stageId,8);assert.equal(f.list()[0].place,'phrasal');
});
test('failed saves keep selection Add retryable and do not create phantom local cards',async()=>{
  const f=fixture(),link=f.scope.window.LearningMain.linkCard;
  f.scope.window.LearningMain.linkCard=async()=>{throw Error('Save failed. Retry.');};
  await f.click();assert.equal(f.list().length,0);assert.equal(f.button.hidden,false);assert.equal(f.button.disabled,false);assert.match(f.body.textContent,/Save failed/);
  f.scope.window.LearningMain.linkCard=link;await f.click();assert.equal(f.list().length,1);assert.equal(f.button.hidden,true);
});
test('dictionary failures, ambiguous cards and missing translations never fall back to legacy saves',async()=>{
  const f=fixture();f.scope.fetch=async()=>({ok:false});await f.click();assert.equal(f.list().length,0);assert.match(f.body.textContent,/dictionary/);
  f.scope.window.LearningMain.findCard=async()=>{throw Error('Several definitions');};
  await assert.rejects(f.scope.dictionarySaveWord('harbour',{ru:'гавань'}),/Several definitions/);
  f.scope.window.LearningMain.findCard=async()=>{throw Object.assign(new Error('Missing'),{code:'CARD_NOT_FOUND'});};
  await assert.rejects(f.scope.dictionarySaveWord('harbour',{}),/No translation/);assert.equal(f.list().length,0);
});
test('profile readiness and account switches prevent writes and late UI changes',async()=>{
  const f=fixture();f.scope.accountReady=false;await assert.rejects(f.scope.dictionarySaveWord('harbour',{}),/finish loading/);assert.equal(f.calls.length,0);
  f.scope.accountReady=true;f.scope.viewAccount={id:'other'};await assert.rejects(f.scope.dictionarySaveWord('harbour',{}),/finish loading/);
  f.scope.viewAccount=null;f.scope.window.LearningMain.flushPersonal=async()=>{f.scope.viewGen++;};
  await assert.rejects(f.scope.dictionarySaveWord('harbour',{ru:'гавань'}),/Account changed/);assert.equal(f.calls.length,0);
  f.scope.window.LearningMain.flushPersonal=async()=>{};
  f.scope.window.LearningMain.linkCard=async()=>{f.scope.viewGen++;return {revision:2,card:{stageId:7,word:'harbour'}};};
  await assert.rejects(f.scope.dictionarySaveWord('harbour',{ru:'гавань'}),/Account changed/);assert.equal(f.list().length,0);
});
test('authorized teacher profile saves use managed routes and do not count as own activity',async()=>{
  const f=fixture();f.scope.authUser.role='ADMIN';f.scope.viewAccount={id:'selected-student'};
  f.scope.window.LearningMain.linkManagedCard=async(account,card,place)=>{assert.equal(account,'selected-student');return {revision:3,card:{stageId:card.id,word:'harbour',place}};};
  await f.scope.dictionarySaveWord('harbour',{ru:'гавань'});assert.equal(f.list()[0].stageId,7);assert.equal(f.events.length,0);
});
test('dictionary Add word waits for the server and reports a retryable failure',async()=>{
  const f=fixture();let click,rendered=0,release;const notices=[],button={disabled:false};
  f.scope.madeItem={word:'harbour',ru:'гавань',data:{}};
  f.scope.handleCardQuizClick=()=>false;f.scope.renderMade=()=>{rendered++;};
  f.scope.window.LearningMain.notice=message=>notices.push(message);
  f.scope.document.getElementById=()=>({addEventListener:(type,handler)=>{click=handler;}});
  const start=cards.indexOf('    document.getElementById("madeView").addEventListener("click"');
  runInNewContext(cards.slice(start,cards.indexOf('      const view = document.getElementById("madeView");',start))+'    });',f.scope);
  f.scope.window.LearningMain.linkCard=async()=>{throw Error('Not saved');};
  const event={target:{closest:()=>button}};
  await click(event);assert.equal(rendered,0);assert.equal(button.disabled,false);assert.equal(f.list().length,0);assert.deepEqual(notices,['Not saved']);
  f.scope.window.LearningMain.linkCard=()=>new Promise(resolve=>{release=resolve;});
  const pending=click(event);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rendered,0);assert.equal(button.disabled,true);
  release({revision:2,card:{stageId:7,word:'harbour',place:'mine'}});await pending;
  assert.equal(rendered,1);assert.equal(button.disabled,false);assert.equal(f.list()[0].stageId,7);
});
