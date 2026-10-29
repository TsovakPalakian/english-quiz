# Working Preferences

- Communication language with the user is Russian; all application UI, controls, and user-facing copy must be in English unless explicitly requested otherwise.
- Before editing code, briefly state your understanding in Russian.
- Always state your understanding as a numbered list, followed by an explicit question asking whether to begin.
- Mandatory: before each new implementation or scope change, explain your understanding and affected pages/features in Russian, explicitly ask whether to begin, and wait for the user's confirmation. Do not treat a requested feature or pasted error as approval; "do"/"делай" approves only the scope already explained. An explicit request to save this preference authorizes the preference update itself.
- Keep replies concise and changes scoped. List additional affected functionality and material limitations.
- After completing a checklist item, immediately propose the next scoped item and identify the checklist entries it affects. State the intended work and wait for the user's `do` before starting that next implementation; proposing it is not authorization to proceed. Always include an English past-tense commit message for completed changes.
- For each new feature, create a Markdown (.md) document detailing implementation steps and stages. Do not automatically create or update change-history documents unless explicitly requested. Explicit requests to save working preferences authorize editing existing instruction files.
- Use only colored squares for checklist status, without checkmarks, crosses or Markdown checkboxes: `🟩` verified done, `🟨` selected/current work, `⬜` not started, `🟥` checked but needs rework. For rework, record the failed check and required correction; use green only after fixing and reverifying. Mark the selected scope before implementation; do not mark a prototype as a completed production integration. Split mixed tasks when only part is selected.
- Always provide the user a short commit-message line in English and past tense, such as "Added ..." or "Fixed ...", for completed changes.
- Do not deploy directly via wrangler; deployments are handled automatically by CI/CD when the user commits and pushes. Verify changes with the production asset builder and targeted tests for modified or newly added test files; do not run the entire test suite unless explicitly requested.
- The production builder reads HTML/CSS from site/ and private inline media from private/ (untracked); verify new UI is included in the generated production assets.
- Never commit or push; the user does that.
- Update docs/change-history/refactoring-plan.md after publication only if the user explicitly requests that documentation update.
- Edit site JavaScript only in client/; root preview.js is generated from client/*.js by `npm run build:preview` and is never edited by hand.
- Edit chat JavaScript only in production/chat/; production/chat.js is generated from production/chat/*.js by the same command and is never edited by hand.

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
