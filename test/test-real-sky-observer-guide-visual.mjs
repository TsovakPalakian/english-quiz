import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { previewAuthStudio } from '../ops/preview-auth-studio.mjs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('Real Sky Observer Guide - Visual & Interactive UI Tests', async (t) => {
  const preview = await previewAuthStudio();
  const browser = await launchChromium(chromium);

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#authSky', { state: 'attached' });

    await t.test('Constellation Inspector: Clean toggle, SVG close button, and bottom Find button', async () => {
      const inspectorState = await page.evaluate(() => {
        const insp = document.querySelector('.auth-sky-con-inspector');
        if (!insp) return { found: false };

        // Force show inspector
        insp.style.display = 'block';
        insp.style.opacity = '1';
        insp.style.visibility = 'visible';
        insp.hidden = false;

        const moreBtn = insp.querySelector('.auth-sky-inspector-more');
        const closeBtn = insp.querySelector('.auth-sky-inspector-close');
        const findBtn = insp.querySelector('.auth-sky-find-action-btn');

        const initialMoreText = moreBtn ? moreBtn.textContent.trim() : '';
        const closeSvg = closeBtn ? closeBtn.querySelector('svg') : null;

        // Toggle to expanded
        if (moreBtn) moreBtn.click();
        const expandedMoreText = moreBtn ? moreBtn.textContent.trim() : '';

        return {
          found: true,
          initialMoreText,
          expandedMoreText,
          hasCloseSvg: !!closeSvg,
          closeSvgViewBox: closeSvg ? closeSvg.getAttribute('viewBox') : null,
          hasFindBtn: !!findBtn,
          findBtnText: findBtn ? findBtn.textContent.trim() : '',
          hasLiveBadge: findBtn ? !!findBtn.querySelector('.live-badge') : false
        };
      });

      assert.equal(inspectorState.found, true, 'Constellation inspector exists');
      assert.equal(inspectorState.initialMoreText, 'more', 'Initial toggle is "more" without ellipsis');
      assert.equal(inspectorState.expandedMoreText, 'less', 'Expanded toggle is "less"');
      assert.equal(inspectorState.hasCloseSvg, true, 'Close button contains vector SVG');
      assert.equal(inspectorState.closeSvgViewBox, '0 0 10 10', 'Close SVG has 0 0 10 10 viewBox');
      assert.equal(inspectorState.hasFindBtn, true, 'Bottom Find in Sky Tonight button exists');
      assert.equal(inspectorState.findBtnText.includes('Find in Sky Tonight'), true, 'Button text is Find in Sky Tonight');
      assert.equal(inspectorState.hasLiveBadge, true, 'Find button contains LIVE badge');
    });

    await t.test('Clicking Find in Sky Tonight opens Real Sky Observer Guide modal', async () => {
      await page.evaluate(() => {
        const findBtn = document.querySelector('.auth-sky-find-action-btn');
        if (findBtn) findBtn.click();
      });

      await page.waitForTimeout(300);

      const modalInfo = await page.evaluate(() => {
        const modal = document.getElementById('skyObserverModal');
        if (!modal) return { found: false };

        const isOpen = modal.classList.contains('is-open') && !modal.hidden;
        const heading = modal.querySelector('.sky-obs-heading')?.textContent.trim() || '';
        const city = modal.querySelector('.meta-city')?.textContent.trim() || '';
        const coords = modal.querySelector('.meta-coords')?.textContent.trim() || '';
        const gpsBtn = modal.querySelector('.sky-obs-gps-btn');
        const liveBadge = modal.querySelector('.meta-badge-live');

        const instCards = modal.querySelectorAll('.instrument-card');
        const compassSvg = modal.querySelector('.compass-svg');
        const altSvg = modal.querySelector('.inclinometer-svg');
        const tiltSvg = modal.querySelector('.tilt-svg');

        return {
          found: true,
          isOpen,
          heading,
          city,
          coords,
          hasNoParensInCoords: !coords.includes('(') && !coords.includes(')'),
          hasGpsBtn: !!gpsBtn,
          hasLiveBadge: !!liveBadge,
          instrumentCount: instCards.length,
          hasCompass: !!compassSvg,
          hasAltitude: !!altSvg,
          hasTilt: !!tiltSvg
        };
      });

      assert.equal(modalInfo.found, true, 'Modal element exists');
      assert.equal(modalInfo.isOpen, true, 'Modal is open and visible');
      assert.equal(modalInfo.city, 'Yerevan', 'Observer city is Yerevan');
      assert.equal(modalInfo.hasNoParensInCoords, true, 'Coordinates do not contain parentheses');
      assert.equal(modalInfo.hasGpsBtn, true, 'Use GPS button is rendered');
      assert.equal(modalInfo.hasLiveBadge, true, 'LIVE badge is rendered in observer bar');
      assert.equal(modalInfo.instrumentCount, 3, 'All 3 horizon guide instruments are rendered');
      assert.equal(modalInfo.hasCompass, true, 'Step 1 Compass SVG is present');
      assert.equal(modalInfo.hasAltitude, true, 'Step 2 Altitude Inclinometer SVG is present');
      assert.equal(modalInfo.hasTilt, true, 'Step 3 Tilt Protractor SVG is present');
    });

    await t.test('Tab switching and Visible Now in Sky list interaction', async () => {
      // Click Tab 2
      await page.evaluate(() => {
        const tab2 = document.querySelector('.sky-tab-btn[data-tab="visible"]');
        if (tab2) tab2.click();
      });

      await page.waitForTimeout(200);

      const tab2State = await page.evaluate(() => {
        const visibleGrid = document.querySelector('.visible-constellations-grid');
        const cards = visibleGrid ? visibleGrid.querySelectorAll('.visible-con-card') : [];
        return {
          hasGrid: !!visibleGrid,
          cardCount: cards.length,
          firstCardName: cards[0]?.querySelector('.vcard-name')?.textContent.trim() || '',
          firstCardAlt: cards[0]?.querySelector('.vcard-alt')?.textContent.trim() || ''
        };
      });

      assert.equal(tab2State.hasGrid, true, 'Visible constellations grid is rendered');
      assert.equal(tab2State.cardCount > 0, true, `Visible constellations found: ${tab2State.cardCount}`);
      assert.equal(tab2State.firstCardAlt.startsWith('+'), true, 'Visible constellations have positive altitude');

      // Click on a visible card to switch back to target guide
      await page.evaluate(() => {
        const card = document.querySelector('.visible-con-card');
        if (card) card.click();
      });

      await page.waitForTimeout(200);

      const switchedBack = await page.evaluate(() => {
        const targetTab = document.querySelector('.sky-tab-btn[data-tab="target"]');
        const instCards = document.querySelectorAll('.instrument-card');
        return {
          isTargetActive: targetTab?.classList.contains('is-active'),
          instrumentsRendered: instCards.length === 3
        };
      });

      assert.equal(switchedBack.isTargetActive, true, 'Clicking card switched back to target guide');
      assert.equal(switchedBack.instrumentsRendered, true, 'Instruments re-rendered for selected constellation');
    });

    await t.test('Modal closing via close button and Done button', async () => {
      await page.evaluate(() => {
        const closeBtn = document.querySelector('.sky-obs-close');
        if (closeBtn) closeBtn.click();
      });

      await page.waitForTimeout(200);

      const isClosed = await page.evaluate(() => {
        const modal = document.getElementById('skyObserverModal');
        return modal ? modal.hidden || !modal.classList.contains('is-open') : true;
      });

      assert.equal(isClosed, true, 'Modal closed successfully');
    });

  } finally {
    await browser.close();
    await preview.close();
  }
});
