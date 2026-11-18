import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const DatabaseSync = typeof process.getBuiltinModule === 'function'
  ? process.getBuiltinModule('node:sqlite')?.DatabaseSync
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.join(__dirname, '../data/manifest.json');
const WEB_DIR = path.join(__dirname, '../web');
const DB_PATH = path.join(__dirname, '../data/speakout.db');
const RECORDINGS_DIR = path.join(__dirname, '../data/recordings');
const SPEECH_BYTE_LIMIT = 25 * 1024 * 1024;
const SPEECH_KEY = /^stage-local\/recordings\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\/([a-f0-9]{64})$/;
const COURSE_BASE_DIR = path.resolve(process.env.SPEAKOUT_COURSE_DIR || path.join(__dirname, '../../../../Education/English/Speakout 3rd Edition (2022)/Speakout 3rd Edition A1'));

let sqliteDb = null;
export function getDb() {
  if (!sqliteDb) {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      sqliteDb = new DatabaseSync(DB_PATH);
      try { fs.chmodSync(DB_PATH, 0o600); } catch (_) {}
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS speakout_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS speakout_progress (
          user_id TEXT NOT NULL,
          lesson_id TEXT NOT NULL,
          current_page INTEGER NOT NULL DEFAULT 1,
          completed_steps TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY(user_id, lesson_id)
        );
        CREATE TABLE IF NOT EXISTS speakout_audio_recordings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          lesson_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          audio_base64 TEXT NOT NULL,
          media_key TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, lesson_id, track_id)
        );
        DELETE FROM speakout_audio_recordings WHERE rowid NOT IN (
          SELECT MAX(rowid) FROM speakout_audio_recordings GROUP BY user_id, lesson_id, track_id
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_speakout_audio_user_lesson_track ON speakout_audio_recordings (user_id, lesson_id, track_id);
      `);
      try { sqliteDb.exec('ALTER TABLE speakout_audio_recordings ADD COLUMN media_key TEXT'); } catch (_) {}
    } catch (_) {
      console.warn('SQLite init failed');
    }
  }
  return sqliteDb;
}

// Server-side session store & cache
const activeSessionsCache = new Map();
const sessionRateLimits = new Map(); // ip -> [timestamps]

export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function checkSessionRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 10;

  // Periodic cleanup of expired entries
  if (sessionRateLimits.size > 50) {
    for (const [key, list] of sessionRateLimits.entries()) {
      const active = list.filter(t => now - t < windowMs);
      if (active.length === 0) {
        sessionRateLimits.delete(key);
      } else {
        sessionRateLimits.set(key, active);
      }
    }
  }

  const known = sessionRateLimits.has(ip);
  if (!known && sessionRateLimits.size >= 500) return false;

  const timestamps = (sessionRateLimits.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  sessionRateLimits.set(ip, timestamps);
  return true;
}

const writeRateLimits = new Map();
const mediaRateLimits = new Map();

function checkWindowLimit(map, ip, maxRequests) {
  const now = Date.now();
  const windowMs = 60000;
  if (!map.has(ip) && map.size >= 500) return false;
  const timestamps = (map.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  map.set(ip, timestamps);
  return true;
}

export function checkWriteRateLimit(ip) {
  return checkWindowLimit(writeRateLimits, ip, 60);
}

export function checkMediaRateLimit(ip) {
  return checkWindowLimit(mediaRateLimits, ip, 600);
}

export function getClientIp(req) {
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function createServerSession(userId, role, ttlSeconds = 86400) {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  const db = getDb();
  if (!db) {
    throw new Error('Database unavailable: cannot persist session');
  }

  // Periodic expiration cleanup
  try {
    db.prepare('DELETE FROM speakout_sessions WHERE expires_at < ?').run(now);
  } catch (_) {}

  const stmt = db.prepare('INSERT OR REPLACE INTO speakout_sessions (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)');
  stmt.run(token, userId, role, now, expiresAt);

  if (activeSessionsCache.size >= 2000) {
    for (const [key, value] of activeSessionsCache) {
      if (value.expiresAt <= now) activeSessionsCache.delete(key);
    }
  }
  if (activeSessionsCache.size >= 2000) {
    throw new Error('Session cache is full');
  }
  activeSessionsCache.set(token, { userId, role, expiresAt });
  return { token, userId, role, expiresAt };
}

export function getServerSession(token) {
  if (!token || typeof token !== 'string') return null;
  const now = Date.now();

  // 1. Check in-memory cache
  const cached = activeSessionsCache.get(token);
  if (cached) {
    if (cached.expiresAt > now) {
      return { authenticated: true, userId: cached.userId, role: cached.role };
    }
    activeSessionsCache.delete(token);
    return null;
  }

  // 2. Check SQLite persistent store
  const db = getDb();
  if (db) {
    try {
      const row = db.prepare('SELECT user_id, role, expires_at FROM speakout_sessions WHERE token = ?').get(token);
      if (row && row.expires_at > now) {
        activeSessionsCache.set(token, { userId: row.user_id, role: row.role, expiresAt: row.expires_at });
        return { authenticated: true, userId: row.user_id, role: row.role };
      }
      if (row && row.expires_at <= now) {
        db.prepare('DELETE FROM speakout_sessions WHERE token = ?').run(token);
      }
    } catch (_) {
      console.warn('Session lookup failed');
    }
  }
  return null;
}

export function isInsideDir(targetPath, baseDir) {
  const resolvedBase = realpathOrResolve(baseDir);
  const resolvedTarget = realpathOrResolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
}

function realpathOrResolve(targetPath) {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync(resolved);
  } catch (_) {
    return resolved;
  }
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      try {
        cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch (_) {}
    }
  }
  return cookies;
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie);

  // 1. Speakout session cookie: speakout_session
  if (cookies.speakout_session) {
    const verified = getServerSession(cookies.speakout_session);
    if (verified) return verified;
  }

  return null;
}

export function resolveUserId(req) {
  const session = getSessionFromRequest(req);
  if (session && session.authenticated && session.userId) {
    return session.userId;
  }
  return null;
}

const ALLOWED_ORIGINS = [
  'https://lumiscia.org',
  'https://www.lumiscia.org'
];

export function getCorsOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin || typeof origin !== 'string' || /[\r\n\0]/.test(origin)) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  const host = req.headers?.host;
  if (!host || /[\r\n\0]/.test(host)) return null;
  let actual;
  let expected;
  try {
    actual = new URL(origin);
    expected = new URL(`http://${host}`);
  } catch (_) {
    return null;
  }
  const local = actual.hostname === 'localhost' || actual.hostname === '127.0.0.1';
  if (local && actual.host === expected.host) return origin;
  return null;
}

