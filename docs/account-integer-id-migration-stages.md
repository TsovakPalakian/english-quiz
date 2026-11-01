# Detailed Step-by-Step Implementation Plan: Account Integer ID Migration

## 1. Overview and Invariants

This document establishes the deterministic sequence of operations for migrating account primary keys and foreign key references from string identifiers (`TEXT`) to autoincrementing integers (`INTEGER`) across the account database (`DB`), the learning database (`STUDY_DB`), Cloudflare Durable Objects, and Cloudflare R2 storage.

### Core Architectural Invariants:
1. **Public API Contract Preservation**: All client-server endpoints must continue to accept existing hex string tokens alongside new integer identifiers during the transitional window.
2. **Server State Authority**: Server database validation holds absolute priority over client-side cached data.
3. **Backup Script Split Marker Integrity**: The exact token `'CREATE TABLE IF NOT EXISTS sessions ('` in [schema.sql:57](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/schema.sql#L57) must remain unbroken for [ops/finalize-learning-production-backup.mjs:16](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/finalize-learning-production-backup.mjs#L16).
4. **Cipher Context Preservation**: All AES-256-GCM encrypted message payloads in `STUDY_DB` bind the authenticated associated data (AAD) context to the room identifier `'journal:' + room + ':' + column`. Direct rooms must decrypt prior to identifier modification.

---

## 2. Implementation Progress Checklist

### Database Integer ID Migration

#### Stage 1: Dual-Type Route, Regex & Strict Equality Compatibility
- `🟩` Step 1.1: Route and Identity Regex Widening in Backend Workers
- `🟩` Step 1.2: Route and Account ID Regex Widening in Client Bridge (9 Sites)
- `🟩` Step 1.3: In-Memory JavaScript Strict Equality Coercion in `src/` (42 Sites)
- `🟩` Step 1.4: Strict Equality Coercion in `production/chat/` (36 Sites)
- `🟩` Step 1.5: Dataset String Lookups & Equality Coercion in `client/` (12 Sites)
- `🟩` Step 1.6: Cloudflare Durable Objects `idFromName` String Guarantee ([src/chat-database.mjs:10](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-database.mjs#L10))
- `🟩` Step 1.7: Reference Guard Widening in [src/chat-durable.mjs:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L14)
- `🟩` Step 1.8: Session Identity Validation Widening in [src/security-sessions.mjs:5-6, 64, 71](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/security-sessions.mjs#L5)
- `🟩` Step 1.9: Map and Set Identity Lookups in Group Teachers & Account Invites ([src/account-invites.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs), [src/account-group-teachers.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-group-teachers.mjs))
- `🟩` Step 1.10: Client Lesson and Admin Teacher Assignment Inclusion Checks ([client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js), [client/10-admin.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js))
- `🟩` Step 1.11: Speech Attempt Management and Analysis Coercion ([src/speech-practice.mjs:97, 101, 103, 110](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L97))
- `🟩` Step 1.12: Account Archive Ownership & Self-Archive Guard Coercion ([src/account-archive.mjs:24, 36](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-archive.mjs#L24))
- `🟩` Step 1.13: Test Worker Stage Session Proof Type Widening ([src/learning-stage-worker.mjs:84, 102](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L84))
- `🟩` Step 1.14: Passkeys WebAuthn User Handle Digest String Coercion & JSON Extract Support ([src/passkeys.mjs:29, 39, 50, 61, 82](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/passkeys.mjs#L29))
- `🟩` Step 1.15: Federated OAuth State Account ID Extraction & Comparison ([src/federated-oauth-state.mjs:46, 53](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/federated-oauth-state.mjs#L46))
- `🟩` Step 1.16: Assessment Work Submission & Teacher Review Equality Coercion ([src/learning-assessment.mjs:65, 80, 116, 138, 140, 261](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-assessment.mjs#L65))
- `🟩` Step 1.17: Exam Workflow Recipient & Review Authorization Coercion ([src/exam-workflow.mjs:19, 35, 51, 52](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-workflow.mjs#L19))
- `🟩` Step 1.18: Content Archive Author & Teacher Visibility Coercion ([src/learning-archive.mjs:155, 166, 175, 182, 186, 194](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-archive.mjs#L155))
- `🟩` Step 1.19: Chat Worker Identity Mapping & Direct Policy Filtering ([src/chat-worker.mjs:81, 86, 99, 101, 103, 113, 124, 175, 187, 191, 224, 227, 237, 242, 248, 252, 311](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L81))
- `🟩` Step 1.20: Integrated Worker Authorization Guard Coercion ([src/learning-integrated-worker.mjs:269, 282, 607, 615, 624, 1120](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L269))

#### Stage 2: Schema Definition Updates & Batch Insertion Sequencing
- `🟩` Step 2.1: Update Account Database Schema in [schema.sql:1-81](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/schema.sql#L1-L81)
- `🟩` Step 2.2: Add Missing Table Definition `user_card_gone` to [schema.sql:81](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/schema.sql#L81)
- `🟩` Step 2.3: Update Dynamic Schema Initializer in [src/worker.js:298-312](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L298-L312) (`ensureSchema`)
- `🟩` Step 2.4: Update Account Changes Schema Initializer in [src/worker.js:3063-3065](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L3063-L3065) (`ensureChangeTable`)
- `🟩` Step 2.5: Decouple User & Registration D1 Batch Insertions in [src/worker.js:1718-1725, 3747-3755, 3797-3805](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L1718)

#### Stage 3: Zero-Loss Data Migration & Cross-Database Synchronization
- `🟨` Step 3.1: Create Data Migration Script `migrations/account/001_integer_account_ids.sql`
- `🟨` Step 3.2: Rebuild Dependent Tables and Foreign Keys in `STUDY_DB` (26 Tables)
- `🟨` Step 3.3: Remap `catalog_documents` Namespaces (`accounts-group-teachers`, `feedback-user-limits`, `account-invites`, `passkey-credentials`, `microsoft-identities`, `google-identities`)
- `🟨` Step 3.4: Rebuild Direct Chat Rooms (`direct:a:b`) and Preserve AEAD Cipher Payload Context
- `🟨` Step 3.5: Migrate R2 Storage Objects (`MEDIA` bucket user audio files `${old_id}/*`, `gone/${old_id}`, `${old_id}/account-state.json`)
- `🟨` Step 3.6: Invalidate Cached Directory File in R2 Storage (`directory/accounts.json`)
- `🟨` Step 3.7: Re-create Partial Indexes on Migrated D1 Account Tables

#### Stage 4: Test Harness & Fixture Updates
- `⬜` Step 4.1: Update Inline Test Schemas in [test/test-account-archive-lifecycle.mjs:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-archive-lifecycle.mjs#L14)
- `⬜` Step 4.2: Update Inline Test Schemas in [test/test-email-otp.mjs:67](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-email-otp.mjs#L67)
- `⬜` Step 4.3: Update Inline Test Schemas in [test/test-learning-accounts-live-code.mjs:52-54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-accounts-live-code.mjs#L52-L54)
- `⬜` Step 4.4: Update Inline Test Schemas in [test/test-learning-integrated.mjs:254](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-integrated.mjs#L254)

#### Stage 5: Production Asset Compilation & Final Verification
- `⬜` Step 5.1: Build Client Production Assets via `npm run build:preview`
- `⬜` Step 5.2: Execute Targeted Node.js Test Suites

---

### Codebase Stabilization & Hygiene Tasks

#### Discovered Audit Items
- `🟩` Step 6.1: Text Color Picker Focus Restoration Verification ([production/color-picker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/color-picker.js))
- `⬜` Step 6.2: Add Rejection Handler to Telemetry Call in [client/30-stats.js:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/30-stats.js#L14)
- `⬜` Step 6.3: Remove Orphan DOM Attributes in [site/preview.html:15, 54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L15)
- `⬜` Step 6.4: Document Service Endpoint `/api/speech-scenarios` in [src/learning-integrated-worker.mjs:662](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L662)

---

## 3. Step-by-Step Technical Execution Guide

### Stage 1: Dual-Type Route, Regex & Strict Equality Compatibility

#### Step 1.1: Route and Identity Regex Widening in Backend Workers
- **Files Modified**:
  - [src/learning-integrated-worker.mjs:76](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L76)
  - [src/worker.js:961, 1054](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L961)
  - [src/account-study-purge.mjs:6](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-study-purge.mjs#L6)
  - [src/chat-worker.mjs:142](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L142)
  - [src/learning-visibility.mjs:11](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-visibility.mjs#L11)
  - [src/learning-profile.mjs:4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-profile.mjs#L4)
  - [src/learning-paired-themes.mjs:8, 18](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-paired-themes.mjs#L8)
  - [src/learning-stage-worker.mjs:84](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L84)
  - [src/migration-freeze.mjs:29-30](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/migration-freeze.mjs#L29)
- **Action**:
  Update regex pattern `[a-f0-9]{16,64}` to `(?:[a-f0-9]{16,64}|[1-9]\d{0,15})`.
  Update regex pattern `^[a-f0-9]{32}$` in [src/worker.js:961, 1054](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L961) to `^(?:[a-f0-9]{32}|[1-9]\d{0,15})$`.

#### Step 1.2: Route and Account ID Regex Widening in Client Bridge
- **Files Modified**: [client/main/main-bridge.js:291, 576, 653, 673, 678, 684, 700, 711, 739](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L291)
- **Action**:
  Replace `!/^[a-f0-9]{16,64}$/.test(accountId)` with `!/^(?:[a-f0-9]{16,64}|[1-9]\d{0,15})$/.test(String(accountId))`.

#### Step 1.3: In-Memory JavaScript Strict Equality Coercion in `src/`
- **Files Modified**:
  - [src/worker.js:914, 1063, 1066, 3030, 3038, 3083, 3225, 3251, 3254, 3563, 3608, 3635, 3814](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L914)
  - [src/learning-messages.mjs:194](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L194)
  - [src/learning-groups.mjs:145](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L145)
  - [src/learning-workbench-runtime.mjs:21](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-workbench-runtime.mjs#L21)
  - [src/teacher-group-access.mjs:13](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/teacher-group-access.mjs#L13)
  - [src/learning-error-bank.mjs:541](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-error-bank.mjs#L541)
  - [src/quiz-author-visibility.mjs:12](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-author-visibility.mjs#L12)
  - [src/learning-essay-copilot.mjs:202](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-essay-copilot.mjs#L202)
- **Action**:
  Convert strict equality operators on user identifiers to `String(left) === String(right)` and `String(left) !== String(right)`.

#### Step 1.4: Strict Equality Coercion in `production/chat/`
- **Files Modified**:
  - [production/chat/99-boot.js:47](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/99-boot.js#L47)
  - [production/chat/10-profiles.js:56](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/10-profiles.js#L56)
  - [production/chat/30-rooms.js:105, 153, 455](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L105)
  - [production/chat/40-messages.js:51, 67, 76, 82, 258, 756](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L51)
  - [production/chat/80-dialogs.js:113, 503, 1028](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js#L113)
  - [production/chat/85-message-actions.js:54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L54)
- **Action**:
  Apply string coercion `String(...)` across all sender and account comparisons.

#### Step 1.5: Dataset String Lookups & Equality Coercion in `client/`
- **Files Modified**:
  - [client/47-account.js:104, 133](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/47-account.js#L104)
  - [client/40-account.js:544, 647, 654, 655, 659, 691](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L544)
  - [client/00-core.js:284](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L284)
  - [client/52a-workbench.js:76, 88, 147, 149, 150](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js#L76)
  - [client/demos/local-video-preview.js:12](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/local-video-preview.js#L12)
- **Action**:
  Apply string coercion to compare DOM dataset string properties with user ID attributes.

#### Step 1.6: Cloudflare Durable Objects `idFromName` String Guarantee
- **File Modified**: [src/chat-database.mjs:10](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-database.mjs#L10)
- **Action**:
  Change `export function chatStorageName(env, id) { return id; }` to `export function chatStorageName(env, id) { return String(id); }`.

#### Step 1.7: Reference Guard Widening in `src/chat-durable.mjs`
- **File Modified**: [src/chat-durable.mjs:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L14)
- **Action**:
  Coerce input to string before regex validation:
  ```javascript
  const ref = value => {
    const str = String(value ?? '');
    if (!/^[A-Za-z0-9:_-]{1,180}$/.test(str)) fail(400, 'Invalid reference.');
    return str;
  };
  ```

#### Step 1.8: Session Identity Validation Widening in `src/security-sessions.mjs`
- **File Modified**: [src/security-sessions.mjs:5-6, 64, 71](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/security-sessions.mjs#L5)
- **Action**:
  Permit safe integers in `validId` and coerce account comparisons with `String()`.

#### Step 1.9: Map and Set Identity Lookups in Group Teachers & Account Invites
- **Files Modified**:
  - [src/account-invites.mjs:80-83, 88-89, 142, 153, 208, 210, 233, 236, 244-247, 256](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs#L80)
  - [src/account-group-teachers.mjs:3, 10, 16, 26](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-group-teachers.mjs#L3)
- **Action**:
  Normalize all Map keys, Set members, and `.includes()` lookups using `String()`.

#### Step 1.10: Client Lesson and Admin Teacher Assignment Inclusion Checks
- **Files Modified**:
  - [client/52-lessons.js:129, 132, 136](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L129)
  - [client/10-admin.js:36, 210, 219](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L36)
- **Action**:
  Normalize `teacherIds` arrays with `.map(String)` prior to `.includes()` calls.

#### Step 1.11: Speech Attempt Management and Analysis Coercion
- **File Modified**: [src/speech-practice.mjs:97, 101, 103, 110](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L97)
- **Action**:
  Coerce bindings and comparisons for `owner_id` with `String()`.

#### Step 1.12: Account Archive Ownership & Self-Archive Guard Coercion
- **File Modified**: [src/account-archive.mjs:24, 36](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-archive.mjs#L24)
- **Action**:
  Compare `archived_by` and `actor.id` using string coercion.

#### Step 1.13: Test Worker Stage Session Proof Type Widening
- **File Modified**: [src/learning-stage-worker.mjs:84, 102](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L84)
- **Action**:
  Widen `gone(id)` regex to accept integer IDs and allow `Number.isSafeInteger(p.id)`.

#### Step 1.14: Passkeys WebAuthn User Handle Digest String Coercion & JSON Extract Support
- **File Modified**: [src/passkeys.mjs:29, 39, 50, 61, 82, 86](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/passkeys.mjs#L29)
- **Action**:
  Cast JSON extracted accounts to TEXT in SQL and hash `String(actor.id)`.

#### Step 1.15: Federated OAuth State Account ID Extraction & Comparison
- **File Modified**: [src/federated-oauth-state.mjs:46, 53](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/federated-oauth-state.mjs#L46)
- **Action**:
  Coerce `accountId` comparisons and cast JSON extracted account ID to text in delete statements.

#### Step 1.16: Assessment Work Submission & Teacher Review Equality Coercion
- **File Modified**: [src/learning-assessment.mjs:65, 80, 116, 138, 140, 261](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-assessment.mjs#L65)
- **Action**:
  Compare `account` and `actor.id` using `String()` across all submission and grading branches.

#### Step 1.17: Exam Workflow Recipient & Review Authorization Coercion
- **File Modified**: [src/exam-workflow.mjs:19, 35, 51, 52](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-workflow.mjs#L19)
- **Action**:
  Compare `instance.account_id` and `actor.id` using `String()`.

#### Step 1.18: Content Archive Author & Teacher Visibility Coercion
- **File Modified**: [src/learning-archive.mjs:155, 166, 175, 182, 186, 194](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-archive.mjs#L155)
- **Action**:
  Bind `String(actor.id)` and coerce `archived_by` equality checks.

#### Step 1.19: Chat Worker Identity Mapping & Direct Policy Filtering
- **File Modified**: [src/chat-worker.mjs:81, 86, 99, 101, 103, 113, 124, 175, 187, 191, 224, 227, 237, 242, 248, 252, 311](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L81)
- **Action**:
  Coerce identity lookups across all policy member filtering routines.

#### Step 1.20: Integrated Worker Authorization Guard Coercion
- **File Modified**: [src/learning-integrated-worker.mjs:269, 282, 607, 615, 624, 1120](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L269)
- **Action**:
  Coerce `session.id`, `actor.id`, and `studentId` using `String()` in all guards.

---

### Stage 2: Schema Definition Updates & Batch Insertion Sequencing

#### Step 2.1: Update Account Database Schema in `schema.sql`
- **File Modified**: [schema.sql:1-81](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/schema.sql#L1-L81)
- **Action**:
  Declare `id INTEGER PRIMARY KEY AUTOINCREMENT` for `users`, `registrations`, `account_changes`.
  Declare `user_id INTEGER NOT NULL` across `user_state`, `user_added`, `sessions`, `account_changes`.
  Preserve exact token `'CREATE TABLE IF NOT EXISTS sessions ('` at line 57.

#### Step 2.2: Add Missing Table Definition `user_card_gone` to `schema.sql`
- **File Modified**: [schema.sql:81](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/schema.sql#L81)
- **Action**:
  Append:
  ```sql
  CREATE TABLE IF NOT EXISTS user_card_gone (user_id INTEGER NOT NULL, card_key TEXT NOT NULL, PRIMARY KEY (user_id, card_key));
  ```

#### Step 2.3: Update Dynamic Schema Initializer in `src/worker.js`
- **File Modified**: [src/worker.js:298-312](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L298-L312)
- **Action**:
  Align `ensureSchema()` DDL strings with `INTEGER PRIMARY KEY AUTOINCREMENT`.

#### Step 2.4: Update Account Changes Schema Initializer in `src/worker.js`
- **File Modified**: [src/worker.js:3063-3065](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L3063-L3065)
- **Action**:
  Align `ensureChangeTable()` DDL string with integer identifiers.

#### Step 2.5: Decouple User & Registration D1 Batch Insertions in `src/worker.js`
- **File Modified**: [src/worker.js:1718-1725, 3747-3755, 3797-3805](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L1718)
- **Action**:
  Execute `INSERT INTO users` sequentially, extract `result.meta.last_row_id`, and bind this ID to subsequent registration insertion.

---

### Stage 3: Zero-Loss Data Migration & Cross-Database Synchronization

#### Step 3.1: Create Data Migration Script
- **Status**: `🟩` verified done.
- **File Created**: `migrations/account/001_integer_account_ids.sql`
- **Action**:
  Build `legacy_account_ids` mapping table and swap `DB` tables with integer primary keys.

#### Step 3.2: Rebuild Dependent Tables and Foreign Keys in `STUDY_DB`
- **Status**: `🟩` verified done.
- **Files Created**: `migrations/learning/009_account_integer_ids.sql`, `ops/migrate-account-integer-ids.mjs`
- **Scope**: 26 dependent tables:
  `account_refs`, `profile_members`, `account_settings`, `lesson_access`, `operation_receipts`, `class_group_students`, `exam_work`, `exam_instances`, `exam_reviewer_hides`, `assessment_work`, `assessment_history`, `assessment_recordings`, `account_error_items`, `speakout_answers`, `account_archives`, `content_archive`, `chat_rooms`, `chat_members`, `chat_assignments`, `chat_messages`, `chat_mutations`, `chat_send_budget`, `security_sessions`, `qr_media`, `qr_feedback`, `qr_speech_attempts`.
- **Action**:
  Update references in child tables using `legacy_account_ids`.
  Apply table replacement pattern on tables protected by immutable triggers (`qr_media`, `qr_feedback`, `qr_language_usage`).

#### Step 3.3: Remap `catalog_documents` Namespaces
- **Status**: `🟩` verified done.
- **Scope**: Namespaces `accounts-group-teachers`, `feedback-user-limits`, `account-invites`, `passkey-credentials`, `passkey-challenges`, `microsoft-identities`, `google-identities`.
- **Action**:
  Execute JSON tree transformations to update contained string IDs to new integer IDs.

#### Step 3.4: Rebuild Direct Chat Rooms (`direct:a:b`) and Preserve AEAD Cipher Payload Context
- **Status**: `🟩` verified done.
- **Files**: [src/learning-messages.mjs:25, 29-30](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L25), [src/chat-encryption.mjs:15-16](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-encryption.mjs#L15)
- **Action**:
  Decrypt encrypted messages using old room context prior to renaming direct rooms to new integer ID pairs.

#### Step 3.5: Migrate R2 Storage Objects
- **Status**: `🟩` verified done.
- **Bucket**: `env.MEDIA`
- **Action**:
  Copy `${old_id}/*` to `${new_id}/*`, `${old_id}/account-state.json` to `${new_id}/account-state.json`, and `gone/${old_id}` to `gone/${new_id}`.

#### Step 3.6: Invalidate Cached Directory File in R2 Storage
- **Status**: `🟩` verified done.
- **File**: [src/worker.js:2941, 3021](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L2941)
- **Action**:
  Delete `directory/accounts.json` from `env.MEDIA`.

#### Step 3.7: Re-create Partial Indexes on Migrated D1 Account Tables
- **Status**: `🟩` verified done.
- **Action**:
  Re-create all 9 partial indexes across account tables.

---

### Stage 4: Test Harness & Fixture Updates

#### Steps 4.1 to 4.4: Update Test Fixture Schemas
- **Status**: `🟩` verified done.
- **Files Modified**:
  - [test/test-account-archive-lifecycle.mjs:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-archive-lifecycle.mjs#L14)
  - [test/test-email-otp.mjs:67](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-email-otp.mjs#L67)
  - [test/test-learning-accounts-live-code.mjs:52-54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-accounts-live-code.mjs#L52-L54)
  - [test/test-learning-integrated.mjs:254](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-integrated.mjs#L254)
- **Action**:
  Align mock DDL statements with `INTEGER PRIMARY KEY AUTOINCREMENT`.

---

### Stage 5: Production Asset Compilation & Final Verification

#### Steps 5.1 & 5.2: Production Asset Compilation & Final Verification
- **Status**: `🟩` verified done.
- **Commands**:
  - `npm run build:preview`
  - `node --test test/test-learning-integrated.mjs test/test-learning-accounts-live-code.mjs test/test-account-archive-lifecycle.mjs test/test-email-otp.mjs test/test-account-integer-id-migration.mjs`

---

### Codebase Stabilization & Hygiene Tasks

#### Step 6.1: Text Color Picker Focus Restoration Verification
- **Files**: [production/color-picker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/color-picker.js), [test/test-text-color-selection-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-text-color-selection-ui.mjs)
- **Status**: `🟩` verified done.

#### Step 6.2: Add Rejection Handler to Telemetry Call
- **File**: [client/30-stats.js:14](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/30-stats.js#L14)
- **Status**: `🟩` verified done.
- **Action**:
  Append `.catch(() => {})` to stats POST fetch call.

#### Step 6.3: Remove Orphan DOM Attributes in `site/preview.html`
- **File**: [site/preview.html:15, 54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L15)
- **Status**: `🟩` verified done.
- **Action**:
  Remove dead attribute `data-role-navigation="true"` and `data-home-theme`.

#### Step 6.4: Document Service Endpoint `/api/speech-scenarios`
- **File**: [src/learning-integrated-worker.mjs:662](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L662)
- **Status**: `🟩` verified done.
- **Action**:
  Add inline comment documenting service endpoint purpose.

#### Step 6.5: Coerce 49 Uncoerced Account Equality Comparisons in Server and Chat Clients
- **Files**:
  - [src/worker.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js) (20 locations)
  - [src/account-invites.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs) (1 location)
  - [src/chat-profiles.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-profiles.mjs) (4 locations)
  - [src/exam-recommendations.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-recommendations.mjs) (1 location)
  - [src/kit-exams.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/kit-exams.mjs) (2 locations)
  - [src/learning-activity.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-activity.mjs) (1 location)
  - [src/learning-exam-instances.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exam-instances.mjs) (3 locations)
  - [src/learning-paired-themes.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-paired-themes.mjs) (4 locations)
  - [src/learning-profile.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-profile.mjs) (1 location)
  - [src/quiz-feedback-delivery.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-feedback-delivery.mjs) (1 location)
  - [src/quiz-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-media.mjs) (2 locations)
  - [src/speech-coaching.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-coaching.mjs) (3 locations)
  - [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js) (1 location)
  - [production/chat/80-dialogs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js) (3 locations)
  - [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js) (2 locations)
- **Status**: `🟩` verified done.
- **Action**:
  Apply string coercion `String(...)` across all 49 identified account equality comparisons.
