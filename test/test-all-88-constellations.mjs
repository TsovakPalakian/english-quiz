import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test, {describe} from 'node:test';
import {runInNewContext} from 'node:vm';
import {skyCatalogueFactory} from '../ops/build-preview.mjs';

const scope = {};
runInNewContext(
  skyCatalogueFactory() +
  readFileSync('client/06-auth-astronomy.js', 'utf8') +
  ';globalThis.astro=StudioSkyAstronomy;globalThis.sky=astro.catalogue(STUDIO_SKY_CATALOGUE);',
  scope
);
const {astro, sky} = scope;

const ruNames = {
  And:'Андромеда',Ant:'Насос',Aps:'Райская Птица',Aql:'Орёл',Aqr:'Водолей',
  Ara:'Жертвенник',Ari:'Овен',Aur:'Возничий',Boo:'Волопас',Cae:'Резец',
  Cam:'Жираф',Cap:'Козерог',Car:'Киль',Cas:'Кассиопея',Cen:'Центавр',
  Cep:'Цефей',Cet:'Кит',Cha:'Хамелеон',Cir:'Циркуль',CMa:'Большой Пёс',
  CMi:'Малый Пёс',Cnc:'Рак',Col:'Голубь',Com:'Волосы Вероники',CrA:'Южная Корона',
  CrB:'Северная Корона',Crt:'Чаша',Cru:'Южный Крест',Crv:'Ворон',CVn:'Гончие Псы',
  Cyg:'Лебедь',Del:'Дельфин',Dor:'Золотая Рыба',Dra:'Дракон',Equ:'Малый Конь',
  Eri:'Эридан',For:'Печь',Gem:'Близнецы',Gru:'Журавль',Her:'Геркулес',
  Hor:'Часы',Hya:'Гидра',Hyi:'Южная Гидра',Ind:'Индеец',Lac:'Ящерица',
  Leo:'Лев',Lep:'Заяц',Lib:'Весы',LMi:'Малый Лев',Lup:'Волк',
  Lyn:'Рысь',Lyr:'Лира',Men:'Столовая Гора',Mic:'Микроскоп',Mon:'Единорог',
  Mus:'Муха',Nor:'Наугольник',Oct:'Октант',Oph:'Змееносец',Ori:'Орион',
  Pav:'Павлин',Peg:'Пегас',Per:'Персей',Phe:'Феникс',Pic:'Живописец',
  PsA:'Южная Рыба',Psc:'Рыбы',Pup:'Корма',Pyx:'Компас',Ret:'Сетка',
  Scl:'Скульптор',Sco:'Скорпион',Sct:'Щит',Ser:'Змея',Sex:'Секстант',
  Sge:'Стрела',Sgr:'Стрелец',Tau:'Телец',Tel:'Телескоп',TrA:'Южный Треугольник',
  Tri:'Треугольник',Tuc:'Тукан',UMa:'Большая Медведица',UMi:'Малая Медведица',Vel:'Паруса',
  Vir:'Дева',Vol:'Летучая Рыба',Vul:'Лисичка'
};

const knownAnchors = {
  Aql: {id: 'alpha_aql', name: 'Altair', maxMag: 1.0},
  Aur: {id: 'capella', name: 'Capella', maxMag: 0.5},
  Boo: {id: 'arcturus', name: 'Arcturus', maxMag: 0.2},
  CMa: {id: 'sirius', name: 'Sirius', maxMag: -1.0},
  CMi: {id: 'procyon', name: 'Procyon', maxMag: 0.5},
  Car: {id: 'canopus', name: 'Canopus', maxMag: -0.5},
  Cen: {id: 'hadar', name: 'Hadar', maxMag: 1.0},
  Cyg: {id: 'deneb', name: 'Deneb', maxMag: 1.5},
  Eri: {id: 'achernar', name: 'Achernar', maxMag: 0.6},
  Gem: {id: 'pollux', name: 'Pollux', maxMag: 1.5},
  Leo: {id: 'regulus', name: 'Regulus', maxMag: 1.5},
  Lyr: {id: 'vega', name: 'Vega', maxMag: 0.1},
  Ori: {id: 'betelgeuse', name: 'Betelgeuse', maxMag: 1.0},
  PsA: {id: 'fomalhaut', name: 'Fomalhaut', maxMag: 1.3},
  Sco: {id: 'antares', name: 'Antares', maxMag: 1.2},
  Tau: {id: 'aldebaran', name: 'Aldebaran', maxMag: 1.0},
  UMi: {id: 'polaris', name: 'Polaris', maxMag: 2.1},
  Vir: {id: 'spica', name: 'Spica', maxMag: 1.1}
};

const catalogue = JSON.parse(readFileSync('data/constellations_catalogue.json', 'utf8'));
assert.equal(catalogue.length, 88, 'Catalogue must have exactly 88 constellations');

