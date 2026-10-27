// SLA Error Taxonomy & Diagnostic Classifier for L1 Transfer, Overgeneralization, and Collocations
// References: CEFR Companion Volume 2020, Cambridge Error Target Taxonomy, Nation (2007) Four Strands

export const ERROR_TAGS = Object.freeze({
  L1_TRANSFER: 'l1_transfer',
  OVERGENERALIZATION: 'overgeneralization',
  COLLOCATION_CLASH: 'collocation_clash',
  TYPO: 'typo',
  GRAMMAR: 'grammar',
  VOCABULARY: 'vocabulary',
  OMISSION: 'omission'
});

export const ERROR_CATEGORIES = Object.freeze({
  L1_PREPOSITION: 'l1_preposition',
  L1_CALQUE: 'l1_calque',
  L1_WORD_ORDER: 'l1_word_order',
  MORPH_IRREGULAR_VERB: 'morph_irregular_verb',
  MORPH_IRREGULAR_PLURAL: 'morph_irregular_plural',
  MORPH_SUBJECT_VERB: 'morph_subject_verb',
  COLLOCATION_DO_MAKE: 'collocation_do_make',
  COLLOCATION_CONFUSED_PAIR: 'collocation_confused_pair',
  SPELLING_TYPO: 'spelling_typo',
  LEXICAL_GAP: 'lexical_gap',
  GENERAL_GRAMMAR: 'general_grammar',
  BLANK_ANSWER: 'blank_answer'
});

const IRREGULAR_VERBS_OVERGENERALIZED = Object.freeze({
  goed: 'went',
  bringed: 'brought',
  buyed: 'bought',
  taked: 'took',
  catched: 'caught',
  runned: 'ran',
  eated: 'ate',
  writed: 'wrote',
  seed: 'saw',
  thinked: 'thought',
  teached: 'taught',
  speaked: 'spoke',
  singed: 'sang',
  cutted: 'cut',
  putted: 'put',
  costed: 'cost',
  knowed: 'knew',
  growed: 'grew',
  blowed: 'blew',
  throwed: 'threw',
  drawed: 'drew',
  flyed: 'flew',
  leaved: 'left',
  feeled: 'felt',
  keeped: 'kept',
  sleeped: 'slept',
  heared: 'heard',
  finded: 'found',
  standed: 'stood',
  understanded: 'understood',
  losed: 'lost',
  sended: 'sent',
  spended: 'spent',
  builded: 'built',
  lended: 'lent',
  holded: 'held',
  meeted: 'met',
  leaded: 'led',
  readed: 'read',
  swimmed: 'swam',
  drived: 'drove',
  drinked: 'drank',
  forgetted: 'forgot',
  freezed: 'froze',
  breaked: 'broke',
  choosed: 'chose',
  falled: 'fell',
  winned: 'won'
});

const IRREGULAR_PLURALS_OVERGENERALIZED = Object.freeze({
  childs: 'children',
  peoples: 'people',
  mans: 'men',
  womans: 'women',
  tooths: 'teeth',
  foots: 'feet',
  mouses: 'mice',
  oxes: 'oxen',
  fishs: 'fish',
  sheeps: 'sheep'
});

