# План стабилизации тестовых фикстур групп в локальном воркбенче (FIX-WORKBENCH-GROUP-FIXTURE)

**Связанный модуль**: [`ops/preview-learning-workbench.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs)  
**Затронутые тесты**:
- [`test/test-local-workbench-launch-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-workbench-launch-ui.mjs)
- [`test/test-local-azure-preview-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-azure-preview-ui.mjs)
- [`test/test-wordwall-interactive-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-wordwall-interactive-ui.mjs)

---

## 1. Точная формулировка проблемы и первопричина (Root Cause Analysis)

1. В коммите `dc78449` в файле [`ops/preview-learning-workbench.mjs#L32`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs#L32) название синтетической группы с идентификатором `1` было переименовано с `A1 Monday` на `B1 Group`.
2. Функция группировки интерфейса в [`client/52-lessons.js#L115-L160`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L115-L160) распределяет учебные группы по уровням на основе префикса заголовка (`accountGroupLevel(group)`). В результате группа `1` отображается только при выборе уровня `B1` и отсутствует в списке уровня `A1`.
3. Три интеграционных UI-теста выполняют строгую последовательность селекторов:
   - [`test/test-local-workbench-launch-ui.mjs#L20`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-workbench-launch-ui.mjs#L20): `await page.locator('[data-group-level="A1"]').click(); await page.locator('[data-group-open="1"]').click();`
   - [`test/test-local-azure-preview-ui.mjs#L25`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-azure-preview-ui.mjs#L25): `await page.locator('[data-group-level="A1"]').click(); await page.locator('[data-group-open="1"]').click();`
   - [`test/test-wordwall-interactive-ui.mjs#L35`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-wordwall-interactive-ui.mjs#L35): `await page.locator('[data-group-level="A1"]').click(); await page.locator('[data-group-open="1"]').click();`
4. Поскольку под фильтром `[data-group-level="A1"]` группа с идентификатором `1` больше не отображается, Playwright ожидает появления элемента `[data-group-open="1"]` до истечения таймаута 10000ms и завершает тесты с ошибкой `TimeoutError`.

---

## 2. Границы области изменений и инварианты (Invariants)

> [!WARNING]
> Запрещено изменять клиентский код приложения в `client/`, стили в `site/preview.css` или публичные API-контракты сервера. Все изменения изолируются исключительно в синтетических данных локального сервера [`ops/preview-learning-workbench.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs).

Инварианты:
1. Группа `1` возвращает название `A1 Monday` с уровнем `A1`, уроком `1` и составом учащихся, обеспечивая прохождение тестов UI-воркбенча.
2. Группа `3` создается с названием `B1 Group`, уровнем `B1`, 6 студентами и полным набором данных посещаемости, обеспечивая работоспособность виджета календаря и посещаемости.
3. Фикстуры посещаемости `attendanceService.saveGroupAttendance` заполняются для обеих групп (`1` и `3`).

---

## 3. Детерминированная верификация

1. Таргетированный запуск трех упавших тестов:
   - `node --test test/test-local-workbench-launch-ui.mjs`
   - `node --test test/test-local-azure-preview-ui.mjs`
   - `node --test test/test-wordwall-interactive-ui.mjs`
2. Таргетированный запуск теста сервиса посещаемости:
   - `node --test test/test-learning-attendance.mjs`
3. Сборка производственных ассетов:
   - `npm run build:preview && node ops/build-learning-production-assets.mjs`

---

## 4. Чек-лист реализации

### ЭТАП 1. Восстановление фикстур групп и связей участников в воркбенче (`FIX-STAGE-1`)

> [!WARNING]
> Запрещено нарушать контракты обработчиков `/api/groups/attendance`, `/api/messages/send` и структуру существующих уроков `lessons`.

- `🟩` Задача 1.1: Восстановление заголовка группы `1` на `A1 Monday` и добавление группы `3` `B1 Group` в массив `groups` в [`ops/preview-learning-workbench.mjs#L32`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs#L32).
- `🟩` Задача 1.2: Добавление связей студентов `u1`–`u6` в массив `members` для обеих групп `1` и `3`, а также инициализация посещаемости для обеих групп через `attendanceService.saveGroupAttendance`.
- `🟩` Задача 1.3: Сборка ассетов (`npm run build:preview && node ops/build-learning-production-assets.mjs`), запуск тестов `test-local-workbench-launch-ui.mjs`, `test-local-azure-preview-ui.mjs`, `test-wordwall-interactive-ui.mjs` и подтверждение 100% прохождения.
