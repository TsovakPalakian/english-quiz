import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {previewAuthStudio} from '../ops/preview-auth-studio.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(resolveTestDependency('playwright'));
const preview = await previewAuthStudio();
let browser;

try {
  browser = await launchChromium(chromium);
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(preview.url);
  await page.waitForTimeout(500);

  // 1. Simulate developer role and activate bugs section
  await page.evaluate(() => {
    document.querySelectorAll('section').forEach(s => s.classList.remove('on'));
    const bugsSec = document.getElementById('bugs');
    if (bugsSec) bugsSec.classList.add('on');

    window.isDeveloper = () => true;

    let mockRecipients = [
      { id: 'tg_1', chatId: '1308341417', label: 'Primary Developer', status: 'active', createdAt: 1700000000 },
      { id: 'tg_2', chatId: '-100987654321', label: 'Support Supergroup', status: 'active', createdAt: 1700001000 }
    ];

    window.accountFetch = async (url, opts = {}) => {
      if (url === '/api/feedback/telegram-recipients') {
        if (opts.method === 'POST') {
          const body = JSON.parse(opts.body);
          mockRecipients = body.recipients || [];
          return { ok: true, recipients: mockRecipients };
        }
        return {
          recipients: mockRecipients,
          fallbackChatId: '1308341417'
        };
      }
      if (url === '/api/feedback/telegram-test') {
        return { ok: true };
      }
      if (url.startsWith('/api/feedback')) {
        return { feedback: [], counts: { open: 0, resolved: 0 } };
      }
      return {};
    };
  });

  // 2. Verify Telegram alerts tab button exists in the segmented tabs
  const tgTabBtn = page.locator('button[data-bug-tab="telegram"]');
  await tgTabBtn.waitFor({state: 'visible'});
  assert.equal(await tgTabBtn.textContent(), 'Telegram alerts');

  // 3. Click Telegram alerts tab
  await tgTabBtn.click();
  await page.waitForTimeout(100);

  // 4. Verify Telegram panel layout and elements
  const panel = page.locator('#bugList');
  assert.ok(await panel.locator('text=Telegram Notification Recipients').isVisible());
  assert.ok(await panel.locator('text=Developer Console').isVisible());
  assert.ok(await panel.locator('text=Delivery Rule:').isVisible());
  assert.ok(await panel.locator('#telegramRecipientForm').isVisible());
  assert.ok(await panel.locator('#telegramChatIdInput').isVisible());
  assert.ok(await panel.locator('#telegramLabelInput').isVisible());
  assert.ok(await panel.locator('#telegramStatusSelect').isVisible());
  assert.ok(await panel.locator('#telegramSubmitBtn').isVisible());

  // 5. Verify existing table rows
  const rows = panel.locator('#telegramRecipientsTableBody tr');
  assert.equal(await rows.count(), 2);
  assert.ok(await panel.locator('text=Primary Developer').isVisible());
  assert.ok(await panel.locator('text=Support Supergroup').isVisible());
  assert.ok(await panel.locator('.badge.user').first().isVisible());
  assert.ok(await panel.locator('.badge.group').first().isVisible());

  // Capture real live UI screenshot
  await page.screenshot({ path: 'docs/task-telegram-recipients-screenshot.png', fullPage: false });

  // 6. Test adding a new recipient
  await panel.locator('#telegramChatIdInput').fill('555666777');
  await panel.locator('#telegramLabelInput').fill('On-Call Engineer');
  await panel.locator('#telegramSubmitBtn').click();
  await page.waitForTimeout(100);

  assert.equal(await panel.locator('#telegramRecipientsTableBody tr').count(), 3);
  assert.ok(await panel.locator('text=On-Call Engineer').isVisible());
  assert.ok(await panel.locator('text=555666777').isVisible());

  // 7. Test editing recipient
  const editBtn = panel.locator('tr:has-text("On-Call Engineer") [data-tg-action="edit"]');
  await editBtn.click();
  assert.equal(await panel.locator('#telegramLabelInput').inputValue(), 'On-Call Engineer');
  await panel.locator('#telegramLabelInput').fill('Lead On-Call');
  await panel.locator('#telegramSubmitBtn').click();
  await page.waitForTimeout(100);

  assert.ok(await panel.locator('text=Lead On-Call').isVisible());

  // 8. Test test ping button
  const testBtn = panel.locator('tr:has-text("Lead On-Call") [data-tg-action="test"]');
  await testBtn.click();
  await page.waitForTimeout(100);
  assert.ok((await testBtn.textContent()).includes('Sent!'));

  // 9. Test disabling recipient and verify disabled Test button in UI
  const editBtn2 = panel.locator('tr:has-text("Lead On-Call") [data-tg-action="edit"]');
  await editBtn2.click();
  await panel.locator('#telegramStatusSelect').selectOption('disabled');
  await panel.locator('#telegramSubmitBtn').click();
  await page.waitForTimeout(100);

  const disabledRow = panel.locator('tr:has-text("Lead On-Call")');
  assert.ok(await disabledRow.locator('text=Disabled').isVisible());
  const disabledTestBtn = disabledRow.locator('[data-tg-action="test"]');
  assert.equal(await disabledTestBtn.getAttribute('disabled'), '');
  assert.equal(await disabledTestBtn.getAttribute('title'), 'Recipient is disabled. Change status to Active to test.');

  // Click disabled button and verify it does not trigger test
  await disabledTestBtn.click({ force: true });
  await page.waitForTimeout(100);
  assert.equal(await disabledTestBtn.textContent(), '🔔 Test');

  // 10. Test remove recipient
  page.once('dialog', dialog => dialog.accept());
  const removeBtn = panel.locator('tr:has-text("Lead On-Call") [data-tg-action="remove"]');
  await removeBtn.click();
  await page.waitForTimeout(100);

  assert.equal(await panel.locator('#telegramRecipientsTableBody tr').count(), 2);
  assert.equal(await panel.locator('text=Lead On-Call').count(), 0);

  // Check for unexpected console errors
  assert.deepEqual(consoleErrors, [], 'There should be no uncaught console errors');
  console.log('UI and visual tests for Telegram recipients passed successfully.');
} finally {
  if (browser) await browser.close();
  await preview.close();
}
