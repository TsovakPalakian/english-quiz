# Единый план доработок календаря, посещаемости и исправления ошибок (UNIFIED-CALENDAR-REMEDIATION-PLAN)

**Связанные компоненты**:
- Клиентский виджет календаря и журнала: [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js)
- Стили интерфейса: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
- Серверный API-воркер: [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs)
- Модуль защиты путей от сканеров: [`src/sensitive-paths.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/sensitive-paths.mjs)
- Локальный стенд воркбенча: [`ops/preview-learning-workbench.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs)

---

## 1. Спецификация доработок

### 1.1. Исправление серверных ошибок
1. **Баг `e140b90aa68e58cde90ce11335f712bc` (`POST /api/groups/attendance` -> 400)**:
   - В `src/learning-integrated-worker.mjs#L613` разрешить чтение месяца из `body.month || body.monthKey`.
   - В `client/53a-group-calendar.js#L203-L212` отправлять оба поля `month` и `monthKey`.
   - В `ops/preview-learning-workbench.mjs` поддержать чтение обоих полей.
2. **Баг `d61a94cc36c98761dec6f8320743c791` (`GET /api/actuator/env` -> 501)**:
   - В `src/sensitive-paths.mjs#L1` добавить `actuator` в `privateDirectory`.
   - В `src/learning-integrated-worker.mjs#L1334` добавить `actuator` в регулярное выражение `bugWatch`.
   - В `test/test-sensitive-paths.mjs` добавить проверку путей `actuator`.

### 1.2. Очистка дат по умолчанию
- В `client/53a-group-calendar.js#L17-L34` очистить `defaultLessonDates = new Set()` и `defaultAttendance = {}`. Календарь открывается без предустановленных дат ноября.

### 1.3. Выравнивание полос прогресса в Statistics
- В `site/preview.css#L6792-L6797` задать для `.gcw-stat-name` фиксированную ширину `flex: 0 0 170px; width: 170px; overflow: hidden; text-overflow: ellipsis;` (на мобильных устройствах `120px`), обеспечивающую единую вертикальную линию начала полос прогресса `.gcw-stat-track`.

### 1.4. Привязка уроков строго по датам
- В `client/53a-group-calendar.js` поиск урока `getLessonForDate(groupId, dateStr)` сопоставляет уроки группы строго по условию `material.date === dateStr`.

### 1.5. Привязка экзаменов и подсказка
- В `client/53a-group-calendar.js` добавить функцию `getExamForDate(groupId, dateStr)` по условию `exam.date === dateStr`.
- Клик по дате с экзаменом открывает экзамен через `examOpenSelected(exam.id)`.
- Всплывающая подсказка `data-gcw-tooltip` выводит `Exam: {title}` либо объединенную строку `Lesson N • Exam: {title}` при совпадении.

### 1.6. Цветовая матрица точек (диаметр 5px, круглая форма)
- 🟢 **Зеленая точка** (`.gcw-dot.is-green`): урок создан в материалах группы И назначен на эту дату в календаре (`lesson.date === dateStr && state.lessonDates.has(dateStr)`).
- 🔵 **Синяя точка** (`.gcw-dot.is-blue`): урок создан на эту дату в материалах (`material.date === dateStr`), но дата НЕ отмечена как планируемый урок в календаре (`!state.lessonDates.has(dateStr)`).
- 🔴 **Красная точка** (`.gcw-dot.is-red`): дата отмечена в календаре (`state.lessonDates.has(dateStr)`), но готового урока под нее в группе нет (`!lesson`).
- 🟠 **Оранжевая точка** (`.gcw-dot.is-orange`): на эту дату назначен экзамен группы (`exam.date === dateStr`).
- При наличии нескольких событий на одну дату выводится контейнер `.gcw-dots` с точками в ряд.

