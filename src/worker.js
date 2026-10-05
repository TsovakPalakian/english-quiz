import { analyzerHeaders, analyzerOutcome, analyzerTimeoutMs } from "./analyzer-client.js";

const ITERATIONS = 100000;
const SESSION_SECONDS = 180 * 24 * 3600;
const LOGIN_RE = /^[A-Za-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(data, status, headers) {
  const out = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (headers) Object.keys(headers).forEach((key) => { out[key] = headers[key]; });
  return new Response(JSON.stringify(data), { status: status || 200, headers: out });
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: ITERATIONS },
    key,
    256
  );
  return bytesToHex(bits);
}

async function hashPassword(password) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pbkdf2(password, salt) };
}

async function sha256(value) {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(bits);
}

function randomId(bytes) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes || 16)));
}

function now() {
  return Math.floor(Date.now() / 1000);
}

const LOGIN_FAIL_LIMIT = 8;
const LOGIN_LOCK_SECONDS = 15 * 60;

function clientIp(request) {
  return String(
    request.headers.get("CF-Connecting-IP") ||
    (request.headers.get("X-Forwarded-For") || "").split(",")[0] ||
    ""
  ).trim() || "unknown";
}

function loginFailKey(ip) {
  return "login-fail/" + encodeURIComponent(String(ip || "unknown")).slice(0, 120);
}

async function tooManyLoginFailures(env, ip) {
  // Fail closed: without durable fail state, reject rather than allow unlimited guesses.
  if (!env.MEDIA) return true;
  try {
    const object = await env.MEDIA.get(loginFailKey(ip));
    if (!object) return false;
    const row = JSON.parse(await object.text());
    return !!(row && row.until && row.until > now());
  } catch (e) {
    return true;
  }
}

async function noteLoginFailure(env, ip) {
  if (!env.MEDIA) return false;
  for (let attempt = 0; attempt < 8; attempt++) {
    let count = 0;
    let until = 0;
    let etag = "";
    try {
      const object = await env.MEDIA.get(loginFailKey(ip));
      if (object) {
        etag = object.httpEtag || "";
        const row = JSON.parse(await object.text());
        count = Number(row && row.count) || 0;
        until = Number(row && row.until) || 0;
        if (until > now()) return true;
      }
    } catch (e) {
      return false;
    }
    count += 1;
    if (count >= LOGIN_FAIL_LIMIT) {
      until = now() + LOGIN_LOCK_SECONDS;
      count = 0;
    } else {
      until = 0;
    }
    const saved = await putMediaJson(env, loginFailKey(ip), { count: count, until: until }, etag);
    if (saved) return true;
  }
  return false;
}

async function clearLoginFailures(env, ip) {
  if (!env.MEDIA) return;
  try { await env.MEDIA.delete(loginFailKey(ip)); } catch (e) {}
}

async function tokenFingerprint(token) {
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token || "")));
  return bytesToHex(dig).slice(0, 40);
}

async function revokeSessionToken(env, token) {
  if (!env.MEDIA || !token) return;
  const fp = await tokenFingerprint(token);
  await env.MEDIA.put("revoked-sid/" + fp, JSON.stringify({ exp: now() + SESSION_SECONDS }), {
    httpMetadata: { contentType: "application/json" }
  });
}

async function sessionTokenRevoked(env, token) {
  if (!token) return false;
  // Fail closed: without a denylist check, a stolen cookie would survive logout.
  if (!env.MEDIA) return true;
  try {
    return !!(await env.MEDIA.head("revoked-sid/" + await tokenFingerprint(token)));
  } catch (e) {
    return true;
  }
}

async function putMediaJson(env, key, value, etag) {
  const options = { httpMetadata: { contentType: "application/json" } };
  if (etag) options.onlyIf = { etagMatches: etag };
  else options.onlyIf = { etagDoesNotMatch: "*" };
  try {
    return await env.MEDIA.put(key, JSON.stringify(value), options);
  } catch (e) {
    return null;
  }
}

function publicUser(row) {
  return {
    id: row.id,
    login: row.login,
    email: row.email,
    name: row.name,
    role: row.role,
    revoked: !!row.is_personal_data_revoked,
    hidden: !!row.hidden,
    active: row.active === undefined || row.active === null ? true : !!row.active,
    createdAt: row.created_at,
  };
}

function canReview(user) {
  return !!(user && (user.role === "ADMIN" || user.role === "DEVELOPER"));
}

function signupRole(body) {
  // Registration is always a student request. Teacher promotion is a separate admin action.
  return "USER";
}

function cookieHeader(token, secure) {
  const base = token
    ? "enquiz_sid=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_SECONDS
    : "enquiz_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  return secure ? base + "; Secure" : base;
}

function readCookie(header) {
  const parts = String(header || "").split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.indexOf("enquiz_sid=") === 0) return part.slice("enquiz_sid=".length);
  }
  return "";
}

function emptyState() {
  return { added: [], songs: [], learned: [], variants: {}, stats: {} };
}

function parseState(row) {
  if (!row) return emptyState();
  try {
    return {
      added: JSON.parse(row.added),
      songs: JSON.parse(row.songs),
      learned: JSON.parse(row.learned),
      variants: JSON.parse(row.variants),
      stats: JSON.parse(row.stats),
    };
  } catch (e) {
    return emptyState();
  }
}

let schemaReady = false;
let schemaPaused = false;

function writeLimited(error) {
  const message = String(error && error.message || error);
  return message.indexOf("write limit") >= 0 || message.indexOf("exceeded D1") >= 0;
}

function statedProblem(error) {
  const message = String(error && error.message || error || "").split("\n")[0].replace(/\s+/g, " ").trim();
  if (writeLimited(error)) return "Saving is paused until 04:00. Today's database write limit is used up.";
  const lower = message.toLowerCase();
  if (lower.indexOf("users_login") >= 0 || lower.indexOf("users.login") >= 0) return "That login is already in use.";
  if (lower.indexOf("users_email") >= 0 || lower.indexOf("users.email") >= 0) return "That email is already in use.";
  if (lower.indexOf("registrations_login") >= 0 || lower.indexOf("registrations.login") >= 0) return "That login is already waiting for approval.";
  if (lower.indexOf("registrations_email") >= 0 || lower.indexOf("registrations.email") >= 0) return "That email is already waiting for approval.";
  if (lower.indexOf("account_changes_login") >= 0 || lower.indexOf("account_changes.login") >= 0) return "That login is already waiting for approval.";
  if (lower.indexOf("account_changes_email") >= 0 || lower.indexOf("account_changes.email") >= 0) return "That email is already waiting for approval.";
  if (!message || message.length > 200) return "Something went wrong.";
  return message;
}

function problemStatus(error, problem) {
  if (writeLimited(error)) return 503;
  if (/already in use|already waiting/.test(problem || "")) return 409;
  return 500;
}

async function ensureSchema(db) {
  if (schemaReady || schemaPaused) return;
  const statements = [
    "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, login TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'USER', is_personal_data_revoked INTEGER NOT NULL DEFAULT 0, revoked_at INTEGER, hidden INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_login_active ON users(login) WHERE is_personal_data_revoked = 0",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_email_active ON users(email) WHERE is_personal_data_revoked = 0",
    "CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, login TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, password_iterations INTEGER NOT NULL, status TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'USER', user_id TEXT, created_at INTEGER NOT NULL, decided_at INTEGER)",
    "CREATE UNIQUE INDEX IF NOT EXISTS registrations_login_pending ON registrations(login) WHERE status = 'pending'",
    "CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_pending ON registrations(email) WHERE status = 'pending'",
    "CREATE TABLE IF NOT EXISTS account_changes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', from_login TEXT NOT NULL, from_email TEXT NOT NULL, from_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'USER', status TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER)",
    "CREATE UNIQUE INDEX IF NOT EXISTS account_changes_user_pending ON account_changes(user_id) WHERE status = 'pending'",
    "CREATE UNIQUE INDEX IF NOT EXISTS account_changes_login_pending ON account_changes(login) WHERE status = 'pending'",
    "CREATE UNIQUE INDEX IF NOT EXISTS account_changes_email_pending ON account_changes(email) WHERE status = 'pending'",
    "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS user_state (user_id TEXT PRIMARY KEY, added TEXT NOT NULL DEFAULT '[]', songs TEXT NOT NULL DEFAULT '[]', learned TEXT NOT NULL DEFAULT '[]', variants TEXT NOT NULL DEFAULT '{}', stats TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS user_added (user_id TEXT NOT NULL, idx INTEGER NOT NULL, card TEXT NOT NULL, PRIMARY KEY (user_id, idx))",
    "CREATE TABLE IF NOT EXISTS user_card_gone (user_id TEXT NOT NULL, card_key TEXT NOT NULL, PRIMARY KEY (user_id, card_key))",
  ];
  try {
    for (let i = 0; i < statements.length; i++) await db.prepare(statements[i]).run();
    schemaReady = true;
  } catch (error) {
    if (writeLimited(error)) { schemaPaused = true; return; }
    throw error;
  }
}

async function seedAdmin(db, env) {
  const login = String(env.ADMIN_LOGIN || "").trim();
  const email = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(env.ADMIN_PASSWORD || "");
  if (!login || !email || !password) return;
  const existing = await db.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_personal_data_revoked = 0").first();
  if (existing) return;
  const hashed = await hashPassword(password);
  await db.prepare(
    "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 0, ?)"
  ).bind(randomId(), login, email, "Teacher", hashed.salt, hashed.hash, ITERATIONS, now()).run();
}

function bytesToB64url(bytes) {
  const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < list.length; i++) bin += String.fromCharCode(list[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(text) {
  const clean = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const bin = atob(clean + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let sessionCryptoKey = null;
let sessionCryptoSecret = "";

async function sessionKey(env) {
  const secret = String(env.SESSION_SECRET || "");
  if (!secret) return null;
  if (sessionCryptoKey && sessionCryptoSecret === secret) return sessionCryptoKey;
  sessionCryptoSecret = secret;
  sessionCryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return sessionCryptoKey;
}

async function signSession(env, user) {
  const key = await sessionKey(env);
  if (!key) return "";
  const payload = {
    id: user.id,
    login: user.login,
    email: user.email,
    name: user.name || "",
    role: user.role,
    // Bind cookie to password hash so changePassword / reset invalidates other sessions.
    pwdv: String(user.password_hash || "").slice(0, 24),
    createdAt: user.created_at || user.createdAt || 0,
    exp: now() + SESSION_SECONDS
  };
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return body + "." + bytesToB64url(sig);
}

async function verifySession(env, token) {
  const cut = String(token || "").indexOf(".");
  if (cut < 1) return null;
  const body = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  const key = await sessionKey(env);
  if (!key || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sig), new TextEncoder().encode(body));
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let payload = null;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))); } catch (e) { return null; }
  if (!payload || !payload.id || !payload.exp || payload.exp <= now()) return null;
  return {
    id: payload.id,
    login: payload.login,
    email: payload.email,
    name: payload.name || "",
    role: payload.role,
    pwdv: payload.pwdv || "",
    is_personal_data_revoked: 0,
    created_at: payload.createdAt || 0
  };
}

export async function currentUser(env, request) {
  const token = readCookie(request.headers.get("Cookie"));
  const session = await verifySession(env, token);
  if (!session) return null;
  if (await sessionTokenRevoked(env, token)) return null;
  if (env.MEDIA) {
    const gone = await env.MEDIA.head("gone/" + session.id);
    if (gone) return null;
  }
  // Live role/active/password from D1 — never trust JWT alone.
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT id, login, email, name, role, password_hash, is_personal_data_revoked, active, created_at FROM users WHERE id = ?"
    ).bind(session.id).first();
    if (!row || row.is_personal_data_revoked) return null;
    if (row.active === 0) return null;
    const livePwd = String(row.password_hash || "").slice(0, 24);
    if (!session.pwdv || session.pwdv !== livePwd) return null;
    return {
      id: row.id,
      login: row.login,
      email: row.email,
      name: row.name || "",
      role: row.role,
      is_personal_data_revoked: 0,
      created_at: row.created_at || 0
    };
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column: active") < 0) throw error;
    const row = await env.DB.prepare(
      "SELECT id, login, email, name, role, password_hash, is_personal_data_revoked, created_at FROM users WHERE id = ?"
    ).bind(session.id).first();
    if (!row || row.is_personal_data_revoked) return null;
    const livePwd = String(row.password_hash || "").slice(0, 24);
    if (!session.pwdv || session.pwdv !== livePwd) return null;
    return {
      id: row.id,
      login: row.login,
      email: row.email,
      name: row.name || "",
      role: row.role,
      is_personal_data_revoked: 0,
      created_at: row.created_at || 0
    };
  }
}

function validateSignup(body) {
  const login = String(body.login || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);
  if (!LOGIN_RE.test(login)) return { error: "Login needs 3 to 32 letters, numbers, dots, dashes or underscores." };
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: "Enter a valid email." };
  if (password.length < 8 || password.length > 32) return { error: "Password needs 8 to 32 characters." };
  return { login, email, password, name };
}

function fieldClash(row, login, email, waiting) {
  if (!row) return "";
  const loginTaken = row.login === login;
  const emailTaken = String(row.email || "").toLowerCase() === email;
  if (loginTaken && emailTaken) {
    return waiting
      ? "That login and email are already waiting for approval."
      : "That login and email are already in use.";
  }
  if (loginTaken) return waiting ? "That login is already waiting for approval." : "That login is already in use.";
  if (emailTaken) return waiting ? "That email is already waiting for approval." : "That email is already in use.";
  return "";
}

async function activeConflict(db, login, email) {
  const reserved = await db.prepare("SELECT id FROM users WHERE login = ?").bind(login).first();
  if (reserved) return "That login is already in use.";
  const user = await db.prepare(
    "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND email = ?"
  ).bind(email).first();
  if (user) return "That email is already in use.";
  const pending = await db.prepare(
    "SELECT login, email FROM registrations WHERE status = 'pending' AND (login = ? OR email = ?)"
  ).bind(login, email).first();
  const pendingText = fieldClash(pending, login, email, true);
  if (pendingText) return pendingText;
  return "";
}

async function readAdded(db, userId, fallback) {
  const added = [];
  let offset = 0;
  for (;;) {
    const page = await db.prepare(
      "SELECT card FROM user_added WHERE user_id = ? ORDER BY idx LIMIT 40 OFFSET ?"
    ).bind(userId, offset).all();
    const rows = page.results || [];
    if (!rows.length) break;
    rows.forEach((row) => {
      try { added.push(JSON.parse(row.card)); }
      catch (e) { added.push(null); }
    });
    offset += rows.length;
    if (rows.length < 40) break;
  }
  const cards = added.filter(Boolean);
  return cards.length ? cards : fallback;
}

async function writeAdded(db, userId, cards) {
  const staging = userId + ":next";
  await db.prepare("DELETE FROM user_added WHERE user_id = ?").bind(staging).run();
  for (let start = 0; start < cards.length; start += 10) {
    const slice = cards.slice(start, start + 10);
    await db.batch(slice.map((card, index) => db.prepare(
      "INSERT INTO user_added (user_id, idx, card) VALUES (?, ?, ?)"
    ).bind(staging, start + index, JSON.stringify(card))));
  }
  await db.batch([
    db.prepare("DELETE FROM user_added WHERE user_id = ?").bind(userId),
    db.prepare("UPDATE user_added SET user_id = ? WHERE user_id = ?").bind(userId, staging),
  ]);
}

function accountStateKey(userId) {
  return userId + "/account-state.json";
}

async function readAccountFile(env, userId) {
  if (!env.MEDIA) return null;
  const object = await env.MEDIA.get(accountStateKey(userId));
  if (!object) return null;
  try {
    const saved = JSON.parse(await object.text());
    if (!saved || !Array.isArray(saved.added) || !Array.isArray(saved.songs)) return null;
    return {
      added: saved.added,
      songs: saved.songs,
      learned: Array.isArray(saved.learned) ? saved.learned : [],
      variants: saved.variants && typeof saved.variants === "object" && !Array.isArray(saved.variants) ? saved.variants : {},
      stats: saved.stats && typeof saved.stats === "object" && !Array.isArray(saved.stats) ? saved.stats : {}
    };
  } catch (e) {
    return null;
  }
}

async function readGone(db, userId) {
  try {
    const page = await db.prepare("SELECT card_key FROM user_card_gone WHERE user_id = ?").bind(userId).all();
    const gone = {};
    (page.results || []).forEach((row) => { if (row && row.card_key) gone[row.card_key] = 1; });
    return gone;
  } catch (e) {
    return {};
  }
}

async function readAccountFileMeta(env, userId) {
  if (!env.MEDIA) return { state: null, etag: "" };
  const object = await env.MEDIA.get(accountStateKey(userId));
  if (!object) return { state: null, etag: "" };
  try {
    const saved = JSON.parse(await object.text());
    return {
      state: {
        added: Array.isArray(saved.added) ? saved.added : [],
        songs: Array.isArray(saved.songs) ? saved.songs : [],
        learned: Array.isArray(saved.learned) ? saved.learned : [],
        variants: saved.variants && typeof saved.variants === "object" && !Array.isArray(saved.variants) ? saved.variants : {},
        stats: saved.stats && typeof saved.stats === "object" && !Array.isArray(saved.stats) ? saved.stats : {}
      },
      etag: object.httpEtag || ""
    };
  } catch (e) {
    return { state: null, etag: object.httpEtag || "" };
  }
}

async function writeAccountFile(env, userId, state, etag) {
  const payload = {
    added: Array.isArray(state.added) ? state.added : [],
    songs: Array.isArray(state.songs) ? state.songs : [],
    learned: Array.isArray(state.learned) ? state.learned : [],
    variants: state.variants && typeof state.variants === "object" && !Array.isArray(state.variants) ? state.variants : {},
    stats: state.stats && typeof state.stats === "object" && !Array.isArray(state.stats) ? state.stats : {}
  };
  if (etag !== undefined) {
    return !!(await putMediaJson(env, accountStateKey(userId), payload, etag || ""));
  }
  await env.MEDIA.put(accountStateKey(userId), JSON.stringify(payload), { httpMetadata: { contentType: "application/json" } });
  return true;
}

async function copyStateOnce(env, userId) {
  if (!env.MEDIA) return;
  if (!(await accountWritable(env, userId))) return;
  if (await readAccountFile(env, userId)) return;
  const state = await readState(env, userId);
  const songs = Array.isArray(state.songs) ? state.songs : [];
  songs.forEach((song) => {
    if (song && song.id === "mujs9fdm" && song.musicUrl === "https://open.spotify.com/track/74TFKg5p4NbTJvvnUKdqaW?autoplay_ok=1") {
      song.musicUrl = "https://open.spotify.com/track/3wT0ASQu1L9f0S32a9cD0F?autoplay_ok=1";
    }
  });
  state.songs = songs;
  // Create-if-absent only — never clobber a concurrent live write.
  await writeAccountFile(env, userId, state, "");
}

async function readState(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM user_state WHERE user_id = ?").bind(userId).first();
  const state = parseState(row);
  const added = await readAdded(env.DB, userId, state.added);
  const gone = await readGone(env.DB, userId);
  const kept = new Map();
  added.forEach((card) => {
    if (!card) return;
    const key = cardKey(card);
    if (gone[key]) return;
    kept.set(key, card);
  });
  state.added = Array.from(kept.values());
  return state;
}

async function startSession(env, user, payload, secure) {
  const token = await signSession(env, user);
  if (!token) return json({ error: "Sign-in is not configured." }, 503);
  return json(payload, 200, { "Set-Cookie": cookieHeader(token, secure) });
}

function songFileHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", "audio/mpeg");
  headers.set("accept-ranges", "bytes");
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return headers;
}

async function pairedSongKey(env, ownerLogin, ownerId, songId) {
  if (!studyTwinLogin(ownerLogin)) return "";
  const pair = await studyPair(env, ownerLogin);
  if (!pair) return "";
  const twinId = pair.self.id === ownerId ? pair.twin.id : pair.twin.id === ownerId ? pair.self.id : "";
  if (!twinId || twinId === ownerId) return "";
  return twinId + "/" + songId;
}

async function songFile(request, env) {
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const url = new URL(request.url);
  const songId = (url.searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(songId)) return json({ error: "No such file." }, 400);
  let ownerId = user.id;
  let ownerLogin = user.login || "";
  const forId = (url.searchParams.get("for") || "").trim();
  if (forId && forId !== user.id) {
    let row = null;
    try {
      row = await env.DB.prepare(
        "SELECT id, login, email, name, role, is_personal_data_revoked, active, hidden FROM users WHERE id = ?"
      ).bind(forId).first();
    } catch (error) {
      if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
      row = await env.DB.prepare(
        "SELECT id, login, email, name, role, is_personal_data_revoked FROM users WHERE id = ?"
      ).bind(forId).first();
    }
    if (!row || row.is_personal_data_revoked) return json({ error: "No such account." }, 404);
    if (row.active === 0) return json({ error: "No such account." }, 404);
    if (row.role !== "USER" && row.role !== "ADMIN") return json({ error: "No such account." }, 404);
    // Teachers get song-redacted managed state; song-file?for= stays developer-only.
    if (user.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
    if (studyTwinLogin(row.login) && !studyTwinLogin(user.login)) {
      return json({ error: "You cannot do that." }, 403);
    }
    ownerId = row.id;
    ownerLogin = row.login || "";
  }
  const key = ownerId + "/" + songId;
  const twinKey = await pairedSongKey(env, ownerLogin, ownerId, songId);
  const method = request.method;
  if (method === "HEAD") {
    const object = await env.MEDIA.head(key) || (twinKey ? await env.MEDIA.head(twinKey) : null);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = songFileHeaders(object);
    headers.set("content-length", String(object.size));
    return new Response(null, { status: 200, headers });
  }
  if (method === "GET") {
    const range = request.headers.has("Range") ? { range: request.headers } : undefined;
    const object = await env.MEDIA.get(key, range) || (twinKey ? await env.MEDIA.get(twinKey, range) : null);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = songFileHeaders(object);
    if (object.range) {
      const offset = object.range.offset == null ? Math.max(0, object.size - (object.range.suffix || 0)) : object.range.offset;
      const length = object.range.length == null ? object.size - offset : object.range.length;
      headers.set("content-length", String(length));
      headers.set("content-range", "bytes " + offset + "-" + (offset + length - 1) + "/" + object.size);
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  }
  if (method === "PUT") {
    if (pairViewOnly(user)) return json({ error: "You cannot do that." }, 403);
    if (!(await accountWritable(env, ownerId))) return json({ error: "Sign in first." }, 401);
    const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const allowed = type.indexOf("audio/") === 0 || type.indexOf("video/") === 0 || type === "application/octet-stream";
    if (!allowed) return json({ error: "Choose an audio file." }, 400);
    // Enforce size on the real body — Content-Length alone can be spoofed.
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ error: "The file is empty." }, 400);
    if (bytes.byteLength > 25000000) return json({ error: "That file is too large." }, 413);
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type || "audio/mpeg" } });
    if (twinKey) {
      const twinId = twinKey.slice(0, twinKey.lastIndexOf("/"));
      if (await accountWritable(env, twinId)) {
        await env.MEDIA.put(twinKey, bytes, { httpMetadata: { contentType: type || "audio/mpeg" } });
      }
    }
    return json({ ok: true });
  }
  if (method === "DELETE") {
    if (pairViewOnly(user)) return json({ error: "You cannot do that." }, 403);
    if (!(await accountWritable(env, ownerId))) return json({ error: "Sign in first." }, 401);
    await env.MEDIA.delete(key);
    if (twinKey) {
      const twinId = twinKey.slice(0, twinKey.lastIndexOf("/"));
      if (await accountWritable(env, twinId)) await env.MEDIA.delete(twinKey);
    }
    return json({ ok: true });
  }
  return json({ error: "Not found." }, 404);
}

