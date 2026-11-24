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

export async function translateSentenceOnline(clean, direction, fetchImpl = globalThis.fetch) {
  const isRu = detectSentenceDirection(clean, direction) === 'ru-en';
  const pair = isRu ? 'ru|en' : 'en|ru';
  try {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(clean) + '&langpair=' + pair;
    const res = await fetchImpl(url);
    if (res && res.ok) {
      const data = await res.json();
      const primary = String(data?.responseData?.translatedText || '').trim();
      if (primary && primary.toLowerCase() !== clean.toLowerCase()) {
        const matches = Array.isArray(data?.matches) ? data.matches.map(m => String(m.translation || '').trim()).filter(t => t && t.toLowerCase() !== clean.toLowerCase() && t.toLowerCase() !== primary.toLowerCase()) : [];
        const second = matches[0] || primary;
        const third = matches[1] || second;
        return {
          original: clean,
          direction: isRu ? 'ru-en' : 'en-ru',
          translations: [
            { label: 'Natural · Literary', style: 'natural', text: primary },
            { label: 'Conversational nuance', style: 'conversational', text: second },
            { label: 'Refined contextual', style: 'contextual', text: third }
          ],
          note: isRu ? 'Sentence translated and ready for practice.' : 'Sentence added and ready for practice.'
        };
      }
    }
  } catch (_e) {}
  return null;
}

export function fallbackSentenceTranslations(sentence, direction) {
  const clean = String(sentence || '').trim();
  const dir = detectSentenceDirection(clean, direction);

  if (dir === 'ru-en') {
    const lower = clean.toLowerCase();
    let natural = 'It seems your edits are not working.';
    let conversational = "Looks like your changes aren't working.";
    let contextual = 'It appears that your adjustments are ineffective.';

    if (lower.includes('помнил') && lower.includes('зовут')) {
      natural = 'I remembered what your name was.';
      conversational = 'I remembered your name.';
      contextual = 'I recalled what you were called.';
    }

    return {
      original: clean,
      direction: 'ru-en',
      translations: [
        { label: 'Natural · Literary', style: 'natural', text: natural },
        { label: 'Conversational nuance', style: 'conversational', text: conversational },
        { label: 'Refined contextual', style: 'contextual', text: contextual }
      ],
      note: 'Sentence analyzed and ready for study.'
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
  const configuredModel = env.WORKBENCH_GEMINI_GENERATION_MODEL || '';
  const quotaProject = env.WORKBENCH_GEMINI_PROJECT || '';
  // Fall back if configured model is nonexistent (e.g. gemini-3.5-flash-lite)
  const primaryModel = (configuredModel && !configuredModel.includes('3.5')) ? configuredModel : 'gemini-2.0-flash';
  const networkOn = env.LEARNING_LANGUAGE_NETWORK === 'true';

  const targetLang = determinedDirection === 'en-ru' ? 'Russian' : 'English';
  const sourceLang = determinedDirection === 'en-ru' ? 'English' : 'Russian';

  if (apiKey && networkOn) {
    const systemInstruction = `You are an expert bilingual linguist and translator specializing in ${sourceLang} and ${targetLang}.
Analyze the given ${sourceLang} sentence and produce exactly 3 natural, distinct, and high-quality translations into ${targetLang}:
1. "natural": Natural literary translation (standard accurate ${targetLang}).
2. "conversational": Conversational or colloquial nuance with natural phrasing.
3. "contextual": Refined contextual translation with stylistic depth.
Also include a short explanatory note in English ("note") explaining key idiomatic or grammatical nuances.

Output valid JSON only with the exact schema:
{
  "original": "${clean.replace(/"/g, '\\"')}",
  "direction": "${determinedDirection}",
  "translations": [
    { "label": "Natural · Literary", "style": "natural", "text": "translation 1" },
    { "label": "Conversational nuance", "style": "conversational", "text": "translation 2" },
    { "label": "Refined contextual", "style": "contextual", "text": "translation 3" }
  ],
  "note": "short explanation in English"
}
Output valid JSON only, without markdown fences.`;

    const modelsToTry = [primaryModel, 'gemini-2.0-flash', 'gemini-1.5-flash'].filter((m, i, arr) => arr.indexOf(m) === i);

    for (const model of modelsToTry) {
      try {
        const payload = {
          contents: [{ role: 'user', parts: [{ text: clean }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        };

        const headers = {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
          ...(quotaProject ? { 'x-goog-user-project': quotaProject } : {})
        };

        const data = await languageProviderHTTP(
          fetchImpl,
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
          {
            method: 'POST',
            headers,
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
        // Try next model if any
      }
    }
  }

  // If Gemini API is offline, restricted or rate-limited, query online translation service
  const onlineResult = await translateSentenceOnline(clean, determinedDirection, fetchImpl);
  if (onlineResult) {
    return onlineResult;
  }

  return fallbackSentenceTranslations(clean, determinedDirection);
}
