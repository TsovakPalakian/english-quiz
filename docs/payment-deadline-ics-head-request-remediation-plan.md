# Remediation Plan: Payment Deadline and Calendar ICS HEAD Request Support

## Problem Statement

When a client (browser pre-check, calendar downloader, or crawler) sends an HTTP `HEAD` request to `/api/groups/payment-deadline.ics`, the endpoint in [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L767) only accepted `method === 'GET'`. The request bypassed the handler and was forwarded to [`src/learning-stage-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L163), where it triggered:
```json
{
  "status": 501,
  "body": "{\"error\":\"Not migrated. No production fallback.\"}"
}
```
This failure was recorded as Bug ID `4543936f5f0a347326a7a8654e9f8c91`.

A similar condition existed for `/api/groups/calendar.ics` at [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L696).

## Scope Boundaries and Invariants

- Strictly preserve all existing `GET` query parameter parsing (`groupId`, `date`, `amount`, `requisites`, `isEndMonth`, `time`, `duration`, `period`, `title`, `material`).
- Strictly preserve all generated iCalendar fields (`DTSTART`, `DTEND`, `SUMMARY`, `DESCRIPTION`, `VALARM`, `RRULE`).
- For `HEAD` requests, return HTTP 200 with identical response headers (`Content-Type: text/calendar; charset=utf-8`, `Content-Disposition`, `Cache-Control: no-cache`) but an empty body (`null`), adhering to RFC 9110.
- Mandatory Isolation: Do not modify or break any unrelated endpoints, auth routines, or UI components.

> [!CAUTION]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал.

## Implementation Stages and Checklist

- 🟩 Stage 1: Update ICS endpoints in `src/learning-integrated-worker.mjs` to support both `GET` and `HEAD`.
- 🟩 Stage 2: Add comprehensive unit tests in `test/test-learning-attendance.mjs` verifying HEAD and GET responses for both `/api/groups/payment-deadline.ics` and `/api/groups/calendar.ics`.
- 🟩 Stage 3: Verification with targeted test execution and production asset builder (`npm run build:preview`).
