// Pearson Speakout 3rd Edition (2022) - Level A1 Phase 1 Workspace Client
// Invariants: Single PDF workspace screen (Lesson 1A / 1D), PDF.js reader,
// Dual-page PDF Keys modal (SO3_A1_SB_AK.pdf p. 2–3 & 4–5), Plyr media dock,
// Two-phase speech playback (Pearson track -> student recording), SQLite persistence (speakout.db).

import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';

// Configure PDF.js Worker
try {
  if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.mjs';
  }
} catch (e) {
  console.warn('PDF.js worker setup note:', e.message);
}

// Security utility: HTML escaping
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const TRACK_MODEL_PHRASES = {
  '1.01': '1.01 Lesson 1A: Vocabulary - Countries',
  '1.02': '1.02 Lesson 1A: Grammar - I am, You are',
  '1.03': '1.03 Lesson 1A: Pronunciation - Contractions',
  'VB1.01': 'VB1.01 Vocabulary Bank: Numbers 1-10',
  'VB1.04': 'VB1.04 Vocabulary Bank: Days of the week'
};

// App State
const state = {
  activeLesson: '1A',
  activeDocument: 'studentBook',
  currentPage: 8,
  totalPages: 0,
  savedPages: { '1A': 8, '1B': 10, '1C': 12, '1D': 14 },
  zoomScale: 1.2,
  pdfDoc: null,
  scriptsPdfDoc: null,
  keysPdfDoc: null,
  activeTrack: '1.01',
  isPlaying: false,
  playbackSpeed: 1.0,
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  lastRecordedAudioUrl: null,
  activeMediaType: 'audio', // 'audio' | 'video'
  renderTask: null,
  keysRenderTaskLeft: null,
  keysRenderTaskRight: null,
  currentUser: null,
  userRole: null,
  recordingLesson: '1A',
  recordingTrack: '1.01',
  suppressReview: false,
  studentAudio: null,
  targetPhrase: TRACK_MODEL_PHRASES['1.01'],
  recognizedText: '',
  recognitionInstance: null
};

