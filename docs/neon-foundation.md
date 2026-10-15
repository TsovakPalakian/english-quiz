# Neon Foundation

The developer-only Databases dialog is available under Accounts. It reports the
active content database separately from the selected connection. Checking a
connection does not switch databases. Prepare schema creates only empty tables
in `english_app`, `english_auth` and `english_study`, in one idempotent transaction.

The production default is Neon for authentication and educational content.
The PostgreSQL account and learning adapters use stateless HTTP. Chat stays in
provider-isolated Durable Objects. Schema preparation never imports
users, passwords, materials, answers, progress, or media.

`NEON_DATABASE_URL` is a Worker secret, never a browser preference. Rotate the
password disclosed in chat before relying on this database for real data.

Use `node scripts/neon-foundation.mjs --check` for a connection check, `--prepare`
for the empty initial schema, or `--setup` to also configure the Worker secret.
The URL is read from hidden terminal input or stdin, never from CLI arguments.
`--setup` updates the deployed Worker's secret; announce a commit message first.

Version 2 extends the foundation to 58 tables covering accounts and sessions,
profiles and privacy, lessons and access, cards and quizzes, learning progress,
library items, exams and assessment, Speakout, archive, import audit, bug reports,
and the SQL chat/assignment bridge. Binary media remain in R2; current chat data
remain in Durable Objects. Only migration version records are inserted.

The schema uses PostgreSQL JSONB, booleans, timestamps and identity columns.
It is not a drop-in SQLite replacement. The original foundation text child IDs
are preserved; the operational `english_study` schema instead uses numeric child
identities matching the existing handlers. Version 2 accepts the `class` profile kind as well
as `personal` and `shared`, without replacing existing rows.

Use `node scripts/neon-foundation.mjs --verify` for an explicit table inventory,
business-row count, and constraint/index validation. Preparing twice is safe.
The schema does not implement the separately discussed AI grading or teacher
feedback features; those remain future application work.

Live developer authentication is still required for the dialog's API. If the D1
authentication quota is exhausted, the dialog cannot bypass it; the standalone
Neon preparation command remains independent of D1 and Turso.

## Site-Wide Selection

The selection is global, never a browser preference or a per-user setting. The
control record is `system/database-selection-v1.json` in the content R2 bucket,
independent of D1, Turso and Neon quotas. If the record is absent, the current
Turso/D1 configuration remains unchanged unless `DB_PROVIDER` supplies a different
default. A persisted registry record overrides that deployment default; the
resolved provider is then exposed as `DB_PROVIDER` to request-scoped services.
API requests, legacy database-backed catalog assets, dictionary routes and scheduled tasks read
the record without an isolate-local selection cache. Failed reads and invalid
records fail closed rather than silently changing the selected provider.

Configuration writes require a developer, an expected revision and a successful
server readiness check. R2 conditional writes prevent two administrators from
overwriting each other's choice. Changing the configuration does not migrate,
merge or delete either database's data.

The Databases dialog checks the target runtime schema and the current developer
before activation. Returning to Turso also requires a successful live connection
check; an exhausted Turso quota can prevent rollback until the quota recovers.
Only the TsovakDev account was explicitly copied to the Neon foundation; other
accounts and educational data were not transferred.

## PostgreSQL Authorization

Version 3 adds `english_auth.users`, `registrations` and `account_changes`
compatibility views, with transactional write triggers over the native
`english_app` tables. The account handler receives integer flags and Unix dates;
PostgreSQL stores booleans and timestamps. New users receive an `account_refs`
entry in the same transaction. Repeated preparation preserves all accounts.

`neonAccountDatabase` implements the restricted account query interface. It
binds parameters rather than interpolating values, rejects non-account tables
and arbitrary functions, executes batches as one PostgreSQL transaction, and
sanitizes database errors. It is not a general SQLite-to-PostgreSQL translator.
The three legacy D1 educational cleanup deletes are explicit no-ops: those
tables do not exist in Neon and are not the account adapter's responsibility.

`neonAccountEnvironment` supplies the account handler with this adapter and an
R2 namespace under `auth/neon/`. Account directories, login limits, revocation
markers and other auth files cannot read or overwrite D1's account files.
Session cookies are bound to both the authentication provider and the global
configuration revision. Old D1 cookies still work at the initial revision;
Neon cookies and cookies from a previous configuration are rejected elsewhere.

The unchanged account handler still checks the live role, active/revoked status
and password version on each protected request. Password hashing, approval,
three-hour idle expiry and logout behavior are preserved. The test suite runs
these paths on a real local PostgreSQL engine (PGlite), with no test users written
to production. PGlite is a development-only dependency, not the deployed engine.

Run `node --test scripts/test-neon-auth.mjs` for account integration tests and
`node scripts/verify-neon-auth.mjs` for a read-only live TsovakDev session check.
The latter reads the connection URL from hidden stdin and prints neither hashes
nor tokens. It validates live identity/session behavior, not knowledge of the
account's plaintext password. These checks do not switch the site's provider.

## Production Gate

Run `node scripts/check-database-cutover.mjs` for a read-only Neon preflight.
The connection is entered through hidden stdin. Exit 0 means all gates passed,
exit 2 means activation is blocked, and exit 1 means the check could not run.
No switch, schema migration, test account or business-data write is performed.
The runtime checks inspect installed tables, migration versions, numeric child
identities, tracking functions and the active developer account.

The 2026-10-15 live preparation passed: foundation version 3, 58 tables, active
TsovakDev, and runtime version 1 with 54 application tables plus migration metadata.
No educational rows were copied. `english_study` preserves the common integer
flags, Unix timestamps and JSON text used by the existing services. Explicit SQL
compatibility helpers handle JSON operations, counters and revision guards inside
one PostgreSQL HTTP transaction. Temporary tables are transaction-local and drop
on commit; writes with uncertain outcomes are never automatically replayed.

Validation included 135 comparative SQLite/PostgreSQL scenarios (2234 checked
operations), native PostgreSQL service/account integration, live Neon HTTP tests
in a temporary schema (removed afterwards), browser cache fencing, chat provider
round trips, and the Cloudflare Durable Object runtime. Run
`node scripts/test-neon-study-corpus.mjs` to repeat the comparative corpus.
`node scripts/verify-neon-runtime.mjs` uses hidden stdin and only its own temporary
schema, never working educational rows.

Neon media use `auth/neon/` and `study/neon/` in R2. Neon chat object names use
`neon:v1:`; original Turso names and messages remain intact. Inactive-provider
sockets and alarms fail closed. Browser caches and pending writes are cleared on
provider/revision changes; media IndexedDB names include that context. Ordinary
logout still preserves the See you soon page without a reload.

The current guard also covers `/grammar.js`, `/lesson-data.js`, `/irregular.js`,
`/speakout.js`, `/tense-bank.json`, `/lookup` and `/translate`; none may silently
reach Turso after Neon is selected. A study client is shared only within one
request, not cached globally by the D1 binding. Static shell assets remain
available when the data provider is unavailable. There is no automatic fallback
to the other database. Switch through Accounts / Databases, or change the default
`DB_PROVIDER` and deploy when no R2 override exists. After switching, verify
`/api/database-context`, sign in again, and check groups, cards, exams and messages.
