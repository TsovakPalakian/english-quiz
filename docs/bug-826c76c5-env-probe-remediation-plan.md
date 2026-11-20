# План устранения ложных отчетов об ошибках от сканеров env (Bug ID: 826c76c5bdfb116e50b17bd31bb5257a)

**Связанный баг**: `826c76c5bdfb116e50b17bd31bb5257a` (`GET /api/env` -> `403 Configured test host only.`)  
**Связанные файлы**:
- [`src/sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs)
- [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs)
- [`src/bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs)
- [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs)
- [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs)

---

## 1. Точная формулировка проблемы и первопричина (Root Cause Analysis)

1. Внешний автоматический сканер уязвимостей выполнил запрос `GET /api/env` по протоколу HTTP к хосту `lumiscia.org`.
2. Сетевой экран в [`src/learning-integrated-worker.mjs:233`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L233) выполнил проверку протокола и хоста (`url.protocol !== 'https:' || url.hostname !== env.STAGE_ALLOWED_HOST`) и отклонил незащищенный HTTP-запрос со статусом `403 Configured test host only.`.
3. Путь `/api/env` не был внесен в перечень `privateFile` в [`src/sensitive-paths.mjs:2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2), поэтому запрос не был завершен с кодом `404 Not found.` до прохождения к сетевому экрану.
4. Фильтр зондирований `bugWatch` в [`src/learning-integrated-worker.mjs:1705`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1705) и метод `recordHttpBug` в [`src/bug-log.mjs:213-215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L213-L215) не содержали префикс `/api/env`, в результате чего штатный ответ `403` сетевого экрана был сохранен в таблице дефектов `bug_reports`.

---

## 2. Границы области изменений и инварианты (Invariants)

> [!WARNING]
> Запрещено нарушать работу легитимных API-маршрутов приложения, в том числе `/api/environment`. Изменения строго изолированы обработкой зондов `env` в `src/sensitive-paths.mjs`, `src/learning-integrated-worker.mjs`, `src/bug-log.mjs` и соответствующими тестами.

Инварианты:
1. Запросы к `env` (включая `/api/env` и `/env`) возвращают немедленный ответ `404 Not found.` без аутентификации, запросов к базе данных и регистрации дефектов в `bug_reports`.
2. Легитимный маршрут `/api/environment` не считается сканированием и обрабатывается в штатном режиме.

---

## 3. Детерминированная верификация

1. Таргетированный запуск тестов:
   - `node --test test/test-sensitive-paths.mjs test/test-bug-log.mjs`
2. Сборка производственных ассетов:
   - `npm run build:preview && node ops/build-learning-production-assets.mjs`

---

## 4. Чек-лист реализации

### ЭТАП 1. Изоляция сканирований env и возврат 404 без регистрации багов (`ENV-PROBE-STAGE-1`)

> [!WARNING]
> Запрещено затрагивать логику аутентификации и обработку легитимных запросов пользователей.

- `🟩` Задача 1.1: Добавление `'env'` в набор `privateFile` в [`src/sensitive-paths.mjs:2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2).
- `🟩` Задача 1.2: Добавление `env` в фильтр сканеров в [`src/learning-integrated-worker.mjs:1705`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1705) и [`src/bug-log.mjs:215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L215).
- `🟩` Задача 1.3: Добавление путей `/api/env` и `/env` в тесты [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs) и [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).
- `🟩` Задача 1.4: Сборка ассетов (`npm run build:preview && node ops/build-learning-production-assets.mjs`) и прогон тестов.
