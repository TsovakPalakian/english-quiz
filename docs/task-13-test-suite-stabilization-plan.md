# Task 13 Test Suite Zero-Regression Stabilization Plan

## Scoped Boundaries & Collision Prevention

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал.
> Changes are strictly restricted to:
> 1. Scaling factors in figure fitting algorithm for tight mobile viewports in astronomy calculation (`client/06-auth-astronomy.js`).
> 2. Viewport visibility scrolling during screenshot verification in manual script test (`test/test-manual-script-ai-agent.mjs`).
> 3. Suppressing cookie banner pointer intercept during exam workflow execution in exams UI test (`test/test-exams-ui.mjs`).
> 4. Staging static badge assets in source repository (`site/badges/`) and enforcing asset build copy to production targets (`ops/build-learning-production-assets.mjs`).
> Core FSRS spaced-repetition logic, session tokens, audio recording, database schemas, and lesson editor structures must remain untouched.

## Problem Statement

During CI test suite execution on GitHub Actions, 315 scripts passed and 5 scripts failed with console errors:
- `test-feedback-ui.mjs`: 10 console errors (404 Not Found on `/badges/badge-*-symbol.png`)
- `test-auth-sky-blackhole.mjs`: 10 console errors (404 Not Found on `/badges/badge-*-symbol.png`)
- `test-cookie-consent-visual.mjs`: 47 console errors (404 Not Found across navigation cycles)
- `test-feedback-carousel-visual.mjs`: 10 console errors (404 Not Found on `/badges/badge-*-symbol.png`)
- `test-telegram-recipients-ui.mjs`: 10 console errors (404 Not Found on `/badges/badge-*-symbol.png`)

Root cause: The 5 badge PNG images were present in the local rollback asset build directory, but were not committed in `site/badges/`. In the fresh CI clone, `site/badges/` was empty, leading to 404 responses for the 10 `<img>` elements in `site/preview.html`.

## Implementation Checklist

- 🟩 Stage 1: Extend scaling factors down to `0.11` in `fitFigure` (`client/06-auth-astronomy.js`)
- 🟩 Stage 2: Rebuild preview bundles (`npm run build:preview` and asset builder)
- 🟩 Stage 3: Scroll `lmFrameImport` into view before screenshot in `test/test-manual-script-ai-agent.mjs`
- 🟩 Stage 4: Pre-set `cookie_consent` in `test/test-exams-ui.mjs` to prevent pointer interception
- 🟩 Stage 5: Copy 5 badge symbol files into `site/badges/` and `docs/badges/`
- 🟩 Stage 6: Enforce badge directory copy assertion in `ops/build-learning-production-assets.mjs`
- 🟩 Stage 7: Rebuild production assets and verify all 5 failing tests pass with 0 console errors
- 🟩 Stage 8: Verify full test suite passes locally with 0 regressions
