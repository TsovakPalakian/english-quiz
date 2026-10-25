import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skyCatalogueFactory} from '../ops/build-preview.mjs';

const catCode = skyCatalogueFactory();
const catalogueJson = JSON.parse(catCode.replace(/^const STUDIO_SKY_CATALOGUE=/, '').replace(/;\n$/, ''));
const astroFn = new Function(readFileSync('client/06-auth-astronomy.js', 'utf8') + '; return StudioSkyAstronomy;');
const astro = astroFn();
const catalogue = astro.catalogue(catalogueJson);

// 1. Verify Capricornus (Cap)
const cap = catalogue.find(c => c.abbr === 'Cap');
assert.ok(cap, 'Capricornus exists in catalogue');

const capPrimary = astro.brightest(cap.stars, 'Cap');
assert.equal(capPrimary.id, 'deneb_algedi', 'Deneb Algedi is the brightest star of Capricornus');
assert.equal(capPrimary.bayer, 'δ', 'Deneb Algedi has Greek letter delta');

const capAlpha = astro.alphaStar(cap.stars, 'Cap');
assert.equal(capAlpha.id, 'algedi', 'Algedi is the alpha star of Capricornus');
assert.equal(capAlpha.bayer, 'α', 'Algedi has Greek letter alpha');

// 2. Test layout for Capricornus on standard desktop viewport
const capFit = astro.fitFigure(cap, 1440, 1000, [], (text, size) => text.length * (size || 12) * 0.55);
assert.ok(capFit.layout, 'Capricornus placed successfully');
assert.equal(capFit.diagnostic.placed, true);

// Verify labels
const capLabels = capFit.layout.labels;
const denebLabel = capLabels.find(l => l.star.id === 'deneb_algedi');
const algediLabel = capLabels.find(l => l.star.id === 'algedi');
const titleLabel = capLabels.find(l => l.star.caption);

assert.ok(denebLabel, 'Deneb Algedi label is present');
assert.equal(denebLabel.star.label, 'δ Deneb Algedi', 'Brightest star label is prefixed with Greek letter δ');
assert.equal(denebLabel.star.primary, true);

assert.ok(algediLabel, 'Algedi label is present');
assert.equal(algediLabel.star.label, 'α Algedi', 'Alpha star label is prefixed with Greek letter α');
assert.equal(algediLabel.star.alpha, true);

assert.ok(titleLabel, 'Capricornus title label is present');
assert.equal(titleLabel.star.label, 'Capricornus');

// Verify Algedi marker radius is not collapsed by optical companion
const algediStar = capFit.layout.stars.find(s => s.id === 'algedi');
const algediStyle = astro.appearance(algediStar.mag, algediStar.bv);
const algediDrawR = Math.min(algediStyle.radius, algediStar.spacing * 0.28);
assert.ok(algediStar.spacing >= 40, 'Algedi spacing is not collapsed by companion (spacing: ' + algediStar.spacing + ')');
assert.equal(algediDrawR, algediStyle.radius, 'Algedi draws with full appearance radius (~1.8px), not subpixel');

// 3. Verify other key constellations where brightest != alpha
const cases = [
  {abbr: 'Ori', brightest: 'β Rigel', alpha: 'α Betelgeuse'},
  {abbr: 'Gem', brightest: 'β Pollux', alpha: 'α Castor'},
  {abbr: 'UMa', brightest: 'ε Alioth', alpha: 'α Dubhe'},
  {abbr: 'Dra', brightest: 'γ Eltanin', alpha: 'α Thuban'},
  {abbr: 'Cas', brightest: 'γ Cih', alpha: 'α Schedar'},
  {abbr: 'Lyr', brightest: 'α Vega', alpha: null}, // alpha is brightest
  {abbr: 'LMi', brightest: 'Praecipua', alpha: null} // no alpha star
];

for (const tc of cases) {
  const c = catalogue.find(x => x.abbr === tc.abbr);
  assert.ok(c, tc.abbr + ' found');
  const fit = astro.fitFigure(c, 1440, 1000, [], (text, size) => text.length * (size || 12) * 0.55);
  assert.ok(fit.layout, tc.abbr + ' placed');
  const primary = fit.layout.labels.find(l => l.star.primary);
  assert.ok(primary, tc.abbr + ' primary label found');
  assert.equal(primary.star.label, tc.brightest, tc.abbr + ' brightest label matches expected');

  if (tc.alpha) {
    const alpha = fit.layout.labels.find(l => l.star.alpha);
    assert.ok(alpha, tc.abbr + ' alpha label found');
    assert.equal(alpha.star.label, tc.alpha, tc.abbr + ' alpha label matches expected');
  }
}

// 4. Verify all 88 constellations fit on mobile (390x844) without overlap
for (const c of catalogue) {
  const res = astro.fitFigure(c, 390, 844, [], (text, size) => text.length * (size || 12) * 0.55);
  assert.ok(res.layout, c.abbr + ' fits mobile viewport without collision');
  assert.equal(res.diagnostic.placed, true);
  // Ensure no label overlaps another label
  const labels = res.layout.labels;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      assert.equal(astro.intersects(labels[i], labels[j]), false, 'No labels overlap in ' + c.abbr);
    }
  }
}

console.log('Greek star labels and Algedi visibility: Cap (δ Deneb Algedi, α Algedi), Ori, Gem, UMa, Lyr, LMi and all 88 constellations passed.');
