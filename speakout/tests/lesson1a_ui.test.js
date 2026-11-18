import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTML_PATH = path.join(__dirname, '../web/index.html');
const CSS_PATH = path.join(__dirname, '../web/style.css');
const JS_PATH = path.join(__dirname, '../web/app.js');

test('Phase 1 Approved UI Specification Verification (Screenshot 17 & 18)', async (t) => {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const js = fs.readFileSync(JS_PATH, 'utf-8');

  await t.test('1. HTML structure matches approved single-screen layout (Screenshots 17 & 18)', () => {
    // Header & Keys toggle
    assert.match(html, /class="app-header"/, 'Must contain app-header');
    assert.match(html, /id="active-lesson-breadcrumb"/, 'Must contain active lesson breadcrumb');
    assert.match(html, /id="btn-keys"/, 'Must contain Answer Keys toggle button');
    assert.match(html, /id="keys-page-badge"/, 'Must contain keys page badge (p. 2–3 / p. 4–5)');

    assert.doesNotMatch(html, /class="sidebar-nav"/, 'Studio has no lesson sidebar');
    assert.doesNotMatch(html, /id="btn-tab-1a"/, 'Studio has no Lesson 1A tab');
    assert.doesNotMatch(html, /id="btn-tab-1b"/, 'Studio has no Lesson 1B tab');
    assert.doesNotMatch(html, /id="btn-tab-1c"/, 'Studio has no Lesson 1C tab');
    assert.doesNotMatch(html, /id="btn-tab-1d"/, 'Studio has no Lesson 1D tab');
    assert.match(html, /id="media-strip-1b"/, 'Must have Lesson 1B media strip');
    assert.match(html, /data-track="1\.04"/, 'Must have track 1.04 button');
    assert.match(html, /data-track="1\.0X"/, 'Must have track 1.0X button');
    assert.match(html, /data-track="VB1\.02"/, 'Must have track VB1.02 button');
    assert.match(html, /data-track="VB1\.03"/, 'Must have track VB1.03 button');
    assert.match(html, /id="media-strip-1c"/, 'Must have Lesson 1C media strip');
    assert.match(html, /data-track="1\.05"/, 'Must have track 1.05 button');
    assert.match(html, /data-track="1\.06"/, 'Must have track 1.06 button');
    assert.match(html, /data-track="1\.07"/, 'Must have track 1.07 button');
    assert.match(html, /data-track="1\.08"/, 'Must have track 1.08 button');
    assert.doesNotMatch(html, /id="btn-tab-2a"/, 'Must not have 2A tab in Phase 1');

    // Central PDF.js Reader Pane & Toolbar
    assert.match(html, /class="main-reader-pane"/, 'Must have central reader pane');
    assert.match(html, /id="page-number-input"/, 'Must contain page number input field');
    assert.match(html, /id="btn-prev-page"/, 'Must have previous page button');
    assert.match(html, /id="btn-next-page"/, 'Must have next page button');
    assert.match(html, /id="doc-title-badge"/, 'Must display document title badge');
    assert.match(html, /id="btn-zoom-in"/, 'Must have zoom in button');
    assert.match(html, /id="btn-zoom-out"/, 'Must have zoom out button');
    assert.match(html, /id="btn-zoom-fit"/, 'Must have zoom fit button');
    assert.match(html, /id="pdf-canvas"/, 'Must have PDF.js page canvas');

    // Bottom Media Dock (Plyr-Style Compact Bar)
    assert.match(html, /class="media-dock"/, 'Must have compact bottom media dock');
    assert.match(html, /id="media-strip-1a"/, 'Must have Lesson 1A media strip');
    assert.match(html, /data-track="1\.01"/, 'Must have track 1.01 button');
    assert.match(html, /data-track="1\.02"/, 'Must have track 1.02 button');
    assert.match(html, /data-track="1\.03"/, 'Must have track 1.03 button');
    assert.match(html, /data-track="VB1\.01"/, 'Must have Vocabulary Bank VB1.01 track button');
    assert.match(html, /id="btn-play-pause"/, 'Must have play/pause button');
    assert.match(html, /id="player-timeline"/, 'Must have audio timeline seeker');
    assert.match(html, /id="btn-speed-toggle"/, 'Must have playback speed toggle button');
    assert.match(html, /id="btn-record-speech"/, 'Must have speech recording button');

    // Lesson 1D Media Strip
    assert.match(html, /id="media-strip-1d"/, 'Must have Lesson 1D media strip');
    assert.match(html, /id="btn-vid-street"/, 'Must have BBC Street Interviews button');
    assert.match(html, /id="btn-vid-vlogs"/, 'Must have BBC Vlogs button');
    assert.match(html, /id="btn-open-script-pdf"/, 'Must have Videoscripts PDF button');
    assert.match(html, /https:\/\/www\.bbc\.co\.uk\/learningenglish/, 'Must contain BBC Learning English link');
    assert.match(html, /https:\/\/learnenglish\.britishcouncil\.org/, 'Must contain LearnEnglish link');

    // Keys Modal (Original PDF SO3_A1_SB_AK.pdf, Dual-Page Spread, NO drawer-keys, NO blur(6px) blocks)
    assert.match(html, /id="keys-modal"/, 'Must have keys modal');
    assert.match(html, /id="keys-pdf-canvas-left"/, 'Must have left page canvas for SO3_A1_SB_AK.pdf');
    assert.match(html, /id="keys-pdf-canvas-right"/, 'Must have right page canvas for SO3_A1_SB_AK.pdf');
    assert.doesNotMatch(html, /id="drawer-keys"/, 'Must NOT contain old drawer-keys');
    assert.doesNotMatch(html, /btn-reveal/, 'Must NOT contain reveal answer buttons in DOM');
  });

  await t.test('2. CSS defines dark theme palette matching Screenshot 17 and eliminated DOM blur', () => {
    // Dark theme CSS variables
    assert.match(css, /--bg-dark:\s*#090d16;/, 'Background color must match dark palette');
    assert.match(css, /--accent-cyan:\s*#38bdf8;/, 'Cyan/Sky accent must be defined');
    assert.match(css, /--accent-emerald:\s*#10b981;/, 'Emerald accent must be defined');
    assert.match(css, /--accent-purple:\s*#c084fc;/, 'Purple accent must be defined');

    // Verification that blur(6px) answers are forbidden and eliminated
    assert.doesNotMatch(css, /blur\(6px\)/, 'CSS must not contain blur(6px) answer obfuscation');
  });

  await t.test('3. Client JS implements PDF.js rendering, page input fallback, and clean speech recording', () => {
    // PDF.js import and worker setup
    assert.match(js, /import\('\.\/vendor\/pdfjs\/pdf\.mjs'\)/, 'Must import PDF.js after the page is ready');
    assert.doesNotMatch(js, /import \* as pdfjsLib from '\.\/vendor\/pdfjs\/pdf\.mjs'/, 'Must not stop the page on the viewer import');
    assert.match(js, /GlobalWorkerOptions\.workerSrc/, 'Must configure PDF.js workerSrc');

    // Page input fallback (empty input opens page 1)
    assert.match(js, /pageNumberInput/, 'Must handle page number input');
    assert.match(js, /parseInt\(.*10\)\s*\|\|\s*1|val === '' \? 1/, 'Empty or invalid page input must default to page 1');

    // Lesson Tabs Switching
    assert.match(js, /switchLesson\('1A'\)/, 'Must implement switchLesson for 1A');
    assert.match(js, /switchLesson\('1D'\)/, 'Must implement switchLesson for 1D');

    // Media and Speech recording without fake percentages
    assert.match(js, /navigator\.mediaDevices\.getUserMedia/, 'Must support microphone access');
    assert.match(js, /fetch\('\/api\/speakout\/speech\/record'/, 'Must save the speech recording');
    assert.match(js, /<span>Saved<\/span>/, 'A saved recording shows Saved on the record button');
    assert.match(js, /No student recording available\. Press 🎙️ Record first\./, 'Play without a key shows the empty recording message');
    assert.match(js, /Recording file missing\./, 'Play distinguishes a missing media file');
    assert.match(js, /Student recording could not be played\./, 'Play shows the file error');
    assert.doesNotMatch(js, /audioBase64/, 'The page does not send the recording as base64');
    assert.doesNotMatch(js, /89%|92%|94%|95%|96%/, 'Must NOT contain hardcoded fake recognition percentages');

    // Progress persistence to SQLite
    assert.match(js, /fetch\('\/api\/speakout\/progress'/, 'Must persist progress to SQLite endpoint');
  });

  await t.test('4. Speech Studio modal and user session badge UI match Screenshot 21 & 22', () => {
    // Session badge
    assert.match(html, /id="user-session-badge"/, 'Must contain user session badge');
    assert.match(html, /id="user-session-label"/, 'Must contain user session label');

    // Speech studio modal (Screenshot 21 & 22)
    assert.match(html, /id="speech-studio-modal"/, 'Must contain speech-studio-modal overlay');
    assert.match(html, /id="target-phrase-text"/, 'Must contain target phrase display box');
    assert.match(html, /id="recognized-speech-text"/, 'Must contain recognized speech box');
    assert.match(html, /id="speech-match-pill"/, 'Must contain speech verification match badge');
    assert.match(html, /id="btn-play-model-sample"/, 'Must contain model audio playback button');
    assert.match(html, /id="btn-play-student-sample"/, 'Must contain student recording playback button');

    // CSS Styling for Speech Studio
    assert.match(css, /\.speech-studio-card/, 'Must contain speech studio card styling');
    assert.match(css, /\.badge-match/, 'Must contain verification badge styling');

    // Client JS Speech Logic without fake base64 and dynamic track model phrases (Screenshot 22)
    assert.match(js, /initSession/, 'Must initialize user session');
    assert.match(js, /TRACK_MODEL_PHRASES/, 'Must define track model target phrases');
    assert.match(js, /startSpeechRecognition/, 'Must implement real-time SpeechRecognition');
    assert.match(js, /displayRecognizedSpeech/, 'Must implement recognized speech phrase verification');
    assert.match(js, /navigator\.onLine/, 'Must check network connectivity for speech engine');
    assert.doesNotMatch(js, /GkXfo59ChoEBQveBAULygQETH4PBbW06/, 'Must NOT contain fake fixed base64 audio chunks');
  });

  await t.test('5. Speech Studio persistent engine status and adaptive verification UI match Screenshot 23', () => {
    // Screenshot 23 HTML elements
    assert.match(html, /id="speech-engine-tag"/, 'Must contain persistent speech engine status tag');
    assert.match(html, /id="speech-accuracy-pill"/, 'Must contain speech accuracy pill');
    assert.match(html, /id="speech-word-breakdown"/, 'Must contain speech word breakdown container');

    // Screenshot 23 CSS styles
    assert.match(css, /\.speech-word-breakdown/, 'Must style speech word breakdown');
    assert.match(css, /\.word-match/, 'Must style matched words');
    assert.match(css, /\.word-pending/, 'Must style pending words');

    // Screenshot 23 JS logic
    assert.match(js, /speechAccuracyPill/, 'Must reference speechAccuracyPill in DOM');
    assert.match(js, /speechWordBreakdown/, 'Must reference speechWordBreakdown in DOM');
    assert.match(js, /word-match/, 'Must assign word-match class to recognized words');
  });

  await t.test('6. Shared dock, sign-in, and page label match the approved screen', () => {
    assert.match(html, /id="session-login"/);
    assert.match(html, /id="session-password"/);
    assert.match(html, /id="btn-play-pause"/);
    assert.match(html, /id="media-strip-1a"/);
    assert.match(html, />0:00</);
    assert.doesNotMatch(html, /1:42/);
    assert.doesNotMatch(html, /\/ 177/);
    assert.match(js, /savedPages/);
    assert.doesNotMatch(js, /role: 'student' \}/);
  });
});
