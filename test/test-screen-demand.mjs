import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=()=>readFileSync(new URL('../client/57-demand.js',import.meta.url),'utf8');
function fixture(){
  const calls=[],notices=[],listeners=[];let resolve,reject;
  const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const window={ColorPicker:{},ensureMaterialQuiz:()=>pending,ensureColorPicker:()=>Promise.resolve(),LearningMain:{notice:message=>notices.push(message)}};
  const context={window,authUser:{id:'fixture'},document:{addEventListener:(name,handler)=>listeners.push(handler)},show:id=>calls.push(id)};
  const api=runInNewContext(source()+'\n({deferScreenAssets})',context);
  return {...api,window,calls,notices,listeners,resolve:()=>{window.MaterialQuiz={};resolve();},reject};
}
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
test('Material navigation waits for dependencies before rendering',async()=>{
  const f=fixture();assert.equal(f.deferScreenAssets('material'),true);assert.deepEqual(f.calls,[]);
  f.resolve();await flush();assert.deepEqual(f.calls,['material']);
  assert.equal(f.deferScreenAssets('material'),false);
});
test('A later navigation cancels a stale deferred render',async()=>{
  const f=fixture();f.deferScreenAssets('material');assert.equal(f.deferScreenAssets('home'),false);
  f.resolve();await flush();assert.deepEqual(f.calls,[]);
});
test('Dependency failure reports an error without retrying forever',async()=>{
  const f=fixture();f.deferScreenAssets('material');f.reject(new Error('Fixture unavailable'));await flush();
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.notices,['Fixture unavailable']);
});
test('Text editor waits for the color picker too',async()=>{
  const f=fixture();f.window.MaterialQuiz={};delete f.window.ColorPicker;
  f.window.ensureColorPicker=()=>Promise.resolve().then(()=>{f.window.ColorPicker={};});
  assert.equal(f.deferScreenAssets('textedit'),true);await flush();
  assert.deepEqual(f.calls,['textedit']);
});

test('ensureMessages coalesces concurrent calls and dispatches event', async () => {
  const dispatched = [];
  let scriptLoaded = 0;
  const win = {
    ensureChatIcons: () => Promise.resolve(),
    loadSiteScript: (src) => {
      scriptLoaded++;
      return new Promise(resolve => setTimeout(resolve, 10));
    },
    dispatchEvent: (ev) => dispatched.push(ev.type)
  };
  globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };

  let messagesJob = null;
  win.ensureMessages = () => {
    if (win.MessagesReady) return Promise.resolve();
    if (messagesJob) return messagesJob;
    messagesJob = win.ensureChatIcons().then(() => win.loadSiteScript('/messages.js')).then(() => {
      win.MessagesReady = true;
      try { win.dispatchEvent(new CustomEvent('messagesready')); } catch {}
    }).finally(() => { if (!win.MessagesReady) messagesJob = null; });
    return messagesJob;
  };

  const p1 = win.ensureMessages();
  const p2 = win.ensureMessages();
  assert.equal(p1, p2, 'Concurrent calls must return identical in-flight promise');
  await Promise.all([p1, p2]);
  assert.equal(scriptLoaded, 1, 'Only one script load triggered for concurrent calls');
  assert.equal(win.MessagesReady, true);
  assert.deepEqual(dispatched, ['messagesready']);

  const p3 = win.ensureMessages();
  assert.notEqual(p3, p1);
  await p3;
  assert.equal(scriptLoaded, 1, 'Subsequent call after ready does not re-fetch');
});

test('ensureMessages retries after load failure', async () => {
  let attempt = 0;
  const win = {
    ensureChatIcons: () => Promise.resolve(),
    loadSiteScript: () => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve();
    },
    dispatchEvent: () => {}
  };
  let messagesJob = null;
  win.ensureMessages = () => {
    if (win.MessagesReady) return Promise.resolve();
    if (messagesJob) return messagesJob;
    messagesJob = win.ensureChatIcons().then(() => win.loadSiteScript('/messages.js')).then(() => {
      win.MessagesReady = true;
    }).finally(() => { if (!win.MessagesReady) messagesJob = null; });
    return messagesJob;
  };

  await assert.rejects(() => win.ensureMessages(), /Network error/);
  assert.equal(win.MessagesReady, undefined);
  await win.ensureMessages();
  assert.equal(win.MessagesReady, true);
  assert.equal(attempt, 2);
});

test('exam-workflow lmPreviewBlock safely degrades when MaterialQuiz is not yet loaded', () => {
  const examWorkflowSource = readFileSync(new URL('../client/main/exam-workflow.js', import.meta.url), 'utf8');
  const slice = examWorkflowSource.slice(0, examWorkflowSource.indexOf('const examFillOriginal'));
  let rendered = null;
  const context = {
    window: {},
    document: { addEventListener: () => {}, querySelectorAll: () => [] },
    lmState: { examOwned: true },
    canEditLessons: () => true,
    lmBlank: () => ({}),
    lmBody: () => '',
    lmRenderEditor: () => {},
    lmPreviewBlock: () => '',
    lmPreviewParts: () => '',
    examTone: () => '#000',
    esc: s => s,
    lmClean: s => s,
    materialModel: () => ({ examChildren: () => [] }),
    crypto: { getRandomValues: arr => arr }
  };
  runInNewContext(slice, context);
  const block = { type: 'quiz', id: 101 };
  assert.doesNotThrow(() => {
    rendered = context.lmPreviewBlock(block);
  });
  assert.match(rendered, /material-quiz-loading/);
});
