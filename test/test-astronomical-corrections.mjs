import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const catalogue = JSON.parse(readFileSync('data/constellations_catalogue.json', 'utf8'));
const conByAbbr = new Map(catalogue.map(c => [c.abbr, c]));

// 1. Canes Venatici (CVn)
{
  const cvn = conByAbbr.get('CVn');
  assert.ok(cvn, 'CVn missing in catalogue');
  const corCaroli = cvn.stars.find(s => s.id === 'cor_caroli');
  const alpha1 = cvn.stars.find(s => s.id === 'hip_63121');
  assert.ok(corCaroli, 'CVn must have Cor Caroli (alpha^2 CVn, HIP 63125)');
  assert.equal(corCaroli.catalogue?.hip, 63125, 'Cor Caroli must have HIP 63125');
  assert.ok(corCaroli.photometry?.apparentMagnitude < 3.0, 'Cor Caroli must be bright (V ~ 2.89)');

  const hasCorCaroliInConns = cvn.connections.some(e => e.includes('cor_caroli') && e.includes('beta_cvn'));
  assert.ok(hasCorCaroliInConns, 'CVn connections must link Cor Caroli (alpha^2) to Beta CVn');

  if (alpha1) {
    const hasAlpha1InConns = cvn.connections.some(e => e.includes('hip_63121'));
    assert.equal(hasAlpha1InConns, false, 'CVn connections must NOT link faint companion alpha^1 (HIP 63121)');
  }
}

// 2. Cancer (Cnc)
{
  const cnc = conByAbbr.get('Cnc');
  assert.ok(cnc, 'Cnc missing in catalogue');
  const iotaA = cnc.stars.find(s => s.id === 'iota_cnc');
  const iotaB = cnc.stars.find(s => s.id === 'hip_43100');
  assert.ok(iotaA, 'Cnc must have Iota Cnc A (HIP 43103)');
  assert.equal(iotaA.catalogue?.hip, 43103, 'Iota Cnc must be HIP 43103');
  assert.ok(iotaA.photometry?.apparentMagnitude < 4.5, 'Iota Cnc A must be ~4.03 mag');

  const hasIotaAInConns = cnc.connections.some(e => e.includes('iota_cnc') && e.includes('gamma_cnc'));
  assert.ok(hasIotaAInConns, 'Cnc connections must link Iota Cnc A (HIP 43103) to Gamma Cnc');

  if (iotaB) {
    const hasIotaBInConns = cnc.connections.some(e => e.includes('hip_43100'));
    assert.equal(hasIotaBInConns, false, 'Cnc connections must NOT link faint white dwarf companion HIP 43100');
  }
}

// 3. Delphinus (Del)
{
  const del = conByAbbr.get('Del');
  assert.ok(del, 'Del missing in catalogue');
  const gamma2 = del.stars.find(s => s.id === 'gamma_del');
  const gamma1 = del.stars.find(s => s.id === 'hip_102531');
  assert.ok(gamma2, 'Del must have Gamma-2 Del (HIP 102532)');
  assert.equal(gamma2.catalogue?.hip, 102532, 'Gamma Del must be HIP 102532');

  const linksAlphaDel = del.connections.some(e => e.includes('gamma_del') && e.includes('alpha_del'));
  const linksDeltaDel = del.connections.some(e => e.includes('gamma_del') && e.includes('delta_del'));
  assert.ok(linksAlphaDel && linksDeltaDel, "Gamma-2 Del must be connected in Job's Coffin diamond");

  if (gamma1) {
    const hasGamma1InConns = del.connections.some(e => e.includes('hip_102531'));
    assert.equal(hasGamma1InConns, false, 'Del connections must NOT link faint companion gamma^1 (HIP 102531)');
  }
}

// 4. Boötes (Boo)
{
  const boo = conByAbbr.get('Boo');
  assert.ok(boo, 'Boo missing in catalogue');
  const kappa2 = boo.stars.find(s => s.id === 'hip_69483');
  const kappa1 = boo.stars.find(s => s.id === 'hip_69481');
  assert.ok(kappa2, 'Boo must have Kappa-2 Boo (HIP 69483)');
  assert.equal(kappa2.catalogue?.hip, 69483, 'Kappa-2 Boo must have HIP 69483');

  const linksCrown = boo.connections.some(e => e.includes('hip_69483') && e.includes('hip_69732')) &&
                     boo.connections.some(e => e.includes('hip_69483') && e.includes('hip_70497'));
  assert.ok(linksCrown, 'Kappa-2 Boo (HIP 69483) must connect crown stars');

  if (kappa1) {
    const hasKappa1InConns = boo.connections.some(e => e.includes('hip_69481'));
    assert.equal(hasKappa1InConns, false, 'Boo connections must NOT link faint companion kappa^1 (HIP 69481)');
  }
}

