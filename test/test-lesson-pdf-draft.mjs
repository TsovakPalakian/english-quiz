import {webcrypto} from 'node:crypto';
import {lessonPdfFixture as fixture} from './lesson-pdf-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeLessonPdfDraft,parseLessonPdfMeta} from '../src/lesson-pdf-meta.mjs';

const source={pages:[1],generated:false};
test('full drafts validate source pages, answers, criteria and bounded content',async()=>{
  assert.deepEqual(normalizeLessonPdfDraft(fixture()),fixture());
  for(const mutate of [d=>d.classwork[1].answer=3,d=>d.classwork[1].options=['Hello','Hello'],d=>d.words[0].pages=[],d=>d.rules[0].pages=[0],d=>d.classwork[3].criteria='Guess',d=>d.classwork[3].teacherAnswer='',d=>d.words=[null],d=>d.overview='x'.repeat(5001)]){
    const draft=fixture();mutate(draft);assert.throws(()=>normalizeLessonPdfDraft(draft),e=>e.status===502);
  }
});

function pdfTestContext(){
  let id=0;const context=vm.createContext({crypto:webcrypto,TextEncoder,lmBlank:type=>({id:'new-'+(++id),type}),esc:String});
  vm.runInContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js',import.meta.url),'utf8'),context);
  return context;
}
test('normalization merges equivalent senses and their source pages without mutating input',()=>{
  const draft=fixture(),word=draft.words[0];
  draft.words.push({...word,word:' ＨＥＬＬＯ ',meaning:'A   GREETING',pages:[3,1],generated:true});
  draft.phrases.push({...draft.phrases[0],meaning:'an informal greeting'});
  const before=JSON.stringify(draft),result=normalizeLessonPdfDraft(draft);
  assert.equal(result.words.length,1);assert.deepEqual(result.words[0].pages,[1,3]);assert.equal(result.words[0].generated,false);
  assert.equal(result.phrases.length,2);assert.equal(JSON.stringify(draft),before);
});
test('every stage is required, in order, with an appropriate distinct activity',()=>{
  const stages=['explanation','comprehension','guided','independent','final'];
  for(const stage of stages){const draft=fixture();draft.classwork=draft.classwork.filter(r=>r.stage!==stage);assert.throws(()=>normalizeLessonPdfDraft(draft),e=>e.status===502);}
  for(const mutate of [d=>d.classwork.reverse(),d=>d.classwork[0].stage='unknown',d=>d.classwork[0].kind='open',d=>{d.classwork[3]={...d.classwork[4],stage:'independent'};},d=>{d.classwork[4]={...d.classwork[1],stage:'final'};}]){
    const draft=fixture();mutate(draft);assert.throws(()=>normalizeLessonPdfDraft(draft),e=>e.status===502);
  }
  const draft=fixture();draft.classwork.splice(2,0,{...draft.classwork[1],text:'Which greeting fits meeting a new classmate?',title:'Another greeting'});
  assert.equal(normalizeLessonPdfDraft(draft).classwork.length,6);
});
test('malformed feedback, equivalent choice options, oversized criteria and open-task choices fail closed',()=>{
  for(const mutate of [d=>d.classwork[1].feedback=42,d=>d.classwork[1].options=['Hello',' hello '],d=>d.classwork[3].criteria='Content | 1001',d=>d.classwork[3].criteria='Content | extra | 2',d=>d.classwork[3].options=['Unused'],d=>d.classwork[3].answer=0]){
    const draft=fixture();mutate(draft);assert.throws(()=>normalizeLessonPdfDraft(draft),e=>e.status===502);
  }
});
test('stable keys survive ordering changes, teacher edits and different source examples',async()=>{
  const context=pdfTestContext(),data=fixture(),selected=new Set(['words','rules','classwork']),lesson={blocks:[]};
  const first=await context.lmPdfDraftBlocks(data,'same-pdf');await context.lmPdfAppendSections(lesson,first,selected,'same-pdf','x.pdf');
  lesson.blocks.find(b=>b.tab==='words').items[0].example='Teacher example';
  lesson.blocks.find(b=>b.tab==='rules').html='Teacher explanation';
  lesson.blocks.find(b=>b.type==='exercise').items[0].prompt='Teacher question';
  data.words[0].example='A different generated example';
  data.words.unshift({...data.words[0],word:'goodbye',meaning:'a farewell'});
  data.rules.unshift({...data.rules[0],title:'Questions',explanation:'Ask someone their name.'});
  data.classwork.reverse();
  const next=await context.lmPdfDraftBlocks(data,'same-pdf');
  assert.equal(first.words[0].pdfImport.key,next.words[1].pdfImport.key);
  assert.equal(await context.lmPdfAppendSections(lesson,next,selected,'same-pdf','x.pdf'),2);
  assert.equal(lesson.blocks.find(b=>b.tab==='words').items[0].example,'Teacher example');
  assert.equal(lesson.blocks.find(b=>b.tab==='rules').html,'Teacher explanation');
  assert.equal(lesson.blocks.find(b=>b.type==='exercise').items[0].prompt,'Teacher question');
  assert.equal(lesson.blocks.filter(b=>b.tab==='classwork').length,5);
  assert.equal(await context.lmPdfAppendSections(lesson,next,selected,'same-pdf','x.pdf'),0);
});
test('another sense is retained while case/whitespace-only changes do not duplicate a sense',async()=>{
  const context=pdfTestContext(),data=fixture(),lesson={blocks:[]},selected=new Set(['words']);
  await context.lmPdfAppendSections(lesson,await context.lmPdfDraftBlocks(data,'source'),selected,'source','x.pdf');
  data.words[0].word=' HELLO ';data.words[0].meaning='A   GREETING';
  data.words.push({...data.words[0],meaning:'an expression of surprise'});
  assert.equal(await context.lmPdfAppendSections(lesson,await context.lmPdfDraftBlocks(data,'source'),selected,'source','x.pdf'),1);
  assert.equal(lesson.blocks.length,2);
});
test('legacy positional keys are matched by content, not by the new position',async()=>{
  const context=pdfTestContext(),data=fixture(),groups=await context.lmPdfDraftBlocks(data,'source');
  const old=JSON.parse(JSON.stringify(groups.words[0]));old.pdfImport.key='words:0';delete old.items[0].meaning;
  const lesson={blocks:[old]};data.words.unshift({...data.words[0],word:'goodbye',meaning:'a farewell'});
  assert.equal(await context.lmPdfAppendSections(lesson,await context.lmPdfDraftBlocks(data,'source'),new Set(['words']),'source','x.pdf'),1);
  assert.equal(lesson.blocks.length,2);assert.equal(lesson.blocks[1].items[0].word,'goodbye');
});
test('classwork stage provenance survives conversion and client blocks never alias the draft',async()=>{
  const context=pdfTestContext(),groups=await context.lmPdfDraftBlocks(fixture(),'source'),lesson={blocks:[]};
  assert.deepEqual(Array.from(groups.classwork,b=>b.pdfImport.stage),['explanation','comprehension','guided','independent','final']);
  await context.lmPdfAppendSections(lesson,groups,new Set(['classwork']),'source','x.pdf');
  lesson.blocks[1].items[0].prompt='Teacher edit';assert.notEqual(groups.classwork[1].items[0].prompt,'Teacher edit');
  assert.match(groups.classwork[0].pdfImport.key,/^classwork:v2:[a-f0-9]{64}$/);
});
test('question identity survives option reordering but distinguishes different questions with the same prompt',async()=>{
  const context=pdfTestContext(),first=fixture();
  const original=(await context.lmPdfDraftBlocks(first,'source')).classwork[1];
  first.classwork[1].options.reverse();first.classwork[1].answer=1;
  const reordered=(await context.lmPdfDraftBlocks(first,'source')).classwork[1];
  assert.equal(original.pdfImport.key,reordered.pdfImport.key);
  first.classwork[1].options=['Goodbye','Chair'];first.classwork[1].answer=0;
  const different=(await context.lmPdfDraftBlocks(first,'source')).classwork[1];
  assert.notEqual(original.pdfImport.key,different.pdfImport.key);
});
test('different contextual meanings of the same word must survive normalization',async()=>{
  const draft=fixture();
  draft.words=[{word:'bank',meaning:'a financial institution',translation:'',example:'I went to the bank.',...source},{word:'bank',meaning:'the land beside a river',translation:'',example:'We sat on the river bank.',...source}];
  assert.equal(normalizeLessonPdfDraft(draft).words.length,2,'Distinct senses were silently discarded');
});
test('a single explanation must not count as sufficient complete classwork',async()=>{
  const draft=fixture();draft.classwork=[{...draft.classwork[0],kind:'explanation',options:[],answer:-1}];
  assert.throws(()=>normalizeLessonPdfDraft(draft),'Missing comprehension, guided practice, independent use and final task must be rejected');
});
test('reimporting reordered source items must not lose new content',async()=>{
  let id=0;const context=vm.createContext({crypto:webcrypto,TextEncoder,lmBlank:type=>({id:++id,type}),esc:String});
  vm.runInContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js',import.meta.url),'utf8'),context);
  const first=fixture(),lesson={blocks:[]},selected=new Set(['words']);
  (await context.lmPdfAppendSections(lesson,(await context.lmPdfDraftBlocks(first,'same-pdf')),selected,'same-pdf','lesson.pdf'));
  const second=fixture();second.words.unshift({...first.words[0],word:'goodbye',meaning:'a farewell'});
  (await context.lmPdfAppendSections(lesson,(await context.lmPdfDraftBlocks(second,'same-pdf')),selected,'same-pdf','lesson.pdf'));
  assert.ok(lesson.blocks.some(b=>b.items?.[0]?.word==='goodbye'),'A new first item must not be mistaken for the old first item');
  assert.equal(lesson.blocks.filter(b=>b.items?.[0]?.word==='hello').length,1);
});
test('invalid provider responses never return a partial successful draft',async()=>{
  for(const body of [{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]},{candidates:[{finishReason:'STOP',content:{parts:[{text:'invalid JSON'}]}}]},{promptFeedback:{blockReason:'SAFETY'},candidates:[]}]){
    await assert.rejects(parseLessonPdfMeta({full:true,bytes:new TextEncoder().encode('%PDF-1.4\n'),apiKey:'fixture-key',model:'gemini-3.5-flash-lite',fetchImpl:async()=>Response.json(body)}),error=>error.status===502);
  }
});
test('imported exercise feedback stays hidden before checking and appears afterwards',async()=>{
  const context=vm.createContext({crypto:webcrypto,TextEncoder,lmBlank:type=>({id:'exercise',type}),esc:String,lmPreviewChoices:()=>'<button>Answer</button>'});
  vm.runInContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js',import.meta.url),'utf8'),context);
  const source=readFileSync(new URL('../client/52-lessons.js',import.meta.url),'utf8');
  vm.runInContext(source.slice(source.indexOf('    function lmPreviewBlock(block)'),source.indexOf('    function lmPreviewParts(blocks)')),context);
  const block=(await context.lmPdfDraftBlocks(fixture(),'source')).classwork[1];
  assert.ok(!context.lmPreviewBlock(block).includes(block.pdfTeacherNotes));
  block.items[0].marked=true;block.items[0].correct=true;
  assert.ok(context.lmPreviewBlock(block).includes(block.pdfTeacherNotes),'After-check explanation is missing');
});
test('full PDF requests use the full schema without changing the metadata-only contract',async()=>{
  let payload;
  const result=await parseLessonPdfMeta({full:true,bytes:new TextEncoder().encode('%PDF-1.4\n'),apiKey:'fixture-key',model:'gemini-3.5-flash-lite',fetchImpl:async(url,init)=>{
    payload=JSON.parse(init.body);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(fixture({practice:true}))}]}}]});
  }});
  assert.equal(result.classwork.length,10);
  assert.ok(payload.generationConfig.maxOutputTokens>512);
  assert.ok(payload.generationConfig.responseFormat.text.schema.properties.classwork);
  assert.match(payload.systemInstruction.parts[0].text,/untrusted/);
});
test('draft block conversion escapes model HTML, preserves sources and never populates homework or Speech',async()=>{
  let seq=0;
  const context=vm.createContext({crypto:webcrypto,TextEncoder,lmBlank:type=>({id:'fixture-'+(++seq),type}),esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
  vm.runInContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js',import.meta.url),'utf8'),context);
  const draft=fixture();draft.rules[0].explanation='<script>bad()</script>';
  const groups=(await context.lmPdfDraftBlocks(draft,'source-sha'));
  assert.deepEqual(Object.keys(groups),['overview','words','phrases','rules','classwork']);
  assert.match(groups.rules[0].html,/&lt;script&gt;/);
  assert.equal(groups.words[0].pdfImport.source,'source-sha');
  assert.equal(groups.words[0].type,'vocab');
  assert.equal(groups.classwork[1].items[0].answer,0);
  assert.equal(groups.classwork[3].maxPoints,2);
  assert.equal(groups.classwork[3].pdfTeacherNotes,'Hello. I am Sam.');
  assert.ok(!groups.classwork[3].text.includes('Hello. I am Sam.'));
  const lesson={blocks:[{id:'manual',type:'text',tab:'homework',html:'Keep homework'}]};
  const selected=new Set(['words','rules','classwork','pdf']);
  assert.equal((await context.lmPdfAppendSections(lesson,groups,selected,'source-sha','lesson.pdf')),7);
  const count=lesson.blocks.length;
  lesson.blocks.find(b=>b.tab==='rules').html='Teacher edit';
  assert.equal((await context.lmPdfAppendSections(lesson,groups,selected,'source-sha','lesson.pdf')),0);
  assert.equal(lesson.blocks.length,count);
  assert.equal(lesson.blocks.find(b=>b.tab==='rules').html,'Teacher edit');
  assert.equal(lesson.blocks.filter(b=>b.type==='pdf').length,1,'failed uploads reuse their placeholder');
  assert.equal(lesson.blocks[0].html,'Keep homework');
  assert.equal(lesson.blocks.filter(b=>b.tab==='overview').length,0,'unselected sections stay untouched');
});