let manifestCache = null;
let manifestMtime = -1;
export function loadManifest() {
  try {
    const stat = fs.statSync(MANIFEST_PATH);
    if (manifestCache && stat.mtimeMs === manifestMtime) return manifestCache;
    manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    manifestMtime = stat.mtimeMs;
    return manifestCache;
  } catch (_) {
    return null;
  }
}

let cachedTotalPages = null;
let pagesInFlight = null;
export async function getStudentBookTotalPages() {
  if (Number.isInteger(cachedTotalPages) && cachedTotalPages > 0) return cachedTotalPages;
  if (!pagesInFlight) {
    pagesInFlight = readStudentBookTotalPages().finally(() => {
      pagesInFlight = null;
    });
  }
  return pagesInFlight;
}

async function readStudentBookTotalPages() {
  try {
    const manifest = loadManifest();
    let pdfPath = manifest?.documents?.studentBook;
    if (!pdfPath || !fs.existsSync(pdfPath) || !isInsideDir(pdfPath, COURSE_BASE_DIR)) {
      pdfPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Student's Book.pdf");
    }
    if (pdfPath && fs.existsSync(pdfPath) && isInsideDir(pdfPath, COURSE_BASE_DIR)) {
      const pdfjsLib = await import('../web/vendor/pdfjs/pdf.mjs');
      const data = new Uint8Array(fs.readFileSync(realpathOrResolve(pdfPath)));
      const doc = await pdfjsLib.getDocument({ data }).promise;
      if (doc && Number.isInteger(doc.numPages) && doc.numPages > 0) {
        cachedTotalPages = doc.numPages;
        return cachedTotalPages;
      }
    }
    // Fallback to published Pearson Speakout A1 Student's Book page count
    cachedTotalPages = 177;
    return cachedTotalPages;
  } catch (_) {}
  return 177;
}

