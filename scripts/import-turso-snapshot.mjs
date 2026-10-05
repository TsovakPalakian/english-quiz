// Offline, deterministic planning + staging-only import. Never writes Cloudflare.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { credentials, pipeline, execute, rows, metadataSql, expectedMetadata, verifyMetadata } from './turso-staging.mjs';
import {retainedScope} from './turso-retained-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const key = value => String(value || '').trim().toLowerCase();
const array = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([name]) => !keys.includes(name)));
const merge = (primary, secondary, identify) => [...new Map([...secondary, ...primary].map(item => [identify(item), item])).values()];
const addedKey = row => (row.place || 'mine') + '|' + key(row.word);
const tables = {
  migration_runs: ['id'], migration_sources: ['migration_id','source_key'],
  account_refs: ['id'], study_profiles: ['id'], profile_members: ['account_id'],
  lessons: ['id'], cards: ['id'], lesson_blocks: ['lesson_id','id'],
  quiz_collections: ['id'], card_quiz_collections: ['card_id','collection_id'], quizzes: ['id'],
  library_items: ['id'], profile_library_items: ['profile_id','item_id'],
  profile_cards: ['profile_id','card_id','place'], card_progress: ['profile_id','card_id'],
  quiz_progress: ['profile_id','card_id','quiz_type'], lesson_access: ['account_id','lesson_id'],
  account_settings: ['account_id','key'], profile_settings: ['profile_id','key'],
  catalog_documents: ['namespace','key'], legacy_ids: ['entity_kind','source_namespace','source_key','target_id'],
  migration_issues: ['id']
};

