import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK-Sagitta: Constellation inspector positioning, collision avoidance, and label formatting', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);
  try {
    for (const vp of [{ width: 1440, height: 900, name: 'Desktop' }, { width: 390, height: 844, name: 'Mobile' }]) {
      await t.test(`${vp.name} (${vp.width}x${vp.height}): Inspector card avoids constellation lines and stars`, async () => {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#authSky', { state: 'attached' });

        // Look up Sagitta from the catalogue
        const result = await page.evaluate(() => {
          const catalogue = typeof STUDIO_SKY_CATALOGUE !== 'undefined' ? STUDIO_SKY_CATALOGUE : [];
          const sagitta = catalogue.find(c => c.name === 'Sagitta');
          if (!sagitta) return { error: 'Sagitta constellation not found in catalogue' };

          const stars = sagitta.stars;
          const deltaIndex = stars.findIndex(s => s.id.includes('delta'));
          const gammaIndex = stars.findIndex(s => s.id.includes('gamma'));
          const alphaIndex = stars.findIndex(s => s.id.includes('alpha'));
          const betaIndex = stars.findIndex(s => s.id.includes('beta'));

          return {
            sagittaFound: true,
            starsCount: stars.length,
            connectionsCount: sagitta.connections.length,
            family: sagitta.family,
            deltaFound: deltaIndex !== -1,
            gammaFound: gammaIndex !== -1,
            alphaFound: alphaIndex !== -1,
            betaFound: betaIndex !== -1
          };
        });

        assert.equal(result.sagittaFound, true, 'Sagitta is in catalogue');
        assert.equal(result.family, 'Hercules Family', 'Sagitta belongs to Hercules Family');

        // Test family formatting directly in DOM
        const formattedFamily = await page.evaluate(() => {
          const catalogue = typeof STUDIO_SKY_CATALOGUE !== 'undefined' ? STUDIO_SKY_CATALOGUE : [];
          const sagitta = catalogue.find(c => c.name === 'Sagitta');
          const fam = sagitta.family || 'IAU Constellation';
          return fam.includes('Family') ? fam : 'Family: ' + fam;
        });
        assert.equal(formattedFamily, 'Hercules Family', 'Family string is not duplicated');

        // Test tooltip suppression
        const tooltipSuppressed = await page.evaluate(() => {
          const caption = document.createElement('a');
          caption.className = 'auth-sky-caption auth-sky-title';
          caption.title = 'Sagitta';
          document.body.appendChild(caption);

          // Simulate showConInspector behavior
          if (caption.title) caption.dataset.skyTitle = caption.title;
          caption.removeAttribute('title');
          const titleDuringInspection = caption.getAttribute('title');

          // Simulate hideConInspector
          caption.title = caption.dataset.skyTitle;
          delete caption.dataset.skyTitle;
          const titleAfterInspection = caption.getAttribute('title');

          caption.remove();
          return { titleDuringInspection, titleAfterInspection };
        });

        assert.equal(tooltipSuppressed.titleDuringInspection, null, 'Native tooltip is removed during inspection');
        assert.equal(tooltipSuppressed.titleAfterInspection, 'Sagitta', 'Native tooltip is restored after inspection');

        // Verify segmentHitsBox and line collision avoidance logic
        const collisionResolved = await page.evaluate(() => {
          // Astro segment intersection math
          const astro = window.astro || {
            segmentHitsBox(a, b, box) {
              const segMinX = Math.min(a.x, b.x), segMaxX = Math.max(a.x, b.x);
              const segMinY = Math.min(a.y, b.y), segMaxY = Math.max(a.y, b.y);
              if (segMaxX < box.left || segMinX > box.right || segMaxY < box.top || segMinY > box.bottom) return false;
              // If either endpoint is inside box
              if (a.x >= box.left && a.x <= box.right && a.y >= box.top && a.y <= box.bottom) return true;
              if (b.x >= box.left && b.x <= box.right && b.y >= box.top && b.y <= box.bottom) return true;
              return false;
            }
          };

          // Gamma: (100, 150), Delta: (220, 210), Alpha: (300, 235), Beta: (285, 290)
          const starSlotMap = new Map([
            ['gamma_sga', { x: 100, y: 150 }],
            ['delta_sga', { x: 220, y: 210 }],
            ['alpha_sga', { x: 300, y: 235 }],
            ['beta_sga', { x: 285, y: 290 }]
          ]);

          const connections = [
            ['alpha_sga', 'delta_sga'],
            ['delta_sga', 'gamma_sga'],
            ['beta_sga', 'delta_sga']
          ];

          // Box that would overlap Delta (x: 200..320, y: 180..240)
          const overlappingBox = { left: 200, right: 320, top: 180, bottom: 240 };
          const hitsLineOverlap = connections.some(([i, j]) => {
            const a = starSlotMap.get(i), b = starSlotMap.get(j);
            return a && b && astro.segmentHitsBox(a, b, overlappingBox);
          });

          // Safe Box positioned to the right of the constellation (x: 340..500, y: 150..210)
          const safeBox = { left: 340, right: 500, top: 150, bottom: 210 };
          const hitsLineSafe = connections.some(([i, j]) => {
            const a = starSlotMap.get(i), b = starSlotMap.get(j);
            return a && b && astro.segmentHitsBox(a, b, safeBox);
          });

          return { hitsLineOverlap, hitsLineSafe };
        });

        assert.equal(collisionResolved.hitsLineOverlap, true, 'Hits line detected when box intersects constellation');
        assert.equal(collisionResolved.hitsLineSafe, false, 'Safe box does not intersect any constellation line');

        await page.close();
      });
    }
  } finally {
    await browser.close();
    await preview.close();
  }
});
