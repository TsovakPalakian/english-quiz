import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Window } from 'happy-dom';

let window;

beforeEach(() => {
  window = new Window();
  global.window = window;
  global.srcSeq = 0;
});

afterEach(() => {
  delete window.SPEAKOUT;
});

// Extract functions from preview.js for testing
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function domEntityId(value) {
  const raw = String(value == null ? "" : value);
  if (!/^[1-9]\d{0,15}$/.test(raw)) return value;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : value;
}

const dayScreens = {
  lesson: "groups", lesson07: "groups", lesson09: "groups", lesson14: "groups", lesson16: "groups", lesson23: "groups", material: "groups", word: "groups", rules: "groups", daywords: "groups", daywork: "groups", daysetup: "groups", dayq: "groups", daychoice: "groups", dayflip: "groups", dayjudge: "groups", days: "groups", pdfview: "groups",
  song: "library", music: "library", lyricadd: "library", musicword: "library", texts: "library", textedit: "library", textread: "library", tenses: "library", tense: "library", marker: "library", library: "library", verbs: "library", phrasal: "library", idioms: "library", articles: "library", speakout: "library",
  choice: "setup", flip: "setup", type: "setup", gap: "setup", build: "setup", judge: "setup", tap: "setup", multi: "setup", pairs: "setup", exam: "setup", errors: "setup", setup: "setup",
  made: "add", allwords: "home", cardstat: "home", everyday: "library", everydaygroup: "library", everydaytopic: "library", grammarcategories: "library", grammarcategory: "library", grammarrule: "library",
  account: "account", profile: "account", admin: "admin", adminuser: "admin", admingrouplevel: "admin", admingroup: "admin", themes: "account"
};

function guestRestrictedPage(id) {
  return ['groups','exams','library','stats','profile','speakouteditor'].includes(id)||['groups','exams','library'].includes(dayScreens[id]);
}

describe('preview.js - domEntityId', () => {
  it('преобразует валидные числовые строки в числа', () => {
    expect(domEntityId('123')).toBe(123);
    expect(domEntityId('1')).toBe(1);
    expect(domEntityId('999999999999999')).toBe(999999999999999);
  });

  it('отклоняет ноль в начале', () => {
    expect(domEntityId('0123')).toBe('0123');
    expect(domEntityId('0')).toBe('0');
  });

  it('возвращает оригинальное значение для невалидных строк', () => {
    expect(domEntityId('abc')).toBe('abc');
    expect(domEntityId('123abc')).toBe('123abc');
    expect(domEntityId('')).toBe('');
  });

  it('обрабатывает null и undefined', () => {
    expect(domEntityId(null)).toBe(null);
    expect(domEntityId(undefined)).toBe(undefined);
  });

  it('проверяет безопасное целое число', () => {
    expect(domEntityId('9007199254740991')).toBe(9007199254740991); // MAX_SAFE_INTEGER
    expect(domEntityId('9007199254740992')).toBe('9007199254740992'); //超出
  });
});

describe('preview.js - dayScreens mapping', () => {
  it('уроки относятся к groups', () => {
    expect(dayScreens.lesson).toBe('groups');
    expect(dayScreens.lesson07).toBe('groups');
    expect(dayScreens.material).toBe('groups');
    expect(dayScreens.days).toBe('groups');
  });

  it('музыка и тексты относятся к library', () => {
    expect(dayScreens.song).toBe('library');
    expect(dayScreens.music).toBe('library');
    expect(dayScreens.texts).toBe('library');
    expect(dayScreens.library).toBe('library');
    expect(dayScreens.verbs).toBe('library');
  });

  it('квизы относятся к setup', () => {
    expect(dayScreens.choice).toBe('setup');
    expect(dayScreens.flip).toBe('setup');
    expect(dayScreens.exam).toBe('setup');
    expect(dayScreens.setup).toBe('setup');
  });

  it('добавленные слова и статистика относятся к home', () => {
    expect(dayScreens.made).toBe('add');
    expect(dayScreens.allwords).toBe('home');
    expect(dayScreens.cardstat).toBe('home');
  });

  it('аккаунт и админка относятся к account/admin', () => {
    expect(dayScreens.account).toBe('account');
    expect(dayScreens.profile).toBe('account');
    expect(dayScreens.admin).toBe('admin');
    expect(dayScreens.themes).toBe('account');
  });
});

describe('preview.js - guestRestrictedPage', () => {
  it('блокирует groups для гостей', () => {
    expect(guestRestrictedPage('groups')).toBe(true);
  });

  it('блокирует exams для гостей', () => {
    expect(guestRestrictedPage('exams')).toBe(true);
  });

  it('блокирует library для гостей', () => {
    expect(guestRestrictedPage('library')).toBe(true);
  });

  it('блокирует stats для гостей', () => {
    expect(guestRestrictedPage('stats')).toBe(true);
  });

  it('блокирует profile для гостей', () => {
    expect(guestRestrictedPage('profile')).toBe(true);
  });

  it('блокирует speakouteditor для гостей', () => {
    expect(guestRestrictedPage('speakouteditor')).toBe(true);
  });

  it('блокирует уроки (lesson) для гостей через dayScreens', () => {
    expect(guestRestrictedPage('lesson')).toBe(true);
    expect(guestRestrictedPage('material')).toBe(true);
    expect(guestRestrictedPage('days')).toBe(true);
  });

  it('разрешает home для гостей', () => {
    expect(guestRestrictedPage('home')).toBe(false);
  });

  it('разрешает account для гостей', () => {
    expect(guestRestrictedPage('account')).toBe(false);
  });

  it('разрешает quiz страницы для гостей', () => {
    expect(guestRestrictedPage('choice')).toBe(false);
    expect(guestRestrictedPage('flip')).toBe(false);
    expect(guestRestrictedPage('setup')).toBe(false);
  });
});