// DOM References
const DOM = {
  userSessionBadge: document.getElementById('user-session-badge'),
  userSessionLabel: document.getElementById('user-session-label'),
  activeBreadcrumb: document.getElementById('active-lesson-breadcrumb'),
  btnKeys: document.getElementById('btn-keys'),
  keysPageBadge: document.getElementById('keys-page-badge'),
  btnTab1a: document.getElementById('btn-tab-1a'),
  btnTab1b: document.getElementById('btn-tab-1b'),
  btnTab1c: document.getElementById('btn-tab-1c'),
  btnTab1d: document.getElementById('btn-tab-1d'),
  pageNumberInput: document.getElementById('page-number-input'),
  totalPagesLabel: document.getElementById('total-pages-label'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  docTitleBadge: document.getElementById('doc-title-badge'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  zoomLevelText: document.getElementById('zoom-level-text'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  embeddedVideo: document.getElementById('embedded-video-player'),
  pdfFallback: document.getElementById('pdf-fallback-overlay'),
  mediaStrip1a: document.getElementById('media-strip-1a'),
  mediaStrip1b: document.getElementById('media-strip-1b'),
  mediaStrip1c: document.getElementById('media-strip-1c'),
  mediaStrip1d: document.getElementById('media-strip-1d'),
  audioPlayer: document.getElementById('audio-player'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  timeCurrent: document.getElementById('time-current'),
  timeTotal: document.getElementById('time-total'),
  playerTimeline: document.getElementById('player-timeline'),
  playerProgressBar: document.getElementById('player-progress-bar'),
  btnSpeedToggle: document.getElementById('btn-speed-toggle'),
  btnRecordSpeech: document.getElementById('btn-record-speech'),
  speechStudioModal: document.getElementById('speech-studio-modal'),
  btnCloseSpeechStudio: document.getElementById('btn-close-speech-studio'),
  targetPhraseText: document.getElementById('target-phrase-text'),
  recognizedSpeechText: document.getElementById('recognized-speech-text'),
  speechMatchPill: document.getElementById('speech-match-pill'),
  speechAccuracyPill: document.getElementById('speech-accuracy-pill'),
  speechWordBreakdown: document.getElementById('speech-word-breakdown'),
  speechEngineTag: document.getElementById('speech-engine-tag'),
  speechErrorNotice: document.getElementById('speech-error-notice'),
  btnPlayModelSample: document.getElementById('btn-play-model-sample'),
  btnPlayStudentSample: document.getElementById('btn-play-student-sample'),
  keysModal: document.getElementById('keys-modal'),
  btnCloseKeys: document.getElementById('btn-close-keys'),
  keysSectionName: document.getElementById('keys-section-name'),
  keysPagesInfo: document.getElementById('keys-pages-info'),
  keysTitleLeft: document.getElementById('keys-title-left'),
  keysTitleRight: document.getElementById('keys-title-right'),
  keysPdfCanvasLeft: document.getElementById('keys-pdf-canvas-left'),
  keysPdfCanvasRight: document.getElementById('keys-pdf-canvas-right'),
  btnVidStreet: document.getElementById('btn-vid-street'),
  btnVidVlogs: document.getElementById('btn-vid-vlogs'),
  btnOpenScriptPdf: document.getElementById('btn-open-script-pdf'),
  sessionLogin: document.getElementById('session-login'),
  sessionRole: document.getElementById('session-role'),
  sessionPassword: document.getElementById('session-password'),
  readerError: document.getElementById('reader-error'),
  keysError: document.getElementById('keys-error')
};

let loadGeneration = 0;
let renderGeneration = 0;
let saveSeq = 0;

function showReaderError(message) {
  if (!DOM.readerError) return;
  if (!message) {
    DOM.readerError.textContent = '';
    DOM.readerError.classList.add('hidden');
    return;
  }
  DOM.readerError.textContent = message;
  DOM.readerError.classList.remove('hidden');
}

function updateSessionLabel() {
  if (!DOM.userSessionLabel) return;
  DOM.userSessionLabel.textContent = state.currentUser
    ? `${state.currentUser} (${state.userRole || 'student'})`
    : 'Platform Session';
}

// Format seconds into mm:ss
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 1. PDF Document Loading & Page Rendering
async function loadMainDocument(docType = 'studentBook', initialPage = 1) {
  const generation = ++loadGeneration;
  state.activeDocument = docType;
  const isBook = docType === 'studentBook';

  if (DOM.docTitleBadge) {
    DOM.docTitleBadge.textContent = isBook
      ? "Speakout 3rd Edition A1 Student's Book.pdf"
      : 'Speakout_A1_SB_Videoscripts.pdf';
  }

  try {
    const docUrl = `/api/speakout/document?doc=${encodeURIComponent(docType)}`;
    const loadingTask = pdfjsLib.getDocument({ url: docUrl, withCredentials: true });
    const doc = await loadingTask.promise;
    if (generation !== loadGeneration) {
      doc.destroy?.();
      return;
    }

    if (isBook) {
      state.pdfDoc?.destroy?.();
      state.pdfDoc = doc;
    } else {
      state.scriptsPdfDoc?.destroy?.();
      state.scriptsPdfDoc = doc;
    }
    state.totalPages = doc.numPages || 0;

    if (DOM.totalPagesLabel) {
      DOM.totalPagesLabel.textContent = `/ ${state.totalPages}`;
    }
    if (DOM.pageNumberInput) {
      DOM.pageNumberInput.max = state.totalPages;
    }

    renderPage(initialPage);
  } catch (err) {
    console.warn('PDF load notice (fallback active):', err.message);
    renderFallbackView(initialPage);
  }
}

async function renderPage(pageNum) {
  const generation = ++renderGeneration;
  // Empty or invalid input defaults strictly to page 1
  let num = parseInt(pageNum, 10);
  if (isNaN(num) || num < 1) {
    num = 1;
  }
  if (state.totalPages && num > state.totalPages) {
    num = state.totalPages;
  }
  state.currentPage = num;
  if (DOM.pageNumberInput) DOM.pageNumberInput.value = String(num);
  if (state.activeDocument === 'studentBook') state.savedPages[state.activeLesson] = num;

  // Sync zoom display
  if (DOM.zoomLevelText) {
    DOM.zoomLevelText.textContent = `${Math.round(state.zoomScale * 100)}%`;
  }

  // Persist progress to SQLite
  if (state.activeDocument === 'studentBook') {
    saveProgress(state.activeLesson, state.currentPage);
  }

  const currentDoc = state.activeDocument === 'studentBook' ? state.pdfDoc : state.scriptsPdfDoc;

  if (!currentDoc) {
    renderFallbackView(num);
    return;
  }

  try {
    const page = await currentDoc.getPage(num);
    if (generation !== renderGeneration) return;
    if (state.renderTask) state.renderTask.cancel();
    const viewport = page.getViewport({ scale: state.zoomScale });

    const canvas = DOM.pdfCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    state.renderTask = page.render({ canvasContext: ctx, viewport });
    await state.renderTask.promise;
    if (generation !== renderGeneration) return;
    state.renderTask = null;

    if (DOM.pdfFallback) DOM.pdfFallback.style.display = 'none';
    if (DOM.embeddedVideo) DOM.embeddedVideo.classList.add('hidden');
    canvas.style.display = 'block';
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') {
      console.warn('Render exception:', err.message);
      renderFallbackView(num);
    }
  }
}

function renderFallbackView(pageNum) {
  if (!DOM.pdfFallback) return;
  DOM.pdfFallback.style.display = 'block';
  if (DOM.pdfCanvas) DOM.pdfCanvas.style.display = 'none';

  // Clean offline status without exposing answers or curriculum content in DOM
  DOM.pdfFallback.innerHTML = `
    <div class="pdf-fallback-card">
      <div class="fallback-badge">PDF.js Standalone Viewer</div>
      <h3 class="fallback-title">Document Page ${pageNum} / ${state.totalPages}</h3>
      <p class="fallback-subtitle">Speakout 3rd Edition (2022) • Level A1</p>
      <div class="fallback-notice">
        Original PDF stream from local course media: <code>/api/speakout/document?doc=${encodeURIComponent(state.activeDocument)}</code>
      </div>
    </div>
  `;
}

// 2. Answer Keys (SO3_A1_SB_AK.pdf) Dual-Page Spread Modal
async function openKeysModal() {
  if (!DOM.keysModal) return;
  DOM.keysModal.classList.remove('hidden');
  if (DOM.keysError) {
    DOM.keysError.textContent = '';
    DOM.keysError.classList.add('hidden');
  }

  const view = LESSON_VIEW[state.activeLesson] || LESSON_VIEW['1A'];
  const leftPageNum = view.left;
  const rightPageNum = view.right;
  const pageRangeText = view.keysRange;
  const sectionTitle = view.keysTitle;

  if (DOM.keysSectionName) DOM.keysSectionName.textContent = sectionTitle;
  if (DOM.keysPagesInfo) DOM.keysPagesInfo.textContent = pageRangeText;
  if (DOM.keysTitleLeft) DOM.keysTitleLeft.textContent = `Page ${leftPageNum}`;
  if (DOM.keysTitleRight) DOM.keysTitleRight.textContent = `Page ${rightPageNum}`;

  try {
    if (!state.keysPdfDoc) {
      const loading = pdfjsLib.getDocument({
        url: '/api/speakout/document?doc=keys',
        withCredentials: true
      });
      state.keysPdfDoc = await loading.promise;
      if (DOM.keysPagesInfo) {
        DOM.keysPagesInfo.textContent = `${pageRangeText} of ${state.keysPdfDoc.numPages}`;
      }
    }

    if (state.keysPdfDoc) {
      // Render Left Page
      if (DOM.keysPdfCanvasLeft) {
        if (state.keysRenderTaskLeft) state.keysRenderTaskLeft.cancel();
        const leftPage = await state.keysPdfDoc.getPage(leftPageNum);
        const leftViewport = leftPage.getViewport({ scale: 0.85 });
        const canvasL = DOM.keysPdfCanvasLeft;
        canvasL.height = leftViewport.height;
        canvasL.width = leftViewport.width;
        state.keysRenderTaskLeft = leftPage.render({ canvasContext: canvasL.getContext('2d'), viewport: leftViewport });
        await state.keysRenderTaskLeft.promise;
        state.keysRenderTaskLeft = null;
      }

      // Render Right Page
      if (DOM.keysPdfCanvasRight) {
        if (state.keysRenderTaskRight) state.keysRenderTaskRight.cancel();
        const rightPage = await state.keysPdfDoc.getPage(rightPageNum);
        const rightViewport = rightPage.getViewport({ scale: 0.85 });
        const canvasR = DOM.keysPdfCanvasRight;
        canvasR.height = rightViewport.height;
        canvasR.width = rightViewport.width;
        state.keysRenderTaskRight = rightPage.render({ canvasContext: canvasR.getContext('2d'), viewport: rightViewport });
        await state.keysRenderTaskRight.promise;
        state.keysRenderTaskRight = null;
      }
    }
  } catch (err) {
    if (DOM.keysError) {
      DOM.keysError.textContent = 'Answer key pages could not be drawn.';
      DOM.keysError.classList.remove('hidden');
    }
    console.warn('Keys dual-page render notice:', err.message);
  }
}

function closeKeysModal() {
  state.keysRenderTaskLeft?.cancel?.();
  state.keysRenderTaskRight?.cancel?.();
  if (DOM.keysModal) {
    DOM.keysModal.classList.add('hidden');
  }
}

// 3. Audio & Unified Media Controls
export function isOfflineSpeechEngineActive() {
  return Boolean(window.__OFFLINE_SPEECH_ENGINE__ && !navigator.onLine);
}

function getSpeechEngineLabel() {
  if (isOfflineSpeechEngineActive()) {
    return 'Local Offline Speech Engine • Active';
  }
  return 'Local Speech Engine: Offline Verification Required';
}

function selectTrack(trackId) {
  state.activeTrack = trackId;
  state.activeMediaType = 'audio';
  let phrase = null;
  if (state.manifest) {
    const allTracks = [
      ...(state.manifest?.audio?.classAudio || []),
      ...(state.manifest?.lesson1d?.audio || [])
    ];
    const audioObj = allTracks.find(a => a.id === trackId);
    if (audioObj?.title) phrase = audioObj.title;
  }
  if (!phrase) {
    phrase = TRACK_MODEL_PHRASES[trackId];
  }
  state.targetPhrase = phrase || `Track ${trackId}`;
  if (DOM.targetPhraseText) {
    DOM.targetPhraseText.textContent = state.targetPhrase;
  }
  displayRecognizedSpeech('');

  document.querySelectorAll('.btn-track[data-track]').forEach(btn => {
    if (btn.getAttribute('data-track') === trackId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (DOM.embeddedVideo) {
    DOM.embeddedVideo.pause();
    DOM.embeddedVideo.classList.add('hidden');
  }
  if (DOM.pdfCanvas) {
    DOM.pdfCanvas.style.display = 'block';
  }

  if (DOM.audioPlayer) {
    DOM.audioPlayer.onended = null;
    DOM.audioPlayer.src = `/api/speakout/audio?track=${encodeURIComponent(trackId)}`;
    DOM.audioPlayer.playbackRate = state.playbackSpeed;
    DOM.audioPlayer.play().then(() => {
      state.isPlaying = true;
      updatePlayPauseButton();
    }).catch(() => {
      state.isPlaying = false;
      updatePlayPauseButton();
      showReaderError('Audio did not start.');
    });
  }
}

function selectVideo(videoFilename) {
  state.activeMediaType = 'video';
  state.isPlaying = false;
  document.querySelectorAll('.btn-track[data-video]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-video') === videoFilename);
  });
  if (DOM.pdfFallback) DOM.pdfFallback.style.display = 'none';

  if (DOM.audioPlayer) {
    DOM.audioPlayer.pause();
  }

  if (DOM.embeddedVideo) {
    DOM.embeddedVideo.src = `/api/speakout/video?file=${encodeURIComponent(videoFilename)}`;
    DOM.embeddedVideo.playbackRate = state.playbackSpeed;
    DOM.embeddedVideo.classList.remove('hidden');
    if (DOM.pdfCanvas) DOM.pdfCanvas.style.display = 'none';

    DOM.embeddedVideo.play().then(() => {
      state.isPlaying = true;
      updatePlayPauseButton();
    }).catch(() => {
      state.isPlaying = false;
      updatePlayPauseButton();
      showReaderError('Video did not start.');
    });
  }
}

function pauseAllMedia() {
  state.isPlaying = false;
  DOM.audioPlayer?.pause();
  DOM.embeddedVideo?.pause();
  state.studentAudio?.pause();
  updatePlayPauseButton();
}

function togglePlayPause() {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (!activeMedia) return;

  if (activeMedia.paused) {
    activeMedia.play().then(() => {
      state.isPlaying = true;
      updatePlayPauseButton();
    }).catch(e => console.warn('Play notice:', e.message));
  } else {
    activeMedia.pause();
    state.isPlaying = false;
    updatePlayPauseButton();
  }
}

function updatePlayPauseButton() {
  if (!DOM.btnPlayPause) return;
  DOM.btnPlayPause.textContent = state.isPlaying ? '❚❚' : '▶';
  DOM.btnPlayPause.title = state.isPlaying ? 'Pause' : 'Play';
}

function togglePlaybackSpeed() {
  const speeds = [1.0, 1.25, 1.5, 0.75];
  const nextIdx = (speeds.indexOf(state.playbackSpeed) + 1) % speeds.length;
  state.playbackSpeed = speeds[nextIdx];

  if (DOM.audioPlayer) DOM.audioPlayer.playbackRate = state.playbackSpeed;
  if (DOM.embeddedVideo) DOM.embeddedVideo.playbackRate = state.playbackSpeed;
  if (DOM.btnSpeedToggle) DOM.btnSpeedToggle.textContent = `${state.playbackSpeed}x`;
}

// 4. Speech Studio & Real-Time Phrase Verification (Screenshot 21)
function openSpeechStudio() {
  if (DOM.speechStudioModal) {
    DOM.speechStudioModal.classList.remove('hidden');
    if (DOM.targetPhraseText) {
      DOM.targetPhraseText.textContent = `"${state.targetPhrase}"`;
    }
    const modeLabel = getSpeechEngineLabel();
    if (DOM.speechEngineTag) {
      DOM.speechEngineTag.textContent = modeLabel;
    }
    if (DOM.speechErrorNotice) {
      DOM.speechErrorNotice.classList.add('hidden');
      DOM.speechErrorNotice.textContent = '';
    }
    displayRecognizedSpeech('');
  }
}

function closeSpeechStudio() {
  if (DOM.speechStudioModal) {
    DOM.speechStudioModal.classList.add('hidden');
  }
  if (state.isRecording) {
    state.suppressReview = true;
    toggleSpeechRecord();
  }
}

function showSpeechError(msg) {
  if (DOM.speechErrorNotice) {
    DOM.speechErrorNotice.textContent = msg;
    DOM.speechErrorNotice.classList.remove('hidden');
  }
  if (DOM.speechMatchPill) {
    DOM.speechMatchPill.textContent = 'Error';
    DOM.speechMatchPill.className = 'badge-match waiting';
  }
}

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = 'SpeechRecognition API not available';
      DOM.speechMatchPill.className = 'badge-match waiting';
    }
    return;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      displayRecognizedSpeech(transcript);
    };

    recognition.onerror = (e) => {
      showSpeechError(e.error === 'network' || !navigator.onLine
        ? 'Speech recognition requires an active network connection on this platform.'
        : `Speech recognition failed: ${e.error || 'unknown error'}`);
    };

    recognition.start();
    state.recognitionInstance = recognition;
  } catch (e) {
    console.warn('SpeechRecognition initialization notice:', e.message);
  }
}

