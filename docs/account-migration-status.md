# Cloudflare account migration: prepared, not switched

Source: East Tarsal, account 22f73bd94b002b9aee8eed13d261cf13.
Target: personal account 42a9ebe47d529e3664b914aaf0813a21.
Target URL: https://learn-english.tsovakpalakian.workers.dev

## Scope clarified by the user

The deployment is a test environment. All teachers/students except the developer,
lessons, exams and chat contents are test data. Exact preservation of test chat
state is no longer a cutover prerequisite. The source can remain as a backup;
do not delete its resources. Preserve the developer account, access, application
code, secrets and recovery keys. The DO quota does not by itself prevent moving
the site with fresh target chat state. No live resources have been changed during
the local preparation described below.

## Historical blocker for a full chat export

On 2026-10-16, Cloudflare rejected source ChatRoom instantiation with
`Exceeded allowed rows written in Durable Objects free tier.` This also
rejects read-only export before user code runs (CPU 0 ms in the trace).
At that time, exact chat preservation was required. That requirement has since
been relaxed for test data; deleting a source namespace is still not authorized.
Daily free limits reset at 00:00 UTC, 04:00 Asia/Yerevan on October 17.

## Preserved and prepared

- Exact source Worker backup: `/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/source-worker-21bjXe`.
- Private migration inventory and backups: `/private/tmp/english-account-move-hzMI9M`.
- D1 export: `source-d1.sql` in that private directory.
- Verified R2 backups: 224 objects / 166143617 bytes from learn-english-media,
  and 62 objects / 89788102 bytes from learn-english-production-media.
- Target R2 buckets with the same names have been created, but not populated.
- Target D1 learn-english ID: e2739e2e-6693-4cc8-8054-d90173b032c0; not populated.
- No target Worker has been deployed. Root wrangler.toml still targets source.
- Production secrets were recovered into `.local-secrets/source-account-env.json`
  (0600; gitignored). Never print, commit or expose this file.
- Chat transfer key is `.local-secrets/account-transfer.key` (0600; gitignored).
- Chat encryption recovery key remains unchanged.
- Source object inventory: 25 ChatRoom, 13 ChatInbox, 2 ChatBridge. Their data
  has NOT been exported because of the source account limit.
- All existing source data, resources and external Turso/Neon databases remain.

## Resume with full chat preservation, if needed

1. Confirm source quota has reset. Refresh temporary migration authorization,
   re-enable source role/expiry only for the export window, then deploy source.
2. Publish the locally prepared guards before relying on them. Freeze the source
   with both ACCOUNT_TRANSFER_FROZEN=true and accountTransferFrozen=true in the
   existing global database-selection R2 document, preserving its provider and
   revision and using conditional updates. The persistent fence reaches existing
   objects, not just new HTTP requests. Stop ingress, drain outstanding external
   database/media operations, and verify quiet before final cross-storage snapshots.
   Per-object export now waits for tracked chat work; that is not a distributed
   transaction across D1, Turso and R2 or an automatic global drain mechanism.
3. Refresh D1/R2 backups and inventory after freezing; current backups are
   provisional and can be older than later user changes.
4. Export all source objects; preserve orphan/inactive/provider-specific objects
   in private backup. Verify snapshot checksums and pagination completeness.
5. Re-encrypt chat fields using target object IDs during restore. Never merely
   copy ciphertext, since authenticated context includes the source object ID.
6. Restore object sequences, metadata, profiles, folders, pins, unread counters,
   attachments and alarms; test inbox and bridge migrations in addition to rooms.
7. Copy both R2 buckets with original HTTP/custom metadata and verify bytes.
   Restore D1 authentication records and securely provision target secrets.
   External Turso/Neon data need not be moved between Cloudflare accounts.
8. Deploy target while unavailable to ordinary users; perform read-only checks
   and restore verification before switching. Keep alarms deferred while frozen.
   After removing the target fence, repeat authorized imports to restore pending
   alarms idempotently. Clear any copied persistent freeze flag only on the target;
   leave the source frozen. A new host requires fresh login.
9. Remove temporary migration endpoints/authorization, update root account ID,
   D1 ID and CONTENT_ALLOWED_HOST, then activate target. Disable source writes
   and source cron, and arrange a safe old-address notice/redirect.
10. Keep East Tarsal and private backups for rollback. Deletion needs separate
    explicit user authorization and is not part of the current migration.

The migration endpoint is disabled when role/expiry/key are absent. Preparation
tests cover closed-by-default access, expiry, checksums, refusal to overwrite,
idempotent import and encryption across object IDs. Full live cross-account
cutover has NOT been verified and must not be described as complete.

## Local preparation completed, not deployed

- Added 28 tests to the initial 3 transfer tests: 31 transfer cases now pass.
- HTTP/WS commands, scheduled cleanup and chat alarms honor the migration fence;
  frozen handlers do not reschedule write-producing retry alarms.
- Source export requires both deployment and persisted fences in production and
  waits for tracked in-flight object requests, websocket work and flush/import jobs.
- Room/Inbox data are re-encrypted under the target object ID; Bridge metadata,
  inbox folders/counters and AUTOINCREMENT gaps are preserved in tests.
- Imports reject damaged snapshots and roll back partial table restores.
- Failed alarm restoration is retryable without a second data import. Frozen
  targets defer alarms until an authorized retry after activation.
- 89 focused regression tests passed, including account group teachers, chat,
  encryption, database selection/context and the previous migration fence.
- Both local Miniflare checks passed: existing chat runtime and a new complete
  migration of a Room, two Inboxes and Bridge across different physical DO IDs.
- Broader exam/integrated/stage tests: 43 passed, one old group-title expectation
  expects A1 while the current seed uses A1 Group. Production-wrapper tests: five
  passed, one old expectation rejects test credentials in productionEnvironment,
  although that function (unchanged from HEAD) defers provider validation to the
  selected adapter. These discrepancies were recorded, not changed in this task.
- Commands: node --test scripts/test-account-transfer.mjs; node
  scripts/test-account-transfer-runtime.mjs; node scripts/test-chat-runtime.mjs.
- Live freeze orchestration, account cutover and Turso -> D1 remain separate work.
  The new guards add R2 checks to background/delivery paths; this preparation is
  a correctness change, not a measured performance optimization.

## First local cost optimization completed, not deployed

prepareChatDatabase now writes its two persisted controls only when changed.
Added 22 focused tests and three SQLite checks for Room, Inbox and Bridge.
The focused regression set now passes 114 tests; both local runtime scripts pass.
In the measured unchanged-state fixture, 100 repeated preparations eliminate 200
metadata write statements. Live database/freeze checks remain per call. HTTP
preparation adds one read of the saved write mode to avoid redundant writes;
this does not reduce browser HTTP traffic or R2 checks. No production deployment
or production data access was performed for this optimization.
