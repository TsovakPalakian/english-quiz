# План устранения сетевых зондов файлов конфигурации и исключения ложных багов (Remediation Plan)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать или нарушать схему базы данных, таблицы пользователей, систему аутентификации `identify`, пользовательский интерфейс уроков, режимы квиза и несвязанные маршруты API. Задачи строго и изолированно задевают только свой функционал. Изменения ограничены добавлением `config.js` в список защищенных приватных файлов `src/sensitive-paths.mjs`, фильтрацией зондов `config.js` в логгере багов `src/bug-log.mjs` и детерминированными тестами в `test/test-sensitive-paths.mjs` и `test/test-bug-log.mjs`.

---

## 1. Точная формулировка проблем (Problem Statement)

### Инцидент 1 (Bug ID: `8297afc6645d7f029d7b415fce45a881`)
- **Маршрут и ошибка**: `CLIENT /` -> `ReferenceError: dayQuizGenerateExtraMemoryPairs is not defined` на экране `daysetup`.
- **Причина**: Нажатие кнопки `data-dq-mem-gen` в развертывании `6ee7e821-3699-4c2b-836e-ac8079a110c3` (коммит `9ac1a24`) при отсутствии определения функции.
- **Статус в кодовой базе**: Устранено в коммите `51ff20b`. Функция `dayQuizGenerateExtraMemoryPairs` реализована в [`client/03g-core.js#L1148`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1148) и экспортирована в [`client/03g-core.js#L1232`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1232). Ожидает публикации пользователем.

### Инциденты 2–5 (Bug IDs: `076ebd468cd3f0fa7c60bde4d51c5670`, `fbc8601bba199eb17cbf8b213f87f654`, `c391215ec9ccea86c69bb0912d78b2ee`, `503e2c7cb537f0d2b710dafa1bc7c411`)
- **Маршруты и ошибки**:
  - `GET /api/bedrock/config.js` -> `501 Not migrated. No production fallback.`
  - `GET /api/openai/config.js` -> `501 Not migrated. No production fallback.`
  - `GET /api/minimax/config.js` -> `501 Not migrated. No production fallback.`
  - `GET /api/openrouter/config.js` -> `501 Not migrated. No production fallback.`
- **Источник**: Сканер с IP `45.148.10.95`.
- **Причина**: Имя `config.js` отсутствовало в `privateFile` в [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2). Запросы передавались в стейдж-воркер [`src/learning-stage-worker.mjs#L176`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L176), возвращали статус 501 и регистрировались логгером [`src/bug-log.mjs#L206`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L206).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2): добавление `'config.js'` в `privateFile`.
  - [`src/bug-log.mjs#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L215): фильтрация путей, оканчивающихся на `config.js`.
  - [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs): добавление проверки путей `/api/bedrock/config.js`, `/api/openai/config.js`, `/api/minimax/config.js`, `/api/openrouter/config.js`.
  - [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs): добавление зондов к `config.js` в список игнорируемых путей.

- **Инварианты**:
  - Легитимные запросы API к существующим эндпоинтам не затрагиваются.
  - Ранний возврат HTTP 404 (`{"error":"Not found."}`) для всех зондов конфигурационных файлов до вызова базы данных и аутентификации.
  - Запрет генерации записей в таблице багов при внешнем зондировании.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Тестирование приватных путей: `node --test test/test-sensitive-paths.mjs`.
2. Тестирование журнала багов: `node --test test/test-bug-log.mjs`.
3. Тестирование генератора пар Memory: `node test/test-day-quiz-memory-gemini-stepper.mjs`.
4. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
5. Сборка предпросмотра: `npm run build:preview`.
6. Контроль чистоты репозитория: `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- 🟩 Добавить `'config.js'` в `privateFile` в [`src/sensitive-paths.mjs#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs#L2) и фильтрацию `config.js` в `recordHttpBug` в [`src/bug-log.mjs#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L215).
- 🟩 Добавить тесты зондов `config.js` в [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs) и [`test/test-bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).
- 🟩 Выполнить сборку производственных ресурсов и предпросмотра.
- 🟩 Запустить верификационные тесты и убедиться в успешном прохождении.