export function build(directory,{scopeAnchor=null}={}) {
  directory = realpathSync(directory);
  if (directory === root || directory.startsWith(root + '/')) throw new Error('Snapshot must be outside published assets');
  const manifestBytes = readFileSync(resolve(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.version !== 1 || manifest.status !== 'complete' || manifest.bucket !== 'learn-english-media') throw new Error('A completed source snapshot is required');
  const accountBytes = readFileSync(resolve(directory, 'accounts.json'));
  if (hash(accountBytes) !== manifest.accountsSha256) throw new Error('Account snapshot checksum mismatch');
  const scope=retainedScope(JSON.parse(accountBytes),manifest.objects.map(entry=>entry.key),scopeAnchor);
  const accounts=[scope.account];
  const sources = new Map();
  const sourceKeys=new Set();
  for (const entry of manifest.objects) {
    if (!/^objects\/[a-f0-9]{64}\.json$/.test(entry.file) || sourceKeys.has(entry.key)) throw new Error('Invalid/duplicate snapshot entry');
    sourceKeys.add(entry.key);
    if(!scope.includesSource(entry.key))continue;
    const bytes = readFileSync(resolve(directory, entry.file));
    if (hash(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw new Error('Source snapshot checksum mismatch');
    sources.set(entry.key, JSON.parse(bytes));
  }
  const localSources = [];
  const localDir = resolve(directory, 'local-catalogs');
  mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const sandbox = { window: {} };
  for (const name of ['lesson-data.js', 'irregular.js', 'grammar.js', 'speakout.js', 'demonstratives.js', 'tense-bank.json']) {
    if (!existsSync(resolve(root, name))) continue;
    const path = resolve(localDir, name);
    // Freeze first-plan versions; subsequent verification never picks up changed source files.
    if (!existsSync(path)) writeFileSync(path, readFileSync(resolve(root, name)), { mode: 0o600 });
    const bytes = readFileSync(path);
    localSources.push({ name, sha256: hash(bytes), bytes: bytes.length });
    if (name === 'tense-bank.json') sandbox.window.TENSE_BANK = JSON.parse(bytes);
    else if (name !== 'demonstratives.js') runInNewContext(bytes.toString('utf8'), sandbox, { timeout: 3000 });
  }
  const fingerprint = hash(canonical({ manifest: hash(manifestBytes), localSources, importerVersion: 2,scope:scope.anchor }));
  const runId = 'import_' + fingerprint;
  const model = Object.fromEntries(Object.keys(tables).map(name => [name, new Map()]));
  function add(table, row) {
    const id = canonical(tables[table].map(name => row[name]));
    const existing = model[table].get(id);
    if (existing && canonical(existing) !== canonical(row)) throw new Error(`Conflicting target identity in ${table}`);
    model[table].set(id, row);
    return row;
  }
  const sid = (kind, value) => kind + '_' + hash(canonical(value));
  function issue(source, reason, detail, sensitive = false) {
    add('migration_issues', { id: sid('issue', [source,reason,detail]), migration_id: runId, source_key: source, reason, detail_json: canonical(detail), sensitive: +sensitive, resolved: 0 });
  }
  function alias(kind, namespace, sourceKey, target) {
    add('legacy_ids', { entity_kind: kind, source_namespace: namespace, source_key: String(sourceKey), target_id: target, migration_id: runId });
  }
  const media = new Map();
  mkdirSync(resolve(directory, 'inline-media'), { recursive: true, mode: 0o700 });
  function externalize(value) {
    if (typeof value === 'string' && /^data:(image\/|audio\/|video\/|application\/pdf)/.test(value)) {
      const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match) throw new Error('Unsupported inline media encoding');
      const bytes = Buffer.from(match[2], 'base64');
      const digest = hash(bytes);
      const file = `inline-media/${digest}.bin`;
      if(existsSync(resolve(directory,file))){if(hash(readFileSync(resolve(directory,file)))!==digest)throw new Error('Existing inline media checksum mismatch.');}
      else writeFileSync(resolve(directory,file),bytes,{mode:0o600,flag:'wx'});
      media.set(digest, { sha256: digest, file, mime: match[1], bytes: bytes.length });
      // Internal placeholder; staged UI must resolve this to a private media URL.
      return 'migration-media:' + digest;
    }
    if (Array.isArray(value)) return value.map(externalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name,item]) => [name,externalize(item)]));
    return value;
  }
  add('migration_runs', { id: runId, source_manifest_sha256: fingerprint, status: 'importing' });
  add('migration_sources', { migration_id: runId, source_key: 'D1/account-ids', sha256: manifest.accountsSha256, etag: null, bytes: accountBytes.length });
  for (const entry of manifest.objects.filter(entry=>scope.includesSource(entry.key))) add('migration_sources', { migration_id: runId, source_key: entry.key, sha256: entry.sha256, etag: entry.etag, bytes: entry.bytes });
  for (const entry of localSources) add('migration_sources', { migration_id: runId, source_key: 'local/' + entry.name, sha256: entry.sha256, etag: null, bytes: entry.bytes });
  issue('local/catalogs', 'local-catalog-version-not-compared-with-deployed-assets', { files: localSources.map(entry => entry.name) });
  const globalEdits = object(sources.get('shared/card-edits.json'));
  const wordCards = new Map();
  function card(input, profile, namespace, sourceKey, added = false) {
    const originalWord = input.en || input.base || input.word;
    if (!key(originalWord)) throw new Error('Card without an English identity');
    const patch = profile ? {} : object(globalEdits[key(originalWord)]);
    const merged = { ...input, ...omit(patch, ['deleted']) };
    const en = String(merged.en || merged.base || merged.word);
    const definition = {
      en, word_key: key(en), ru: String(merged.ru || ''), part_of_speech: String(merged.pos || (merged.base ? 'verb' : '')),
      extra_json: canonical(externalize(omit(merged, ['en','base','word','ru','pos','place','id','origin','deleted'])))
    };
    // Private definitions remain private; identical meanings within a scope share one row.
    const id = sid('card', [profile || 'shared', definition, !!patch.deleted]);
    add('cards', { id, scope: profile ? 'profile' : 'shared', owner_profile_id: profile || null, ...definition, deleted_at: patch.deleted ? 0 : null });
    alias('card', namespace, sourceKey, id);
    const word = key(originalWord);
    if (!wordCards.has(word)) wordCards.set(word, new Set());
    wordCards.get(word).add(id);
    if (added) alias('added-card', namespace, addedKey(input), id);
    return id;
  }
  function catalog(value, namespace, pointer = '') {
    if (Array.isArray(value)) return value.map((item,i) => {
      if (item && typeof item === 'object' && (item.en || item.base)) return { cardId: card(item, null, namespace, pointer + '/' + i) };
      return catalog(item, namespace, pointer + '/' + i);
    });
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name,item]) => [name,catalog(item,namespace,pointer + '/' + name)]));
    return value;
  }
  for (const [name,value] of Object.entries(sandbox.window)) add('catalog_documents', { namespace: 'static', key: name, value_json: canonical(catalog(value, name)) });
  const demo = localSources.find(entry => entry.name === 'demonstratives.js');
  if (demo) add('catalog_documents', { namespace: 'static-source', key: demo.name, value_json: canonical({ file: 'local-catalogs/' + demo.name, sha256: demo.sha256 }) });
  const lessons = array(sources.get('shared/lessons.json')?.materials);
  const lessonIds = new Set();
  for (const lesson of lessons) {
    if (!lesson.id || lessonIds.has(lesson.id)) throw new Error('Missing/duplicate lesson ID');
    lessonIds.add(lesson.id);
    add('lessons', { id: lesson.id, title: String(lesson.title || ''), description: String(lesson.description || ''), class_name: String(lesson.className || ''), unit: String(lesson.unit || ''), lesson: String(lesson.lesson || ''), lesson_date: String(lesson.date || ''), mode: String(lesson.mode || ''), published: +!!lesson.published, hidden_from_students: +!!lesson.hiddenFromStudents, extra_json: canonical(externalize(omit(lesson, ['id','title','description','className','unit','lesson','date','mode','published','hiddenFromStudents','blocks']))) });
    array(lesson.blocks).forEach((block, position) => {
      if (!block.id || !block.type) throw new Error('Missing block identity/type');
      let content = omit(block, ['id','type','tab','response']);
      let cardId = null;
      if (block.type === 'wordcard') {
        cardId = card({ en: block.word, ru: block.ru, pos: block.pos, ...omit(block, ['id','type','tab','collapsed','word','ru','pos','response']) }, null, 'shared/lessons.json', lesson.id + '/' + block.id);
        content = omit(content, ['word','ru','pos','data','uk','us','level','gloss','ex','url']);
      }
      if (block.response !== undefined && block.response !== '') issue('shared/lessons.json', 'unknown-lesson-response-owner', { lessonId: lesson.id, blockId: block.id, sourceValuePreservedInArchive:true }, true);
      add('lesson_blocks', { lesson_id: lesson.id, id: block.id, position, type: block.type, tab: block.tab || '', card_id: cardId, content_json: canonical(externalize(content)) });
    });
  }
  const pairProfile=scope.anchor.pairedSource?scope.anchor.profileId:null;
  if(scope.anchor.pairedSource){
    const study=sources.get('pair/tsovak-study.json');
    if(!study||Array.isArray(study)||typeof study!=='object'||!Array.isArray(study.added)||!Array.isArray(study.songs))
      throw new Error('Invalid former-pair study source. Refusing an empty substitution.');
  }
  const profiles = new Map();
  for (const account of accounts) {
    const profile=scope.anchor.profileId;
    add('account_refs', { id: account.id });
    add('study_profiles', { id: profile, kind:'personal' });
    add('profile_members', { account_id: account.id, profile_id: profile });
    if (!profiles.has(profile)) profiles.set(profile, []);
    profiles.get(profile).push(account);
    const stats = object(sources.get(account.id + '/account-state.json')?.stats);
    const allowed = new Set(array(stats.allowedLessons));
    const hidden = new Set(array(stats.hiddenLessons));
    for (const lessonId of new Set([...allowed,...hidden])) {
      if (lessonIds.has(lessonId)) add('lesson_access', { account_id: account.id, lesson_id: lessonId, allow_hidden: +allowed.has(lessonId), personal_hidden: +hidden.has(lessonId) });
      else issue(account.id + '/account-state.json', 'access-to-missing-lesson', { lessonId });
    }
    for (const [name,value] of Object.entries(stats)) {
      if (['allowedLessons','hiddenLessons','mistakes','cardQuizzes','cardEdits'].includes(name)) continue;
      if (profile === pairProfile && Object.hasOwn(object(sources.get('pair/tsovak-settings.json')), name)) continue;
      add('account_settings', { account_id: account.id, key: name, value_json: canonical(externalize(value)) });
    }
    if (stats.cardQuizzes) issue(account.id + '/account-state.json', 'legacy-quizzes-not-authoritative', { words: Object.keys(stats.cardQuizzes).length });
    if (stats.cardEdits && Object.keys(stats.cardEdits).length) issue(account.id + '/account-state.json', 'legacy-card-edits-not-authoritative', { words: Object.keys(stats.cardEdits).length });
  }
  const pairSongs = array(sources.get('pair/tsovak-songs.json'));
  const pairStudy = object(sources.get('pair/tsovak-study.json'));
  const hiddenSongIds = new Set([...pairSongs,...array(pairStudy.songs)].map(row=>row.id));
  const pairTexts = array(sources.get('pair/tsovak-texts.json'));
  const hiddenTextIds = new Set(pairTexts.map(row=>row.id));
  for (const [profile,members] of profiles) {
    const paired = profile === pairProfile;
    const account = members[0];
    const namespace = paired ? 'pair/tsovak-study.json' : account.id + '/account-state.json';
    const state = object(sources.get(namespace));
    const stats = paired ? { mistakes: array(state.mistakes) } : object(state.stats);
    if (paired) {
      for (const member of members) {
        const projected = object(sources.get(member.id + '/account-state.json'));
        for (const field of ['added','songs','learned','variants']) {
          if (canonical(projected[field] ?? (field === 'variants' ? {} : [])) !== canonical(state[field] ?? (field === 'variants' ? {} : []))) {
            issue(member.id + '/account-state.json', 'paired-projection-differs-from-shared-source', { field }, true);
          }
        }
      }
      for (const [name,value] of Object.entries(object(sources.get('pair/tsovak-settings.json')))) {
        if (name === 'cardQuizzes') { issue('pair/tsovak-settings.json', 'legacy-quizzes-not-authoritative', { words: Object.keys(object(value)).length }); continue; }
        add('profile_settings', { profile_id: profile, key: name, value_json: canonical(externalize(value)) });
      }
      if (Object.keys(object(state.cardEdits)).length) issue(namespace, 'legacy-card-edits-not-authoritative', { words: Object.keys(state.cardEdits).length });
    }
    const cardSide = array(sources.get(paired ? 'pair/tsovak-added.json' : account.id + '/added.json'));
    const added = merge(cardSide, array(state.added), addedKey); // Same precedence as current withSidecars().
    added.forEach((entry,position) => {
      const id = card(entry, profile, namespace, addedKey(entry), true);
      add('profile_cards', { profile_id: profile, card_id: id, place: entry.place || 'mine', position });
    });
    function resolveProgress(word) {
      const choices = [...(wordCards.get(key(word)) || [])].map(id=>model.cards.get(canonical([id]))).filter(row=>row.owner_profile_id === profile);
      const shared = [...(wordCards.get(key(word)) || [])].map(id=>model.cards.get(canonical([id]))).filter(row=>row.scope === 'shared' && row.deleted_at === null);
      const candidates = choices.length ? choices : shared;
      return candidates.length === 1 ? candidates[0].id : null;
    }
    const learned = new Set(array(state.learned).map(key));
    const variants = object(state.variants);
    for (const word of new Set([...learned,...Object.keys(variants)])) {
      const cardId = resolveProgress(word);
      if (!cardId) { issue(namespace, 'unmapped-word-progress', { word, learned: learned.has(key(word)), variants: variants[word] }, true); continue; }
      add('card_progress', { profile_id: profile, card_id: cardId, learned: +learned.has(key(word)), variants_json: canonical(variants[word] ?? {}) });
    }
    for (const mistake of array(stats.mistakes)) {
      const cardId = resolveProgress(mistake.en);
      if (!cardId) { issue(namespace, 'unmapped-quiz-progress', mistake, true); continue; }
      add('quiz_progress', { profile_id: profile, card_id: cardId, quiz_type: String(mistake.type), progress_json: canonical(mistake) });
    }
    const songsSide = array(sources.get(paired ? 'pair/tsovak-songs.json' : account.id + '/songs.json'));
    let songs = merge(songsSide, array(state.songs), row=>row.id);
    if (!paired) songs = songs.filter(row=>!hiddenSongIds.has(row.id));
    const texts = paired ? pairTexts : array(sources.get(account.id + '/texts.json')).filter(row=>!hiddenTextIds.has(row.id));
    for (const [kind,list] of [['song',songs],['text',texts]]) list.forEach((entry,position) => {
      if (!entry.id) throw new Error('Library item without a legacy ID');
      const id = sid(kind,[profile,entry.id]);
      const mediaKey = kind === 'song' ? scope.mediaAccountIds.map(id=>id+'/'+entry.id).find(path=>manifest.inventory.some(row=>row.key===path)) || null : null;
      add('library_items', { id, kind, scope: 'profile', owner_profile_id: profile, content_json: canonical(externalize(entry)), media_key: mediaKey });
      add('profile_library_items', { profile_id: profile, item_id: id, position });
      alias(kind, namespace, entry.id, id);
    });
  }
  const quizzes = object(sources.get('shared/card-quizzes.json'));
  for (const [word,list] of Object.entries(quizzes)) {
    if (!Array.isArray(list)) throw new Error('Invalid shared quiz collection');
    const collection = sid('collection',key(word));
    add('quiz_collections', { id: collection, legacy_word_key: key(word) });
    for (const id of wordCards.get(key(word)) || []) {
      // A global word-scoped quiz also applies to matching private cards, as before.
      // This link does not authorize reading that private card.
      add('card_quiz_collections', { card_id: id, collection_id: collection });
    }
    list.forEach((quiz,position) => {
      if (!quiz?.type || !Array.isArray(quiz.items)) throw new Error('Invalid shared quiz definition');
      const oldId = quiz.id || 'index:' + position;
      const id = sid('quiz', [key(word),oldId]);
      add('quizzes', { id, collection_id: collection, position, type: quiz.type, items_json: canonical(externalize(quiz.items)) });
      alias('quiz', 'shared/card-quizzes.json', key(word) + '/' + oldId, id);
      if (Object.keys(omit(quiz,['id','type','items'])).length) issue('shared/card-quizzes.json', 'extra-quiz-fields', { word, oldId });
    });
  }
  for (const entry of media.values()) add('catalog_documents', { namespace: 'private-migration-media', key: entry.sha256, value_json: canonical(entry) });
  const report = {
    fingerprint, runId, snapshot: directory, sourceJsonBytes: manifest.objects.reduce((n,row)=>n+row.bytes,0),
    counts: Object.fromEntries(Object.entries(model).map(([name,records])=>[name,records.size])),
    issueReasons: Object.fromEntries([...new Set([...model.migration_issues.values()].map(row=>row.reason))].map(reason=>[reason,[...model.migration_issues.values()].filter(row=>row.reason===reason).length])),
    inlineMediaFiles: media.size, inlineMediaBytes: [...media.values()].reduce((n,row)=>n+row.bytes,0),
    scope:{retainedLogin:'TsovakDev',retainedAccounts:1,excludedSnapshotAccounts:scope.excludedAccounts,formerPairDataRetained:scope.anchor.pairedSource,profileIdentityPreserved:true},
    productionReady: false, notes: ['Production unchanged', 'Frozen snapshot is not live account verification', 'Excluded accounts will not be recreated', 'Ambiguous progress/answers quarantined', 'Private media placeholders need staged hosting', 'Local static catalogs need deployed-version comparison']
  };
  return { directory, model, report, runId, fingerprint,scopeAnchor:scope.anchor };
}