export function sanitizeForClient(data, options = {}) {
  const opts = {
    stripKeys: options.stripKeys !== false,
    stripPaths: options.stripPaths !== false,
    stripTestAnswers: options.stripTestAnswers !== false,
    stripTranscripts: options.stripTranscripts !== false,
    stripVideoscripts: options.stripVideoscripts !== false,
    stripWorkbook: options.stripWorkbook !== false,
    ...options
  };
  const hiddenAnswerFields = new Set(['answer', 'answerText', 'category', 'contracted', 'pairs', 'bagA_items', 'bagB_items', 'parts']);
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForClient(item, opts));
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (opts.stripPaths && (key === 'path' || key === 'videoDirectory')) {
      continue;
    }
    if (opts.stripKeys && key === 'answerKeys') {
      continue;
    }
    if (opts.stripTestAnswers && hiddenAnswerFields.has(key)) {
      continue;
    }
    if (opts.stripTranscripts && key === 'transcript') {
      continue;
    }
    if (opts.stripVideoscripts && key === 'videoscripts') {
      continue;
    }
    if (opts.stripWorkbook && key === 'workbookAudio') {
      continue;
    }
    if (key === 'documents' && opts.stripPaths) {
      clean[key] = {
        studentBook: { title: "Student's Book (A1)", docKey: "studentBook", access: "public" },
        videoscripts: { title: "Videoscripts (A1)", docKey: "videoscripts", access: "public" },
        keys: { title: "Teacher's Book Answer Keys (A1)", docKey: "keys", access: "restricted" }
      };
      continue;
    }
    clean[key] = sanitizeForClient(value, opts);
  }
  return clean;
}

export function streamFileWithRange(req, res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers?.range;

  if (range && range.startsWith('bytes=')) {
    const parts = range.replace(/bytes=/, '').split('-');
    const partialStart = parts[0]?.trim();
    const partialEnd = parts[1]?.trim();

    let start = partialStart ? parseInt(partialStart, 10) : NaN;
    let end = partialEnd ? parseInt(partialEnd, 10) : total - 1;

    // Suffix range: bytes=-500 (last 500 bytes)
    if (isNaN(start) && !isNaN(end) && !partialStart) {
      start = Math.max(0, total - end);
      end = total - 1;
    }

    // Validate range values
    if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= total) {
      res.writeHead(416, {
        'Content-Range': `bytes */${total}`,
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'Range Not Satisfiable' }));
      return;
    }

    // Cap end at total - 1
    end = Math.min(end, total - 1);
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => {
      console.error('File stream failed');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Streaming error' }));
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      console.error('File stream failed');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'Streaming error' }));
    });
    stream.pipe(res);
  }
}

function applyCommonHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Origin');
  const corsOrigin = getCorsOrigin(req);
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
}

function originAllowed(req) {
  if (!req.headers?.origin) return true;
  return Boolean(getCorsOrigin(req));
}

function requireGet(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, HEAD' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
  return false;
}

function isWebm(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
}

function speechFile(mediaKey) {
  const match = SPEECH_KEY.exec(String(mediaKey || ''));
  if (!match) return null;
  const filePath = path.join(RECORDINGS_DIR, match[1]);
  const root = path.resolve(RECORDINGS_DIR);
  if (!path.resolve(filePath).startsWith(root + path.sep)) return null;
  return filePath;
}

