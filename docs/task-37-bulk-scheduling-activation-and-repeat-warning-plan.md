# План устранения дефектов массового планирования уроков ([TASK-37](https://lumiscia.atlassian.net/browse/TASK-37))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-37](https://lumiscia.atlassian.net/browse/TASK-37). Запрещено задевать структуру базы данных, расчет стоимости обучения `calculateStudentTuition`, систему экзаменов `examOpenSelected`, функционал удаления слотов `showRemoveScheduleModal`, модальные окна дедлайнов оплаты `showPaymentDeadlineModal`, глобальный словарь, грамматику и сторонние экраны. Все изменения строго и изолированно ограничены:
> 1. Модальным окном массового планирования `showSetGroupScheduleModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
> 2. Верхней панелью действий календаря и логикой всплывающих подсказок в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
> 3. Генератором отчета расписания в чат `Schedule Report` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
> 4. Стилизацией элементов предупреждения и кнопки быстрой активации в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
> 5. Пересборкой клиентского бандла [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) (`npm run build:preview`);
> 6. Комплексными модульными и визуальными тестами в [`test/test-task-37-bulk-scheduling.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-37-bulk-scheduling.mjs).

---

## 1. Точная формулировка проблем и анализ первопричин (Problem Statement & Root Cause)

### Проблема 1: Массовое распределение создает лишь «заготовки» (красные точки), требующие ручного открытия и сохранения каждого урока (Скриншот 1)
- **Первопричина**:
  В функции `showSetGroupScheduleModal` ([`client/53a-group-calendar.js:2332-2352`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2332-L2352)) при сохранении расписания даты добавляются в `monthData.lessonDates`, а метаданные сохраняются в `monthData.scheduleData[d] = { startTime, durationMinutes, period, materialId }`. Однако сам объект материала в библиотеке `lmLibrary.materials` не связывается с датой (`mat.date = d`), временем (`mat.time = currentStartTime`) и группой (`mat.groupId = groupId`). В результате функция проверки фактических уроков `getLessonsForDate(groupId, dateStr)` ([`client/53a-group-calendar.js:137-155`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L137-L155)) возвращает пустой массив. Слот отображается со статусом `isRed` (красная точка: дата запланирована, но урок не опубликован/не активирован).
- **Решение**:
  1. В модальное окно `Set Group Schedule` (Скриншот 5) добавляется чекбокс **`Publish and activate lessons immediately`** (по умолчанию активен). При его включении на этапе сохранения для каждой назначенной даты материалу сразу выставляются `mat.date = d`, `mat.time = currentStartTime`, `mat.groupId = groupId`, и запускается персистентное сохранение (`lmPersist()`). Точки в календаре сразу становятся полноценными активными занятиями (зелеными точками).
  2. В панель управления календаря рядом с кнопкой `📅 Set group schedule` (Скриншот 6) добавляется кнопка быстрого действия **`⚡ Publish all scheduled (N)`**, которая отображается при наличии в текущем месяце слотов-заготовок (красных точек) и позволяет в один клик активировать все назначенные заготовки без необходимости открывать каждую дату вручную.

### Проблема 2: В статусе «заготовки» в отчете чата и тултипах отображается заглушка "Group Lesson" вместо реального названия темы (Скриншот 2)
- **Первопричина**:
  1. В генераторе отчета `Schedule Report` ([`client/53a-group-calendar.js:3331-3333`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3331-L3333)) заголовок извлекается строго из `getLessonsForDate(groupId, d)[0]`. Если урок еще не активирован в `lmLibrary`, массив пуст, и система подставляет дефолтную строку `'Group Lesson'`.
  2. В рендеринге тултипов календаря ([`client/53a-group-calendar.js:681-689`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L681-L689)) при отсутствии активированного урока в тултип выводится лишь обезличенный номер `Lesson <N>`, игнорируя назначенный в `scheduleData[dateStr].materialId` ID материала.
- **Решение**:
  Если `getLessonsForDate` не содержит привязанного материала, но в `monthData.scheduleData[d]?.materialId` указан идентификатор материала, система находит этот материал в `lmLibrary.materials` и подставляет его настоящее наименование:
  - В отчете расписания `Schedule Report` для чата выводится реальное название (Скриншот 7);
  - В тултипе календаря выводится реальное название урока с пометкой заготовки: `Lesson: <Title> (Draft)` (Скриншот 6).

### Проблема 3: Скрытое зацикливание материалов при нехватке уроков в курсе (Скриншот 3, Скриншот 4)
- **Первопричина**:
  В строках [`client/53a-group-calendar.js:2343-2345`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2343-L2345) распределение тем выполняется оператором остатка от деления:
  ```javascript
  assignedMat = groupMaterials[idx % groupMaterials.length];
  ```
  Если дат в выбранном периоде больше, чем доступных тем в курсе (например, 15 дат и 4 урока), система молча назначает одну и ту же тему повторно через каждые 4 занятия. Преподаватель не получает никакого предупреждения об исчерпании уникальных материалов.
