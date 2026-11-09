# План устранения сбоя шага Send final Telegram result в GitHub Actions CI

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, удалять или нарушать функционал приложения, не относящийся к текущей задаче. Запрещено затрагивать логику тестирования, сборку ассетов, деплой на Cloudflare или работу приложения. Изменения строго изолированы и затрагивают исключительно обработку ошибок доставки в [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs), конфигурацию шага в [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml) и модульные тесты в [`test/test-ci-telegram-logs.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ci-telegram-logs.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Контекст**: В GitHub Actions пайплайне на шаге `Send final Telegram result` возник сбой:
  ```
  ✖ Send final Telegram result
  1 > Run node ops/telegram-notify.mjs
  13 Telegram notification could not be delivered: 23.
  14 Error: Process completed with exit code 1.
  ```
- **Техническая причина**:
  1. **Код ошибки `23`**: В среде Node.js при срабатывании `AbortSignal.timeout(30000)` генерируется объект исключения `DOMException` со свойствами `name: 'TimeoutError'` и числовой константой `code: 23` (`DOMException.TIMEOUT_ERR`).
  2. **Формирование строки ошибки**: В [`ops/telegram-notify.mjs:32-34`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs#L32-L34) выражение `err?.cause?.code || err?.code || err?.message` считывает числовое значение `23`, формируя сообщение `Telegram notification could not be delivered: 23.`. Запрос к `api.telegram.org` трижды завершился по таймауту (30 секунд на попытку) из-за сетевой недоступности или задержек серверов Telegram со стороны раннера GitHub Actions.
  3. **Ложное падение пайплайна**: В [`ops/telegram-notify.mjs:112`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs#L112) сбой завершает процесс с кодом `process.exitCode = 1`. В файле [`.github/workflows/ci-cd.yml:135-136`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml#L135-L136) на шаге `Send final Telegram result` не указан параметр `continue-on-error: true`. В результате временная сетевая недоступность внешнего сервиса уведомлений Telegram приводит к завершению всего пайплайна CI/CD со статусом ошибки (красный крест), даже когда этапы тестов и развертывания завершились успешно.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Файлы в области изменений**:
  - [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml): добавление директивы `continue-on-error: true` на шаг `Send final Telegram result` в job `notify`.
  - [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs): корректное распознавание `TimeoutError` / `code: 23` с выводом понятного сообщения `timeout` вместо числа `23`.
  - [`test/test-ci-telegram-logs.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ci-telegram-logs.mjs): добавление модульного теста на форматирование сетевого таймаута с кодом 23.
- **Инварианты**:
  - Сохранение валидации переменных окружения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
  - Сохранение санитайзинга секретов и токенов в сообщениях и логах.
  - Сохранение политики повторных попыток (retries) и экспоненциальной задержки.

---

## 3. Анализ смежных компонентов

<span style="color: red; font-weight: bold;">WARNING</span>:
Изменение шага `Send final Telegram result` на `continue-on-error: true` предотвращает падение CI-пайплайна при временных сетевых таймаутах Telegram. Проверка синтаксиса конфигурации на шаге `Check Telegram configuration (without sending)` в начале пайплайна сохраняет строгий режим и гарантирует выявление некорректно настроенных секретов до запуска тестов.

---

## 4. Этапы реализации (Checklist)

- 🟩 **Этап 1**: Согласование плана и понимания с пользователем.
- 🟩 **Этап 2**: Добавление `continue-on-error: true` на шаге `Send final Telegram result` в [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml).
- 🟩 **Этап 3**: Улучшение обработки причин сбоев в [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs) (распознавание таймаутов `TimeoutError` и `code: 23`).
- 🟩 **Этап 4**: Добавление и прогон тестов в [`test/test-ci-telegram-logs.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ci-telegram-logs.mjs) и [`test/test-check-environment.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs).
- 🟩 **Этап 5**: Предоставление финального отчета, commit message и списка измененных тестов.
