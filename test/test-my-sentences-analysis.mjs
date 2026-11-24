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

test('fallbackSentenceTranslations provides 3 distinct translation styles without echoing Russian', () => {
  const enRes = fallbackSentenceTranslations('I am looking forward to hearing from you.', 'en-ru');
  assert.equal(enRes.direction, 'en-ru');
  assert.equal(enRes.translations.length, 3);
  assert.equal(enRes.translations[0].style, 'natural');
  assert.equal(enRes.translations[1].style, 'conversational');
  assert.equal(enRes.translations[2].style, 'contextual');
  // Ensure English text is translated to Russian and NOT echoed as English
  assert.notEqual(enRes.translations[0].text, 'I am looking forward to hearing from you.');
  assert.match(enRes.translations[0].text, /[\u0400-\u04FF]/);
  assert.match(enRes.translations[1].text, /[\u0400-\u04FF]/);
  assert.match(enRes.translations[2].text, /[\u0400-\u04FF]/);

  const editsRes = fallbackSentenceTranslations('It seems your edits are not working.', 'en-ru');
  assert.equal(editsRes.direction, 'en-ru');
  assert.notEqual(editsRes.translations[0].text, 'It seems your edits are not working.');
  assert.match(editsRes.translations[0].text, /[\u0400-\u04FF]/);
  assert.match(editsRes.translations[1].text, /[\u0400-\u04FF]/);

  const ruRes = fallbackSentenceTranslations('Я помнил, как тебя зовут', 'ru-en');
  assert.equal(ruRes.direction, 'ru-en');
  assert.equal(ruRes.translations.length, 3);
  // Ensure Russian text is NOT echoed as English translation
  assert.notEqual(ruRes.translations[0].text, 'Я помнил, как тебя зовут');
  assert.match(ruRes.translations[0].text, /[A-Za-z]/);
  assert.match(ruRes.translations[1].text, /[A-Za-z]/);
  assert.match(ruRes.translations[2].text, /[A-Za-z]/);
  // Note must be in English
  assert.doesNotMatch(ruRes.note, /[\u0400-\u04FF]/);
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
                  note: 'Idiomatic expression.'
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
  assert.equal(res.note, 'Idiomatic expression.');
});

test('analyzeSentence handles gemini-3.5-flash-lite model override safely and falls back with English translations', async () => {
  const failingFetch = async () => {
    throw new Error('404 Model Not Found');
  };

  const res = await analyzeSentence({
    sentence: 'Я помнил, как тебя зовут',
    direction: 'ru-en',
    env: {
      WORKBENCH_GEMINI_KEY: 'test-key',
      WORKBENCH_GEMINI_GENERATION_MODEL: 'gemini-3.5-flash-lite',
      LEARNING_LANGUAGE_NETWORK: 'true'
    },
    fetchImpl: failingFetch
  });

  assert.equal(res.original, 'Я помнил, как тебя зовут');
  assert.equal(res.direction, 'ru-en');
  assert.equal(res.translations.length, 3);
  assert.notEqual(res.translations[0].text, 'Я помнил, как тебя зовут');
  assert.match(res.translations[0].text, /[A-Za-z]/);
  assert.doesNotMatch(res.note, /[\u0400-\u04FF]/);
});