async function lessonFileVisible(env, user, fileId) {
  if (canReview(user)) return true;
  const materials = await readSharedLessons(env);
  const state = await readAccountFile(env, user.id) || emptyState();
  const stats = plainObject(state.stats);
  const allowed = new Set((Array.isArray(stats.allowedLessons) ? stats.allowedLessons : []).map((id) => String(id || "").trim()).filter(Boolean));
  const personalHidden = new Set((Array.isArray(stats.hiddenLessons) ? stats.hiddenLessons : []).map((id) => String(id || "").trim()).filter(Boolean));
  for (let i = 0; i < materials.length; i++) {
    const row = materials[i];
    if (!row || !row.published) continue;
    if (personalHidden.has(row.id)) continue;
    if (row.hiddenFromStudents && !allowed.has(row.id)) continue;
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j];
      if (block && String(block.id || "") === fileId && (block.hasFile || block.name || block.sample)) return true;
    }
  }
  return false;
}

async function lessonFile(request, env) {
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const url = new URL(request.url);
  const fileId = (url.searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(fileId)) return json({ error: "No such file." }, 400);
  const key = "lessons/files/" + fileId;
  const method = request.method;
  if (method === "HEAD" || method === "GET") {
    if (!(await lessonFileVisible(env, user, fileId))) return new Response("Not found", { status: 404 });
    const range = method === "GET" && request.headers.has("Range") ? { range: request.headers } : undefined;
    const object = method === "HEAD" ? await env.MEDIA.head(key) : await env.MEDIA.get(key, range);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = songFileHeaders(object);
    if (!headers.get("content-type") || headers.get("content-type") === "audio/mpeg") {
      const type = object.httpMetadata && object.httpMetadata.contentType;
      if (type) headers.set("content-type", type);
    }
    if (method === "HEAD") {
      headers.set("content-length", String(object.size));
      return new Response(null, { status: 200, headers });
    }
    if (object.range) {
      const offset = object.range.offset == null ? Math.max(0, object.size - (object.range.suffix || 0)) : object.range.offset;
      const length = object.range.length == null ? object.size - offset : object.range.length;
      headers.set("content-length", String(length));
      headers.set("content-range", "bytes " + offset + "-" + (offset + length - 1) + "/" + object.size);
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  }
  if (method === "PUT") {
    if (!canReview(user)) return json({ error: "You cannot do that." }, 403);
    const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    const allowed = type.indexOf("image/") === 0 || type.indexOf("audio/") === 0 || type.indexOf("video/") === 0 || type === "application/pdf" || type === "application/octet-stream";
    if (!allowed) return json({ error: "Choose a lesson file." }, 400);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ error: "The file is empty." }, 400);
    if (bytes.byteLength > 25000000) return json({ error: "That file is too large." }, 413);
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type || "application/octet-stream" } });
    return json({ ok: true });
  }
  if (method === "DELETE") {
    if (!canReview(user)) return json({ error: "You cannot do that." }, 403);
    await env.MEDIA.delete(key);
    return json({ ok: true });
  }
  return json({ error: "Not found." }, 404);
}

const STAT_KINDS = { answer: 1, learned: 1, exam: 1, card: 1, song: 1 };
const STAT_RESULTS = { ok: 1, miss: 1, pass: 1, fail: 1, add: 1, archive: 1 };

function statDay(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function statMonth(ts) {
  return statDay(ts).slice(0, 7);
}

function dayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return 0;
  const parsed = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function monthsBetween(start, end) {
  const out = [];
  let year = new Date(start * 1000).getUTCFullYear();
  let month = new Date(start * 1000).getUTCMonth();
  const endYear = new Date(end * 1000).getUTCFullYear();
  const endMonth = new Date(end * 1000).getUTCMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(year + "-" + String(month + 1).padStart(2, "0"));
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return out;
}

function inStatRange(ts, start, end) {
  return ts >= start && ts < end + 86400;
}

async function readStatMonthMeta(env, month) {
  if (!env.MEDIA) return { page: { ids: {}, events: [] }, etag: "" };
  const object = await env.MEDIA.get("stats/month/" + month + ".json");
  if (!object) return { page: { ids: {}, events: [] }, etag: "" };
  try {
    const saved = JSON.parse(await object.text());
    return {
      page: {
        ids: saved && saved.ids && typeof saved.ids === "object" ? saved.ids : {},
        events: saved && Array.isArray(saved.events) ? saved.events : []
      },
      etag: object.httpEtag || ""
    };
  } catch (e) {
    return { page: { ids: {}, events: [] }, etag: object.httpEtag || "" };
  }
}

async function readStatMonth(env, month) {
  const meta = await readStatMonthMeta(env, month);
  return meta.page;
}

async function d1UserById(env, userId) {
  if (!userId) return null;
  try {
    return await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, active, hidden FROM users WHERE id = ?"
    ).bind(userId).first();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    return await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked FROM users WHERE id = ?"
    ).bind(userId).first();
  }
}

function d1RowLive(row) {
  if (!row || row.is_personal_data_revoked) return false;
  if (row.active === 0) return false;
  return true;
}

async function resolveStatTarget(env, actor, forId) {
  if (!forId || forId === actor.id) return { uid: actor.id, role: actor.role || "USER" };
  const row = await d1UserById(env, forId);
  if (!d1RowLive(row)) return { uid: actor.id, role: actor.role || "USER" };
  if (row.hidden && actor.role !== "DEVELOPER") return { uid: actor.id, role: actor.role || "USER" };
  if (actor.role === "DEVELOPER" && (row.role === "USER" || row.role === "ADMIN")) {
    return { uid: row.id, role: row.role };
  }
  if (actor.role === "ADMIN" && row.role === "USER") {
    return { uid: row.id, role: row.role };
  }
  return { uid: actor.id, role: actor.role || "USER" };
}

function cleanLyricSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 14 || n > 40) return null;
  return Math.round(n);
}

function cleanDemonstratives(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const raw = JSON.stringify(value);
    if (raw.length > 200000) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function statEventOwner(user, body, directoryUsers) {
  let uid = user.id;
  let role = user.role || "USER";
  const viewed = String(body && body.for || "");
  const target = /^[a-f0-9]{32}$/.test(viewed) ? (directoryUsers || []).find((item) => item && item.id === viewed) : null;
  if (target && !target.revoked) {
    if (user.role === "DEVELOPER" && (target.role === "USER" || target.role === "ADMIN")) {
      uid = target.id;
      role = target.role;
    } else if (user.role === "ADMIN" && target.role === "USER" && String(body && body.kind || "") !== "song") {
      uid = target.id;
      role = target.role;
    }
  }
  return { uid: uid, role: role };
}

async function saveStatEvent(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  const kind = String(body && body.kind || "");
  const result = String(body && body.result || "");
  const area = String(body && body.area || "").replace(/[^A-Za-z0-9 _./-]/g, "").slice(0, 32);
  const id = String(body && body.id || "");
  if (!STAT_KINDS[kind] || !STAT_RESULTS[result] || !/^[A-Za-z0-9]{8,40}$/.test(id)) return json({ error: "The request was not valid." }, 400);
  let uid = user.id;
  let role = user.role || "USER";
  if (user.role === "DEVELOPER" || user.role === "ADMIN") {
    const forId = String(body && body.for || "");
    if (forId && /^[a-f0-9]{32}$/.test(forId)) {
      const owner = await resolveStatTarget(env, user, forId);
      // ADMIN cannot attribute "song" events to students (directory path had the same rule).
      if (user.role === "ADMIN" && kind === "song" && owner.uid !== user.id) {
        uid = user.id;
        role = user.role;
      } else {
        uid = owner.uid;
        role = owner.role;
      }
    }
  }
  const t = now();
  const month = statMonth(t);
  const key = "stats/month/" + month + ".json";
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readStatMonthMeta(env, month);
    const page = {
      ids: Object.assign({}, meta.page.ids),
      events: meta.page.events.slice()
    };
    if (page.ids[id]) return json({ ok: true });
    if (page.events.length >= 20000) return json({ error: "Statistics for this month are full." }, 503);
    // Per-actor cap so one account cannot fill the shared month file for everyone.
    let own = 0;
    for (let i = 0; i < page.events.length; i++) {
      if (page.events[i] && page.events[i].uid === uid) own += 1;
      if (own >= 2000) return json({ error: "Too many events for this account this month." }, 429);
    }
    page.ids[id] = 1;
    page.events.push({ id: id, t: t, role: role, uid: uid, kind: kind, area: area, result: result });
    if (await putMediaJson(env, key, page, meta.etag || "")) return json({ ok: true });
  }
  return json({ error: "The change could not be saved. Try again." }, 409);
}

function countAccounts(users, start, end) {
  return users.filter((item) => inStatRange(item.createdAt, start, end)).length;
}

function countRegistrations(regs, start, end) {
  const created = regs.filter((item) => inStatRange(item.created_at || 0, start, end));
  const decided = regs.filter((item) => item.decided_at && inStatRange(item.decided_at, start, end) && (item.status === "approved" || item.status === "rejected"));
  const approved = decided.filter((item) => item.status === "approved").length;
  const rejected = decided.filter((item) => item.status === "rejected").length;
  return {
    created: created.length,
    pending: created.filter((item) => item.status === "pending").length,
    approved: approved,
    rejected: rejected,
    approvalRate: approved + rejected ? approved / (approved + rejected) : null
  };
}

function summarizeActivity(list) {
  const uids = {};
  const byArea = {};
  const cardAreas = {};
  const examFail = {};
  const summary = {
    activeUsers: 0, answers: 0, correct: 0, exams: 0, examPass: 0,
    cards: 0, songs: 0, archives: 0, learned: 0, uids: uids, byArea: byArea, cardAreas: cardAreas, examFail: examFail
  };
  list.forEach((event) => {
    if (event.uid) uids[event.uid] = 1;
    if (event.kind === "answer") {
      summary.answers += 1;
      if (event.result === "ok") summary.correct += 1;
      const area = event.area || "quiz";
      byArea[area] = (byArea[area] || 0) + 1;
    } else if (event.kind === "exam") {
      summary.exams += 1;
      if (event.result === "pass") summary.examPass += 1;
      else {
        const reason = event.area || "score";
        examFail[reason] = (examFail[reason] || 0) + 1;
      }
    } else if (event.kind === "card" && event.result === "add") {
      summary.cards += 1;
      const area = event.area || "card";
      cardAreas[area] = (cardAreas[area] || 0) + 1;
    } else if (event.kind === "song" && event.result === "add") summary.songs += 1;
    else if (event.kind === "song" && event.result === "archive") summary.archives += 1;
    else if (event.kind === "learned") summary.learned += 1;
  });
  summary.activeUsers = Object.keys(uids).length;
  return summary;
}

function statAudience(user, searchParams) {
  const requested = String(searchParams.get("user") || "");
  const role = String(searchParams.get("role") || "");
  const roleFilter = role === "USER" || role === "ADMIN" || role === "DEVELOPER" ? role : "";
  const userId = /^[a-f0-9]{32}$/.test(requested) ? requested : "";
  if (requested && !userId) return { error: "The request was not valid.", status: 400 };
  if (!user || (user.role !== "DEVELOPER" && user.role !== "ADMIN" && user.role !== "USER")) {
    return { error: "You cannot open statistics.", status: 403 };
  }
  if (user.role === "DEVELOPER") {
    if (searchParams.get("as") === "user" && userId) return { scope: "self", userId: userId, roleFilter: "" };
    return { scope: "all", userId: userId, roleFilter: roleFilter };
  }
  if (user.role === "ADMIN" && searchParams.get("as") === "user" && userId && userId !== user.id) {
    return { scope: "self", userId: userId, roleFilter: "", hideSongs: true, needsStudent: true };
  }
  if ((userId && userId !== user.id) || (roleFilter && roleFilter !== user.role)) {
    return { error: "You can only open your own statistics.", status: 403 };
  }
  return { scope: "self", userId: user.id, roleFilter: "" };
}

function eventVisible(event, audience) {
  if (!event || !event.t || !event.uid) return false;
  if (audience.hideSongs && (event.kind === "song" || event.area === "lyrics")) return false;
  if (audience.userId && event.uid !== audience.userId) return false;
  if (audience.roleFilter && event.role !== audience.roleFilter) return false;
  return true;
}

function buildByUser(events, users) {
  const buckets = {};
  events.forEach((event) => {
    if (!buckets[event.uid]) {
      buckets[event.uid] = {
        id: event.uid, login: "", role: event.role || "",
        answers: 0, correct: 0, exams: 0, examPass: 0, learned: 0, cards: 0, songs: 0, archives: 0
      };
    }
    const row = buckets[event.uid];
    if (event.role) row.role = event.role;
    if (event.kind === "answer") {
      row.answers += 1;
      if (event.result === "ok") row.correct += 1;
    } else if (event.kind === "exam") {
      row.exams += 1;
      if (event.result === "pass") row.examPass += 1;
    } else if (event.kind === "learned") row.learned += 1;
    else if (event.kind === "card" && event.result === "add") row.cards += 1;
    else if (event.kind === "song" && event.result === "add") row.songs += 1;
    else if (event.kind === "song" && event.result === "archive") row.archives += 1;
  });
  return Object.keys(buckets).map((id) => {
    const row = buckets[id];
    const person = (users || []).find((item) => item && item.id === id);
    if (person) {
      row.login = person.login || "";
      if (person.role) row.role = person.role;
    }
    return row;
  }).sort((a, b) => (b.answers - a.answers) || String(a.login).localeCompare(String(b.login)));
}

function restrictStats(data) {
  return {
    scope: "self",
    from: data.from,
    to: data.to,
    previousFrom: data.previousFrom,
    previousTo: data.previousTo,
    timezone: data.timezone,
    hideSongs: !!data.hideSongs,
    activity: data.activity
  };
}

async function statReport(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const url = new URL(request.url);
  const audience = statAudience(user, url.searchParams);
  if (audience.error) return json({ error: audience.error }, audience.status, { "Cache-Control": "no-store, private" });
  if (audience.needsStudent) {
    const student = await d1UserById(env, audience.userId);
    if (!d1RowLive(student) || student.role !== "USER" || (student.hidden && user.role !== "DEVELOPER")) {
      return json({ error: "You can only open your own statistics." }, 403, { "Cache-Control": "no-store, private" });
    }
  }
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  let to = dayStart(url.searchParams.get("to"));
  let from = dayStart(url.searchParams.get("from"));
  const today = dayStart(new Date().toISOString().slice(0, 10));
  if (!to) to = today;
  if (!from) from = to - 29 * 86400;
  if (to < from) { const swap = from; from = to; to = swap; }
  const span = Math.floor((to - from) / 86400) + 1;
  if (span > 366) return json({ error: "Pick a range of 366 days or less." }, 400);
  const previousTo = from - 86400;
  const previousFrom = previousTo - (span - 1) * 86400;
  let directoryHead = null;
  let directory = { users: [], registrations: [] };
  let accounts = { available: false };
  let registrations = { available: false };
  if (audience.scope === "all") {
    directoryHead = await env.MEDIA.head("directory/accounts.json");
    directory = directoryHead ? await readDirectory(env) : directory;
    if (directoryHead) {
      const listed = (directory.users || []).filter((item) => item && (!audience.userId || item.id === audience.userId) && (!audience.roleFilter || item.role === audience.roleFilter));
      const users = listed.filter((item) => item.createdAt);
      const listedRegs = (directory.registrations || []).filter((item) => item && (!audience.userId || item.user_id === audience.userId) && (!audience.roleFilter || (item.role || "USER") === audience.roleFilter));
      const regs = listedRegs.filter((item) => item.created_at || item.decided_at);
      const series = [];
      for (let day = from; day <= to; day += 86400) {
        const key = statDay(day);
        series.push({ day: key, count: users.filter((item) => statDay(item.createdAt) === key).length });
      }
      const byRole = { USER: 0, ADMIN: 0, DEVELOPER: 0 };
      users.forEach((item) => {
        if (inStatRange(item.createdAt, from, to) && byRole[item.role] != null) byRole[item.role] += 1;
      });
      const undatedAccounts = listed.length - users.length;
      const undatedRegistrations = listedRegs.length - regs.length;
      accounts = {
        available: true,
        created: countAccounts(users, from, to),
        previous: countAccounts(users, previousFrom, previousTo),
        byRole: byRole,
        series: series
      };
      if (undatedAccounts) accounts.undated = undatedAccounts;
      registrations = Object.assign(countRegistrations(regs, from, to), { available: true, previous: countRegistrations(regs, previousFrom, previousTo) });
      if (undatedRegistrations) registrations.undated = undatedRegistrations;
    }
  }
  const events = [];
  const months = monthsBetween(previousFrom, to);
  for (let i = 0; i < months.length; i++) {
    const page = await readStatMonth(env, months[i]);
    page.events.forEach((event) => {
      if (!eventVisible(event, audience) || !inStatRange(event.t, previousFrom, to)) return;
      events.push(event);
    });
  }
  let firstT = 0;
  events.forEach((event) => { if (!firstT || event.t < firstT) firstT = event.t; });
  const currentEvents = events.filter((event) => inStatRange(event.t, from, to));
  const previousEvents = events.filter((event) => inStatRange(event.t, previousFrom, previousTo));
  const currentAct = summarizeActivity(currentEvents);
  const previousAct = summarizeActivity(previousEvents);
  let activity = { tracked: false };
  if (events.length) {
    const series = [];
    const chartFrom = Math.max(from, dayStart(statDay(firstT)));
    for (let day = chartFrom; day <= to; day += 86400) {
      const key = statDay(day);
      const rows = currentEvents.filter((event) => event.kind === "answer" && statDay(event.t) === key);
      series.push({ day: key, answers: rows.length, correct: rows.filter((event) => event.result === "ok").length });
    }
    const answered = {};
    const correctUsers = {};
    const learnedUsers = {};
    currentEvents.forEach((event) => {
      if (!event.uid) return;
      if (event.kind === "answer") {
        answered[event.uid] = 1;
        if (event.result === "ok") correctUsers[event.uid] = 1;
      }
      if (event.kind === "learned") learnedUsers[event.uid] = 1;
    });
    let retention = null;
    if (previousAct.activeUsers) {
      let returned = 0;
      Object.keys(previousAct.uids).forEach((id) => { if (currentAct.uids[id]) returned += 1; });
      retention = { returned: returned, base: previousAct.activeUsers };
    }
    activity = {
      tracked: true,
      since: statDay(firstT),
      activeUsers: currentAct.activeUsers,
      previousActiveUsers: previousAct.activeUsers,
      answers: currentAct.answers,
      previousAnswers: previousAct.answers,
      correct: currentAct.correct,
      previousCorrect: previousAct.correct,
      exams: currentAct.exams,
      examPass: currentAct.examPass,
      previousExams: previousAct.exams,
      previousExamPass: previousAct.examPass,
      examFail: currentAct.examFail,
      cards: currentAct.cards,
      previousCards: previousAct.cards,
      cardAreas: currentAct.cardAreas,
      songs: currentAct.songs,
      previousSongs: previousAct.songs,
      archives: currentAct.archives,
      previousArchives: previousAct.archives,
      learned: currentAct.learned,
      previousLearned: previousAct.learned,
      byArea: currentAct.byArea,
      series: series,
      funnel: currentAct.answers ? {
        answered: Object.keys(answered).length,
        correct: Object.keys(correctUsers).length,
        learned: Object.keys(learnedUsers).length
      } : null,
      retention: retention
    };
  }
  const payload = {
    scope: audience.scope,
    from: statDay(from),
    to: statDay(to),
    previousFrom: statDay(previousFrom),
    previousTo: statDay(previousTo),
    timezone: "UTC",
    hideSongs: !!audience.hideSongs,
    activity: activity
  };
  if (audience.scope === "all") {
    payload.directory = !!directoryHead;
    payload.accounts = accounts;
    payload.registrations = registrations;
    payload.people = (directory.users || []).filter((item) => item && item.id).map((item) => ({
      id: item.id,
      login: item.login || "",
      role: item.role || ""
    })).sort((a, b) => String(a.login).localeCompare(String(b.login)));
    payload.byUser = buildByUser(currentEvents, directory.users || []);
  }
  return json(audience.scope === "all" ? payload : restrictStats(payload), 200, { "Cache-Control": "no-store, private" });
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = request.method;
  // All authenticated routes need D1 for live role/pwdv checks — no JWT-only fallback.
  if (!env.DB) return json({ error: "Accounts are not connected yet." }, 503);
  // Defense in depth with SameSite=Lax: reject cross-site mutating calls.
  // (Top-level Origin check also runs in fetch for song/lesson file routes.)
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    if (!sameSiteMutation(request, url)) return json({ error: "The request was not valid." }, 403);
  }
  const secure = url.protocol === "https:";
  let body = {};
  if (method === "POST" || method === "PUT") {
    const text = await request.text();
    if (text.length > 8000000) return json({ error: "That request is too large." }, 413);
    if (text) {
      try { body = JSON.parse(text); }
      catch (e) { return json({ error: "The request was not valid." }, 400); }
    }
  }
  if (method === "POST" && path === "/api/stats/event") return saveStatEvent(env, request, body);
  if (method === "GET" && path === "/api/stats") return statReport(env, request);
  if (method === "POST" && path === "/api/register") return register(env, request, body, secure);
  if (method === "POST" && path === "/api/login") return login(env, request, body, secure);
  if (method === "POST" && path === "/api/logout") return logout(env, request, secure);
  if (method === "GET" && path === "/api/me") return me(env, request);
  if (method === "GET" && path === "/api/me/account") return myAccount(env, request);
  if (method === "POST" && path === "/api/me/account") return requestAccountChange(env, request, body);
  if (method === "POST" && path === "/api/me/account/cancel") return cancelAccountChange(env, request);
  if (method === "POST" && path === "/api/me/password") return changePassword(env, request, body);
  if (method === "POST" && path === "/api/me/revoke") return revoke(env, request, secure);
  if (method === "GET" && path === "/api/me/state") return myState(env, request, ctx);
  if (method === "PUT" && path === "/api/me/state") return saveState(env, request, body, ctx);
  if (method === "GET" && path === "/api/texts") return listTexts(env, request);
  if (method === "PUT" && path === "/api/texts") return saveTexts(env, request, body);
  if (method === "GET" && path === "/api/lessons") return listLessons(env, request);
  if (method === "PUT" && path === "/api/lessons") return saveLessons(env, request, body);
  if (method === "GET" && path === "/api/link-preview") return linkPreview(env, request);
  if (method === "POST" && path === "/api/analyze") return analyzeExpressions(env, request, body);
  if (method === "POST" && path === "/api/phrase-card") return phraseCard(env, request, body);
  if (path.indexOf("/api/admin") === 0) return admin(env, request, method, path, body, ctx);
  return json({ error: "Not found." }, 404);
}

