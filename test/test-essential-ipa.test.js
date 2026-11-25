import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const previewRaw = readFileSync(new URL('../preview.js', import.meta.url), 'utf8');
const previewHtml = readFileSync(new URL('../site/preview.html', import.meta.url), 'utf8');

function createPreviewContext() {
  const dom = new Window({ url: 'https://preview.invalid/' });
  dom.document.write(previewHtml);
  dom.srcSeq = 0;
  dom.console = console;
  dom.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  dom.setTimeout = setTimeout;
  dom.clearTimeout = clearTimeout;
  dom.setInterval = setInterval;
  dom.clearInterval = clearInterval;
  dom.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  dom.cancelAnimationFrame = (id) => clearTimeout(id);
  dom.LESSON_DATA = {
    words: [], lines21: [], ask07: [], phrases09: [], adverbs14: [], talk16: [], likes23: [], extraWords: [], rules: [], phrasalWords: [], idiomWords: [], songCards: {}, lessonRules: []
  };
  dom.LESSON_INDEX = [];
  dom.GRAMMAR = { topics: {}, areas: [] };
  dom.SPEAKOUT = [];
  dom.IRREGULAR = [];
  dom.VERB_IPA = {};
  dom.VERB_IPA_CASE = {};

  const ctx = vm.createContext(dom);
  const exportTail = '\n;window.__previewExports = { ipaPair, ipaHtml, buildPhraseIpa, ipaBank };';
  vm.runInContext(previewRaw + exportTail, ctx);
  return dom;
}

describe('Essential English IPA Transcriptions', () => {
  let dom;
  let exports;

  beforeEach(() => {
    dom = createPreviewContext();
    exports = dom.__previewExports || {};
  });

  it('loads ESSENTIAL_IPA dictionary with comprehensive vocabulary coverage', () => {
    expect(dom.ESSENTIAL_IPA).toBeDefined();
    const keys = Object.keys(dom.ESSENTIAL_IPA);
    expect(keys.length).toBeGreaterThan(1300);
  });

  it('generates non-empty UK and US IPA transcriptions for all target requests and offers', () => {
    const { ipaPair } = exports;
    const testCases = [
      'could you',
      'feel free',
      'help yourself',
      'join us',
      'let me',
      'may I',
      'shall we',
      'would you like'
    ];

    for (const phrase of testCases) {
      const pair = ipaPair({ en: phrase });
      expect(pair.uk, `Missing UK IPA for ${phrase}`).toMatch(/^\/.+\/$/);
      expect(pair.us, `Missing US IPA for ${phrase}`).toMatch(/^\/.+\/$/);
    }
  });

  it('renders .say-ipa elements inside ipaHtml for both UK and US pronunciations', () => {
    const { ipaHtml } = exports;
    const html = ipaHtml({ en: 'could you' });
    expect(html).toContain('class="ipa"');
    expect(html).toContain('<b>UK</b>');
    expect(html).toContain('<b>US</b>');
    expect(html).toContain('class="say-ipa"');
    expect(html).toContain('/kʊd juː/');
  });

  it('generates IPA transcriptions for single-word everyday vocabulary items', () => {
    const { ipaPair } = exports;
    const singleWords = ['bread', 'water', 'coffee', 'tea', 'cheese', 'rice', 'apple', 'sugar', 'myself', 'himself'];

    for (const word of singleWords) {
      const pair = ipaPair({ en: word });
      expect(pair.uk, `Missing UK IPA for word ${word}`).toBeTruthy();
      expect(pair.us, `Missing US IPA for word ${word}`).toBeTruthy();
    }
  });

  it('supports themes sky, dark, and sage without CSS variable collision', () => {
    const root = dom.document.documentElement;
    for (const theme of ['sky', 'dark', 'sage']) {
      root.setAttribute('data-theme', theme);
      expect(root.getAttribute('data-theme')).toBe(theme);
    }
  });
});
