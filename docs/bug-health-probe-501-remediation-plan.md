# План устранения сетевых зондов проверки работоспособности (Health Probes) и исключения ложных багов (Remediation Plan)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать или нарушать схему базы данных, таблицы пользователей, систему аутентификации `identify`, пользовательский интерфейс уроков, режимы квиза и несвязанные маршруты API. Задачи строго и изолированно задевают только свой функционал. Изменения ограничены добавлением `health` и `health.json` в список защищенных приватных путей `src/sensitive-paths.mjs`, фильтрацией зондов `health` в логгере багов `src/bug-log.mjs` и воркере `src/learning-integrated-worker.mjs`, а также детерминированными тестами в `test/test-sensitive-paths.mjs` и `test/test-bug-log.mjs`.

---

## 1. Точная формулировка проблемы и первопричина (Root Cause Analysis)

- **Инцидент**: Bug ID `00f827276865a7d55e7a0bacc913fb0d`
- **Маршрут и метод**: `GET /api/health`
- **Фактический ответ**: HTTP 501 `Not migrated. No production fallback.` (`{"error":"Not migrated. No production fallback."}`)
- **Клиент**: IP `34.79.46.222` (Google Cloud Belgium), User-Agent `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`.
- **Первопричина**:
  1. Внешний автоматический сканер или служба мониторинга опрашивает эндпоинт `GET /api/health`.
  2. Путь `health` отсутствовал в наборе `privateFile` в [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2) и не перехватывался ранним возвратом 404.
  3. Путь `health` отсутствовал в фильтре зондов `bugWatch` в [`src/learning-integrated-worker.mjs#L1705`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1705) и логгере `recordHttpBug` в [`src/bug-log.mjs#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L215).
  4. Запрос проходил до стейдж-воркера [`src/learning-stage-worker.mjs#L185`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L185), где выбрасывал ошибку 501 и регистрировался в базе данных `bug_reports` как критический внутренний сбой приложения.

---

## 2. Границы области изменений и инварианты (Invariants)

- **Затрагиваемые файлы**:
  - [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2): добавление `'health'` и `'health.json'` в `privateFile`.
  - [`src/learning-integrated-worker.mjs#L1705`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1705): добавление `health` в регулярное выражение фильтра `bugWatch`.
  - [`src/bug-log.mjs#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L215): добавление `health` в регулярное выражение фильтра `recordHttpBug`.
  - [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs): добавление тестов для путей `/api/health`, `/health`, `/api/health.json`.
  - [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs): добавление проверки игнорирования зондов `/api/health`.

- **Инварианты**:
  1. Легитимные запросы API к существующим эндпоинтам не затрагиваются.
  2. Ранний возврат HTTP 404 (`{"error":"Not found."}`) для всех зондов проверки `health` до обращения к базе данных, механизму аутентификации и стейдж-воркеру.
  3. Запрет генерации записей в таблице `bug_reports` при внешнем опросе `health`.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Запуск целевых тестов приватных путей:
   - `node --test test/test-sensitive-paths.mjs`
2. Запуск целевых тестов логгера багов:
   - `node --test test/test-bug-log.mjs`
3. Сборка ресурсов предпросмотра и производственных ассетов:
   - `npm run build:preview && node ops/build-learning-production-assets.mjs`
4. Проверка статуса репозитория:
   - `git status --short`

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟩` Задача 1.1: Добавить `'health'` и `'health.json'` в `privateFile` в [`src/sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs).
- `🟩` Задача 1.2: Добавить `health` в фильтр `bugWatch` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) и `recordHttpBug` в [`src/bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs).
- `🟩` Задача 1.3: Добавить тестовые сценарии в [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs) и [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).
- `🟩` Задача 1.4: Выполнить верификацию целевыми тестами и сборку ассетов.
