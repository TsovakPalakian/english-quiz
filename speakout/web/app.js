// Pearson Speakout 3rd Edition (2022) - Level A1 Phase 1 Workspace Client
// Invariants: Single PDF workspace screen (Lesson 1A / 1D), PDF.js reader,
// Dual-page PDF Keys modal (SO3_A1_SB_AK.pdf p. 2–3 & 4–5), Plyr media dock,
// Two-phase speech playback (Pearson track -> student recording), SQLite persistence (speakout.db).

let pdfjsLib = null;
let pdfViewerLoad = null;

function loadPdfViewer() {
  if (pdfjsLib) return Promise.resolve(pdfjsLib);
  if (!pdfViewerLoad) {
    pdfViewerLoad = import('./vendor/pdfjs/pdf.mjs').then(lib => {
      pdfjsLib = lib;
      if (lib && lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.mjs';
      return lib;
    }).catch(error => {
      pdfViewerLoad = null;
      throw error;
    });
  }
  return pdfViewerLoad;
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
  recognitionInstance: null,
  waveformZoom: 1.0,
  loopActive: false,
  loopStart: 0,
  loopEnd: 0,
  audioDuration: 0,
  waveformPeaks: null,
  isScrubbing: false,
  activeTrimHandle: null
};

// DOM References Helper
const el = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

const DOM = {
  userSessionBadge: el('user-session-badge'),
  userSessionLabel: el('user-session-label'),
  activeBreadcrumb: el('active-lesson-breadcrumb'),
  btnKeys: el('btn-keys'),
  keysPageBadge: el('keys-page-badge'),
  btnTab1a: el('btn-tab-1a'),
  btnTab1b: el('btn-tab-1b'),
  btnTab1c: el('btn-tab-1c'),
  btnTab1d: el('btn-tab-1d'),
  pageNumberInput: el('page-number-input'),
  totalPagesLabel: el('total-pages-label'),
  btnPrevPage: el('btn-prev-page'),
  btnNextPage: el('btn-next-page'),
  docTitleBadge: el('doc-title-badge'),
  btnZoomOut: el('btn-zoom-out'),
  btnZoomIn: el('btn-zoom-in'),
  btnZoomFit: el('btn-zoom-fit'),
  zoomLevelText: el('zoom-level-text'),
  pdfCanvas: el('pdf-canvas'),
  embeddedVideo: el('embedded-video-player'),
  pdfFallback: el('pdf-fallback-overlay'),
  mediaStrip1a: el('media-strip-1a'),
  mediaStrip1b: el('media-strip-1b'),
  mediaStrip1c: el('media-strip-1c'),
  mediaStrip1d: el('media-strip-1d'),
  audioPlayer: el('audio-player'),
  btnPlayPause: el('btn-play-pause'),
  btnStop: el('btn-stop'),
  btnLoopToggle: el('btn-loop-toggle'),
  btnJumpStart: el('btn-jump-start'),
  btnRewind: el('btn-rewind'),
  btnForward: el('btn-forward'),
  btnJumpEnd: el('btn-jump-end'),
  digitalClock: el('digital-clock'),
  btnWfZoomOut: el('btn-wf-zoom-out'),
  btnWfZoomIn: el('btn-wf-zoom-in'),
  btnWfZoomFit: el('btn-wf-zoom-fit'),
  wfZoomBadge: el('wf-zoom-badge'),
  wfStatStart: el('wf-stat-start'),
  wfStatEnd: el('wf-stat-end'),
  wfStatSel: el('wf-stat-sel'),
  wfStatTotal: el('wf-stat-total'),
  waveformViewport: el('waveform-scroll-viewport'),
  waveformCanvasTrack: el('waveform-canvas-track'),
  waveformCanvas: el('waveform-canvas'),
  waveformPlayhead: el('waveform-playhead'),
  waveformPlayheadBadge: el('waveform-playhead-badge'),
  waveformRuler: el('waveform-ruler'),
  waveformLoopRegion: el('waveform-loop-region'),
  waveformLoopLabel: el('waveform-loop-label'),
  waveformTrimLeft: el('waveform-trim-left'),
  waveformTrimRight: el('waveform-trim-right'),
  timeCurrent: el('time-current'),
  timeTotal: el('time-total'),
  playerTimeline: el('player-timeline'),
  playerProgressBar: el('player-progress-bar'),
  btnSpeedToggle: el('btn-speed-toggle'),
  btnRecordSpeech: el('btn-record-speech'),
  speechStudioModal: el('speech-studio-modal'),
  btnCloseSpeechStudio: el('btn-close-speech-studio'),
  targetPhraseText: el('target-phrase-text'),
  recognizedSpeechText: el('recognized-speech-text'),
  speechMatchPill: el('speech-match-pill'),
  speechAccuracyPill: el('speech-accuracy-pill'),
  speechWordBreakdown: el('speech-word-breakdown'),
  speechEngineTag: el('speech-engine-tag'),
  speechErrorNotice: el('speech-error-notice'),
  btnPlayModelSample: el('btn-play-model-sample'),
  btnPlayStudentSample: el('btn-play-student-sample'),
  keysModal: el('keys-modal'),
  btnCloseKeys: el('btn-close-keys'),
  keysSectionName: el('keys-section-name'),
  keysPagesInfo: el('keys-pages-info'),
  keysTitleLeft: el('keys-title-left'),
  keysTitleRight: el('keys-title-right'),
  keysPdfCanvasLeft: el('keys-pdf-canvas-left'),
  keysPdfCanvasRight: el('keys-pdf-canvas-right'),
  keysTabLeft: el('keys-tab-left'),
  keysTabRight: el('keys-tab-right'),
  keysPaneLeft: el('keys-pane-left'),
  keysPaneRight: el('keys-pane-right'),
  cvsTeacher: el('cvs-teacher'),
  cvsStudent: el('cvs-student'),
  viewportTeacher: el('viewport-teacher'),
  viewportStudent: el('viewport-student'),
  playheadTeacher: el('playhead-teacher'),
  playheadStudent: el('playhead-student'),
  badgeTeacher: el('badge-teacher'),
  badgeStudent: el('badge-student'),
  teacherTimeMini: el('teacher-time-mini'),
  studentTimeMini: el('student-time-mini'),
  btnTryAgain: el('btn-try-again'),
  btnVidStreet: el('btn-vid-street'),
  btnVidVlogs: el('btn-vid-vlogs'),
  btnOpenScriptPdf: el('btn-open-script-pdf'),
  sessionLogin: el('session-login'),
  sessionRole: el('session-role'),
  sessionPassword: el('session-password'),
  readerError: el('reader-error'),
  keysError: el('keys-error')
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

// Format seconds into mm:ss.mmm with millisecond precision
export function formatTimeMs(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00.000';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}.${ms.toString().padStart(3, '0')}`;
}

// Waveform & Audio Transport Engine
let audioContextInstance = null;
function getAudioContext() {
  if (!audioContextInstance && typeof window !== 'undefined') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioContextInstance = new AudioCtx();
  }
  return audioContextInstance;
}

export async function loadWaveformForTrack(trackId) {
  try {
    const res = await fetch(`/api/speakout/audio?track=${encodeURIComponent(trackId)}`);
    if (!res.ok) throw new Error('Audio fetch failed');
    const arrayBuffer = await res.arrayBuffer();
    const ctx = getAudioContext();
    if (ctx && arrayBuffer.byteLength > 0) {
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      extractPeaks(decoded);
    } else {
      generateSyntheticPeaks();
    }
  } catch (_) {
    generateSyntheticPeaks();
  }
  renderWaveform();
}

function extractPeaks(audioBuffer) {
  state.audioDuration = audioBuffer.duration;
  if (!state.loopEnd || state.loopEnd > state.audioDuration) {
    state.loopEnd = state.audioDuration;
  }
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const numBars = 500;
  const blockSize = Math.floor(totalSamples / numBars);
  const peaks = new Float32Array(numBars);
  for (let i = 0; i < numBars; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j += 4) {
      sum += Math.abs(channelData[start + j] || 0);
    }
    peaks[i] = Math.min(1, (sum / (blockSize / 4)) * 2.5);
  }
  state.waveformPeaks = peaks;
  updateStatsDisplay();
}

