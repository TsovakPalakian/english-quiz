import test from 'node:test';
import assert from 'node:assert/strict';
import {assertLessonPdfBytes,normalizeLessonPdfMeta,parseLessonPdfMeta,LESSON_PDF_META_MAX_BYTES} from '../src/lesson-pdf-meta.mjs';

const pdf=new TextEncoder().encode('%PDF-1.4\n% minimal\n');
const reply=value=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,totalTokenCount:15}});

test('rejects non-PDF and oversized bytes before Gemini',()=>{
  assert.throws(()=>assertLessonPdfBytes(new Uint8Array([1,2,3])),error=>error.status===415);
  assert.throws(()=>assertLessonPdfBytes(new Uint8Array(LESSON_PDF_META_MAX_BYTES+1)),error=>error.status===413);
  assert.deepEqual(assertLessonPdfBytes(pdf),pdf);
});

test('normalizes title and description',()=>{
  assert.deepEqual(normalizeLessonPdfMeta({title:'  Present Perfect  ',description:'  Short learner summary.  '}),{title:'Present Perfect',description:'Short learner summary.'});
  assert.throws(()=>normalizeLessonPdfMeta({title:'',description:'x'}),error=>error.status===502);
});

test('Gemini PDF call fills title and description without leaking the key',async()=>{
  let sent;
  const result=await parseLessonPdfMeta({
    bytes:pdf,apiKey:'fixture-key',model:'gemini-3.5-flash-lite',
    fetchImpl:async(url,init)=>{sent={url,init};return reply({title:'Getting to know you',description:'Names, greetings and first questions.'});},
  });
  assert.deepEqual(result,{title:'Getting to know you',description:'Names, greetings and first questions.'});
  assert.match(sent.url,/models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(sent.init.headers['x-goog-api-key'],'fixture-key');
  const body=JSON.parse(sent.init.body);
  assert.equal(body.contents[0].parts[0].inlineData.mimeType,'application/pdf');
  assert.ok(body.contents[0].parts[0].inlineData.data);
  assert.equal(body.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
  assert.ok(!sent.init.body.includes('fixture-key'));
});

test('missing credentials never call Gemini',async()=>{
  let calls=0;
  await assert.rejects(parseLessonPdfMeta({bytes:pdf,apiKey:'',model:'gemini-3.5-flash-lite',fetchImpl:async()=>calls++}),error=>error.status===503);
  assert.equal(calls,0);
});