function writeSpeechFile(bytes) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const filePath = path.join(RECORDINGS_DIR, sha);
  try { fs.writeFileSync(filePath, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  return sha;
}

function sendSpeechJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function serveSpeechRecording(req, res, reqUrl) {
  const userId = resolveUserId(req);
  if (!userId) {
    sendSpeechJson(res, 401, { error: 'Unauthorized: Active session required to save recordings' });
    return;
  }
  const db = getDb();
  if (!db) {
    sendSpeechJson(res, 500, { error: 'Database not initialized' });
    return;
  }
  const lessonId = String(reqUrl.searchParams.get('lessonId') || '').trim();
  const trackId = String(reqUrl.searchParams.get('trackId') || '').trim();
  const ALLOWED_LESSONS = ['1A', '1D'];
  const ALLOWED_TRACKS = ['1.01', '1.02', '1.03', 'VB1.01', 'VB1.04'];
  if (!ALLOWED_LESSONS.includes(lessonId) || !ALLOWED_TRACKS.includes(trackId)) {
    sendSpeechJson(res, 400, { error: 'Invalid lessonId or trackId parameter' });
    return;
  }
  const row = db.prepare('SELECT media_key FROM speakout_audio_recordings WHERE user_id = ? AND lesson_id = ? AND track_id = ?').get(userId, lessonId, trackId);
  if (!row?.media_key) {
    sendSpeechJson(res, 404, { error: 'No recording.' });
    return;
  }
  const filePath = speechFile(row.media_key);
  if (!filePath || !fs.existsSync(filePath)) {
    sendSpeechJson(res, 404, { error: 'Recording file missing.' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'audio/webm',
    'Content-Length': String(fs.statSync(filePath).size),
    'Cache-Control': 'private, no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}

function saveSpeechRecording(req, res, reqUrl) {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > SPEECH_BYTE_LIMIT) {
    sendSpeechJson(res, 413, { error: 'File exceeds 25 MiB.' });
    req.resume();
    return;
  }
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge || res.headersSent) return;
    size += chunk.length;
    if (size > SPEECH_BYTE_LIMIT) {
      tooLarge = true;
      chunks.length = 0;
      sendSpeechJson(res, 413, { error: 'File exceeds 25 MiB.' });
      req.resume();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooLarge || res.headersSent) return;
    try {
      const bytes = Buffer.concat(chunks);
      const mime = String(req.headers['content-type'] || '').split(';')[0];
      if (mime !== 'audio/webm') {
        sendSpeechJson(res, 415, { error: 'Use audio/webm.' });
        return;
      }
      if (!isWebm(bytes)) {
        sendSpeechJson(res, 400, { error: 'Invalid or missing audio recording data' });
        return;
      }
      const db = getDb();
      if (!db) {
        sendSpeechJson(res, 500, { error: 'Database not initialized' });
        return;
      }
      const userId = resolveUserId(req);
      if (!userId || !/^[A-Za-z0-9_-]{1,100}$/.test(userId)) {
        sendSpeechJson(res, 401, { error: 'Unauthorized: Active session required to save recordings' });
        return;
      }
      const ALLOWED_LESSONS = ['1A', '1D'];
      const ALLOWED_TRACKS = ['1.01', '1.02', '1.03', 'VB1.01', 'VB1.04'];
      const lessonId = String(reqUrl.searchParams.get('lessonId') || '').trim();
      const trackId = String(reqUrl.searchParams.get('trackId') || '').trim();
      if (!ALLOWED_LESSONS.includes(lessonId) || !ALLOWED_TRACKS.includes(trackId)) {
        sendSpeechJson(res, 400, { error: 'Invalid lessonId or trackId parameter' });
        return;
      }
      const sha = writeSpeechFile(bytes);
      const mediaKey = `stage-local/recordings/${userId}/${lessonId}/${sha}`;
      const id = 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      try {
        db.prepare(`
          INSERT INTO speakout_audio_recordings (id, user_id, lesson_id, track_id, audio_base64, media_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, lesson_id, track_id) DO UPDATE SET
            id = excluded.id,
            audio_base64 = '',
            media_key = excluded.media_key,
            created_at = excluded.created_at
        `).run(id, userId, lessonId, trackId, '', mediaKey);
      } catch (dbErr) {
        sendSpeechJson(res, 400, { error: 'Failed to save recording' });
        return;
      }
      sendSpeechJson(res, 200, { success: true, id, userId, lessonId, trackId });
    } catch (_) {
      sendSpeechJson(res, 400, { error: 'Failed to save recording' });
    }
  });
}

export function handleRequest(req, res) {
  let reqUrl;
  try {
    if (!req.url || req.url.includes('\0') || (req.headers?.host && req.headers.host.includes('\0'))) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
      return;
    }
    reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request' }));
    return;
  }
  const pathname = reqUrl.pathname;
  applyCommonHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1.1 API Manifest (Phase 1 scope)
  if (pathname === '/api/speakout/manifest') {
    if (!requireGet(req, res)) return;
    const manifest = loadManifest();
    if (!manifest) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Manifest not loaded' }));
      return;
    }
    const phase1Manifest = {
      course: manifest.course,
      level: manifest.level,
      unit: manifest.unit,
      unitTitle: manifest.unitTitle,
      lessonId: manifest.lessonId || '1A',
      lessonTitle: manifest.lessonTitle,
      subTitle: manifest.subTitle,
      pages: manifest.pages,
      documents: manifest.documents,
      audio: {
        classAudio: manifest.audio?.classAudio || []
      },
      lesson1d: manifest.lesson1d
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(sanitizeForClient(phase1Manifest, {
      stripKeys: true,
      stripPaths: true,
      stripTestAnswers: true,
      stripTranscripts: true,
      stripVideoscripts: true,
      stripWorkbook: true
    })));
    return;
  }

  // 1.2 API Lesson 1A
  if (pathname === '/api/speakout/lesson/A1/1A') {
    if (!requireGet(req, res)) return;
    const manifest = loadManifest();
    if (!manifest) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lesson 1A not found' }));
      return;
    }
    const lesson1a = {
      course: manifest.course,
      level: manifest.level,
      unit: manifest.unit,
      unitTitle: manifest.unitTitle,
      id: manifest.lessonId || '1A',
      lessonId: manifest.lessonId || '1A',
      lessonTitle: manifest.lessonTitle,
      subTitle: manifest.subTitle,
      pages: manifest.pages,
      audio: manifest.audio,
      photocopiables: manifest.photocopiables,
      vocabulary: manifest.vocabulary,
      grammar: manifest.grammar,
      exercises: manifest.exercises
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(sanitizeForClient(lesson1a, {
      stripKeys: true,
      stripPaths: true,
      stripTestAnswers: true,
      stripTranscripts: true,
      stripVideoscripts: true,
      stripWorkbook: true
    })));
    return;
  }

  // 1.3 API Lesson 1D
  if (pathname === '/api/speakout/lesson/A1/1D') {
    if (!requireGet(req, res)) return;
    const manifest = loadManifest();
    if (!manifest || !manifest.lesson1d) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lesson 1D not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(sanitizeForClient(manifest.lesson1d, {
      stripKeys: true,
      stripPaths: true,
      stripTestAnswers: true,
      stripTranscripts: true
    })));
    return;
  }

  // 1.8 Session Management
  if (pathname === '/api/speakout/session' && req.method === 'GET') {
    const session = getSessionFromRequest(req);
    if (session && session.authenticated) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ authenticated: true, user: { id: session.userId, role: session.role } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ authenticated: false, user: null }));
    return;
  }

  if (pathname === '/api/speakout/session' && req.method === 'DELETE') {
    const cookies = parseCookies(req.headers?.cookie);
    const token = cookies.speakout_session;
    if (token) {
      activeSessionsCache.delete(token);
      const db = getDb();
      if (db) {
        try { db.prepare('DELETE FROM speakout_sessions WHERE token = ?').run(token); } catch (_) {}
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'speakout_session=; Path=/api/speakout; HttpOnly; SameSite=Strict; Max-Age=0'
    });
    res.end(JSON.stringify({ authenticated: false, user: null }));
    return;
  }

  if (pathname === '/api/speakout/session' && req.method === 'POST') {
    const ip = getClientIp(req);
    if (!checkSessionRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests: Session creation rate limit exceeded. Please wait a minute.' }));
      return;
    }

    if (!originAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }
    const existingSession = getSessionFromRequest(req);
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const supplied = typeof payload.password === 'string' ? payload.password : '';
        const teacherSecret = process.env.SPEAKOUT_TEACHER_PASSWORD || '';
        const studentSecret = process.env.SPEAKOUT_STUDENT_PASSWORD || '';
        const teacherOk = timingSafeEqualString(supplied, teacherSecret) && teacherSecret.length > 0;
        const studentOk = timingSafeEqualString(supplied, studentSecret) && studentSecret.length > 0;
        let role = null;
        if (payload.role === 'developer' && teacherOk) role = 'developer';
        else if (payload.role === 'teacher' && teacherOk) role = 'teacher';
        else if ((payload.role === 'student' || payload.role == null) && studentOk) role = 'student';
        if (!role) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden: Self-assignment of teacher role is prohibited without verified credentials' }));
          return;
        }

        // Reuse existing valid session if same role
        if (existingSession && existingSession.authenticated && existingSession.role === role) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            authenticated: true,
            user: { id: existingSession.userId, role: existingSession.role }
          }));
          return;
        }

        const requestedId = `${role}_${crypto.randomBytes(4).toString('hex')}`;
        let session;
        try {
          session = createServerSession(requestedId, role);
        } catch (dbErr) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Database session persist failed' }));
          return;
        }

        const hostName = String(req.headers?.host || '').split(':')[0];
        const isSecure = Boolean(
          req.socket?.encrypted ||
          (process.env.TRUST_PROXY === 'true' && req.headers?.['x-forwarded-proto'] === 'https') ||
          process.env.SECURE_COOKIES === 'true' ||
          hostName === 'lumiscia.org' || hostName === 'www.lumiscia.org'
        );
        const secureFlag = isSecure ? '; Secure' : '';

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `speakout_session=${session.token}; Path=/api/speakout; HttpOnly${secureFlag}; SameSite=Strict; Max-Age=86400`
        });
        res.end(JSON.stringify({
          success: true,
          authenticated: true,
          user: { id: requestedId, role }
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // 1.9 API Progress (SQLite speakout.db with user isolation)
  if (pathname === '/api/speakout/progress' && req.method === 'GET') {
    const db = getDb();
    if (!db) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not initialized' }));
      return;
    }
    const userId = resolveUserId(req);
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Active session required to view progress' }));
      return;
    }
    const rows = db.prepare('SELECT user_id, lesson_id, current_page, completed_steps, updated_at FROM speakout_progress WHERE user_id = ?').all(userId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ progress: rows, userId }));
    return;
  }

  if (pathname === '/api/speakout/progress' && req.method === 'POST') {
    if (!originAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }
    if (!checkWriteRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 8192) {
        tooLarge = true;
        body = '';
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large: Progress body exceeds 8 KB limit' }));
        }
        req.resume();
      }
    });
    req.on('end', async () => {
      if (tooLarge || res.headersSent) return;
      try {
        const payload = JSON.parse(body || '{}');
        const db = getDb();
        if (!db) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Database not initialized' }));
          return;
        }
        const userId = resolveUserId(req);
        if (!userId) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Active session required to update progress' }));
          return;
        }

        const ALLOWED_LESSONS = ['1A', '1D'];
        const lessonId = String(payload.lessonId || '').trim();
        if (!ALLOWED_LESSONS.includes(lessonId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid lessonId parameter' }));
          return;
        }

        const maxPages = await getStudentBookTotalPages();
        const page = payload.page;
        if (!Number.isInteger(maxPages)) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Page count unavailable' }));
          return;
        }
        if (!Number.isInteger(page) || page < 1 || page > maxPages) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid page: must be an integer between 1 and ${maxPages}` }));
          return;
        }

        if (payload.completedSteps !== undefined) {
          if (!Array.isArray(payload.completedSteps) || payload.completedSteps.length > 20 || !payload.completedSteps.every(s => typeof s === 'string' && s.length <= 50)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid completedSteps: max 20 items of up to 50 characters each' }));
            return;
          }
        }
        const steps = JSON.stringify(payload.completedSteps || []);

        db.prepare(`
          INSERT INTO speakout_progress (user_id, lesson_id, current_page, completed_steps, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, lesson_id) DO UPDATE SET
            current_page = excluded.current_page,
            completed_steps = excluded.completed_steps,
            updated_at = excluded.updated_at
        `).run(userId, lessonId, page, steps);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, userId, lessonId, page }));
      } catch (err) {
        const badJson = err instanceof SyntaxError;
        res.writeHead(badJson ? 400 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: badJson ? 'Invalid JSON payload' : 'Database error' }));
      }
    });
    return;
  }

  if (pathname === '/api/speakout/speech/record' && (req.method === 'GET' || req.method === 'POST')) {
    if (!originAllowed(req)) {
      sendSpeechJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    if (req.method === 'GET') {
      serveSpeechRecording(req, res, reqUrl);
      return;
    }
    if (!checkWriteRateLimit(getClientIp(req))) {
      sendSpeechJson(res, 429, { error: 'Too Many Requests' });
      return;
    }
    saveSpeechRecording(req, res, reqUrl);
    return;
  }

  // 2. Audio Streaming with HTTP 206 Range support (Phase 1: 1A & 1D Class Audio)
  if (pathname === '/api/speakout/audio') {
    if (!requireGet(req, res)) return;
    if (!checkMediaRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }
    const trackId = reqUrl.searchParams.get('track') || '1.01';
    const ALLOWED_UNIT1_AUDIO = ['1.01', '1.02', '1.03', 'VB1.01', 'VB1.04'];
    if (!ALLOWED_UNIT1_AUDIO.includes(trackId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Audio track not found' }));
      return;
    }

    const manifest = loadManifest();
    if (!manifest) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Manifest not found' }));
      return;
    }

    const allTracks = [
      ...(manifest.audio?.classAudio || []),
      ...(manifest.lesson1d?.audio || [])
    ];
    const track = allTracks.find(t => t.id === trackId);
    const resolvedPath = track?.path || (track?.filename ? path.join(COURSE_BASE_DIR, 'Speakout 3rd Edition A1 Class Audio', track.filename) : null);

    if (!track || !resolvedPath || !fs.existsSync(resolvedPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Audio track not found' }));
      return;
    }

    const resolvedAudioPath = path.resolve(resolvedPath);
    if (!isInsideDir(resolvedAudioPath, COURSE_BASE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Audio path outside authorized directory' }));
      return;
    }

    streamFileWithRange(req, res, resolvedAudioPath, 'audio/mpeg');
    return;
  }

  // 3. Video Streaming with HTTP 206 Range support
  if (pathname === '/api/speakout/video') {
    if (!requireGet(req, res)) return;
    if (!checkMediaRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }
    const videoFile = reqUrl.searchParams.get('file') || 'SO3 A1 U1 BBC StreetInt.mp4';
    
    // Security check: block directory traversal
    if (videoFile.includes('..') || videoFile.includes('/') || videoFile.includes('\\')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid video file parameter' }));
      return;
    }

    // Phase 1 whitelist: restrict strictly to approved Unit 1 BBC video files
    const ALLOWED_UNIT1_VIDEOS = ['SO3 A1 U1 BBC StreetInt.mp4', 'SO3 A1 U1 BBC Vlogs.mp4'];
    if (!ALLOWED_UNIT1_VIDEOS.includes(videoFile)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Only Unit 1 videos (StreetInt, Vlogs) are permitted in Phase 1' }));
      return;
    }

    const manifest = loadManifest();
    const videoDir = (manifest?.videoDirectory && !manifest.videoDirectory.startsWith('/api') && fs.existsSync(manifest.videoDirectory))
      ? manifest.videoDirectory
      : path.join(COURSE_BASE_DIR, 'Speakout 3rd Edition A1 Videos');
    const fullVideoPath = path.resolve(videoDir, videoFile);

    if (!isInsideDir(fullVideoPath, COURSE_BASE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Video path outside authorized directory' }));
      return;
    }

    if (!fs.existsSync(fullVideoPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Video file not found' }));
      return;
    }

    streamFileWithRange(req, res, fullVideoPath, 'video/mp4');
    return;
  }

  // 4. Document Streaming (PDFs)
  if (pathname === '/api/speakout/document') {
    if (!requireGet(req, res)) return;
    if (!checkMediaRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too Many Requests' }));
      return;
    }
    const docKey = reqUrl.searchParams.get('doc') || 'studentBook';

    const allowedDocs = ['studentBook', 'videoscripts', 'keys', 'teacherResources'];
    if (!allowedDocs.includes(docKey)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid document parameter' }));
      return;
    }

    const session = getSessionFromRequest(req);

    if (docKey === 'keys') {
      if (!session || !session.authenticated) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Authentication required to access answer keys' }));
        return;
      }
    }

    if (docKey === 'teacherResources') {
      if (!session || !session.authenticated || (session.role !== 'teacher' && session.role !== 'developer')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied: Teacher resources require authorization' }));
        return;
      }
    }

    const manifest = loadManifest();
    let docPath = (manifest?.documents?.[docKey] && !manifest.documents[docKey].startsWith('/api') && fs.existsSync(manifest.documents[docKey]))
      ? manifest.documents[docKey]
      : null;
    if (!docPath && docKey === 'keys') {
      docPath = (manifest?.documents?.teacherResources && !manifest.documents.teacherResources.startsWith('/api') && fs.existsSync(manifest.documents.teacherResources))
        ? manifest.documents.teacherResources
        : null;
    }
    if (!docPath) {
      if (docKey === 'studentBook') docPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Student's Book.pdf");
      else if (docKey === 'keys' || docKey === 'teacherResources') docPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Teacher Resources/SO3_A1_SB_AK.pdf");
      else if (docKey === 'videoscripts') docPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Videos/Speakout_A1_SB_Videoscripts.pdf");
      else if (docKey === 'photocopiable_grammar') docPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1A_Grammar.pdf");
      else if (docKey === 'photocopiable_vocab') docPath = path.join(COURSE_BASE_DIR, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1A_Vocab.pdf");
    }

    if (!docPath || !fs.existsSync(docPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Document not found' }));
      return;
    }

    // Path boundary enforcement: check docPath is inside authorized course directory
    const resolvedDocPath = path.resolve(docPath);
    if (!isInsideDir(resolvedDocPath, COURSE_BASE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Document path outside authorized directory' }));
      return;
    }

    streamFileWithRange(req, res, resolvedDocPath, 'application/pdf');
    return;
  }

  // If an API route was not handled, return 404
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
    return;
  }

  // 5. Static Web Assets
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, HEAD' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  const cleanPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/(static\/)?/, '');
  const staticPath = path.resolve(WEB_DIR, cleanPath);
  const resolvedWebDir = path.resolve(WEB_DIR);

  // Security check: block path traversal outside of WEB_DIR
  if (!isInsideDir(staticPath, resolvedWebDir)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied' }));
    return;
  }

  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.wasm': 'application/wasm'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(staticPath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Read error' }));
    });
    stream.pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Route not found' }));
}

export function createServer() {
  return http.createServer(handleRequest);
}

// Check if directly executed
if (process.argv[1] === __filename) {
  const PORT = process.env.PORT || 3456;
  const BIND_HOST = process.env.HOST || process.env.SPEAKOUT_HOST || '0.0.0.0';
  const server = createServer();
  server.listen(PORT, BIND_HOST, () => {
    console.log(`Speakout Standalone Service listening on http://${BIND_HOST}:${PORT}`);
    console.log(`- Lesson 1A: http://${BIND_HOST}:${PORT}/`);
    console.log(`- API Manifest: http://${BIND_HOST}:${PORT}/api/speakout/manifest`);
  });
}
