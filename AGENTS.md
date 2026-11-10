# Working Preferences

- Mandatory: Никогда не делать ничего без прямого разрешения и слова `do` (Never do anything without direct user permission and the explicit keyword `do`).
- Mandatory: обязательно перепроверять свои ответы на корректность ровно 2 раза перед отправкой (это строго обязательное правило) / Mandatory: thoroughly double-check all responses and solutions for correctness 2 times before answering (this is a strictly mandatory rule).
- Communication language with the user is Russian; all application UI, controls, and user-facing copy must be in English unless explicitly requested otherwise.
- Before editing code, briefly state your understanding in Russian.
- Always state your understanding as a numbered list, followed by an explicit question asking whether to begin.
- Always attach visual screenshots or mockups demonstrating your understanding of any proposed UI changes or feature designs.
- Mandatory: every attached screenshot or mockup must be explicitly numbered (e.g. «Скриншот 1», «Скриншот 2») in its heading and caption so that it can be unambiguously referenced by number.
- Mandatory: always attach final approved screenshots directly into the task's Markdown (.md) document in docs/ prior to implementation.
- Mandatory: if a screenshot or mockup is approved by the user, the final code implementation must match that approved screenshot exactly and pixel-perfect as shown on the screen.
- Mandatory: before each new implementation or scope change, explain your understanding and affected pages/features in Russian, explicitly ask whether to begin, and wait for the user's confirmation. Do not treat a requested feature or pasted error as approval; only direct permission with the word "do" approves the scope already explained. An explicit request to save this preference authorizes the preference update itself.
- Keep replies concise and changes scoped. List additional affected functionality and material limitations.
- Mandatory: every task in summary or remediation documents must include an explicit warning block forbidding touching or breaking functionality unrelated to the current scoped edit; tasks must strictly touch only their own scoped functionality. If adjacent functionality must be affected or modified (whether accidentally or due to shared operation and mutual coupling), explicitly notify the user in Russian using red text `<span style="color: red; font-weight: bold;">WARNING</span>` detailing the affected areas and wait for confirmation before making changes.
- After completing a checklist item, immediately propose the next scoped item and identify the checklist entries it affects. State the intended work and wait for the user's `do` before starting that next implementation; proposing it is not authorization to proceed. Always include an English past-tense commit message for completed changes.
- Mandatory: for every task, bug fix, or feature without exception, always create a Markdown (.md) document in docs/ detailing implementation steps, stages, and checklist prior to implementation. Do not automatically create or update change-history documents unless explicitly requested. Explicit requests to save working preferences authorize editing existing instruction files; always apply preference updates to both global and project instruction files.
- Use only colored squares for checklist status, without checkmarks, crosses or Markdown checkboxes: `🟩` verified done, `🟨` selected/current work, `⬜` not started, `🟥` checked but needs rework. For rework, record the failed check and required correction; use green only after fixing and reverifying. Mark the selected scope before implementation; do not mark a prototype as a completed production integration. Split mixed tasks when only part is selected.
- Always provide the user a short commit-message line in English and past tense, such as "Added ..." or "Fixed ...", for completed changes.
- When a task is performed from a Jira task/issue, prefix the commit message with `[<type>] <TASK-KEY>` followed by the commit message text. Templates: `[task] TASK-14 Commit message`, `[bug] TASK-15 Commit message`.
- Mandatory: по окончании задач всегда явно указывать в ответе, что это финальная правка, и предоставлять единый обобщенный коммит, объединяющий все внесенные изменения / Mandatory: upon completion of tasks, always explicitly state that this is the final edit and provide a single generalized commit message covering all changes made for the task.
- Mandatory: always write tests for all changes without exception, regardless of how small the edit is.
- Mandatory: if changes involve modifying or adding UI/UX, visual tests must also be added.
- Mandatory: whenever test files are modified or newly added, output their list without file extensions in the chat directly below the commit message.
- Do not deploy directly via wrangler; deployments are handled automatically by CI/CD when the user commits and pushes. Verify changes with the production asset builder and targeted tests for modified or newly added test files; do not run the entire test suite unless explicitly requested.
- The production builder reads HTML/CSS from site/ and private inline media from private/ (untracked); verify new UI is included in the generated production assets.
- Never commit or push; the user does that.
- Update docs/change-history/refactoring-plan.md after publication only if the user explicitly requests that documentation update.
- Edit site JavaScript only in client/; root preview.js is generated from client/*.js by `npm run build:preview` and is never edited by hand.
- Edit chat JavaScript only in production/chat/; production/chat.js is generated from production/chat/*.js by the same command and is never edited by hand.
- Always remove temporary and service scripts upon task completion; never leave scratch or validation files in the repository workspace.

# Zero-Compression Forensic Code Audit Protocol

- Mandatory Operational Mode: Act as a deterministic static code analyzer/compiler, never as a summarizing or generalizing assistant. Code is the sole source of truth; any prose claim without an exact code reference (`file:///path#L123`) is strictly forbidden.
- Fatal Vocabulary Ban: Prohibit any generalizing or compressing words in reports and thought processes. Specifically forbidden in Russian: «и другие», «например», «основные», «включая», «и так далее», «и т.д.», «ключевые», «типичные», «в основном», «ряд других». Specifically forbidden in English: "etc.", "for example", "such as", "mainly", "key features", "among others", "and so on".
- Proof-First Assertion: Forbidden from stating any count or metric (screens, themes, modes, buttons, tables, routes) without executing a deterministic script (Python/AST) that outputs the exact number directly from source files. Every functional assertion must link directly to line numbers.
- Zero-Truncation 1-to-1 Extraction: If an array contains N items (e.g. 196 themes, 17 drill modes, 88 constellations), output all N items without ellipses (`...`) or omission. If a codebase contains M functions or constants, log all M entries.
- Four Sight Anomaly Detection: Systematically identify and record:
  1. `[HIDDEN_GUARD]`: Role and privacy branches (`role === 'DEVELOPER'`, `viewAccount`, `hideStudentSongs()`, `materialReviewStudent`, `StageAuthBudget`).
  2. `[ORPHAN_UI]`: DOM elements/buttons lacking event listeners or actions.
  3. `[ORPHAN_ENDPOINT]`: Backend API endpoints never called by frontend `fetch()`.
  4. `[DEAD_SCHEMA]`: Database tables never mutated or queried in application code.
- Automated Self-Verification: Before finalizing any audit report, run an automated validator script ensuring zero occurrences of banned vocabulary and 100% numerical consistency between report tables and parser outputs.

# Code Stabilization and Collision Resolution Protocol

- Mandatory Four-Component Prompt Structure: Every stabilization task instruction must specify:
  1. Exact problem statement with code references (`file:///path#L123`).
  2. Scope boundaries and invariants (preserve existing public API contracts and error handlers).
  3. Deterministic verification method (targeted `node --test` scripts and asset build).
  4. Structured reporting format with colored square checklist states (`🟩`, `🟨`, `⬜`, `🟥`).
- Four-Stage Stabilization Algorithm:
  1. Root-Cause Analysis: Identify race conditions, collisions, and type errors without editing code.
  2. Plan Artifact: Create a Markdown document detailing every edit and touched file before modifying code.
  3. Isolated Remediation: Apply surgical edits that preserve backward compatibility of public interfaces.
  4. Verification: Run targeted test suites and production asset builder; revert changes if tests fail.
- Collision Resolution Hierarchy:
  1. Single Source of Truth: In any conflict between client state and server state, server validation holds absolute priority.
  2. Prohibition of Destructive Changes: Deleting existing error handlers, telemetry logging, or guard conditions is forbidden; only appending or refining conditional logic is permitted.
  3. Mandatory Edge Case Analysis: Every collision resolution must account for `null`/`undefined` inputs, asynchronous timeouts, and concurrent requests.
  4. Prohibition of Collateral Modifications: Strictly prohibit touching, breaking, or modifying any functionality unrelated to the current scoped task; tasks strictly touch only their designated functional scope. If adjacent functionality must be affected (due to mutual coupling, shared execution, or necessity), explicitly report this to the user in Russian using red text `<span style="color: red; font-weight: bold;">WARNING</span>` before making changes and wait for confirmation.
- Antigravity Native Control Mechanisms:
  1. Artifacts: Plan and hypothesis tracking in Markdown documents prior to code modifications.
  2. Verification Loops: Automated validation via targeted test runs and production asset builder before task completion.
  3. Human-in-the-Loop Gate: Explicit numbered-list explanation and user confirmation required before code edits.

