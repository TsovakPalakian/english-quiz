# План устранения коллизий посещаемости, сетевых зондов и ложных багов словаря (Remediation Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать схему базы данных `catalog_documents`, таблицы пользователей `users`, систему аутентификации `identify`, права преподавателей `teacherMayTeachGroup`, интерфейс каталога групп, механизм поиска словаря и несвязанные маршруты API. Изменения строго ограничены перехватом HTTP 409 со слиянием отметок посещаемости в `client/53a-group-calendar.js`, добавлением `auth.json` и `postman.json` в список защищенных путей `src/sensitive-paths.mjs`, исключением зондов API-схем и авторизации из логгера багов в `src/learning-integrated-worker.mjs`, а также исключением штатных ответов HTTP 404 ("No such word or phrase.") маршрута `/lookup` из логгера багов в `src/bug-log.mjs` и `src/learning-integrated-worker.mjs`.

---

## 1. Точная формулировка проблем (Problem Statement)

### Проблема 1 (Bug ID: `db774cecd0f68a32cdfc71fb99f6c075`)
- **Маршрут и ошибка**: `POST /api/groups/attendance` -> `409 Attendance document changed. Reload it before editing.` (Счетчик: 9).
- **Файл и строки на клиенте**: [`client/53a-group-calendar.js#L208-L218`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L208-L218)
- **Файл логгера клиентских багов**: [`client/main/main-bridge.js#L254-L258`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L254-L258)
- **Причина**: Вызов `accountFetch('/api/groups/attendance', { method: 'POST', body: JSON.stringify(payload) })` выполняется без параметра `quietBug: true`. При несовпадении ревизии сервер возвращает статус HTTP 409. Функция `api()` в `client/main/main-bridge.js` выбрасывает исключение и отправляет отчет в `/api/bugs`. Блок `else if (res && res.status === 409)` в `client/53a-group-calendar.js` не выполняется, а блок `catch {}` подавляет ошибку без обновления `state.revision` и без повторной загрузки. Повторные клики преподавателя отправляют устаревшую ревизию, повторно вызывают 409 и повторно отправляют баг-репорты.

### Проблема 2 (Bug ID: `3d3d3e902fa4b52abe00ddef0a0221d8`)
- **Маршрут и ошибка**: `GET /api/auth.json` -> `501 Not migrated. No production fallback.` (Счетчик: 2, IP: 195.178.110.94).
- **Файл списка приватных файлов**: [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2)
- **Файл фильтра телеметрии багов**: [`src/learning-integrated-worker.mjs#L1336-L1337`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1336-L1337)
- **Причина**: Внешний сканер опрашивает файл учетных данных `auth.json` по пути `/api/auth.json`. Так как `auth.json` отсутствует в наборе `privateFile` в `src/sensitive-paths.mjs`, запрос не блокируется ранним ответом 404, а передается в `learning-stage-worker`, где выбрасывается `501 Not migrated. No production fallback.`. В функции `bugWatch` логгер `recordHttpBug` регистрирует зонд как внутренний сбой.

### Проблема 3 (Bug ID: `16e7fdb4f562d22b6328526ddee2901c`)
- **Маршрут и ошибка**: `GET /api/postman.json` -> `501 Not migrated. No production fallback.` (Счетчик: 2, IP: 195.178.110.94).
- **Файл списка приватных файлов**: [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2)
- **Файл фильтра телеметрии багов**: [`src/learning-integrated-worker.mjs#L1336-L1337`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1336-L1337)
- **Причина**: Тот же внешний сканер параллельно опрашивает экспорт коллекций Postman по пути `/api/postman.json`. Файл `postman.json` отсутствует в наборе `privateFile`, в результате чего запрос доходит до `learning-stage-worker` и генерирует ложный баг 501.

