# Security Fix Prompt — Teacher Tenant Isolation & Related AuthZ Gaps

**Date:** 2026-10-31  
**Target:** English Quiz / Lumiscia (Cloudflare Workers + D1 + R2 + Durable Objects)  
**Prior audit:** `docs/security-audit-and-remediation-plan.md` (SEC-01…SEC-23 marked remediated).  
**This document:** New findings from white-box re-audit. Use as the sole implementation prompt. Do not reopen SEC-01…SEC-23 unless a regression appears in verification.

---

## 0. Agent Instructions (mandatory structure)

For every finding below, implement in this order:

1. **Root-cause analysis** — no code edits until the invariant and call graph are clear.
2. **Plan** — list exact files and functions to touch (update this document checklist squares only when the user asks).
3. **Isolated remediation** — preserve public API shapes and existing error messages where possible; prefer 403/404 that match nearby handlers.
4. **Verification** — targeted `node --test` on new or modified test files + `npm run build:preview` / production asset builder as used in this repo. Do not run the full suite unless asked. Do not deploy via wrangler. Do not commit or push.

**Invariants (must not break):**

- `DEVELOPER` retains global visibility and management (except self-destructive ops already blocked).
- Session model stays HMAC cookie (`__Host-enquiz_sid` / legacy `enquiz_sid`) with live D1 role/`pwdv` checks in `currentUser`.
- Mutating routes keep fail-closed `sameSiteMutation` / Origin checks.
- Chat encryption, OTP, passkeys, OAuth flows stay unchanged except where this prompt names a file.
- Server remains source of truth; UI-only filtering is never accepted as a fix.

**Reporting format after each completed item:**

- Colored squares only: `🟩` done, `🟨` current, `⬜` not started, `🟥` needs rework.
- One English past-tense commit-message line for completed work (user commits).
- Propose the next scoped item; wait for explicit `do` before coding it.

---

## 1. Threat model (new)

| Actor | Capability today (broken) | Intended capability |
| :--- | :--- | :--- |
| `ADMIN` (teacher A) | Read/write any `USER` study data via managed APIs; list all groups/members; assign any student; rewrite any group’s teacherIds; see all teachers in `/api/admin/users`; chat-contact every account | Only students in groups where A is in `accounts-group-teachers.teacherIds` (or sole creator rules already used for invites); co-teachers only; DEVELOPER bypass |
| `ADMIN` (teacher B) | Same as A across A’s groups | Isolated |
| `USER` (student) | Unchanged by this prompt | Unchanged |
| `DEVELOPER` | Global | Global |

Canonical assignment store: `catalog_documents` namespace `accounts-group-teachers`, key = `String(groupId)`, JSON `{ revision, teacherIds, ... }` (`src/account-group-teachers.mjs`).

Canonical membership store: `class_group_students` (`account_id`, `group_id`).

Reference that already enforces assignment for exams: `mayReviewInstance` in `src/learning-exam-instances.mjs` (lines 45–54). Reuse the same predicate pattern everywhere.

---

## 2. Findings (actionable)

### ISO-01 — Critical — Broken object-level authorization in `managedAccount`

**CWE:** CWE-639 / CWE-284  
**Proof:**

```3524:3546:src/worker.js
export async function managedAccount(env, actor, userId) {
  // ...
  if (actor.role === "ADMIN") {
    if (row.role !== "USER") return { error: json({ error: "You cannot do that." }, 403) };
    return { row: row, songs: false };
  }
```

No join to `class_group_students` / `accounts-group-teachers`. Any authenticated `ADMIN` may call:

- `/api/admin/users/:id` and `/state`, `/texts`, `/lessons`, … in `src/worker.js` admin branch (~3497+)
- All `authorizeManaged` call sites in `src/learning-integrated-worker.mjs` (studentId / `for` / managed card-text-lesson routes ~302, ~584–605, ~952–1064)

**Impact:** Cross-tenant read/write of student cards, texts, lessons, visibility, stats, media keys.

**Fix requirements:**