export function generateSyntheticPeaks() {
  const numBars = 500;
  const peaks = new Float32Array(numBars);
  for (let i = 0; i < numBars; i++) {
    const env = Math.sin(i / 30) * Math.cos(i / 15) * 0.5 + 0.5;
    const noise = (Math.sin(i * 1.7) * 0.3 + 0.7) * env;
    peaks[i] = Math.max(0.08, Math.min(0.95, noise));
  }
  state.waveformPeaks = peaks;
  if (!state.audioDuration) {
    const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
    state.audioDuration = activeMedia?.duration || 30.0;
  }
  if (!state.loopEnd || state.loopEnd > state.audioDuration) {
    state.loopEnd = state.audioDuration;
  }
  updateStatsDisplay();
}

export function updateStatsDisplay() {
  const dur = state.audioDuration || 0;
  if (DOM.wfStatStart) DOM.wfStatStart.textContent = formatTimeMs(state.loopStart);
  if (DOM.wfStatEnd) DOM.wfStatEnd.textContent = formatTimeMs(state.loopEnd);
  const sel = Math.max(0, state.loopEnd - state.loopStart);
  if (DOM.wfStatSel) DOM.wfStatSel.textContent = formatTimeMs(sel);
  if (DOM.wfStatTotal) DOM.wfStatTotal.textContent = formatTimeMs(dur);
}

