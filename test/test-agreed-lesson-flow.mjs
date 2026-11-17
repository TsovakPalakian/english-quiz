import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonVoiceReply } from '../src/speech-conversation-provider.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('generation ring, description, draft buttons and cleared fields stay on the agreed path', () => {
  const html = read('site/preview.html');
  const css = read('site/preview.css');
  const pdf = read('client/52b-lesson-pdf-import.js');
  const lessons = read('client/52-lessons.js');
  assert.match(html, /id="lmDescription"[^>]*maxlength="2400"/);
  assert.match(css, /#lmSave:disabled/);
  assert.match(pdf, /function lmPdfUseSource/);
  assert.match(pdf, /lmGenerateLessonFromScript\(text, finalTitle, 'url'\)/);
  const urlFn = pdf.slice(pdf.indexOf('async function lmFetchExternalUrl'), pdf.indexOf("if(typeof document!=='undefined')"));
  assert.doesNotMatch(urlFn, /lmScriptInput/);
  assert.doesNotMatch(pdf, /id='lmPdfDraftFloatingBar'/);
  assert.match(pdf, /Draft preview ready/);
  assert.match(pdf, /function lmClearImportFields/);
  assert.match(pdf, /slice\(0,2400\)/);
  assert.match(pdf, /function lmLessonTakenTerms/);
  assert.match(lessons, /window\.lmPdfUseSource\('lesson'\)/);
  assert.match(lessons, /function lmSyncSaveDraftButton/);
});

test('voice mode asks the conversation route and notifications keep real cards', () => {
  const voice = read('client/52c-focus-player.js');
  const notes = read('client/20b-lesson-notifications.js');
  const worker = read('src/learning-stage-worker.mjs');
  assert.match(voice, /\/api\/lessons\/voice-reply/);
  assert.match(voice, /Dialogue is unavailable\. Select a Conversation provider\./);
  assert.doesNotMatch(voice, /interesting thought/);
  assert.doesNotMatch(notes, /Vocabulary Review Ready/);
  assert.doesNotMatch(notes, /v2\.4\.0/);
  assert.match(notes, /No reminders\./);
  assert.match(notes, /Work is waiting for review/);
  assert.match(notes, /Review published/);
  assert.match(worker, /\/api\/lessons\/voice-reply/);
});

test('voice reply without a conversation provider is unavailable', async () => {
  await assert.rejects(
    () => lessonVoiceReply({ apiKey: '', model: '', fetchImpl: fetch, text: 'hello' }),
    (error) => error.status === 409 && error.message === 'Dialogue is unavailable. Select a Conversation provider.'
  );
});

test('voice reply returns the provider reply for the open lesson', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ reply: 'Let us talk about prepositions.', finished: false }) }] } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await lessonVoiceReply({
    apiKey: 'test-key',
    model: 'gemini-test',
    fetchImpl,
    title: 'Prepositions',
    text: 'How do you listen to me?'
  });
  assert.equal(result.reply, 'Let us talk about prepositions.');
});
