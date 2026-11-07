# План реализации: Защищённые инвайт-ссылки с шифрованием токена, верификацией Email OTP и прямым доступом

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СМЕЖНОГО ФУНКЦИОНАЛА:**
> Строго запрещается изменять, удалять или нарушать работу несвязанных модулей приложения. Все существующие публичные API-контракты авторизации ([`src/worker.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js)), обработка сессий Passkey ([`src/passkeys.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/passkeys.mjs)), чата ([`src/chat-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs)) и учебных программ должны оставаться в неизменном виде.

---

## 1. Ссылка на задачу
* Jira Issue: [TASK-19](https://lumiscia.atlassian.net/browse/TASK-19)
* Тип задачи: `Bug / Task`
* Формат будущего сообщения коммита: `[bug] TASK-19 Encrypted invite token with 1h OTP and 48h brute-force ban guard`

---

## 2. Область изменений и затрагиваемые файлы

| Файл | Назначение |
| :--- | :--- |
| [`src/account-invites.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs#L1-L314) | Генерация криптографического токена, шифрование полезной нагрузки ссылки (AES-GCM), валидация хэша в БД |
| [`src/email-otp.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L1-L167) | Увеличение срока жизни OTP до 1 часа (`TTL_MS = 3600000`), ограничение частоты отправки 1 раз в 12 часов (`RESEND_MS = 43200000`), ограничение 3 попытки, блокировка на 48 часов (`BAN_MS = 172800000`) |
| [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1379-L1464) | Обработка эндпоинта регистрации: прямой вход для студента и учителя при валидном инвайте и подтверждённом OTP; перевод в `pending` только при обычной регистрации без инвайта |
| [`client/05-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L444-L457) | Обновление интерфейса регистрации по инвайту: отображение шага ввода кода OTP, таймера отправки 1 раз в 12 часов, экрана блокировки на 48 часов и резервной кнопки Google OAuth |
| [`client/40-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L451-L466) | Обработка отправки OTP с параметром `quietBug: true`, предотвращение всплывающего системного окна `#learning-main-banner` |
| [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4184-L4188) | Стилизация плашки группы `.hint.notice-group` и предупреждения `.hint.ban` в цветовой гамме гостевого экрана `body.guest-auth` |
| [`test/test-invite-encrypted-otp.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-invite-encrypted-otp.mjs#L1-L330) | Модульные и интеграционные тесты жизненного цикла токена, OTP, срока действия, коллизий повторного использования и блокировки на 48 часов |
| [`test/test-invite-registration-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-invite-registration-ui.mjs#L1-L150) | Визуальные и сценарийные UI-тесты интерфейса регистрации, отправки OTP и отображения блокировки |

---

## 3. Этапы реализации и статус проверки

* 🟩 **Этап 1: Модификация модуля EmailOtp ([`src/email-otp.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L14-L61))**
  * Задан срок действия кода `TTL_MS = 60 * 60 * 1000` (1 час).
  * Установлен лимит повторной отправки `RESEND_MS = 12 * 60 * 60 * 1000` (12 часов).
  * Реализовано ограничение `MAX_ATTEMPTS = 3`.
  * Реализовано пространство блокировок `email-otp-ban` с фиксацией IP-адреса и почты на 48 часов (`48 * 60 * 60 * 1000`).
* 🟩 **Этап 2: Шифрование полезной нагрузки инвайта ([`src/account-invites.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/account-invites.mjs#L14-L126))**
  * Генерация случайного секрета (256 бит) и сохранение `SHA-256(secret)` в каталоге документов БД.
  * Симметричное шифрование токена алгоритмом AES-256-GCM для передачи в URL.
  * Расшифровка, верификация хэша токена и проверка срока действия при переходе.
* 🟩 **Этап 3: Обработка эндпоинтов авторизации ([`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1379-L1464))**
  * Проверка OTP для студентов и преподавателей.
  * Прямой доступ (статус `active` + создание сессии) при наличии валидного инвайта.
  * Статус `pending` при регистрации без инвайта.
  * Проверка состояния бана (48 часов) перед отправкой и верификацией кода.
* 🟩 **Этап 4: Пользовательский интерфейс и стилизация ([`client/05-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L444-L457), [`client/40-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L451-L466), [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4184-L4188))**
  * Отображение формы с инвайтом, полей ввода и кнопки отправки кода.
  * Показ шага ввода 6-значного OTP, индикатора срока 1 час и отсчёта до следующей отправки (12 часов).
  * Отображение экрана временной блокировки на 48 часов при превышении 3 ошибок.
  * Интеграция кнопки Google OAuth в качестве резервного подтверждения.
  * Оформление баннеров в строгом соответствии с палитрой гостевого ночного экрана Lumiscia (`body.guest-auth`).
  * Подавление модального диалога `#learning-main-banner` при статусе 429 через `quietBug: true`.
* 🟩 **Этап 5: Сборка и автоматическое тестирование**
  * Запуск сборщика ассетов `npm run build:preview` и генератора `node ops/build-learning-production-assets.mjs` завершён успешно со статусом `production-assets-built-locally`.
  * Модульные и интеграционные тесты `node --test test/test-email-otp.mjs test/test-account-invites.mjs test/test-invite-encrypted-otp.mjs`: 26 тестов пройдено успешно (0 сбоев).
  * Автоматические UI-тесты `node test/test-invite-registration-ui.mjs`: 27 проверок пройдено успешно (0 сбоев).
* 🟩 **Этап 6: Стилизация и формулировки уведомления об ожидании подтверждения ([`client/40-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L100), [`client/07-microsoft.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/07-microsoft.js#L34), [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3587), [`test/test-saas-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-saas-ui.mjs#L222))**
  * Исключено упоминание `"or a developer"` из клиентских статусов.
  * В строках статусов и flash-сообщений настроен перенос строк (`\n`) и удалены завершающие точки в самом конце текста.
  * Добавлены CSS-правила `text-align: center; white-space: pre-line;` для классов `.account-gate [data-form-status]` и `.account-gate .auth-flash`.
  * В тестах `test-invite-registration-ui.mjs` и `test-saas-ui.mjs` верифицированы точные двухстрочные формулировки и центрирование.

---

## 4. Сводка результатов автоматической проверки

| Набор тестов | Команда запуска | Количество тестов | Статус |
| :--- | :--- | :-: | :-: |
| Модульные тесты OTP | `node --test test/test-email-otp.mjs` | 9 | 🟩 Пройдено |
| Тесты системы инвайтов | `node --test test/test-account-invites.mjs` | 10 | 🟩 Пройдено |
| Интеграционные тесты инвайтов и OTP | `node --test test/test-invite-encrypted-otp.mjs` | 7 | 🟩 Пройдено |
| Сценарные тесты UI регистрации | `node test/test-invite-registration-ui.mjs` | 27 | 🟩 Пройдено |
| Сценарные UI-тесты SaaS | `node test/test-saas-ui.mjs` | 1 | 🟩 Пройдено |
| Сборщик ресурсов предпросмотра | `npm run build:preview` | 1 | 🟩 Пройдено |
| Сборщик производственных ассетов | `node ops/build-learning-production-assets.mjs` | 1 | 🟩 Пройдено |