function displayRecognizedSpeech(transcript) {
  state.recognizedText = transcript;

  // Strict offline engine gate: output text & accuracy ONLY if offline engine runs locally without network
  if (!isOfflineSpeechEngineActive()) {
    if (DOM.recognizedSpeechText) {
      DOM.recognizedSpeechText.innerHTML = '<span class="placeholder-text">Offline Engine Required: Text verification active only when speech recognizer runs locally without network.</span>';
    }
    if (DOM.speechWordBreakdown) {
      DOM.speechWordBreakdown.innerHTML = '';
    }
    if (DOM.speechAccuracyPill) {
      DOM.speechAccuracyPill.textContent = 'Accuracy: -- (Offline Required)';
      DOM.speechAccuracyPill.className = 'badge-match waiting';
    }
    if (DOM.speechEngineTag) {
      DOM.speechEngineTag.textContent = getSpeechEngineLabel();
    }
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = 'Offline Engine Required';
      DOM.speechMatchPill.className = 'badge-match waiting';
    }
    return;
  }

  if (DOM.recognizedSpeechText) {
    if (transcript) {
      DOM.recognizedSpeechText.textContent = transcript;
    } else {
      DOM.recognizedSpeechText.innerHTML = '<span class="placeholder-text">Press 🎙 Speech Record and speak clearly into microphone...</span>';
    }
  }

  const expectedWords = state.targetPhrase.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const recognizedWords = transcript ? transcript.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean) : [];

  let matchCount = 0;
  if (DOM.speechWordBreakdown) {
    DOM.speechWordBreakdown.innerHTML = '';
    expectedWords.forEach((word, idx) => {
      const span = document.createElement('span');
      span.textContent = word + ' ';
      if (recognizedWords[idx] === word) {
        span.className = 'word-match';
        matchCount++;
      } else {
        span.className = 'word-pending';
      }
      DOM.speechWordBreakdown.appendChild(span);
    });
  }

  const accuracy = expectedWords.length > 0 && transcript ? Math.round((matchCount / expectedWords.length) * 100) : 0;
  if (DOM.speechAccuracyPill) {
    DOM.speechAccuracyPill.textContent = transcript ? `Accuracy: ${accuracy}%` : 'Accuracy: --';
    DOM.speechAccuracyPill.className = accuracy >= 80 ? 'badge-match matched' : (accuracy > 0 ? 'badge-match partial' : 'badge-match waiting');
  }

  const modeLabel = getSpeechEngineLabel();
  if (DOM.speechEngineTag) {
    DOM.speechEngineTag.textContent = modeLabel;
  }

  const cleanExpected = state.targetPhrase.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const cleanRecognized = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  if (cleanExpected === cleanRecognized && cleanRecognized.length > 0) {
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = `✓ Full Match (${modeLabel})`;
      DOM.speechMatchPill.className = 'badge-match matched';
    }
  } else if (cleanRecognized && cleanExpected.includes(cleanRecognized)) {
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = `Partial Match (${accuracy}%)`;
      DOM.speechMatchPill.className = 'badge-match partial';
    }
  } else if (cleanRecognized) {
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = `Verifying Phrase (${accuracy}%)...`;
      DOM.speechMatchPill.className = 'badge-match waiting';
    }
  } else {
    if (DOM.speechMatchPill) {
      DOM.speechMatchPill.textContent = 'Waiting for speech...';
      DOM.speechMatchPill.className = 'badge-match waiting';
    }
  }
}

