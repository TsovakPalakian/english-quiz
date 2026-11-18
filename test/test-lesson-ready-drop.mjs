import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { extractFunction, extractStatement } from './helpers/extract-function.mjs';

const source = fs.readFileSync('client/52b-lesson-pdf-import.js', 'utf8');
const progressSource = [
  'function esc(value){return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}',
  extractStatement(source, "let lmPdfProgressTab='file';"),
  extractStatement(source, 'const lmPdfPaneIds='),
  extractFunction(source, 'lmPdfUseSource'),
  extractFunction(source, 'lmPdfProgress')
].join('\n');

function paneMarkup() {
  return `
    <div class="lm">
      <div class="lm-import-methods">
        <div id="lmTabPaneFile">
          <label class="lm-drop lm-pdf-import" data-lesson-pdf-import>
            Drop lesson or exam file / PDF
            <input data-lesson-pdf-import-file type="file">
          </label>
        </div>
        <div id="lmTabPaneUrl"></div>
        <div id="lmTabPaneScript"></div>
        <div id="lmTabPaneLesson"></div>
      </div>
    </div>
  `;
}

function bootProgress() {
  const win = new Window({ url: 'https://preview.invalid/lessons' });
  const doc = win.document;
  doc.body.innerHTML = paneMarkup();
  const shown = [];
  win.lmShowTabProgress = (tab, label, percent) => shown.push({ tab, label, percent });
  vm.createContext(win);
  vm.runInContext(progressSource, win);
  return { win, doc, shown };
}

test('Draft ready keeps the circle and the file drop and does not build a second upload card', () => {
  const { win, doc, shown } = bootProgress();
  const stale = doc.createElement('div');
  stale.id = 'lmPdfNextUpload';
  doc.body.append(stale);
  const tabs = [
    ['file', 'Lesson PDF attached'],
    ['url', 'Words saved'],
    ['script', 'Phrases saved'],
    ['lesson', 'Classwork: 2']
  ];
  for (const [tab, line] of tabs) {
    win.lmPdfUseSource(tab);
    win.lmPdfProgress('Draft ready', [line], 1, 1);
    const pane = doc.getElementById(tab === 'file' ? 'lmTabPaneFile' : tab === 'url' ? 'lmTabPaneUrl' : tab === 'script' ? 'lmTabPaneScript' : 'lmTabPaneLesson');
    const ring = pane.querySelector('#lmPdfProgress [role=progressbar]');
    assert.equal(ring.getAttribute('aria-valuenow'), '100');
    assert.match(ring.textContent, /Draft ready/);
    assert.equal(pane.querySelector('#lmPdfProgress li').textContent, line);
    assert.equal(doc.getElementById('lmPdfNextUpload'), null);
    assert.equal(doc.querySelector('#lmPdfImportAnotherBtn'), null);
    assert.equal(doc.body.textContent.includes('Import another PDF'), false);
    assert.equal(doc.body.textContent.includes('Drop another file here'), false);
    const drop = doc.querySelector('[data-lesson-pdf-import]');
    assert.equal(drop.hidden, false);
    assert.equal(pane.contains(drop), tab === 'file');
  }
  assert.deepEqual(shown.filter(item => item.label === 'Draft ready to review!').map(item => item.tab), ['file', 'url', 'script', 'lesson']);
  assert.equal(source.includes('Import another PDF'), false);
  assert.equal(source.includes('lmPdfImportAnotherBtn'), false);
  assert.equal(source.includes('drop.hidden=true'), false);
});

test('Visual test: ready circle stays on the source bar in sky, dark, and sand', async () => {
  const { chromium } = createRequire(import.meta.url)(resolveTestDependency('playwright'));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html data-theme="sky"><body>' + paneMarkup() + '</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.addStyleTag({ content: fs.readFileSync('site/preview.css', 'utf8') });
    await page.addScriptTag({ content: progressSource });
    await page.evaluate(() => {
      lmPdfUseSource('script');
      lmPdfProgress('Draft ready', ['Phrases saved'], 1, 1);
    });
    assert.equal(await page.getByRole('button', { name: 'Import another PDF' }).count(), 0);
    assert.equal(await page.locator('[data-lesson-pdf-import]').isVisible(), true);
    assert.equal(await page.locator('#lmTabPaneScript [role=progressbar]').getAttribute('aria-valuenow'), '100');
    assert.match(await page.locator('#lmTabPaneScript #lmPdfProgress').innerText(), /Phrases saved/);
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important;animation:none !important;}' });
    const paint = async (value) => page.evaluate(color => {
      const probe = document.createElement('span');
      probe.style.background = color;
      document.body.append(probe);
      const painted = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return painted;
    }, value);
    for (const theme of ['sky', 'dark', 'sand']) {
      await page.evaluate(name => document.documentElement.setAttribute('data-theme', name), theme);
      const colors = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const face = getComputedStyle(document.querySelector('.lm-pdf-ring>span'));
        const drop = getComputedStyle(document.querySelector('[data-lesson-pdf-import]'));
        return {
          bg: root.getPropertyValue('--bg').trim(),
          acc: root.getPropertyValue('--acc-s').trim(),
          face: face.backgroundColor,
          drop: drop.backgroundColor
        };
      });
      const channels = color => color.match(/\d+/g).slice(0, 3).join(',');
      assert.equal(channels(colors.face), channels(await paint(colors.bg)), theme + ' ring face uses --bg');
      assert.equal(channels(colors.drop), channels(await paint(colors.acc)), theme + ' file drop uses --acc-s');
      assert.notEqual(channels(colors.drop), '240,249,255', theme + ' file drop has no sky fallback fill');
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