describe('preview.js - lessonLabel', () => {
  function lessonLabel(unitIndex, lesson) {
    return (unitIndex + 1) + lesson.letter + " " + lesson.title;
  }

  it('форматирует метку урока', () => {
    const lesson = { letter: 'A', title: 'Getting Started' };
    expect(lessonLabel(0, lesson)).toBe('1A Getting Started');
    expect(lessonLabel(2, lesson)).toBe('3A Getting Started');
  });

  it('форматирует с разными буквами', () => {
    const lesson = { letter: 'B', title: 'Daily Life' };
    expect(lessonLabel(1, lesson)).toBe('2B Daily Life');
  });
});

describe('preview.js - placeKey', () => {
  function placeKey(place) {
    if (place.id === 'groups' || place.id === 'exams') return [place.id,place.groupViewLevel,place.examViewLevel,place.examViewGroup].join('|');
    if (place.id === 'admingrouplevel') return place.id + '|' + place.adminGroupLevel;
    if(place.id?.startsWith('grammar'))return place.id+'|'+(place.grammarCategory||'')+'|'+(place.grammarRule||'');
    if(place.id?.startsWith('everyday'))return [place.id,place.everyday?.group,place.everyday?.topic,place.everyday?.groupSearch,place.everyday?.wordSearch].join('|');
    return [place.id, place.view || "", place.area || "", place.kind || "", place.topic || "", place.compare || "", place.marker || "", place.statKind || "", place.statGroup || "", place.statSong || "", place.allGroup || "", place.allSong || "", place.addGroup || "", place.addSong || "", place.verbGroup || "", place.verbKey || "", place.speakView || "", place.speakLevel, place.speakUnit, place.speakLesson, place.workDay || "", place.workKind || ""].join("|");
  }

  it('генерирует ключ для groups', () => {
    const place = { id: 'groups', groupViewLevel: 'A1', examViewLevel: '', examViewGroup: null };
    expect(placeKey(place)).toBe('groups|A1||');
  });

  it('генерирует ключ для exams', () => {
    const place = { id: 'exams', groupViewLevel: '', examViewLevel: 'B1', examViewGroup: 42 };
    expect(placeKey(place)).toBe('exams||B1|42');
  });

  it('генерирует ключ для admingrouplevel', () => {
    const place = { id: 'admingrouplevel', adminGroupLevel: 'A2' };
    expect(placeKey(place)).toBe('admingrouplevel|A2');
  });

  it('генерирует ключ для grammar страниц', () => {
    const place = { id: 'grammarcategories', grammarCategory: 'nouns', grammarRule: '' };
    expect(placeKey(place)).toBe('grammarcategories|nouns|');
  });

  it('генерирует ключ для everyday страниц', () => {
    const place = { id: 'everyday', everyday: { group: 'topic1', topic: 'sub1', groupSearch: '', wordSearch: '' } };
    expect(placeKey(place)).toBe('everyday|topic1|sub1||');
  });

  it('генерирует общий ключ с параметрами', () => {
    const place = {
      id: 'home',
      view: 'hub',
      area: '',
      kind: 'topic',
      topic: 'ps',
      speakView: 'levels',
      speakLevel: -1,
      speakUnit: -1,
      speakLesson: -1
    };
    const key = placeKey(place);
    expect(key).toContain('home');
    expect(key).toContain('hub');
    expect(key).toContain('levels');
  });
});

describe('preview.js - speakBook', () => {
  it('возвращает SPEAKOUT если определен', () => {
    const bookData = [{ level: 'Starter', units: [] }];
    window.SPEAKOUT = bookData;
    const speakBook = () => window.SPEAKOUT || [];
    expect(speakBook()).toEqual(bookData);
  });

  it('возвращает пустой массив если SPEAKOUT не определен', () => {
    const speakBook = () => window.SPEAKOUT || [];
    expect(speakBook()).toEqual([]);
  });
});

describe('preview.js - syncHomeBack логика', () => {
  it('скрывает кнопки когда navStack пуст', () => {
    const navStack = [];
    const hidden = navStack.length === 0;
    expect(hidden).toBe(true);
  });

  it('показывает кнопки когда navStack не пуст', () => {
    const navStack = [{ id: 'home' }];
    const hidden = navStack.length === 0;
    expect(hidden).toBe(false);
  });
});

describe('preview.js - tidy', () => {
  function tidy(text) {
    return String(text || "").replace(/\s+/g, " ").replace(/\s+([.,?!;:])/g, "$1").replace(/\[[^\]]+\]\s*/g, "").trim();
  }

  it('удаляет лишние пробелы', () => {
    expect(tidy('hello   world')).toBe('hello world');
    expect(tidy('  multiple   spaces  ')).toBe('multiple spaces');
  });

  it('удаляет пробелы перед знаками препинания', () => {
    expect(tidy('hello , world')).toBe('hello, world');
    expect(tidy('test . end')).toBe('test. end');
  });

  it('удаляет содержимое в квадратных скобках', () => {
    expect(tidy('text [ignore this] more')).toBe('text more');
    expect(tidy('[remove] keep')).toBe('keep');
  });

  it('обрабатывает null и undefined', () => {
    expect(tidy(null)).toBe('');
    expect(tidy(undefined)).toBe('');
  });

  it('trim пробелы по краям', () => {
    expect(tidy('  text  ')).toBe('text');
  });
});

