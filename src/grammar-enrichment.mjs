// Server-side grammar rule enrichment grounded in Oxford Practical English Usage & Oxford Learner's Dictionaries.
import {languageProviderHTTP} from './language-provider-http.mjs';

export function fallbackGrammarRule(title, explanation = '', examples = []) {
  const cleanTitle = String(title || '').trim();
  const cleanExp = String(explanation || '').trim();
  const list = (Array.isArray(examples) && examples.length ? examples : [cleanTitle + ' is used in English sentences.'])
    .slice(0, 6)
    .map(e => {
      if (Array.isArray(e) && e.length >= 2) return [String(e[0] || '').trim(), String(e[1] || '').trim()];
      const s = String(e || '').trim();
      if (s.includes('~')) {
        const parts = s.split('~');
        return [parts[0].trim(), parts.slice(1).join('~').trim()];
      }
      return [s, ''];
    });

  return {
    title: cleanTitle,
    ru: cleanTitle,
    en: cleanExp || ('Grammar reference and explanation for ' + cleanTitle + '.'),
    definition: cleanExp || ('Грамматическое правило и особенности употребления ' + cleanTitle + '.'),
    pattern: cleanTitle + ' construction and usage',
    patternRu: 'Модель и структура употребления для ' + cleanTitle,
    contrast: 'Distinctions and common usage for ' + cleanTitle,
    contrastRu: 'Различия и правила употребления для ' + cleanTitle,
    examples: list,
    source: 'Oxford Practical English Usage'
  };
}

export async function enrichGrammarRule({title, explanation = '', examples = [], env = {}, fetchImpl = globalThis.fetch}) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Rule title is required.');
  const apiKey = env.WORKBENCH_GEMINI_KEY || '';
  const model = env.WORKBENCH_GEMINI_GENERATION_MODEL || 'gemini-2.0-flash';
  const networkOn = env.LEARNING_LANGUAGE_NETWORK === 'true';

  if (!apiKey || !networkOn) {
    return fallbackGrammarRule(cleanTitle, explanation, examples);
  }

  const prompt = `Rule title: ${cleanTitle}\nExplanation: ${explanation}\nExamples:\n${(examples || []).join('\n')}`;
  const systemInstruction = `You are an expert English grammarian grounded in Oxford Practical English Usage (Michael Swan) and Oxford Learner's Dictionaries. Return JSON with the exact schema:
{
  "title": "${cleanTitle}",
  "ru": "краткое русское название темы",
  "en": "English grammatical explanation grounded in Oxford references",
  "definition": "Понятное определение правила на русском языке",
  "pattern": "Grammar structure and pattern",
  "patternRu": "Структура и схема употребления на русском",
  "contrast": "Common mistakes and contrast with related forms",
  "contrastRu": "Типовые ошибки и сопоставление с близкими формами",
  "examples": [["English example sentence", "Русский перевод примера"]],
  "source": "Oxford Practical English Usage"
}
Provide between 2 and 6 example pairs. Output valid JSON only, without markdown fences.`;

  try {
    const payload = {
      contents: [{role: 'user', parts: [{text: prompt}]}],
      systemInstruction: {parts: [{text: systemInstruction}]},
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };
    const data = await languageProviderHTTP(fetchImpl, 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: {'x-goog-api-key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }, {timeoutMs: 15000, maxBytes: 32000});

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed.en && Array.isArray(parsed.examples)) {
        return {
          title: cleanTitle,
          ru: String(parsed.ru || cleanTitle).trim(),
          en: String(parsed.en).trim(),
          definition: String(parsed.definition || parsed.en).trim(),
          pattern: String(parsed.pattern || '').trim(),
          patternRu: String(parsed.patternRu || '').trim(),
          contrast: String(parsed.contrast || '').trim(),
          contrastRu: String(parsed.contrastRu || '').trim(),
          examples: parsed.examples.map(pair => Array.isArray(pair) ? [String(pair[0] || ''), String(pair[1] || '')] : [String(pair || ''), '']),
          source: String(parsed.source || 'Oxford Practical English Usage').trim()
        };
      }
    }
  } catch (err) {
    // Fall back gracefully on network or provider issues
  }

  return fallbackGrammarRule(cleanTitle, explanation, examples);
}