export function updateWaveformZoom() {
  if (DOM.btnWfZoomIn) {
    DOM.btnWfZoomIn.textContent = `+ (${state.waveformZoom.toFixed(1)}x)`;
    DOM.btnWfZoomIn.disabled = state.waveformZoom >= 5.0;
    DOM.btnWfZoomIn.style.opacity = state.waveformZoom >= 5.0 ? '0.5' : '1';
  }
  if (DOM.btnWfZoomOut) {
    DOM.btnWfZoomOut.disabled = state.waveformZoom <= 1.0;
    DOM.btnWfZoomOut.style.opacity = state.waveformZoom <= 1.0 ? '0.5' : '1';
  }
  if (DOM.wfZoomBadge) {
    DOM.wfZoomBadge.textContent = `🔍 Zoom: ${state.waveformZoom.toFixed(1)}x`;
  }
  renderWaveform();
}

export function renderWaveform() {
  if (!DOM.waveformCanvas || !DOM.waveformViewport) return;
  const canvas = DOM.waveformCanvas;
  const viewportWidth = DOM.waveformViewport.clientWidth || 800;
  const trackWidth = Math.round(viewportWidth * state.waveformZoom);

  if (DOM.waveformCanvasTrack) {
    DOM.waveformCanvasTrack.style.width = `${trackWidth}px`;
  }
  canvas.width = trackWidth;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  const currentTime = activeMedia?.currentTime || 0;
  const duration = state.audioDuration || activeMedia?.duration || 30.0;
  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const currentPx = progressRatio * trackWidth;

  const loopStartPx = duration > 0 ? (state.loopStart / duration) * trackWidth : 0;
  const loopEndPx = duration > 0 ? (state.loopEnd / duration) * trackWidth : trackWidth;

  const peaks = state.waveformPeaks || [];
  const numBars = peaks.length || 200;
  const barW = Math.max(2, trackWidth / numBars);

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const unplayedColor = isDark ? 'rgba(255, 255, 255, 0.40)' : 'rgba(30, 41, 59, 0.32)';

  for (let i = 0; i < numBars; i++) {
    const x = i * barW;
    const peak = peaks[i] || 0.1;
    const barH = Math.max(3, peak * (h - 12));
    const y = (h - barH) / 2;

    if (x <= currentPx) {
      ctx.fillStyle = '#10b981';
    } else if (state.loopActive && x >= loopStartPx && x <= loopEndPx) {
      ctx.fillStyle = '#38bdf8';
    } else {
      ctx.fillStyle = unplayedColor;
    }
    ctx.fillRect(x + 1, y, Math.max(1, barW - 1), barH);
  }

  // Update Trim Handles & Loop Region
  if (DOM.waveformTrimLeft) {
    DOM.waveformTrimLeft.style.left = `${loopStartPx}px`;
    DOM.waveformTrimLeft.classList.toggle('hidden', !state.loopActive);
  }
  if (DOM.waveformTrimRight) {
    DOM.waveformTrimRight.style.left = `${loopEndPx}px`;
    DOM.waveformTrimRight.classList.toggle('hidden', !state.loopActive);
  }
  if (DOM.waveformLoopRegion) {
    if (state.loopActive) {
      DOM.waveformLoopRegion.classList.remove('hidden');
      DOM.waveformLoopRegion.style.left = `${loopStartPx}px`;
      DOM.waveformLoopRegion.style.width = `${Math.max(0, loopEndPx - loopStartPx)}px`;
    } else {
      DOM.waveformLoopRegion.classList.add('hidden');
    }
  }

  // Update Playhead position & badge
  if (DOM.waveformPlayhead) {
    DOM.waveformPlayhead.style.left = `${currentPx}px`;
  }
  if (DOM.waveformPlayheadBadge) {
    DOM.waveformPlayheadBadge.style.left = `${currentPx}px`;
    DOM.waveformPlayheadBadge.textContent = formatTimeMs(currentTime);
  }

  renderRuler(trackWidth, duration);
}

