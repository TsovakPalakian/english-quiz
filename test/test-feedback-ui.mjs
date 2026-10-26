import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const preview = await previewAuthStudio();
let browser;

try {
  browser = await chromium.launch({headless: true, executablePath: chromiumExecutable()});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(preview.url);
  await page.waitForTimeout(500);

  // 1. Verify floating feedback button is present
  const floatingBtn = page.locator('#feedbackFloatingTrigger');
  await floatingBtn.waitFor({state: 'visible'});
  assert.equal(await floatingBtn.isVisible(), true, 'Floating feedback button must be visible');

  // 2. Open feedback modal by clicking floating trigger
  await floatingBtn.click();
  const modal = page.locator('#feedbackModal');
  await modal.waitFor({state: 'visible'});
  assert.equal(await modal.isVisible(), true, 'Feedback modal must open');

  // Verify breadcrumbs recording
  const breadcrumbs = await page.evaluate(() => window.__userBreadcrumbs || []);
  assert.ok(breadcrumbs.length > 0, 'User click should be recorded in breadcrumbs');
  assert.ok(breadcrumbs.some(b => b.details.includes('feedbackFloatingTrigger') || b.details.includes('Отзыв')), 'Breadcrumbs must capture feedback button click');

  // 3. Switch categories
  const ideaBtn = modal.locator('[data-type="idea"]');
  await ideaBtn.click();
  assert.equal(await ideaBtn.evaluate(el => el.classList.contains('active')), true, 'Idea category active');

  const bugBtn = modal.locator('[data-type="bug"]');
  await bugBtn.click();
  assert.equal(await bugBtn.evaluate(el => el.classList.contains('active')), true, 'Bug category active');

  // 4. Test pasting image via clipboard event
  await page.evaluate(() => {
    // 1x1 transparent PNG data URL to blob
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'screenshot.png', {type: 'image/png'});
    
    const dt = new DataTransfer();
    dt.items.add(file);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(pasteEvent);
  });

  // Wait for canvas compression and preview image rendering
  const previewBox = modal.locator('#feedbackPreviewBox');
  await previewBox.waitFor({state: 'visible', timeout: 5000});
  const previewImg = modal.locator('#feedbackPreviewImg');
  const src = await previewImg.getAttribute('src');
  assert.ok(src && src.startsWith('data:image/'), 'Preview image must have data URL src');

  // 5. Test validation on empty message
  const submitBtn = modal.locator('#feedbackSubmitBtn');
  await submitBtn.click();
  const statusEl = modal.locator('#feedbackStatus');
  const errorText = await statusEl.textContent();
  assert.ok(errorText.includes('Пожалуйста, опишите проблему'), 'Validation error shown on empty message');

  // 6. Fill message and submit successfully (spy on haptics)
  await page.evaluate(() => {
    window.__vibrateCalled = false;
    navigator.vibrate = () => { window.__vibrateCalled = true; return true; };
  });

  const textarea = modal.locator('#feedbackMessage');
  await textarea.fill('Interactive test: layout is slightly shifted on tablet viewport');

  const contact = modal.locator('#feedbackContact');
  await contact.fill('tester@lumiscia.org');

  await submitBtn.click();
  await page.waitForFunction(() => {
    const el = document.getElementById('feedbackStatus');
    return el && el.textContent.includes('Спасибо');
  }, {timeout: 5000});

  const hapticTriggered = await page.evaluate(() => window.__vibrateCalled);
  assert.equal(hapticTriggered, true, 'Haptic feedback must be triggered on success');

  // Wait for auto-close
  await modal.waitFor({state: 'hidden', timeout: 3000});
  assert.equal(await modal.isVisible(), false, 'Modal closes automatically after success');

  // 7. Test developer feedback filter toolbar and instant search
  await page.evaluate(() => {
    // Activate bugs section
    document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
    const bugsSec = document.getElementById('bugs');
    if (bugsSec) bugsSec.classList.add('on');

    // Simulate developer environment with mock items
    window.isDeveloper = () => true;
    window.accountFetch = async (url) => {
      if (url.startsWith('/api/feedback')) {
        if (url.includes('resolved=1')) {
          return {
            feedback: [
              {id: 'fb_res_1', category: 'bug', message: 'Resolved mobile glitch', userLogin: 'dan', url: '/days', createdAt: 1699990000, resolved: true, resolvedAt: 1700004000}
            ],
            total: 1,
            counts: {open: 3, resolved: 1, total: 4}
          };
        }
        if (url.includes('offset=3')) {
          return {
            feedback: [
              {id: 'fb_4', category: 'idea', message: 'Extra pagination item', userLogin: 'carol', url: '/extra', createdAt: 1700003000, resolved: false}
            ],
            total: 4,
            counts: {open: 4, resolved: 1, total: 5}
          };
        }
        return {
          feedback: [
            {id: 'fb_1', category: 'bug', message: 'Button overlap error', userLogin: 'tester1', url: '/days', createdAt: 1700000000, resolved: false},
            {id: 'fb_2', category: 'idea', message: 'Add dark sky theme', userLogin: 'alice', url: '/home', createdAt: 1700001000, resolved: false},
            {id: 'fb_3', category: 'question', message: 'How to practice speaking?', userEmail: 'bob@test.org', url: '/practice', createdAt: 1700002000, resolved: false}
          ],
          total: 4,
          counts: {open: 3, resolved: 1, total: 4}
        };
      }
      return {};
    };

    const tabBtn = document.querySelector('button[data-bug-tab="feedback"]');
    if (tabBtn) tabBtn.click();
  });

  // Wait for filter toolbar to render
  const filterToolbar = page.locator('.feedback-filter-toolbar');
  await filterToolbar.waitFor({state: 'visible', timeout: 3000});

  // Verify filter chips exist
  const allChip = page.locator('[data-fb-filter="all"]');
  const bugChip = page.locator('[data-fb-filter="bug"]');
  const ideaChip = page.locator('[data-fb-filter="idea"]');
  assert.ok(await allChip.isVisible(), 'All filter chip visible');
  assert.ok(await bugChip.isVisible(), 'Bug filter chip visible');
  assert.ok(await ideaChip.isVisible(), 'Idea filter chip visible');

  // Filter by bug: only 1 card shown
  await bugChip.click();
  let cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 1, 'Only 1 bug card should be displayed after filtering by bug');

  // Switch back to all: 3 cards shown
  await allChip.click();
  cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 3, 'All 3 cards should be displayed');

  // Verify tab badge
  const tabBadge = page.locator('.feedback-tab-badge');
  assert.ok(await tabBadge.isVisible(), 'Feedback tab badge must be visible');
  assert.equal(await tabBadge.textContent(), '3', 'Tab badge displays open tickets count');

  // Verify Load more button
  const loadMoreBtn = page.locator('#feedbackLoadMoreBtn');
  assert.ok(await loadMoreBtn.isVisible(), 'Load more button should appear when total > loaded');
  await loadMoreBtn.click();
  await page.waitForTimeout(100);
  cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 4, '4 cards displayed after clicking Load more');
  assert.equal(await loadMoreBtn.isVisible(), false, 'Load more button disappears once all items are loaded');

  // Test instant search
  const searchInput = page.locator('#feedbackSearchInput');
  await searchInput.fill('dark sky');
  cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 1, 'Only 1 card should match "dark sky"');

  await searchInput.fill('nonexistent query');
  cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 0, 'Zero cards for nonexistent query');
  const noMatchText = await page.locator('#feedbackCardsList').textContent();
  assert.ok(noMatchText.includes('match current filter'), 'Empty state shown for unmatched search');

  // Clear search
  await searchInput.fill('');

  // 8. Test Export CSV
  const exportBtn = page.locator('#feedbackExportCsv');
  assert.ok(await exportBtn.isVisible(), 'Export CSV button must be visible');
  await exportBtn.click(); // Should execute smoothly without throwing

  // 9. Test Resolved archive toggle
  const resolvedTab = page.locator('[data-fb-status="resolved"]');
  await resolvedTab.click();
  await page.waitForTimeout(100);

  const resolvedCards = await page.locator('#feedbackCardsList article').count();
  assert.equal(resolvedCards, 1, 'Resolved archive should show 1 resolved card');
  const reopenBtn = page.locator('[data-feedback-unresolve]');
  assert.ok(await reopenBtn.isVisible(), 'Reopen button should be present on resolved card');
  const resolvedBadge = await page.locator('#feedbackCardsList article').textContent();
  assert.ok(resolvedBadge.includes('Resolved'), 'Resolved badge displayed');

  // Switch back to active
  const activeTab = page.locator('[data-fb-status="active"]');
  await activeTab.click();
  await page.waitForTimeout(100);
  cards = await page.locator('#feedbackCardsList article').count();
  assert.equal(cards, 3, 'Active tab should show 3 active cards');

  assert.equal(consoleErrors.length, 0, 'Zero console errors during feedback interaction: ' + consoleErrors.join(', '));
  console.log('Feedback modal UI and clipboard paste interaction passed successfully.');
} finally {
  await browser?.close();
  await preview.close();
}
