// Read-only source snapshot. No production uploads, deletes, or SQL writes.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = data => createHash('sha256').update(data).digest('hex');
const config = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');
const account = config.match(/^account_id\s*=\s*"([a-f0-9]{32})"/m)?.[1];
const database = config.match(/^database_id\s*=\s*"([a-f0-9-]{36})"/m)?.[1];
const bucket = config.match(/^bucket_name\s*=\s*"([a-z0-9-]+)"/m)?.[1];
if (!account || !database || bucket !== 'learn-english-media') throw new Error('Unexpected source configuration');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
let requests = 0;

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const saved = readFileSync(resolve(homedir(), '.wrangler/config/default.toml'), 'utf8');
  const value = saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  const expiry = saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
  if (!value || !expiry || Date.parse(expiry) <= Date.now()) {
    throw new Error('Cloudflare login unavailable/expired; refresh the existing Wrangler login');
  }
  return value;
}

async function request(path, bearer, query = false) {
  requests++;
  // POST is permitted only for this one literal read-only account SELECT.
  const response = await fetch(base + path, {
    method: query ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${bearer}`, 'Accept-Encoding': 'identity', ...(query ? { 'Content-Type': 'application/json' } : {}) },
    ...(query ? { body: JSON.stringify({ sql: 'SELECT id, login, role, active, is_personal_data_revoked FROM users ORDER BY id', params: [] }) } : {})
  });
  if (!response.ok) throw new Error(`Cloudflare source read failed: HTTP ${response.status}; no retry`);
  return response;
}

async function list(bearer) {
  const objects = [];
  let cursor = '';
  const seen = new Set();
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ per_page: '1000' });
    if (cursor) query.set('cursor', cursor);
    const body = await (await request(`/r2/buckets/${bucket}/objects?${query}`, bearer)).json();
    if (!body.success || !Array.isArray(body.result)) throw new Error('Unexpected R2 listing');
    objects.push(...body.result);
    if (!body.result_info?.is_truncated) return objects;
    cursor = body.result_info.cursor;
    if (!cursor || seen.has(cursor)) throw new Error('Invalid R2 pagination cursor');
    seen.add(cursor);
  }
  throw new Error('R2 listing exceeds the bounded 10-page snapshot limit');
}

async function main() {
  const mode = process.argv[2];
  if (!['inventory', 'snapshot'].includes(mode) || process.argv.length > 4) throw new Error('Usage: node scripts/cloudflare-snapshot.mjs inventory|snapshot [prior-snapshot]');
  const bearer = token();
  const objects = await list(bearer);
  if (mode === 'inventory') {
    const json = objects.filter(item => /\.json$/.test(item.key));
    console.log(JSON.stringify({ objects: objects.length, jsonObjects: json.length, jsonBytes: json.reduce((n, item) => n + item.size, 0), requests }));
    return;
  }
  let accounts;
  let accountsReadAt = new Date().toISOString();
  const prior = process.argv[3];
  if (prior) {
    if (!/^\/private\/tmp\/english-quiz-snapshot-[A-Za-z0-9]+$/.test(prior)) throw new Error('Invalid prior snapshot path');
    const previous = JSON.parse(readFileSync(resolve(prior, 'manifest.json'), 'utf8'));
    const bytes = readFileSync(resolve(prior, 'accounts.json'));
    if (previous.account !== account || previous.bucket !== bucket
        || (previous.accountsSha256 && sha(bytes) !== previous.accountsSha256)
        || (!previous.accountsSha256 && previous.status !== 'incomplete')) throw new Error('Prior account snapshot failed verification');
    accounts = JSON.parse(bytes);
    accountsReadAt = previous.accountsReadAt || previous.startedAt;
  } else {
    const data = await (await request(`/d1/database/${database}/query`, bearer, true)).json();
    if (!data.success || data.result?.length !== 1 || !data.result[0].success) throw new Error('Account SELECT failed');
    accounts = data.result[0].results;
  }
  if (!Array.isArray(accounts)) throw new Error('Unexpected account result');
  const active = new Set(accounts.filter(row => row.active && !row.is_personal_data_revoked).map(row => row.id));
  const selected = objects.filter(item => {
    if (/^(shared|pair)\/[^/]+\.json$/.test(item.key)) return true;
    const match = item.key.match(/^([^/]+)\/(account-state|added|songs|texts)\.json$/);
    return match && active.has(match[1]);
  }).sort((a, b) => a.key.localeCompare(b.key));
  if (selected.length > 200 || selected.some(item => item.size > 8 * 1024 * 1024)) throw new Error('Snapshot exceeds the bounded JSON limits');
  const directory = mkdtempSync('/private/tmp/english-quiz-snapshot-');
  mkdirSync(resolve(directory, 'objects'), { mode: 0o700 });
  const manifest = { version: 1, status: 'incomplete', startedAt: new Date().toISOString(), accountsReadAt, account, bucket, accountsSha256: '', objects: [], inventory: objects, sourceRequests: 0 };
  const save = () => writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  save();
  const accountBytes = JSON.stringify(accounts);
  writeFileSync(resolve(directory, 'accounts.json'), accountBytes, { mode: 0o600 });
  manifest.accountsSha256 = sha(accountBytes);
  save();
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i];
    const path = item.key.split('/').map(encodeURIComponent).join('/');
    const response = await request(`/r2/buckets/${bucket}/objects/${path}`, bearer);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Object exceeds size limit');
    const etag = response.headers.get('etag')?.replace(/^W\//, '').replace(/^"|"$/g, '');
    const md5Matches = /^[a-f0-9]{32}$/.test(item.etag) && createHash('md5').update(bytes).digest('hex') === item.etag;
    if ((!md5Matches && etag !== item.etag) || bytes.length !== item.size) {
      throw new Error(`Snapshot metadata mismatch: etagPresent=${!!etag}, etagMatches=${etag === item.etag}, md5Matches=${md5Matches}, sizeMatches=${bytes.length === item.size}; incomplete snapshot retained at ${directory}`);
    }
    JSON.parse(bytes.toString('utf8')); // Reject invalid JSON rather than silently importing an empty value.
    const file = `objects/${sha(item.key)}.json`;
    writeFileSync(resolve(directory, file), bytes, { mode: 0o600 });
    manifest.objects.push({ key: item.key, file, etag: item.etag, bytes: bytes.length, sha256: sha(bytes) });
    save();
    console.log(`Snapshot JSON ${i + 1}/${selected.length}`);
  }
  const after = await list(bearer);
  const beforeMap = new Map(objects.map(item => [item.key, item.etag]));
  const afterMap = new Map(after.map(item => [item.key, item.etag]));
  // Detect changes in selected objects and new relevant JSONs; not a global atomic backup.
  const relevant = key => /^(shared|pair)\/[^/]+\.json$/.test(key)
    || (active.has(key.split('/')[0]) && /\/(account-state|added|songs|texts)\.json$/.test(key));
  for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    if (relevant(key) && beforeMap.get(key) !== afterMap.get(key)) throw new Error('Source changed during snapshot; incomplete snapshot retained');
  }
  manifest.status = 'complete';
  manifest.completedAt = new Date().toISOString();
  manifest.sourceRequests = requests;
  save();
  console.log(JSON.stringify({ snapshot: directory, accounts: active.size, objects: selected.length, bytes: manifest.objects.reduce((n, item) => n + item.bytes, 0), sourceRequests: requests, d1Selects: prior ? 0 : 1 }));
}

main().catch(error => {
  console.error(error.message === 'fetch failed' ? `Cloudflare connection failed (${error.cause?.code || 'NETWORK_ERROR'})` : error.message);
  process.exitCode = 1;
});