async function toggleSpeechRecord() {
  if (state.isRecording) {
    // Stop recording
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    if (state.recognitionInstance) {
      try { state.recognitionInstance.stop(); } catch (e) {}
    }
    state.isRecording = false;
    updateRecordButton(false);
  } else {
    // Start recording
    state.audioChunks = [];
    state.recordingLesson = state.activeLesson;
    state.recordingTrack = state.activeTrack;
    openSpeechStudio();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showSpeechError('Microphone API is not available in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mediaRecorder = new MediaRecorder(stream);
      state.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };
      state.mediaRecorder.onstop = async () => {
        const mime = state.mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(state.audioChunks, { type: mime });
        if (state.lastRecordedAudioUrl) URL.revokeObjectURL(state.lastRecordedAudioUrl);
        state.lastRecordedAudioUrl = URL.createObjectURL(audioBlob);
        if (DOM.btnPlayStudentSample) {
          DOM.btnPlayStudentSample.disabled = false;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
          if (reader.result) {
            await sendSpeechRecording(reader.result);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(t => t.stop());

        if (state.suppressReview) {
          state.suppressReview = false;
          return;
        }
        playTwoPhaseReview();
      };
      try {
        state.mediaRecorder.start();
      } catch (startErr) {
        stream.getTracks().forEach(t => t.stop());
        throw startErr;
      }
      state.isRecording = true;
      updateRecordButton(true);

      if (isOfflineSpeechEngineActive()) {
        startSpeechRecognition();
      }
    } catch (err) {
      console.warn('Microphone error:', err.message);
      showSpeechError('Microphone access denied or unavailable. Please enable your microphone.');
    }
  }
}

function updateRecordButton(recording) {
  if (!DOM.btnRecordSpeech) return;
  if (recording) {
    DOM.btnRecordSpeech.classList.add('recording');
    DOM.btnRecordSpeech.innerHTML = '<span class="rec-dot rec-active"></span><span>⏹ Stop Recording</span>';
  } else {
    DOM.btnRecordSpeech.classList.remove('recording');
    DOM.btnRecordSpeech.innerHTML = '<span class="rec-dot"></span><span>🎙 Speech Record</span>';
  }
}

function playTwoPhaseReview() {
  if (!DOM.audioPlayer) return;

  // 1. Play Pearson model track
  DOM.audioPlayer.currentTime = 0;
  DOM.audioPlayer.play().then(() => {
    state.isPlaying = true;
    updatePlayPauseButton();

    // 2. When Pearson track ends, play user's recording
    DOM.audioPlayer.onended = () => {
      DOM.audioPlayer.onended = null;
      if (state.lastRecordedAudioUrl) {
        state.studentAudio?.pause();
        state.studentAudio = new Audio(state.lastRecordedAudioUrl);
        state.studentAudio.play().then(() => {
          if (DOM.btnRecordSpeech) {
            DOM.btnRecordSpeech.title = 'Reviewing your speech recording...';
          }
        }).catch(e => console.warn('Student audio play notice:', e.message));
      }
    };
  }).catch(() => {
    state.isPlaying = false;
    updatePlayPauseButton();
    showReaderError('Model audio did not start.');
  });
}

async function sendSpeechRecording(audioBase64) {
  if (!audioBase64 || !audioBase64.startsWith('data:audio/')) return;
  try {
    const res = await fetch('/api/speakout/speech/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.currentUser || 'student_session',
        lessonId: state.recordingLesson,
        trackId: state.recordingTrack,
        audioBase64
      })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.success) {
      showReaderError(result.error || 'Recording was not saved.');
      return;
    }
    if (DOM.btnRecordSpeech) DOM.btnRecordSpeech.title = 'Saved to speakout.db';
  } catch (err) {
    console.warn('Speech save error:', err.message);
  }
}

