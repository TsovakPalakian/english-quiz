
import { chromium } from 'playwright';
import { chromiumExecutable } from './ops/check-environment.mjs';

const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable() });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('file://' + process.cwd() + '/site/preview.html');

await page.evaluate(() => window.enquizVisit('admin'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'verified-admin.png' });

await page.evaluate(() => window.enquizVisit('verbs'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'verified-verbs.png' });

await page.evaluate(() => window.enquizVisit('lyricadd'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'verified-lyricadd.png' });

await browser.close();
console.log('Screenshots taken successfully');