1. Add a shared helper (preferred location: new `src/teacher-group-access.mjs` or extend `learning-exam-instances.mjs` exports) such as:

   - `async function teacherMayManageStudent(db, actor, studentId): boolean`
   - Rules:
     - `DEVELOPER` → true (subject to existing hidden/role checks in `managedAccount`).
     - `ADMIN` → true iff there exists a non-deleted group G where:
       - student is in `class_group_students` with `group_id = G.id`, AND
       - `teacherIds` for G includes `actor.id` (if teacherIds empty/missing: define one policy and apply everywhere — prefer **deny** for ADMIN when assignment doc missing or empty, matching chat’s `studentMaySeeStaff` when assigned set exists; document the choice in tests).
     - Never allow `ADMIN` to manage another `ADMIN`/`DEVELOPER` (already partially true).

2. Call the helper from `managedAccount` before returning `{ row, songs }` for `ADMIN`.

3. Keep `pairManageDenied` / twin-login behavior unchanged.

4. Tests: teacher A cannot `GET/PUT` managed state of student only in teacher B’s group; teacher A can for own group; DEVELOPER can for both.

**Checklist:** 🟩 ISO-01

---

### ISO-02 — Critical — `GroupService.members` and `list` leak all groups / all memberships

**CWE:** CWE-200 / CWE-639  
**Proof:**

```91:128:src/learning-groups.mjs
  async list(actor){
    // teacher&&!actor.managedStudent ? 1 : 0  → teachers see ALL groups
    ...
  }
  async members(actor){
    // returns ALL class_group_students rows to any reviewer
    return this.db.read('SELECT account_id AS accountId, group_id AS groupId FROM ...');
  }
```

UI test `test/test-teacher-group-isolation-ui.mjs` filters client-side only; API remains open.

**Fix requirements:**

1. `list(actor)` for `ADMIN`: return only groups where `teacherIds` includes `actor.id` (DEVELOPER: all). When acting as `managedStudent`, keep existing student visibility path.
2. `members(actor)` for `ADMIN`: return memberships only for groups the actor may teach; DEVELOPER: all.
3. `assignStudent(actor, accountId, groupId)`:
   - `ADMIN` may set/clear membership only if they may teach the **target** group (when `groupId != null`) and, when moving/removing a student who already belongs to another group, either require DEVELOPER or require may-teach on the **current** group as well (choose one policy; encode in tests; prefer requiring may-teach on current group to prevent stealing students).
4. `manage(actor, …)` mutations on a group id: `ADMIN` must be assigned to that group (create may still auto-assign creator — already at lines 171–173).
5. Tests: mirror UI isolation scenarios at API level (new `test/test-teacher-group-isolation-api.mjs` or extend existing learning-groups tests).

**Checklist:** 🟩 ISO-02

---

### ISO-03 — Critical — Any `ADMIN` may rewrite any group’s `teacherIds`

**CWE:** CWE-269  
**Proof:**

```12:24:src/account-group-teachers.mjs
  async save(actor,body,users){
    if(!reviewer(actor))fail(403,'Teachers only.');
    // no check that actor.id is already on the group or is DEVELOPER-only for reassignment
```

**Impact:** Teacher A adds self to teacher B’s group → bypasses ISO-01/02 after those land if this is left open.

**Fix requirements:**

1. `save`: if `actor.role === 'ADMIN'`, require `actor.id` already in current `teacherIds` **or** `expectedRevision === 0` / no row and actor is creating first assignment only when they also created the group in the same flow — simplest secure rule: **only `DEVELOPER` may change `teacherIds`**, OR `ADMIN` may only add/remove when already listed and cannot remove the last teacher without DEVELOPER. Pick the stricter option that matches product; default recommendation: **DEVELOPER-only for `save` mutations; ADMIN read via `list` filtered**.
2. `list`: for `ADMIN`, return only assignments for groups they belong to (optional hardening).
3. Tests for forbidden cross-group teacher rewrite.

**Checklist:** 🟩 ISO-03

---

### ISO-04 — High — Broken co-teacher filter on `GET /api/admin/users`

**CWE:** CWE-287 / CWE-200  
**Proof:**

```1174:1196:src/learning-integrated-worker.mjs
  const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)session=([^;]+)/);
  // parses unsigned payload; cookie name is wrong
```

Real session cookie names are `__Host-enquiz_sid` / `enquiz_sid` (`src/worker.js` lines 226–242). Filter almost never runs. Even if it ran, payload is not HMAC-verified.

Upstream `forReviewer` (`src/worker.js` ~3384+) only strips DEVELOPER/hidden/revoked — **not** other ADMINs.