const L1_PREPOSITION_PATTERNS = Object.freeze([
  { regex: /\bdepend\s+from\b/i, correct: 'depend on', note: 'Russian transfer: "зависеть от" -> "depend on"' },
  { regex: /\bcongratulate\s+with\b/i, correct: 'congratulate on', note: 'Russian transfer: "поздравлять с" -> "congratulate on"' },
  { regex: /\btired\s+from\b/i, correct: 'tired of', note: 'Russian transfer: "устал от" -> "tired of"' },
  { regex: /\bafraid\s+from\b/i, correct: 'afraid of', note: 'Russian transfer: "бояться" -> "afraid of"' },
  { regex: /\blaugh\s+from\b/i, correct: 'laugh at', note: 'Russian transfer: "смеяться над" -> "laugh at"' },
  { regex: /\blisten\s+(music|radio|him|her|them|podcast)\b/i, correct: 'listen to', note: 'Russian transfer: direct object without "to"' },
  { regex: /\barrive\s+to\s+(london|paris|school|work|moscow|city|airport)\b/i, correct: 'arrive in / arrive at', note: 'Russian transfer: "прибыть в" -> "arrive in/at" (not "to")' },
  { regex: /\bmarried\s+with\b/i, correct: 'married to', note: 'Russian transfer: "женат с/на" -> "married to"' },
  { regex: /\bwait\s+(him|her|me|us|them|bus|train)\b/i, correct: 'wait for', note: 'Russian transfer: "ждать кого-то" without preposition "for"' },
  { regex: /\bgraduate\s+(university|college|school)\b/i, correct: 'graduate from', note: 'Russian transfer: "окончить университет" without "from"' },
  { regex: /\bplay\s+on\s+(the\s+)?(guitar|piano|violin|drums)\b/i, correct: 'play the [instrument]', note: 'Russian transfer: "играть на гитаре" -> "play the guitar"' },
  { regex: /\banswer\s+on\s+(the\s+)?(question|email|letter)\b/i, correct: 'answer the question', note: 'Russian transfer: "ответить на вопрос" -> "answer"' },
  { regex: /\bon\s+the\s+picture\b/i, correct: 'in the picture', note: 'Russian transfer: "на картине/фото" -> "in the picture"' }
]);

const L1_CALQUE_PATTERNS = Object.freeze([
  { regex: /\b(make|made|making)\s+(a\s+)?(photo|photos|picture|pictures|selfie)\b/i, correct: 'take a photo', note: 'Russian calque: "сделать фото" -> "take a photo"' },
  { regex: /\bfeel\s+myself\b/i, correct: 'feel [good/bad]', note: 'Russian calque: "чувствовать себя" -> "feel"' },
  { regex: /\b(close|open)\s+(the\s+)?light\b/i, correct: 'turn off/on the light', note: 'Russian calque: "закрыть/открыть свет" -> "turn off/on"' },
  { regex: /\bsay\s+(him|her|me|us|them)\b/i, correct: 'tell [person]', note: 'Russian calque: "сказать ему" -> "tell him" (say requires "to")' },
  { regex: /\bhow\s+do\s+you\s+call\s+it\b/i, correct: 'what do you call it', note: 'Russian calque: "как это называется" -> "what do you call it"' },
  { regex: /\bhow\s+it\s+is\s+called\b/i, correct: 'what is it called', note: 'Russian calque: "как это называется" -> "what is it called"' },
  { regex: /\b(she|he|they)\s+learns?\s+(me|him|her|us)\b/i, correct: 'teaches [person]', note: 'Russian confusion: "учить кого-то" -> "teach"' },
  { regex: /\b(i am|he is|she is)\s+normal\b/i, correct: "I am fine / okay", note: 'Russian false friend: "я нормально" -> "I am fine/okay"' }
]);

const L1_QUESTION_WORD_ORDER = Object.freeze([
  { regex: /^\s*(where|why|what|when|how)\s+(you|he|she|they|we)\s+([a-z]+ed|went|saw|came|knew|thought|took|are|is|were|was)\b/i, note: 'Russian question order without auxiliary inversion' },
  { regex: /^\s*why\s+you\s+(are\s+)?crying\b/i, note: 'Missing subject-auxiliary inversion in question' }
]);

const DO_COLLECTIONS = new Set(['homework', 'sports', 'a favor', 'favor', 'business', 'research', 'damage', 'best', 'exercise', 'chores']);
const MAKE_COLLECTIONS = new Set(['a mistake', 'mistake', 'mistakes', 'a decision', 'decision', 'decisions', 'money', 'friends', 'an effort', 'effort', 'a choice', 'a plan', 'an appointment', 'coffee', 'tea']);

