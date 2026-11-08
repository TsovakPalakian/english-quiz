import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launchChromium, resolveTestDependency } from '../ops/check-environment.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(resolveTestDependency('playwright'));

test('Static token assertion: almond theme has --photo-wash: transparent', () => {
  const siteCss = fs.readFileSync('site/preview.css', 'utf8');
  const rootCss = fs.readFileSync('preview.css', 'utf8');
  const builtCss = fs.readFileSync('rollback/production-assets/preview.css', 'utf8');

  const almondSiteMatch = siteCss.match(/:root\[data-theme="almond"\]\s*\{([^}]+)\}/);
  assert.ok(almondSiteMatch, 'almond theme definition exists in site/preview.css');
  assert.match(almondSiteMatch[1], /--photo-wash:\s*transparent;/, 'site/preview.css sets --photo-wash: transparent;');

  const almondRootMatch = rootCss.match(/:root\[data-theme="almond"\]\s*\{([^}]+)\}/);
  assert.ok(almondRootMatch, 'almond theme definition exists in preview.css');
  assert.match(almondRootMatch[1], /--photo-wash:\s*transparent;/, 'preview.css sets --photo-wash: transparent;');

  const almondBuiltMatch = builtCss.match(/:root\[data-theme="almond"\]\s*\{([^}]+)\}/);
  assert.ok(almondBuiltMatch, 'almond theme definition exists in rollback/production-assets/preview.css');
  assert.match(almondBuiltMatch[1], /--photo-wash:\s*transparent;/, 'rollback/production-assets/preview.css sets --photo-wash: transparent;');
});

test('Visual test: Playwright renders almond theme background with transparent wash on body and chat', async () => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const previewCss = fs.readFileSync('site/preview.css', 'utf8');
    const chatCss = fs.readFileSync('production/chat.css', 'utf8');

    const html = `<!DOCTYPE html>
    <html lang="en" data-theme="almond">
    <head>
      <meta charset="UTF-8">
      <style>
        ${previewCss}
        ${chatCss}
      </style>
    </head>
    <body>
      <div id="content" style="padding: 30px;">
        <h1>Theme Background Test</h1>
      </div>
      <section id="messages" class="on" aria-label="Messages">
        <div class="chat-center">
          <div class="chat-timeline">
            <article class="msg-message">Hello</article>
          </div>
        </div>
      </section>
    </body>
    </html>`;

    await page.setContent(html);

    const bodyStyles = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const messages = document.getElementById('messages');
      const rootStyle = getComputedStyle(docEl);
      const bodyStyle = getComputedStyle(body);
      const messagesStyle = getComputedStyle(messages);

      return {
        photoWashVar: rootStyle.getPropertyValue('--photo-wash').trim(),
        themePhotoVar: rootStyle.getPropertyValue('--theme-photo').trim(),
        bodyBgImage: bodyStyle.backgroundImage,
        messagesBgImage: messagesStyle.backgroundImage
      };
    });

    assert.equal(bodyStyles.photoWashVar, 'transparent', '--photo-wash CSS variable resolves to transparent');
    assert.match(bodyStyles.themePhotoVar, /almond-blossom\.jpg/, '--theme-photo points to almond-blossom.jpg');

    // In Chromium, linear-gradient(transparent, transparent) resolves to rgba(0, 0, 0, 0)
    assert.match(bodyStyles.bodyBgImage, /linear-gradient\(rgba\(0,\s*0,\s*0,\s*0\),\s*rgba\(0,\s*0,\s*0,\s*0\)\)/, 'body background linear-gradient wash is transparent');
    assert.match(bodyStyles.bodyBgImage, /almond-blossom\.jpg/, 'body background image includes almond-blossom.jpg');

    assert.match(bodyStyles.messagesBgImage, /linear-gradient\(rgba\(0,\s*0,\s*0,\s*0\),\s*rgba\(0,\s*0,\s*0,\s*0\)\)/, 'chat messages background linear-gradient wash is transparent');
    assert.match(bodyStyles.messagesBgImage, /almond-blossom\.jpg/, 'chat messages background image includes almond-blossom.jpg');
  } finally {
    await browser.close();
  }
});