const PAIR_TEXTS_KEY = "pair/tsovak-texts.json";
const PAIR_SONGS_KEY = "pair/tsovak-songs.json";
const SHARED_LESSONS_KEY = "shared/lessons.json";

function seedSharedLessons() {
  return [];
}

function cleanLessonMaterial(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const id = String(row.id || "").trim();
  if (!id || id === "lm-demo" || id === "lm-sep7") return null;
  const blocks = Array.isArray(row.blocks) ? row.blocks : [];
  return {
    id: id.slice(0, 80),
    title: String(row.title || "").slice(0, 120),
    description: String(row.description || "").slice(0, 400),
    className: String(row.className || "").slice(0, 80),
    unit: String(row.unit || "").slice(0, 80),
    lesson: String(row.lesson || "").slice(0, 80),
    date: String(row.date || "").slice(0, 32),
    published: !!row.published,
    hiddenFromStudents: !!row.hiddenFromStudents,
    mode: row.mode === "edit" ? "edit" : "preview",
    blocks: blocks.slice(0, 400)
  };
}

async function readSharedLessonsMeta(env) {
  if (!env.MEDIA) return { list: [], etag: "" };
  const object = await env.MEDIA.get(SHARED_LESSONS_KEY);
  if (!object) return { list: [], etag: "" };
  try {
    const saved = JSON.parse(await object.text());
    const list = Array.isArray(saved) ? saved : (saved && Array.isArray(saved.materials) ? saved.materials : []);
    return { list: list.map(cleanLessonMaterial).filter(Boolean), etag: object.httpEtag || "" };
  } catch (e) {
    return { list: [], etag: object.httpEtag || "" };
  }
}

async function readSharedLessons(env) {
  const meta = await readSharedLessonsMeta(env);
  return meta.list;
}

async function writeSharedLessons(env, materials, etag) {
  const list = (Array.isArray(materials) ? materials : []).map(cleanLessonMaterial).filter(Boolean).slice(0, 200);
  try {
    if (JSON.stringify(list).length > 4000000) return null;
  } catch (e) {
    return null;
  }
  const saved = await putMediaJson(env, SHARED_LESSONS_KEY, { materials: list }, etag || "");
  return saved ? list : null;
}

async function listLessons(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const materials = await readSharedLessons(env);
  if (canReview(user)) return json({ materials: materials });
  const state = await readAccountFile(env, user.id) || emptyState();
  const stats = plainObject(state.stats);
  const allowed = new Set((Array.isArray(stats.allowedLessons) ? stats.allowedLessons : []).map((id) => String(id || "").trim()).filter(Boolean));
  const personalHidden = new Set((Array.isArray(stats.hiddenLessons) ? stats.hiddenLessons : []).map((id) => String(id || "").trim()).filter(Boolean));
  return json({
    materials: materials.filter((row) => {
      if (!row || !row.published) return false;
      if (personalHidden.has(row.id)) return false;
      if (row.hiddenFromStudents && !allowed.has(row.id)) return false;
      return true;
    }).map((row) => Object.assign({}, row, { mode: "preview" }))
  });
}

async function saveLessons(env, request, body) {
  const user = await currentUser(env, request);
  if (!canReview(user)) return json({ error: "You cannot do that." }, 403);
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  if (!body || !Array.isArray(body.materials)) return json({ error: "The request was not valid." }, 400);
  // Empty replace needs an explicit clear flag so a buggy client cannot wipe the catalog.
  if (!body.materials.length && body.clear !== true) {
    const current = await readSharedLessons(env);
    if (current.length) return json({ error: "Lesson list cannot be emptied this way." }, 400);
  }
  try {
    if (JSON.stringify(body.materials).length > 4000000) {
      return json({ error: "That lesson catalog is too large." }, 413);
    }
  } catch (e) {
    return json({ error: "The request was not valid." }, 400);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readSharedLessonsMeta(env);
    if (!body.materials.length && body.clear !== true && meta.list.length) {
      return json({ error: "Lesson list cannot be emptied this way." }, 400);
    }
    const materials = await writeSharedLessons(env, body.materials, meta.etag || "");
    if (materials) return json({ ok: true, materials: materials });
  }
  return json({ error: "The change could not be saved. Try again." }, 409);
}

function pickMeta(html, names) {
  const source = String(html || "");
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const re1 = new RegExp("<meta[^>]+(?:property|name)=[\"']" + name + "[\"'][^>]+content=[\"']([^\"']+)[\"']", "i");
    const re2 = new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']" + name + "[\"']", "i");
    const match = source.match(re1) || source.match(re2);
    if (match && match[1]) return decodeHtmlEntities(match[1].trim());
  }
  return "";
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return ""; }
    })
    .replace(/&#(\d+);/g, (_, num) => {
      try { return String.fromCodePoint(Number(num)); } catch (e) { return ""; }
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function absolutizeUrl(base, value) {
  try {
    return new URL(value, base).toString();
  } catch (e) {
    return "";
  }
}

function isPublicHttpUrl(target) {
  if (!target || (target.protocol !== "http:" && target.protocol !== "https:")) return false;
  const host = String(target.hostname || "").toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return false;
  // Block DNS-rebinding helpers and numeric/hex IP encodings.
  if (host === "localtest.me" || host.endsWith(".localtest.me") || host.endsWith(".nip.io") || host.endsWith(".sslip.io")) return false;
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return false;
  // Reject all IPv6 literals (including ::ffff:127.0.0.1 mapped forms).
  if (host.indexOf(":") >= 0) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const p = host.split(".").map(Number);
    if (p.some((n) => n > 255)) return false;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
  }
  return true;
}

async function fetchPublicPage(url, signal, hops) {
  if ((hops || 0) > 3) throw new Error("Too many redirects");
  const target = new URL(url);
  if (!isPublicHttpUrl(target)) throw new Error("Private host");
  const res = await fetch(target.toString(), {
    method: "GET",
    redirect: "manual",
    signal: signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LearnEnglishBot/1.0)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("Location");
    if (!loc) throw new Error("Bad redirect");
    return fetchPublicPage(new URL(loc, target).toString(), signal, (hops || 0) + 1);
  }
  return res;
}

async function linkPreview(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const raw = String(new URL(request.url).searchParams.get("url") || "").trim();
  let target;
  try { target = new URL(raw); } catch (e) { return json({ error: "Enter a valid link." }, 400); }
  if (!isPublicHttpUrl(target)) return json({ error: "Enter a valid link." }, 400);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetchPublicPage(target.toString(), controller.signal, 0);
    clearTimeout(timer);
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || type.indexOf("text/html") < 0) {
      return json({
        url: target.toString(),
        host: target.hostname.replace(/^www\./, ""),
        title: target.hostname.replace(/^www\./, ""),
        description: "",
        image: ""
      });
    }
    const html = (await res.text()).slice(0, 250000);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = pickMeta(html, ["og:title", "twitter:title"]) || (titleMatch && titleMatch[1] ? titleMatch[1].trim() : "") || target.hostname;
    const description = pickMeta(html, ["og:description", "twitter:description", "description"]);
    const imageRaw = pickMeta(html, ["og:image", "twitter:image", "twitter:image:src"]);
    let image = imageRaw ? absolutizeUrl(res.url || target.toString(), imageRaw) : "";
    try {
      const img = new URL(image);
      if (img.protocol !== "http:" && img.protocol !== "https:") image = "";
      else if (!isPublicHttpUrl(img)) image = "";
    } catch (e) {
      image = "";
    }
    return json({
      url: target.toString(),
      host: target.hostname.replace(/^www\./, ""),
      title: String(title || "").replace(/\s+/g, " ").trim().slice(0, 160),
      description: String(description || "").replace(/\s+/g, " ").trim().slice(0, 240),
      image: image.slice(0, 500)
    });
  } catch (e) {
    return json({
      url: target.toString(),
      host: target.hostname.replace(/^www\./, ""),
      title: target.hostname.replace(/^www\./, ""),
      description: "",
      image: ""
    });
  }
}

async function pairSongIds(env) {
  const ids = {};
  const side = await readJsonList(env, PAIR_SONGS_KEY) || [];
  side.forEach((song) => { if (song && song.id) ids[String(song.id)] = 1; });
  const shared = await readSharedStudy(env);
  (shared && shared.songs || []).forEach((song) => { if (song && song.id) ids[String(song.id)] = 1; });
  return ids;
}

async function songsForLogin(env, login, songs) {
  const list = Array.isArray(songs) ? songs : [];
  if (studyTwinLogin(login)) return list;
  const hidden = await pairSongIds(env);
  return list.filter((song) => song && !hidden[String(song.id)]);
}

async function ensurePairTexts(env) {
  const saved = await readJsonList(env, PAIR_TEXTS_KEY);
  if (Array.isArray(saved)) return saved;
  const pair = await studyPair(env, "TsovakDev");
  if (!pair) return [];
  const first = await readJsonList(env, pair.self.id + "/texts.json") || [];
  const second = await readJsonList(env, pair.twin.id + "/texts.json") || [];
  const merged = mergeTextRecords(first, second);
  const texts = merged && !merged.error ? merged : [];
  if (await writeJsonList(env, PAIR_TEXTS_KEY, texts, "")) return texts;
  const again = await readJsonList(env, PAIR_TEXTS_KEY);
  return Array.isArray(again) ? again : texts;
}

function withoutHiddenIds(list, hidden) {
  return (list || []).filter((item) => item && !hidden[String(item.id || "")]);
}

async function textsForLogin(env, login, userId) {
  const shared = await ensurePairTexts(env);
  if (studyTwinLogin(login)) return shared;
  const hidden = {};
  shared.forEach((item) => { if (item && item.id) hidden[String(item.id)] = 1; });
  const own = await readJsonList(env, userId + "/texts.json") || [];
  return withoutHiddenIds(own, hidden);
}

async function listTexts(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  return json({ texts: await textsForLogin(env, user.login, user.id) });
}

function cleanTextRecord(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const text = String(item.text || "");
  if (text.length > 2000000) return { error: "long" };
  const id = String(item.id || "").slice(0, 40);
  const title = String(item.title || "").slice(0, 160);
  if (!id || !title) return null;
  return {
    id: id,
    title: title,
    text: text,
    updatedAt: String(item.updatedAt || ""),
    analysis: item.analysis && typeof item.analysis === "object" && !Array.isArray(item.analysis) ? item.analysis : null
  };
}

function mergeTextRecords(existing, incoming) {
  const map = new Map();
  (existing || []).forEach((item) => {
    const clean = cleanTextRecord(item);
    if (clean && !clean.error) map.set(clean.id, clean);
  });
  for (const item of incoming || []) {
    const clean = cleanTextRecord(item);
    if (clean && clean.error) return { error: clean.error };
    if (!clean) continue;
    const prev = map.get(clean.id);
    if (!prev || String(clean.updatedAt || "") >= String(prev.updatedAt || "")) map.set(clean.id, clean);
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 200);
}

export { mergeTextRecords };

async function saveTextsFor(env, login, userId, body) {
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  if (!(await accountWritable(env, userId))) return json({ error: "Sign in first." }, 401);
  const incoming = Array.isArray(body && body.texts) ? body.texts : [];
  if (studyTwinLogin(login)) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await ensurePairTexts(env);
      const meta = await readJsonListMeta(env, PAIR_TEXTS_KEY);
      const merged = mergeTextRecords(meta.list || existing || [], incoming);
      if (merged && merged.error) return json({ error: "That text is too long. Limit is 2000000 characters." }, 413);
      if (await writeJsonList(env, PAIR_TEXTS_KEY, merged, meta.etag || "")) {
        return json({ ok: true, texts: merged });
      }
    }
    return json({ error: "The change could not be saved. Try again." }, 409);
  }
  const shared = await ensurePairTexts(env);
  const hidden = {};
  shared.forEach((item) => { if (item && item.id) hidden[String(item.id)] = 1; });
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readJsonListMeta(env, userId + "/texts.json");
    const existing = withoutHiddenIds(meta.list || [], hidden);
    const merged = mergeTextRecords(existing, withoutHiddenIds(incoming, hidden));
    if (merged && merged.error) return json({ error: "That text is too long. Limit is 2000000 characters." }, 413);
    if (await writeJsonList(env, userId + "/texts.json", merged, meta.etag || "")) {
      return json({ ok: true, texts: merged });
    }
  }
  return json({ error: "The change could not be saved. Try again." }, 409);
}

async function saveTexts(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (pairViewOnly(user)) return json({ error: "You cannot do that." }, 403);
  return saveTextsFor(env, user.login, user.id, body);
}

async function analyzeExpressions(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const text = String((body && body.text) || "").trim();
  if (!text) return json({ error: "Write a text first." }, 400);
  if (text.length > 100000) return json({ error: "That text is too long. Limit is 100000 characters." }, 413);
  const base = String(env.EXPRESSION_ANALYZER_URL || "").replace(/\/$/, "");
  if (!base) return json({ error: "Analysis service temporarily unavailable." }, 503);
  const timeout = analyzerTimeoutMs(env.EXPRESSION_ANALYZER_TIMEOUT);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = analyzerHeaders(env.EXPRESSION_ANALYZER_KEY);
  try {
    const response = await fetch(base + "/api/v1/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text, contentType: body.contentType || "TEXT" }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    const outcome = analyzerOutcome(response.status, payload);
    return json(outcome.body, outcome.status);
  } catch (e) {
    return json({ error: "Analysis service temporarily unavailable." }, 503);
  } finally {
    clearTimeout(timer);
  }
}

function phraseHead(canonical, exact) {
  const raw = String(canonical || "").trim();
  const head = raw.split(" + ")[0].trim();
  return head || raw || String(exact || "").trim();
}

async function phraseCard(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const type = String((body && body.type) || "");
  const word = phraseHead(body && body.canonicalForm, body && body.exactText);
  if (!word) return json({ error: "Write a text first." }, 400);
  const place = type === "PHRASAL_VERB" ? "phrasal" : type === "IDIOM" ? "idioms" : "mine";
  const canonical = String((body && body.canonicalForm) || "").trim();
  const meaning = String((body && body.meaning) || "").trim();
  const context = String((body && body.context) || "").trim();
  const fromSong = body && body.source === "song";
  let dict = null;
  if (word.length <= 80) {
    try { dict = await lookupWithThirdPerson(word, context); }
    catch (e) { dict = null; }
  }
  const known = !!(dict && dict.found);
  const usages = [];
  if (context) usages.push({ en: context, ru: "", kind: "simple", source: fromSong ? "Song" : "Text" });
  const extra = known && Array.isArray(dict.usages) ? dict.usages : [];
  extra.forEach((row) => {
    if (!row || !row.en) return;
    const line = String(row.en).trim().toLowerCase();
    if (!line || usages.some((have) => String(have.en || "").trim().toLowerCase() === line)) return;
    usages.push(row);
  });
  const data = Object.assign({}, known ? dict : {}, {
    usages: usages,
    grammar: { form: canonical || word, note: meaning }
  });
  delete data.found;
  const card = {
    word: word,
    ru: known ? (dict.ru || "") : "",
    place: place,
    expressionKey: (canonical || word).toLowerCase() + "|" + type,
    expressionType: type,
    data: data
  };
  if (!fromSong) card.fromText = true;
  return json({ card: card });
}

async function register(env, request, body, secure) {
  const db = env.DB;
  const ip = clientIp(request);
  if (env.MEDIA && (await tooManyLoginFailures(env, ip))) {
    return json({ error: "Too many attempts. Wait and try again." }, 429);
  }
  const fields = validateSignup(body);
  if (fields.error) {
    if (env.MEDIA) await noteLoginFailure(env, ip);
    return json({ error: fields.error }, 400);
  }
  const pairBlock = reservedPairLogin(fields.login, "");
  if (pairBlock) {
    if (env.MEDIA) await noteLoginFailure(env, ip);
    return json({ error: pairBlock }, 403);
  }
  const conflict = await activeConflict(db, fields.login, fields.email);
  if (conflict) {
    if (env.MEDIA) await noteLoginFailure(env, ip);
    return json({ error: conflict }, 409);
  }
  const hashed = await hashPassword(fields.password);
  const created = now();
  const liveTeacher = await db.prepare(
    "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND role IN ('ADMIN', 'DEVELOPER')"
  ).first();
  if (!liveTeacher) {
    // One-shot bootstrap: any historical teacher (even revoked) blocks a second ADMIN mint.
    const everTeacher = await db.prepare(
      "SELECT id FROM users WHERE role IN ('ADMIN', 'DEVELOPER') LIMIT 1"
    ).first();
    if (everTeacher) {
      return json({ error: "Registration is closed until a teacher restores access." }, 403);
    }
    if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
    const claimed = !!(await putMediaJson(env, "bootstrap/admin.lock", { login: fields.login, at: created }, ""));
    if (claimed) {
      const userId = randomId();
      const user = {
        id: userId,
        login: fields.login,
        email: fields.email,
        name: fields.name,
        role: "ADMIN",
        password_hash: hashed.hash,
        is_personal_data_revoked: 0,
        created_at: created
      };
      try {
        await db.prepare(
          "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 0, ?)"
        ).bind(userId, fields.login, fields.email, fields.name, hashed.salt, hashed.hash, ITERATIONS, created).run();
        const regId = randomId();
        await db.prepare(
          "INSERT INTO registrations (id, login, email, name, password_salt, password_hash, password_iterations, status, role, user_id, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 'ADMIN', ?, ?, ?)"
        ).bind(regId, fields.login, fields.email, fields.name, hashed.salt, hashed.hash, ITERATIONS, userId, created, created).run();
        await rememberUser(env, user);
        await rememberRegistration(env, { id: regId, login: fields.login, email: fields.email, name: fields.name, status: "approved", role: "ADMIN", user_id: userId, created_at: created, decided_at: created });
        return startSession(env, user, { status: "active", user: publicUser(user) }, secure);
      } catch (error) {
        // Release the create-only lock so a failed D1 insert cannot brick first-admin signup forever.
        try { await env.MEDIA.delete("bootstrap/admin.lock"); } catch (e) {}
        return json({ error: statedProblem(error) }, problemStatus(error, statedProblem(error)));
      }
    }
    return json({ error: "Registration is busy. Try again." }, 409);
  }
  const regId = randomId();
  try {
    await db.prepare(
      "INSERT INTO registrations (id, login, email, name, password_salt, password_hash, password_iterations, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
    ).bind(regId, fields.login, fields.email, fields.name, hashed.salt, hashed.hash, ITERATIONS, signupRole(body), created).run();
  } catch (error) {
    return json({ error: statedProblem(error) }, problemStatus(error, statedProblem(error)));
  }
  await rememberRegistration(env, { id: regId, login: fields.login, email: fields.email, name: fields.name, status: "pending", role: signupRole(body), user_id: "", created_at: created, decided_at: 0 });
  // Count successful pending inserts toward the IP lockout to limit registration floods.
  if (env.MEDIA) await noteLoginFailure(env, ip);
  return json({ status: "pending" });
}

async function login(env, request, body, secure) {
  const db = env.DB;
  const ip = clientIp(request);
  if (!env.MEDIA) return json({ error: "Sign-in is not configured." }, 503);
  if (await tooManyLoginFailures(env, ip)) {
    return json({ error: "Too many attempts. Wait and try again." }, 429);
  }
  const key = String(body.login || "").trim();
  const password = String(body.password || "");
  const row = await db.prepare(
    "SELECT * FROM users WHERE is_personal_data_revoked = 0 AND (login = ? OR email = ?)"
  ).bind(key, key.toLowerCase()).first();
  if (!row || !timingSafeEqual(await pbkdf2(password, row.password_salt), row.password_hash)) {
    if (!(await noteLoginFailure(env, ip))) {
      return json({ error: "Too many attempts. Wait and try again." }, 429);
    }
    // Same body for pending / deleted / wrong — avoid account-existence oracle.
    return json({ error: "Wrong login or password." }, 401);
  }
  if (row.active === 0) return json({ error: "This account is deactivated." }, 403);
  await clearLoginFailures(env, ip);
  try { await copyStateOnce(env, row.id); } catch (e) {}
  if (canReview(row)) {
    try {
      const directory = env.MEDIA && await env.MEDIA.head("directory/accounts.json");
      if (!directory) await refreshDirectory(env);
    } catch (e) {}
  }
  return startSession(env, row, { user: publicUser(row) }, secure);
}

async function logout(env, request, secure) {
  const token = readCookie(request.headers.get("Cookie"));
  if (token) {
    if (!env.MEDIA) return json({ error: "Could not sign out safely. Try again." }, 503);
    try {
      await revokeSessionToken(env, token);
    } catch (e) {
      return json({ error: "Could not sign out safely. Try again." }, 503);
    }
  }
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader("", secure) });
}

async function me(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ user: null });
  // Prefer live D1 identity over directory cache (directory can lag after profile edits).
  let live = null;
  try {
    live = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, hidden, active, created_at FROM users WHERE id = ?"
    ).bind(user.id).first();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    live = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, created_at FROM users WHERE id = ?"
    ).bind(user.id).first();
  }
  if (!live || live.is_personal_data_revoked) return json({ user: null });
  const saved = await directoryUser(env, user.id);
  const next = {
    id: live.id,
    login: live.login,
    email: live.email,
    name: live.name || "",
    role: live.role,
    is_personal_data_revoked: 0,
    hidden: !!(live.hidden != null ? live.hidden : saved && saved.hidden),
    created_at: live.created_at || 0
  };
  const same = next.login === user.login && next.email === user.email && next.name === (user.name || "");
  if (same) return json({ user: publicUser(next) });
  const secure = new URL(request.url).protocol === "https:";
  let passwordHash = "";
  try {
    const pwdRow = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
    passwordHash = pwdRow && pwdRow.password_hash || "";
  } catch (e) {}
  const token = await signSession(env, Object.assign({}, next, { password_hash: passwordHash }));
  return json({ user: publicUser(next) }, 200, token ? { "Set-Cookie": cookieHeader(token, secure) } : {});
}

