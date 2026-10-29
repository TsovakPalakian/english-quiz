import assert from 'node:assert/strict';
import {fallbackGrammarRule, enrichGrammarRule} from '../src/grammar-enrichment.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// 1. Test fallbackGrammarRule
const fallback = fallbackGrammarRule(
  'Cost vs. Be Worth',
  "Use 'costs' to state the retail price of an item. Use 'is worth' to state the estimated value or current market price.",
  ['The car costs $200,000.', 'The house is worth 50 million $.']
);

assert.equal(fallback.title, 'Cost vs. Be Worth');
assert.ok(fallback.en.includes("retail price"));
assert.equal(fallback.source, 'Oxford Practical English Usage');
assert.equal(fallback.examples.length, 2);
assert.equal(fallback.examples[0][0], 'The car costs $200,000.');

// 2. Test enrichGrammarRule with simulated Gemini response
const mockFetch = async () => Response.json({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          title: 'Borrow vs. Lend',
          ru: 'Borrow и lend: брать и давать взаймы',
          en: "'Borrow' means to take something with the intention of returning it. 'Lend' means to give something temporarily.",
          definition: 'Borrow — брать взаймы, lend — давать взаймы.',
          pattern: 'borrow (from) / lend (to)',
          patternRu: 'borrow (у кого-то) / lend (кому-то)',
          contrast: "Do not confuse borrow with lend: 'Can I borrow your pen?' but 'Can you lend me your pen?'",
          contrastRu: 'Не путайте направление: borrow берет субъект, lend дает субъект.',
          examples: [
            ['I borrowed money from the bank.', 'Я взял деньги в банке.'],
            ['She lent her car to me.', 'Она одолжила мне свою машину.']
          ],
          source: 'Oxford Practical English Usage'
        })
      }]
    }
  }]
});

const enriched = await enrichGrammarRule({
  title: 'Borrow vs. Lend',
  explanation: 'borrow vs lend explanation',
  examples: ['I borrowed money.'],
  env: {WORKBENCH_GEMINI_KEY: 'test-key', LEARNING_LANGUAGE_NETWORK: 'true'},
  fetchImpl: mockFetch
});

assert.equal(enriched.title, 'Borrow vs. Lend');
assert.equal(enriched.ru, 'Borrow и lend: брать и давать взаймы');
assert.equal(enriched.source, 'Oxford Practical English Usage');
assert.equal(enriched.examples.length, 2);
assert.equal(enriched.examples[0][0], 'I borrowed money from the bank.');

// 3. Test integration with lmPdfGrammarMatch and lmPdfDraftBlocks
const hooksSource = readFileSync(new URL('../client/52b-lesson-pdf-import.js', import.meta.url), 'utf8');

const scope = {
  crypto: globalThis.crypto,
  TextEncoder: globalThis.TextEncoder,
  lmBlank: (type) => ({type, id: undefined}),
  esc: (s) => String(s || ''),
  document: {addEventListener: () => {}},
  window: {
    GrammarDetails: {}
  }
};

runInNewContext(hooksSource, scope);

// Before adding rule, match fails
assert.equal(scope.lmPdfGrammarMatch('Cost vs. Be Worth'), null);

// Register newly enriched rule in service
scope.window.GrammarDetails['Cost vs. Be Worth'] = fallback;

// Now match succeeds!
const matched = scope.lmPdfGrammarMatch('Cost vs. Be Worth');
assert.ok(matched);
assert.equal(matched.grammarRule, 'Cost vs. Be Worth');

// Verify draft blocks link it as a real rule
const testData = {
  title: 'Lesson',
  description: 'Desc',
  overview: 'Overview',
  words: [],
  phrases: [],
  rules: [{
    title: 'Cost vs. Be Worth',
    explanation: fallback.en,
    examples: ['The car costs $200,000.'],
    pages: [9]
  }],
  classwork: [],
  warnings: []
};

const groups = await scope.lmPdfDraftBlocks(testData, 'test-hash');
assert.equal(groups.rules.length, 1);
assert.equal(groups.rules[0].type, 'rule');
assert.equal(groups.rules[0].grammarRule, 'Cost vs. Be Worth');

console.log('Grammar enrichment, Oxford grounding, and service catalog integration unit test passed.');