describe('All 88 IAU Constellations Individual Suite', () => {
  for (const c of catalogue) {
    const abbr = c.abbr;
    test(`Constellation ${abbr} - ${c.name} (${ruNames[abbr] || 'N/A'})`, () => {
      // 1. Identity & Naming
      assert.equal(abbr.length, 3, `${abbr}: abbr must be 3 characters`);
      assert.ok(c.name, `${abbr}: must have international name`);
      assert.ok(c.genitive, `${abbr}: must have Latin genitive`);
      assert.ok(ruNames[abbr], `${abbr}: must have registered Russian name`);

      // 2. Stars
      const stars = c.stars;
      assert.ok(stars.length >= 2, `${abbr}: must have at least 2 stars`);
      const starMap = new Map();
      for (const s of stars) {
        assert.ok(s.id, `${abbr}: star has empty id`);
        assert.equal(starMap.has(s.id), false, `${abbr}: duplicate star id ${s.id}`);
        starMap.set(s.id, s);
        const coords = s.coordinates;
        assert.ok(coords.rightAscensionDeg >= 0 && coords.rightAscensionDeg < 360, `${abbr}: invalid RA ${coords.rightAscensionDeg}`);
        assert.ok(coords.declinationDeg >= -90 && coords.declinationDeg <= 90, `${abbr}: invalid Dec ${coords.declinationDeg}`);
        const mag = s.photometry.apparentMagnitude;
        assert.ok(mag > -2 && mag < 15, `${abbr}: invalid magnitude ${mag}`);
      }

      // 3. Connections & Topology
      const conns = c.connections || [];
      assert.ok(conns.length >= 1, `${abbr}: must have at least 1 connection`);
      const seenEdges = new Set();
      const adj = new Map();

      for (const edge of conns) {
        assert.equal(edge.length, 2, `${abbr}: edge must have 2 vertices: ${edge}`);
        assert.notEqual(edge[0], edge[1], `${abbr}: self-loop on ${edge[0]}`);
        assert.ok(starMap.has(edge[0]), `${abbr}: unknown star ${edge[0]}`);
        assert.ok(starMap.has(edge[1]), `${abbr}: unknown star ${edge[1]}`);

        const key = [edge[0], edge[1]].sort().join('::');
        assert.equal(seenEdges.has(key), false, `${abbr}: duplicate edge ${edge}`);
        seenEdges.add(key);

        if (!adj.has(edge[0])) adj.set(edge[0], new Set());
        if (!adj.has(edge[1])) adj.set(edge[1], new Set());
        adj.get(edge[0]).add(edge[1]);
        adj.get(edge[1]).add(edge[0]);

        // Angular distance check (> 0)
        const c1 = starMap.get(edge[0]).coordinates;
        const c2 = starMap.get(edge[1]).coordinates;
        const dra = (c1.rightAscensionDeg - c2.rightAscensionDeg) * Math.PI / 180;
        const ddec = (c1.declinationDeg - c2.declinationDeg) * Math.PI / 180;
        assert.ok(Math.hypot(dra, ddec) > 0, `${abbr}: edge ${edge[0]}-${edge[1]} has 0 angular distance`);
      }

      // Component connectivity check
      const visited = new Set();
      let comps = 0;
      for (const node of adj.keys()) {
        if (!visited.has(node)) {
          comps++;
          const queue = [node];
          visited.add(node);
          while (queue.length > 0) {
            const curr = queue.shift();
            for (const nxt of adj.get(curr) || []) {
              if (!visited.has(nxt)) {
                visited.add(nxt);
                queue.push(nxt);
              }
            }
          }
        }
      }
      const expectedComps = abbr === 'Cru' ? 2 : 1;
      assert.equal(comps, expectedComps, `${abbr}: expected ${expectedComps} connected component(s), got ${comps}`);

      // 4. Anchor star validation
      if (knownAnchors[abbr]) {
        const anchor = knownAnchors[abbr];
        assert.ok(starMap.has(anchor.id), `${abbr}: must contain anchor star ${anchor.id}`);
        const s = starMap.get(anchor.id);
        assert.ok(s.photometry.apparentMagnitude <= anchor.maxMag, `${abbr}: anchor ${anchor.id} magnitude`);
      }

      // 5. Deep-Sky Objects
      for (const dso of (c.deepSkyObjects || [])) {
        assert.ok(dso.id, `${abbr}: DSO has empty id`);
        assert.ok(dso.name, `${abbr}: DSO has empty name`);
        assert.ok(dso.type, `${abbr}: DSO has empty type`);
        const cDso = dso.coordinates || (dso.components && dso.components[0]?.coordinates);
        assert.ok(cDso, `${abbr}: DSO has no coordinates`);
        assert.ok(cDso.rightAscensionDeg >= 0 && cDso.rightAscensionDeg < 360);
        assert.ok(cDso.declinationDeg >= -90 && cDso.declinationDeg <= 90);
      }

      // 6. Layout Fitting on Mobile (390x844) & Desktop (1440x1000)
      const skyCon = sky.find(sc => sc.abbr === abbr);
      assert.ok(skyCon, `${abbr}: must exist in runtime catalogue`);
      for (const [w, h] of [[390, 844], [1440, 1000]]) {
        const fit = astro.fitFigure(skyCon, w, h, [], (t, s) => t.length * s * 0.55, 2, () => 0.5);
        assert.ok(fit.layout, `${abbr}: layout fitting failed for ${w}x${h}`);
        assert.ok(fit.layout.stars.length >= skyCon.stars.length, `${abbr}: stars count mismatch in layout`);
      }
    });
  }
});
