# Exam Workflow

Exam-specific editor and preview overrides live in `staging/exam-workflow.js`.
Lesson branches delegate unchanged. Definitions and assigned copies live in
`exam_materials`, not `lesson_blocks`; assignment creates frozen independent IDs.
`blockColor` is generated once and persisted. Task totals include scored children
once; Content group is visual and has no score. The demo's Rule contains its own
snapshot instead of reading a live grammar definition.

Answer HTML is the teacher reference. Student catalog/draft projections withhold
it and acceptable variants. Submitted assessment snapshots expose `modelAnswer`.
Learner responses remain in `assessment_work.answers_json`. Exact checking and
objective quizzes produce suggestions only, never publish marks automatically.
Overall feedback is visible after publication; private notes stay teacher-only.

`GET/POST /api/exams/workflow` tracks assigned, in_progress, submitted,
under_review, results_published and completed. Opening results and explicit
acknowledgement are separate events. Events use `assessment_history` with kind
`exam-workflow`, deduplicated by assigned instance and event, in the same atomic
submission transaction where appropriate. Block drafts/submissions/reviews retain
their existing history. Chat notices use the existing durable SQL outbox and
read-receipt counters; workflow writes request immediate delivery.

Legacy instance status `completed` means teacher publication; use workflow state
and the `completed` journal event for student acknowledgement metrics. Assigned
timestamps are milliseconds; history timestamps are Unix seconds. Active time
must not be inferred from elapsed wall-clock time between these events.

`POST /api/exams/recommendation` is teacher-only and binds a recommendation to a
submitted answer/criteria signature and work revision. The endpoint never changes
marks. It sends no structured account identifiers, caps answers/time/output/rate,
rejects redirects, caches successful recommendations, and records disabled/failed
review in Bugs without answer content. An optional dedicated grading service uses
`EXAM_REVIEW_PROVIDER=local|external`, `EXAM_REVIEW_URL`, `EXAM_REVIEW_MODEL`, and
server secret `EXAM_REVIEW_KEY`. It accepts `{task,model,data}` and returns
`{points,explanation,confidence,model}`. Provider selection is independent of exam
definitions. The current text-expression analyzer is not a validated exam grader:
until a grading service passes a quality benchmark, use manual review.

## Demonstration

`scripts/seed-exam-workflow-demo.mjs --plan <existing private worker.vars path>`
performs read-only checks. `--apply` creates/enrolls only the named test accounts
and prepares A1 Exam Demo with all 16 exam quiz types, media, Answer modes, Tasks,
Content groups and nested groups. `--exercise` additionally performs a labelled
server-side test submission/review/completion and leaves a separate fresh exam.
Passwords are never changed and no production session is forged. The script
requires Turso to remain the globally selected provider before and after work.

Run `node --test scripts/test-exam-workflow.mjs`, the existing main/chat suites,
and browser tests `scripts/test-exams-ui.mjs`, `scripts/test-material-quiz-ui.mjs`.
Authenticated browser verification uses the user's actual account login.
