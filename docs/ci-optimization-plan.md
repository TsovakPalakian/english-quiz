# CI/CD Performance Optimization Plan

## Objectives
- Optimize GitHub Actions CI/CD test step duration and overall pipeline turnaround time.
- Fully utilize the 3 vCPUs of the GitHub `macos-15-arm64` runner.
- Cache Playwright Chromium binaries to eliminate redundant browser downloads.
- Guard Homebrew installation against auto-updates (`HOMEBREW_NO_AUTO_UPDATE=1`).

## Checklist

- [ ] `🟩` **Stage 1: Update `.github/workflows/ci-cd.yml` with concurrency and caching**
  - Increase `CHECK_PARALLEL: '3'` and add `CHECK_BROWSER_PARALLEL: '3'` in `test` job env.
  - Add `actions/cache@v4` step for `~/Library/Caches/ms-playwright` keyed by lockfile.
  - Set `HOMEBREW_NO_AUTO_UPDATE=1` for media dependency checks.
- [ ] `🟩` **Stage 2: Align `ops/check-all.mjs` defaults with runner core count**
  - Ensure CI mode uses `Math.min(3, cpuCount)` if environment variables are not overridden.
- [ ] `🟩` **Stage 3: Local verification and full test suite execution**
  - Built production assets (`node ops/build-learning-production-assets.mjs`).
  - Ran full test suite simulating CI mode with 3 workers (`CHECK_MODE=ci CHECK_PARALLEL=3 CHECK_BROWSER_PARALLEL=3 node ops/check-all.mjs`).
  - Result: 165/165 passed in 95s (0 failures, 0 errors).
