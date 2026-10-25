import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {lessonPdfFixture} from './lesson-pdf-fixture.mjs';
import {normalizeLessonPdfDraft,parseLessonPdfMeta} from '../src/lesson-pdf-meta.mjs';
function context(api={}){
  let id=0;
  const scope=vm.createContext({crypto:webcrypto,TextEncoder,window:{LearningMain:api,GrammarDetails:{'Present simple':{},'Present continuous':{}},GRAMMAR:{topics:[]}},lmBlank:type=>({id:++id,type}),esc:String});
  vm.runInContext(readFileSync(new URL('../client/52b-lesson-pdf-import.js',import.meta.url),'utf8'),scope);return scope;
}
test('PDF phrases retain Russian translation and English meaning',()=>{
  const data=lessonPdfFixture();data.phrases[0].translation='Как дела?';
  const result=normalizeLessonPdfDraft(data);
  assert.equal(result.phrases[0].translation,'Как дела?');assert.equal(result.phrases[0].meaning,data.phrases[0].meaning);
});
test('partial PDF imports fill a missing required title without replacing unchecked manual metadata',()=>{
  const c=context(),data=lessonPdfFixture(),draft={title:'   ',description:'Teacher description',unit:'Manual unit',lesson:'Manual lesson'};
  c.lmPdfApplyMetadata(draft,data,false);
  assert.equal(draft.title,data.title);assert.equal(draft.description,'Teacher description');assert.equal(draft.unit,'Manual unit');assert.equal(draft.lesson,'Manual lesson');
  draft.title='Teacher title';c.lmPdfApplyMetadata(draft,data,false);assert.equal(draft.title,'Teacher title');
  c.lmPdfApplyMetadata(draft,data,true);assert.equal(draft.title,data.title);assert.equal(draft.description,data.description);
  assert.throws(()=>c.lmPdfApplyMetadata({title:''},{...data,title:' '},false),/title/i);
});
test('failed PDF saves retain prepared content and retries do not append duplicate blocks',async()=>{
  const c=context({saveLesson:async()=>{throw Error('Save unavailable');}}),current={title:'',blocks:[]};let persisted=0;
  c.lmKeepLesson=()=>{};c.lmPersist=()=>persisted++;
  const draft={title:'PDF title',blocks:[]},groups=await c.lmPdfDraftBlocks(lessonPdfFixture(),'pdf'),selected=new Set(['rules','classwork']);
  await c.lmPdfAppendSections(draft,groups,selected,'pdf','x.pdf');
  await assert.rejects(c.lmPdfSavePreparedDraft(draft,current,()=>true),/Save unavailable/);
  assert.equal(current.title,'PDF title');assert.equal(current.blocks.length,draft.blocks.length);assert.equal(persisted,1);
  assert.equal(await c.lmPdfAppendSections(current,groups,selected,'pdf','x.pdf'),0);
  c.window.LearningMain.saveLesson=async material=>{material.id=31;material.stageRevision=1;};
  await c.lmPdfSavePreparedDraft(current,current,()=>true);assert.equal(current.id,31);assert.equal(current.stageRevision,1);assert.equal(persisted,2);
  c.window.LearningMain.saveLesson=async()=>{throw Error('Changed account');};
  const other={title:'Other lesson',blocks:[]};await assert.rejects(c.lmPdfSavePreparedDraft(draft,other,()=>false),/Changed account/);assert.equal(other.title,'Other lesson');assert.equal(persisted,2);
});
test('new provider drafts reject sparse practice and missing translations instead of showing a complete lesson',async()=>{
  const reply=async data=>parseLessonPdfMeta({bytes:new TextEncoder().encode('%PDF-1.4\n'),apiKey:'key',model:'gemini-test',full:true,fetchImpl:async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]})});
  await assert.rejects(reply(lessonPdfFixture()),e=>e.status===502&&/practice/i.test(e.message));
  const data=lessonPdfFixture({practice:true});data.phrases[0].translation='';
  await assert.rejects(reply(data),e=>e.status===502);
  for(const stage of ['comprehension','guided','independent']){
    const short=lessonPdfFixture({practice:true});const index=short.classwork.findIndex(row=>row.stage===stage);short.classwork.splice(index,1);
    await assert.rejects(reply(short),e=>e.status===502&&/practice/i.test(e.message));
  }
});
test('Gemini is instructed to generate more distinct answerable practice',async()=>{
  let payload;
  await parseLessonPdfMeta({bytes:new TextEncoder().encode('%PDF-1.4\n'),apiKey:'test-key',model:'gemini-test',full:true,fetchImpl:async(_,init)=>{
    payload=JSON.parse(init.body);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(lessonPdfFixture({practice:true}))}]}}]});
  }});
  assert.match(payload.systemInstruction.parts[0].text,/at least 3 distinct comprehension and 3 distinct guided/i);
  assert.ok(payload.generationConfig.responseFormat.text.schema.properties.phrases.items.properties.translation);
});
test('rules link only to an unambiguous existing Grammar entry; unknown rules remain explanations',async()=>{
  const c=context(),data=lessonPdfFixture();data.rules[0].title=' PRESENT   SIMPLE ';
  let groups=await c.lmPdfDraftBlocks(data,'pdf');
  assert.equal(groups.rules[0].type,'rule');assert.equal(groups.rules[0].grammarRule,'Present simple');
  data.rules[0].title='A genuinely missing rule';groups=await c.lmPdfDraftBlocks(data,'pdf');
  assert.equal(groups.rules[0].type,'text');assert.equal(groups.rules[0].pdfGrammarMissing,'A genuinely missing rule');
  c.window.GRAMMAR.topics=[{id:'other',name:'Present simple'}];
  data.rules[0].title='Present simple';groups=await c.lmPdfDraftBlocks(data,'pdf');
  assert.equal(groups.rules[0].type,'text','Ambiguous matches must not be guessed');
});
test('native Grammar topic dictionaries and comparisons retain real navigation identities',async()=>{
  const c=context(),data=lessonPdfFixture();
  c.window.GRAMMAR={topics:{be:{name:'Present be',form:'am/is/are'}},comparisons:[{id:'contrast',title:'Past simple or present perfect'}]};
  data.rules[0].title='Present be';let groups=await c.lmPdfDraftBlocks(data,'pdf');assert.equal(groups.rules[0].topic,'be');assert.equal(groups.rules[0].type,'rule');
  data.rules[0].title='Past simple or present perfect';groups=await c.lmPdfDraftBlocks(data,'pdf');assert.equal(groups.rules[0].topic,'contrast');assert.equal(groups.rules[0].compare,true);
});
test('only selected missing vocabulary is resolved to full shared cards; repeated application is inert',async()=>{
  const calls=[],c=context({lookupLessonCard:async(word,context)=>{calls.push({word,context});return {id:calls.length};},dictionary:async({stageId})=>({id:999,en:calls[stageId-1].word,ru:calls[stageId-1].context.translation,data:{cambridge:{definition:calls[stageId-1].context.meaning}}})});
  const data=lessonPdfFixture();data.words[0].translation='привет';data.phrases[0].translation='Как дела?';
  const groups=await c.lmPdfDraftBlocks(data,'pdf'),lesson={blocks:[]};
  await c.lmPdfAppendSections(lesson,groups,new Set(['words']),'pdf','x.pdf');
  await c.lmPdfPrepareCards(lesson,()=>true);
  assert.equal(calls.length,1);assert.equal(lesson.blocks[0].type,'wordcard');assert.equal(lesson.blocks[0].stageId,1);
  assert.equal(lesson.blocks[0].ru,'привет');assert.equal(lesson.blocks[0].pdfVocabulary.meaning,'a greeting');
  assert.equal(lesson.blocks[0].stageDefinition.content.pdfImport.key,groups.words[0].pdfImport.key);
  assert.equal(lesson.blocks[0].id,groups.words[0].id,'Dictionary identity must not replace the lesson block identity');
  await c.lmPdfAppendSections(lesson,groups,new Set(['words','phrases']),'pdf','x.pdf');
  await c.lmPdfPrepareCards(lesson,()=>true);
  assert.equal(calls.length,2);assert.equal(lesson.blocks.length,2);assert.equal(lesson.blocks[1].tab,'phrases');
  await c.lmPdfAppendSections(lesson,groups,new Set(['words','phrases']),'pdf','x.pdf');await c.lmPdfPrepareCards(lesson,()=>true);
  assert.equal(calls.length,2);assert.equal(lesson.blocks.length,2);
});
test('a changed account cancels enrichment before any lookup and provider failures never silently create generic cards',async()=>{
  let calls=0;const c=context({lookupLessonCard:async()=>{calls++;throw Error('Dictionary unavailable');}}),data=lessonPdfFixture();
  const groups=await c.lmPdfDraftBlocks(data,'pdf'),lesson={blocks:[]};await c.lmPdfAppendSections(lesson,groups,new Set(['words']),'pdf','x.pdf');
  await assert.rejects(c.lmPdfPrepareCards(lesson,()=>false),/changed/i);assert.equal(calls,0);
  await assert.rejects(c.lmPdfPrepareCards(lesson,()=>true),/Dictionary unavailable/);assert.equal(lesson.blocks[0].stageId,undefined);
});
test('cancellation after dictionary lookup prevents later definition reads and lesson mutations',async()=>{
  let active=true,reads=0;const c=context({lookupLessonCard:async()=>{active=false;return {id:1};},dictionary:async()=>{reads++;return {};}});
  const lesson={blocks:[]},groups=await c.lmPdfDraftBlocks(lessonPdfFixture(),'pdf');await c.lmPdfAppendSections(lesson,groups,new Set(['words']),'pdf','x.pdf');
  const before=JSON.stringify(lesson);await assert.rejects(c.lmPdfPrepareCards(lesson,()=>active),/changed/);assert.equal(reads,0);assert.equal(JSON.stringify(lesson),before);
});