const CONFUSED_PAIRS = Object.freeze([
  { pair: ['borrow', 'lend'], note: 'Confused pair: borrow (take) vs lend (give)' },
  { pair: ['say', 'tell'], note: 'Confused pair: say (something) vs tell (someone)' },
  { pair: ['speak', 'talk'], note: 'Confused pair: speak (language/formal) vs talk (chat)' },
  { pair: ['tall', 'high'], note: 'Confused pair: tall (person/building) vs high (level/price/altitude)' },
  { pair: ['economic', 'economical'], note: 'Confused pair: economic (economy) vs economical (saving money)' },
  { pair: ['sensible', 'sensitive'], note: 'Confused pair: sensible (reasonable) vs sensitive (easily affected)' }
]);

function levenshtein(a, b) {
  const an = a ? a.length : 0, bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[bn][an];
}

export function classifyError({ prompt = '', expected = '', given = '', partType = 'gap', wordnet = null } = {}) {
  const expTrim = String(expected || '').trim();
  const givTrim = String(given || '').trim();
  const expLower = expTrim.toLowerCase();
  const givLower = givTrim.toLowerCase();

  // Blank answer
  if (!givLower) {
    return {
      tag: ERROR_TAGS.OMISSION,
      category: ERROR_CATEGORIES.BLANK_ANSWER,
      note: 'Answer was omitted.',
      expected: expTrim,
      given: ''
    };
  }

  // Exact match - no error
  if (givLower === expLower) return null;

  // 1. Morphological Overgeneralization: Irregular verb regularization with -ed
  if (IRREGULAR_VERBS_OVERGENERALIZED[givLower]) {
    const targetIrreg = IRREGULAR_VERBS_OVERGENERALIZED[givLower];
    return {
      tag: ERROR_TAGS.OVERGENERALIZATION,
      category: ERROR_CATEGORIES.MORPH_IRREGULAR_VERB,
      note: `Overgeneralization: "${givTrim}" applies regular -ed to irregular verb (expected: "${targetIrreg}").`,
      expected: targetIrreg,
      given: givTrim
    };
  }

  // 2. Morphological Overgeneralization: Irregular plural with -s
  if (IRREGULAR_PLURALS_OVERGENERALIZED[givLower]) {
    const targetPlural = IRREGULAR_PLURALS_OVERGENERALIZED[givLower];
    return {
      tag: ERROR_TAGS.OVERGENERALIZATION,
      category: ERROR_CATEGORIES.MORPH_IRREGULAR_PLURAL,
      note: `Overgeneralization: "${givTrim}" applies regular -s suffix to irregular plural (expected: "${targetPlural}").`,
      expected: targetPlural,
      given: givTrim
    };
  }

  // 3. Morphological Overgeneralization: Subject-verb agreement (3rd person singular -s)
  if (/\b(he|she|it)\s+(do|have|go|make|say|take|know|see|come|think|want|give)\b/i.test(givLower) ||
      (/\b(he|she|it)\b/i.test(prompt) && !givLower.endsWith('s') && expLower.endsWith('s'))) {
    return {
      tag: ERROR_TAGS.OVERGENERALIZATION,
      category: ERROR_CATEGORIES.MORPH_SUBJECT_VERB,
      note: `Subject-verb concord error: missing 3rd-person singular -s/-es suffix with third-person subject.`,
      expected: expTrim,
      given: givTrim
    };
  }

  // 4. L1 Interference: Question Word Order (Russian inversion missing)
  for (const qPattern of L1_QUESTION_WORD_ORDER) {
    if (qPattern.regex.test(givLower)) {
      return {
        tag: ERROR_TAGS.L1_TRANSFER,
        category: ERROR_CATEGORIES.L1_WORD_ORDER,
        note: `L1 Transfer (Word Order): Question lacks standard auxiliary verb inversion (e.g. did/do/are).`,
        expected: expTrim,
        given: givTrim
      };
    }
  }

  // 5. L1 Interference: Calques and False Friends
  for (const calque of L1_CALQUE_PATTERNS) {
    if (calque.regex.test(givLower) || calque.regex.test(prompt + ' ' + givLower)) {
      return {
        tag: ERROR_TAGS.L1_TRANSFER,
        category: ERROR_CATEGORIES.L1_CALQUE,
        note: calque.note,
        expected: expTrim || calque.correct,
        given: givTrim
      };
    }
  }

  // 6. L1 Interference: Prepositions
  for (const prep of L1_PREPOSITION_PATTERNS) {
    if (prep.regex.test(givLower) || prep.regex.test(prompt + ' ' + givLower)) {
      return {
        tag: ERROR_TAGS.L1_TRANSFER,
        category: ERROR_CATEGORIES.L1_PREPOSITION,
        note: prep.note,
        expected: expTrim || prep.correct,
        given: givTrim
      };
    }
  }

  // 7. Collocation Clash: do vs make
  const givWords = givLower.split(/\s+/);
  if (givWords.includes('do') || givWords.includes('make') || givWords.includes('did') || givWords.includes('made')) {
    const isDo = givWords.includes('do') || givWords.includes('did');
    const isMake = givWords.includes('make') || givWords.includes('made');
    const objectPhrase = givWords.filter(w => !['do', 'make', 'did', 'made', 'a', 'an', 'the'].includes(w)).join(' ');
    if (isDo && MAKE_COLLECTIONS.has(objectPhrase)) {
      return {
        tag: ERROR_TAGS.COLLOCATION_CLASH,
        category: ERROR_CATEGORIES.COLLOCATION_DO_MAKE,
        note: `Collocation clash: "${objectPhrase}" takes "make", not "do".`,
        expected: expTrim,
        given: givTrim
      };
    }
    if (isMake && DO_COLLECTIONS.has(objectPhrase)) {
      return {
        tag: ERROR_TAGS.COLLOCATION_CLASH,
        category: ERROR_CATEGORIES.COLLOCATION_DO_MAKE,
        note: `Collocation clash: "${objectPhrase}" takes "do", not "make".`,
        expected: expTrim,
        given: givTrim
      };
    }
  }

  // 8. Collocation Clash: Confused Pairs (say/tell, borrow/lend, tall/high, etc.)
  for (const cp of CONFUSED_PAIRS) {
    const [wordA, wordB] = cp.pair;
    if ((givLower.includes(wordA) && expLower.includes(wordB)) || (givLower.includes(wordB) && expLower.includes(wordA))) {
      return {
        tag: ERROR_TAGS.COLLOCATION_CLASH,
        category: ERROR_CATEGORIES.COLLOCATION_CONFUSED_PAIR,
        note: cp.note,
        expected: expTrim,
        given: givTrim
      };
    }
  }

  // 9. Typo / Minor Orthographic Slip (Levenshtein distance <= 2, length >= 4)
  if (expLower.length >= 4 && givLower.length >= 3) {
    const dist = levenshtein(expLower, givLower);
    if (dist <= 2) {
      return {
        tag: ERROR_TAGS.TYPO,
        category: ERROR_CATEGORIES.SPELLING_TYPO,
        note: `Spelling slip: minor distance (${dist}) from target "${expTrim}".`,
        expected: expTrim,
        given: givTrim
      };
    }
  }

  // 10. Fallback: Vocabulary or Grammar
  const isVocab = ['vocab', 'cards', 'text'].includes(partType) || (!givLower.includes(' ') && !expLower.includes(' '));
  return {
    tag: isVocab ? ERROR_TAGS.VOCABULARY : ERROR_TAGS.GRAMMAR,
    category: isVocab ? ERROR_CATEGORIES.LEXICAL_GAP : ERROR_CATEGORIES.GENERAL_GRAMMAR,
    note: isVocab ? `Lexical gap: target vocabulary word "${expTrim}".` : `Grammar construction gap (expected: "${expTrim}").`,
    expected: expTrim,
    given: givTrim
  };
}