describe('preview.js - topicPair', () => {
  function topicPair(value, tag) {
    const name = tag || "p";
    if (!value) return "";
    if (typeof value === "string") return "<" + name + ">" + esc(value) + "</" + name + ">";
    return "<" + name + ' class="ru">' + esc(value.ru || "") + "</" + name + "><" + name + ' class="en">' + esc(value.en || "") + "</" + name + ">";
  }

  it('возвращает пустую строку для falsy значений', () => {
    expect(topicPair(null)).toBe('');
    expect(topicPair('')).toBe('');
    expect(topicPair(undefined)).toBe('');
  });

  it('оборачивает строку в тег', () => {
    expect(topicPair('Hello', 'p')).toBe('<p>Hello</p>');
    expect(topicPair('Test', 'h3')).toBe('<h3>Test</h3>');
  });

  it('использует p по умолчанию', () => {
    expect(topicPair('text')).toBe('<p>text</p>');
  });

  it('обрабатывает объект с ru и en', () => {
    const value = { ru: 'Привет', en: 'Hello' };
    expect(topicPair(value, 'p')).toBe('<p class="ru">Привет</p><p class="en">Hello</p>');
  });

  it('экранирует HTML', () => {
    expect(topicPair('<script>', 'p')).toBe('<p>&lt;script&gt;</p>');
  });
});

describe('preview.js - tenseGroups структура', () => {
  const tenseGroups = [
    { group: "Present", items: ["ps", "pc", "pp", "ppc"] },
    { group: "Past", items: ["pasts", "pastc", "pastp", "pastpc"] },
    { group: "Future", items: ["will", "going", "futc", "futp", "futpc", "pcfut", "psfut", "futother", "futpast"] },
    { group: "Habit", items: ["used", "would", "beused"] },
    { group: "Gerund and infinitive", items: ["gerund", "inf", "gerinf"] },
    { group: "Time words", items: ["markers"] }
  ];

  it('содержит 6 групп', () => {
    expect(tenseGroups.length).toBe(6);
  });

  it('Present группа содержит 4 времени', () => {
    const present = tenseGroups.find(g => g.group === "Present");
    expect(present.items.length).toBe(4);
    expect(present.items).toEqual(["ps", "pc", "pp", "ppc"]);
  });

  it('Past группа содержит 4 времени', () => {
    const past = tenseGroups.find(g => g.group === "Past");
    expect(past.items.length).toBe(4);
  });

  it('Future группа содержит 9 времен', () => {
    const future = tenseGroups.find(g => g.group === "Future");
    expect(future.items.length).toBe(9);
  });
});

describe('preview.js - sourceList', () => {
  function foldedLinkHtml(pairs) {
    const rows = (pairs || []).filter((pair) => pair && pair[1]);
    if (!rows.length) return "";
    const link = (pair) => '<a href="' + esc(pair[1]) + '" target="_blank" rel="noreferrer">' + esc(pair[0]) + "</a>";
    if (rows.length <= 2) return rows.map(link).join(" · ");
    const id = "srcRest" + (++global.srcSeq || 0);
    return rows.slice(0, 2).map(link).join(" · ") +
      ' · <button type="button" class="src-more" data-src-more="' + id + '">...</button><span id="' + id + '" hidden> · ' +
      rows.slice(2).map(link).join(" · ") + "</span>";
  }

  function sourceList(links) {
    const html = foldedLinkHtml(links);
    return html ? '<p class="src">' + html + "</p>" : "";
  }

  it('возвращает пустую строку для пустых ссылок', () => {
    expect(sourceList([])).toBe('');
    expect(sourceList(null)).toBe('');
    expect(sourceList([null, undefined])).toBe('');
  });

  it('оборачивает одну ссылку', () => {
    const links = [['Cambridge', 'https://cambridge.org']];
    expect(sourceList(links)).toBe('<p class="src"><a href="https://cambridge.org" target="_blank" rel="noreferrer">Cambridge</a></p>');
  });

  it('соединяет 2 ссылки разделителем', () => {
    const links = [['Cambridge', 'https://cambridge.org'], ['Oxford', 'https://oxford.com']];
    const result = sourceList(links);
    expect(result).toContain('Cambridge');
    expect(result).toContain('Oxford');
    expect(result).toContain(' · ');
  });

  it('скрывает ссылки больше 2-х за кнопкой', () => {
    const links = [['A', 'url1'], ['B', 'url2'], ['C', 'url3']];
    const result = sourceList(links);
    expect(result).toContain('src-more');
    expect(result).toContain('hidden');
  });
});

describe('preview.js - topicById и areaById', () => {
  it('topicById возвращает null если GRAMMAR не определен', () => {
    const topicById = (id) => (window.GRAMMAR && window.GRAMMAR.topics && window.GRAMMAR.topics[id]) || null;
    expect(topicById('ps')).toBe(null);
  });

  it('topicById возвращает топик из GRAMMAR', () => {
    window.GRAMMAR = { topics: { ps: { name: 'Present Simple' } } };
    const topicById = (id) => (window.GRAMMAR && window.GRAMMAR.topics && window.GRAMMAR.topics[id]) || null;
    expect(topicById('ps')).toEqual({ name: 'Present Simple' });
    delete window.GRAMMAR;
  });

  it('areaById возвращает null если GRAMMAR не определен', () => {
    const areaById = (id) => ((window.GRAMMAR && window.GRAMMAR.areas) || []).filter((area) => area.id === id)[0] || null;
    expect(areaById('tenses')).toBe(null);
  });

  it('areaById находит область по id', () => {
    window.GRAMMAR = { areas: [{ id: 'tenses', title: 'Tenses' }] };
    const areaById = (id) => ((window.GRAMMAR && window.GRAMMAR.areas) || []).filter((area) => area.id === id)[0] || null;
    expect(areaById('tenses')).toEqual({ id: 'tenses', title: 'Tenses' });
    delete window.GRAMMAR;
  });
});

