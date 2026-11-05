# План устранения ошибок сохранения посещаемости и сканеров (FIX-ATTENDANCE-AND-PROBES)

**Связанные баги**:
- `e140b90aa68e58cde90ce11335f712bc`: `POST /api/groups/attendance` -> `400 groupId and month are required.`
- `d61a94cc36c98761dec6f8320743c791`: `GET /api/actuator/env` -> `501 Not migrated. No production fallback.`

**Связанные файлы**:
- [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js)
- [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs)
- [`src/sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs)
- [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
- [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs)
- [`test/test-sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-sensitive-paths.mjs)

---

## 1. Точная формулировка проблем и первопричин

### Проблема A (Баг e140b90aa68e58cde90ce11335f712bc)
- В `client/53a-group-calendar.js#L203-L212` функция сохранения посещаемости `saveGroupAttendanceData` формирует тело запроса с полем `monthKey` (`monthKey: '2026-11'`).
- Серверный обработчик в `src/learning-integrated-worker.mjs#L613` выполняет проверку `if(!body.groupId||!body.month) throw new StudyError(400,'groupId and month are required.');`.
- Так как поле `month` отсутствует в объекте тела, сервер отклоняет запрос с ошибкой HTTP 400, предотвращая сохранение дат уроков и отметок студентов в рабочей среде.

### Проблема B (Баг d61a94cc36c98761dec6f8320743c791)
- Внешний сканер уязвимостей выполняет запрос `GET /api/actuator/env`.
- Маршрут не перехватывается ранним фильтром `isSensitiveFileProbe` в `src/sensitive-paths.mjs` и не исключается в `bugWatch`.
- Запрос попадает в стейдж-воркер, возвращает `501 Not migrated. No production fallback.` и генерирует паразитные записи в таблице `Bugs`.

### Задача C (Отмена даты урока длительным нажатием)
- Быстрый клик (< 500 мс) открывает материал урока через `window.lmOpenLesson(lesson.id)`.
- Длительное нажатие (>= 500 мс) удаляет дату из расписания без перехода в урок.

---

## 2. Границы области изменений и инварианты

> [!WARNING]
> Запрещено нарушать контракты существующих API-методов, аутентификацию пользователей и сохранение других типов данных. Изменения строго изолируются в сопоставлении полей `month`/`monthKey`, фильтрации зондов `actuator` и событиях удержания ячеек календаря.

Инварианты:
1. `src/learning-integrated-worker.mjs` и `ops/preview-learning-workbench.mjs` поддерживают как `body.month`, так и `body.monthKey`.
2. `client/53a-group-calendar.js` передает оба ключа (`month` и `monthKey`).
3. Пути со сканированием `actuator` немедленно возвращают `404 Not found` без вызова базы данных и логирования багов.
4. Открытие уроков по быстрому клику сохраняется.

---

## 3. Детерминированная верификация

1. Таргетированные тесты:
   - `node --test test/test-learning-attendance.mjs`
   - `node --test test/test-sensitive-paths.mjs`
   - `node --test test/test-local-workbench-launch-ui.mjs`
2. Сборка клиентских и серверных ассетов:
   - `npm run build:preview && node ops/build-learning-production-assets.mjs`

---

## 4. Чек-лист реализации

### ЭТАП 1. Устранение коллизии схемы параметров посещаемости (`FIX-ATTENDANCE-PARAMS`)

- `🟩` Задача 1.1: Обновление `src/learning-integrated-worker.mjs#L613` для поддержки `const month = body.month || body.monthKey`.
- `🟩` Задача 1.2: Обновление `client/53a-group-calendar.js#L203-L212` с передачей обоих полей `month` и `monthKey`.
- `🟩` Задача 1.3: Синхронизация `ops/preview-learning-workbench.mjs` для поддержки обоих полей.
- `🟩` Задача 1.4: Тестирование сохранения посещаемости через `test/test-learning-attendance.mjs`.

### ЭТАП 2. Блокировка сканеров Actuator (`FIX-ACTUATOR-PROBE`)

- `🟩` Задача 2.1: Добавление `actuator` в `privateDirectory` в `src/sensitive-paths.mjs#L1`.
- `🟩` Задача 2.2: Добавление `actuator` в `bugWatch` в `src/learning-integrated-worker.mjs#L1334`.
- `🟩` Задача 2.3: Тестирование перехвата зондов через `test/test-sensitive-paths.mjs`.

### ЭТАП 3. Реализация отмены урока длительным нажатием (`FEAT-LONG-PRESS-CANCEL`)

- `🟩` Задача 3.1: Реализация распознавания длительного нажатия (>= 500 мс) на `.gcw-day.has-lesson` в `client/53a-group-calendar.js`.
- `🟩` Задача 3.2: Добавление анимации/стиля `.gcw-day.is-pressing` в `site/preview.css`.
- `🟩` Задача 3.3: Сборка ассетов (`npm run build:preview && node ops/build-learning-production-assets.mjs`) и проверка Playwright.