- **Решение**:
  В окне `Set Group Schedule` (Скриншот 5) динамически рассчитывается количество слотов в выбранном периоде. Если `targetDates.length > groupMaterials.length` и `groupMaterials.length > 0`, отображается предупреждающий блок:
  `⚠️ Warning: <N> available materials will be repeated to fill <M> scheduled dates.`

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js):
    - Добавление предупреждения о повторении тем и чекбокса `Publish and activate lessons immediately` в `showSetGroupScheduleModal`;
    - Обработка немедленной активации материалов (`mat.date = d`, `mat.time = time`, `mat.groupId = groupId`, вызов `lmPersist()`);
    - Кнопка `⚡ Publish all scheduled` в панели действий календаря и ее обработчик;
    - Разрешение названий материалов по `sched.materialId` в тултипах и отчете `Schedule Report`;
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация блока предупреждения о повторении материалов и кнопки быстрой активации `.btn-publish-all`;
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентского бандла через `npm run build:preview`;
  - [`test/test-task-37-bulk-scheduling.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-37-bulk-scheduling.mjs): модульные и визуальные тесты для всех аспектов задачи TASK-37.

- **Инварианты**:
  - Сохранение полной совместимости структуры данных `/api/groups/attendance` (`lessonDates`, `scheduleData`);
  - Сохранение возможности сохранения уроков в статусе заготовок, если преподаватель снимет чекбокс немедленной активации;
  - Сохранение работы одиночного планирования уроков `Schedule Single Lesson` и удаления уроков `Remove from Schedule`;
  - Неприкосновенность логики экзаменов, посещаемости, дедлайнов оплаты и прав доступа.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Реализация динамического предупреждения о повторении материалов в `showSetGroupScheduleModal` при превышении числа дат над числом тем (`⚠️ Warning: N available materials will be repeated to fill M selected dates`).
- 🟩 **Этап 2**: Добавление чекбокса `Publish and activate lessons immediately` в окно `Set Group Schedule` с привязкой материалов к датам и активацией (зеленые точки).
- 🟩 **Этап 3**: Добавление кнопки быстрого действия `⚡ Publish all scheduled (N)` в верхнюю панель календаря для пакетного перевода заготовок текущего месяца в активные уроки.
- 🟩 **Этап 4**: Подтягивание реальных названий материалов по `scheduleData[date].materialId` в отчете `Schedule Report` для чата и во всплывающих тултипах календаря для слотов-заготовок.
- 🟩 **Этап 5**: Стилизация новых элементов в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и сборка `npm run build:preview`.
- 🟩 **Этап 6**: Разработка модульных и визуальных тестов в [`test/test-task-37-bulk-scheduling.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-37-bulk-scheduling.mjs) и верификация через playwright / node test (4 из 4 тестов пройдены успешно).

---

## 4. Эталонные скриншоты для сверки (Reference Screenshots & Mockups)

### Скриншот 1: Исходное состояние календаря из Jira TASK-37 (красные точки-заготовки и единичные активированные уроки)
![Скриншот 1: Исходное состояние календаря из Jira TASK-37](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-1.png)

### Скриншот 2: Исходный отчет Schedule Report в чате из Jira TASK-37 с заглушками "Group Lesson"
![Скриншот 2: Исходный отчет Schedule Report в чате из Jira TASK-37](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-2.png)

### Скриншот 3: Окно Schedule Single Lesson на 9 ноября с темой "First Date & Relationship Discussion"
![Скриншот 3: Окно Schedule Single Lesson на 9 ноября](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-3.png)

### Скриншот 4: Окно Schedule Single Lesson на 23 ноября с повторением той же темы (скрытое зацикливание)
![Скриншот 4: Окно Schedule Single Lesson на 23 ноября с повторением той же темы](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-4.png)

### Скриншот 5: Предлагаемое окно Set Group Schedule с предупреждением о повторении тем и чекбоксом немедленной активации
![Скриншот 5: Предлагаемое окно Set Group Schedule](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-5.png)

### Скриншот 6: Предлагаемый календарь с кнопкой «⚡ Publish all scheduled (7)» и отображением реальной темы в тултипе заготовки
![Скриншот 6: Предлагаемый календарь с кнопкой Publish all scheduled](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-6.png)

### Скриншот 7: Предлагаемый отчет Schedule Report в чате с настоящими названиями всех назначенных материалов
![Скриншот 7: Предлагаемый отчет Schedule Report в чате](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-37-screenshot-7.png)