**Impact:** Every teacher receives login/email/name of every other teacher.

**Fix requirements:**

1. Delete the `session=` cookie parse block entirely.
2. Filter using the already authenticated `actor` from `identify(accountEnv, request)` (or the user that authorized the accountWorker response).
3. For `actor.role === 'ADMIN'`: keep self + co-teachers (union of `teacherIds` across groups that include `actor.id`) + students the actor may manage (after ISO-01 helper). Never include unrelated ADMINs. Never include DEVELOPER (already in `forReviewer`).
4. Do not trust client-supplied role claims.
5. Test: two teachers, shared group vs disjoint groups; assert response user ids.

**Checklist:** 🟩 ISO-04

---

### ISO-05 — High — Chat policy: staff contacts = all users

**CWE:** CWE-639  
**Proof:**

```80:87:src/chat-worker.mjs
  const contacts=active.filter(u=>{
    if(u.id===user.id||(u.hidden&&user.role!=='DEVELOPER'))return false;
    if(staff(user))return true;  // every ADMIN sees every account
```

Group rooms already respect `teacherIds` (lines 89–96). Direct-message contact list does not.

**Fix requirements:**

1. For `ADMIN` viewer: contacts = students in groups the teacher teaches + co-teachers on those groups + self rules; `DEVELOPER` unchanged (`return true` for staff is OK only for DEVELOPER).
2. Align `searchPerson` / directory helpers in the same file with the same predicate (SEC-13 was fixed for email disclosure; re-check isolation).
3. After policy change, force policy refresh / inbox reconfigure so cached Durable Object policy cannot serve old contact sets longer than necessary (existing `policyDirtyAt` / TTL ~60s — document or shorten for authz changes if safe).
4. Tests covering chat contact lists for two teachers.

**Checklist:** 🟩 ISO-05

---

### ISO-06 — High — Assessment / exam work cross-student without group gate

**CWE:** CWE-639  
**Proof:**

```76:76:src/learning-assessment.mjs
  account(actor,studentId){ ... if(account!==actor.id&&!reviewer(actor))fail(403,...); return account; }
```

Only exam-block path optionally calls `mayReviewInstance` when `instance?.reviewer_id` is set (line 64). Lesson assessments and `workAccount` in `src/learning-exams.mjs` (326–331) allow any reviewer for any `studentId` once `authorizeManaged` passed (which is ISO-01).

Integrated routes already call `authorizeManaged` before assessment (~605–644 in `learning-integrated-worker.mjs`). Fixing ISO-01 closes the HTTP surface; still harden service layer:

**Fix requirements:**

1. In `AssessmentService.account` and `ExamService.workAccount`, if `actor.role === 'ADMIN'` and `account !== actor.id`, require `teacherMayManageStudent` (or `mayReviewInstance` for exam instances when present).
2. Ensure line 64 does not skip checks when `reviewer_id` is empty — fall back to group teacherIds via `instanceReviewerIds`.
3. Tests for cross-teacher assessment GET/POST denied.

**Checklist:** 🟩 ISO-06

---

### ISO-07 — Medium — Stats impersonation for any student (`as=user`)

**CWE:** CWE-639  
**Proof:** `statAudience` / `resolveStatTarget` in `src/worker.js` (~1043–1062, ~909–920, ~1125–1129) allow `ADMIN` + `as=user` + student id with live USER check only — no group membership.

**Fix requirements:** Gate with `teacherMayManageStudent`. Tests.

**Checklist:** 🟩 ISO-07

---

### ISO-08 — Medium (residual) — Link-preview SSRF hardening

**Status note:** Account `/api/link-preview` already uses host allowlist (`ALLOWED_PREVIEW_PROVIDERS`, `fetchPublicPage` at `src/worker.js` ~1464–1538). Chat previews remain allowlisted in `src/chat-previews.mjs`.

**Residual risk:** DNS rebinding / compromised allowlisted host still yields Worker egress; no resolved-IP pin.

**Fix requirements (hardening, optional after Critical/High):**

1. Prefer reusing `chatPreviewUrl` / `publicFetch` from `chat-previews.mjs` for account link-preview to one code path.
2. Document that Cloudflare Worker egress to RFC1918 is blocked by platform; keep allowlist + https-only + redirect re-validation (already present).
3. Cap response size (already 250000 chars) — keep.

