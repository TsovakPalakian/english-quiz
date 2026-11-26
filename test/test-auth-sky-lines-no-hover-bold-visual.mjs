import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('TASK: Auth sky constellation lines retain standard width (0.8px) and no shadow glow on hover', async (t) => {
  // 1. Static AST/source invariant test
  await t.test('Source files do not contain bold hover line width or shadow glow in drawLines', () => {
    const clientCode = readFileSync('client/06-auth-sky.js', 'utf8');
    const previewCode = readFileSync('preview.js', 'utf8');

    assert.equal(
      clientCode.includes('lineWidth=isInspected?1.8:.8'),
      false,
      'client/06-auth-sky.js must not set lineWidth to 1.8 on inspection'
    );
    assert.equal(
      clientCode.includes('drawLines(current,lineAlpha*t,lineWidth,isInspected)'),
      false,
      'client/06-auth-sky.js must not pass isInspected=true to drawLines'
    );
    assert.equal(
      previewCode.includes('lineWidth=isInspected?1.8:.8'),
      false,
      'preview.js must reflect the updated line width'
    );
    assert.equal(
      previewCode.includes('drawLines(current,lineAlpha*t,lineWidth,isInspected)'),
      false,
      'preview.js must not pass isInspected=true to drawLines'
    );
  });

  // 2. Playwright Visual & Runtime stroke inspection test across Desktop and Mobile
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);

  try {
    for (const vp of [
      { width: 1200, height: 900, name: 'Desktop' },
      { width: 390, height: 844, name: 'Mobile' }
    ]) {
      await t.test(`${vp.name} (${vp.width}x${vp.height}): Line width remains 0.8px and shadowBlur remains 0 during title hover`, async () => {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });

        // Spy on CanvasRenderingContext2D methods to record stroke properties for lines
        await page.addInitScript(() => {
          window.__skyStrokeLog = [];
          const originalStroke = CanvasRenderingContext2D.prototype.stroke;
          CanvasRenderingContext2D.prototype.stroke = function (...args) {
            if (this.canvas && this.canvas.id === 'authSky') {
              window.__skyStrokeLog.push({
                lineWidth: this.lineWidth,
                shadowBlur: this.shadowBlur,
                shadowColor: this.shadowColor,
                strokeStyle: this.strokeStyle
              });
            }
            return originalStroke.apply(this, args);
          };
        });

        // Ensure page runs preview.js with Eridanus and immediate hold phase
        await page.route('**/preview.js*', async route => {
          const response = await route.fetch();
          let body = await response.text();
          body = body
            .replace(
              'let current=frozen?.constellation||next(),previous=null',
              `let current=frozen?.constellation||(()=>{const c=catalogue.find(c=>c.abbr==='Eri');recent=[...recent.filter(abbr=>abbr!==c.abbr),c.abbr];return c;})(),previous=null`
            )
            .replace("phase=frozen?'hold':'gather'", "phase='hold'")
            .replace('return result.layout;', 'window.eriLayout=result.layout;return result.layout;');
          await route.fulfill({ response, body });
        });

        await page.route('**/api/me', route => route.fulfill({ json: { user: null } }));
        await page.route('**/api/auth/**', route => route.fulfill({ json: { ok: true } }));

        await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#authSky', { state: 'attached' });
        await page.waitForFunction(
          () =>
            window.eriLayout &&
            document.getElementById('authSky')?.dataset?.skyPhase === 'hold' &&
            document.getElementById('authSky')?.dataset?.skyConstellation === 'Eri'
        );

        const titleEl = await page.waitForSelector('.auth-sky-title');
        assert.ok(titleEl, 'Constellation title element is rendered');

        // Clear pre-hover stroke log
        await page.evaluate(() => {
          window.__skyStrokeLog = [];
        });

        // Hover on constellation title to trigger inspection
        await titleEl.hover();
        await page.waitForTimeout(400);

        // Verify inspector state is active
        const inspectionActive = await page.evaluate(() => {
          const canvas = document.getElementById('authSky');
          const conInspector = document.querySelector('.auth-sky-con-inspector');
          return {
            skyFrozen: canvas?.dataset?.skyFrozen === 'true',
            inspectorVisible: conInspector && !conInspector.hidden && conInspector.classList.contains('active'),
            titleText: document.querySelector('.auth-sky-title')?.textContent?.trim()
          };
        });

        assert.equal(inspectionActive.skyFrozen, true, 'Sky is frozen while inspecting constellation');
        assert.equal(inspectionActive.inspectorVisible, true, 'Constellation inspector is active and visible');
        assert.equal(inspectionActive.titleText, 'Eridanus', 'Constellation title displays Eridanus');

        // Collect strokes while hovered/inspected
        const strokes = await page.evaluate(() => window.__skyStrokeLog || []);

        // Filter line strokes (strokeStyle contains rgb(229, 207, 152))
        const lineStrokes = strokes.filter(s =>
          typeof s.strokeStyle === 'string' && s.strokeStyle.includes('229, 207, 152')
        );

        assert.ok(lineStrokes.length > 0, 'Line strokes were recorded during constellation inspection');

        // Verify all line strokes have lineWidth 0.8 and shadowBlur 0
        for (const stroke of lineStrokes) {
          assert.ok(
            Math.abs(stroke.lineWidth - 0.8) < 1e-4,
            `Expected line stroke width to be 0.8px, but found ${stroke.lineWidth}px`
          );
          assert.equal(
            stroke.shadowBlur,
            0,
            `Expected shadowBlur to be 0, but found ${stroke.shadowBlur}`
          );
        }

        // Capture visual snapshot across themes
        for (const theme of ['sky', 'dark', 'sand']) {
          await page.evaluate(th => {
            document.documentElement.dataset.theme = th;
          }, theme);
          await page.waitForTimeout(100);
          const screenshotBuffer = await page.screenshot({ fullPage: false });
          assert.ok(screenshotBuffer.length > 5000, `Screenshot for theme ${theme} successfully captured`);
        }

        await page.close();
      });
    }
  } finally {
    await browser.close();
    await preview.close();
  }
});
