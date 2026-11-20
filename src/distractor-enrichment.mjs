// Server-side word and phrase semantic distractor enrichment powered by Gemini.
import {languageProviderHTTP} from './language-provider-http.mjs';

export function fallbackDistractors(item, allPool = []) {
  const word = String(item.word || item.phrase || item.en || '').trim();
  const translation = String(item.translation || item.meaning || item.ru || '').trim();

  // Find alternatives from pool
  const ruPool = (allPool || []).map(x => String(x.translation || x.meaning || x.ru || '').trim()).filter(x => x && x !== translation);
  const enPool = (allPool || []).map(x => String(x.word || x.phrase || x.en || '').trim()).filter(x => x && x !== word);

  const ruDefaults = [
    'вести внутренний диалог',
    'рассуждать вслух',
    'говорить наедине с собой',
    'бормотать под нос',
    'высказываться открыто',
    'думать про себя'
  ];
  const enDefaults = [
    'speak out loud',
    'think to yourself',
    'speak for yourself',
    'talk through',
    'say to oneself',
    'whisper under breath'
  ];

  const direct = Array.from(new Set([...ruPool, ...ruDefaults])).filter(x => x !== translation).slice(0, 4);
  const reverse = Array.from(new Set([...enPool, ...enDefaults])).filter(x => x !== word).slice(0, 4);

  return {
    directDistractors: direct,
    reverseDistractors: reverse
  };
}

export async function enrichDistractors({ items = [], env = {}, fetchImpl = globalThis.fetch }) {
  const apiKey = env.WORKBENCH_GEMINI_KEY || '';
  const model = env.WORKBENCH_GEMINI_GENERATION_MODEL || 'gemini-2.0-flash';
  const networkOn = env.LEARNING_LANGUAGE_NETWORK === 'true';

  const itemList = Array.isArray(items) ? items : [items];
  if (!apiKey || !networkOn || itemList.length === 0) {
    return itemList.map(it => ({
      word: it.word || it.phrase || it.en || '',
      translation: it.translation || it.meaning || it.ru || '',
      ...fallbackDistractors(it, itemList)
    }));
  }

  const payloadItems = itemList.map(it => ({
    en: String(it.word || it.phrase || it.en || '').trim(),
    ru: String(it.translation || it.meaning || it.ru || '').trim()
  }));

  const systemInstruction = `You are an expert English lexicographer and language quiz creator.
For each given English word or phrase with its Russian translation, create high-quality, challenging multiple-choice distractors:
1. directDistractors: exactly 4 Russian translations that are semantically close, contextual traps, or related collocations, but NOT the exact correct translation.
2. reverseDistractors: exactly 4 English words or phrases that are semantically close, synonyms with different nuances, or confusing false friends, but NOT the exact English word.

Return valid JSON with the exact schema:
{
  "results": [
    {
      "en": "English word",
      "ru": "Russian translation",
      "directDistractors": ["русский вариант 1", "русский вариант 2", "русский вариант 3", "русский вариант 4"],
      "reverseDistractors": ["english option 1", "english option 2", "english option 3", "english option 4"]
    }
  ]
}
Output valid JSON only, without markdown fences.`;

  try {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(payloadItems) }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };

    const data = await languageProviderHTTP(fetchImpl, 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { timeoutMs: 15000, maxBytes: 64000 });

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.results)) {
        return parsed.results.map((res, idx) => {
          const orig = itemList[idx] || {};
          const fb = fallbackDistractors(orig, itemList);
          return {
            word: orig.word || orig.phrase || orig.en || res.en,
            translation: orig.translation || orig.meaning || orig.ru || res.ru,
            directDistractors: Array.isArray(res.directDistractors) && res.directDistractors.length === 4 ? res.directDistractors : fb.directDistractors,
            reverseDistractors: Array.isArray(res.reverseDistractors) && res.reverseDistractors.length === 4 ? res.reverseDistractors : fb.reverseDistractors
          };
        });
      }
    }
  } catch (err) {
    // Graceful fallback on network/quota error
  }

  return itemList.map(it => ({
    word: it.word || it.phrase || it.en || '',
    translation: it.translation || it.meaning || it.ru || '',
    ...fallbackDistractors(it, itemList)
  }));
}