async function scrubStatUid(env, userId) {
  if (!env.MEDIA || !userId) return;
  const months = [statMonth(now()), statMonth(now() - 40 * 86400)];
  const seen = {};
  for (let m = 0; m < months.length; m++) {
    const month = months[m];
    if (!month || seen[month]) continue;
    seen[month] = 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const meta = await readStatMonthMeta(env, month);
      let changed = false;
      const events = (meta.page.events || []).map((ev) => {
        if (!ev || ev.uid !== userId) return ev;
        changed = true;
        return Object.assign({}, ev, { uid: "revoked" });
      });
      if (!changed) break;
      const page = { ids: Object.assign({}, meta.page.ids), events: events };
      if (await putMediaJson(env, "stats/month/" + month + ".json", page, meta.etag || "")) break;
    }
  }
}

async function revoke(env, request, secure) {
  const db = env.DB;
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  // Wipe media (gone marker first) before DB revoke so a failed wipe can abort
  // without leaving a revoked row that still has live objects and no marker.
  try {
    await deleteAccountFiles(env, user.id);
  } catch (e) {
    const marked = await accountMediaGone(env, user.id);
    if (!marked) return json({ error: "Could not delete account files. Try again." }, 503);
  }
  const revokedAt = now();
  await db.prepare("UPDATE users SET is_personal_data_revoked = 1, revoked_at = ? WHERE id = ?").bind(revokedAt, user.id).run();
  await ignoreMissingTable(db.prepare("UPDATE account_changes SET status = 'rejected', decided_at = ? WHERE user_id = ? AND status = 'pending'").bind(revokedAt, user.id));
  await ignoreMissingTable(db.prepare("DELETE FROM user_state WHERE user_id = ?").bind(user.id));
  await ignoreMissingTable(db.prepare("DELETE FROM user_added WHERE user_id = ?").bind(user.id));
  await ignoreMissingTable(db.prepare("DELETE FROM user_card_gone WHERE user_id = ?").bind(user.id));
  const dirOk = await patchDirectory(env, (directory) => {
    directory.users.forEach((item) => {
      if (item && item.id === user.id) item.revoked = true;
    });
    directory.changes.forEach((item) => {
      if (item && item.user_id === user.id && item.status === "pending") {
        item.status = "rejected";
        item.decided_at = revokedAt;
      }
    });
  });
  if (!dirOk && env.MEDIA) {
    // Best-effort second pass — gone/ + D1 already block writes/login.
    try {
      await patchDirectory(env, (directory) => {
        directory.users.forEach((item) => {
          if (item && item.id === user.id) item.revoked = true;
        });
      });
    } catch (e) {}
  }
  try { await scrubStatUid(env, user.id); } catch (e) {}
  try { await revokeSessionToken(env, readCookie(request.headers.get("Cookie"))); } catch (e) {}
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader("", secure) });
}

export function studyTwinLogin(login) {
  if (login === "TsovakDev") return "Tsovak";
  if (login === "Tsovak") return "TsovakDev";
  return "";
}

function reservedPairLogin(login, currentLogin) {
  // Pair sharing is keyed by login name; block minting/renaming onto those names.
  if (!studyTwinLogin(login)) return "";
  if (currentLogin && currentLogin === login) return "";
  return "That login is reserved.";
}

function themesForLogin(login, ownState, twinState) {
  const pair = login === "TsovakDev" || login === "Tsovak";
  const rows = cleanCustomThemes(ownState && ownState.stats && ownState.stats.customThemes).concat(
    pair ? cleanCustomThemes(twinState && twinState.stats && twinState.stats.customThemes) : []
  );
  const seen = {};
  const out = [];
  rows.forEach((row) => {
    if (!row || seen[row.id]) return;
    const owner = row.owner || "";
    if (owner && owner !== login && owner !== studyTwinLogin(login)) return;
    seen[row.id] = 1;
    out.push(row);
  });
  return out.slice(0, 8);
}

async function withVisibleThemes(env, login, state) {
  const shown = state || emptyState();
  let twinState = null;
  if (studyTwinLogin(login)) {
    const pair = await studyPair(env, login);
    if (pair) twinState = await readAccountFile(env, pair.twin.id);
  }
  shown.stats = Object.assign({}, shown.stats, { customThemes: themesForLogin(login, shown, twinState) });
  return shown;
}

async function studyPair(env, login) {
  const twinLogin = studyTwinLogin(login);
  if (!twinLogin) return null;
  const directory = await readDirectory(env);
  let self = null;
  let twin = null;
  (directory.users || []).forEach((item) => {
    if (!item || item.revoked) return;
    if (item.login === login) self = item;
    if (item.login === twinLogin) twin = item;
  });
  if (!self || !twin || self.id === twin.id) return null;
  // Directory can lag behind revoke; refuse twin projection if either side is gone.
  if (!(await accountWritable(env, self.id)) || !(await accountWritable(env, twin.id))) return null;
  return { self: self, twin: twin };
}

const PAIR_SETTINGS_KEY = "pair/tsovak-settings.json";
const SHARED_CARD_QUIZZES_KEY = "shared/card-quizzes.json";
const SHARED_CARD_EDITS_KEY = "shared/card-edits.json";

function cardQuizStableId(word, quiz, index) {
  const copy = Object.assign({}, quiz || {});
  delete copy.id;
  const source = String(word || "") + "|" + index + "|" + JSON.stringify(copy);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return "q_" + (hash >>> 0).toString(36);
}

function plainCardQuizzes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    const word = String(key || "").toLowerCase().trim();
    if (!word || !Array.isArray(value[key])) return;
    out[word] = value[key].map((quiz, index) => {
      if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) return quiz;
      const next = Object.assign({}, quiz);
      next.id = String(next.id || cardQuizStableId(word, next, index)).slice(0, 64);
      return next;
    });
  });
  return out;
}

async function readSharedCardQuizzes(env) {
  if (!env.MEDIA) return {};
  const object = await env.MEDIA.get(SHARED_CARD_QUIZZES_KEY);
  if (!object) return {};
  try {
    return plainCardQuizzes(JSON.parse(await object.text()));
  } catch (e) {
    return {};
  }
}

async function writeSharedCardQuizzes(env, map) {
  if (!env.MEDIA) return null;
  const incoming = plainCardQuizzes(map);
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await env.MEDIA.get(SHARED_CARD_QUIZZES_KEY);
    let prev = {};
    let etag = "";
    if (object) {
      etag = object.etag || "";
      try { prev = plainCardQuizzes(JSON.parse(await object.text())); } catch (e) { prev = {}; }
    }
    // Merge by word key so a partial client map cannot wipe unrelated words.
    // Empty arrays are kept as delete tombstones.
    const next = Object.assign({}, prev, incoming);
    const saved = await putMediaJson(env, SHARED_CARD_QUIZZES_KEY, next, etag);
    if (saved) return next;
  }
  return null;
}

async function deleteSharedCardQuiz(env, word, quizId) {
  if (!env.MEDIA) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await env.MEDIA.get(SHARED_CARD_QUIZZES_KEY);
    if (!object) return {};
    let current = {};
    try { current = plainCardQuizzes(JSON.parse(await object.text())); } catch (e) { return null; }
    const list = Array.isArray(current[word]) ? current[word] : [];
    const nextList = list.filter((quiz) => String(quiz && quiz.id || "") !== quizId);
    if (nextList.length === list.length) return current;
    current[word] = nextList;
    if (await putMediaJson(env, SHARED_CARD_QUIZZES_KEY, current, object.etag || "")) return current;
  }
  return null;
}

function plainCardEdits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).slice(0, 2000).forEach((key) => {
    const id = String(key || "").trim().slice(0, 120);
    const edit = value[key];
    if (!id || !edit || typeof edit !== "object" || Array.isArray(edit)) return;
    try { if (JSON.stringify(edit).length <= 50000) out[id] = edit; } catch (e) {}
  });
  return out;
}

async function readSharedCardEdits(env) {
  if (!env.MEDIA) return {};
  const object = await env.MEDIA.get(SHARED_CARD_EDITS_KEY);
  if (!object) return {};
  try { return plainCardEdits(JSON.parse(await object.text())); } catch (e) { return {}; }
}

async function writeSharedCardEdits(env, patch) {
  if (!env.MEDIA) return null;
  const incoming = plainCardEdits(patch);
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await env.MEDIA.get(SHARED_CARD_EDITS_KEY);
    let prev = {};
    const etag = object ? (object.etag || "") : "";
    if (object) { try { prev = plainCardEdits(JSON.parse(await object.text())); } catch (e) {} }
    const next = Object.assign({}, prev, incoming);
    if (await putMediaJson(env, SHARED_CARD_EDITS_KEY, next, etag)) return next;
  }
  return null;
}

async function readPairSettings(env) {
  if (!env.MEDIA) return null;
  const object = await env.MEDIA.get(PAIR_SETTINGS_KEY);
  if (!object) return null;
  try {
    const saved = JSON.parse(await object.text());
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    return saved;
  } catch (e) {
    return null;
  }
}

function mergePairSettings(devStats, otherStats) {
  const dev = plainObject(devStats);
  const other = plainObject(otherStats);
  const seen = {};
  const customThemes = [];
  cleanCustomThemes(other.customThemes).concat(cleanCustomThemes(dev.customThemes)).forEach((row) => {
    if (!row || seen[row.id]) return;
    seen[row.id] = 1;
    customThemes.push(row);
  });
  const settings = { customThemes: customThemes };
  const theme = cleanThemeName(dev.theme) || cleanThemeName(other.theme);
  if (theme) settings.theme = theme;
  if (dev.lyricSize != null) settings.lyricSize = dev.lyricSize;
  else if (other.lyricSize != null) settings.lyricSize = other.lyricSize;
  if (dev.demonstratives != null) settings.demonstratives = dev.demonstratives;
  else if (other.demonstratives != null) settings.demonstratives = other.demonstratives;
  if (dev.dayLinks != null) settings.dayLinks = dev.dayLinks;
  else if (other.dayLinks != null) settings.dayLinks = other.dayLinks;
  const cardQuizzes = Object.assign({}, plainCardQuizzes(other.cardQuizzes), plainCardQuizzes(dev.cardQuizzes));
  if (Object.keys(cardQuizzes).length) settings.cardQuizzes = cardQuizzes;
  return settings;
}

function applyPairSettings(state, settings) {
  const stats = Object.assign({}, plainObject(state && state.stats));
  const saved = settings || {};
  if (saved.theme) stats.theme = saved.theme;
  if (Array.isArray(saved.customThemes)) stats.customThemes = saved.customThemes;
  if (saved.lyricSize != null) stats.lyricSize = saved.lyricSize;
  if (saved.demonstratives != null) stats.demonstratives = saved.demonstratives;
  if (saved.dayLinks != null) stats.dayLinks = saved.dayLinks;
  if (saved.cardQuizzes != null) stats.cardQuizzes = plainCardQuizzes(saved.cardQuizzes);
  state.stats = stats;
  return state;
}

function settingsFromStats(stats) {
  const src = plainObject(stats);
  const settings = { customThemes: cleanCustomThemes(src.customThemes) };
  const theme = cleanThemeName(src.theme);
  if (theme) settings.theme = theme;
  if (src.lyricSize != null) settings.lyricSize = src.lyricSize;
  if (src.demonstratives != null) settings.demonstratives = src.demonstratives;
  if (src.dayLinks != null) settings.dayLinks = src.dayLinks;
  if (src.cardQuizzes != null) settings.cardQuizzes = plainCardQuizzes(src.cardQuizzes);
  return settings;
}

async function writePairSettings(env, settings, etag) {
  if (!env.MEDIA) return false;
  if (etag !== undefined) {
    return !!(await putMediaJson(env, PAIR_SETTINGS_KEY, settings, etag || ""));
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const object = await env.MEDIA.get(PAIR_SETTINGS_KEY);
    const liveEtag = object ? (object.httpEtag || "") : "";
    if (await putMediaJson(env, PAIR_SETTINGS_KEY, settings, liveEtag)) return true;
  }
  return false;
}

async function projectPairSettings(env, userId, settings) {
  if (!(await accountWritable(env, userId))) return;
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readAccountFileMeta(env, userId);
    const state = meta.state || emptyState();
    const before = JSON.stringify(plainObject(state.stats));
    applyPairSettings(state, settings);
    if (JSON.stringify(plainObject(state.stats)) === before) return;
    if (await writeAccountFile(env, userId, state, meta.etag || "")) return;
  }
}

async function ensurePairSettings(env, login) {
  const pair = await studyPair(env, login);
  if (!pair) return null;
  let settings = await readPairSettings(env);
  if (!settings) {
    const dev = pair.self.login === "TsovakDev" ? pair.self : pair.twin;
    const other = dev.id === pair.self.id ? pair.twin : pair.self;
    const devState = await readAccountFile(env, dev.id) || emptyState();
    const otherState = await readAccountFile(env, other.id) || emptyState();
    settings = mergePairSettings(devState.stats, otherState.stats);
    if (!(await writePairSettings(env, settings, ""))) {
      settings = await readPairSettings(env) || settings;
    }
  }
  try {
    const shared = await readSharedCardQuizzes(env);
    if (!Object.keys(shared).length) {
      const seed = plainCardQuizzes(settings && settings.cardQuizzes);
      if (Object.keys(seed).length) await writeSharedCardQuizzes(env, seed);
    }
  } catch (e) {}
  await projectPairSettings(env, pair.self.id, settings);
  await projectPairSettings(env, pair.twin.id, settings);
  return settings;
}

function cardEditsOf(state) {
  const edits = state && state.stats && state.stats.cardEdits;
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) return {};
  return edits;
}

function cleanDayLinks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).slice(0, 40).forEach((day) => {
    const pack = value[day];
    if (!pack || typeof pack !== "object" || Array.isArray(pack)) return;
    const next = {};
    ["classwork", "homework"].forEach((kind) => {
      const list = Array.isArray(pack[kind]) ? pack[kind] : [];
      next[kind] = list.slice(0, 40).map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const title = String(item.title || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
        let href = String(item.href || "").trim().slice(0, 500);
        if (!title || !href) return null;
        try {
          if (!/^https?:\/\//i.test(href)) href = "https://" + href;
          const parsed = new URL(href);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
          href = parsed.toString();
        } catch (e) {
          return null;
        }
        return { title: title, href: href };
      }).filter(Boolean);
    });
    out[String(day).slice(0, 40)] = next;
  });
  return out;
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function cleanThemeName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9-]{1,48}$/.test(name)) return "";
  return name;
}

function cleanCustomThemes(value) {
  const colorKeys = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc"];
  const hex = /^#[0-9A-Fa-f]{6}$/;
  const wash = /^#[0-9A-Fa-f]{8}$/;
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const id = String(row.id || "").slice(0, 40);
    if (id.indexOf("user-") !== 0) return null;
    const name = String(row.name || "Picture").replace(/[\u0000-\u001f]/g, "").slice(0, 64) || "Picture";
    const src = row.vars && typeof row.vars === "object" && !Array.isArray(row.vars) ? row.vars : {};
    const vars = {};
    colorKeys.forEach((key) => {
      if (typeof src[key] === "string" && hex.test(src[key])) vars[key] = src[key];
    });
    if (typeof src["--photo-wash"] === "string" && wash.test(src["--photo-wash"])) vars["--photo-wash"] = src["--photo-wash"];
    if (src["color-scheme"] === "dark" || src["color-scheme"] === "light") vars["color-scheme"] = src["color-scheme"];
    if (!vars["--bg"] || !vars["--card"] || !vars["--acc"]) return null;
    let photo = "";
    if (typeof row.photo === "string" && row.photo.indexOf("data:image/jpeg;base64,") === 0 && row.photo.length <= 450000) photo = row.photo;
    const theme = { id, name, bg: vars["--bg"], card: vars["--card"], acc: vars["--acc"], vars, photo };
    if (typeof row.owner === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(row.owner)) theme.owner = row.owner;
    return theme;
  }).filter(Boolean);
}

function mistakesOf(state) {
  const list = state && state.stats && state.stats.mistakes;
  return Array.isArray(list) ? list : [];
}

function materialSnapshot(state) {
  return {
    added: Array.isArray(state && state.added) ? state.added : [],
    songs: Array.isArray(state && state.songs) ? state.songs : [],
    variants: plainObject(state && state.variants),
    cardEdits: cardEditsOf(state),
    learned: Array.isArray(state && state.learned) ? state.learned : [],
    mistakes: mistakesOf(state)
  };
}

function sameMaterial(state, material) {
  const current = materialSnapshot(state);
  return JSON.stringify(current) === JSON.stringify({
    added: material.added || [],
    songs: material.songs || [],
    variants: material.variants || {},
    cardEdits: material.cardEdits || {},
    learned: material.learned || [],
    mistakes: material.mistakes || []
  });
}

function mergeByKey(primary, secondary, keyOf) {
  const map = new Map();
  (secondary || []).forEach((item) => {
    const key = keyOf(item);
    if (key) map.set(key, item);
  });
  (primary || []).forEach((item) => {
    const key = keyOf(item);
    if (key) map.set(key, item);
  });
  return Array.from(map.values());
}

function mistakeKey(row) {
  return String(row && row.en || "").trim().toLowerCase() + "|" + String(row && row.type || "");
}

function unionLearned(primary, secondary) {
  const seen = {};
  const out = [];
  (secondary || []).concat(primary || []).forEach((item) => {
    const key = String(item || "").trim().toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = 1;
    out.push(item);
  });
  return out;
}

function unionStudyMaterial(primaryState, secondaryState) {
  const primary = materialSnapshot(primaryState);
  const secondary = materialSnapshot(secondaryState);
  return {
    added: mergeByKey(primary.added, secondary.added, cardKey),
    songs: mergeByKey(primary.songs, secondary.songs, (song) => song && song.id ? String(song.id) : ""),
    variants: Object.assign({}, secondary.variants, primary.variants),
    cardEdits: Object.assign({}, secondary.cardEdits, primary.cardEdits),
    learned: unionLearned(primary.learned, secondary.learned),
    mistakes: mergeByKey(primary.mistakes, secondary.mistakes, mistakeKey)
  };
}

function overlayMaterial(state, material) {
  const stats = Object.assign({}, plainObject(state && state.stats));
  stats.cardEdits = material.cardEdits || {};
  stats.mistakes = material.mistakes || [];
  return {
    added: material.added || [],
    songs: material.songs || [],
    learned: material.learned || [],
    variants: material.variants || {},
    stats: stats
  };
}

function stateFromMaterial(material) {
  return overlayMaterial(emptyState(), material);
}

const PAIR_STUDY_KEY = "pair/tsovak-study.json";

async function readSharedStudyMeta(env) {
  if (!env.MEDIA) return { material: null, etag: "" };
  const object = await env.MEDIA.get(PAIR_STUDY_KEY);
  if (!object) return { material: null, etag: "" };
  try {
    const saved = JSON.parse(await object.text());
    if (!saved || !Array.isArray(saved.added) || !Array.isArray(saved.songs)) {
      return { material: null, etag: object.httpEtag || "" };
    }
    return {
      material: {
        added: saved.added,
        songs: saved.songs,
        variants: plainObject(saved.variants),
        cardEdits: plainObject(saved.cardEdits),
        learned: Array.isArray(saved.learned) ? saved.learned : [],
        mistakes: Array.isArray(saved.mistakes) ? saved.mistakes : []
      },
      etag: object.httpEtag || ""
    };
  } catch (e) {
    return { material: null, etag: object.httpEtag || "" };
  }
}

async function readSharedStudy(env) {
  const meta = await readSharedStudyMeta(env);
  return meta.material;
}

async function writeSharedStudy(env, material, etag) {
  if (!env.MEDIA) return false;
  const payload = {
    added: material.added || [],
    songs: material.songs || [],
    variants: material.variants || {},
    cardEdits: material.cardEdits || {},
    learned: material.learned || [],
    mistakes: material.mistakes || []
  };
  if (etag !== undefined) {
    return !!(await putMediaJson(env, PAIR_STUDY_KEY, payload, etag || ""));
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readSharedStudyMeta(env);
    if (await putMediaJson(env, PAIR_STUDY_KEY, payload, meta.etag || "")) return true;
  }
  return false;
}

async function projectStudy(env, userId, material) {
  if (!(await accountWritable(env, userId))) return;
  for (let attempt = 0; attempt < 8; attempt++) {
    const meta = await readAccountFileMeta(env, userId);
    const state = meta.state || emptyState();
    if (sameMaterial(state, material)) return;
    if (await writeAccountFile(env, userId, overlayMaterial(state, material), meta.etag || "")) return;
  }
}

async function ensureSharedStudy(env, login) {
  const pair = await studyPair(env, login);
  if (!pair) return null;
  let meta = await readSharedStudyMeta(env);
  let material = meta.material;
  let created = false;
  if (!material) {
    const dev = pair.self.login === "TsovakDev" ? pair.self : pair.twin;
    const other = dev.id === pair.self.id ? pair.twin : pair.self;
    const devState = await readAccountFile(env, dev.id) || emptyState();
    const otherState = await readAccountFile(env, other.id) || emptyState();
    material = unionStudyMaterial(devState, otherState);
    if (await writeSharedStudy(env, material, "")) {
      created = true;
    } else {
      // Lost the create race — use the material another request wrote.
      meta = await readSharedStudyMeta(env);
      material = meta.material || material;
    }
  }
  await projectStudy(env, pair.self.id, material);
  await projectStudy(env, pair.twin.id, material);
  return { pair: pair, material: material, created: created };
}

function later(ctx, task) {
  const promise = Promise.resolve().then(task).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(promise);
}

async function copyMissingSong(env, fromId, toId, songId) {
  if (!env.MEDIA || !fromId || !toId || fromId === toId) return;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(songId)) return;
  if (!(await accountWritable(env, toId))) return;
  const destKey = toId + "/" + songId;
  if (await env.MEDIA.head(destKey)) return;
  const source = await env.MEDIA.get(fromId + "/" + songId);
  if (!source) return;
  await env.MEDIA.put(destKey, source.body, { httpMetadata: source.httpMetadata });
}

