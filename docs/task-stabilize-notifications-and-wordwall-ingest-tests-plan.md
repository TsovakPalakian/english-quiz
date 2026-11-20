# Implementation Plan: Stabilize Lesson Notifications and Wordwall URL Ingest Tests

## Scope Isolation & Collateral Protection Warning

> <span style="color: red; font-weight: bold;">WARNING</span>: Touching, modifying, or breaking functionality unrelated to the lesson notifications sound alert note selector collision and the Wordwall URL ingest quiz types count assertions is strictly prohibited. Edits are isolated exclusively to lesson notifications sound note class, stylesheet styling, and test assertions for quiz type pill counts.

---

## Approved Design Mockups & Screenshots

### «Скриншот 1»: Centered Notifications Modal with Sound Alert Timing Schedule
![«Скриншот 1»: Centered Notifications Modal with Sound Alert Timing Schedule](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-modal-location-sky.png)

### «Скриншот 2»: Tab 4 Current Lesson Complement with Quiz Type Pills
![«Скриншот 2»: Tab 4 Current Lesson Complement with Quiz Type Pills](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-53-approved-screenshot-4-tab-current-lesson.png)

---

## Checklist

- 🟩 Isolate sound alert timing description with dedicated class `.lesson-notify-timing-note` in lesson notifications
- 🟩 Update CSS styles to support `.lesson-notify-timing-note` identically to note style
- 🟩 Update test assertions for Tab 4 Complement Lesson quiz type pills count to match 21 total types and 20 default active types
- 🟩 Rebuild preview bundle with `npm run build:preview`
- 🟩 Verify targeted test execution for both test suites
- 🟩 Verify full test suite stability without regressions
