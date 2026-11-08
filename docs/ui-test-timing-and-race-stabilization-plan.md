# UI Test Timing and Race Stabilization Plan

## Problem Statement

During CI test execution across GitHub Actions virtual machines, two UI test suites exhibited timing flakiness due to fixed delays and uncoordinated asynchronous operations:
1. [test-chat-live-contacts-search.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-live-contacts-search.mjs#L120) fails with `0 !== 1` when `waitForTimeout(400)` expires before the 300 ms debounce timer and WebSocket query complete under CPU load.
2. [test-invite-registration-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-invite-registration-ui.mjs#L70) intermittently encounters `locator.click: Timeout 30000ms exceeded` because `setTimeout(..., 150)` in the mock route resolves before the secondary click action executes, detaching `#registerForm [type="submit"]` as the DOM renders `#loginForm`.

## Scope Boundaries and Invariants

- Tasks must strictly touch only their designated functional scope: [test-chat-live-contacts-search.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-live-contacts-search.mjs) and [test-invite-registration-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-invite-registration-ui.mjs).
- Invariants: Preserve all verification assertions, exact query parameters, error handlers, and business logic expectations.
- Prohibit arbitrary hardcoded `waitForTimeout` sleeps in favor of deterministic state polling with generous deadlines.

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче; выполняемые задачи строго и изолированно должны задевать только свой функционал. Если случайно или по технической необходимости требуется затронуть и скорректировать смежные части, об этом обязательно требуется заранее уведомить пользователя в чате текстом `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

## Implementation Stages and Checklist

- `🟩` Stage 1: Replace fragile `waitForTimeout` calls in [test-chat-live-contacts-search.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-live-contacts-search.mjs#L118-L133) with deterministic query polling.
- `🟩` Stage 2: Replace fixed `setTimeout` route delay in [test-invite-registration-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-invite-registration-ui.mjs#L47-L72) with explicit `registrationHold` promise resolution.
- `🟩` Stage 3: Run targeted verification on both test files and confirm asset compilation.