### 1.7. Отмена даты длительным нажатием (Long-Press)
- На ячейках дней с назначенным уроком удержание клавиши мыши или касания от 500 мс отменяет дату (`state.lessonDates.delete(dateStr)`), сохраняет изменения на сервере и блокирует переход в урок.
- Обычный клик (< 500 мс) открывает урок через `window.lmOpenLesson(lesson.id)`.

---

## 2. Чек-лист реализации

### ЭТАП 1. Устранение серверных ошибок и защита от сканеров (`STAGE-SERVER-FIX`)

> [!WARNING]
> Запрещено нарушать контракты существующих API и логику аутентификации. Изменения изолируются в приеме параметров `month`/`monthKey` и фильтрации путей `actuator`.

- `🟩` Задача 1.1: Поддержка `body.month || body.monthKey` в `src/learning-integrated-worker.mjs#L613` и отправка обоих полей в `client/53a-group-calendar.js#L203-L212`.
- `🟩` Задача 1.2: Добавление `actuator` в `privateDirectory` в `src/sensitive-paths.mjs#L1` и в `bugWatch` в `src/learning-integrated-worker.mjs#L1334`.
- `🟩` Задача 1.3: Синхронизация `ops/preview-learning-workbench.mjs` для поддержки обоих ключей.
- `🟩` Задача 1.4: Тестирование `test/test-learning-attendance.mjs` и `test/test-sensitive-paths.mjs`.

### ЭТАП 2. Очистка дат по умолчанию и выравнивание линий в Statistics (`STAGE-CLEANUP-ALIGN`)

> [!WARNING]
> Запрещено нарушать сохранение данных посещаемости и правый блок метрик `.gcw-stat-meta`.

- `🟩` Задача 2.1: Очистка предустановленных дат ноября `defaultLessonDates = new Set()`, `defaultAttendance = {}` в `client/53a-group-calendar.js#L17-L34`.
- `🟩` Задача 2.2: Установка фиксированной базовой ширины `.gcw-stat-name` (`flex: 0 0 170px; width: 170px; overflow: hidden; text-overflow: ellipsis;`) в `site/preview.css#L6792-L6797` и адаптивной ширины `120px` на мобильных экранах.

### ЭТАП 3. Синхронизация дат уроков и экзаменов, всплывающие подсказки и цветовые индикаторы (`STAGE-DATES-DOTS`)

> [!WARNING]
> Запрещено нарушать логику табов журнала и выставление отметок посещаемости.

- `🟩` Задача 3.1: Привязка уроков строго по условию `material.date === dateStr` в `client/53a-group-calendar.js`.
- `🟩` Задача 3.2: Привязка экзаменов по условию `exam.date === dateStr`, вывод `data-gcw-tooltip` для экзаменов и переход по клику через `examOpenSelected` в `client/53a-group-calendar.js`.
- `🟩` Задача 3.3: Реализация 4 типов точек (зеленая, синяя, красная, оранжевая) диаметром 5px в `client/53a-group-calendar.js` и стилизация `.gcw-dot` в `site/preview.css`.

### ЭТАП 4. Отмена даты длительным нажатием (`STAGE-LONG-PRESS`)

> [!WARNING]
> Запрещено блокировать обычный клик (< 500 мс) для открытия материала урока.

- `🟩` Задача 4.1: Распознавание длительного нажатия (>= 500 мс) через события pointer с отменой даты урока в `client/53a-group-calendar.js`.
- `🟩` Задача 4.2: Стилизация визуального отклика `.gcw-day.is-pressing` в `site/preview.css`.

### ЭТАП 5. Верификация (`STAGE-VERIFICATION`)

- `🟩` Задача 5.1: Сборка клиентских и производственных ассетов `npm run build:preview && node ops/build-learning-production-assets.mjs`.
- `🟩` Задача 5.2: Запуск тестов `test/test-learning-attendance.mjs`, `test/test-sensitive-paths.mjs`, `test/test-local-workbench-launch-ui.mjs`.
- `🟩` Задача 5.3: Playwright-проверка всех четырех типов точек, выравнивания полос прогресса в Statistics, очищенного ноября и отмены даты длительным нажатием.