// 4.5 Active Session Initialization (Cookie-backed authentication)
async function initSession() {
  try {
    let res = await fetch('/api/speakout/session');
    if (!res.ok) res = await fetch('/api/me');
    const data = await res.json().catch(() => ({}));
    const user = data.user || (data.authenticated ? data.user : null);
    if (user) {
      state.currentUser = user.id || user.name || 'User';
      state.userRole = (user.role || 'student').toLowerCase();
    } else {
      state.currentUser = 'Student';
      state.userRole = 'student';
    }
  } catch (_) {
    state.currentUser = 'Student';
    state.userRole = 'student';
  }
  updateSessionLabel();
}

async function submitSessionLogin(event) {
  event.preventDefault();
  const role = DOM.sessionRole?.value || 'student';
  const password = DOM.sessionPassword?.value || '';
  try {
    const res = await fetch('/api/speakout/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.user) {
      state.currentUser = null;
      state.userRole = null;
      updateSessionLabel();
      showReaderError(data.error || 'Sign-in failed.');
      return;
    }
    state.currentUser = data.user.id;
    state.userRole = data.user.role;
    updateSessionLabel();
    showReaderError('');
  } catch (_) {
    showReaderError('Sign-in failed.');
  }
}

// 4.6 Manifest Data Loading
async function loadManifestData() {
  try {
    const res = await fetch('/api/speakout/manifest');
    if (res.ok) {
      state.manifest = await res.json();
      const allTracks = [
        ...(state.manifest?.audio?.classAudio || []),
        ...(state.manifest?.lesson1d?.audio || [])
      ];
      const audioObj = allTracks.find(a => a.id === state.activeTrack);
      if (audioObj?.title) {
        state.targetPhrase = audioObj.title;
        if (DOM.targetPhraseText) {
          DOM.targetPhraseText.textContent = `"${state.targetPhrase}"`;
        }
      }
    }
  } catch (err) {
    console.warn('Manifest load notice:', err.message);
  }
}