### Проблема 4 (Bug ID: `94b3174821d477002487b64b0f84ab67`)
- **Маршрут и ошибка**: `GET /lookup?word=spektor&context=Regina%20Spektor` -> `404 No such word or phrase.` (Счетчик: 6).
- **Файл обработчика словаря**: [`src/worker.js#L4832`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L4832)
- **Файлы телеметрии багов**: [`src/learning-integrated-worker.mjs#L1321-L1322`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1321-L1322) и [`src/bug-log.mjs#L115,L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115)
- **Причина**: Поиск слова в словаре при отсутствии словарной статьи возвращает штатный HTTP статус 404 с телом `{"error":"No such word or phrase.","found":false}`. Воркер `learning-integrated-worker.mjs` в строке 1321 проверяет `response.status < 200 || response.status >= 300` и вызывает `recordHttpBug`. Функция `recordHttpBug` и функция `saveBug` в `src/bug-log.mjs` не исключают статус 404 для пути `/lookup` и текста ошибки `'No such word or phrase.'`, ошибочно записывая обычный пользовательский запрос неизвестного слова или имени собственного как критический баг системы.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/53a-group-calendar.js#L190-L221`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L190-L221):
    - Добавление `quietBug: true` к вызовам `accountFetch`.
    - Перехват ошибки HTTP 409 в блоке `catch (err)`.
    - Загрузка актуального документа через `GET /api/groups/attendance?groupId=...&month=...`.
    - Слияние локальных правок с данными сервера без потери проставленных отметок.
    - Обновление `state.revision` до серверного значения.
    - Автоматическая повторная отправка запроса `POST /api/groups/attendance`.
    - Перерисовка виджета в DOM.
  - [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2):
    - Добавление `'auth.json'` и `'postman.json'` в набор `privateFile` для немедленного возврата 404 без запуска базы данных и аутентификации.
  - [`src/learning-integrated-worker.mjs#L1321,L1336-L1337`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1321):
    - Исключение `path === '/lookup' && response.status === 404` из вызова `recordHttpBug`.
    - Обновление фильтра `bugWatch`: исключение зондов API-коллекций и схем (`postman`, `swagger`, `openapi`, `graphql`, `gql`, `auth`) из телеметрии багов.
  - [`src/bug-log.mjs#L115,L208,L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115):
    - Добавление игнорирования `status === 404 && (path === '/lookup' || err === 'No such word or phrase.')` в функцию `saveBug`.
    - Добавление возврата без записи в `recordHttpBug` при `url.pathname === '/lookup' && response.status === 404`.
    - Добавление фильтрации зондов `postman`, `swagger`, `openapi`, `graphql`, `gql`, `auth` в `recordHttpBug`.
  - [`test/test-sensitive-paths.mjs#L9`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs#L9):
    - Добавление путей `/api/auth.json`, `/auth.json`, `/api/postman.json`, `/postman.json` в тесты блокировки приватных файлов.
  - [`test/test-bug-log.mjs#L183-L205`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs#L183-L205):
    - Добавление проверок игнорирования `/lookup` 404 в `saveBug` и `recordHttpBug`.
  - Производные файлы сборки: [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и файлы каталога `rollback/production-assets/`.

- **Инварианты**:
  - Сохранение контрактов API `GET /api/groups/attendance` и `POST /api/groups/attendance`.
  - Сохранение авторизации и CAS-валидации в [`src/learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-attendance.mjs).
  - Запрет потери отметок посещаемости, проставленных пользователем.
  - Сохранение контракта словаря: возврат 404 и отображение красной надписи "No such word or phrase." в интерфейсе при отсутствии слова.
  - Запрет регистрации ложных багов от сканеров безопасности, сетевых зондов и поиска неизвестных слов.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Запуск теста проверки приватных путей: `node --test test/test-sensitive-paths.mjs`.
2. Запуск теста логгера багов: `node --test test/test-bug-log.mjs`.
3. Запуск теста службы посещаемости: `node --test test/test-learning-attendance.mjs`.
4. Сборка предпросмотра: `npm run build:preview`.
5. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
6. Проверка чистоты рабочего дерева: `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟩` Добавить `'auth.json'` и `'postman.json'` в `privateFile` в [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2), обновить фильтр `bugWatch` в [`src/learning-integrated-worker.mjs#L1336-L1337`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1336-L1337), добавить исключение 404 для `/lookup` в [`src/bug-log.mjs#L115,L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115) и [`src/learning-integrated-worker.mjs#L1321`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1321).
- `🟩` Добавить проверку путей `/api/auth.json` и `/api/postman.json` в [`test/test-sensitive-paths.mjs#L9`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs#L9) и проверку игнорирования `/lookup` 404 в [`test/test-bug-log.mjs#L236-L245`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs#L236-L245).
- `🟩` Добавить флаг `quietBug: true`, перехват 409, слияние данных и повторную отправку в [`client/53a-group-calendar.js#L190-L260`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L190-L260).
- `🟩` Пересобрать предпросмотр и производственные ресурсы (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`).
- `🟩` Верифицировать тесты `test/test-sensitive-paths.mjs`, `test/test-bug-log.mjs` и `test/test-learning-attendance.mjs`.
