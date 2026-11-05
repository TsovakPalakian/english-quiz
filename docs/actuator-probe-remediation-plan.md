# План устранения ложных отчетов об ошибках от сканеров Actuator (FIX-ACTUATOR-PROBE)

**Связанный баг**: `d61a94cc36c98761dec6f8320743c791` (`GET /api/actuator/env`)  
**Связанные файлы**:
- [`src/sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs)
- [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs)
- [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs)

---

## 1. Точная формулировка проблемы и первопричина (Root Cause Analysis)

1. Внешний автоматический сканер уязвимостей с IP `34.62.9.55` выполнил запрос `GET /api/actuator/env` в поисках уязвимостей Spring Boot Actuator.
2. Приложение разработано на JavaScript (Cloudflare Workers / Node.js) и не использует экосистему Java / Spring Boot.
3. Путь `/api/actuator/env` не входил в список детектируемых сканирований в [`src/sensitive-paths.mjs#L1-L12`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L1-L12) и не был исключен фильтром `bugWatch` в [`src/learning-integrated-worker.mjs#L1326-L1337`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1326-L1337).
4. Запрос прошел до стейдж-воркера [`src/learning-stage-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs), вернул статус `501 Not migrated. No production fallback.` и был записан в базу данных ошибок `Bugs` как сбой приложения.

---

## 2. Границы области изменений и инварианты (Invariants)

> [!WARNING]
> Запрещено нарушать работу легитимных API-маршрутов приложения, в том числе `/api/environment`. Изменения ограничиваются распознаванием сканирований `actuator` в `src/sensitive-paths.mjs`, исключением их из `bugWatch` в `src/learning-integrated-worker.mjs` и тестами в `test/test-sensitive-paths.mjs`.

Инварианты:
1. Запросы к `actuator` (например, `/api/actuator/env`, `/actuator`, `/actuator/health`) возвращают немедленный ответ `404 Not found` без выполнения аутентификации, запросов к базе данных и регистрации багов.
2. Легитимный маршрут `/api/environment` по-прежнему не считается сканированием и обрабатывается в штатном режиме.

---

## 3. Детерминированная верификация

1. Таргетированный запуск тестов:
   - `node --test test/test-sensitive-paths.mjs`
2. Сборка производственных ассетов:
   - `npm run build:preview && node ops/build-learning-production-assets.mjs`

---

## 4. Чек-лист реализации

### ЭТАП 1. Изоляция сканирований Actuator и возврат 404 без регистрации багов (`PROBE-STAGE-1`)

> [!WARNING]
> Запрещено затрагивать логику аутентификации и обработку легитимных запросов пользователей.

- `🟩` Задача 1.1: Добавление `actuator` в набор `privateDirectory` в [`src/sensitive-paths.mjs#L1`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L1), обеспечивающее возврат `404 Not found` до обращения к базе данных или стейдж-воркеру.
- `🟩` Задача 1.2: Добавление `actuator` в фильтр сканеров `bugWatch` в [`src/learning-integrated-worker.mjs#L1334`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1334).
- `🟩` Задача 1.3: Добавление путей `/api/actuator/env` и `/actuator` в тесты [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs) и подтверждение прохождения тестов.
- `🟩` Задача 1.4: Сборка ассетов (`npm run build:preview && node ops/build-learning-production-assets.mjs`) и проверка всех тестов защиты путей.
