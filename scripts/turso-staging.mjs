// Staging-only setup, without dependencies. Never reads D1 or R2.
// Protocol: https://github.com/tursodatabase/libsql/blob/main/docs/HTTP_V2_SPEC.md
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadataSql = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
const schema = readFileSync(resolve(root, 'migrations/turso/001_content_schema.sql'), 'utf8');
const auditSchema = readFileSync(resolve(root, 'migrations/turso/002_import_audit.sql'), 'utf8');

function credentials() {
  // A second test target must not replace the running interface's credentials.
  const varsFile = process.env.TURSO_STAGE_VARS_FILE || resolve(root, '.dev.vars');
  if (!varsFile.startsWith('/') || varsFile.includes('\0')) throw new Error('Use an absolute private test credential file');
  const vars = new Map();
  for (const line of readFileSync(varsFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(TURSO_URL|TURSO_AUTH_TOKEN)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    if (vars.has(match[1])) throw new Error('Duplicate credential key in .dev.vars');
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    vars.set(match[1], value);
  }
  if (!vars.get('TURSO_URL') || !vars.get('TURSO_AUTH_TOKEN')) {
    throw new Error('Fill TURSO_URL and TURSO_AUTH_TOKEN in .dev.vars');
  }
  let url;
  try { url = new URL(vars.get('TURSO_URL')); } catch { throw new Error('Invalid TURSO_URL'); }
  if (!['libsql:', 'https:'].includes(url.protocol)
      || !/^english-quiz-test-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.turso\.io$/.test(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash
      || (url.pathname && url.pathname !== '/')) {
    throw new Error('Only the english-quiz-test database at turso.io is allowed');
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(vars.get('TURSO_AUTH_TOKEN'))) {
    throw new Error('Invalid database token format; use a database JWT, not a platform API key');
  }
  return { endpoint: `https://${url.hostname}/v2/pipeline`, token: vars.get('TURSO_AUTH_TOKEN') };
}

function execute(sql) { return { type: 'execute', stmt: { sql } }; }

async function pipeline(config, requests) {
  let response;
  try {
    response = await fetch(config.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ requests: [...requests, { type: 'close' }] })
    });
  } catch (error) {
    // Do not echo URLs, request headers, or credentials in diagnostic output.
    const code = error.cause?.code || error.name || 'NETWORK_ERROR';
    throw new Error(`Turso connection failed (${code}); no automatic retry`);
  }
  if (!response.ok) throw new Error(`Turso returned HTTP ${response.status}; no automatic retry`);
  const body = await response.json();
  if (!Array.isArray(body.results) || body.results.length !== requests.length + 1) {
    throw new Error('Unexpected Turso response');
  }
  for (let i = 0; i < body.results.length; i++) {
    const result = body.results[i];
    if (result.type !== 'ok') {
      const code = result.error?.code || 'SQL_ERROR';
      throw new Error(`Turso operation ${i + 1} failed (${code}); transaction closed`);
    }
    if (result.response?.type !== (requests[i]?.type || 'close')) {
      throw new Error('Unexpected Turso operation response');
    }
  }
  if (body.baton != null) throw new Error('Turso connection was not closed');
  return body.results.slice(0, requests.length).map(item => item.response);
}

function rows(response) {
  const result = response.result;
  return result.rows.map(row => Object.fromEntries(result.cols.map((col, i) => {
    const cell = row[i];
    return [col.name, cell.type === 'null' ? null : cell.type === 'integer' ? Number(cell.value) : cell.value];
  })));
}

