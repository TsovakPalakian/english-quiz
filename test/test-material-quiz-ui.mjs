import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {scenarioSubtests} from "./helpers/scenario-subtests.mjs";
await scenarioSubtests("material-quiz-ui",async function*(){
yield "00. Browser and fixture setup";

const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<main id="quiz"></main>');
  const scoring=readFileSync(new URL('../src/exam-scoring.mjs',import.meta.url),'utf8').replace(/export /g,'');
  await page.addScriptTag({content:scoring+'\nwindow.MaterialScoring={memoryDeck,memoryScore};'});
  await page.addScriptTag({content:readFileSync(new URL('../production/material-quiz.js',import.meta.url),'utf8')});
  yield "01. evaluate";
  await page.evaluate(()=>{
    window.values={};window.block=null;
    window.paintQuiz=(kind,items,exam=false)=>{
      if(kind)block={id:'fixture',type:'quiz',quizType:kind,maxPoints:10,items};
      const root=document.getElementById('quiz');root.innerHTML=MaterialQuiz.render(block,{values,exam});
      MaterialQuiz.bind(root,{block:()=>block,get:(_block,index)=>values[index]??'',set:(_block,index,value)=>{values[index]=value;}});
    };
  });
  const pairItems=Array.from({length:5},(_,i)=>({left:'L'+i,right:'R'+i}));
  for(const kind of await page.evaluate(()=>MaterialQuiz.types)){
    await page.evaluate(({kind,pairs})=>{values={};paintQuiz(kind,['Match','Memory'].includes(kind)?pairs:[MaterialQuiz.blank(kind)]);},{kind,pairs:pairItems});
    assert.equal(await page.locator('[data-mq]').getAttribute('data-mq-kind'),kind);
    if(kind!=='Flip'){
      await page.evaluate(()=>paintQuiz(null,null,true));assert.equal(await page.locator('[data-mq-check],[data-mq-result]').count(),0,'No instant exam marks: '+kind);
    }
  }
  await page.evaluate(()=>{values={};paintQuiz('Select all',[{prompt:'Pick two',options:['a','b','c'],answers:[0,2]}]);});
  await page.locator('[data-mq-choice][value="0"]').check();await page.locator('[data-mq-choice][value="2"]').check();
  yield "02. evaluate";
  await page.evaluate(()=>{values[0]=JSON.stringify(values[0]);paintQuiz();});
  assert.equal(await page.locator('input:checked').count(),2);await page.locator('[data-mq-check]').click();assert.equal(await page.locator('[data-mq-result]').innerText(),'1 / 1');
  yield "03. evaluate";
  await page.evaluate(()=>{values={};paintQuiz('Match',[{left:'a',right:'A'},{left:'b',right:'B'}]);});
  await page.locator('[data-mq-match="0"]').selectOption('A');await page.locator('[data-mq-match="1"]').selectOption('B');await page.locator('[data-mq-check]').click();
    yield "04. [data-mq-result] / checks";
    assert.equal(await page.locator('[data-mq-result]').innerText(),'2 / 2');
  await page.evaluate(()=>{values={};paintQuiz('Hangman',[{prompt:'Animal',word:'cat'}]);});
  for(const letter of ['x','c','a','t'])await page.locator('[data-mq-hangman][data-word="'+letter+'"]').click();
  assert.equal(await page.locator('[data-mq-mask]').innerText(),'c a t');assert.equal(await page.locator('[data-mq-misses]').innerText(),'1 / 6');
  yield "05. [data-mq-check] / click";
  await page.locator('[data-mq-check]').click();assert.equal(await page.locator('[data-mq-result]').innerText(),'1 / 1');await page.evaluate(()=>paintQuiz());assert.equal(await page.locator('[data-mq-hangman]:disabled').count(),26);
  yield "06. evaluate";
  await page.evaluate(pairs=>{values={};paintQuiz('Memory',pairs);},pairItems);
  const turn=async(a,b)=>{await page.locator('[data-mq-face="'+a+'"]').click();await page.locator('[data-mq-face="'+b+'"]').click();await page.waitForFunction(()=>!document.querySelector('[data-mq]')._pending);};
  await turn('l0','r1');await turn('r0','l1');await turn('l0','r1');
    yield "07. evaluate";
    await page.evaluate(()=>paintQuiz());
  for(let i=0;i<5;i++)await turn('l'+i,'r'+i);
  assert.equal(await page.locator('.is-matched').count(),10);assert.equal(await page.evaluate(()=>MaterialScoring.memoryScore(block,values[0]).points),9.6);
  await page.evaluate(()=>{values={};paintQuiz('Flip',[{front:'hello',back:'greeting'}]);});
    yield "08. [data-mq-flip] / click";
    await page.locator('[data-mq-flip]').click();assert.equal(await page.locator('[data-mq-back]').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('All quiz types, exam feedback suppression, Select all/Match persistence, Hangman, Memory history/scoring and Flip passed');
}finally{await browser.close();}

});
