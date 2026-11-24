import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test, {describe} from 'node:test';
import {runInNewContext} from 'node:vm';
import {skyCatalogueFactory} from '../ops/build-preview.mjs';

describe('Taurus Constellation Lines and Inspector Visual Positioning Suite', () => {
  const scope = {};
  runInNewContext(
    skyCatalogueFactory() +
    readFileSync('client/06-auth-astronomy.js', 'utf8') +
    ';globalThis.astro=StudioSkyAstronomy;globalThis.sky=astro.catalogue(STUDIO_SKY_CATALOGUE);',
    scope
  );
  const {astro, sky} = scope;
  const tau = sky.find(c => c.abbr === 'Tau');

  test('Taurus catalogue contains all 12 stars and 11 complete line segments', () => {
    assert.ok(tau, 'Taurus constellation must exist in catalogue');
    assert.equal(tau.stars.length, 12, 'Taurus must have exactly 12 catalogue stars');
    assert.equal(tau.lines.length, 11, 'Taurus must have exactly 11 line segments');

    // Verify all 12 stars are indexed in the lines
    const connectedIndices = new Set();
    for (const [a, b] of tau.lines) {
      connectedIndices.add(a);
      connectedIndices.add(b);
    }
    for (let i = 0; i < 12; i++) {
      assert.ok(connectedIndices.has(i), `Star index ${i} (${tau.stars[i].name}) must be connected by a line`);
    }

    // Verify specific leg connections
    const xiIndex = tau.stars.findIndex(s => s.name.includes('Xi Tau') || s.id === 'hip_16083');
    const nuIndex = tau.stars.findIndex(s => s.name.includes('Nu Tau') || s.id === 'hip_18907');
    const omiIndex = tau.stars.findIndex(s => s.name.includes('o Tau') || s.id === 'hip_15900');
    const tenIndex = tau.stars.findIndex(s => s.name.includes('10 Tau') || s.id === 'hip_16852');

    assert.ok(xiIndex >= 0, 'Xi Tau must exist');
    assert.ok(nuIndex >= 0, 'Nu Tau must exist');
    assert.ok(omiIndex >= 0, 'o Tau must exist');
    assert.ok(tenIndex >= 0, '10 Tau must exist');

    const hasPair = (i, j) => tau.lines.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
    assert.ok(hasPair(xiIndex, nuIndex), 'Must have connection between Xi Tau and Nu Tau');
    assert.ok(hasPair(xiIndex, omiIndex), 'Must have connection between Xi Tau and o Tau');
    assert.ok(hasPair(omiIndex, tenIndex), 'Must have connection between o Tau and 10 Tau');
  });

  test('Taurus fits safely within viewport boundaries without clipping on common screen sizes', () => {
    const viewports = [
      {w: 1440, h: 900},
      {w: 1024, h: 736},
      {w: 800, h: 600},
      {w: 390, h: 844}
    ];

    for (const vp of viewports) {
      const result = astro.fitFigure(tau, vp.w, vp.h, [], (text) => text.length * 8, 2);
      assert.ok(result.diagnostic.placed, `Taurus must be successfully placed on ${vp.w}x${vp.h}`);

      const stars = result.layout.stars.slice(0, tau.stars.length);
      for (const star of stars) {
        assert.ok(star.x >= 20, `Star ${star.name} x=${star.x} must be >= 20 on ${vp.w}x${vp.h}`);
        assert.ok(star.x <= vp.w - 30, `Star ${star.name} x=${star.x} must be <= ${vp.w - 30} on ${vp.w}x${vp.h}`);
        assert.ok(star.y >= 15, `Star ${star.name} y=${star.y} must be >= 15 on ${vp.w}x${vp.h}`);
        assert.ok(star.y <= vp.h - 50, `Star ${star.name} y=${star.y} must be <= ${vp.h - 50} on ${vp.w}x${vp.h}`);
      }
    }
  });

  test('Inspector card coordinates are positioned immediately below title with zero constellation collision', () => {
    const vp = {w: 1024, h: 736};
    const uiRects = [{left: 312, right: 712, top: 120, bottom: 480}];
    const result = astro.fitFigure(tau, vp.w, vp.h, uiRects, (text) => text.length * 8, 2);
    assert.ok(result.diagnostic.placed, 'Taurus placed with UI rects');

    const coreStars = result.layout.stars.slice(0, tau.stars.length);
    const titleLabel = result.layout.labels.find(l => l.star?.caption);
    assert.ok(titleLabel, 'Title caption label must exist');

    const cardW = 220;
    const cardH = 46;
    const margin = 12;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const makeBox = (l, t) => {
      const left = clamp(l, margin, Math.max(margin, vp.w - cardW - margin));
      const top = clamp(t, margin, Math.max(margin, vp.h - cardH - margin));
      return {left, right: left + cardW, top, bottom: top + cardH};
    };

    // Candidate immediately below title
    const targetX = (titleLabel.left + titleLabel.right) / 2;
    const cardBox = makeBox(targetX - cardW / 2, titleLabel.bottom + 8);

    // Verify card is immediately below title
    assert.equal(cardBox.top, titleLabel.bottom + 8, 'Card must be placed exactly 8px below title bottom');
    assert.ok(cardBox.bottom <= vp.h - margin, 'Card must not overflow bottom viewport edge');
    assert.ok(cardBox.left >= margin, 'Card must respect left viewport margin');
    assert.ok(cardBox.right <= vp.w - margin, 'Card must respect right viewport margin');

    // Verify card does not collide with any constellation star
    for (const star of coreStars) {
      const starBox = {left: star.x - 8, right: star.x + 8, top: star.y - 8, bottom: star.y + 8};
      const collides = !(cardBox.right < starBox.left || cardBox.left > starBox.right || cardBox.bottom < starBox.top || cardBox.top > starBox.bottom);
      assert.ok(!collides, `Card must not collide with star ${star.name} at (${star.x}, ${star.y})`);
    }

    // Verify card does not collide with any line segment
    for (const [a, b] of tau.lines) {
      const p = coreStars[a];
      const q = coreStars[b];
      assert.ok(!astro.segmentHitsBox(p, q, cardBox), `Card must not collide with line segment ${a}-${b}`);
    }

    // Verify card does not collide with title caption
    const titleCollides = !(cardBox.right < titleLabel.left || cardBox.left > titleLabel.right || cardBox.bottom < titleLabel.top || cardBox.top > titleLabel.bottom);
    assert.ok(!titleCollides, 'Card must not collide with title label');
  });

  test('CSS rules define compact 220px inspector card with readable typography', () => {
    const css = readFileSync('site/preview.css', 'utf8');
    assert.ok(css.includes('.auth-sky-con-inspector { width: 220px;'), 'CSS must define 220px width for constellation inspector');
    assert.ok(css.includes('padding: 7px 10px;'), 'CSS must define compact padding for constellation inspector');
  });
});