export function synthesizeSubgroupDiagnostic(items = [], { groupId = null } = {}) {
  const total = items.length;
  if (!total) {
    return {
      groupId,
      totalErrors: 0,
      breakdown: {
        l1_transfer: 0,
        overgeneralization: 0,
        collocation_clash: 0,
        grammar: 0,
        vocabulary: 0,
        typo: 0
      },
      percentages: {
        l1_transfer: 0,
        overgeneralization: 0,
        collocation_clash: 0,
        grammar: 0,
        vocabulary: 0,
        typo: 0
      },
      topPatterns: [],
      dominantCategory: null,
      recommendation: 'No recorded errors in this subgroup. Performance is on track!'
    };
  }

  const tagCounts = {
    l1_transfer: 0,
    overgeneralization: 0,
    collocation_clash: 0,
    grammar: 0,
    vocabulary: 0,
    typo: 0
  };
  const categoryCounts = {};
  const patternOccurrences = {};

  for (const item of items) {
    const tag = item.errorTag || item.error_tag || 'grammar';
    if (tagCounts[tag] != null) tagCounts[tag]++;
    else tagCounts.grammar++;

    const cat = item.errorCategory || item.error_category || 'general_grammar';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    const patternKey = item.prompt ? `${item.prompt} -> ${item.expectedAnswer || item.expected_answer || ''}` : cat;
    patternOccurrences[patternKey] = (patternOccurrences[patternKey] || 0) + 1;
  }

  const percentages = {};
  for (const [tag, count] of Object.entries(tagCounts)) {
    percentages[tag] = Math.round((count / total) * 100);
  }

  // Determine dominant category
  let dominantCategory = 'grammar', maxCount = -1;
  for (const [tag, count] of Object.entries(tagCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = tag;
    }
  }

  // Top specific patterns
  const topPatterns = Object.entries(patternOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pattern, count]) => ({ pattern, count, pct: Math.round((count / total) * 100) }));

  // Pedagogical recommendation
  let recommendation = '';
  const domPct = percentages[dominantCategory] || 0;
  const groupLabel = groupId ? `Group ${groupId}` : 'The subgroup';

  if (dominantCategory === ERROR_TAGS.L1_TRANSFER) {
    recommendation = `${domPct}% of recent errors in ${groupLabel} stem from L1 Transfer (Russian language interference with prepositions and word order). Recommended: 10-minute focused contrastive analysis on dependency prepositions in the next lesson.`;
  } else if (dominantCategory === ERROR_TAGS.OVERGENERALIZATION) {
    recommendation = `${domPct}% of recent errors in ${groupLabel} are Morphological Overgeneralizations (irregular verb and plural regularization). Recommended: Spaced retrieval drill on irregular verb forms before introducing new grammar.`;
  } else if (dominantCategory === ERROR_TAGS.COLLOCATION_CLASH) {
    recommendation = `${domPct}% of recent errors in ${groupLabel} involve Collocation Clashes (e.g. do vs make, lexical false friends). Recommended: Targeted chunking exercises focusing on collocations.`;
  } else if (dominantCategory === ERROR_TAGS.VOCABULARY) {
    recommendation = `${domPct}% of recent mistakes in ${groupLabel} represent lexical gaps. Recommended: Active vocabulary retrieval using flashcards and context generation.`;
  } else {
    recommendation = `${domPct}% of errors in ${groupLabel} relate to general grammatical structures. Recommended: Review sentence structures and formative assessment checkpoints.`;
  }

  return {
    groupId,
    totalErrors: total,
    breakdown: tagCounts,
    percentages,
    topPatterns,
    dominantCategory,
    recommendation
  };
}
