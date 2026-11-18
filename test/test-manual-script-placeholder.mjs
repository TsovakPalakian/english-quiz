import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hint = [
  'Paste a lesson script, notes, a dialogue, or a command.',
  'Add words, phrases, and grammar rules, or describe a topic.',
  'The draft includes meanings, example sentences, and practice tasks.',
  'An open lesson keeps its material and skips duplicates.',
  'You review and edit the list before it is added, then you can undo.'
].join('\n');

test('Manual Script field hint matches the approved copy', () => {
  const html = fs.readFileSync(path.join(root, 'site/preview.html'), 'utf8');
  const field = html.match(/<textarea id="lmScriptInput"[^>]*>/)?.[0] || '';
  const placeholder = field.match(/placeholder="([^"]*)"/)?.[1]?.replace(/&#10;/g, '\n') || '';
  assert.equal(placeholder, hint);
  assert.doesNotMatch(placeholder, /Russian|English|Добавь|фразы/);
});

test('Manual Script field hint stays visible inside the field', async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const filePath = url.pathname === '/' || url.pathname === '/preview.html'
      ? path.join(root, 'site/preview.html')
      : path.join(root, 'site', url.pathname);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const type = path.extname(filePath) === '.css' ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/preview.html`, { waitUntil: 'domcontentloaded' });
    const fit = await page.evaluate((expected) => {
      document.body.removeAttribute('data-shell-pending');
      document.querySelectorAll('.main > section, .wrap > section').forEach((section) => {
        section.classList.remove('on');
        section.style.display = 'none';
      });
      const material = document.getElementById('material');
      material.classList.add('on');
      material.style.display = 'block';
      if (typeof window.lmSwitchImportTab === 'function') window.lmSwitchImportTab('script');
      const input = document.getElementById('lmScriptInput');
      input.value = expected;
      return {
        placeholder: input.placeholder,
        scrollHeight: input.scrollHeight,
        clientHeight: input.clientHeight
      };
    }, hint);
    assert.equal(fit.placeholder, hint);
    assert.ok(fit.scrollHeight <= fit.clientHeight + 1, `hint overflows: ${fit.scrollHeight} > ${fit.clientHeight}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