**Checklist:** 🟩 ISO-08

---

### ISO-09 — Low — Password maximum length 32

**Proof:** `validateSignup` / reset paths reject passwords longer than 32 (`src/worker.js` ~481). Encourages weak memorable passwords; not an auth bypass.

**Fix requirements:** Raise max to 128 (or 72 if any bcrypt path exists — this codebase uses PBKDF2). Update client validation copy. Tests.

**Checklist:** 🟩 ISO-09

---

### ISO-10 — Info — Hardcoded twin-login special case

**Proof:** `studyTwinLogin` / `pairManageDenied` special-case login `Tsovak` (`src/worker.js` ~2005–2013).

**Fix requirements:** No security fix required for outsiders; track as product debt. Do not expand special cases.

**Checklist:** 🟩 ISO-10 (document-only; no code change)

---

## 3. Suggested implementation order

| Step | ID | Square |
| :---: | :--- | :---: |
| 1 | ISO-01 shared helper + `managedAccount` | 🟩 |
| 2 | ISO-06 service-layer gates (uses helper) | 🟩 |
| 3 | ISO-07 stats gate | 🟩 |
| 4 | ISO-02 groups list/members/assign/manage | 🟩 |
| 5 | ISO-03 teacher assignment save | 🟩 |
| 6 | ISO-04 admin users filter | 🟩 |
| 7 | ISO-05 chat contacts | 🟩 |
| 8 | ISO-08 / ISO-09 optional hardening | 🟩 |
| 9 | ISO-10 note only | 🟩 |

After step 1 lands, re-run targeted isolation tests before opening step 4–7 (they depend on the same helper).

---

## 4. Shared helper sketch (normative)

```js
// src/teacher-group-access.mjs (new)
// teacherMayManageStudent(db, actor, studentId) → boolean
// teacherGroupIds(db, actor) → number[]
// teachersVisibleTo(db, actor) → Set<string>  // self + co-teachers
```

SQL pattern (illustrative; use parameterized study `db.read` / D1 `prepare().bind`):

- Student’s group: `SELECT group_id FROM class_group_students WHERE account_id = ?`
- Teachers for group: `SELECT value_json FROM catalog_documents WHERE namespace = 'accounts-group-teachers' AND key = ?`
- ADMIN allowed iff parsed `teacherIds` includes `actor.id`.

Fail closed if tables missing in a given env (return false for ADMIN).

---

## 5. Verification matrix

| Case | Expect |
| :--- | :--- |
| ADMIN_A, student in group taught by A | managed GET/PUT 200 |
| ADMIN_A, student only in B’s group | managed GET/PUT 403 or 404 |
| ADMIN_A `GET /api/groups` | only A’s groups |
| ADMIN_A `GET /api/groups/members` | only memberships for A’s groups |
| ADMIN_A assign student into B’s group | 403 |
| ADMIN_A `AccountGroupTeachers.save` on B’s group | 403 (or DEVELOPER-only) |
| ADMIN_A `GET /api/admin/users` | no ADMIN_B unless co-teacher |
| ADMIN_A chat contacts | no student-only-of-B |
| DEVELOPER | all of the above allowed where previously allowed |
| CSRF / session login regression | existing auth tests still pass |

Commands (ask user before non-allowlisted shell forms): targeted `node --test` on new isolation tests; production/preview asset build per AGENTS.md.

---

## 6. Out of scope for this prompt

- Re-opening SEC-01…SEC-23 unless verification fails.
- Changing DEVELOPER global powers.
- Frontend-only hiding without server gates.
- Wrangler deploy / git commit / push.

---

## 7. Commit message lines (English past tense, per completed step)

- `Enforced group assignment checks in managedAccount for teachers.`
- `Scoped group list and membership APIs to assigned teachers.`
- `Restricted group teacher assignment updates to authorized actors.`
- `Fixed admin user directory filter to use verified actor identity.`
- `Limited chat staff contacts to assigned groups and co-teachers.`
- `Gated assessment and stats student access by teacher group assignment.`

---

## 8. Human gate

Implement **ISO-01** first (shared helper + `managedAccount`). Mark 🟨 on ISO-01 when starting; 🟩 only after tests pass.

Wait for the user’s `do` before editing code for each step.