function renderRuler(trackWidth, duration) {
  if (!DOM.waveformRuler) return;
  DOM.waveformRuler.style.width = `${trackWidth}px`;
  DOM.waveformRuler.innerHTML = '';

  let stepSec = 5.0;
  if (state.waveformZoom >= 4.0) stepSec = 0.5;
  else if (state.waveformZoom >= 2.5) stepSec = 1.0;
  else if (state.waveformZoom >= 1.5) stepSec = 2.0;

  const totalSteps = Math.floor(duration / stepSec);
  for (let s = 0; s <= totalSteps; s++) {
    const sec = s * stepSec;
    const span = document.createElement('span');
    span.textContent = `${sec.toFixed(sec % 1 === 0 ? 0 : 1)}s`;
    DOM.waveformRuler.appendChild(span);
  }
}

export function onMediaTimeUpdate() {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (!activeMedia) return;
  const current = activeMedia.currentTime || 0;
  const duration = activeMedia.duration || state.audioDuration || 0;

  if (state.loopActive && state.loopEnd > state.loopStart) {
    if (current >= state.loopEnd) {
      activeMedia.currentTime = state.loopStart;
      return;
    }
  }

  if (DOM.digitalClock) {
    DOM.digitalClock.textContent = formatTimeMs(current);
  }

  if (DOM.timeCurrent) DOM.timeCurrent.textContent = formatTime(current);
  if (DOM.timeTotal && duration > 0) DOM.timeTotal.textContent = formatTime(duration);
  if (DOM.playerProgressBar && duration > 0) {
    DOM.playerProgressBar.style.width = `${(current / duration) * 100}%`;
  }

  if (DOM.waveformPlayhead && duration > 0) {
    const trackWidth = DOM.waveformCanvas?.width || (DOM.waveformViewport?.clientWidth || 800) * state.waveformZoom;
    const currentPx = (current / duration) * trackWidth;
    DOM.waveformPlayhead.style.left = `${currentPx}px`;
    if (DOM.waveformPlayheadBadge) {
      DOM.waveformPlayheadBadge.style.left = `${currentPx}px`;
      DOM.waveformPlayheadBadge.textContent = formatTimeMs(current);
    }

    if (state.isPlaying && state.waveformZoom > 1.0 && DOM.waveformViewport) {
      const vpWidth = DOM.waveformViewport.clientWidth;
      const targetScroll = currentPx - vpWidth / 2;
      DOM.waveformViewport.scrollLeft = Math.max(0, targetScroll);
    }
  }
}

export function stopMedia() {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (activeMedia) {
    activeMedia.pause();
    activeMedia.currentTime = state.loopActive ? state.loopStart : 0;
    state.isPlaying = false;
    updatePlayPauseButton();
    onMediaTimeUpdate();
    renderWaveform();
  }
}

export function toggleLoop() {
  state.loopActive = !state.loopActive;
  if (DOM.btnLoopToggle) {
    DOM.btnLoopToggle.classList.toggle('active', state.loopActive);
  }
  if (state.loopActive) {
    const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
    const dur = activeMedia?.duration || state.audioDuration || 30.0;
    if (!state.loopEnd || state.loopEnd <= state.loopStart) {
      state.loopEnd = dur;
    }
  }
  updateStatsDisplay();
  renderWaveform();
}

export function jumpToStartA() {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (activeMedia) {
    activeMedia.currentTime = state.loopActive ? state.loopStart : 0;
    onMediaTimeUpdate();
    renderWaveform();
  }
}

export function jumpToEndB() {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (activeMedia) {
    const dur = activeMedia.duration || state.audioDuration || 0;
    activeMedia.currentTime = state.loopActive ? state.loopEnd : dur;
    onMediaTimeUpdate();
    renderWaveform();
  }
}

