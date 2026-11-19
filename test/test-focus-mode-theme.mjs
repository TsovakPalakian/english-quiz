import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(new URL('../site/preview.css', import.meta.url), 'utf8');
const player = readFileSync(new URL('../client/52c-focus-player.js', import.meta.url), 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
}

const focusCss = sliceBetween(css, '/* Full Focus Mode Interactive Player', '/* Exam Proctoring');
const focusRender = sliceBetween(player, 'function renderFocusPlayer()', 'function focusApplyAdaptiveRemediation');

test('Focus Mode colors come from the page theme variables', () => {
  for (const token of ['var(--bg)', 'var(--card)', 'var(--ink)', 'var(--mute)', 'var(--line)', 'var(--acc)', 'var(--acc-s)', 'var(--on-acc)', 'var(--ok)', 'var(--ok-s)', 'var(--bad)', 'var(--bad-s)']) {
    assert.ok(focusCss.includes(token), token);
  }
  assert.ok(focusCss.includes('.focus-player-header {\n  padding: 16px 24px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;'));
  assert.equal(focusCss.includes('#'), false);
  assert.equal(focusRender.includes('#'), false);
  assert.equal(focusRender.includes('rgb('), false);
  assert.match(focusRender, /class="focus-hotkeys"/);
  assert.match(focusRender, /class="focus-close"/);
  assert.match(focusRender, /class="focus-feedback /);
  assert.match(focusRender, /class="btn secondary"/);
  assert.match(focusRender, /class="btn primary"/);
});

test('Focus Mode paint follows sky, dark and grey', async () => {
  const themeCss = [':root { --on-acc: #FFFFFF; }']
    .concat(['sky', 'dark', 'grey'].map((name) => {
      const block = css.match(new RegExp(`:root\\[data-theme="${name}"\\] \\{[\\s\\S]*?\\}`));
      assert.ok(block, name);
      return block[0];
    }))
    .join('\n');
  const dom = new Window();
  dom.document.documentElement.innerHTML = '<head></head><body></body>';
  const style = dom.document.createElement('style');
  style.textContent = themeCss + '\n' + focusCss;
  dom.document.head.appendChild(style);
  globalThis.window = dom;
  globalThis.document = dom.document;
  globalThis.HTMLElement = dom.HTMLElement;
  globalThis.Node = dom.Node;
  globalThis.Element = dom.Element;
  await import(new URL('../client/52c-focus-player.js', import.meta.url).href + '?theme=1');

  const questions = [{
    id: 'q1',
    title: 'Practice Task',
    concept: 'however',
    prompt: 'Choose the sentence.',
    options: ['One', 'Two'],
    answer: 1,
    feedback: 'Use the second sentence.'
  }];

  const expectPaint = {
    sky: { bg: '#E3F1FB', card: '#F5FBFF', ok: '#1B8A4A' },
    dark: { bg: '#0D1020', card: '#171B33', ok: '#3DD598' },
    grey: { bg: '#CFD0D3', card: '#E3E4E6', ok: '#12795A' }
  };

  for (const name of ['sky', 'dark', 'grey']) {
    dom.document.documentElement.setAttribute('data-theme', name);
    dom.openFocusPlayer(questions);
    dom.focusSelectOption(1);
    const overlay = dom.document.getElementById('lmFocusPlayerOverlay');
    const card = overlay.querySelector('.focus-card');
    const selected = overlay.querySelector('.focus-option-btn.is-selected');
    const paint = expectPaint[name];
    assert.equal(dom.getComputedStyle(overlay).backgroundColor.toLowerCase(), paint.bg.toLowerCase(), name);
    assert.equal(dom.getComputedStyle(card).backgroundColor.toLowerCase(), paint.card.toLowerCase(), name);
    assert.equal(dom.getComputedStyle(selected).backgroundColor.toLowerCase(), paint.ok.toLowerCase(), name);
    assert.equal(overlay.querySelector('#focusCheckBtn'), null, 'Check button must be removed');
    assert.ok(overlay.querySelector('#focusNextBtn'), 'Next button must appear immediately on answer');
    assert.ok(overlay.querySelector('.focus-feedback'), 'Feedback banner must appear immediately');
    assert.equal(overlay.innerHTML.includes('#'), false, name);
  }

  // Verification of title separation and bolded quoted target words
  const splitQuestions = [{
    id: 'split-1',
    title: 'Exercise',
    concept: 'interested',
    prompt: "Check Adjective Preposition Pairs\nWhich preposition correctly follows 'interested'?",
    options: ['at', 'in', 'with', 'for'],
    answer: 1,
    feedback: 'interested in'
  }];
  dom.openFocusPlayer(splitQuestions);
  const overlay = dom.document.getElementById('lmFocusPlayerOverlay');
  const titleEl = overlay.querySelector('.focus-exercise-title');
  assert.ok(titleEl, 'Exercise title must be separated into .focus-exercise-title');
  assert.equal(titleEl.textContent, 'Check Adjective Preposition Pairs');
  const promptEl = overlay.querySelector('.focus-prompt');
  assert.ok(promptEl.innerHTML.includes("<strong>'interested'</strong>"), 'Target word in quotes must be bolded');
});
