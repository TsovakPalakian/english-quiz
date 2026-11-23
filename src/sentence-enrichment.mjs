// Server-side sentence translation and contextual analysis powered by Gemini API.
import { languageProviderHTTP } from './language-provider-http.mjs';

export function detectSentenceDirection(text, explicitDirection) {
  if (explicitDirection === 'en-ru' || explicitDirection === 'ru-en') {
    return explicitDirection;
  }
  const cyrillicMatch = String(text || '').match(/[\u0400-\u04FF]/g);
  const latinMatch = String(text || '').match(/[A-Za-z]/g);
  const cyrillicCount = cyrillicMatch ? cyrillicMatch.length : 0;
  const latinCount = latinMatch ? latinMatch.length : 0;
  return cyrillicCount > latinCount ? 'ru-en' : 'en-ru';
}

export function fallbackSentenceTranslations(sentence, direction) {
  const clean = String(sentence || '').trim();
  const dir = detectSentenceDirection(clean, direction);

  if (dir === 'ru-en') {
    return {
      original: clean,
      direction: 'ru-en',
      translations: [
        { label: 'Natural · Literary', style: 'natural', text: clean },
        { label: 'Conversational nuance', style: 'conversational', text: clean },
        { label: 'Refined contextual', style: 'contextual', text: clean }
      ],
      note: 'Предложение добавлено и готово к изучению.'
    };
  }

  return {
    original: clean,
    direction: 'en-ru',
    translations: [
      { label: 'Natural · Literary', style: 'natural', text: clean },
      { label: 'Conversational nuance', style: 'conversational', text: clean },
      { label: 'Refined contextual', style: 'contextual', text: clean }
    ],
    note: 'Sentence added and ready for practice.'
  };
}

export async function analyzeSentence({ sentence = '', direction = '', env = {}, fetchImpl = globalThis.fetch }) {
  const clean = String(sentence || '').trim();
  if (!clean) {
    return fallbackSentenceTranslations('', direction);
  }

  const determinedDirection = detectSentenceDirection(clean, direction);
  const apiKey = env.WORKBENCH_GEMINI_KEY || '';
  const model = env.WORKBENCH_GEMINI_GENERATION_MODEL || 'gemini-2.0-flash';
  const networkOn = env.LEARNING_LANGUAGE_NETWORK === 'true';

  if (!apiKey || !networkOn) {
    return fallbackSentenceTranslations(clean, determinedDirection);
  }

  const targetLang = determinedDirection === 'en-ru' ? 'Russian' : 'English';
  const sourceLang = determinedDirection === 'en-ru' ? 'English' : 'Russian';

  const systemInstruction = `You are an expert bilingual linguist and translator specializing in ${sourceLang} and ${targetLang}.
Analyze the given ${sourceLang} sentence and produce exactly 3 natural, distinct, and high-quality translations into ${targetLang}:
1. "natural": Natural literary translation (standard accurate ${targetLang}).
2. "conversational": Conversational or colloquial nuance with natural phrasing.
3. "contextual": Refined contextual translation with stylistic depth.
Also include a short explanatory note in Russian ("note") explaining key idiomatic or grammatical nuances.

Output valid JSON only with the exact schema:
{
  "original": "${clean.replace(/"/g, '\\"')}",
  "direction": "${determinedDirection}",
  "translations": [
    { "label": "Natural · Literary", "style": "natural", "text": "translation 1" },
    { "label": "Conversational nuance", "style": "conversational", "text": "translation 2" },
    { "label": "Refined contextual", "style": "contextual", "text": "translation 3" }
  ],
  "note": "short explanation in Russian"
}
Output valid JSON only, without markdown fences.`;

  try {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: clean }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };

    const data = await languageProviderHTTP(
      fetchImpl,
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      { timeoutMs: 15000, maxBytes: 64000 }
    );

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.translations) && parsed.translations.length > 0) {
        return {
          original: clean,
          direction: determinedDirection,
          translations: parsed.translations.map(t => ({
            label: String(t.label || 'Translation'),
            style: String(t.style || 'natural'),
            text: String(t.text || '').trim()
          })),
          note: String(parsed.note || '')
        };
      }
    }
  } catch (_e) {
    // Fall back safely if API call or parsing fails
  }

  return fallbackSentenceTranslations(clean, determinedDirection);
}
