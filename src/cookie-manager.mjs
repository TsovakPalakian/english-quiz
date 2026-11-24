/**
 * TASK-9: Cookie management and parsing utilities.
 * Handles safe parsing, formatting Set-Cookie headers, and consent state management.
 */

/**
 * Safely parse a Cookie request header into a key-value dictionary.
 * Prevents URIError crashes on malformed percent-encoded sequences.
 * @param {string|null|undefined} cookieHeader
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return result;

  const pairs = cookieHeader.split(';');
  for (const rawPair of pairs) {
    const pair = rawPair.trim();
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      result[pair] = '';
      continue;
    }
    const key = pair.slice(0, eqIdx).trim();
    if (!key) continue;
    const rawVal = pair.slice(eqIdx + 1).trim();
    let val = rawVal;
    try {
      val = decodeURIComponent(rawVal);
    } catch {
      val = rawVal; // Safe fallback when decoding malformed sequences
    }
    result[key] = val;
  }
  return result;
}

/**
 * Format a Set-Cookie HTTP response header with secure defaults.
 * @param {string} name
 * @param {string} value
 * @param {object} [options]
 * @returns {string}
 */
export function formatSetCookie(name, value, options = {}) {
  const {
    path = '/',
    sameSite = 'Lax',
    secure = true,
    httpOnly = false,
    maxAge = 31536000 // 1 year default
  } = options;

  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (path) parts.push(`Path=${path}`);
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  if (typeof maxAge === 'number' && Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }

  return parts.join('; ');
}

/**
 * Generate a Set-Cookie header for cookie consent choice.
 * @param {'all'|'essential'|'declined'|string} consentStatus
 * @param {boolean} [secure=true]
 * @returns {string}
 */
export function cookieConsentHeader(consentStatus, secure = true) {
  const valid = ['all', 'essential', 'declined'].includes(consentStatus) ? consentStatus : 'essential';
  return formatSetCookie('cookie_consent', valid, {
    path: '/',
    sameSite: 'Lax',
    secure,
    httpOnly: false,
    maxAge: 31536000
  });
}