// 5. Chamaeleon (Cha)
{
  const cha = conByAbbr.get('Cha');
  assert.ok(cha, 'Cha missing in catalogue');
  const delta2 = cha.stars.find(s => s.id === 'hip_52633');
  const delta1 = cha.stars.find(s => s.id === 'hip_52595');
  assert.ok(delta2, 'Cha must have Delta-2 Cha (HIP 52633)');

  const linksBody = cha.connections.some(e => e.includes('hip_52633') && e.includes('gamma_cha')) &&
                    cha.connections.some(e => e.includes('hip_52633') && e.includes('beta_cha'));
  assert.ok(linksBody, 'Delta-2 Cha (HIP 52633) must connect body of Chamaeleon');

  if (delta1) {
    const hasDelta1InConns = cha.connections.some(e => e.includes('hip_52595'));
    assert.equal(hasDelta1InConns, false, 'Cha connections must NOT link faint companion delta^1 (HIP 52595)');
  }
}

// 6. Centaurus (Cen)
{
  const cen = conByAbbr.get('Cen');
  assert.ok(cen, 'Cen missing in catalogue');
  const hadar = cen.stars.find(s => s.id === 'hadar');
  const alphaCen = cen.stars.find(s => s.id === 'alpha_cen');
  const toliman = cen.stars.find(s => s.id === 'hip_71681');
  assert.ok(hadar && alphaCen && toliman, 'Cen must have Hadar, Alpha-1 Cen and Toliman');

  const linksHadarToAlpha = cen.connections.some(e => e.includes('hadar') && e.includes('alpha_cen'));
  const linksAlphaToToliman = cen.connections.some(e => e.includes('alpha_cen') && e.includes('hip_71681'));
  assert.ok(linksHadarToAlpha, 'Hadar must connect to Rigil Kentaurus (alpha_cen)');
  assert.ok(linksAlphaToToliman, 'Rigil Kentaurus must connect to Toliman (hip_71681)');
}

// 7. Grus (Gru)
{
  const gru = conByAbbr.get('Gru');
  assert.ok(gru, 'Gru missing in catalogue');
  const delta1 = gru.stars.find(s => s.id === 'delta_gru');
  const delta2 = gru.stars.find(s => s.id === 'hip_111043');
  assert.ok(delta1 && delta2, 'Gru must have both Delta-1 and Delta-2');

  const linksNeckToBody = gru.connections.some(e => e.includes('delta_gru') && e.includes('hip_111043'));
  assert.ok(linksNeckToBody, 'Gru must have connection delta_gru — hip_111043 uniting neck and body');

  // Verify single connected component
  const adj = new Map();
  for (const [u, v] of gru.connections) {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u).add(v);
    adj.get(v).add(u);
  }
  const visited = new Set();
  const queue = [gru.connections[0][0]];
  visited.add(queue[0]);
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const nxt of adj.get(curr) || []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  assert.equal(visited.size, adj.size, 'Grus figure must be a single connected component');
}

// 8. Lacerta (Lac)
{
  const lac = conByAbbr.get('Lac');
  assert.ok(lac, 'Lac missing in catalogue');
  const expectedZigzag = [
    ['hip_109937', 'alpha_lac'],
    ['alpha_lac', 'hip_110609'],
    ['hip_110609', 'beta_lac'],
    ['beta_lac', 'hip_110351'],
    ['hip_110351', 'five_lac']
  ];
  assert.equal(lac.connections.length, 5, 'Lacerta must have exactly 5 connections in canonical zigzag');
  for (const edge of expectedZigzag) {
    const found = lac.connections.some(e => (e[0] === edge[0] && e[1] === edge[1]) || (e[0] === edge[1] && e[1] === edge[0]));
    assert.ok(found, `Lacerta must contain canonical zigzag edge ${edge.join(' — ')}`);
  }
}

// 9. Ophiuchus (Oph) metadata
{
  const oph = conByAbbr.get('Oph');
  assert.ok(oph, 'Oph missing in catalogue');
  assert.equal(oph.areaSqDeg, 948, 'Ophiuchus areaSqDeg must be 948');
  assert.equal(oph.hemisphere, 'Equatorial', 'Ophiuchus hemisphere must be Equatorial');
}

console.log('All 9 astronomical discrepancy regression assertions passed successfully.');
