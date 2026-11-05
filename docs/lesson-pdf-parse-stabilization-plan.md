# План устранения ложной фиксации ошибок анализа PDF уроков (Lesson PDF Parse Remediation Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать схему базы данных `catalog_documents`, таблицы пользователей `users`, систему аутентификации `identify`, логику генерации квизов `gemini-quiz-provider.mjs`, механизм грамматических правил и несвязанные маршруты API. Изменения строго ограничены исключением сетевых и провайдерных статусов 502, 503 и ошибки 'Could not analyse this PDF.' для маршрута `/api/lessons/parse-pdf` из клиентского логгера `client/main/main-bridge.js` и серверного фильтра `src/bug-log.mjs`, добавлением флага `quietBug: true` при импорте в `client/52b-lesson-pdf-import.js`, а также однократным повтором при временной недоступности Gemini в `src/lesson-pdf-meta.mjs`.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Код ошибки и путь**: `POST /api/lessons/parse-pdf?scope=full` -> `503 Could not analyse this PDF.` (Bug ID: `cb62489e4a2c3980de7d66c94c63d59d`, счетчик: 4).
- **Файл вызова импорта на клиенте**: [`client/52b-lesson-pdf-import.js#L479`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L479)
- **Файл фильтра клиентских багов**: [`client/main/main-bridge.js#L192`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L192)
- **Файл фильтра серверного логгера багов**: [`src/bug-log.mjs#L118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L118)
- **Файл адаптера взаимодействия с Gemini**: [`src/lesson-pdf-meta.mjs#L96-L99,L133-L137`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs#L96)
- **Суть сбоя**:
  1. При временной недоступности или перегрузке внешнего сервиса Google Gemini функция `languageProviderHTTP` в [`src/language-provider-http.mjs#L26`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/language-provider-http.mjs#L26) выбрасывает исключение с кодом `provider_unavailable`.
  2. Функция `providerFail` в [`src/lesson-pdf-meta.mjs#L97-L98`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs#L97-L98) сопоставляет этот код со статусом HTTP 503 и сообщением `'Could not analyse this PDF.'`.
  3. Клиентский интерфейс в [`client/52b-lesson-pdf-import.js#L494`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L494) перехватывает ошибку и выводит понятное сообщение пользователю в модальном окне импорта.
  4. Однако вызов `accountFetch` в строке 479 отправляется без флага `quietBug: true`.
  5. В функции `reportClientBug` в [`client/main/main-bridge.js#L192`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L192) проверка исключений маршрута `/api/lessons/parse-pdf` ограничена условием `status === 504 || status === 429`. Ответы 503 и 502 не отсекаются, в результате чего клиент отправляет отчет об ошибке в `/api/bugs` с заголовком `x-client-bug: 1`.
  6. На сервере функция `saveBug` в [`src/bug-log.mjs#L118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L118) также проверяет только `status === 504 || status === 429` и не учитывает ошибку `'Could not analyse this PDF.'` со статусами 502/503, сохраняя ложный отчет в базу данных `bug_reports`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js#L479`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L479):
    - Добавление флага `quietBug: true` в вызов `accountFetch` для операции разбора PDF.
  - [`client/main/main-bridge.js#L192`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L192):
    - Расширение проверки статусов до `[429, 502, 503, 504].includes(status)` и текста ошибки `entry.error?.includes?.('Could not analyse this PDF')` для маршрута `/api/lessons/parse-pdf`.
  - [`src/bug-log.mjs#L118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L118):
    - Расширение фильтрации `saveBug` до `[429, 502, 503, 504].includes(status)` и `err.includes('Could not analyse this PDF')` для маршрута `/api/lessons/parse-pdf`.
  - [`src/lesson-pdf-meta.mjs#L133-L137`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs#L133-L137):
    - Добавление однократного повторного обращения к Gemini при возникновении ошибки `provider_unavailable` или `timeout`.
  - [`test/test-bug-log.mjs#L194-L195`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs#L194-L195):
    - Добавление тестовых событий со статусом 503 и ошибкой `'Could not analyse this PDF.'` для `/api/lessons/parse-pdf`.
  - Производный файл сборки предпросмотра: [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js).

- **Инварианты**:
  - Сохранение контракта API `POST /api/lessons/parse-pdf`.
  - Сохранение вывода текста ошибки пользователю в модальном диалоге импорта PDF.
  - Запрет регистрации сбоев внешнего поставщика языковых моделей как внутренних дефектов приложения.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Запуск теста логгера багов: `node --test test/test-bug-log.mjs`.
2. Запуск теста парсинга PDF: `node --test test/test-lesson-pdf-meta.mjs`.
3. Запуск теста клиентского импорта: `node --test test/test-client-pdf-import.mjs`.
4. Сборка предпросмотра: `npm run build:preview`.
5. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
6. Проверка чистоты рабочего дерева: `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟨` Добавить `quietBug: true` в [`client/52b-lesson-pdf-import.js#L479`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L479) и расширить фильтрацию внешних сбоев Gemini в [`client/main/main-bridge.js#L192`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L192) и [`src/bug-log.mjs#L118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L118).
- `⬜` Добавить однократный повтор при временной ошибке Gemini в [`src/lesson-pdf-meta.mjs#L133-L137`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs#L133-L137).
- `⬜` Добавить проверки статуса 503 для `/api/lessons/parse-pdf` в [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).
- `⬜` Пересобрать предпросмотр и производственные ресурсы (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`).
- `⬜` Верифицировать тесты `test/test-bug-log.mjs`, `test/test-lesson-pdf-meta.mjs` и `test/test-client-pdf-import.mjs`.
