import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSentenceDirection, fallbackSentenceTranslations, analyzeSentence } from '../src/sentence-enrichment.mjs';

test('detectSentenceDirection correctly detects Latin vs Cyrillic', () => {
  assert.equal(detectSentenceDirection('I am looking forward to hearing from you.', ''), 'en-ru');
  assert.equal(detectSentenceDirection('Я с нетерпением жду вашего ответа.', ''), 'ru-en');
  // Explicit direction override
  assert.equal(detectSentenceDirection('Any text', 'ru-en'), 'ru-en');
  assert.equal(detectSentenceDirection('Любой текст', 'en-ru'), 'en-ru');
});

test('fallbackSentenceTranslations provides 3 distinct translation styles', () => {
  const enRes = fallbackSentenceTranslations('I am looking forward to hearing from you.', 'en-ru');
  assert.equal(enRes.direction, 'en-ru');
  assert.equal(enRes.translations.length, 3);
  assert.equal(enRes.translations[0].style, 'natural');
  assert.equal(enRes.translations[1].style, 'conversational');
  assert.equal(enRes.translations[2].style, 'contextual');

  const ruRes = fallbackSentenceTranslations('Я с нетерпением жду ответа.', 'ru-en');
  assert.equal(ruRes.direction, 'ru-en');
  assert.equal(ruRes.translations.length, 3);
});

test('analyzeSentence returns Gemini response when network and key are configured', async () => {
  const mockFetch = async (url, opts) => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  original: 'Break the ice',
                  direction: 'en-ru',
                  translations: [
                    { label: 'Natural · Literary', style: 'natural', text: 'Разрядить обстановку' },
                    { label: 'Conversational nuance', style: 'conversational', text: 'Сделать первый шаг к общению' },
                    { label: 'Refined contextual', style: 'contextual', text: 'Преодолеть неловкость' }
                  ],
                  note: 'Идиоматическое выражение.'
                })
              }
            ]
          }
        }
      ]
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const res = await analyzeSentence({
    sentence: 'Break the ice',
    direction: 'en-ru',
    env: {
      WORKBENCH_GEMINI_KEY: 'test-key',
      LEARNING_LANGUAGE_NETWORK: 'true'
    },
    fetchImpl: mockFetch
  });

  assert.equal(res.original, 'Break the ice');
  assert.equal(res.direction, 'en-ru');
  assert.equal(res.translations.length, 3);
  assert.equal(res.translations[0].text, 'Разрядить обстановку');
  assert.equal(res.translations[1].text, 'Сделать первый шаг к общению');
  assert.equal(res.translations[2].text, 'Преодолеть неловкость');
  assert.equal(res.note, 'Идиоматическое выражение.');
});

test('analyzeSentence falls back safely when Gemini call fails or times out', async () => {
  const failingFetch = async () => {
    throw new Error('Network timeout');
  };

  const res = await analyzeSentence({
    sentence: 'Break the ice',
    direction: 'en-ru',
    env: {
      WORKBENCH_GEMINI_KEY: 'test-key',
      LEARNING_LANGUAGE_NETWORK: 'true'
    },
    fetchImpl: failingFetch
  });

  assert.equal(res.original, 'Break the ice');
  assert.equal(res.direction, 'en-ru');
  assert.equal(res.translations.length, 3);
});
