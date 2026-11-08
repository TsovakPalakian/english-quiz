# Playwright Browser Launch Stabilization Plan

## Problem Statement

During full test suite execution (`npm run check` via [check-all.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs)), browser tests fail intermittently with:
```
browserType.launch: Timeout 180000ms exceeded.
at launchChromium (ops/check-environment.mjs:86:32)
```
Specifically, [check-environment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-environment.mjs#L41-L43) returns `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` for headless local test runs on macOS. Spawning multiple concurrent instances of the host application causes port exhaustion, Mach IPC namespace contention with the user's running browser session, and leaves orphaned Chrome child processes on process termination.

## Scope Boundaries and Invariants

- Tasks must strictly touch only their scoped functionality: [check-environment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-environment.mjs) and [check-all.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs).
- Existing public contracts of `chromiumExecutable`, `chromiumLaunchOptions`, and `launchChromium` must be preserved.
- When `CHROME_PATH` is explicitly provided, it must be respected in all modes.
- When `SHOW_BROWSER=1` is provided, visible host browser execution remains available.
- Headless automated runs must use Playwright's bundled `Google Chrome for Testing` by defaulting to `undefined`.
- Process termination on runner timeout must issue `SIGTERM` before `SIGKILL` to allow process tree cleanup.

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче; выполняемые задачи строго и изолированно должны задевать только свой функционал. Если случайно или по технической необходимости требуется затронуть и скорректировать смежные части, об этом обязательно требуется заранее уведомить пользователя в чате текстом `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

## Implementation Stages and Checklist

- `🟩` Stage 1: Eliminate existing orphaned Playwright Chrome helper processes via targeted PID termination.
- `🟩` Stage 2: Configure `chromiumExecutable` in [check-environment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-environment.mjs#L39-L43) to default headless runs to Playwright bundled `Google Chrome for Testing` (`undefined`) unless `SHOW_BROWSER=1` or explicit `CHROME_PATH` is passed.
- `🟩` Stage 3: Enhance [check-all.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs#L41-L45) child timeout handling to attempt graceful termination (`SIGTERM`) before hard `SIGKILL`.
- `🟩` Stage 4: Add unit and integration assertions in [test-check-environment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs) verifying headless default returns `undefined` while `SHOW_BROWSER=1` resolves host Chrome.
- `🟩` Stage 5: Execute test suite verification for [test-check-environment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs) and [test-exams-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exams-ui.mjs).