export function seekRelative(seconds) {
  const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
  if (activeMedia) {
    const dur = activeMedia.duration || state.audioDuration || 0;
    activeMedia.currentTime = Math.max(0, Math.min(dur, activeMedia.currentTime + seconds));
    onMediaTimeUpdate();
    renderWaveform();
  }
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
    await loadPdfViewer();
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
  const isStudentBook = state.activeDocument === 'studentBook';
  const basePage = isStudentBook ? (LESSON_VIEW[state.activeLesson]?.page || 8) : 1;
  const maxLessonPage = isStudentBook ? (basePage + 1) : (state.totalPages || 1);

  let num = parseInt(pageNum, 10);
  if (isNaN(num) || num < 1) {
    num = isStudentBook ? basePage : 1;
  } else if (isStudentBook && num < basePage) {
    // If entered as relative lesson page index (1 or 2)
    num = num === 2 ? maxLessonPage : basePage;
  }

  if (isStudentBook) {
    if (num < basePage) num = basePage;
    if (num > maxLessonPage) num = maxLessonPage;
  } else if (state.totalPages && num > state.totalPages) {
    num = state.totalPages;
  }

  state.currentPage = num;
  if (DOM.pageNumberInput) {
    DOM.pageNumberInput.value = isStudentBook ? String(num - basePage + 1) : String(num);
  }
  if (DOM.totalPagesLabel) {
    DOM.totalPagesLabel.textContent = isStudentBook ? `/ 2 (Book p. ${num})` : (state.totalPages ? `/ ${state.totalPages}` : '');
  }
  if (DOM.btnPrevPage) {
    DOM.btnPrevPage.disabled = isStudentBook ? (num <= basePage) : (num <= 1);
  }
  if (DOM.btnNextPage) {
    DOM.btnNextPage.disabled = isStudentBook ? (num >= maxLessonPage) : (Boolean(state.totalPages && num >= state.totalPages));
  }

  if (isStudentBook) state.savedPages[state.activeLesson] = num;

  // Sync zoom display
  if (DOM.zoomLevelText) {
    DOM.zoomLevelText.textContent = `${Math.round(state.zoomScale * 100)}%`;
  }

  // Persist progress to SQLite
  if (isStudentBook) {
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
let currentKeysTab = 'left';

async function openKeysModal(activeTab = 'left') {
  if (!DOM.keysModal) return;
  currentKeysTab = activeTab;
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
  if (DOM.keysTabLeft) DOM.keysTabLeft.textContent = `Page ${leftPageNum}`;
  if (DOM.keysTabRight) DOM.keysTabRight.textContent = `Page ${rightPageNum}`;

  const isLeft = activeTab === 'left';
  if (DOM.keysTabLeft) DOM.keysTabLeft.classList.toggle('active', isLeft);
  if (DOM.keysTabRight) DOM.keysTabRight.classList.toggle('active', !isLeft);
  if (DOM.keysPaneLeft) DOM.keysPaneLeft.classList.toggle('hidden', !isLeft);
  if (DOM.keysPaneRight) DOM.keysPaneRight.classList.toggle('hidden', isLeft);

  try {
    await loadPdfViewer();
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
      // Render Left Page at readable 1.4 scale
      if (DOM.keysPdfCanvasLeft && (isLeft || !DOM.keysPaneLeft)) {
        if (state.keysRenderTaskLeft) state.keysRenderTaskLeft.cancel();
        const leftPage = await state.keysPdfDoc.getPage(leftPageNum);
        const leftViewport = leftPage.getViewport({ scale: 1.4 });
        const canvasL = DOM.keysPdfCanvasLeft;
        canvasL.height = leftViewport.height;
        canvasL.width = leftViewport.width;
        state.keysRenderTaskLeft = leftPage.render({ canvasContext: canvasL.getContext('2d'), viewport: leftViewport });
        await state.keysRenderTaskLeft.promise;
        state.keysRenderTaskLeft = null;
      }

      // Render Right Page at readable 1.4 scale
      if (DOM.keysPdfCanvasRight && (!isLeft || !DOM.keysPaneRight)) {
        if (state.keysRenderTaskRight) state.keysRenderTaskRight.cancel();
        const rightPage = await state.keysPdfDoc.getPage(rightPageNum);
        const rightViewport = rightPage.getViewport({ scale: 1.4 });
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
    console.warn('Keys render notice:', err.message);
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
  loadWaveformForTrack(trackId);
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

  if (state.activeMediaType === 'audio' && (!DOM.audioPlayer.getAttribute('src') || DOM.audioPlayer.getAttribute('src') === '')) {
    DOM.audioPlayer.src = `/api/speakout/audio?track=${encodeURIComponent(state.activeTrack || '1.01')}`;
  }

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

let playbackRafId = null;

export function syncPlaybackAnimation() {
  if (state.isPlaying) {
    if (!playbackRafId) {
      const loop = () => {
        if (state.isPlaying) {
          onMediaTimeUpdate();
          renderWaveform();
          playbackRafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(loop) : null;
        } else {
          playbackRafId = null;
        }
      };
      playbackRafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(loop) : null;
    }
  } else {
    if (playbackRafId) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(playbackRafId);
      playbackRafId = null;
    }
  }
}

function updatePlayPauseButton() {
  if (DOM.btnPlayPause) {
    DOM.btnPlayPause.textContent = state.isPlaying ? '❚❚' : '▶';
    DOM.btnPlayPause.title = state.isPlaying ? 'Pause' : 'Play';
  }
  syncPlaybackAnimation();
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

function togglePlaybackSpeed() {
  const speeds = PLAYBACK_SPEEDS;
  const nextIdx = (speeds.indexOf(state.playbackSpeed) + 1) % speeds.length;
  state.playbackSpeed = speeds[nextIdx];

  if (DOM.audioPlayer) DOM.audioPlayer.playbackRate = state.playbackSpeed;
  if (DOM.embeddedVideo) DOM.embeddedVideo.playbackRate = state.playbackSpeed;
  if (DOM.btnSpeedToggle) DOM.btnSpeedToggle.textContent = `${state.playbackSpeed}x`;
}

// 4. Speech Studio & Real-Time Phrase Verification (Screenshot 21)
export function drawUltraDetailWave(canvasId, seed = 1.0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cs = typeof getComputedStyle !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const isTeacher = canvasId.includes('teacher');
  const ink = cs ? cs.getPropertyValue('--ink').trim() : '#f8fafc';
  const acc = cs ? cs.getPropertyValue('--acc').trim() : '#38bdf8';
  const line = cs ? cs.getPropertyValue('--line').trim() : 'rgba(255,255,255,0.2)';

  const waveColor = isTeacher ? ink : acc;
  const centerLineColor = line;

  const midY = h / 2;
  ctx.strokeStyle = centerLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  const numSamples = 550;
  const step = w / numSamples;
  ctx.strokeStyle = waveColor;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';

  for (let i = 0; i < numSamples; i++) {
    const x = i * step;
    const progress = i / numSamples;
    let wordEnv = 0.03;
    if (progress > 0.04 && progress < 0.22) {
      wordEnv = Math.sin((progress - 0.04) / 0.18 * Math.PI);
    } else if (progress > 0.25 && progress < 0.42) {
      wordEnv = Math.sin((progress - 0.25) / 0.17 * Math.PI);
    } else if (progress > 0.46 && progress < 0.74) {
      wordEnv = Math.sin((progress - 0.46) / 0.28 * Math.PI);
    } else if (progress > 0.78 && progress < 0.96) {
      wordEnv = Math.sin((progress - 0.78) / 0.18 * Math.PI);
    }

    const microTone = Math.sin(i * 0.38 * seed) * 0.5 + Math.cos(i * 0.82 * seed) * 0.5;
    const amp = Math.max(0.04, Math.abs(microTone) * wordEnv);
    const peakHeight = amp * (h * 0.88);
    const yTop = midY - peakHeight / 2;
    const yBottom = midY + peakHeight / 2;

    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
    ctx.stroke();
  }
}

function openSpeechStudio() {
  if (DOM.speechStudioModal) {
    DOM.speechStudioModal.classList.remove('hidden');
    if (DOM.targetPhraseText) {
      DOM.targetPhraseText.textContent = `"${state.targetPhrase || 'Lesson 1A Exercise 1A & 1B: Listen and match countries.'}"`;
    }
    const trackTag = el('speech-studio-track-tag');
    if (trackTag) {
      trackTag.textContent = `Track ${state.activeTrack || '1.01'}`;
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
    drawUltraDetailWave('cvs-teacher', 1.35);
    drawUltraDetailWave('cvs-student', 2.15);
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
    try {
      await fetch('/api/speakout/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, page })
      });
    } catch (e) {
      console.warn('Progress save notice:', e.message);
    }
  };
  send().catch(e => console.warn('Progress save notice:', e.message));
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

  const defaultTrack = lessonId === '1B' ? '1.04' : (lessonId === '1C' ? '1.05' : '1.01');
  state.activeTrack = defaultTrack;
  if (DOM.audioPlayer) {
    DOM.audioPlayer.src = `/api/speakout/audio?track=${encodeURIComponent(defaultTrack)}`;
  }

  const fallback = lessonId === '1B' || lessonId === '1C' ? view.page : 1;
  const loadPromise = loadMainDocument('studentBook', state.savedPages[lessonId] || fallback);

  if (DOM.keysModal && !DOM.keysModal.classList.contains('hidden')) {
    openKeysModal(currentKeysTab);
  }
  return loadPromise;
}

// 7. Event Listeners Setup
function initEventListeners() {
  // Lesson Tabs
  if (DOM.sessionLogin) DOM.sessionLogin.addEventListener('submit', submitSessionLogin);

  // Page Navigation: confined to current lesson pages (e.g. Lesson 1A: p. 8 and p. 9)
  if (DOM.pageNumberInput) {
    DOM.pageNumberInput.addEventListener('change', () => {
      const val = DOM.pageNumberInput.value.trim();
      const num = val === '' ? 1 : parseInt(val, 10) || 1;
      renderPage(num);
    });
  }

  if (DOM.btnPrevPage) {
    DOM.btnPrevPage.addEventListener('click', () => {
      const isStudentBook = state.activeDocument === 'studentBook';
      const basePage = isStudentBook ? (LESSON_VIEW[state.activeLesson]?.page || 8) : 1;
      if (state.currentPage > basePage) {
        renderPage(state.currentPage - 1);
      }
    });
  }
  if (DOM.btnNextPage) {
    DOM.btnNextPage.addEventListener('click', () => {
      const isStudentBook = state.activeDocument === 'studentBook';
      const basePage = isStudentBook ? (LESSON_VIEW[state.activeLesson]?.page || 8) : 1;
      const maxPage = isStudentBook ? (basePage + 1) : (state.totalPages || 1);
      if (state.currentPage < maxPage) {
        renderPage(state.currentPage + 1);
      }
    });
  }

  // Keys Tabs
  if (DOM.keysTabLeft) {
    DOM.keysTabLeft.addEventListener('click', () => openKeysModal('left'));
  }
  if (DOM.keysTabRight) {
    DOM.keysTabRight.addEventListener('click', () => openKeysModal('right'));
  }

  // Speech Studio Waveform Seeks & Playback
  if (DOM.viewportTeacher) {
    DOM.viewportTeacher.addEventListener('click', (e) => {
      const rect = DOM.viewportTeacher.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      if (DOM.playheadTeacher) DOM.playheadTeacher.style.left = `${clickX}px`;
      const ratio = clickX / rect.width;
      const totalSec = 3.0;
      const currSec = (ratio * totalSec).toFixed(2);
      if (DOM.badgeTeacher) DOM.badgeTeacher.textContent = `.${Math.floor(ratio * 999)}`;
      if (DOM.teacherTimeMini) DOM.teacherTimeMini.textContent = `0:0${Math.floor(currSec)} / 0:03`;
    });
  }
  if (DOM.viewportStudent) {
    DOM.viewportStudent.addEventListener('click', (e) => {
      const rect = DOM.viewportStudent.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      if (DOM.playheadStudent) DOM.playheadStudent.style.left = `${clickX}px`;
      const ratio = clickX / rect.width;
      const totalSec = 3.0;
      const currSec = (ratio * totalSec).toFixed(2);
      if (DOM.badgeStudent) DOM.badgeStudent.textContent = `.${Math.floor(ratio * 999)}`;
      if (DOM.studentTimeMini) DOM.studentTimeMini.textContent = `0:0${Math.floor(currSec)} / 0:03`;
    });
  }
  if (DOM.btnTryAgain) {
    DOM.btnTryAgain.addEventListener('click', () => {
      if (DOM.playheadStudent) DOM.playheadStudent.style.left = '0';
      if (DOM.badgeStudent) DOM.badgeStudent.textContent = '.000';
      if (DOM.studentTimeMini) DOM.studentTimeMini.textContent = '0:00 / 0:03';
      drawUltraDetailWave('cvs-student', Math.random() * 5);
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
    DOM.audioPlayer.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayPauseButton();
      onMediaTimeUpdate();
      renderWaveform();
    });
    DOM.audioPlayer.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
      renderWaveform();
    });
    DOM.audioPlayer.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
    });
    DOM.audioPlayer.addEventListener('timeupdate', onMediaTimeUpdate);
    DOM.audioPlayer.addEventListener('loadedmetadata', () => {
      state.audioDuration = DOM.audioPlayer.duration || 0;
      if (!state.loopEnd || state.loopEnd > state.audioDuration) {
        state.loopEnd = state.audioDuration;
      }
      updateStatsDisplay();
      renderWaveform();
    });
  }

  // Video Timeline Tracking
  if (DOM.embeddedVideo) {
    DOM.embeddedVideo.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayPauseButton();
      onMediaTimeUpdate();
      renderWaveform();
    });
    DOM.embeddedVideo.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
      renderWaveform();
    });
    DOM.embeddedVideo.addEventListener('timeupdate', onMediaTimeUpdate);
    DOM.embeddedVideo.addEventListener('ended', () => {
      state.isPlaying = false;
      updatePlayPauseButton();
    });
  }

  // Waveform Transport Buttons
  if (DOM.btnStop) DOM.btnStop.addEventListener('click', stopMedia);
  if (DOM.btnLoopToggle) DOM.btnLoopToggle.addEventListener('click', toggleLoop);
  if (DOM.btnJumpStart) DOM.btnJumpStart.addEventListener('click', jumpToStartA);
  if (DOM.btnRewind) DOM.btnRewind.addEventListener('click', () => seekRelative(-3));
  if (DOM.btnForward) DOM.btnForward.addEventListener('click', () => seekRelative(3));
  if (DOM.btnJumpEnd) DOM.btnJumpEnd.addEventListener('click', jumpToEndB);

  // Waveform Zoom Controls (up to 5x)
  if (DOM.btnWfZoomIn) {
    DOM.btnWfZoomIn.addEventListener('click', () => {
      state.waveformZoom = Math.min(5.0, Number((state.waveformZoom + 1.0).toFixed(1)));
      updateWaveformZoom();
    });
  }
  if (DOM.btnWfZoomOut) {
    DOM.btnWfZoomOut.addEventListener('click', () => {
      state.waveformZoom = Math.max(1.0, Number((state.waveformZoom - 1.0).toFixed(1)));
      updateWaveformZoom();
    });
  }
  if (DOM.btnWfZoomFit) {
    DOM.btnWfZoomFit.addEventListener('click', () => {
      state.waveformZoom = 1.0;
      updateWaveformZoom();
    });
  }

  // Waveform Scrubbing & Handle Dragging
  if (DOM.waveformCanvasTrack) {
    const handleScrub = (clientX) => {
      const rect = DOM.waveformCanvasTrack.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const activeMedia = state.activeMediaType === 'video' ? DOM.embeddedVideo : DOM.audioPlayer;
      const dur = activeMedia?.duration || state.audioDuration || 30.0;
      const targetTime = pos * dur;
      if (state.activeTrimHandle === 'left') {
        state.loopStart = Math.min(targetTime, Math.max(0, state.loopEnd - 0.2));
        updateStatsDisplay();
        renderWaveform();
      } else if (state.activeTrimHandle === 'right') {
        state.loopEnd = Math.max(targetTime, Math.min(dur, state.loopStart + 0.2));
        updateStatsDisplay();
        renderWaveform();
      } else if (state.isScrubbing) {
        if (activeMedia) activeMedia.currentTime = targetTime;
        onMediaTimeUpdate();
        renderWaveform();
      }
    };

    DOM.waveformCanvasTrack.addEventListener('mousedown', (e) => {
      if (e.target === DOM.waveformTrimLeft) {
        state.activeTrimHandle = 'left';
      } else if (e.target === DOM.waveformTrimRight) {
        state.activeTrimHandle = 'right';
      } else {
        state.isScrubbing = true;
        handleScrub(e.clientX);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (state.isScrubbing || state.activeTrimHandle) {
        handleScrub(e.clientX);
      }
    });

    window.addEventListener('mouseup', () => {
      state.isScrubbing = false;
      state.activeTrimHandle = null;
    });

    DOM.waveformCanvasTrack.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      if (e.target === DOM.waveformTrimLeft) {
        state.activeTrimHandle = 'left';
      } else if (e.target === DOM.waveformTrimRight) {
        state.activeTrimHandle = 'right';
      } else {
        state.isScrubbing = true;
        handleScrub(touch.clientX);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (state.isScrubbing || state.activeTrimHandle) {
        handleScrub(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      state.isScrubbing = false;
      state.activeTrimHandle = null;
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

  // Dynamic theme synchronization from platform
  window.addEventListener('message', (event) => {
    if (!event || !event.data) return;
    if (event.data.type === 'enquiz-theme-change' && event.data.theme) {
      const root = document.documentElement;
      if (event.data.custom) {
        root.setAttribute('data-theme', 'user');
        const vars = event.data.custom.vars || {};
        for (const [key, val] of Object.entries(vars)) {
          if (typeof val === 'string') root.style.setProperty(key, val);
        }
      } else {
        root.setAttribute('data-theme', event.data.theme);
        root.removeAttribute('style');
      }
      root.setAttribute('data-painted-theme', event.data.theme);
      renderWaveform();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event && event.key === 'enquiz-theme' && event.newValue) {
      document.documentElement.setAttribute('data-theme', event.newValue);
      document.documentElement.setAttribute('data-painted-theme', event.newValue);
      renderWaveform();
    }
  });
}

// 8. Bootstrap on DOM Ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    // Field starts empty as specified in Section 2, Point 4
    if (DOM.pageNumberInput) {
      DOM.pageNumberInput.value = '';
    }
    generateSyntheticPeaks();
    updateWaveformZoom();

    // Pre-initialize first audio track source so Play immediately starts sound
    if (DOM.audioPlayer && !DOM.audioPlayer.getAttribute('src')) {
      DOM.audioPlayer.src = `/api/speakout/audio?track=${encodeURIComponent(state.activeTrack || '1.01')}`;
    }

    await initSession();
    await loadManifestData();
    await loadProgress();
    try { await loadPdfViewer(); }
    catch (error) { showReaderError('The book viewer did not open.'); }
    const urlParams = new URLSearchParams(window.location.search);
    const requestedLesson = (urlParams.get('lesson') || '').toUpperCase();
    if (requestedLesson === '1B') await switchLesson('1B');
    else if (requestedLesson === '1C') await switchLesson('1C');
    else if (requestedLesson === '1D') await switchLesson('1D');
    else await switchLesson('1A');
  });
}