// 5. Progress Persistence (SQLite speakout.db with user isolation)
async function loadProgress() {
  try {
    const userId = state.currentUser || 'student_session';
    const res = await fetch(`/api/speakout/progress?user=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      for (const row of data.progress || []) {
        if (LESSON_VIEW[row.lesson_id]) state.savedPages[row.lesson_id] = row.current_page;
      }
      if (state.savedPages[state.activeLesson]) state.currentPage = state.savedPages[state.activeLesson];
    }
  } catch (err) {
    console.warn('Progress load notice:', err.message);
  }
}

function saveProgress(lessonId, page) {
  const seq = ++saveSeq;
  state.savedPages[lessonId] = page;
  const send = async () => {
    if (seq !== saveSeq) return;
    const res = await fetch('/api/speakout/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId, page })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showReaderError(data.error || 'Progress was not saved.');
    }
  };
  send().catch(() => showReaderError('Progress was not saved.'));
}

const LESSON_VIEW = {
  '1A': {tab: 'btnTab1a', strip: 'mediaStrip1a', breadcrumb: 'Lesson 1A: Hello', badge: 'p. 2–3', keysTitle: 'Lesson 1A: Hello', keysRange: 'Pages 2–3', left: 2, right: 3, page: 8},
  '1B': {tab: 'btnTab1b', strip: 'mediaStrip1b', breadcrumb: 'Lesson 1B: Two jobs', badge: 'p. 4–5', keysTitle: 'Lesson 1B: Two jobs', keysRange: 'Pages 4–5', left: 4, right: 5, page: 10},
  '1C': {tab: 'btnTab1c', strip: 'mediaStrip1c', breadcrumb: 'Lesson 1C: Checking in', badge: 'p. 4–5', keysTitle: 'Lesson 1C: Checking in', keysRange: 'Pages 4–5', left: 4, right: 5, page: 12},
  '1D': {tab: 'btnTab1d', strip: 'mediaStrip1d', breadcrumb: 'Lesson 1D: BBC Video', badge: 'p. 4–5', keysTitle: 'Lesson 1D: BBC Video', keysRange: 'Pages 4–5', left: 4, right: 5, page: 14}
};

// 6. Lesson Switcher
function switchLesson(lessonId) {
  const view = LESSON_VIEW[lessonId];
  if (!view) return;
  pauseAllMedia();
  state.activeLesson = lessonId;
  for (const item of Object.values(LESSON_VIEW)) {
    if (DOM[item.tab]) DOM[item.tab].classList.toggle('active', item === view);
    if (DOM[item.strip]) DOM[item.strip].classList.toggle('hidden', item !== view);
  }
  if (DOM.activeBreadcrumb) DOM.activeBreadcrumb.textContent = view.breadcrumb;
  if (DOM.keysPageBadge) DOM.keysPageBadge.textContent = view.badge;
  const fallback = lessonId === '1B' || lessonId === '1C' ? view.page : 1;
  loadMainDocument('studentBook', state.savedPages[lessonId] || fallback);

  if (DOM.keysModal && !DOM.keysModal.classList.contains('hidden')) {
    openKeysModal();
  }
}

// 7. Event Listeners Setup
function initEventListeners() {
  // Lesson Tabs
  if (DOM.sessionLogin) DOM.sessionLogin.addEventListener('submit', submitSessionLogin);
  if (DOM.btnTab1a) DOM.btnTab1a.addEventListener('click', () => switchLesson('1A'));
  if (DOM.btnTab1b) DOM.btnTab1b.addEventListener('click', () => switchLesson('1B'));
  if (DOM.btnTab1c) DOM.btnTab1c.addEventListener('click', () => switchLesson('1C'));
  if (DOM.btnTab1d) DOM.btnTab1d.addEventListener('click', () => switchLesson('1D'));

  // Page Navigation: empty input strictly opens page 1
  if (DOM.pageNumberInput) {
    DOM.pageNumberInput.addEventListener('change', () => {
      const val = DOM.pageNumberInput.value.trim();
      const num = val === '' ? 1 : parseInt(val, 10) || 1;
      renderPage(num);
    });
  }

  if (DOM.btnPrevPage) {
    DOM.btnPrevPage.addEventListener('click', () => {
      if (state.currentPage > 1) {
        DOM.pageNumberInput.value = state.currentPage - 1;
        renderPage(state.currentPage - 1);
      }
    });
  }
  if (DOM.btnNextPage) {
    DOM.btnNextPage.addEventListener('click', () => {
      if (state.currentPage < state.totalPages) {
        DOM.pageNumberInput.value = state.currentPage + 1;
        renderPage(state.currentPage + 1);
      }
    });
  }

  // Zoom Controls
  if (DOM.btnZoomIn) {
    DOM.btnZoomIn.addEventListener('click', () => {
      state.zoomScale = Math.min(2.5, state.zoomScale + 0.15);
      renderPage(state.currentPage);
    });
  }
  if (DOM.btnZoomOut) {
    DOM.btnZoomOut.addEventListener('click', () => {
      state.zoomScale = Math.max(0.6, state.zoomScale - 0.15);
      renderPage(state.currentPage);
    });
  }
  if (DOM.btnZoomFit) {
    DOM.btnZoomFit.addEventListener('click', () => {
      state.zoomScale = 1.0;
      renderPage(state.currentPage);
    });
  }

  // Keys Modal Toggle
  if (DOM.btnKeys) {
    DOM.btnKeys.addEventListener('click', () => {
      if (DOM.keysModal.classList.contains('hidden')) {
        openKeysModal();
      } else {
        closeKeysModal();
      }
    });
  }
  if (DOM.btnCloseKeys) {
    DOM.btnCloseKeys.addEventListener('click', closeKeysModal);
  }

  // Audio Track Buttons
  document.querySelectorAll('.btn-track[data-track]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trackId = btn.getAttribute('data-track');
      if (trackId) selectTrack(trackId);
    });
  });

  // Play / Pause & Speed
  if (DOM.btnPlayPause) DOM.btnPlayPause.addEventListener('click', togglePlayPause);
  if (DOM.btnSpeedToggle) DOM.btnSpeedToggle.addEventListener('click', togglePlaybackSpeed);

  // Audio Timeline Tracking
  if (DOM.audioPlayer) {
    DOM.audioPlayer.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
    });
    DOM.audioPlayer.addEventListener('timeupdate', () => {
      if (state.activeMediaType !== 'audio') return;
      const current = DOM.audioPlayer.currentTime || 0;
      const duration = DOM.audioPlayer.duration || 0;
      if (DOM.timeCurrent) DOM.timeCurrent.textContent = formatTime(current);
      if (DOM.timeTotal && duration > 0) DOM.timeTotal.textContent = formatTime(duration);
      if (DOM.playerProgressBar && duration > 0) {
        DOM.playerProgressBar.style.width = `${(current / duration) * 100}%`;
      }
    });
  }

  // Video Timeline Tracking
  if (DOM.embeddedVideo) {
    DOM.embeddedVideo.addEventListener('timeupdate', () => {
      if (state.activeMediaType !== 'video') return;
      const current = DOM.embeddedVideo.currentTime || 0;
      const duration = DOM.embeddedVideo.duration || 0;
      if (DOM.timeCurrent) DOM.timeCurrent.textContent = formatTime(current);
      if (DOM.timeTotal && duration > 0) DOM.timeTotal.textContent = formatTime(duration);
      if (DOM.playerProgressBar && duration > 0) {
        DOM.playerProgressBar.style.width = `${(current / duration) * 100}%`;
      }
    });
    DOM.embeddedVideo.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
    });
  }

  // Timeline Click Seeker
  if (DOM.playerTimeline) {
    DOM.playerTimeline.addEventListener('click', (e) => {
      const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
      if (!activeMedia || !activeMedia.duration) return;
      const rect = DOM.playerTimeline.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      activeMedia.currentTime = pos * activeMedia.duration;
    });
  }

  // Speech Record Button
  if (DOM.btnRecordSpeech) {
    DOM.btnRecordSpeech.addEventListener('click', toggleSpeechRecord);
  }

  // Video Selector Buttons (Lesson 1D)
  if (DOM.btnVidStreet) {
    DOM.btnVidStreet.addEventListener('click', () => {
      selectVideo('SO3 A1 U1 BBC StreetInt.mp4');
    });
  }
  if (DOM.btnVidVlogs) {
    DOM.btnVidVlogs.addEventListener('click', () => {
      selectVideo('SO3 A1 U1 BBC Vlogs.mp4');
    });
  }

  // Speech Studio Controls (Screenshot 21)
  if (DOM.btnCloseSpeechStudio) {
    DOM.btnCloseSpeechStudio.addEventListener('click', closeSpeechStudio);
  }
  if (DOM.btnPlayModelSample) {
    DOM.btnPlayModelSample.addEventListener('click', () => {
      if (DOM.audioPlayer) {
        DOM.audioPlayer.currentTime = 0;
        DOM.audioPlayer.play().then(() => {
          state.isPlaying = true;
          updatePlayPauseButton();
        }).catch(() => showReaderError('Model audio did not start.'));
      }
    });
  }
  if (DOM.btnPlayStudentSample) {
    DOM.btnPlayStudentSample.addEventListener('click', () => {
      if (state.lastRecordedAudioUrl) {
        state.studentAudio?.pause();
        state.studentAudio = new Audio(state.lastRecordedAudioUrl);
        state.studentAudio.play().catch(() => showReaderError('Student recording did not start.'));
      }
    });
  }

  // Videoscripts Button: switches document viewer to Speakout_A1_SB_Videoscripts.pdf
  if (DOM.btnOpenScriptPdf) {
    DOM.btnOpenScriptPdf.addEventListener('click', () => {
      if (state.activeDocument === 'videoscripts') {
        loadMainDocument('studentBook', 1);
      } else {
        loadMainDocument('videoscripts', 1);
      }
    });
  }
}

// 8. Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  // Field starts empty as specified in Section 2, Point 4
  if (DOM.pageNumberInput) {
    DOM.pageNumberInput.value = '';
  }
  await initSession();
  await loadManifestData();
  await loadProgress();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedLesson = (urlParams.get('lesson') || '').toUpperCase();
  if (requestedLesson === '1B') switchLesson('1B');
  else if (requestedLesson === '1C') switchLesson('1C');
  else if (requestedLesson === '1D') switchLesson('1D');
  else await loadMainDocument('studentBook', state.savedPages['1A'] || 1);
});