function copyPairSongs(env, pair, material) {
  const songs = material && Array.isArray(material.songs) ? material.songs : [];
  return Promise.all(songs.map((song) => {
    const songId = song && song.id ? String(song.id) : "";
    return Promise.all([
      copyMissingSong(env, pair.self.id, pair.twin.id, songId),
      copyMissingSong(env, pair.twin.id, pair.self.id, songId)
    ]);
  }));
}

async function myState(env, request, ctx) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (studyTwinLogin(user.login)) {
    try { await ensurePairSettings(env, user.login); } catch (e) {}
    const ready = env.MEDIA && await env.MEDIA.head("pair/tsovak-study.ready");
    if (!ready) {
      try {
        const shared = await ensureSharedStudy(env, user.login);
        if (shared && env.MEDIA) await env.MEDIA.put("pair/tsovak-study.ready", "1", { httpMetadata: { contentType: "text/plain" } });
      } catch (e) {}
    }
  }
  const state = await readAccountFile(env, user.id) || emptyState();
  const shown = await withSidecars(env, user.login, user.id, state);
  if (studyTwinLogin(user.login)) {
    const settings = await readPairSettings(env);
    if (settings) applyPairSettings(shown, settings);
  }
  try {
    const sharedQuizzes = await readSharedCardQuizzes(env);
    const sharedEdits = await readSharedCardEdits(env);
    const stats = Object.assign({}, plainObject(shown.stats));
    stats.cardQuizzes = sharedQuizzes;
    stats.cardEdits = sharedEdits;
    shown.stats = stats;
  } catch (e) {}
  shown.songs = await songsForLogin(env, user.login, shown.songs);
  return json(await withVisibleThemes(env, user.login, shown));
}

function asArray(value) {
  return Array.isArray(value) ? value : null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cardKey(card) {
  return (card && (card.place || "mine")) + "|" + String(card && card.word || "").trim().toLowerCase();
}

function requestCardKey(place, word) {
  return (place || "mine") + "|" + String(word || "").trim().toLowerCase();
}

async function readJsonColumn(db, userId, column, fallback) {
  const row = await db.prepare("SELECT " + column + " AS value FROM user_state WHERE user_id = ?").bind(userId).first();
  try {
    const value = JSON.parse(row && row.value != null ? row.value : "");
    if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch (e) {}
  return fallback;
}

function studyMaterialOp(op) {
  return op === "delete-card" || op === "put-card" || op === "put-song" || op === "put-variant" || op === "put-edit" || op === "put-mistake" || op === "delete-mistake";
}

function applyStateOp(state, body) {
  const op = body && body.op;
  if (op === "delete-card") {
    const word = String(body.word || "").trim();
    if (!word) return json({ error: "The request was not valid." }, 400);
    const key = requestCardKey(body.place, word);
    state.added = state.added.filter((card) => cardKey(card) !== key);
    return null;
  }
  if (op === "put-card") {
    const card = body.card;
    if (!card || typeof card !== "object" || Array.isArray(card) || !String(card.word || "").trim()) return json({ error: "The request was not valid." }, 400);
    const next = Object.assign({}, card);
    delete next.blob;
    const drop = body.replaceWord && requestCardKey(body.replacePlace, body.replaceWord) !== cardKey(next)
      ? requestCardKey(body.replacePlace || next.place, body.replaceWord)
      : "";
    const keep = cardKey(next);
    state.added = state.added.filter((item) => {
      const key = cardKey(item);
      return key !== keep && key !== drop;
    });
    state.added.push(next);
    if (state.added.length > 5000) state.added = state.added.slice(-5000);
    return null;
  }
  if (op === "put-song") {
    const song = body.song;
    if (!song || typeof song !== "object" || Array.isArray(song) || !song.id) return json({ error: "The request was not valid." }, 400);
    const copy = Object.assign({}, song);
    delete copy.blob;
    const index = state.songs.findIndex((item) => item && item.id === copy.id);
    if (index >= 0) state.songs[index] = copy;
    else state.songs.push(copy);
    if (state.songs.length > 500) state.songs = state.songs.slice(-500);
    return null;
  }
  if (op === "put-variant") {
    if (!body.word || !Array.isArray(body.lines)) return json({ error: "The request was not valid." }, 400);
    const word = String(body.word).slice(0, 120);
    if (!word) return json({ error: "The request was not valid." }, 400);
    try {
      if (JSON.stringify(body.lines).length > 100000) return json({ error: "The request was not valid." }, 400);
    } catch (e) {
      return json({ error: "The request was not valid." }, 400);
    }
    state.variants[word] = body.lines.slice(0, 200);
    const keys = Object.keys(state.variants);
    if (keys.length > 2000) {
      keys.slice(0, keys.length - 2000).forEach((key) => { delete state.variants[key]; });
    }
    return null;
  }
  if (op === "put-edit" || op === "put-mistake" || op === "delete-mistake" || op === "put-setting") {
    const stats = state.stats;
    if (op === "put-edit") {
      if (!body.id || !body.edit || typeof body.edit !== "object" || Array.isArray(body.edit)) return json({ error: "The request was not valid." }, 400);
      try {
        if (JSON.stringify(body.edit).length > 50000) return json({ error: "The request was not valid." }, 400);
      } catch (e) {
        return json({ error: "The request was not valid." }, 400);
      }
      const edits = plainObject(stats.cardEdits);
      const id = String(body.id).slice(0, 120);
      edits[id] = body.edit;
      const keys = Object.keys(edits);
      if (keys.length > 2000) {
        keys.slice(0, keys.length - 2000).forEach((key) => { delete edits[key]; });
      }
      stats.cardEdits = edits;
      return null;
    }
    if (op === "put-mistake" || op === "delete-mistake") {
      const en = op === "put-mistake" ? body.mistake && body.mistake.en : body.en;
      const type = op === "put-mistake" ? body.mistake && body.mistake.type : body.type;
      if (!en || !type) return json({ error: "The request was not valid." }, 400);
      const enClean = String(en).slice(0, 120);
      const typeClean = String(type).slice(0, 40);
      let mistakes = Array.isArray(stats.mistakes) ? stats.mistakes : [];
      mistakes = mistakes.filter((item) => !(item && item.en === enClean && item.type === typeClean));
      if (op === "put-mistake" && body.mistake && body.mistake.misses > 0) {
        mistakes.push({
          en: enClean,
          type: typeClean,
          misses: Math.min(999, Math.max(1, Number(body.mistake.misses) || 1)),
          streak: Math.min(99, Math.max(0, Number(body.mistake.streak) || 0))
        });
      }
      stats.mistakes = mistakes.slice(-500);
      return null;
    }
    if (body.key === "lyricSize") {
      const size = cleanLyricSize(body.value);
      if (size == null) return json({ error: "The request was not valid." }, 400);
      stats.lyricSize = size;
    }
    else if (body.key === "demonstratives") {
      if (body.value == null) {
        stats.demonstratives = null;
      } else {
        const demo = cleanDemonstratives(body.value);
        if (demo == null) return json({ error: "The request was not valid." }, 400);
        stats.demonstratives = demo;
      }
    }
    else if (body.key === "dayLinks") stats.dayLinks = cleanDayLinks(body.value);
    else if (body.key === "cardQuizzes") stats.cardQuizzes = plainCardQuizzes(body.value);
    else if (body.key === "customThemes") stats.customThemes = cleanCustomThemes(body.value);
    else if (body.key === "theme") {
      const theme = cleanThemeName(body.value);
      if (!theme) return json({ error: "The request was not valid." }, 400);
      stats.theme = theme;
    }
    else if (body.key === "hiddenLessons") {
      const list = Array.isArray(body.value) ? body.value : [];
      stats.hiddenLessons = list.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 200);
    }
    else if (body.key === "allowedLessons") {
      const list = Array.isArray(body.value) ? body.value : [];
      stats.allowedLessons = list.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 200);
    }
    else return json({ error: "The request was not valid." }, 400);
    return null;
  }
  return json({ error: "The request was not valid." }, 400);
}

function pairViewOnly(user) {
  return !!(user && user.login === "Tsovak");
}

function pairBlockedOp(body) {
  const op = body && body.op;
  if (op === "put-edit" || op === "put-card" || op === "delete-card" || op === "put-song" || op === "put-variant" || op === "put-text-card") return true;
  if (op === "put-mistake" || op === "delete-mistake") return true;
  // Shared pair settings (theme, dayLinks, quizzes, …) are Dev-only; personal hide list stays allowed.
  if (op === "put-setting" && body.key !== "hiddenLessons") return true;
  return false;
}

async function saveState(env, request, body, ctx) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const sharedTeacherChange = user && (user.role === "ADMIN" || user.role === "DEVELOPER") && body && (
    body.op === "put-edit" ||
    body.op === "delete-card-quiz" ||
    (body.op === "put-setting" && body.key === "cardQuizzes")
  );
  if (pairViewOnly(user) && pairBlockedOp(body) && !sharedTeacherChange) {
    return json({ error: "You cannot do that." }, 403);
  }
  if (body && body.op === "put-setting" && body.key === "cardQuizzes") {
    if (user.role !== "ADMIN" && user.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  }
  if (body && body.op === "put-edit") {
    if (user.role !== "ADMIN" && user.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  }
  if (body && body.op === "delete-card-quiz") {
    if (user.role !== "ADMIN" && user.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  }
  // Students cannot self-grant access to hidden teacher lessons.
  if (body && body.op === "put-setting" && body.key === "allowedLessons") {
    if (user.role !== "ADMIN" && user.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  }
  return writeStateOp(env, user.id, body, studyTwinLogin(user.login), ctx);
}

async function readJsonListMeta(env, key) {
  if (!env.MEDIA || !key) return { list: null, etag: "" };
  const object = await env.MEDIA.get(key);
  if (!object) return { list: null, etag: "" };
  try {
    const saved = JSON.parse(await object.text());
    if (Array.isArray(saved)) return { list: saved, etag: object.httpEtag || "" };
    if (saved && Array.isArray(saved.songs)) return { list: saved.songs, etag: object.httpEtag || "" };
    if (saved && Array.isArray(saved.added)) return { list: saved.added, etag: object.httpEtag || "" };
  } catch (e) {}
  return { list: null, etag: object.httpEtag || "" };
}

async function readJsonList(env, key) {
  const meta = await readJsonListMeta(env, key);
  return meta.list;
}

async function writeJsonList(env, key, list, etag) {
  if (etag !== undefined) {
    return !!(await putMediaJson(env, key, list, etag || ""));
  }
  await env.MEDIA.put(key, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
  return true;
}

function mergeSongLists(base, extra) {
  const map = new Map();
  (base || []).forEach((song) => {
    const id = song && song.id ? String(song.id) : "";
    if (id) map.set(id, song);
  });
  (extra || []).forEach((song) => {
    const id = song && song.id ? String(song.id) : "";
    if (id) map.set(id, song);
  });
  return Array.from(map.values());
}

function upsertCards(list, cards) {
  const next = Array.isArray(list) ? list.slice() : [];
  (cards || []).forEach((card) => {
    if (!card || typeof card !== "object" || Array.isArray(card) || !String(card.word || "").trim()) return;
    const copy = Object.assign({}, card);
    delete copy.blob;
    const key = cardKey(copy);
    const index = next.findIndex((item) => cardKey(item) === key);
    if (index >= 0) next[index] = copy;
    else next.push(copy);
  });
  return next.length > 5000 ? next.slice(-5000) : next;
}

async function saveSongSidecar(env, songsKey, cardsKey, body) {
  const song = body && body.song;
  if (!song || typeof song !== "object" || Array.isArray(song) || !song.id) return json({ error: "The request was not valid." }, 400);
  const copy = Object.assign({}, song);
  delete copy.blob;
  for (let attempt = 0; attempt < 8; attempt++) {
    const songsMeta = await readJsonListMeta(env, songsKey);
    const songs = Array.isArray(songsMeta.list) ? songsMeta.list.slice() : [];
    const index = songs.findIndex((item) => item && item.id === copy.id);
    if (index >= 0) songs[index] = copy;
    else songs.push(copy);
    const trimmed = songs.length > 500 ? songs.slice(-500) : songs;
    if (!(await writeJsonList(env, songsKey, trimmed, songsMeta.etag || ""))) continue;
    const cards = Array.isArray(body.cards) ? body.cards : [];
    if (cards.length) {
      for (let cardAttempt = 0; cardAttempt < 8; cardAttempt++) {
        const cardsMeta = await readJsonListMeta(env, cardsKey);
        const have = Array.isArray(cardsMeta.list) ? cardsMeta.list : [];
        if (await writeJsonList(env, cardsKey, upsertCards(have, cards), cardsMeta.etag || "")) break;
      }
    }
    return json({ ok: true });
  }
  return json({ error: "The change could not be saved. Try again." }, 409);
}

async function withSidecars(env, login, userId, state) {
  const saved = state || emptyState();
  const pair = !!studyTwinLogin(login);
  const songsKey = pair ? PAIR_SONGS_KEY : (userId + "/songs.json");
  const cardsKey = pair ? "pair/tsovak-added.json" : (userId + "/added.json");
  const songs = await readJsonList(env, songsKey);
  const cards = await readJsonList(env, cardsKey);
  if (songs && songs.length) saved.songs = mergeSongLists(saved.songs, songs);
  if (cards && cards.length) saved.added = mergeByKey(cards, saved.added, cardKey);
  return saved;
}

async function accountMediaGone(env, userId) {
  if (!env.MEDIA || !userId) return true;
  try {
    return !!(await env.MEDIA.head("gone/" + userId));
  } catch (e) {
    return true;
  }
}

async function accountWritable(env, userId) {
  if (!userId) return false;
  if (await accountMediaGone(env, userId)) return false;
  try {
    const row = await env.DB.prepare("SELECT is_personal_data_revoked FROM users WHERE id = ?").bind(userId).first();
    if (!row || row.is_personal_data_revoked) return false;
  } catch (e) {
    return false;
  }
  return true;
}

async function writeStateOp(env, userId, body, pairLogin, ctx) {
  if (!env.MEDIA) return json({ error: "Files are not connected yet." }, 503);
  const op = body && body.op;
  if (!op) return json({ error: "The request was not valid." }, 400);
  // Block resurrection after revoke: gone marker or revoked row.
  if (!(await accountWritable(env, userId))) return json({ error: "Sign in first." }, 401);
  try {
    if (op === "put-edit") {
      const id = String(body.id || "").trim().slice(0, 120);
      const edits = plainCardEdits(id ? { [id]: body.edit } : {});
      if (!id || !edits[id]) return json({ error: "The request was not valid." }, 400);
      if (!(await writeSharedCardEdits(env, edits))) return json({ error: "The change could not be saved. Try again." }, 409);
      return json({ ok: true });
    }
    if (op === "put-setting" && body.key === "cardQuizzes") {
      const shared = await writeSharedCardQuizzes(env, body.value);
      if (!shared) return json({ error: "The change could not be saved. Try again." }, 409);
      return json({ ok: true });
    }
    if (op === "delete-card-quiz") {
      const word = String(body.word || "").toLowerCase().trim().slice(0, 120);
      const quizId = String(body.quizId || "").trim().slice(0, 64);
      if (!word || !/^q_[a-z0-9_-]+$/i.test(quizId)) return json({ error: "The request was not valid." }, 400);
      if (!(await deleteSharedCardQuiz(env, word, quizId))) return json({ error: "The change could not be saved. Try again." }, 409);
      return json({ ok: true });
    }
    if (op === "put-text-card") {
      const pair = !!pairLogin;
      const key = pair ? "pair/tsovak-added.json" : (userId + "/added.json");
      for (let attempt = 0; attempt < 8; attempt++) {
        const meta = await readJsonListMeta(env, key);
        const have = Array.isArray(meta.list) ? meta.list : [];
        if (await writeJsonList(env, key, upsertCards(have, [body.card]), meta.etag || "")) {
          return json({ ok: true });
        }
      }
      return json({ error: "The change could not be saved. Try again." }, 409);
    }
    if (op === "put-song") {
      const pair = !!pairLogin;
      const songId = body && body.song && body.song.id ? String(body.song.id) : "";
      if (!pair && songId && (await pairSongIds(env))[songId]) return json({ error: "You cannot do that." }, 403);
      return saveSongSidecar(
        env,
        pair ? PAIR_SONGS_KEY : (userId + "/songs.json"),
        pair ? "pair/tsovak-added.json" : (userId + "/added.json"),
        body
      );
    }
    if (pairLogin && op === "put-setting" && body.key !== "allowedLessons" && body.key !== "hiddenLessons" && body.key !== "cardQuizzes") {
      const pair = await studyPair(env, pairLogin);
      if (pair) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const object = env.MEDIA ? await env.MEDIA.get(PAIR_SETTINGS_KEY) : null;
          let settings = {};
          let etag = "";
          if (object) {
            etag = object.httpEtag || "";
            try {
              const saved = JSON.parse(await object.text());
              if (saved && typeof saved === "object" && !Array.isArray(saved)) settings = saved;
            } catch (e) {}
          }
          const scratch = emptyState();
          applyPairSettings(scratch, settings);
          const rejected = applyStateOp(scratch, body);
          if (rejected) return rejected;
          const next = settingsFromStats(scratch.stats);
          try {
            next.cardQuizzes = await readSharedCardQuizzes(env);
          } catch (e) {}
          if (!(await writePairSettings(env, next, etag))) continue;
          await projectPairSettings(env, pair.self.id, next);
          await projectPairSettings(env, pair.twin.id, next);
          return json({ ok: true });
        }
        return json({ error: "The change could not be saved. Try again." }, 409);
      }
    }
    if (pairLogin && studyMaterialOp(op)) {
      const pair = await studyPair(env, pairLogin);
      if (!pair) return json({ error: "The change could not be saved." }, 500);
      for (let attempt = 0; attempt < 8; attempt++) {
        let meta = await readSharedStudyMeta(env);
        if (!meta.material) {
          const ensured = await ensureSharedStudy(env, pairLogin);
          if (!ensured || !ensured.material) return json({ error: "The change could not be saved." }, 500);
          meta = await readSharedStudyMeta(env);
          if (!meta.material) meta = { material: ensured.material, etag: "" };
        }
        const state = stateFromMaterial(meta.material);
        const rejected = applyStateOp(state, body);
        if (rejected) return rejected;
        const material = materialSnapshot(state);
        if (!(await writeSharedStudy(env, material, meta.etag || ""))) continue;
        await projectStudy(env, pair.self.id, material);
        await projectStudy(env, pair.twin.id, material);
        return json({ ok: true });
      }
      return json({ error: "The change could not be saved. Try again." }, 409);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const meta = await readAccountFileMeta(env, userId);
      const state = meta.state || emptyState();
      const rejected = applyStateOp(state, body);
      if (rejected) return rejected;
      if (await writeAccountFile(env, userId, state, meta.etag || "")) return json({ ok: true });
    }
    return json({ error: "The change could not be saved. Try again." }, 409);
  } catch (e) {
    return json({ error: "The change could not be saved." }, 500);
  }
}

function registrationPublic(row) {
  return {
    id: row.id,
    login: row.login,
    email: row.email,
    name: row.name || "",
    status: row.status,
    role: row.role || "USER",
    user_id: row.user_id || "",
    created_at: row.created_at,
    decided_at: row.decided_at || 0
  };
}

function changePublic(row) {
  return {
    id: row.id,
    user_id: row.user_id || "",
    login: row.login,
    email: row.email,
    name: row.name || "",
    from_login: row.from_login || "",
    from_email: row.from_email || "",
    from_name: row.from_name || "",
    role: row.role || "USER",
    status: row.status,
    created_at: row.created_at,
    decided_at: row.decided_at || 0
  };
}

function directoryData(saved) {
  const data = saved || {};
  return {
    users: Array.isArray(data.users) ? data.users : [],
    registrations: Array.isArray(data.registrations) ? data.registrations : [],
    changes: Array.isArray(data.changes) ? data.changes : []
  };
}

async function readDirectory(env) {
  if (!env.MEDIA) return directoryData();
  const object = await env.MEDIA.get("directory/accounts.json");
  if (!object) return directoryData();
  try {
    return directoryData(JSON.parse(await object.text()));
  } catch (e) {
    return directoryData();
  }
}

async function writeDirectory(env, directory) {
  if (!env.MEDIA) return false;
  const data = directoryData(directory);
  // Create-if-absent only — never blind-overwrite a live directory (patchDirectory owns updates).
  return !!(await putMediaJson(env, "directory/accounts.json", data, ""));
}

async function patchDirectory(env, change) {
  if (!env.MEDIA) return false;
  for (let attempt = 0; attempt < 8; attempt++) {
    let object = await env.MEDIA.get("directory/accounts.json");
    if (!object) {
      await refreshDirectory(env);
      object = await env.MEDIA.get("directory/accounts.json");
      if (!object) return false;
    }
    let directory;
    try {
      directory = directoryData(JSON.parse(await object.text()));
    } catch (e) {
      await refreshDirectory(env);
      continue;
    }
    const etag = object.httpEtag || "";
    change(directory);
    const saved = await putMediaJson(env, "directory/accounts.json", directoryData(directory), etag);
    if (saved) return true;
  }
  return false;
}

async function refreshDirectory(env) {
  let users;
  try {
    users = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, hidden, active, created_at FROM users ORDER BY created_at DESC"
    ).all();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    users = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, hidden, created_at FROM users ORDER BY created_at DESC"
    ).all();
  }
  const regs = await env.DB.prepare(
    "SELECT id, login, email, name, status, role, user_id, created_at, decided_at FROM registrations ORDER BY created_at DESC"
  ).all();
  let changeRows = [];
  try {
    const changes = await env.DB.prepare(
      "SELECT id, user_id, login, email, name, from_login, from_email, from_name, role, status, created_at, decided_at FROM account_changes ORDER BY created_at DESC"
    ).all();
    changeRows = (changes.results || []).map(changePublic);
  } catch (e) {
    changeRows = [];
  }
  const directory = {
    users: (users.results || []).map(publicUser),
    registrations: (regs.results || []).map(registrationPublic),
    changes: changeRows
  };
  if (!env.MEDIA) return directory;
  const existing = await env.MEDIA.head("directory/accounts.json");
  if (existing) return readDirectory(env);
  await writeDirectory(env, directory);
  return directory;
}

async function directoryUser(env, userId) {
  const directory = await readDirectory(env);
  for (let i = 0; i < directory.users.length; i++) {
    if (directory.users[i] && directory.users[i].id === userId) return directory.users[i];
  }
  return null;
}

async function rememberUser(env, row) {
  const next = publicUser(row);
  await patchDirectory(env, (directory) => {
    const index = directory.users.findIndex((item) => item && item.id === next.id);
    if (index >= 0) directory.users[index] = next;
    else directory.users.unshift(next);
  });
}