function expectedMetadata(includeAudit = true) {
  return JSON.parse(execFileSync('sqlite3', ['-json', ':memory:'], {
    input: schema + '\n' + (includeAudit ? auditSchema : '') + '\n' + metadataSql + ';\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }));
}

function verifyMetadata(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Database schema differs from the local draft; refusing to modify existing tables');
}

function guardedSchema() {
  // Check emptiness under the same write lock as the DDL, not only before it.
  // sequence stops on the first error; close rolls back an uncommitted transaction.
  return schema.replace(/\bBEGIN\s*;/, `BEGIN IMMEDIATE;
CREATE TEMP TABLE staging_empty_guard (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO staging_empty_guard SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'
) THEN 1 ELSE 0 END;
DROP TABLE staging_empty_guard;`);
}

function smokeSql() {
  const id = randomUUID(); // SQL fixture keys are generated here, never user input.
  return `PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TEMP TABLE staging_assert (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO staging_assert SELECT (SELECT foreign_keys FROM pragma_foreign_keys) = 1;
INSERT INTO account_refs(id) VALUES ('a-${id}'), ('b-${id}');
INSERT INTO study_profiles(id,kind) VALUES ('p-${id}','personal'), ('r-${id}','personal');
INSERT INTO profile_members(account_id,profile_id) VALUES ('a-${id}','p-${id}'), ('b-${id}','r-${id}');
INSERT INTO cards(id,scope,en,word_key,ru) VALUES ('c-${id}','shared','staging check','staging check','before');
INSERT INTO profile_cards(profile_id,card_id,place) VALUES ('p-${id}','c-${id}','mine'), ('r-${id}','c-${id}','mine');
UPDATE cards SET ru='after',revision=revision+1 WHERE id='c-${id}' AND revision=1;
INSERT INTO staging_assert SELECT changes()=1;
UPDATE cards SET ru='stale',revision=revision+1 WHERE id='c-${id}' AND revision=1;
INSERT INTO staging_assert SELECT changes()=0;
INSERT INTO staging_assert SELECT (SELECT ru FROM cards WHERE id='c-${id}')='after';
INSERT INTO staging_assert SELECT (SELECT count(DISTINCT card_id) FROM profile_cards WHERE card_id='c-${id}')=1;
INSERT INTO card_progress(profile_id,card_id,learned) VALUES ('p-${id}','c-${id}',1), ('r-${id}','c-${id}',0);
INSERT INTO staging_assert SELECT (SELECT learned FROM card_progress WHERE profile_id='r-${id}' AND card_id='c-${id}')=0;
INSERT INTO quiz_collections(id) VALUES ('qc-${id}');
INSERT INTO card_quiz_collections(card_id,collection_id) VALUES ('c-${id}','qc-${id}');
INSERT INTO quizzes(id,collection_id,position,type) VALUES ('q1-${id}','qc-${id}',0,'Flip'), ('q2-${id}','qc-${id}',1,'Build');
UPDATE quizzes SET deleted_at=unixepoch(),revision=revision+1 WHERE id='q1-${id}' AND revision=1;
INSERT INTO staging_assert SELECT (SELECT count(*) FROM quizzes WHERE collection_id='qc-${id}' AND deleted_at IS NULL)=1;
ROLLBACK;`;
}

async function main() {
  const mode = process.argv[2] || 'check';
  if (!['check', 'init', 'verify'].includes(mode) || process.argv.length > 3) {
    throw new Error('Usage: node scripts/turso-staging.mjs check|init|verify');
  }
  const config = credentials();
  const expected = expectedMetadata();
  const [metadata] = await pipeline(config, [execute(metadataSql)]);
  const actual = rows(metadata);
  if (mode === 'check') {
    console.log(`OK: connected to english-quiz-test; ${actual.filter(item => item.type === 'table').length} user tables; read-only check`);
    return;
  }
  if (mode === 'init' && actual.length === 0) {
    const [_, applied, version] = await pipeline(config, [
      { type: 'sequence', sql: guardedSchema() + '\n' + auditSchema }, execute(metadataSql),
      execute('SELECT version FROM schema_migrations ORDER BY version')
    ]);
    verifyMetadata(rows(applied), expected);
    if (!isDeepStrictEqual(rows(version), [{ version: 1 }, { version: 2 }])) throw new Error('Unexpected schema version');
    console.log('OK: schemas v1/v2 created in the empty test database');
  } else if (mode === 'init' && isDeepStrictEqual(actual, expectedMetadata(false))) {
    const [_, applied] = await pipeline(config, [{ type: 'sequence', sql: auditSchema }, execute(metadataSql)]);
    verifyMetadata(rows(applied), expected);
    console.log('OK: import-audit schema v2 applied transactionally; existing content untouched');
  } else {
    verifyMetadata(actual, expected);
    console.log('OK: existing test schema matches; no DDL applied');
  }
  const [_, versions, fixtures] = await pipeline(config, [
    { type: 'sequence', sql: smokeSql() },
    execute('SELECT version FROM schema_migrations ORDER BY version'),
    execute("SELECT (SELECT count(*) FROM account_refs) AS accounts, (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM quizzes) AS quizzes")
  ]);
  if (!isDeepStrictEqual(rows(versions), [{ version: 1 }, { version: 2 }])) throw new Error('Unexpected schema version');
  // New staging databases must contain no persistent fixtures after rollback.
  if (mode === 'init' && actual.length === 0 && !isDeepStrictEqual(rows(fixtures), [{ accounts: 0, cards: 0, quizzes: 0 }])) {
    throw new Error('Unexpected persistent data after test rollback');
  }
  console.log('OK: live revision/shared-card/progress/quiz-deletion checks passed; fixtures rolled back');
}

export { credentials, execute, pipeline, rows, expectedMetadata, verifyMetadata, metadataSql };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
