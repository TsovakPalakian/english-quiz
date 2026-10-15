# Database Access: Neon / Turso

## Scope

`db/index.js` is a request-scoped HTTP repository factory. Its only selection
input is `env.DB_PROVIDER`, exactly `neon` or `turso`. There is no fallback,
module-global client, persistent TCP socket, WebSocket, or connection pool.

**This is not an automatic production cutover.** Existing application services
still use `TursoStudyClient`, its `read`/`atomic` interface, SQLite-specific SQL,
and D1 authentication. This change does not rewrite those services, switch the
site, copy data, or bypass the current Turso quota block. The production guard
resolves its shared R2 selection and exposes the result as `DB_PROVIDER` for each
data request. Setting the default to Neon does not bypass the missing learning
adapter: data requests fail closed rather than falling back to Turso.

The new factory does not consult that R2 scaffold or the old credential aliases
`NEON_DATABASE_URL` / `TURSO_URL`. Callers must use the resolved request environment,
not the raw deployment environment, when using this factory in the existing site.
Before a whole-site cutover, compose native PostgreSQL repositories and account
authentication together, preserving the business rules of each endpoint.
See [the production gate](neon-foundation.md#production-gate) for the read-only
preflight command and the remaining acceptance requirements.

## Verified Dependencies

Checked against official APIs and npm metadata on 2026-10-15; exact versions are
locked in package.json / package-lock.json:

- `@neondatabase/serverless` **1.2.0**, `neon()` and non-interactive HTTP
  transactions: [official driver](https://github.com/neondatabase/serverless),
  [configuration](https://github.com/neondatabase/serverless/blob/main/CONFIG.md).
- `@libsql/client` **0.18.0**, imported through `@libsql/client/web` for Workers:
  [Client API](https://tursodatabase.github.io/libsql-client-ts/interfaces/Client.html),
  [Cloudflare integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/turso/).
- Custom HTTP fetch and integer options are verified against the
  [libSQL Config API](https://tursodatabase.github.io/libsql-client-ts/interfaces/Config.html).

Only tests use Node.js APIs and PGlite. Neither is imported by `db/` or the
example Worker. The frontend and its build process are unchanged.

## Interface and Lifecycle

```js
import { withDatabase } from '../db/index.js';

return withDatabase(env, async db => {
  const rows = await db.query('SELECT id,title FROM db_example_quizzes WHERE owner_id=?', [actor.id]);
  return Response.json({ quizzes: rows });
}); // Always closes the request client in finally, including on errors.
```

- `query(sql, params=[])` returns an array of plain row objects. SELECTs use a
  read-only HTTP batch, preventing a mutating SELECT function from being retried
  as an ordinary read.
- `execute(sql, params=[])` returns `{ rows, rowsAffected }`. Use explicit
  `RETURNING id` when an inserted identity is needed. No generated ID is guessed.
- `transaction(fn)` returns one result per queued statement, in declaration
  order: query results are arrays; execute results have the shape above.
- `createDatabase(env)` is available for explicit ownership. Always wrap its use
  in `try/finally { await db.close(); }`. `withDatabase` does this for you.
- Clients are not reused across requests. `close()` is idempotent, waits for
  already-started operations, and rejects new work. Turso's client is closed;
  Neon HTTP has no socket/pool to end. Cleanup errors are logged without
  converting a committed write into a retryable failure.
- Defaults: 5-second timeout per HTTP attempt, 4 active operations and at most
  64 pending operations per request, 100 statements per transaction, 65,536
  characters per SQL statement. Backpressure rejects unstarted work. This is not a global
  database-wide connection limit; aggregate load still needs API rate limiting.

## Transaction Contract

Neon HTTP cannot execute an interactive JavaScript read/branch/write callback.
The common contract is therefore an **explicit synchronous batch builder**:

```js
const id = crypto.randomUUID();
const results = await db.transaction(tx => {
  tx.execute('INSERT INTO db_example_quizzes(id,owner_id,title,created_at) VALUES(?,?,?,?)',
    [id, actor.id, 'Practice', new Date().toISOString()]);
  tx.query('SELECT id,title FROM db_example_quizzes WHERE id=?', [id]);
});
const inserted = results[0];
const savedRows = results[1];
```

Do not mark the callback `async`, await `tx.query`, use results inside the
callback, or call `db.query` instead of `tx.query`. These misuses fail explicitly
before sending the plan. No request is issued until the callback completes.
If it throws or validation fails, none of the planned statements is sent.

Neon submits `sql.transaction([...], { fullResults:true,
isolationLevel:'Serializable' })`; Turso submits `client.batch([...], 'write')`.
Read-only plans use read-only mode on both providers. A statement failure rolls
back the whole batch. The callback runs once even if a known rolled-back batch
is retried. Bindings are copied when the plan is built.

For result-dependent operations, generate UUIDs before planning, encode the
condition in SQL with checked affected-row counts at a domain repository, or
implement a separately named interactive API. Do not secretly switch this HTTP
interface to Neon WebSockets. A future WebSocket variant would need a per-request
Client/Pool, rollback on failure, and end()/release() in finally.

See `examples/db-transaction.js` for an atomic quiz/question creation example.

## Common SQL and Dialect Differences

The layer converts placeholders, not entire SQL dialects. It accepts a single
SELECT in query(), or INSERT/UPDATE/DELETE in execute(). Standard quoted text
and comments are preserved by a lexer. Parameters are never interpolated into
SQL. SQL source and identifiers must be developer-owned constants, never client
input; sort choices must map to a fixed server-side allowlist.

The supported intersection is positional `?` parameters, standard quotes,
WHERE/JOIN/ORDER BY/LIMIT, ordinary subqueries/aggregates, INSERT/UPDATE/DELETE,
explicit RETURNING, integer flags, JSON text and ISO UTC timestamp text.
DDL, transaction control and several known nonportable features are rejected.
Unlisted vendor-specific syntax is not guaranteed to be portable; this is not a
complete SQL parser or transpiler. CTEs starting with WITH are outside this API.

| Concern | PostgreSQL | libSQL / current SQLite code | Common contract / action |
| --- | --- | --- | --- |
| Placeholders | `$1`, `$2` | `?`, named forms | Only `?`; convert outside quotes/comments; validate exact count. |
| Time | `NOW()`, native timestamps | `unixepoch()`, `strftime()` | Bind `timestamp()` from db/values.js; store UTC ISO text in common schemas. No session clock or timezone state. |
| RETURNING | Supported | Supported by modern libSQL | Explicit clause; execute returns rows plus affected count on both. |
| Generated IDs | Identity/sequence | INTEGER PRIMARY KEY / AUTOINCREMENT | Prefer pre-generated text UUIDs for batch references. Native counters belong in separate migrations, not automatic rewrites. |
| Booleans | Native boolean | Integer flag | Common schema uses INTEGER CHECK IN (0,1); boolean params become 0/1. Use encodeBoolean/decodeBoolean at repository DTO boundaries. Native boolean predicates such as `published=1` require a view or dialect-specific SQL. |
| JSON | JSONB/native operators | JSON text, `json_extract`, `json_set` | Bind encodeJson() text; decodeJson() parses text or accepts an existing native JSON value. Querying/updating JSON inside SQL requires a provider-specific repository. |
| Large integers | int8 commonly arrives as text | bigint via intMode | Safe integers become numbers; larger integers become decimal strings. Bind large integers as strings. No silent JS precision loss. |
| Decimal / date / binary | NUMERIC, Date, bytea | REAL/text/blob | Not automatically equivalent. Preserve decimal strings; use timestamp helpers; keep binary media in R2. |
| Insert-ignore | ON CONFLICT DO NOTHING | INSERT OR IGNORE | Use explicit, tested ON CONFLICT with a concrete conflict target; OR IGNORE is rejected. Collation/partial-index semantics require provider migrations. |
| Change / identity guards | RETURNING and transaction logic | `changes()`, `last_insert_rowid()` | Not translated. Replace at domain repository level, preserving optimistic-lock and rollback guarantees. |
| Introspection / temporary state | information_schema/pg_catalog | PRAGMA/sqlite_master/temp guards | Separate dialect-specific migration/repository code; never assume a session survives HTTP calls. |
| Schema names and child IDs | Existing english_app and text child IDs | Existing numeric IDs | Existing schemas are not yet equivalent. Map identities and schema names explicitly before routing old services here. |

Values may be null, strings, finite safe numbers or booleans. Undefined,
objects, arrays, Dates, BigInts and unsafe numeric integers are rejected as raw
parameters. Use the explicit value helpers instead. The layer does not validate
business input, ownership or role permissions; endpoints must keep those checks.
For a standalone parameter projection, use `SELECT CAST(? AS INTEGER) AS id`
rather than relying on the provider to infer the type of `SELECT ?`. Ordinary
column comparisons infer their types from the column. Turso integer bindings
are passed internally as bigint to avoid the driver's float encoding of JS
numbers, then normalized back to safe numbers or decimal strings on output.

## Examples and Migrations

`examples/db-endpoint.js` contains the same quiz-question handler for both
providers. It binds quiz ID and authenticated owner ID, limits the result, and
returns no correct-answer keys. The example's default authenticator denies all
access. Compose `createQuizExampleWorker({authenticate: yourLiveVerifier})` with
the existing trusted verifier, not a browser-supplied actor header.

`db/migrations/neon/001_example.sql` and `db/migrations/turso/001_example.sql`
are separate, deliberately compatible example schemas. They create only
`db_example_*` tables. They are not auto-applied and do not modify existing
production quizzes, users, lessons, progress or sessions.

Maintain two migration histories with matching logical versions and checked
checksums. Apply each provider's files through its native migration tooling or
SQL console, with a separate deployment role. Record applied versions per
database and validate indexes, unique keys, foreign-key enforcement and rollback.
The runtime repository intentionally does not execute DDL. Use a direct Neon
URL only for migration tools that genuinely need session features, never as a
replacement for the runtime pooled URL. Preserve existing migration histories.

## Switching and Verification

Configure both credentials once through Cloudflare secrets, never JavaScript,
wrangler.toml values, git, logs, URLs in command arguments, or browser storage:

```sh
npx wrangler secret put DATABASE_URL
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
```

DATABASE_URL must contain a Neon `-pooler` hostname and require TLS.
TURSO_DATABASE_URL accepts TLS `libsql://...turso.io` or `https://...turso.io`;
the adapter forces HTTPS and imports the web driver. No file:, ws: or plaintext
transport is permitted. Existing production secret names are not renamed by
this patch. Rotate credentials that were previously disclosed in chat.

For a deployment whose handlers use this factory, change just this non-secret
Worker variable, then deploy the same code through the normal release process:

```toml
[vars]
DB_PROVIDER = "neon" # or "turso"
```

The separate `examples/db-worker.toml` is for local/build verification only; it
does not change the active Worker's settings. Switching env is deployment-wide,
not a browser preference. In-flight requests retain their captured adapter.
Drain writes before cutover when databases do not share synchronized data.

Checklist before enabling either direction:

- Both secret sets exist, URLs use TLS, Neon uses the pooled host, and no secrets
  are present in git or browser assets.
- Both schemas and migration checksums match the domain model; identity, JSON,
  flag, date, constraint, index and foreign-key behavior are verified.
- Every participating endpoint uses this interface; legacy read/atomic, D1 and
  R2 routing are explicitly accounted for. DB_PROVIDER alone does not port them.
- Same-handler tests pass on both engines; RETURNING, rollback, retry safety,
  pending approvals, roles, visibility, progress and isolation are covered.
- Target data and developer access exist. An empty database remains empty;
  switching never copies or merges data. Different datasets are not failover.
- Session epochs and browser/server caches are isolated or invalidated; chat
  policy and scheduled jobs follow the same selected backend.
- Writes are drained; concurrent/stale configuration changes cannot split a
  mutation across providers. Test rollback and the previous provider's quota.
- Run a cold-start read and a controlled idempotent write; observe latency,
  errors and resource cleanup. Never test ambiguous writes by replaying them.

## Retries and Error Contract

Default: one retry, 80-159 ms backoff. `retries:2` permits one additional attempt
with exponential delay. Each attempt gets a new timeout signal. No automatic
provider failover exists. Authentication, quota, input and constraint failures
are not retried. Read retries are bounded and happen only on temporary errors.

Writes/batches are retried only for confirmed transaction-abort conditions
(PostgreSQL serialization failure/deadlock; SQLite busy/locked). Network errors
after dispatch may hide a successful commit: those return DB_COMMIT_UNKNOWN,
`mayHaveCommitted:true`, with no automatic replay. Use mutation IDs / operation
receipts to reconcile them. A callback is never re-executed by a retry.

DatabaseError has a sanitized message, code, status, retryable flag and
mayHaveCommitted flag. Examples: DB_PROVIDER / DB_CONFIG (500), DB_PARAMETERS /
DB_SQL_* (400), DB_CONFLICT / DB_CONSTRAINT (409), DB_UNAVAILABLE / DB_QUOTA /
DB_AUTH / DB_BACKPRESSURE (503), DB_TIMEOUT (504). No driver error object, SQL,
binding, connection URL or token is logged or attached as a public cause.

## Monitoring and Capacity

Use the optional onMetric callback for structured attempt events containing
provider, operation, durationMs, attempt, success and fixed error categories.
The default logger emits sanitized failure events only. Metrics/logger failures
never trigger retries or turn a successful mutation into an error. For operation
error rates, count terminal failures, not transient attempts with willRetry=true.
Async telemetry sinks should be scheduled with the caller's ctx.waitUntil when
delivery beyond the response lifetime is required.
Do not add a database health query to every endpoint or heartbeat.

Suggested initial alerts (operational recommendations, not provider limits):
warn when warm p95 latency exceeds 2x baseline or its SLO for 5-10 minutes;
investigate a terminal error rate above 1%, recurring timeouts and retry spikes.
Separate cold-start, query execution, lock wait and network latency.

For Neon, monitor CPU/memory, whether compute is pinned at its maximum, active
backend connections, pool queue/wait time, cache-hit rate, long queries and lock
waits. Investigate indexes, lock contention and leaks before increasing capacity.
If a 2 CU ceiling is persistently saturated (for example CPU above 80% for
5-10 minutes) and warm latency/pool waits remain high after query tuning, raise
the autoscale maximum if the plan permits, load-test and compare cost/SLO.
If only wake-up latency is high, evaluate minimum compute/scale-to-zero instead.
[Neon autoscaling](https://neon.com/docs/introduction/autoscaling).

Neon's pooled client limit (up to 10,000) is concurrent, not monthly; it does not
mean 10,000 active queries. Available backend slots depend on compute, Postgres
settings and reserved slots. Do not hard-code an example such as 894 direct
slots as a universal limit. Inspect SHOW max_connections and pg_stat_activity
with administrative tooling; start warning around 80% of the actual usable
limit and investigate queueing. [Neon pooling](https://neon.com/docs/connect/connection-pooling).

Turso does not use Neon CUs. For row-quota plans, monitor scanned rows (not just
returned rows), writes, storage, request latency and BLOCKED errors. Start
warnings at 70% of the quota, critical alerts at 90%, and forecast exhaustion
before reset. Index filtering, paginate and cache read-only catalogs; replicas
do not imply multiplied quotas or increased primary write throughput. Where
replicas are configured, also monitor region latency and freshness. Retrying a
quota block will not repair it. [Turso usage](https://docs.turso.tech/help/usage-and-billing).

## Local Validation

```sh
node --test scripts/test-db-adapters.mjs
node --test scripts/test-neon-auth.mjs scripts/test-database-administration.mjs
npx wrangler deploy --config examples/db-worker.toml --dry-run --outdir /private/tmp/db-edge-check
```

Tests exercise PostgreSQL (PGlite) and SQLite on local engines, the actual
libSQL HTTP driver with a mocked protocol server, parameter binding, single
atomic batches, rollback, cleanup, cold errors and timeout handling. They do not
write to production or assume a successful Turso quota check. A deployment
cutover still requires the live acceptance checklist above.