async function rememberRegistration(env, row) {
  const next = registrationPublic(row);
  await patchDirectory(env, (directory) => {
    const index = directory.registrations.findIndex((item) => item && item.id === next.id);
    if (index >= 0) directory.registrations[index] = next;
    else directory.registrations.unshift(next);
  });
}

async function rememberChange(env, row) {
  const next = changePublic(row);
  await patchDirectory(env, (directory) => {
    const index = directory.changes.findIndex((item) => item && item.id === next.id);
    if (index >= 0) directory.changes[index] = next;
    else directory.changes.unshift(next);
  });
}

async function ensureChangeTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS account_changes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', from_login TEXT NOT NULL, from_email TEXT NOT NULL, from_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'USER', status TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER)"
  ).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS account_changes_user_pending ON account_changes(user_id) WHERE status = 'pending'").run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS account_changes_login_pending ON account_changes(login) WHERE status = 'pending'").run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS account_changes_email_pending ON account_changes(email) WHERE status = 'pending'").run();
}

function userCreated(item) {
  return item && (item.createdAt || item.created_at || 0);
}

function userIsActive(item) {
  return !item || item.active === undefined || item.active === null || !!item.active;
}

function soleFirstTeacher(users, userId) {
  const active = (users || []).filter((item) => item && item.role === "ADMIN" && !item.revoked && !item.hidden && userIsActive(item));
  if (active.length !== 1) return false;
  const first = active.slice().sort((a, b) => userCreated(a) - userCreated(b) || String(a.id).localeCompare(String(b.id)))[0];
  return !!(first && first.id === userId);
}

function accountDetails(body) {
  const login = String(body && body.login || "").trim();
  const email = String(body && body.email || "").trim().toLowerCase();
  const name = String(body && body.name || "").trim().slice(0, 80);
  if (!LOGIN_RE.test(login)) return { error: "Login needs 3 to 32 letters, numbers, dots, dashes or underscores." };
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: "Enter a valid email." };
  return { login: login, email: email, name: name };
}

async function accountClash(env, userId, login, email, changeId) {
  const reserved = await env.DB.prepare("SELECT id FROM users WHERE login = ? AND id != ?").bind(login, userId).first();
  if (reserved) return "That login is already in use.";
  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND id != ? AND email = ?"
  ).bind(userId, email).first();
  if (user) return "That email is already in use.";
  const pending = await env.DB.prepare(
    "SELECT login, email FROM registrations WHERE status = 'pending' AND (login = ? OR email = ?)"
  ).bind(login, email).first();
  const pendingText = fieldClash(pending, login, email, true);
  if (pendingText) return pendingText;
  const other = await env.DB.prepare(
    "SELECT login, email FROM account_changes WHERE status = 'pending' AND id != ? AND (login = ? OR email = ?)"
  ).bind(changeId || "", login, email).first();
  const otherText = fieldClash(other, login, email, true);
  if (otherText) return otherText;
  return "";
}

async function changePassword(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const current = String(body && body.current || "");
  const next = String(body && body.password || "");
  if (next.length < 8 || next.length > 32) return json({ error: "Password needs 8 to 32 characters." }, 400);
  const row = await env.DB.prepare(
    "SELECT id, password_salt, password_hash, is_personal_data_revoked FROM users WHERE id = ?"
  ).bind(user.id).first();
  if (!row || row.is_personal_data_revoked) return json({ error: "Sign in first." }, 401);
  if (!timingSafeEqual(await pbkdf2(current, row.password_salt), row.password_hash)) {
    return json({ error: "Wrong password." }, 401);
  }
  const hashed = await hashPassword(next);
  await env.DB.prepare(
    "UPDATE users SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ?"
  ).bind(hashed.salt, hashed.hash, ITERATIONS, user.id).run();
  const fresh = await env.DB.prepare(
    "SELECT id, login, email, name, role, password_hash, is_personal_data_revoked, created_at FROM users WHERE id = ?"
  ).bind(user.id).first();
  if (!fresh) return json({ ok: true });
  // Drop the pre-change cookie; new pwdv also kills other devices.
  try { await revokeSessionToken(env, readCookie(request.headers.get("Cookie"))); } catch (e) {}
  // Re-issue cookie so this browser stays signed in; other sessions die via pwdv mismatch.
  return startSession(env, fresh, { ok: true, user: publicUser(fresh) }, new URL(request.url).protocol === "https:");
}

async function myAccount(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const directory = await readDirectory(env);
  const saved = directory.users.find((item) => item && item.id === user.id);
  const person = saved || { id: user.id, login: user.login, email: user.email, name: user.name || "" };
  const change = directory.changes.find((item) => item && item.user_id === user.id && item.status === "pending") || null;
  return json({
    user: { id: person.id, login: person.login, email: person.email, name: person.name || "" },
    change: change,
    locked: soleFirstTeacher(directory.users, user.id)
  });
}

async function requestAccountChange(env, request, body) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const fields = accountDetails(body);
  if (fields.error) return json({ error: fields.error }, 400);
  const directory = await readDirectory(env);
  if (soleFirstTeacher(directory.users, user.id)) {
    return json({ error: "You can change these details after a second active teacher joins." }, 403);
  }
  const saved = directory.users.find((item) => item && item.id === user.id);
  const current = {
    login: saved && saved.login || user.login,
    email: saved && saved.email || user.email,
    name: saved && saved.name || user.name || ""
  };
  if (fields.login === current.login && fields.email === current.email && fields.name === current.name) {
    return json({ error: "These details already match the account." }, 400);
  }
  const pairBlock = reservedPairLogin(fields.login, current.login);
  if (pairBlock) return json({ error: pairBlock }, 403);
  await ensureChangeTable(env);
  const existing = await env.DB.prepare(
    "SELECT id, created_at FROM account_changes WHERE user_id = ? AND status = 'pending'"
  ).bind(user.id).first();
  const clash = await accountClash(env, user.id, fields.login, fields.email, existing && existing.id);
  if (clash) return json({ error: clash }, 409);
  const id = existing ? existing.id : randomId();
  const created = existing ? existing.created_at : now();
  const row = {
    id: id,
    user_id: user.id,
    login: fields.login,
    email: fields.email,
    name: fields.name,
    from_login: current.login,
    from_email: current.email,
    from_name: current.name,
    role: user.role,
    status: "pending",
    created_at: created,
    decided_at: 0
  };
  if (existing) {
    await env.DB.prepare(
      "UPDATE account_changes SET login = ?, email = ?, name = ?, from_login = ?, from_email = ?, from_name = ?, role = ? WHERE id = ? AND status = 'pending'"
    ).bind(fields.login, fields.email, fields.name, current.login, current.email, current.name, user.role, id).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO account_changes (id, user_id, login, email, name, from_login, from_email, from_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
    ).bind(id, user.id, fields.login, fields.email, fields.name, current.login, current.email, current.name, user.role, created).run();
  }
  await rememberChange(env, row);
  return json({ change: changePublic(row) });
}

async function cancelAccountChange(env, request) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const directory = await readDirectory(env);
  const pending = directory.changes.find((item) => item && item.user_id === user.id && item.status === "pending");
  if (!pending) return json({ error: "This request is no longer waiting." }, 409);
  await ensureChangeTable(env);
  const decided = now();
  await env.DB.prepare(
    "UPDATE account_changes SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(decided, pending.id).run();
  await rememberChange(env, Object.assign({}, pending, { status: "rejected", decided_at: decided }));
  return json({ ok: true });
}

async function decideChange(env, actor, changeId, action) {
  if (!actor || (actor.role !== "DEVELOPER" && actor.role !== "ADMIN")) return json({ error: "You cannot do that." }, 403);
  if (action !== "approve" && action !== "reject") return json({ error: "Not found." }, 404);
  await ensureChangeTable(env);
  const change = await env.DB.prepare("SELECT * FROM account_changes WHERE id = ?").bind(changeId).first();
  if (!change || change.status !== "pending") return json({ error: "This request is no longer waiting." }, 409);
  const person = await d1UserById(env, change.user_id);
  if (!d1RowLive(person)) return json({ error: "No such account." }, 404);
  if (actor.role !== "DEVELOPER" && (person.role === "DEVELOPER" || person.hidden)) {
    return json({ error: "No such account." }, 404);
  }
  const directory = await readDirectory(env);
  if (action === "approve" && soleFirstTeacher(directory.users, person.id)) {
    return json({ error: "This teacher can change account details after a second active teacher joins." }, 403);
  }
  if (action === "approve" && actor.role !== "DEVELOPER" && actor.id === person.id) {
    return json({ error: "Someone else has to approve this change." }, 403);
  }
  if (actor.role === "ADMIN" && actor.id !== person.id && person.role !== "USER" && person.role !== "ADMIN") {
    return json({ error: "You cannot do that." }, 403);
  }
  const decided = now();
  if (action === "reject") {
    await env.DB.prepare(
      "UPDATE account_changes SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(decided, change.id).run();
    await rememberChange(env, Object.assign({}, change, { status: "rejected", decided_at: decided }));
    return json({ ok: true });
  }
  const clash = await accountClash(env, change.user_id, change.login, change.email, change.id);
  if (clash) return json({ error: clash }, 409);
  const pairBlock = reservedPairLogin(change.login, person.login);
  if (pairBlock) return json({ error: pairBlock }, 403);
  await env.DB.prepare("UPDATE users SET login = ?, email = ?, name = ? WHERE id = ?").bind(change.login, change.email, change.name, change.user_id).run();
  await env.DB.prepare(
    "UPDATE account_changes SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(decided, change.id).run();
  const dirOk = await patchDirectory(env, (next) => {
    next.users.forEach((item) => {
      if (!item || item.id !== change.user_id) return;
      item.login = change.login;
      item.email = change.email;
      item.name = change.name;
    });
  });
  if (!dirOk) return json({ error: "The change was saved, but the teacher list could not update. Try again." }, 503);
  await rememberChange(env, Object.assign({}, change, { status: "approved", decided_at: decided }));
  return json({ ok: true });
}

async function forgetUser(env, userId, email) {
  await patchDirectory(env, (directory) => {
    directory.users = directory.users.filter((item) => item && item.id !== userId);
    directory.registrations = directory.registrations.filter((item) => item && item.user_id !== userId && item.email !== email);
    directory.changes = directory.changes.filter((item) => item && item.user_id !== userId);
  });
}

function forReviewer(actor, rows, users) {
  const list = rows || [];
  if (actor && actor.role === "DEVELOPER") return list;
  const hiddenIds = {};
  const hiddenEmails = {};
  const revokedIds = {};
  (users || []).forEach((item) => {
    if (!item) return;
    if (item.revoked) revokedIds[item.id] = 1;
    if (!item.hidden) return;
    hiddenIds[item.id] = 1;
    if (item.email) hiddenEmails[String(item.email).toLowerCase()] = 1;
  });
  return list.filter((item) => {
    if (!item || item.role === "DEVELOPER" || item.hidden || item.revoked) return false;
    if (item.id && (hiddenIds[item.id] || revokedIds[item.id])) return false;
    if (item.user_id && (hiddenIds[item.user_id] || revokedIds[item.user_id])) return false;
    if (item.email && hiddenEmails[String(item.email).toLowerCase()]) return false;
    return true;
  });
}

async function admin(env, request, method, path, body, ctx) {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!canReview(user)) return json({ error: "Teachers only." }, 403);
  if (method === "GET" && path === "/api/admin/registrations") {
    const directory = await readDirectory(env);
    return json({ registrations: forReviewer(user, directory.registrations, directory.users) });
  }
  if (method === "GET" && path === "/api/admin/changes") {
    const directory = await readDirectory(env);
    const accountIds = new Set(directory.users.filter((item) => item && !item.revoked).map((item) => item.id));
    const linkedChanges = directory.changes.filter((item) => item && accountIds.has(item.user_id));
    const changes = forReviewer(user, linkedChanges, directory.users).map((item) => {
      if (item && item.status === "pending" && soleFirstTeacher(directory.users, item.user_id)) return Object.assign({}, item, { locked: true });
      return item;
    });
    return json({ changes: changes });
  }
  if (method === "GET" && path === "/api/admin/users") {
    const directory = await readDirectory(env);
    const accounts = directory.users.filter((item) => item && !item.revoked);
    return json({ users: forReviewer(user, accounts, directory.users) });
  }
  const parts = path.split("/");
  if (parts.length === 5 && parts[2] === "admin" && parts[3] === "users" && method === "DELETE") {
    return deleteAccount(env, user, parts[4]);
  }
  if (parts.length === 5 && parts[2] === "admin" && parts[3] === "users" && method === "GET") {
    const found = await managedAccount(env, user, parts[4]);
    if (found.error) return found.error;
    const directory = await readDirectory(env);
    const history = forReviewer(
      user,
      directory.registrations.filter((item) => item && (item.user_id === found.row.id || item.email === found.row.email)),
      directory.users
    );
    return json({ user: publicUser(found.row), registrations: history });
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "registrations" && method === "POST") {
    return decide(env, user, parts[4], parts[5]);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "changes" && method === "POST") {
    return decideChange(env, user, parts[4], parts[5]);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "texts" && method === "GET") {
    return readManagedTexts(env, user, parts[4]);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "texts" && method === "PUT") {
    return writeManagedTexts(env, user, parts[4], body);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "state" && method === "GET") {
    return readManagedState(env, user, parts[4], ctx);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "state" && method === "PUT") {
    return writeManagedState(env, user, parts[4], body, ctx);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "profile" && method === "POST") {
    return updateProfile(env, user, parts[4], body);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "hidden" && method === "POST") {
    return setHidden(env, user, parts[4], body);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "active" && method === "POST") {
    return setActive(env, user, parts[4], body);
  }
  if (parts.length === 6 && parts[2] === "admin" && parts[3] === "users" && parts[5] === "role" && method === "POST") {
    return setUserRole(env, user, parts[4], body);
  }
  return json({ error: "Not found." }, 404);
}

export async function managedAccount(env, actor, userId) {
  if (!actor || (actor.role !== "DEVELOPER" && actor.role !== "ADMIN")) return { error: json({ error: "You cannot do that." }, 403) };
  // Authz from D1 (source of truth), not the R2 directory cache.
  let row = null;
  try {
    row = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked, active, hidden FROM users WHERE id = ?"
    ).bind(userId).first();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    row = await env.DB.prepare(
      "SELECT id, login, email, name, role, is_personal_data_revoked FROM users WHERE id = ?"
    ).bind(userId).first();
  }
  if (!row || row.is_personal_data_revoked) return { error: json({ error: "No such account." }, 404) };
  if (row.active === 0) return { error: json({ error: "No such account." }, 404) };
  if (row.hidden && actor.role !== "DEVELOPER") return { error: json({ error: "No such account." }, 404) };
  if (actor.role === "ADMIN") {
    if (row.role !== "USER") return { error: json({ error: "You cannot do that." }, 403) };
    return { row: row, songs: false };
  }
  if (row.role !== "USER" && row.role !== "ADMIN") return { error: json({ error: "Only student and teacher accounts can be opened." }, 403) };
  return { row: row, songs: true };
}

function stateForViewer(state, songs) {
  const saved = state || emptyState();
  if (songs) return saved;
  return {
    added: (saved.added || []).filter((card) => !card || (card.place || "mine") !== "music"),
    songs: [],
    learned: saved.learned || [],
    variants: saved.variants || {},
    stats: saved.stats || {}
  };
}

async function readManagedState(env, actor, userId, ctx) {
  const found = await managedAccount(env, actor, userId);
  if (found.error) return found.error;
  if (studyTwinLogin(found.row.login) && !studyTwinLogin(actor.login)) {
    return json({ error: "You cannot do that." }, 403);
  }
  if (!(await readAccountFile(env, userId))) {
    try { await copyStateOnce(env, userId); } catch (e) {}
  }
  const state = await readAccountFile(env, userId) || emptyState();
  const shown = found.songs ? await withSidecars(env, found.row.login, userId, state) : state;
  shown.songs = await songsForLogin(env, found.row.login, shown.songs);
  try {
    const sharedQuizzes = await readSharedCardQuizzes(env);
    const sharedEdits = await readSharedCardEdits(env);
    const stats = Object.assign({}, plainObject(shown.stats));
    stats.cardQuizzes = sharedQuizzes;
    stats.cardEdits = sharedEdits;
    shown.stats = stats;
  } catch (e) {}
  return json(await withVisibleThemes(env, found.row.login, stateForViewer(shown, found.songs)));
}

async function readManagedTexts(env, actor, userId) {
  const found = await managedAccount(env, actor, userId);
  if (found.error) return found.error;
  if (studyTwinLogin(found.row.login) && !studyTwinLogin(actor.login)) {
    return json({ error: "You cannot do that." }, 403);
  }
  return json({ texts: await textsForLogin(env, found.row.login, userId) });
}

async function writeManagedTexts(env, actor, userId, body) {
  const found = await managedAccount(env, actor, userId);
  if (found.error) return found.error;
  if (pairViewOnly(actor)) return json({ error: "You cannot do that." }, 403);
  if (studyTwinLogin(found.row.login) && !studyTwinLogin(actor.login)) return json({ error: "You cannot do that." }, 403);
  return saveTextsFor(env, found.row.login, userId, body);
}

async function writeManagedState(env, actor, userId, body, ctx) {
  const found = await managedAccount(env, actor, userId);
  if (found.error) return found.error;
  if (pairViewOnly(actor) && pairBlockedOp(body)) return json({ error: "You cannot do that." }, 403);
  if (studyTwinLogin(found.row.login) && !studyTwinLogin(actor.login)) {
    return json({ error: "You cannot do that." }, 403);
  }
  if (!found.songs) {
    const op = body && body.op;
    let place = "";
    if ((op === "put-card" || op === "put-text-card") && body.card && typeof body.card === "object") {
      place = body.card.place || "";
    } else if (body) {
      place = body.place || "";
    }
    if (op === "put-song" || String(place || "") === "music") return json({ error: "You cannot do that." }, 403);
  }
  // Shared card quizzes must be written via the actor's own /api/me/state, never through a viewed account.
  if (body && body.op === "put-setting" && body.key === "cardQuizzes") {
    return json({ error: "You cannot do that." }, 403);
  }
  return writeStateOp(env, userId, body, studyTwinLogin(found.row.login), ctx);
}