describe('preview.js - THEMES массив', () => {
  const THEMES = [
    ["almond", "Almond blossom - Van Gogh", "#D4EEEA", "#F6FBFA", "#1C7874"],
    ["light", "Light", "#F4F6FB", "#FFFFFF", "#3D3BF3"],
    ["grey", "Grey", "#CFD0D3", "#E3E4E6", "#3D3BF3"],
    ["dark", "Dark", "#0D1020", "#171B33", "#7C7BFF"]
  ];

  it('содержит темы с 5 элементами', () => {
    THEMES.forEach(theme => {
      expect(theme.length).toBe(5);
    });
  });

  it('первый элемент - это id темы', () => {
    expect(THEMES[0][0]).toBe('almond');
    expect(THEMES[1][0]).toBe('light');
  });

  it('второй элемент - это название', () => {
    expect(THEMES[0][1]).toBe('Almond blossom - Van Gogh');
  });

  it('элементы 2-4 - это цвета', () => {
    expect(THEMES[0][2]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(THEMES[0][3]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(THEMES[0][4]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('preview.js - tenses объект', () => {
  const tenses = {
    ps: { name: "Present Simple", form: "I work" },
    pc: { name: "Present Continuous", form: "I am working" },
    pp: { name: "Present Perfect", form: "I have worked" }
  };

  it('содержит данные о временах', () => {
    expect(tenses.ps.name).toBe('Present Simple');
    expect(tenses.ps.form).toBe('I work');
  });

  it('каждое время имеет name и form', () => {
    Object.values(tenses).forEach(tense => {
      expect(tense.name).toBeDefined();
      expect(tense.form).toBeDefined();
    });
  });
});

describe('preview.js - clampNum', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }

  it('ограничивает число в диапазоне', () => {
    expect(clampNum(5, 0, 10)).toBe(5);
    expect(clampNum(-5, 0, 10)).toBe(0);
    expect(clampNum(15, 0, 10)).toBe(10);
  });

  it('работает с отрицательными значениями', () => {
    expect(clampNum(-10, -5, 5)).toBe(-5);
    expect(clampNum(10, -5, 5)).toBe(5);
  });
});

describe('preview.js - hexByte', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hexByte(n) { return clampNum(Math.round(n), 0, 255).toString(16).padStart(2, "0"); }

  it('преобразует число в hex', () => {
    expect(hexByte(0)).toBe('00');
    expect(hexByte(255)).toBe('ff');
    expect(hexByte(16)).toBe('10');
    expect(hexByte(10)).toBe('0a');
  });

  it('ограничивает до 0-255', () => {
    expect(hexByte(-10)).toBe('00');
    expect(hexByte(300)).toBe('ff');
  });
});

describe('preview.js - rgbHex', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hexByte(n) { return clampNum(Math.round(n), 0, 255).toString(16).padStart(2, "0"); }
  function rgbHex(r, g, b) { return "#" + hexByte(r) + hexByte(g) + hexByte(b); }

  it('преобразует RGB в hex', () => {
    expect(rgbHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbHex(0, 0, 0)).toBe('#000000');
    expect(rgbHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbHex(0, 255, 0)).toBe('#00ff00');
  });
});

describe('preview.js - hslRgb', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clampNum(s, 0, 1);
    l = clampNum(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  it('преобразует HSL в RGB', () => {
    const result = hslRgb(0, 1, 0.5);
    expect(result[0]).toBeCloseTo(255, 0);
    expect(result[1]).toBeCloseTo(0, 0);
    expect(result[2]).toBeCloseTo(0, 0);
  });

  it('нормализует hue', () => {
    expect(hslRgb(360, 1, 0.5)).toEqual(hslRgb(0, 1, 0.5));
    expect(hslRgb(-90, 1, 0.5)).toEqual(hslRgb(270, 1, 0.5));
  });

  it('ограничивает saturation и lightness', () => {
    expect(hslRgb(0, 2, 0.5)).toEqual(hslRgb(0, 1, 0.5));
    expect(hslRgb(0, 0.5, 2)).toEqual(hslRgb(0, 0.5, 1));
  });
});

describe('preview.js - channelLum', () => {
  function channelLum(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  it('вычисляет относительную яркость канала', () => {
    expect(channelLum(0)).toBe(0);
    expect(channelLum(255)).toBeCloseTo(1, 4);
  });
});

describe('preview.js - relLum', () => {
  function channelLum(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function relLum(r, g, b) {
    return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
  }

  it('вычисляет относительную яркость RGB', () => {
    expect(relLum(255, 255, 255)).toBeCloseTo(1, 4);
    expect(relLum(0, 0, 0)).toBe(0);
  });

  it('зеленый имеет больший вес', () => {
    const greenLum = relLum(0, 255, 0);
    const redLum = relLum(255, 0, 0);
    expect(greenLum).toBeGreaterThan(redLum);
  });
});

describe('preview.js - customThemeOk', () => {
  const CUSTOM_COLOR_KEYS = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc", "--photo-wash"];

  function customThemeOk(row) {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    const wash = /^#[0-9A-Fa-f]{8}$/;
    const photoRe = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
    if (!row || typeof row.id !== "string" || row.id.indexOf("user-") !== 0 || !row.vars) return false;
    for (let i = 0; i < CUSTOM_COLOR_KEYS.length; i++) {
      const key = CUSTOM_COLOR_KEYS[i];
      const val = row.vars[key];
      if (val == null || val === "") continue;
      if (typeof val !== "string") return false;
      if (key === "--photo-wash") {
        if (!wash.test(val) && !hex.test(val)) return false;
      } else if (!hex.test(val)) {
        return false;
      }
    }
    if (typeof row.vars["--bg"] !== "string" || !hex.test(row.vars["--bg"])) return false;
    if (typeof row.vars["--card"] !== "string" || !hex.test(row.vars["--card"])) return false;
    if (typeof row.vars["--acc"] !== "string" || !hex.test(row.vars["--acc"])) return false;
    if (row.photo != null && row.photo !== "") {
      const photoKey = /^stage-local\/themes\/[A-Za-z0-9_-]{1,100}\/user-[a-z0-9-]{1,80}\/[a-f0-9]{64}$/;
      if (typeof row.photo !== "string" || row.photo.length > 450000) return false;
      if (!photoRe.test(row.photo) && !photoKey.test(row.photo)) return false;
    }
    return true;
  }

  it('отклоняет без id', () => {
    expect(customThemeOk({})).toBe(false);
    expect(customThemeOk({ id: 'invalid' })).toBe(false);
  });

  it('принимает валидную тему', () => {
    const theme = {
      id: 'user-test',
      vars: {
        '--bg': '#FFFFFF',
        '--card': '#F0F0F0',
        '--acc': '#FF0000'
      }
    };
    expect(customThemeOk(theme)).toBe(true);
  });

  it('требует hex цвета', () => {
    const theme = {
      id: 'user-test',
      vars: {
        '--bg': 'invalid',
        '--card': '#F0F0F0',
        '--acc': '#FF0000'
      }
    };
    expect(customThemeOk(theme)).toBe(false);
  });

  it('принимает data URL фото', () => {
    const theme = {
      id: 'user-test',
      vars: {
        '--bg': '#FFFFFF',
        '--card': '#F0F0F0',
        '--acc': '#FF0000'
      },
      photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };
    expect(customThemeOk(theme)).toBe(true);
  });

  it('отклоняет слишком большое фото', () => {
    const theme = {
      id: 'user-test',
      vars: {
        '--bg': '#FFFFFF',
        '--card': '#F0F0F0',
        '--acc': '#FF0000'
      },
      photo: 'x'.repeat(500000)
    };
    expect(customThemeOk(theme)).toBe(false);
  });
});

describe('preview.js - themeCut', () => {
  const THEMES = [
    ["almond", "Almond"],
    ["light", "Light"],
    ["coral", "Coral"],
    ["dark", "Dark"]
  ];

  function themeCut() {
    const cut = THEMES.findIndex((row) => row[0] === "coral");
    return cut < 0 ? THEMES.length : cut;
  }

  it('находит индекс coral', () => {
    expect(themeCut()).toBe(2);
  });

  it('возвращает длину если coral не найден', () => {
    const noCoral = [["almond", "Almond"], ["light", "Light"]];
    const cut = noCoral.findIndex((row) => row[0] === "coral");
    expect(cut < 0 ? noCoral.length : cut).toBe(2);
  });
});

describe('preview.js - themeNameParts', () => {
  function themeNameParts(name) {
    const text = String(name || "").trim();
    const match = text.match(/^(.*?)\s*(?:—|–|\s-\s)\s*(.*)$/);
    if (!match) return [text];
    const left = match[1].trim();
    const right = match[2].trim();
    if (!left || !right) return [text];
    return [left, right];
  }

  it('разделяет имя с тире', () => {
    expect(themeNameParts('Almond — Blossom')).toEqual(['Almond', 'Blossom']);
    expect(themeNameParts('Light – Grey')).toEqual(['Light', 'Grey']);
    expect(themeNameParts('Dark - Mode')).toEqual(['Dark', 'Mode']);
  });

  it('возвращает оригинал если нет разделителя', () => {
    expect(themeNameParts('Almond')).toEqual(['Almond']);
    expect(themeNameParts('')).toEqual(['']);
  });

  it('обрезает пробелы', () => {
    expect(themeNameParts('  Almond — Blossom  ')).toEqual(['Almond', 'Blossom']);
  });
});

describe('preview.js - themeNameHtml', () => {
  function themeNameParts(name) {
    const text = String(name || "").trim();
    const match = text.match(/^(.*?)\s*(?:—|–|\s-\s)\s*(.*)$/);
    if (!match) return [text];
    const left = match[1].trim();
    const right = match[2].trim();
    if (!left || !right) return [text];
    return [left, right];
  }

  function themeNameHtml(name) {
    const parts = themeNameParts(name);
    if (parts.length < 2) return esc(parts[0]);
    return esc(parts[0]) + '<span class="theme-sub">' + esc(parts[1]) + "</span>";
  }

  it('оборачивает вторую часть в span', () => {
    expect(themeNameHtml('Almond — Blossom')).toBe('Almond<span class="theme-sub">Blossom</span>');
  });

  it('экранирует HTML', () => {
    expect(themeNameHtml('<script> — Test')).toBe('&lt;script&gt;<span class="theme-sub">Test</span>');
  });

  it('возвращает оригинал если нет разделителя', () => {
    expect(themeNameHtml('Almond')).toBe('Almond');
  });
});

describe('preview.js - themePhotoStamp', () => {
  function themePhotoStamp(photo) {
    return typeof photo === "string" && photo.indexOf("stage-local/themes/") === 0 ? photo.slice(photo.lastIndexOf("/") + 1) : "";
  }

  it('извлекает stamp из пути', () => {
    expect(themePhotoStamp('stage-local/themes/1/user-test/abc123')).toBe('abc123');
  });

  it('возвращает пустую строку для других путей', () => {
    expect(themePhotoStamp('data:image/png;base64')).toBe('');
    expect(themePhotoStamp('')).toBe('');
  });
});

describe('preview.js - keptThemePhoto', () => {
  function keptThemePhoto(row) {
    const photo = row && typeof row.photo === "string" ? row.photo : "";
    return photo.indexOf("stage-local/themes/") === 0 ? photo : "";
  }

  it('сохраняет только stage-local фото', () => {
    expect(keptThemePhoto({ photo: 'stage-local/themes/1/user/test' })).toBe('stage-local/themes/1/user/test');
    expect(keptThemePhoto({ photo: 'data:image/png;base64' })).toBe('');
    expect(keptThemePhoto({})).toBe('');
  });
});

describe('preview.js - twinStudyLogin', () => {
  function twinStudyLogin(login) {
    if (login === "TsovakDev") return "Tsovak";
    if (login === "Tsovak") return "TsovakDev";
    return "";
  }

  it('меняет логины Tsovak', () => {
    expect(twinStudyLogin('TsovakDev')).toBe('Tsovak');
    expect(twinStudyLogin('Tsovak')).toBe('TsovakDev');
  });

  it('возвращает пустую строку для других', () => {
    expect(twinStudyLogin('Other')).toBe('');
    expect(twinStudyLogin('')).toBe('');
  });
});

describe('preview.js - dataUrlBlob', () => {
  function dataUrlBlob(photo) {
    const comma = String(photo || "").indexOf(",");
    const mime = (String(photo || "").slice(0, comma).match(/^data:([^;,]+)/) || [])[1] || "image/jpeg";
    const binary = atob(String(photo || "").slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  it('преобразует data URL в Blob', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blob = dataUrlBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  it('использует image/jpeg по умолчанию', () => {
    const blob = dataUrlBlob('data:,test');
    expect(blob.type).toBe('image/jpeg');
  });

  it('обрабатывает пустую строку', () => {
    const blob = dataUrlBlob('');
    expect(blob.type).toBe('image/jpeg');
  });
});

describe('preview.js - veilByte', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function veilByte(percent) {
    return clampNum(Math.round(Number(percent) / 100 * 255), 0, 255).toString(16).padStart(2, "0");
  }

  it('преобразует процент в hex byte', () => {
    expect(veilByte(0)).toBe('00');
    expect(veilByte(100)).toBe('ff');
    expect(veilByte(50)).toBe('80');
  });

  it('ограничивает диапазон', () => {
    expect(veilByte(-10)).toBe('00');
    expect(veilByte(150)).toBe('ff');
  });
});

describe('preview.js - veilPercent', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function veilPercent(wash) {
    const alpha = parseInt(String(wash || "").slice(7, 9), 16);
    if (!Number.isFinite(alpha)) return 60;
    return clampNum(Math.round(alpha / 255 * 100), 0, 100);
  }

  it('преобразует hex alpha в процент', () => {
    expect(veilPercent('#ffffff00')).toBe(0);
    expect(veilPercent('#ffffff80')).toBe(50);
    expect(veilPercent('#ffffffff')).toBe(100);
  });

  it('возвращает 60 по умолчанию', () => {
    expect(veilPercent('')).toBe(60);
    expect(veilPercent('invalid')).toBe(60);
  });
});

describe('preview.js - typedThemeName', () => {
  function typedThemeName(list, input) {
    const typed = (input || "").trim().replace(/\s+/g, " ").slice(0, 64);
    return typed || ("Picture " + (list.length + 1));
  }

  it('использует введенное имя', () => {
    expect(typedThemeName([], 'My Theme')).toBe('My Theme');
  });

  it('генерирует имя по умолчанию', () => {
    expect(typedThemeName([], '')).toBe('Picture 1');
    expect(typedThemeName([{id: '1'}], '')).toBe('Picture 2');
  });

  it('обрезает лишние пробелы', () => {
    expect(typedThemeName([], '  My   Theme  ')).toBe('My Theme');
  });

  it('ограничивает длину', () => {
    const long = 'x'.repeat(100);
    expect(typedThemeName([], long).length).toBe(64);
  });
});

describe('preview.js - hexHsl', () => {
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hexByte(n) { return clampNum(Math.round(n), 0, 255).toString(16).padStart(2, "0"); }
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clampNum(s, 0, 1);
    l = clampNum(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbHex(r, g, b) { return "#" + hexByte(r) + hexByte(g) + hexByte(b); }
  function hexHsl(h, s, l) {
    const rgb = hslRgb(h, s, l);
    return rgbHex(rgb[0], rgb[1], rgb[2]);
  }

  it('преобразует HSL в hex', () => {
    expect(hexHsl(0, 1, 0.5)).toBe('#ff0000');
    expect(hexHsl(120, 1, 0.5)).toBe('#00ff00');
    expect(hexHsl(240, 1, 0.5)).toBe('#0000ff');
  });

  it('черный и белый', () => {
    expect(hexHsl(0, 0, 0)).toBe('#000000');
    expect(hexHsl(0, 0, 1)).toBe('#ffffff');
  });
});

describe('preview.js - rgbHsl', () => {
  function rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  it('преобразует RGB в HSL', () => {
    const result = rgbHsl(255, 0, 0);
    expect(result.h).toBeCloseTo(0, 0);
    expect(result.s).toBe(1);
    expect(result.l).toBe(0.5);
  });

  it('серый имеет saturation 0', () => {
    const result = rgbHsl(128, 128, 128);
    expect(result.s).toBe(0);
  });

  it('белый имеет lightness 1', () => {
    const result = rgbHsl(255, 255, 255);
    expect(result.l).toBe(1);
  });
});

describe('preview.js - DEFAULT_THEME', () => {
  const DEFAULT_THEME = "almond";

  it('значение по умолчанию almond', () => {
    expect(DEFAULT_THEME).toBe('almond');
  });
});

describe('preview.js - THEME_KEY', () => {
  const THEME_KEY = "enquiz-theme";

  it('ключ localStorage для темы', () => {
    expect(THEME_KEY).toBe('enquiz-theme');
  });
});

describe('preview.js - CUSTOM_THEME_KEY', () => {
  const CUSTOM_THEME_KEY = "enquiz-custom-themes";

  it('ключ localStorage для кастомных тем', () => {
    expect(CUSTOM_THEME_KEY).toBe('enquiz-custom-themes');
  });
});

describe('preview.js - CUSTOM_COLOR_KEYS', () => {
  const CUSTOM_COLOR_KEYS = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc", "--photo-wash"];

  it('содержит все CSS переменные темы', () => {
    expect(CUSTOM_COLOR_KEYS.length).toBe(13);
    expect(CUSTOM_COLOR_KEYS).toContain('--bg');
    expect(CUSTOM_COLOR_KEYS).toContain('--card');
    expect(CUSTOM_COLOR_KEYS).toContain('--acc');
  });
});

describe('preview.js - variantKey', () => {
  function variantKey(word) {
    return String(word || "").trim().toLowerCase();
  }

  it('приводит слово к нижнему регистру', () => {
    expect(variantKey('Hello')).toBe('hello');
    expect(variantKey('WORLD')).toBe('world');
  });

  it('обрезает пробелы', () => {
    expect(variantKey('  test  ')).toBe('test');
  });

  it('обрабатывает null и undefined', () => {
    expect(variantKey(null)).toBe('');
    expect(variantKey(undefined)).toBe('');
  });
});

describe('preview.js - ipaText', () => {
  function ipaText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.charAt(0) === "/" ? text : "/" + text + "/";
  }

  it('оборачивает текст в слеши', () => {
    expect(ipaText('test')).toBe('/test/');
  });

  it('не добавляет слеши если уже есть', () => {
    expect(ipaText('/test/')).toBe('/test/');
  });

  it('возвращает пустую строку для пустого', () => {
    expect(ipaText('')).toBe('');
    expect(ipaText(null)).toBe('');
  });
});

describe('preview.js - ipaNorm', () => {
  function ipaNorm(value) {
    return String(value || "").toLowerCase().replace(/[']/g, "'").replace(/…/g, " ").replace(/[()]/g, " ").replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  }

  it('приводит к нижнему регистру', () => {
    expect(ipaNorm('Hello')).toBe('hello');
  });

  it('заменяет спецсимволы на пробелы', () => {
    expect(ipaNorm('test(?word)')).toBe('test word');
    expect(ipaNorm('hello...world')).toBe('hello world');
  });

  it('удаляет лишние пробелы', () => {
    expect(ipaNorm('  test   word  ')).toBe('test word');
  });
});

describe('preview.js - ipaBare', () => {
  function ipaText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.charAt(0) === "/" ? text : "/" + text + "/";
  }
  function ipaBare(value) {
    return ipaText(value).replace(/^\/|\/$/g, "");
  }

  it('удаляет слеши', () => {
    expect(ipaBare('/test/')).toBe('test');
  });

  it('работает без слешей', () => {
    expect(ipaBare('test')).toBe('test');
  });
});

describe('preview.js - spokenOf', () => {
  function spokenOf(source) {
    if (!source) return "";
    return String(source.en || source.word || "").trim();
  }

  it('возвращает en из объекта', () => {
    expect(spokenOf({ en: 'hello' })).toBe('hello');
  });

  it('возвращает word если нет en', () => {
    expect(spokenOf({ word: 'test' })).toBe('test');
  });

  it('возвращает пустую строку для null', () => {
    expect(spokenOf(null)).toBe('');
    expect(spokenOf({})).toBe('');
  });
});

describe('preview.js - speakable', () => {
  function speakable(text) {
    return String(text || "").replace(/…/g, "").replace(/\//g, " or ").replace(/\\/g, " ").replace(/\s+/g, " ").trim();
  }

  it('удаляет многоточие Unicode', () => {
    expect(speakable('test…')).toBe('test');
  });

  it('заменяет слеш на or', () => {
    expect(speakable('word1/word2')).toBe('word1 or word2');
  });

  it('заменяет обратный слеш на пробел', () => {
    expect(speakable('word\\next')).toBe('word next');
  });

  it('удаляет лишние пробелы', () => {
    expect(speakable('  test   word  ')).toBe('test word');
  });
});

describe('preview.js - oxfordUrl', () => {
  function oxfordUrl(word) {
    const slug = String(word || "").trim().toLowerCase().replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return "https://www.oxfordlearnersdictionaries.com/definition/english/" + (slug || "word");
  }

  it('генерирует URL для слова', () => {
    expect(oxfordUrl('hello')).toBe('https://www.oxfordlearnersdictionaries.com/definition/english/hello');
  });

  it('обрабатывает фразы', () => {
    expect(oxfordUrl('give up')).toBe('https://www.oxfordlearnersdictionaries.com/definition/english/give-up');
  });

  it('возвращает word по умолчанию', () => {
    expect(oxfordUrl('')).toBe('https://www.oxfordlearnersdictionaries.com/definition/english/word');
  });
});

describe('preview.js - wooUrl', () => {
  function wooUrl(word) {
    let text = String(word || "").trim().toLowerCase().replace(/'/g, "'");
    if (text === "won't") text = "will";
    return "https://wooordhunt.ru/word/" + text.replace(/\s+/g, "_");
  }

  it('генерирует URL для слова', () => {
    expect(wooUrl('hello')).toBe('https://wooordhunt.ru/word/hello');
  });

  it('заменяет пробелы на подчеркивания', () => {
    expect(wooUrl('give up')).toBe('https://wooordhunt.ru/word/give_up');
  });

  it('специальный случай для won\'t', () => {
    expect(wooUrl("won't")).toBe('https://wooordhunt.ru/word/will');
  });
});

describe('preview.js - clipKey', () => {
  function clipKey(text) {
    return String(text || "").replace(/[']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  }

  it('приводит к нижнему регистру', () => {
    expect(clipKey('Hello World')).toBe('hello world');
  });

  it('заменяет апострофы', () => {
    expect(clipKey("won't")).toBe("won't");
  });

  it('удаляет лишние пробелы', () => {
    expect(clipKey('  test   word  ')).toBe('test word');
  });
});

describe('preview.js - tidyClip', () => {
  function tidyClip(text) {
    return String(text || "")
      .replace(/[']/g, "'")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[…]/g, " ")
      .replace(/[?!.,:;"\\/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  it('удаляет скобки с содержимым', () => {
    expect(tidyClip('test (remove)')).toBe('test');
  });

  it('удаляет знаки препинания', () => {
    expect(tidyClip('hello, world!')).toBe('hello world');
  });

  it('удаляет многоточие', () => {
    expect(tidyClip('test…')).toBe('test');
  });
});

describe('preview.js - sessionIsDeveloper', () => {
  let authUser;

  beforeEach(() => {
    authUser = null;
  });

  function sessionIsDeveloper() { return !!(authUser && authUser.role === "DEVELOPER"); }

  it('возвращает true для DEVELOPER', () => {
    authUser = { role: 'DEVELOPER' };
    expect(sessionIsDeveloper()).toBe(true);
  });

  it('возвращает false для других ролей', () => {
    authUser = { role: 'USER' };
    expect(sessionIsDeveloper()).toBe(false);
  });

  it('возвращает false если authUser null', () => {
    authUser = null;
    expect(sessionIsDeveloper()).toBe(false);
  });
});

describe('preview.js - isTeacher', () => {
  let authUser, viewAccount;

  beforeEach(() => {
    authUser = null;
    viewAccount = null;
  });

  function isTeacher() {
    if (viewAccount) return viewAccount.role === "ADMIN";
    return !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
  }

  it('ADMIN это учитель', () => {
    authUser = { role: 'ADMIN' };
    expect(isTeacher()).toBe(true);
  });

  it('DEVELOPER это учитель', () => {
    authUser = { role: 'DEVELOPER' };
    expect(isTeacher()).toBe(true);
  });

  it('USER не учитель', () => {
    authUser = { role: 'USER' };
    expect(isTeacher()).toBe(false);
  });

  it('проверяет viewAccount.role', () => {
    authUser = { role: 'USER' };
    viewAccount = { role: 'ADMIN' };
    expect(isTeacher()).toBe(true);
  });
});

describe('preview.js - isDeveloper', () => {
  let authUser, viewAccount;

  beforeEach(() => {
    authUser = null;
    viewAccount = null;
  });

  function isDeveloper() {
    if (viewAccount) return false;
    return !!(authUser && authUser.role === "DEVELOPER");
  }

  it('возвращает true для DEVELOPER', () => {
    authUser = { role: 'DEVELOPER' };
    expect(isDeveloper()).toBe(true);
  });

  it('возвращает false если viewAccount', () => {
    authUser = { role: 'DEVELOPER' };
    viewAccount = { role: 'ADMIN' };
    expect(isDeveloper()).toBe(false);
  });
});

describe('preview.js - canEditLessons', () => {
  let authUser, viewAccount;

  beforeEach(() => {
    authUser = null;
    viewAccount = null;
  });

  function canEditLessons() {
    if (viewAccount) return !!(authUser && authUser.role === "DEVELOPER");
    return !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
  }

  it('ADMIN может редактировать', () => {
    authUser = { role: 'ADMIN' };
    expect(canEditLessons()).toBe(true);
  });

  it('DEVELOPER может редактировать', () => {
    authUser = { role: 'DEVELOPER' };
    expect(canEditLessons()).toBe(true);
  });

  it('USER не может редактировать', () => {
    authUser = { role: 'USER' };
    expect(canEditLessons()).toBe(false);
  });
});

describe('preview.js - hideStudentSongs', () => {
  function hideStudentSongs() {
    return !!(viewAccount && authUser && authUser.role === "ADMIN");
  }

  let viewAccount, authUser;

  beforeEach(() => {
    viewAccount = null;
    authUser = null;
  });

  it('скрывает если ADMIN просматривает аккаунт', () => {
    viewAccount = { id: '123' };
    authUser = { role: 'ADMIN' };
    expect(hideStudentSongs()).toBe(true);
  });

  it('не скрывает если viewAccount null', () => {
    viewAccount = null;
    authUser = { role: 'ADMIN' };
    expect(hideStudentSongs()).toBe(false);
  });
});
