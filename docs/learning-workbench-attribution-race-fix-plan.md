# Learning Workbench Attribution Race Fix Plan

## Problem Statement

During full test suite execution, [test-learning-workbench-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs#L226) intermittently fails with:
```
TypeError: Cannot read properties of undefined (reading 'public_name')
    at file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs:226:114
```
Clicking `[data-workbench-attribution-save] button` dispatches an asynchronous `POST /proposals/:id/attribution` request to the test server. Because [test-learning-workbench-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs#L225) executes a direct SQLite query against `qr_author_visibility` immediately after `.click()` without awaiting completion, CPU contention during parallel test runs leads to the database query evaluating before the HTTP write transaction finishes committing.

## Scope Boundaries and Invariants

- Tasks must strictly touch only their scoped functionality: [test-learning-workbench-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs).
- Invariants: Preserve all existing assertion logic, test steps, fixtures, and sequence order.
- Synchronization: Await form detachment `[data-workbench-attribution-save]` reflecting completion of the client-side `write` and `mine` cycle prior to inspecting SQLite table rows.

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче; выполняемые задачи строго и изолированно должны задевать только свой функционал. Если случайно или по технической необходимости требуется затронуть и скорректировать смежные части, об этом обязательно требуется заранее уведомить пользователя в чате текстом `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

## Implementation Stages and Checklist

- `🟩` Stage 1: Add deterministic synchronization `await page.locator('[data-workbench-attribution-save]').waitFor({state:'detached'});` following the attribution form submit click in [test-learning-workbench-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs#L225).
- `🟩` Stage 2: Execute targeted verification of [test-learning-workbench-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-workbench-ui.mjs).
- `🟩` Stage 3: Run full production asset builder and test verification.