async function updateProfile(env, actor, userId, body) {
  const found = await managedAccount(env, actor, userId);
  if (found.error) return found.error;
  if (!actor || actor.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  const directory = await readDirectory(env);
  if (soleFirstTeacher(directory.users, userId)) {
    return json({ error: "This teacher can change account details after a second active teacher joins." }, 403);
  }
  const login = String(body && body.login || "").trim();
  const email = String(body && body.email || "").trim().toLowerCase();
  const name = String(body && body.name || "").trim().slice(0, 80);
  if (!LOGIN_RE.test(login)) return json({ error: "Login needs 3 to 32 letters, numbers, dots, dashes or underscores." }, 400);
  if (!EMAIL_RE.test(email) || email.length > 120) return json({ error: "Enter a valid email." }, 400);
  const pairBlock = reservedPairLogin(login, found.row.login);
  if (pairBlock) return json({ error: pairBlock }, 403);
  const reserved = await env.DB.prepare("SELECT id FROM users WHERE login = ? AND id != ?").bind(login, userId).first();
  if (reserved) return json({ error: "That login is already in use." }, 409);
  const clash = await env.DB.prepare(
    "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND id != ? AND email = ?"
  ).bind(userId, email).first();
  if (clash) return json({ error: "That email is already in use." }, 409);
  const pending = await env.DB.prepare(
    "SELECT login, email FROM registrations WHERE status = 'pending' AND (login = ? OR email = ?)"
  ).bind(login, email).first();
  const pendingText = fieldClash(pending, login, email, true);
  if (pendingText) return json({ error: pendingText }, 409);
  await env.DB.prepare("UPDATE users SET login = ?, email = ?, name = ? WHERE id = ?").bind(login, email, name, userId).run();
  const dirOk = await patchDirectory(env, (directory) => {
    directory.users.forEach((item) => {
      if (!item || item.id !== userId) return;
      item.login = login;
      item.email = email;
      item.name = name;
    });
  });
  if (!dirOk) return json({ error: "Saved, but the teacher list could not update. Try again." }, 503);
  return json({ user: Object.assign({}, found.row, { login: login, email: email, name: name }) });
}

async function ignoreMissingTable(statement) {
  try { await statement.run(); }
  catch (error) {
    if (String(error && error.message || error).indexOf("no such table") >= 0) return;
    throw error;
  }
}

async function deleteAccountFiles(env, userId) {
  if (!env.MEDIA) throw new Error("Files are not connected yet.");
  // Mark gone first so in-flight sync cannot recreate keys after (or during) wipe.
  await env.MEDIA.put("gone/" + userId, "1", { httpMetadata: { contentType: "text/plain" } });
  let cursor = undefined;
  do {
    const page = await env.MEDIA.list({ prefix: userId + "/", cursor: cursor });
    const objects = page.objects || [];
    for (let i = 0; i < objects.length; i++) await env.MEDIA.delete(objects[i].key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function deleteAccount(env, actor, userId) {
  if (!actor || actor.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  if (actor.id === userId) return json({ error: "You can't delete your own account." }, 400);
  const row = await env.DB.prepare("SELECT id, role, email FROM users WHERE id = ?").bind(userId).first();
  if (!row) return json({ error: "No such account." }, 404);
  if (row.role !== "USER" && row.role !== "ADMIN") return json({ error: "Only student and teacher accounts can be deleted." }, 403);
  // Gone + wipe first (same order as revoke) so writers abort before D1 disappears.
  try {
    await deleteAccountFiles(env, userId);
  } catch (e) {
    const marked = await accountMediaGone(env, userId);
    if (!marked) return json({ error: "Could not delete account files. Try again." }, 503);
  }
  await ignoreMissingTable(env.DB.prepare("DELETE FROM user_state WHERE user_id = ?").bind(userId));
  await ignoreMissingTable(env.DB.prepare("DELETE FROM user_added WHERE user_id = ?").bind(userId));
  await ignoreMissingTable(env.DB.prepare("DELETE FROM user_card_gone WHERE user_id = ?").bind(userId));
  await ignoreMissingTable(env.DB.prepare("DELETE FROM registrations WHERE user_id = ? OR email = ?").bind(userId, row.email));
  await ignoreMissingTable(env.DB.prepare("DELETE FROM account_changes WHERE user_id = ?").bind(userId));
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  await forgetUser(env, userId, row.email);
  return json({ ok: true });
}

async function setHidden(env, actor, userId, body) {
  if (!actor || actor.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  const hidden = !!(body && body.hidden);
  const sql = "UPDATE users SET hidden = ? WHERE id = ?";
  let result;
  try {
    result = await env.DB.prepare(sql).bind(hidden ? 1 : 0, userId).run();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    await env.DB.prepare("ALTER TABLE users ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0").run();
    result = await env.DB.prepare(sql).bind(hidden ? 1 : 0, userId).run();
  }
  if (!result.meta || !result.meta.changes) return json({ error: "No such account." }, 404);
  const dirOk = await patchDirectory(env, (directory) => {
    directory.users.forEach((item) => {
      if (item && item.id === userId) item.hidden = hidden;
    });
  });
  if (!dirOk) return json({ error: "Saved, but the teacher list could not update. Try again." }, 503);
  return json({ ok: true, hidden: hidden });
}

async function setActive(env, actor, userId, body) {
  if (!actor || actor.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  const active = !!(body && body.active);
  if (actor.id === userId && !active) {
    return json({ error: "You cannot deactivate your own account." }, 400);
  }
  const sql = "UPDATE users SET active = ? WHERE id = ?";
  let result;
  try {
    result = await env.DB.prepare(sql).bind(active ? 1 : 0, userId).run();
  } catch (error) {
    if (String(error && error.message || error).indexOf("no such column") < 0) throw error;
    await env.DB.prepare("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1").run();
    result = await env.DB.prepare(sql).bind(active ? 1 : 0, userId).run();
  }
  if (!result.meta || !result.meta.changes) return json({ error: "No such account." }, 404);
  const dirOk = await patchDirectory(env, (directory) => {
    directory.users.forEach((item) => {
      if (item && item.id === userId) item.active = active;
    });
  });
  if (!dirOk) return json({ error: "Saved, but the teacher list could not update. Try again." }, 503);
  return json({ ok: true, active: active });
}

async function setUserRole(env, actor, userId, body) {
  if (!actor || actor.role !== "DEVELOPER") return json({ error: "You cannot do that." }, 403);
  const role = String(body && body.role || "");
  if (role !== "USER" && role !== "ADMIN" && role !== "DEVELOPER") return json({ error: "The request was not valid." }, 400);
  // Do not let a developer demote their own live session away from DEVELOPER.
  if (actor.id === userId && role !== "DEVELOPER") {
    return json({ error: "You cannot change your own developer role." }, 400);
  }
  const result = await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, userId).run();
  if (!result.meta || !result.meta.changes) return json({ error: "No such account." }, 404);
  const dirOk = await patchDirectory(env, (directory) => {
    directory.users.forEach((item) => {
      if (item && item.id === userId) item.role = role;
    });
  });
  if (!dirOk) return json({ error: "Saved, but the teacher list could not update. Try again." }, 503);
  return json({ ok: true });
}

async function decide(env, actor, regId, action) {
  const db = env.DB;
  if (!actor || (actor.role !== "DEVELOPER" && actor.role !== "ADMIN")) return json({ error: "You cannot do that." }, 403);
  if (action !== "approve" && action !== "reject") return json({ error: "Not found." }, 404);
  const reg = await db.prepare("SELECT * FROM registrations WHERE id = ?").bind(regId).first();
  if (!reg || reg.status !== "pending") return json({ error: "This request is no longer waiting." }, 409);
  // Same visibility as GET /api/admin/registrations — no approve-by-id for hidden-linked rows.
  const directory = await readDirectory(env);
  const visible = forReviewer(actor, [registrationPublic(reg)], directory.users);
  if (!visible.length) return json({ error: "No such account." }, 404);
  const decided = now();
  if (action === "reject") {
    await db.prepare("UPDATE registrations SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'").bind(decided, regId).run();
    await rememberRegistration(env, { id: reg.id, login: reg.login, email: reg.email, name: reg.name, status: "rejected", role: reg.role, user_id: reg.user_id, created_at: reg.created_at, decided_at: decided });
    return json({ ok: true });
  }
  const reserved = await db.prepare("SELECT id FROM users WHERE login = ?").bind(reg.login).first();
  if (reserved) return json({ error: "That login is already in use." }, 409);
  const taken = await db.prepare(
    "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND email = ?"
  ).bind(reg.email).first();
  if (taken) return json({ error: "That email is already in use." }, 409);
  const pairBlock = reservedPairLogin(reg.login, "");
  if (pairBlock) return json({ error: pairBlock }, 403);
  const userId = randomId();
  // Approvals always create students. Promoting to teacher is a separate developer action.
  const role = "USER";
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
      ).bind(userId, reg.login, reg.email, reg.name, reg.password_salt, reg.password_hash, reg.password_iterations, role, decided),
      db.prepare(
        "UPDATE registrations SET status = 'approved', user_id = ?, decided_at = ? WHERE id = ? AND status = 'pending'"
      ).bind(userId, decided, regId),
    ]);
  } catch (error) {
    return json({ error: statedProblem(error) }, problemStatus(error, statedProblem(error)));
  }
  await rememberUser(env, { id: userId, login: reg.login, email: reg.email, name: reg.name, role: role, is_personal_data_revoked: 0, created_at: decided });
  await rememberRegistration(env, { id: reg.id, login: reg.login, email: reg.email, name: reg.name, status: "approved", role: role, user_id: userId, created_at: reg.created_at, decided_at: decided });
  return json({ ok: true });
}

function tidyQuery(word) {
  return String(word || "").replace(/\s+/g, " ").trim().replace(/^[.,;:!?"'“”«»()[\]]+|[.,;:!?"'“”«»()[\]]+$/g, "");
}

function isRussian(word) {
  return /[а-яё]/i.test(word || "");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|ensp|emsp|thinsp);|&#(?:160|8194|8195|8201);/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wikiPlain(text) {
  let out = String(text || "");
  let previous = null;
  while (previous !== out) {
    previous = out;
    out = out.replace(/\{\{[^{}]*\}\}/g, "");
  }
  out = out.split("{{")[0];
  out = out.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");
  out = out.replace(/\[\[|\]\]/g, "").replace(/'''/g, "").replace(/''/g, "");
  return stripTags(out);
}

function uniqueKeep(items, limit) {
  const kept = [];
  items.forEach((item) => {
    const text = String(item || "").replace(/\s+/g, " ").trim().replace(/^[,;. ]+|[,;. ]+$/g, "");
    if (!text || kept.indexOf(text) !== -1) return;
    kept.push(text);
  });
  return kept.slice(0, limit);
}

async function fetchText(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en,ru",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function wiktionaryLookup(label) {
  const russian = isRussian(label);
  const host = russian ? "ru.wiktionary.org" : "en.wiktionary.org";
  const title = label.replace(/ /g, "_");
  const page = "https://" + host + "/wiki/" + encodeURIComponent(title);
  const api = "https://" + host + "/w/api.php?action=parse&page=" + encodeURIComponent(title) + "&prop=wikitext&format=json&formatversion=2&redirects=1";
  const body = await fetchText(api, 8000);
  if (!body) return { url: page };
  let payload = {};
  try { payload = JSON.parse(body); } catch (e) { return { url: page }; }
  const wikitext = (payload.parse && payload.parse.wikitext) || "";
  if (!wikitext) return { url: page };
  const lang = russian ? "en" : "ru";
  const found = [];
  const trans = new RegExp("\\{\\{t(?:\\+|-simple)?\\|" + lang + "\\|([^|}]+)", "g");
  let match = trans.exec(wikitext);
  while (match) {
    const text = wikiPlain(match[1]);
    if (text) found.push(text);
    match = trans.exec(wikitext);
  }
  if (russian) {
    const block = wikitext.match(/^\|en=(.*)$/m);
    if (block) {
      const raw = block[1].replace(/<!--[\s\S]*?-->/g, "");
      const links = raw.match(/\[\[([^|\]]+)\]\]/g) || [];
      links.forEach((item) => {
        const text = wikiPlain(item.replace(/^\[\[/, "").replace(/\]\]$/, ""));
        if (text) found.push(text);
      });
    }
  }
  const translations = uniqueKeep(found, 8);
  let definition = "";
  wikitext.split("\n").some((line) => {
    if (line.indexOf("# ") === 0 && line.indexOf("#:") !== 0) {
      definition = wikiPlain(line.slice(2));
      return !!definition;
    }
    return false;
  });
  const examples = [];
  const exRe = /\{\{(?:ux|uxi)\|en\|([^|}]+)/g;
  let ex = exRe.exec(wikitext);
  while (ex && examples.length < 6) {
    const text = wikiPlain(ex[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    ex = exRe.exec(wikitext);
  }
  const result = { url: page, translations: translations, definition: definition, examples: examples };
  if (russian) result.en = translations.slice(0, 6).join(", ");
  else result.ru = translations.slice(0, 6).join(", ");
  return result;
}

async function wikdictLookup(label) {
  const pair = isRussian(label) ? "ru-en" : "en-ru";
  const url = "https://www.wikdict.com/" + pair + "/" + encodeURIComponent(label);
  const html = await fetchText(url, 8000);
  if (!html || /no translations/i.test(html)) return { url: url };
  const tables = html.match(/<table class="lexentry\b[\s\S]*?<\/table>/g) || [];
  let chosen = "";
  tables.some((table) => {
    const head = table.match(/<h3>\s*([^<]+)/);
    if (head && head[1].trim().toLowerCase() === label.toLowerCase()) {
      chosen = table;
      return true;
    }
    return false;
  });
  if (!chosen) return { url: url };
  const translations = [];
  const notes = [];
  const rows = chosen.match(/<tr class="sense-groups">[\s\S]*?<\/tr>/g) || [];
  rows.forEach((row) => {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []).map(stripTags);
    if (cells.length < 2) return;
    const gloss = cells[0];
    const other = cells[cells.length - 1];
    if (isRussian(label)) {
      if (!/[A-Za-z]/.test(other)) return;
    } else if (!isRussian(other)) return;
    other.split(/\s*,\s*/).forEach((part) => {
      const text = wikiPlain(part).replace(/^[.; ]+|[.; ]+$/g, "");
      if (text && translations.indexOf(text) === -1 && text.toLowerCase() !== label.toLowerCase()) translations.push(text);
    });
    if (gloss && notes.indexOf(gloss) === -1 && gloss.length < 160) notes.push(gloss);
  });
  const result = { url: url, translations: translations.slice(0, 8), notes: notes.slice(0, 4) };
  if (isRussian(label)) result.en = translations.slice(0, 6).join(", ");
  else result.ru = translations.slice(0, 6).join(", ");
  return result;
}

function parseOpenRussian(html, url, russianQuery) {
  const blockMatch = html.match(/class="translations">([\s\S]*?)<\/ul>/);
  const block = blockMatch ? blockMatch[1] : "";
  const translations = [];
  const examples = [];
  (block.match(/<li>([\s\S]*?)<\/li>/g) || []).forEach((item) => {
    const glossMatch = item.match(/class="first-line">\s*<p class="tl">([\s\S]*?)<\/p>/);
    if (glossMatch) {
      const words = (glossMatch[1].match(/<span[^>]*>([\s\S]*?)<\/span>/g) || []).map(stripTags).filter(Boolean);
      const gloss = words.length ? words.join(", ") : stripTags(glossMatch[1]);
      if (gloss && translations.indexOf(gloss) === -1 && gloss.length < 180) translations.push(gloss);
    }
    const nativeMatch = item.match(/class="native">([\s\S]*?)<\/p>/);
    const englishMatch = item.match(/class="example">[\s\S]*?class="tl">([\s\S]*?)<\/p>/);
    if (nativeMatch && englishMatch) {
      const russian = stripTags(nativeMatch[1]);
      const english = stripTags(englishMatch[1]);
      if (russian && english && isRussian(russian) && !isRussian(english)) examples.push({ ru: russian, en: english });
    }
  });
  if (!translations.length) {
    const meta = html.match(/name="description" content="Translation:\s*([^."<]+)/);
    if (meta) {
      const gloss = stripTags(meta[1]);
      if (gloss) translations.push(gloss);
    }
  }
  if (!translations.length && !examples.length) return { url: url };
  const result = { url: url, translations: translations.slice(0, 8), examples: examples.slice(0, 6) };
  if (russianQuery) result.en = translations.slice(0, 6).join(", ");
  else result.ru = translations.slice(0, 6).join(", ");
  return result;
}

async function openRussianLookup(label) {
  const url = "https://en.openrussian.org/" + (isRussian(label) ? "ru/" : "en/") + encodeURIComponent(label);
  const html = await fetchText(url, 8000);
  if (!html) return { url: "https://en.openrussian.org/dictionary" };
  return parseOpenRussian(html, url, isRussian(label));
}

function slugWooordhunt(word) {
  let text = String(word || "").trim().toLowerCase().replace(/’/g, "'");
  if (text === "won't") return "will";
  return text.replace(/\s+/g, "_");
}

function slugOxford(word) {
  return String(word || "").trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function slugCambridge(word) {
  let text = String(word || "").trim().toLowerCase().replace(/’/g, "'");
  if (text === "won't") return "won-t";
  text = text.replace(/'/g, "");
  return text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseWooordhunt(html) {
  if (!html || (html.indexOf('class="transcription"') < 0 && html.indexOf("t_inline_en") < 0)) return null;
  const glossMatch = html.match(/<div class="t_inline_en">\s*([^<]+)/);
  const gloss = glossMatch ? stripTags(glossMatch[1]) : "";
  const phrases = [];
  const phraseRe = /([^<>]{1,120})&ensp;—&ensp;<i>([^<]+)<\/i>/g;
  let phrase = phraseRe.exec(html);
  while (phrase && phrases.length < 24) {
    phrases.push({ en: stripTags(phrase[1]), ru: stripTags(phrase[2]) });
    phrase = phraseRe.exec(html);
  }
  const examples = [];
  const exampleRe = /<p class="ex_o"[^>]*>\s*([\s\S]*?)<\/p>(?:\s*<p class="ex_t human">\s*([\s\S]*?)<\/p>)?/g;
  let example = exampleRe.exec(html);
  while (example && examples.length < 40) {
    examples.push({ en: stripTags(example[1]), ru: stripTags(example[2] || "") });
    example = exampleRe.exec(html);
  }
  function transcription(blockId) {
    const found = html.match(new RegExp('id="' + blockId + '"[\\s\\S]*?class="transcription">\\s*([^<]+)'));
    return found ? found[1].trim().replace(/^\|+|\|+$/g, "").trim() : "";
  }
  const uk = transcription("uk_tr_sound");
  const us = transcription("us_tr_sound");
  const verbStart = html.indexOf("ShowExNew('verb')");
  let verbGloss = "";
  if (verbStart >= 0) {
    const verbEnd = html.indexOf("<h4", verbStart + 10);
    const chunk = html.slice(verbStart, verbEnd < 0 ? verbStart + 5000 : verbEnd);
    const senses = [];
    const senseRe = /slideToggle\(100\);">([\s\S]*?)<\/span>/g;
    let sense = senseRe.exec(chunk);
    while (sense && senses.length < 6) {
      const text = stripTags(sense[1]).replace(/\s+/g, " ").trim();
      if (text && senses.indexOf(text) < 0) senses.push(text);
      sense = senseRe.exec(chunk);
    }
    verbGloss = senses.join("; ");
  }
  if (!(uk || us || gloss || phrases.length || examples.length)) return null;
  return { uk: uk, us: us, gloss: gloss, verbGloss: verbGloss, phrases: phrases, examples: examples };
}

function parseCambridge(html) {
  if (!html || html.indexOf('class="pos dpos"') < 0) return null;
  const poses = [];
  const posRe = /<span class="pos dpos"[^>]*>([^<]+)/g;
  let posRaw = posRe.exec(html);
  while (posRaw) {
    const label = stripTags(posRaw[1]);
    if (label && poses.indexOf(label) < 0) poses.push(label);
    posRaw = posRe.exec(html);
  }
  const pos = poses[0] || "";
  function ipa(region) {
    const found = html.match(new RegExp('class="' + region + ' dpron-i [\\s\\S]*?<span class="ipa[^"]*">([\\s\\S]*?)</span>/</span>'));
    return found ? stripTags(found[1]) : "";
  }
  const levelMatch = html.match(/class="epp-xref[^"]*">([ABC][12])/);
  const level = levelMatch ? levelMatch[1] : "";
  const start = html.indexOf('class="def ddef_d');
  const end = start < 0 ? -1 : html.indexOf("These examples are from corpora", start);
  const chunk = start < 0 ? "" : html.slice(start, end < 0 ? start + 5000 : end);
  const defMatch = chunk.match(/class="def ddef_d db">([\s\S]*?)<\/div>/);
  const definition = defMatch ? stripTags(defMatch[1]).replace(/:$/, "").trim() : "";
  const examples = [];
  const exampleRe = /<span class="eg deg">([\s\S]*?)<\/span>/g;
  let raw = exampleRe.exec(html);
  while (raw && examples.length < 8) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = exampleRe.exec(html);
  }
  const corpus = [];
  const corpusRe = /<span class="deg">\s*([\s\S]*?)<\/span>/g;
  raw = corpusRe.exec(html);
  while (raw && corpus.length < 16) {
    const text = stripTags(raw[1]);
    if (text && corpus.indexOf(text) < 0 && examples.indexOf(text) < 0) corpus.push(text);
    raw = corpusRe.exec(html);
  }
  return { pos: pos, poses: poses, uk: ipa("uk"), us: ipa("us"), level: level, definition: definition, examples: examples, corpus: corpus };
}

function parseOxford(html) {
  if (!html) return null;
  const title = html.match(/<title>([^<]+)/);
  const titleText = title ? stripTags(title[1]) : "";
  if (titleText.indexOf("Did you spell") >= 0 || html.indexOf('class="x"') < 0) return null;
  const examples = [];
  const exampleRe = /<span class="x">([\s\S]*?)<\/span>/g;
  let raw = exampleRe.exec(html);
  while (raw && examples.length < 40) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = exampleRe.exec(html);
  }
  const phonMatch = html.match(/class="phon">([\s\S]*?)<\/span>/);
  const phon = phonMatch ? stripTags(phonMatch[1]).replace(/^\/|\/$/g, "") : "";
  if (!examples.length && !phon) return null;
  return { phon: phon, examples: examples };
}

function containsHead(text, head) {
  const word = String(head || "").trim();
  if (!word) return true;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?<![A-Za-z])" + escaped + "(?![A-Za-z])", "i").test(text);
}

function contentHead(label) {
  const skip = { i: 1, a: 1, an: 1, the: 1, to: 1, of: 1, in: 1, on: 1, at: 1, for: 1, and: 1, or: 1, my: 1, your: 1, you: 1, we: 1, they: 1, he: 1, she: 1, it: 1, is: 1, are: 1, am: 1, be: 1, do: 1, does: 1, did: 1, not: 1, no: 1, this: 1, that: 1, with: 1, from: 1, about: 1, what: 1, how: 1, when: 1, if: 1, so: 1, just: 1, very: 1, really: 1, up: 1, out: 1, off: 1, its: 1, our: 1, me: 1, him: 1, her: 1, them: 1, was: 1, were: 1, been: 1, have: 1, has: 1, had: 1 };
  const parts = String(label || "").toLowerCase().replace(/['’]/g, "'").split(/[^a-z']+/).filter(Boolean);
  const content = parts.filter((part) => part.length > 2 && !skip[part]);
  return content[0] || "";
}

function sameExample(left, right) {
  const text = (item) => String(typeof item === "string" ? item : (item && item.en) || "").replace(/\s+/g, " ").trim().toLowerCase();
  return text(left) === text(right);
}

function mergeSource(current, extra) {
  if (!extra) return current;
  if (!current) return extra;
  ["examples", "phrases", "corpus"].forEach((key) => {
    const base = (current[key] || []).slice();
    (extra[key] || []).forEach((item) => {
      if (!base.some((row) => sameExample(row, item))) base.push(item);
    });
    if (base.length) current[key] = base;
  });
  return current;
}

async function stemPages(stem) {
  const slug = slugOxford(stem);
  const [wooHtml, camHtml, oxHtml, longHtml] = await Promise.all([
    pageLookup("https://wooordhunt.ru/word/" + encodeURIComponent(slugWooordhunt(stem))),
    pageLookup("https://dictionary.cambridge.org/dictionary/english/" + encodeURIComponent(slugCambridge(stem))),
    pageLookup("https://www.oxfordlearnersdictionaries.com/definition/english/" + encodeURIComponent(slug)),
    pageLookup("https://www.ldoceonline.com/dictionary/" + encodeURIComponent(slug)),
  ]);
  return {
    wooordhunt: parseWooordhunt(wooHtml),
    cambridge: parseCambridge(camHtml),
    oxford: parseOxford(oxHtml),
    longman: parseLongman(longHtml),
  };
}

async function tatoebaUsages(label) {
  const url = "https://tatoeba.org/en/api_v0/search?from=eng&query=" + encodeURIComponent('"' + label + '"') + "&trans_to=rus";
  const raw = await fetchText(url, 8000);
  if (!raw || raw.charAt(0) !== "{") return [];
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { return []; }
  const items = [];
  const seen = {};
  (data.results || []).forEach((row) => {
    if (items.length >= 8) return;
    const english = String((row && row.text) || "").replace(/\s+/g, " ").trim();
    if (!containsHead(english, label)) return;
    const key = english.toLowerCase().replace(/[.!?]+$/g, "").trim();
    if (!key || key === String(label || "").trim().toLowerCase() || seen[key]) return;
    seen[key] = true;
    let russian = "";
    (row.translations || []).forEach((group) => {
      (group || []).forEach((item) => {
        if (!russian && item && item.lang === "rus" && item.text) russian = String(item.text).replace(/\s+/g, " ").trim();
      });
    });
    items.push({ en: english, ru: russian, kind: usageKind(english), source: "Tatoeba" });
  });
  return items;
}

function usageKind(text, collocation) {
  const words = String(text || "").match(/[A-Za-z']+/g) || [];
  if (collocation || words.length <= 7) return "simple";
  if (words.length >= 12 || /\b(that|which|because|although|while|when|if|after|before)\b/i.test(text)) return "complex";
  if ((text.match(/,/g) || []).length >= 1 && words.length > 8) return "complex";
  return "simple";
}

function parseLongman(html) {
  if (!html || html.indexOf('class="EXAMPLE"') < 0) return null;
  const title = html.match(/<title>([^<]+)/);
  if (title && title[1].toLowerCase().indexOf("did you mean") >= 0) return null;
  const examples = [];
  const exampleRe = /<span class="EXAMPLE">([\s\S]*?)<\/span>/g;
  let raw = exampleRe.exec(html);
  while (raw && examples.length < 40) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = exampleRe.exec(html);
  }
  const pronMatch = html.match(/class="PRON"[^>]*>([\s\S]*?)<\/span>/);
  const pron = pronMatch ? stripTags(pronMatch[1]).replace(/^\/|\/$/g, "") : "";
  const defMatch = html.match(/class="DEF"[^>]*>([\s\S]*?)<\/span>/);
  const definition = defMatch ? stripTags(defMatch[1]) : "";
  if (!examples.length && !definition) return null;
  return { pron: pron, definition: definition, examples: examples };
}

function parseCollins(html) {
  if (!html || (html.indexOf('class="def"') < 0 && html.indexOf('class="quote"') < 0)) return null;
  const defMatch = html.match(/class="def"[^>]*>([\s\S]*?)<\/div>/);
  const definition = defMatch ? stripTags(defMatch[1]) : "";
  const examples = [];
  const exampleRe = /class="quote"[^>]*>([\s\S]*?)<\/(?:div|span|blockquote)>/g;
  let raw = exampleRe.exec(html);
  while (raw && examples.length < 20) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = exampleRe.exec(html);
  }
  if (!definition && !examples.length) return null;
  return { definition: definition, examples: examples };
}

function parseMerriam(html) {
  if (!html || (html.indexOf("dtText") < 0 && html.indexOf("ex-sent") < 0)) return null;
  const defMatch = html.match(/class="dtText"[^>]*>([\s\S]*?)<\/span>/);
  const definition = defMatch ? stripTags(defMatch[1]).replace(/^:/, "").trim() : "";
  const examples = [];
  const exampleRe = /class="ex-sent[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  let raw = exampleRe.exec(html);
  while (raw && examples.length < 20) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = exampleRe.exec(html);
  }
  if (!definition && !examples.length) return null;
  return { definition: definition, examples: examples };
}

async function englishClubLookup(word) {
  const index = "https://www.englishclub.com/ref/Idioms/";
  const label = String(word || "").trim();
  let letter = "";
  for (let i = 0; i < label.length; i++) {
    if (/[A-Za-z]/.test(label[i])) { letter = label[i].toUpperCase(); break; }
  }
  if (!letter) return { url: index };
  const parts = (label.toLowerCase().match(/[a-z0-9]+/g) || []).filter((part) => part.length > 2);
  const letters = [letter];
  parts.forEach((part) => {
    const initial = part[0].toUpperCase();
    if (letters.indexOf(initial) < 0) letters.push(initial);
  });
  let best = "";
  let bestScore = 0;
  for (let i = 0; i < Math.min(3, letters.length); i++) {
    const html = await fetchText(index + letters[i] + "/", 8000);
    if (!html) continue;
    const hrefs = html.match(/href="(https:\/\/www\.englishclub\.com\/ref\/esl\/Idioms\/[^"]+)"/g) || [];
    hrefs.forEach((item) => {
      const href = item.slice(6, -1);
      const slug = href.toLowerCase();
      const score = parts.reduce((sum, part) => sum + (slug.indexOf(part) >= 0 ? 1 : 0), 0);
      const need = parts.length > 1 ? Math.min(2, parts.length) : 1;
      if (parts.length && score > bestScore && score >= need) {
        best = href;
        bestScore = score;
      }
    });
    if (parts.length && bestScore >= parts.length) break;
  }
  if (!best) return { url: index + letter + "/" };
  const page = await fetchText(best, 8000);
  if (!page) return { url: best };
  const meaningMatch = page.match(/<h2>\s*Meaning\s*<\/h2>\s*<p>([\s\S]*?)<\/p>/i);
  const meaning = meaningMatch ? stripTags(meaningMatch[1]) : "";
  const start = page.toLowerCase().indexOf('class="example"');
  const chunk = start < 0 ? page : page.slice(start, start + 4000);
  const examples = [];
  const itemRe = /<li>([\s\S]*?)<\/li>/g;
  let raw = itemRe.exec(chunk);
  while (raw && examples.length < 6) {
    const text = stripTags(raw[1]);
    if (text && examples.indexOf(text) < 0) examples.push(text);
    raw = itemRe.exec(chunk);
  }
  return { url: best, meaning: meaning, examples: examples };
}

async function englishAtHomeLookup(word) {
  const index = "https://english-at-home.com/idioms/";
  const label = String(word || "").trim();
  const html = await fetchText("https://english-at-home.com/?s=" + encodeURIComponent(label), 8000);
  if (!html) return { url: index };
  const links = [];
  const hrefs = html.match(/href="(https:\/\/english-at-home\.com\/idioms\/[^"#]+)"/g) || [];
  hrefs.forEach((item) => {
    const href = item.slice(6, -1);
    if (href.replace(/\/$/, "") !== index.replace(/\/$/, "") && links.indexOf(href) < 0) links.push(href);
  });
  if (!links.length) return { url: "https://english-at-home.com/?s=" + encodeURIComponent(label) };
  const page = await fetchText(links[0], 8000);
  if (!page) return { url: index };
  const parts = (label.toLowerCase().match(/[a-z0-9]+/g) || []).filter((part) => part.length > 2);
  const blocks = page.match(/<p>\s*<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/p>/g) || [];
  for (let i = 0; i < blocks.length; i++) {
    const titleMatch = blocks[i].match(/<strong>([\s\S]*?)<\/strong>/);
    const restMatch = blocks[i].match(/<\/strong>([\s\S]*?)<\/p>/);
    const title = titleMatch ? stripTags(titleMatch[1]).toLowerCase() : "";
    if (parts.length && !parts.every((part) => title.indexOf(part) >= 0)) continue;
    const rest = restMatch ? stripTags(restMatch[1]) : "";
    const meaningMatch = rest.match(/^=\s*([^:]+):/);
    const quote = rest.match(/[“"]([^”"]+)[”"]/);
    return {
      url: links[0],
      meaning: meaningMatch ? meaningMatch[1].trim() : "",
      examples: quote ? [quote[1].trim()] : [],
    };
  }
  return { url: index };
}

function buildUsages(headword, sources) {
  const wooordhunt = sources.wooordhunt;
  const cambridge = sources.cambridge;
  const oxford = sources.oxford;
  const longman = sources.longman;
  const collins = sources.collins;
  const merriam = sources.merriam;
  const englishClub = sources.englishClub;
  const englishAtHome = sources.englishAtHome;
  const wiktionary = sources.wiktionary;
  const openRussian = sources.openRussian;
  const items = [];
  const seen = {};
  function add(english, russian, kind, source, trust) {
    const line = String(english || "").replace(/\s+/g, " ").trim().replace(/^[.…]+\s*/, "").replace(/…+$/g, "").trim();
    if (line.length < 3 || line.length > 320) return;
    if (!trust && !containsHead(line, headword)) return;
    const key = line.toLowerCase();
    if (seen[key] || key === String(headword || "").trim().toLowerCase()) return;
    seen[key] = true;
    items.push({ en: line, ru: String(russian || "").replace(/\s+/g, " ").trim(), kind: kind, source: source });
  }
  ((wooordhunt && wooordhunt.phrases) || []).forEach((phrase) => {
    const english = phrase.en || "";
    const short = (english.match(/[A-Za-z']+/g) || []).length <= 5;
    add(english, phrase.ru, usageKind(english, short), "Wooordhunt");
  });
  ((wooordhunt && wooordhunt.examples) || []).forEach((example) => add(example.en, example.ru, usageKind(example.en), "Wooordhunt"));
  ((cambridge && cambridge.examples) || []).forEach((english) => add(english, "", usageKind(english), "Cambridge"));
  ((oxford && oxford.examples) || []).forEach((english) => add(english, "", usageKind(english), "Oxford"));
  ((longman && longman.examples) || []).forEach((english) => add(english, "", usageKind(english), "Longman"));
  ((collins && collins.examples) || []).forEach((english) => add(english, "", usageKind(english), "Collins"));
  ((merriam && merriam.examples) || []).forEach((english) => add(english, "", usageKind(english), "Merriam-Webster"));
  ((englishClub && englishClub.examples) || []).forEach((english) => add(english, "", usageKind(english), "English Club", true));
  ((englishAtHome && englishAtHome.examples) || []).forEach((english) => add(english, "", usageKind(english), "English at Home", true));
  ((wiktionary && wiktionary.examples) || []).forEach((english) => add(english, "", usageKind(english), "Wiktionary"));
  const russianHead = isRussian(headword);
  ((openRussian && openRussian.examples) || []).forEach((example) => {
    if (russianHead) add(example.en || example.ru, example.en ? example.ru : "", usageKind(example.en || example.ru), "OpenRussian", true);
    else add(example.en, example.ru, usageKind(example.en), "OpenRussian");
  });
  const corpus = ((cambridge && cambridge.corpus) || []).slice().sort((a, b) => {
    const words = (text) => (String(text).match(/[A-Za-z']+/g) || []).length;
    return Math.abs(words(a) - 18) - Math.abs(words(b) - 18);
  });
  corpus.forEach((english) => add(english, "", "complex", "Cambridge"));
  const simple = items.filter((item) => item.kind === "simple");
  const complex = items.filter((item) => item.kind === "complex");
  const picked = simple.slice(0, 6).concat(complex.slice(0, 6));
  items.forEach((item) => {
    if (picked.length >= 14) return;
    if (picked.indexOf(item) < 0) picked.push(item);
  });
  ["Longman", "Collins", "Merriam-Webster", "English Club", "English at Home", "Wiktionary", "OpenRussian"].forEach((source) => {
    let have = picked.filter((row) => row.source === source).length;
    items.forEach((item) => {
      if (have >= 2 || picked.length >= 18) return;
      if (item.source === source && picked.indexOf(item) < 0) {
        picked.push(item);
        have += 1;
      }
    });
  });
  return picked;
}

async function pageLookup(url) {
  const html = await fetchText(url, 8000);
  return html || "";
}

function thirdPersonBases(word) {
  const w = String(word || "").trim().toLowerCase();
  if (!/^[a-z]+$/.test(w)) return [];
  if (w === "has") return ["have"];
  if (w === "does") return ["do"];
  if (w === "goes") return ["go"];
  if (w === "says") return ["say"];
  if (w.length < 4 || w.charAt(w.length - 1) !== "s" || w.slice(-2) === "ss") return [];
  const bases = [];
  if (w.slice(-3) === "ies") bases.push(w.slice(0, -3) + "y");
  if (w.slice(-2) === "es") {
    const stem = w.slice(0, -2);
    if (/(?:s|x|z|ch|sh|o)$/.test(stem)) bases.push(stem);
  }
  const simple = w.slice(0, -1);
  if (bases.indexOf(simple) < 0) bases.push(simple);
  return bases.filter((base) => base && base !== w && base.length > 1);
}

function contextAllowsThird(word, context) {
  const plural = { i: 1, we: 1, you: 1, they: 1, these: 1, those: 1, "i'm": 1, "we're": 1, "you're": 1, "they're": 1 };
  const singular = { he: 1, she: 1, it: 1, "he's": 1, "she's": 1, "it's": 1, who: 1, this: 1, that: 1, everybody: 1, everyone: 1, someone: 1, somebody: 1, nobody: 1, anybody: 1, anyone: 1 };
  const skip = { really: 1, always: 1, never: 1, also: 1, just: 1, still: 1, often: 1, usually: 1, already: 1, not: 1, even: 1, only: 1, sometimes: 1, ever: 1 };
  const tokens = String(context || "").toLowerCase().match(/[a-z']+/g) || [];
  const target = String(word || "").trim().toLowerCase();
  const at = tokens.indexOf(target);
  if (at < 0) return null;
  let prev = at - 1;
  while (prev >= 0 && skip[tokens[prev]]) prev -= 1;
  if (prev < 0) return null;
  if (plural[tokens[prev]]) return false;
  if (singular[tokens[prev]]) return true;
  return null;
}

function isVerbEntry(data, primaryOnly) {
  const cam = (data && data.cambridge) || {};
  const poses = (cam.poses && cam.poses.length ? cam.poses : (cam.pos ? [cam.pos] : [])).map((item) => String(item).toLowerCase());
  if (!poses.length) return false;
  if (primaryOnly) return poses[0].indexOf("verb") >= 0;
  return poses.some((item) => item.indexOf("verb") >= 0);
}

async function dictionaryLookup(word) {
  const label = tidyQuery(word);
  if (!label) return { found: false, word: "" };
  const slug = slugOxford(label);
  const wooordhuntUrl = "https://wooordhunt.ru/word/" + encodeURIComponent(slugWooordhunt(label));
  const cambridgeUrl = "https://dictionary.cambridge.org/dictionary/english/" + encodeURIComponent(slugCambridge(label));
  const oxfordUrl = "https://www.oxfordlearnersdictionaries.com/definition/english/" + encodeURIComponent(slug);
  const longmanUrl = "https://www.ldoceonline.com/dictionary/" + encodeURIComponent(slug);
  const collinsUrl = "https://www.collinsdictionary.com/dictionary/english/" + encodeURIComponent(slug);
  const merriamUrl = "https://www.merriam-webster.com/dictionary/" + encodeURIComponent(label.trim().toLowerCase());
  let letter = "";
  for (let i = 0; i < label.length; i++) {
    if (/[A-Za-z]/.test(label[i])) { letter = label[i].toLowerCase(); break; }
  }
  const [wiktionary, wikdict, openRussian, englishClub, englishAtHome, wooordhuntHtml, cambridgeHtml, oxfordHtml, longmanHtml, collinsHtml, merriamHtml] = await Promise.all([
    wiktionaryLookup(label),
    wikdictLookup(label),
    openRussianLookup(label),
    englishClubLookup(label),
    englishAtHomeLookup(label),
    pageLookup(wooordhuntUrl),
    pageLookup(cambridgeUrl),
    pageLookup(oxfordUrl),
    pageLookup(longmanUrl),
    pageLookup(collinsUrl),
    pageLookup(merriamUrl),
  ]);
  const wooordhunt = parseWooordhunt(wooordhuntHtml);
  const cambridge = parseCambridge(cambridgeHtml);
  const oxford = parseOxford(oxfordHtml);
  const longman = parseLongman(longmanHtml);
  const collins = parseCollins(collinsHtml);
  const merriam = parseMerriam(merriamHtml);
  const russian = isRussian(label);
  let ru = russian ? label : ((wooordhunt && wooordhunt.gloss) || "");
  let ruSource = ru && !russian ? "Wooordhunt" : "";
  if (!ru && wiktionary.ru) { ru = wiktionary.ru; ruSource = "Wiktionary"; }
  if (!ru && wikdict.ru) { ru = wikdict.ru; ruSource = "WikDict"; }
  if (!ru && openRussian.ru) { ru = openRussian.ru; ruSource = "OpenRussian"; }
  const en = russian ? (wiktionary.en || wikdict.en || openRussian.en || "") : label;
  const head = russian ? String(en.split(",")[0] || "").trim() : label;
  const sources = { wooordhunt: wooordhunt, cambridge: cambridge, oxford: oxford, longman: longman, collins: collins, merriam: merriam, englishClub: englishClub, englishAtHome: englishAtHome, wiktionary: wiktionary, openRussian: openRussian };
  let usages = buildUsages(head || label, sources);
  if (!usages.length && !russian) {
    const stem = contentHead(label);
    if (stem && stem !== String(label).trim().toLowerCase()) {
      const extra = await stemPages(stem);
      sources.wooordhunt = mergeSource(sources.wooordhunt, extra.wooordhunt);
      sources.cambridge = mergeSource(sources.cambridge, extra.cambridge);
      sources.oxford = mergeSource(sources.oxford, extra.oxford);
      sources.longman = mergeSource(sources.longman, extra.longman);
      usages = buildUsages(head || label, sources);
      if (!usages.length) usages = buildUsages(stem, sources);
    }
    if (!usages.length) usages = await tatoebaUsages(head || label);
  }
  const found = !!(head && (
    ru
    || (cambridge && (cambridge.definition || (cambridge.examples || []).length))
    || (oxford && (oxford.examples || []).length)
    || (wooordhunt && (wooordhunt.gloss || (wooordhunt.examples || []).length))
    || (longman && (longman.definition || (longman.examples || []).length))
    || (collins && (collins.definition || (collins.examples || []).length))
    || (merriam && (merriam.definition || (merriam.examples || []).length))
    || (englishClub && (englishClub.meaning || (englishClub.examples || []).length))
    || (englishAtHome && (englishAtHome.meaning || (englishAtHome.examples || []).length))
    || (wiktionary.translations || []).length
    || (wiktionary.examples || []).length
    || (wikdict.translations || []).length
    || (openRussian.translations || []).length
    || (openRussian.examples || []).length
    || usages.length
  ));
  return {
    found: found,
    word: head || label,
    ru: ru,
    ruSource: ruSource,
    direction: russian ? "ru" : "en",
    query: label,
    englishAlts: [],
    usages: usages,
    wooordhunt: wooordhunt,
    cambridge: cambridge,
    oxford: oxford,
    longman: longman,
    collins: collins,
    merriam: merriam,
    englishClub: englishClub,
    englishAtHome: englishAtHome,
    wiktionary: wiktionary,
    wikdict: wikdict,
    openRussian: openRussian,
    links: {
      wooordhunt: wooordhuntUrl,
      cambridge: cambridgeUrl,
      oxford: oxfordUrl,
      longman: longmanUrl,
      collins: collinsUrl,
      merriamWebster: merriamUrl,
      englishClub: englishClub.url || "https://www.englishclub.com/ref/Idioms/",
      idiomConnection: "https://www.idiomconnection.com/" + (letter ? letter + "quiz.html" : ""),
      learnEnglishToday: "https://www.learn-english-today.com/idioms/idioms_proverbs.html",
      eslCafe: "https://www.eslcafe.com/resources/idioms",
      learnEnglishDe: "https://www.learnenglish.de/idiompage.html",
      englishAtHome: englishAtHome.url || "https://english-at-home.com/idioms/",
      britishCouncil: "https://learnenglish.britishcouncil.org/search?keys=" + encodeURIComponent(label),
      perfectEnglish: "https://www.perfect-english-grammar.com/?s=" + encodeURIComponent(label),
      wiktionary: wiktionary.url,
      wikdict: wikdict.url,
      openRussian: openRussian.url,
      freeDict: "https://freedict.org/",
    },
  };
}

async function lookupWithThirdPerson(word, context) {
  const data = await dictionaryLookup(word);
  const label = tidyQuery(word);
  if (!label || isRussian(label) || /\s/.test(label)) return data;
  const allow = contextAllowsThird(label, context);
  if (allow === false) return data;
  const bases = thirdPersonBases(label);
  if (!bases.length) return data;
  const surfaceVerb = isVerbEntry(data, true);
  if (data.found && data.ru && surfaceVerb) {
    const baseData = await dictionaryLookup(bases[0]);
    if (baseData.found && isVerbEntry(baseData, allow !== true)) {
      data.base = bases[0];
      data.grammar = {
        form: "third-person singular",
        note: "The verb takes an -s because it is used in the third person singular."
      };
    }
    return data;
  }
  if (data.found && data.ru && allow !== true) return data;
  for (let i = 0; i < bases.length; i++) {
    const baseData = await dictionaryLookup(bases[i]);
    if (!baseData.found || !baseData.ru || !isVerbEntry(baseData, allow !== true)) continue;
    const verbGloss = baseData.wooordhunt && baseData.wooordhunt.verbGloss;
    if (verbGloss) {
      baseData.ru = verbGloss;
      baseData.ruSource = "Wooordhunt";
    }
    baseData.word = label;
    baseData.query = label;
    baseData.base = bases[i];
    baseData.grammar = {
      form: "third-person singular",
      note: "The verb takes an -s because it is used in the third person singular."
    };
    return baseData;
  }
  return data;
}

async function translateSelection(word) {
  const label = tidyQuery(word);
  if (!label) return { word: "", lines: [], links: {} };
  const pair = isRussian(label) ? "ru-en" : "en-ru";
  const wikiPage = "https://" + (isRussian(label) ? "ru" : "en") + ".wiktionary.org/wiki/" + encodeURIComponent(label.replace(/ /g, "_"));
  const [wiktionary, wikdict, openRussian] = await Promise.all([
    wiktionaryLookup(label),
    wikdictLookup(label),
    openRussianLookup(label),
  ]);
  const lines = [];
  const wikiText = wiktionary.en || wiktionary.ru || "";
  if (wikiText) lines.push({ source: "Wiktionary", text: wikiText, note: wiktionary.definition || "" });
  const dictText = wikdict.en || wikdict.ru || "";
  if (dictText) lines.push({ source: "WikDict", text: dictText, note: (wikdict.notes || [""])[0] || "" });
  const openText = openRussian.en || openRussian.ru || "";
  if (openText) lines.push({ source: "OpenRussian", text: openText, note: "" });
  return {
    word: label,
    lines: lines,
    links: {
      wiktionary: wiktionary.url || wikiPage,
      wikdict: wikdict.url || ("https://www.wikdict.com/" + pair + "/" + encodeURIComponent(label)),
      openRussian: openRussian.url || "https://en.openrussian.org/dictionary",
      freeDict: "https://freedict.org/",
    },
  };
}

function sameSiteMutation(request, url) {
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch (e) {
      return false;
    }
  }
  const site = request.headers.get("Sec-Fetch-Site");
  return site !== "cross-site";
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") return Response.redirect(new URL("/preview.html", request.url), 302);
    if (url.pathname === "/lookup" && request.method === "GET") {
      const user = await currentUser(env, request);
      if (!user) return json({ error: "Sign in first." }, 401);
      const word = (url.searchParams.get("word") || "").trim();
      const context = (url.searchParams.get("context") || "").trim();
      if (!word || word.length > 80) return json({ error: "Type a word or a short phrase." }, 400);
      const data = await lookupWithThirdPerson(word, context);
      if (!data.found) return json({ error: "No such word or phrase.", found: false }, 404);
      return json(data);
    }
    if (url.pathname === "/translate" && request.method === "GET") {
      const user = await currentUser(env, request);
      if (!user) return json({ error: "Sign in first." }, 401);
      const word = (url.searchParams.get("word") || "").trim();
      if (!word || word.length > 80) return json({ error: "Type a word or a short phrase." }, 400);
      return json(await translateSelection(word));
    }
    if ((request.method === "POST" || request.method === "PUT" || request.method === "DELETE") && !sameSiteMutation(request, url)) {
      return json({ error: "The request was not valid." }, 403);
    }
    if (url.pathname === "/api/song-file") return songFile(request, env);
    if (url.pathname === "/api/lesson-file") return lessonFile(request, env);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env, ctx); }
      catch (error) {
        const problem = statedProblem(error);
        return json({ error: problem }, problemStatus(error, problem));
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
