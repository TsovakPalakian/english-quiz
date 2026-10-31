import {statement, StudyError} from './learning-study.mjs';

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
  resolved_at INTEGER DEFAULT 0,
  attachments_json TEXT DEFAULT '[]'
)`;

let ready = false;
export async function ensureFeedbackStore(db) {
  if (ready) return;
  await db.atomic([
    statement(CREATE_FEEDBACK_TABLE),
    statement('CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(resolved, created_at DESC)')
  ]);
  try {
    const info = await db.read('PRAGMA table_info(user_feedback)');
    const cols = new Set(info.map(c => c.name));
    if (!cols.has('attachments_json')) {
      await db.atomic([statement("ALTER TABLE user_feedback ADD COLUMN attachments_json TEXT DEFAULT '[]'")]);
    }
  } catch {}
  ready = true;
}

const feedbackRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_ROLE_FEEDBACK_LIMITS = {
  DEVELOPER: 20,
  ADMIN: 10,
  USER: 5,
  guest: 1
};
export const DEFAULT_BREADCRUMBS_LIMIT = 10;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MiB

export function defaultFeedbackLimitForRole(role) {
  if (role === 'DEVELOPER') return 20;
  if (role === 'ADMIN') return 10;
  if (role === 'USER') return 5;
  return 1;
}

export function checkFeedbackRateLimit(clientKey, nowMs = Date.now(), maxRequests = 1) {
  const key = String(clientKey || 'unknown').trim();
  const limit = Math.max(1, Number(maxRequests) || 1);
  const times = (feedbackRateLimits.get(key) || []).filter(t => nowMs - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= limit) {
    const oldest = times[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
    return { ok: false, retryAfterSec, limit };
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
  return { ok: true, remaining: limit - times.length, limit };
}

export async function getUserFeedbackLimit(db, userId) {
  if (!db || !userId) return null;
  try {
    const rows = await db.read("SELECT value_json FROM catalog_documents WHERE namespace='feedback-user-limits' AND key=?", [String(userId)]);
    if (!rows.length) return null;
    const parsed = JSON.parse(rows[0].value_json);
    const limit = Number(parsed?.limit);
    return Number.isSafeInteger(limit) && limit >= 0 ? limit : null;
  } catch {
    return null;
  }
}

export async function setUserFeedbackLimit(db, userId, limit) {
  if (!db || !userId) return false;
  const id = String(userId).trim();
  if (limit === null || limit === undefined || limit === '') {
    await db.atomic([
      statement("DELETE FROM catalog_documents WHERE namespace='feedback-user-limits' AND key=?", [id])
    ]);
    return true;
  }
  const num = Math.max(0, Math.min(1000, Number(limit) || 0));
  await db.atomic([
    statement("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('feedback-user-limits', ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value_json=excluded.value_json", [id, JSON.stringify({ limit: num, updatedAt: Date.now() })])
  ]);
  return true;
}

export async function listUserFeedbackLimits(db) {
  if (!db) return {};
  try {
    const rows = await db.read("SELECT key, value_json FROM catalog_documents WHERE namespace='feedback-user-limits'");
    const result = {};
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.value_json);
        if (typeof parsed?.limit === 'number') result[r.key] = parsed.limit;
      } catch {}
    }
    return result;
  } catch {
    return {};
  }
}

export async function getFeedbackBreadcrumbsLimit(db) {
  if (!db) return DEFAULT_BREADCRUMBS_LIMIT;
  try {
    const rows = await db.read("SELECT value_json FROM catalog_documents WHERE namespace='feedback-settings' AND key='breadcrumbs_limit'");
    if (!rows.length) return DEFAULT_BREADCRUMBS_LIMIT;
    const parsed = JSON.parse(rows[0].value_json);
    const val = Number(parsed?.limit);
    return Number.isSafeInteger(val) && val >= 0 && val <= 100 ? val : DEFAULT_BREADCRUMBS_LIMIT;
  } catch {
    return DEFAULT_BREADCRUMBS_LIMIT;
  }
}

export async function setFeedbackBreadcrumbsLimit(db, limit) {
  if (!db) return false;
  const val = Math.max(0, Math.min(100, Math.round(Number(limit) ?? DEFAULT_BREADCRUMBS_LIMIT)));
  await db.atomic([
    statement("INSERT INTO catalog_documents(namespace, key, value_json) VALUES('feedback-settings', 'breadcrumbs_limit', ?) ON CONFLICT(namespace, key) DO UPDATE SET value_json=excluded.value_json", [JSON.stringify({ limit: val, updatedAt: Date.now() })])
  ]);
  return val;
}

export function sortAttachmentsByType(attachments) {
  if (!Array.isArray(attachments)) return [];
  const typePriority = mime => {
    const m = String(mime || '').toLowerCase();
    if (m.startsWith('image/')) return 1;
    if (m.startsWith('video/')) return 2;
    if (m.startsWith('audio/')) return 3;
    if (m.includes('pdf')) return 4;
    if (m.includes('text') || m.includes('json') || m.includes('log') || m.includes('csv')) return 5;
    if (m.includes('zip') || m.includes('tar') || m.includes('gzip') || m.includes('compressed')) return 6;
    return 7;
  };
  return attachments.slice().sort((a, b) => {
    const pA = typePriority(a.mime || a.type);
    const pB = typePriority(b.mime || b.type);
    if (pA !== pB) return pA - pB;
    const tA = String(a.mime || a.type || '');
    const tB = String(b.mime || b.type || '');
    const mimeComp = tA.localeCompare(tB);
    if (mimeComp !== 0) return mimeComp;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
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
  attachments = [],
  user = null,
  contact = '',
  context = {},
  breadcrumbsLimit = null
}) {
  await ensureFeedbackStore(db);
  const id = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const now = Math.floor(Date.now() / 1000);

  const cleanCategory = ['bug', 'idea', 'question'].includes(category) ? category : 'bug';
  const cleanMessage = String(message || '').trim().slice(0, 4000);
  const cleanScreenshot = typeof screenshot === 'string' &&
    screenshot.length <= 1_500_000 &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(screenshot)
      ? screenshot
      : '';
  const userId = String(user?.id || '');
  const userLogin = String(user?.login || '');
  const userEmail = String(user?.email || contact || '').slice(0, 255);

  const rawUrl = String(context?.url || '').trim().slice(0, 1000);
  let cleanUrl = '';
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        cleanUrl = parsed.toString();
      }
    } catch {}
  }
  const url = cleanUrl;

  const targetBreadcrumbsLimit = Number.isSafeInteger(breadcrumbsLimit) && breadcrumbsLimit >= 0
    ? breadcrumbsLimit
    : await getFeedbackBreadcrumbsLimit(db);

  const rawBreadcrumbs = Array.isArray(context?.breadcrumbs)
    ? (targetBreadcrumbsLimit === 0 ? [] : context.breadcrumbs.slice(-targetBreadcrumbsLimit))
    : [];
  const cleanBreadcrumbs = rawBreadcrumbs.map(b => ({
    ago: String(b?.ago || '').slice(0, 30),
    action: String(b?.action || '').slice(0, 50),
    details: String(b?.details || '').slice(0, 120)
  }));

  const rawAttachments = Array.isArray(attachments) ? attachments : [];
  let totalAttachmentBytes = 0;
  const validatedAttachments = [];
  for (const item of rawAttachments) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || 'attachment').slice(0, 150);
    const mime = String(item.mime || item.type || 'application/octet-stream').slice(0, 100);
    const size = Math.max(0, Number(item.size || item.bytes) || 0);
    totalAttachmentBytes += size;
    const fileId = String(item.id || item.key || crypto.randomUUID());
    const storageKey = String(item.storageKey || item.key || '');
    const dataUrl = typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:') && item.dataUrl.length < 2_000_000
      ? item.dataUrl
      : '';
    validatedAttachments.push({
      id: fileId,
      name,
      mime,
      size,
      storageKey,
      ...(dataUrl ? { dataUrl } : {})
    });
  }

  if (totalAttachmentBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
    throw new StudyError(413, 'Total attachments size exceeds 25 MiB.');
  }

  const sortedAttachments = sortAttachmentsByType(validatedAttachments);

  const deviceInfo = JSON.stringify({
    viewport: context?.viewport || null,
    userAgent: String(context?.userAgent || '').slice(0, 300),
    recentErrors: Array.isArray(context?.recentErrors) ? context.recentErrors.slice(-3) : [],
    breadcrumbs: cleanBreadcrumbs
  });

  await db.atomic([
    statement(
      `INSERT INTO user_feedback(id, category, message, screenshot_data, user_id, user_login, user_email, url, device_info, created_at, resolved, resolved_at, attachments_json)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        id,
        cleanCategory,
        cleanMessage,
        cleanScreenshot,
        userId,
        userLogin,
        userEmail,
        url,
        deviceInfo,
        now,
        JSON.stringify(sortedAttachments)
      ]
    )
  ]);

  return {
    id,
    category: cleanCategory,
    message: cleanMessage,
    hasScreenshot: Boolean(cleanScreenshot),
    attachments: sortedAttachments,
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
    `SELECT id, category, message, screenshot_data, user_id, user_login, user_email, url, device_info, created_at, resolved, resolved_at, COALESCE(attachments_json, '[]') AS attachments_json
     FROM user_feedback
     WHERE resolved = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [Number(resolved) ? 1 : 0, Math.min(100, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0)]
  );

  return rows.map(r => {
    let parsedAttachments = [];
    try { parsedAttachments = JSON.parse(r.attachments_json || '[]'); } catch { parsedAttachments = []; }
    if (!parsedAttachments.length && r.screenshot_data) {
      parsedAttachments = [{
        id: 'screenshot',
        name: 'screenshot.png',
        mime: 'image/png',
        size: Math.round(r.screenshot_data.length * 0.75),
        dataUrl: r.screenshot_data,
        isScreenshot: true
      }];
    }
    return {
      id: r.id,
      category: r.category,
      message: r.message,
      hasScreenshot: Boolean(r.screenshot_data),
      screenshot: r.screenshot_data || '',
      attachments: sortAttachmentsByType(parsedAttachments),
      userId: r.user_id,
      userLogin: r.user_login,
      userEmail: r.user_email,
      url: r.url,
      deviceInfo: safeJsonParse(r.device_info, {}),
      createdAt: r.created_at,
      resolved: Boolean(r.resolved),
      resolvedAt: r.resolved_at || null
    };
  });
}

export async function countFeedback(db) {
  await ensureFeedbackStore(db);
  const rows = await db.read('SELECT resolved, COUNT(*) AS count FROM user_feedback GROUP BY resolved');
  let open = 0, resolved = 0;
  for (const r of rows) {
    if (r.resolved === 1) resolved = Number(r.count || 0);
    else open = Number(r.count || 0);
  }
  return { open, resolved, total: open + resolved };
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
