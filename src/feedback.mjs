import {statement} from './learning-study.mjs';

const CREATE_FEEDBACK_TABLE = `CREATE TABLE IF NOT EXISTS user_feedback (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('bug', 'idea', 'question')),
  message TEXT NOT NULL,
  screenshot_data TEXT DEFAULT '',
  user_id TEXT DEFAULT '',
  user_login TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  device_info TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER DEFAULT 0
)`;

let ready = false;
export async function ensureFeedbackStore(db) {
  if (ready) return;
  await db.atomic([
    statement(CREATE_FEEDBACK_TABLE),
    statement('CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(resolved, created_at DESC)')
  ]);
  ready = true;
}

const feedbackRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 1; // 1 request per hour

export function checkFeedbackRateLimit(clientKey, nowMs = Date.now()) {
  const key = String(clientKey || 'unknown').trim();
  const times = (feedbackRateLimits.get(key) || []).filter(t => nowMs - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = times[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
    return { ok: false, retryAfterSec };
  }
  times.push(nowMs);
  feedbackRateLimits.set(key, times);

  if (feedbackRateLimits.size > 5000) {
    for (const [k, arr] of feedbackRateLimits) {
      const active = arr.filter(t => nowMs - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) feedbackRateLimits.delete(k);
      else feedbackRateLimits.set(k, active);
    }
  }
  return { ok: true, remaining: RATE_LIMIT_MAX_REQUESTS - times.length };
}

export function resetFeedbackRateLimitsForTests() {
  feedbackRateLimits.clear();
}

export function resetFeedbackStoreForTests() {
  ready = false;
  resetFeedbackRateLimitsForTests();
}

export async function saveFeedback(db, {
  category = 'bug',
  message = '',
  screenshot = '',
  user = null,
  contact = '',
  context = {}
}) {
  await ensureFeedbackStore(db);
  const id = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const now = Math.floor(Date.now() / 1000);

  const cleanCategory = ['bug', 'idea', 'question'].includes(category) ? category : 'bug';
  const cleanMessage = String(message || '').trim().slice(0, 4000);
  const cleanScreenshot = typeof screenshot === 'string' && screenshot.startsWith('data:image/') ? screenshot : '';
  const userId = String(user?.id || '');
  const userLogin = String(user?.login || '');
  const userEmail = String(user?.email || contact || '').slice(0, 255);
  const url = String(context?.url || '').slice(0, 1000);
  const rawBreadcrumbs = Array.isArray(context?.breadcrumbs) ? context.breadcrumbs.slice(-10) : [];
  const cleanBreadcrumbs = rawBreadcrumbs.map(b => ({
    ago: String(b?.ago || '').slice(0, 30),
    action: String(b?.action || '').slice(0, 50),
    details: String(b?.details || '').slice(0, 120)
  }));
  const deviceInfo = JSON.stringify({
    viewport: context?.viewport || null,
    userAgent: String(context?.userAgent || '').slice(0, 300),
    recentErrors: Array.isArray(context?.recentErrors) ? context.recentErrors.slice(-3) : [],
    breadcrumbs: cleanBreadcrumbs
  });

  await db.atomic([
    statement(
      `INSERT INTO user_feedback(id, category, message, screenshot_data, user_id, user_login, user_email, url, device_info, created_at, resolved, resolved_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [id, cleanCategory, cleanMessage, cleanScreenshot, userId, userLogin, userEmail, url, deviceInfo, now]
    )
  ]);

  return {
    id,
    category: cleanCategory,
    message: cleanMessage,
    hasScreenshot: Boolean(cleanScreenshot),
    userLogin,
    userEmail,
    url,
    breadcrumbs: cleanBreadcrumbs,
    createdAt: now
  };
}

export async function listFeedback(db, {resolved = 0, limit = 50, offset = 0} = {}) {
  await ensureFeedbackStore(db);
  const rows = await db.read(
    `SELECT id, category, message, screenshot_data, user_id, user_login, user_email, url, device_info, created_at, resolved, resolved_at
     FROM user_feedback
     WHERE resolved = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [Number(resolved) ? 1 : 0, Math.min(100, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0)]
  );

  return rows.map(r => ({
    id: r.id,
    category: r.category,
    message: r.message,
    hasScreenshot: Boolean(r.screenshot_data),
    screenshot: r.screenshot_data || '',
    userId: r.user_id,
    userLogin: r.user_login,
    userEmail: r.user_email,
    url: r.url,
    deviceInfo: safeJsonParse(r.device_info, {}),
    createdAt: r.created_at,
    resolved: Boolean(r.resolved),
    resolvedAt: r.resolved_at || null
  }));
}

export async function resolveFeedback(db, id, resolved = true) {
  await ensureFeedbackStore(db);
  const now = Math.floor(Date.now() / 1000);
  const isResolved = resolved ? 1 : 0;
  const resolvedAt = resolved ? now : 0;
  await db.atomic([
    statement('UPDATE user_feedback SET resolved = ?, resolved_at = ? WHERE id = ?', [isResolved, resolvedAt, String(id)])
  ]);
  const rows = await db.read('SELECT id, resolved FROM user_feedback WHERE id = ?', [String(id)]);
  return rows.length > 0 && rows[0].resolved === isResolved;
}

export async function notifyFeedbackTelegram(env, entry, {fetchImpl = globalThis.fetch} = {}) {
  const token = env?.TELEGRAM_BOT_TOKEN;
  const chat = env?.TELEGRAM_CHAT_ID;
  if (!token || !chat || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(chat)) {
    return false;
  }

  const icon = entry.category === 'bug' ? '🐞 ОШИБКА' : entry.category === 'idea' ? '💡 ИДЕЯ / ПРЕДЛОЖЕНИЕ' : '❓ ВОПРОС';
  const author = entry.userLogin ? `@${entry.userLogin}` + (entry.userEmail ? ` (${entry.userEmail})` : '') : (entry.userEmail || 'Гость');
  
  const captionLines = [
    `${icon} от ${author}`,
    ``,
    entry.message,
    ``,
    entry.url ? `🔗 Страница: ${entry.url}` : ''
  ];

  const crumbs = Array.isArray(entry.breadcrumbs) ? entry.breadcrumbs : (entry.deviceInfo?.breadcrumbs || []);
  if (Array.isArray(crumbs) && crumbs.length > 0) {
    const list = crumbs.slice(-5).map(c => `  • [${c.ago || 'now'}] ${c.details || c.action}`);
    captionLines.push(``, `👣 Действия пользователя:\n${list.join('\n')}`);
  }

  captionLines.push(`ID: ${entry.id}`);
  const caption = captionLines.filter(Boolean).join('\n');

  try {
    if (entry.screenshot && entry.screenshot.startsWith('data:image/')) {
      const match = entry.screenshot.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1] || 'image/jpeg';
        const base64 = match[2];
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';

        const form = new FormData();
        form.set('chat_id', chat);
        form.set('photo', new Blob([binary], {type: mime}), `screenshot.${ext}`);
        form.set('caption', caption.slice(0, 1024));

        const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000)
        });
        return res.ok;
      }
    }

    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: chat,
        text: caption.slice(0, 4000),
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(15000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function safeJsonParse(val, fallback) {
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
}
