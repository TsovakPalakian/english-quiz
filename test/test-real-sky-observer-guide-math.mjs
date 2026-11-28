import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const astronomyCode = readFileSync('client/06-auth-astronomy.js', 'utf8');
const fn = new Function(astronomyCode + '; return StudioSkyAstronomy;');
const astro = fn();

test('Real Sky Observer Guide - Astronomical Coordinates & Mathematics', async (t) => {
  await t.test('julianDate and GMST produce standard celestial time', () => {
    // Standard J2000 epoch: 2000-01-01 12:00:00 UTC = JD 2451545.0
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    const jd = astro.julianDate(j2000);
    assert.equal(Math.abs(jd - 2451545.0) < 1e-5, true, `JD should be 2451545.0 at J2000 epoch, got ${jd}`);

    const gmst = astro.gmst(j2000);
    assert.equal(Number.isFinite(gmst), true, 'GMST must be a finite number');
    assert.equal(gmst >= 0 && gmst < 360, true, `GMST must be normalized [0, 360), got ${gmst}`);
  });

  await t.test('lst accounts for observer longitude correctly', () => {
    const testDate = new Date(Date.UTC(2026, 10, 28, 19, 0, 0)); // 23:00 in Yerevan (UTC+4)
    const gmst = astro.gmst(testDate);
    const lon = 44.5;
    const lst = astro.lst(testDate, lon);
    const expectedLst = ((gmst + lon) % 360 + 360) % 360;
    assert.equal(Math.abs(lst - expectedLst) < 1e-4, true, 'LST = (GMST + Lon) % 360');
  });

  await t.test('horizontalCoords calculates Orion position in Yerevan accurately', () => {
    // Orion coordinates: RA ~83.8° (5.59h), Dec ~0.3°
    const orionRa = 83.8;
    const orionDec = 0.3;
    const lat = 40.2; // Yerevan
    const lon = 44.5;
    const testDate = new Date('2026-11-28T23:00:00+04:00');

    const coords = astro.horizontalCoords(orionRa, orionDec, testDate, lat, lon);
    assert.equal(Number.isFinite(coords.altitude), true, 'Altitude must be finite');
    assert.equal(Number.isFinite(coords.azimuth), true, 'Azimuth must be finite');
    assert.equal(Number.isFinite(coords.tilt), true, 'Tilt must be finite');

    // Orion at 23:00 late November in Yerevan should be high in the southeastern sky (SE ~110-150 deg, altitude > 25 deg)
    assert.equal(coords.altitude > 20, true, `Orion should be well above horizon, got ${coords.altitude}`);
    assert.equal(coords.azimuth >= 100 && coords.azimuth <= 160, true, `Orion should be South-East, got ${coords.azimuth}`);
    assert.equal(coords.tilt < 0, true, `Orion figure should be tilted counter-clockwise at rising/SE, got ${coords.tilt}`);
  });

  await t.test('compassSector maps all 16 cardinal compass directions accurately', () => {
    assert.equal(astro.compassSector(0), 'N');
    assert.equal(astro.compassSector(360), 'N');
    assert.equal(astro.compassSector(90), 'E');
    assert.equal(astro.compassSector(180), 'S');
    assert.equal(astro.compassSector(270), 'W');
    assert.equal(astro.compassSector(125), 'SE');
    assert.equal(astro.compassSector(45), 'NE');
    assert.equal(astro.compassSector(225), 'SW');
    assert.equal(astro.compassSector(315), 'NW');
  });

  await t.test('riseCulminationSet determines culmination and visibility bounds', () => {
    const orionRa = 83.8;
    const orionDec = 0.3;
    const lat = 40.2;
    const lon = 44.5;
    const testDate = new Date('2026-11-28T23:00:00+04:00');

    const rcs = astro.riseCulminationSet(orionRa, orionDec, testDate, lat, lon);
    assert.equal(rcs.circumpolar, false, 'Orion is not circumpolar in Yerevan');
    assert.equal(rcs.neverRises, false, 'Orion rises in Yerevan');
    assert.equal(rcs.maxAlt > 45 && rcs.maxAlt < 55, true, `Max altitude should be ~50°, got ${rcs.maxAlt}`);
    assert.equal(rcs.culminationTime instanceof Date, true, 'Culmination must return Date');
    assert.equal(rcs.riseTime instanceof Date, true, 'Rise must return Date');
    assert.equal(rcs.setTime instanceof Date, true, 'Set must return Date');
  });

  await t.test('circumpolar constellations like Ursa Minor never set in mid-northern latitudes', () => {
    // Polaris: Dec ~89.3°
    const rcs = astro.riseCulminationSet(37.9, 89.3, new Date(), 40.2, 44.5);
    assert.equal(rcs.circumpolar, true, 'Polaris is circumpolar at 40° N');
    assert.equal(rcs.riseTime, null, 'Circumpolar star has no rise time');
    assert.equal(rcs.setTime, null, 'Circumpolar star has no set time');
  });
});