function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Unsupported SQL literal');
  return "'" + value.replaceAll("'", "''") + "'";
}
export function insertSql(model) {
  const guard = Object.keys(tables).map(name=>`(SELECT count(*) FROM ${name})=0`).join(' AND ');
  let sql = `PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
CREATE TEMP TABLE import_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO import_guard SELECT ${guard}; DROP TABLE import_guard;\n`;
  for (const [table,records] of Object.entries(model)) for (const row of records.values()) {
    sql += `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n`;
  }
  return sql + 'COMMIT;';
}
function insertRow(table,row) {
  return `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n`;
}
function chunks(model) {
  const output=[];
  let statements='',size=0,count=0;
  function flush() {
    if (count) output.push(statements);
    statements='';size=0;count=0;
  }
  for (const [table,records] of Object.entries(model)) for (const row of records.values()) {
    const sql=insertRow(table,row);
    const bytes=Buffer.byteLength(sql);
    if (bytes>1024*1024) throw new Error('Single import row exceeds the safe request limit');
    if (count && (size+bytes>350_000 || count>=100)) flush();
    statements+=sql;size+=bytes;count++;
  }
  flush();
  return output;
}
const digestRows = data => hash(data.map(canonical).sort().join('\n'));
function queries(model) {
  return Object.entries(model).filter(([,records])=>records.size).map(([table,records]) => {
    const columns = Object.keys(records.values().next().value);
    for (const row of records.values()) if (canonical(Object.keys(row)) !== canonical(columns)) throw new Error('Inconsistent import columns');
    return { table, columns, records, sql: `SELECT ${columns.join(',')} FROM ${table} ORDER BY ${tables[table].join(',')}` };
  });
}
function checkOffline(plan, sql) {
  const schemas = ['001_content_schema.sql','002_import_audit.sql'].map(name=>readFileSync(resolve(root,'migrations/turso',name),'utf8')).join('\n');
  const check = queries(plan.model).map(entry=>entry.sql + ';').join('\n');
  const output = execFileSync('sqlite3',['-json',':memory:'],{ input: schemas + '\n' + sql + '\nPRAGMA foreign_key_check;\n' + check + '\nPRAGMA page_count;\nPRAGMA page_size;', encoding:'utf8', maxBuffer:64*1024*1024, stdio:['pipe','pipe','pipe'] }).trim().split(/\r?\n(?=\[)/);
  const expected = queries(plan.model);
  if (output.length !== expected.length + 2) throw new Error('Offline foreign-key or result verification failed');
  expected.forEach((entry,index)=>{
    if (digestRows(JSON.parse(output[index])) !== digestRows([...entry.records.values()])) throw new Error('Offline row verification failed in ' + entry.table);
  });
  plan.report.offlineSqliteBytes = JSON.parse(output.at(-2))[0].page_count * JSON.parse(output.at(-1))[0].page_size;
  return sql;
}
async function verifyRemote(config, plan) {
  const countsSql = 'SELECT ' + Object.keys(tables).map(name=>`(SELECT count(*) FROM ${name}) AS ${name}`).join(',');
  const [counts] = await pipeline(config,[execute(countsSql)]);
  for (const [name,expected] of Object.entries(plan.report.counts)) if (rows(counts)[0][name] !== expected) throw new Error('Remote count mismatch in ' + name);
  for (const entry of queries(plan.model)) {
    const actual = [];
    for (let offset=0; offset<entry.records.size; offset+=100) {
      const [page] = await pipeline(config,[execute(entry.sql + ` LIMIT 100 OFFSET ${offset}`)]);
      actual.push(...rows(page));
    }
    if (digestRows(actual) !== digestRows([...entry.records.values()])) throw new Error('Remote row checksum mismatch in ' + entry.table);
  }
}
async function missingRows(config,plan) {
  const missing=Object.fromEntries(Object.entries(plan.model).map(([name,records])=>[name,new Map(records)]));
  for (const entry of queries(plan.model)) {
    for (let offset=0;;offset+=100) {
      const [page]=await pipeline(config,[execute(entry.sql+` LIMIT 100 OFFSET ${offset}`)]);
      const actual=rows(page);
      for (const row of actual) {
        const identity=canonical(tables[entry.table].map(name=>row[name]));
        const expected=entry.records.get(identity);
        if (!expected || canonical(row)!==canonical(expected)) throw new Error('Existing data differs from snapshot in '+entry.table+'; refusing to overwrite');
        missing[entry.table].delete(identity);
      }
      if (actual.length<100) break;
      if (offset>entry.records.size) throw new Error('Unexpected extra import rows');
    }
  }
  return missing;
}

async function main() {
  const [mode,directory,option,anchorPath] = process.argv.slice(2);
  if (!['plan','apply','verify'].includes(mode) || !directory || !(process.argv.length===4||process.argv.length===6&&option==='--scope'&&anchorPath))
    throw new Error('Usage: node scripts/import-turso-snapshot.mjs plan|apply|verify /absolute/private/snapshot [--scope /private/tsovakdev-scope.json]');
  const projectedManifest=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
  if(projectedManifest.projection?.retainedLogin!=='TsovakDev'||!existsSync(resolve(directory,'tsovakdev-scope.json')))
    throw new Error('Prepare a new private projection with plan-turso-retained.mjs first. Original full archives must not be imported or modified directly.');
  const savedAnchor=anchorPath||resolve(directory,'tsovakdev-scope.json');
  if(anchorPath&&!existsSync(anchorPath))throw new Error('Requested scope anchor missing.');
  const plan = build(directory,{scopeAnchor:existsSync(savedAnchor)?JSON.parse(readFileSync(savedAnchor,'utf8')):null});
  const sql = checkOffline(plan, insertSql(plan.model));
  for(const [name,value] of [['tsovakdev-scope.json',plan.scopeAnchor],['import-plan-tsovakdev-checked.json',plan.report]]){
    const file=resolve(plan.directory,name);
    if(existsSync(file)){if(canonical(JSON.parse(readFileSync(file,'utf8')))!==canonical(value))throw new Error('Existing scoped artifact differs; use a new private planning directory.');}
    else writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
  }
  if (mode === 'plan') { console.log(JSON.stringify(plan.report,null,2)); return; }
  const config = credentials();
  const [metadata,runs] = await pipeline(config,[execute(metadataSql),execute('SELECT id,source_manifest_sha256,status FROM migration_runs')]);
  verifyMetadata(rows(metadata),expectedMetadata());
  console.log('Test database schema verified; production access is not used');
  const previous = rows(runs);
  let remaining=plan.model;
  if (previous.length) {
    if (previous.length !== 1 || previous[0].id !== plan.runId || previous[0].source_manifest_sha256 !== plan.fingerprint) throw new Error('Different import already exists; refusing to overwrite');
    plan.model.migration_runs.values().next().value.status = previous[0].status;
    console.log('Existing matching import found; checking without overwriting rows');
    if (mode==='apply' && previous[0].status==='importing') remaining=await missingRows(config,plan);
    else remaining=null;
  } else {
    if (mode !== 'apply') throw new Error('No import to verify');
  }
  if (remaining) {
    const packets=chunks(remaining);
    for (let i=0;i<packets.length;i++) {
      const fresh=!previous.length && i===0;
      const condition=fresh ? Object.keys(tables).map(name=>`(SELECT count(*) FROM ${name})=0`).join(' AND ')
        : `EXISTS(SELECT 1 FROM migration_runs WHERE id=${literal(plan.runId)} AND source_manifest_sha256=${literal(plan.fingerprint)} AND status='importing')`;
      const payload=`PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
CREATE TEMP TABLE packet_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO packet_guard SELECT ${condition}; DROP TABLE packet_guard;
${packets[i]}COMMIT;`;
      await pipeline(config,[{type:'sequence',sql:payload}]);
      console.log(`Imported staging packet ${i+1}/${packets.length}`);
    }
  }
  await verifyRemote(config,plan);
  if (plan.model.migration_runs.values().next().value.status !== 'verified') {
    const [_, receipt] = await pipeline(config,[
      execute(`UPDATE migration_runs SET status='verified' WHERE id=${literal(plan.runId)} AND source_manifest_sha256=${literal(plan.fingerprint)} AND status='importing'`),
      execute(`SELECT status FROM migration_runs WHERE id=${literal(plan.runId)} AND source_manifest_sha256=${literal(plan.fingerprint)}`)
    ]);
    if (canonical(rows(receipt)) !== canonical([{status:'verified'}])) throw new Error('Import verification marker was not persisted');
  }
  plan.report.importVerifiedAt = new Date().toISOString();
  writeFileSync(resolve(plan.directory,'import-result-tsovakdev-'+Date.now()+'.json'),JSON.stringify(plan.report,null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({verified:true,counts:plan.report.counts,issues:plan.report.issueReasons,productionChanged:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  // Never dump SQL/credentials/source payloads, including sqlite stderr.
  console.error(error.code && error.stderr ? 'Offline SQLite validation failed; import not sent' : error.message);
  process.exitCode=1;
});
