import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractFunctions} from './helpers/extract-function.mjs';

const source = fs.readFileSync('client/02-themes.js', 'utf8');
const THEME_FUNCTION_NAMES = [
  'clampNum',
  'hexByte',
  'rgbHex',
  'hslRgb',
  'hexHsl',
  'rgbHsl',
  'channelLum',
  'relLum',
  'paletteFromPixels',
  'customThemeOk',
  'loadCustomThemes',
  'themesForServer',
  'saveCustomThemes'
];

const extractedThemeCode = extractFunctions(source, ...THEME_FUNCTION_NAMES);

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };
}

function hexToRgb(hex) {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function instantiateThemeEnvironment({initialViewAccount = null} = {}) {
  const storage = createMockLocalStorage();
  const syncChanges = [];
  let currentViewAccount = initialViewAccount;

  const runner = new Function(
    'localStorage',
    'syncChange',
    'getViewAccount',
    `
    const CUSTOM_COLOR_KEYS = ['--bg', '--card', '--ink', '--mute', '--line', '--acc', '--acc-s', '--ok', '--ok-s', '--bad', '--bad-s', '--on-acc', '--photo-wash'];
    const CUSTOM_THEME_KEY = 'enquiz-custom-themes';

    Object.defineProperty(globalThis, 'viewAccount', { get: getViewAccount, configurable: true });

    function keptThemePhoto(row) { return row.photo; }
    function queueThemePhotos(list) {}

    ${extractedThemeCode}

    return {
      paletteFromPixels,
      customThemeOk,
      loadCustomThemes,
      saveCustomThemes,
      themesForServer,
      relLum,
      hexHsl,
      rgbHsl,
      hslRgb
    };
  `
  );

  const api = runner(storage, (op) => syncChanges.push(op), () => currentViewAccount);

  function contrastRatio(hexForeground, hexBackground) {
    const [r1, g1, b1] = hexToRgb(hexForeground);
    const [r2, g2, b2] = hexToRgb(hexBackground);
    const lum1 = api.relLum(r1, g1, b1);
    const lum2 = api.relLum(r2, g2, b2);
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  return {
    api,
    storage,
    syncChanges,
    contrastRatio,
    setViewAccount: (v) => {
      currentViewAccount = v;
    }
  };
}

test('paletteFromPixels generates dark and light palettes based on cluster lightness', () => {
  const env = instantiateThemeEnvironment();

  // 1. Dark palette generation (low lightness deep teal pixels)
  const darkTealPixels = Array.from({length: 120}, () => ({r: 15, g: 35, b: 40}));
  const darkPalette = env.api.paletteFromPixels(darkTealPixels);
  assert.ok(darkPalette);
  assert.equal(darkPalette.vars['color-scheme'], 'dark');
  assert.ok(darkPalette.vars['--bg'].startsWith('#'));
  assert.ok(darkPalette.vars['--card'].startsWith('#'));
  assert.ok(darkPalette.vars['--ink'].startsWith('#'));
  assert.ok(darkPalette.vars['--acc'].startsWith('#'));
  assert.ok(darkPalette.vars['--photo-wash'].endsWith('99'));

  // 2. Light palette generation (high lightness warm cream pixels)
  const lightCreamPixels = Array.from({length: 120}, () => ({r: 245, g: 238, b: 228}));
  const lightPalette = env.api.paletteFromPixels(lightCreamPixels);
  assert.ok(lightPalette);
  assert.equal(lightPalette.vars['color-scheme'], 'light');
  assert.ok(lightPalette.vars['--bg'].startsWith('#'));
  assert.ok(lightPalette.vars['--card'].startsWith('#'));
  assert.ok(lightPalette.vars['--ink'].startsWith('#'));
  assert.equal(lightPalette.vars['--on-acc'], '#FFFFFF');

  // 3. Empty pixels returns null
  assert.equal(env.api.paletteFromPixels([]), null);
});

test('paletteFromPixels maintains WCAG AA contrast ratio of at least 4.5:1 across generated themes', () => {
  const env = instantiateThemeEnvironment();

  const testImageProfiles = [
    {
      name: 'Deep Midnight Blue',
      pixels: [
        ...Array(80).fill({r: 12, g: 18, b: 35}), // background
        ...Array(20).fill({r: 220, g: 140, b: 40}) // golden accent
      ]
    },
    {
      name: 'Forest Shadow',
      pixels: [
        ...Array(80).fill({r: 18, g: 32, b: 20}), // background
        ...Array(20).fill({r: 80, g: 200, b: 120}) // bright mint accent
      ]
    },
    {
      name: 'Warm Parchment',
      pixels: [
        ...Array(80).fill({r: 248, g: 242, b: 230}), // background
        ...Array(20).fill({r: 180, g: 50, b: 40}) // crimson accent
      ]
    },
    {
      name: 'Cool Alabaster',
      pixels: [
        ...Array(80).fill({r: 235, g: 240, b: 245}), // background
        ...Array(20).fill({r: 30, g: 110, b: 190}) // sapphire accent
      ]
    }
  ];

  for (const profile of testImageProfiles) {
    const palette = env.api.paletteFromPixels(profile.pixels);
    assert.ok(palette, `Palette generated for ${profile.name}`);

    const ink = palette.vars['--ink'];
    const bg = palette.vars['--bg'];
    const card = palette.vars['--card'];
    const acc = palette.vars['--acc'];
    const onAcc = palette.vars['--on-acc'];

    // 1. Text against Page Background (WCAG AA requirement: >= 4.5:1)
    const inkBgContrast = env.contrastRatio(ink, bg);
    assert.ok(
      inkBgContrast >= 4.5,
      `${profile.name}: ink-bg contrast ${inkBgContrast.toFixed(2)} must be >= 4.5`
    );

    // 2. Text against Card Container Background (WCAG AA requirement: >= 4.5:1)
    const inkCardContrast = env.contrastRatio(ink, card);
    assert.ok(
      inkCardContrast >= 4.5,
      `${profile.name}: ink-card contrast ${inkCardContrast.toFixed(2)} must be >= 4.5`
    );

    // 3. For light theme profiles, accent text against accent background maintains WCAG AA (>= 4.5:1)
    if (palette.vars['color-scheme'] === 'light') {
      const onAccContrast = env.contrastRatio(onAcc, acc);
      assert.ok(
        onAccContrast >= 4.5,
        `${profile.name}: light theme on-acc contrast ${onAccContrast.toFixed(2)} must be >= 4.5`
      );
    }
  }

  // 4. In dark themes with high-luminance accent, on-acc dynamically switches to dark ink with >= 4.5:1
  const brightYellowAccentPixels = [
    ...Array(80).fill({r: 10, g: 10, b: 10}),
    ...Array(20).fill({r: 255, g: 255, b: 0})
  ];
  const brightPalette = env.api.paletteFromPixels(brightYellowAccentPixels);
  const brightOnAccContrast = env.contrastRatio(brightPalette.vars['--on-acc'], brightPalette.vars['--acc']);
  assert.ok(
    brightOnAccContrast >= 4.5,
    `High-luminance accent on-acc contrast ${brightOnAccContrast.toFixed(2)} must be >= 4.5`
  );
});

test('customThemeOk validates custom theme identifiers, hex colors, and photo constraints', () => {
  const env = instantiateThemeEnvironment();

  const validTheme = {
    id: 'user-amethyst',
    name: 'Amethyst',
    vars: {
      '--bg': '#14101e',
      '--card': '#1e182d',
      '--ink': '#ece8f4',
      '--mute': '#948ea4',
      '--line': '#2d2442',
      '--acc': '#9d65d4',
      '--acc-s': '#3b2454',
      '--ok': '#7dde6a',
      '--ok-s': '#14361c',
      '--bad': '#ff8a80',
      '--bad-s': '#402420',
      '--on-acc': '#ffffff',
      '--photo-wash': '#14101e99'
    },
    photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  };

  // 1. Valid theme passes validation
  assert.equal(env.api.customThemeOk(validTheme), true);

  // 2. Missing 'user-' prefix in ID fails validation
  assert.equal(env.api.customThemeOk({...validTheme, id: 'custom-amethyst'}), false);
  assert.equal(env.api.customThemeOk({...validTheme, id: 'amethyst'}), false);

  // 3. Invalid color values (non-hex, rgb notation, wrong length) fail validation
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--bg': 'rgb(20,16,30)'}}), false);
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--bg': '#14101'}}), false);
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--card': 'invalid'}}), false);
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--acc': '#zzzzzz'}}), false);

  // 4. --photo-wash accepts both 6-char hex and 8-char hex (with alpha byte)
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--photo-wash': '#14101eff'}}), true);
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--photo-wash': '#14101e'}}), true);
  assert.equal(env.api.customThemeOk({...validTheme, vars: {...validTheme.vars, '--photo-wash': '#14101'}}), false);

  // 5. Valid stage-local photo key passes validation
  const stageLocalKey = 'stage-local/themes/account-101/user-amethyst/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  assert.equal(env.api.customThemeOk({...validTheme, photo: stageLocalKey}), true);

  // 6. Invalid photo string (not data URL, not stage-local, or oversized) fails validation
  assert.equal(env.api.customThemeOk({...validTheme, photo: 'https://external.com/photo.jpg'}), false);
  assert.equal(env.api.customThemeOk({...validTheme, photo: 'data:image/jpeg;base64,' + 'a'.repeat(450001)}), false);
});

test('saveCustomThemes limits storage to 16 themes, formats for server, and respects viewAccount guard', () => {
  const env = instantiateThemeEnvironment();

  const createTheme = (index) => ({
    id: `user-theme-${index}`,
    name: `Theme ${index}`,
    vars: {
      '--bg': '#121212',
      '--card': '#1e1e1e',
      '--ink': '#f0f0f0',
      '--mute': '#888888',
      '--line': '#2a2a2a',
      '--acc': '#3b82f6',
      '--on-acc': '#ffffff',
      '--photo-wash': '#12121299'
    },
    photo: index % 2 === 0
      ? 'stage-local/themes/acc-1/user-theme-' + index + '/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      : 'data:image/jpeg;base64,mockphoto'
  });

  // 1. Save list with 20 themes -> clamped to exactly 16
  const list20 = Array.from({length: 20}, (_, i) => createTheme(i));
  env.api.saveCustomThemes(list20);

  const loadedThemes = env.api.loadCustomThemes();
  assert.equal(loadedThemes.length, 16);
  assert.equal(loadedThemes[0].id, 'user-theme-0');
  assert.equal(loadedThemes[15].id, 'user-theme-15');

  // 2. themesForServer preserves stage-local keys and omits raw data URLs
  const serverThemes = env.api.themesForServer(loadedThemes);
  assert.equal(serverThemes.length, 16);
  // index 0 was stage-local -> preserved
  assert.ok(serverThemes[0].photo.startsWith('stage-local/themes/'));
  // index 1 was base64 data URL -> converted to empty string for server payload
  assert.equal(serverThemes[1].photo, '');

  // 3. syncChange is triggered with themesForServer payload when no raw data URLs remain
  const cleanStageLocalList = [createTheme(0), createTheme(2)];
  env.api.saveCustomThemes(cleanStageLocalList);
  assert.equal(env.syncChanges.length, 1);
  assert.equal(env.syncChanges[0].op, 'put-setting');
  assert.equal(env.syncChanges[0].key, 'customThemes');
  assert.equal(env.syncChanges[0].value.length, 2);

  // 4. viewAccount guard prevents teacher from overwriting local themes
  env.setViewAccount({id: 'student-99'});
  env.api.saveCustomThemes([createTheme(99)]);

  // Store remains unchanged at length 2
  const untouchedThemes = env.api.loadCustomThemes();
  assert.equal(untouchedThemes.length, 2);
  assert.equal(untouchedThemes[0].id, 'user-theme-0');
});
