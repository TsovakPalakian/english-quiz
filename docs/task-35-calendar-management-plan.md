# План реализации управления календарем ([TASK-35](https://lumiscia.atlassian.net/browse/TASK-35))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-35](https://lumiscia.atlassian.net/browse/TASK-35). Запрещено задевать структуру базы данных, логику авторизации, платежный учет `calculateStudentTuition`, систему экзаменов `examOpenSelected`, глобальный словарь, грамматику и сторонние экраны. Все правки строго и изолированно ограничены модальным окном удаления из расписания `showRemoveScheduleModal`, контекстным меню дат календаря и генератором отчетов «Report to chat» для вкладок `Calendar`, `Attendance`, `Statistics` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), стилями диалогового окна удаления в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css), а также сопутствующими модульными и визуальными тестами.

---

## 1. Точная формулировка проблем и требований (Problem Statement)

1. **Разделение разового урока и регулярного расписания группы (Скриншот 3, Скриншот 4, Скриншот 5, Скриншот 6)**:
   - В контекстном меню ячейки календаря (Скриншот 3) пункт переименовывается в **`Schedule lesson`**.
   - В верхней панели календаря (Скриншот 4) добавляется кнопка **`📅 Set group schedule`**. При нажатии открывается окно настройки регулярного графика группы **`Set Group Schedule`** (Скриншот 5):
     - Дни недели (`Mo`, `Tu`, `We`, `Th`, `Fr`, `Sa`, `Su`);
     - Время начала `Start Time`;
     - Унифицированный формат кнопок длительности `45 min`, `60 min`, `90 min`, `120 min` и поле произвольного ввода минут `Custom: [ 60 ] min`;
     - Период (`Current Month`, `Academic Year`, `Custom Period`);
     - Последовательное распределение учебных тем группы по слотам;
     - Автоматическая отправка уведомления в чат Study alerts со ссылками на добавление в **Google Calendar** и скачивание **.ics** (Apple Calendar / Outlook / Mobile Calendar).
   - При клике по конкретной дате календаря или через пункт `Schedule lesson` контекстного меню открывается окно **`Schedule Single Lesson`** (Скриншот 6):
     - Назначение конкретного урока только на выбранную дату;
     - Время начала и унифицированная длительность с полем произвольного ввода минут;
     - Автоматическая генерация календарных ссылок (Google Calendar и `.ics`) в чат Study alerts.
2. **Модальное окно «Remove from Schedule» (Скриншот 7)**:
   - Отдельный диалог удаления слотов с выбором диапазона (`This date only`, `All <Weekdays> in <Month>`, `All scheduled dates in <Month>`, `Custom Period`) и очисткой структур посещаемости.
3. **Облегченное модальное окно с вкладками и динамическими правилами напоминаний «Tuition Deadline & Payment Management» (Скриншот 8, Скриншот 9, Скриншот 10)**:
   - **Разгрузка интерфейса по вкладкам**:
     - Вкладка **`Deadline & Reminders`** (Скриншот 8): дата `Payment Deadline Date`, точное время `Deadline Exact Time`, умная привязка `Anchor to cycle end` и конструктор динамических напоминаний;
     - Вкладка **`Student Invoices`** (Скриншот 9): сводная финансовая панель группы (`Total Invoiced`, `Collected`, `Pending`) и таблица счетов студентов с авторасчетом, ручной корректировкой сумм и статусами `Paid` / `Pending`;
     - Вкладка **`Payment Requisites`** (Скриншот 10): авторасширяемое текстовое поле реквизитов с подсказкой формата.
   - **Конструктор напоминаний произвольного количества и периода (`Any Quantity & Period`)**:
     - Кнопка **`+ Add Reminder`** позволяет добавлять неограниченное число правил напоминания;
     - Каждая строка правила содержит числовое поле значения, селектор единиц измерения (`Hours`, `Days`, `Weeks`), автоматический расчет даты срабатывания и кнопку удаления правила `✕`;
     - Умная привязка к расписанию (`Anchor to cycle end`): система считывает время завершающего занятия расчетного цикла (30 ноября 19:30) и задерживает рассылку любых оповещений до его фактического завершения;
   - Доставка счетов и напоминаний: строго персонально в личный чат Study alerts каждого ученика (Скриншот 11) с кнопкой подтверждения `[ ✅ I have paid ]`;
   - Кнопки управления: `Clear Deadline`, `Cancel` и `Save & Send Invoices Privately`.
4. **Раздельные отчеты «Report to chat» в Study alerts (Скриншот 2)**:
   - `Calendar`: график занятий на месяц — в чат Study alerts группы со ссылками на добавление в Google Calendar и скачивание `.ics`;
   - `Attendance`: личный журнал посещаемости — строго персонально каждому ученику в его Study alerts (ученик видит исключительно свои отметки);
   - `Statistics`: общая статистика группы — в чат Study alerts группы.

2. **Индивидуальный функционал «Report to chat» для каждой вкладки (Скриншот 2)**:
   - В текущем коде [`client/53a-group-calendar.js:2348-2370`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2348-L2370) кнопка «Report to chat» вне зависимости от выбранной вкладки всегда формирует один и тот же текст `Attendance Report`.
   - **Требование**: Реализовать генерацию специализированного отчета в зависимости от `state.activeTab`:
     - **Вкладка `Calendar` (Шаблон расписания)**:
       ```text
       📅 Schedule Report: <Group Title> (<Month> <Year>)
       Scheduled lessons: <N> | Scheduled exams: <M>

       Schedule:
       • <DayOfWeek>, <Mon> <D> · <HH:MM> – <HH:MM> · <Material Title>
       ...
       ```
     - **Вкладка `Attendance` (Шаблон журнала посещаемости по датам)**:
       ```text
       📋 Attendance Journal: <Group Title> (<Month> <Year>)
       Sessions held: <MarkedDatesCount> of <TotalDates> | Average Presence: <Pct>%

       Session Records:
       • <DayOfWeek>, <Mon> <D>: <Pct>% (<PresentCount> present · Absent: <AbsentNames>)
       ...
       ```
     - **Вкладка `Statistics` (Шаблон аналитики и рейтингов)**:
       ```text
       📊 Group Statistics: <Group Title> (<Month> <Year>)
       Total Lessons: <N> | Total Exams: <M> | Students: <S>
       Group Attendance: <Pct>% (<TotalAttended> attended, <TotalMissed> missed)

       Attendance Rankings:
       1. <Student Name> — <Pct>% (<Attended> attended, <Missed> missed of <TotalLessons>)
       ...
       ```

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js): реализация `showRemoveScheduleModal`, открытие окна по клику `Remove from schedule`, логика удаления дат из `monthData.lessonDates` и `monthData.scheduleData`, разделение отчетов `report-chat` по вкладкам `calendar`, `attendance`, `statistics`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация элементов модального окна `.gcw-remove-dialog`, радио-карточек выбора диапазона дат и кнопки деструктивного действия.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): производный файл сборки (`npm run build:preview`).
  - [`test/test-group-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-group-calendar-management.mjs): модульные и контрактные тесты для окна удаления и генераторов отчетов.

- **Инварианты**:
  - Сохранение публичного контракта `renderGroupCalendarWidget` и формата данных `saveGroupAttendanceData`.
  - Сохранение совместимости WebSocket и категории `'learning'` при отправке сообщений в чат.
  - Сохранение функционала пункта `Mark as scheduled date` для незапланированных дней.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Добавление кнопки `📅 Set group schedule` в панель календаря (Скриншот 4) и модального окна регулярного расписания `showSetGroupScheduleModal` (Скриншот 5) с унифицированными кнопками минут (`45 min`, `60 min`, `90 min`, `120 min`) и полем ввода произвольной длительности `Custom: [ 60 ] min`.
- 🟩 **Этап 2**: Преобразование окна разового назначения урока `showSingleLessonModal` (Скриншот 6) на выбранную дату с унифицированной длительностью и генерацией ссылок в Google Calendar и `.ics`.
- 🟩 **Этап 3**: Создание отдельного модального окна `showRemoveScheduleModal` (Скриншот 7) с опциями удаления по датам (одиночная дата, день недели, месяц, диапазон), очисткой структур `lessonDates` и `scheduleData`.
- 🟩 **Этап 4**: Облегченное модальное окно счетов с тремя вкладками и конструктором напоминаний `showPaymentDeadlineModal`:
  - Вкладка `Deadline & Reminders` (Скриншот 8) с точной датой и временем дедлайна, динамическим конструктором любого количества напоминаний (`+ Add Reminder`) любого периода (`Hours`, `Days`, `Weeks`) и умной привязкой `Anchor to cycle end`;
  - Вкладка `Student Invoices` (Скриншот 9) со сводной финансовой панелью и ведомостью студентов;
  - Вкладка `Payment Requisites` (Скриншот 10) с авторасширяемым полем банковских реквизитов;
  - Персональная доставка счетов в Study alerts с кнопкой подтверждения `[ ✅ I have paid ]` (Скриншот 11).
- 🟩 **Этап 5**: Разделение генератора отчетов «Report to chat» (Скриншот 2) по трем вкладкам: расписание занятий — в группу (`Calendar`), персональные журналы посещаемости — лично ученикам (`Attendance`), сводная аналитика — в группу (`Statistics`).
- 🟩 **Этап 6**: Сборка ассетов (`npm run build:preview`), написание и прогон целевых тестов (`test/test-task-35-calendar-management.mjs`).

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-group-calendar-management.mjs test/test-learning-attendance.mjs test/test-group-calendar-scheduler-ui.mjs`.
3. Визуальная валидация сгенерированного диалогового окна через скриншот Playwright.

---

## 5. Финальные утвержденные скриншоты интерфейса (Final UI Mockups)

### Скриншот 1: Исходное контекстное меню даты календаря из Jira
![Скриншот 1: Исходное контекстное меню даты календаря из Jira](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/jira-screen-1.png)

### Скриншот 2: Исходная нижняя панель календаря с кнопкой Report to chat из Jira
![Скриншот 2: Исходная нижняя панель календаря с кнопкой Report to chat из Jira](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/jira-screen-2.png)

### Скриншот 3: Обновленное контекстное меню клика по ячейке календаря
![Скриншот 3: Обновленное контекстное меню клика по ячейке календаря](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-context-menu.png)

### Скриншот 4: Верхняя панель календаря с кнопкой Set group schedule
![Скриншот 4: Верхняя панель календаря с кнопкой Set group schedule](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-calendar-overview.png)

### Скриншот 5: Модальное окно регулярного расписания группы Set Group Schedule
![Скриншот 5: Модальное окно регулярного расписания группы Set Group Schedule](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-set-group-schedule-modal.png)

### Скриншот 6: Модальное окно разового назначения урока Schedule Single Lesson
![Скриншот 6: Модальное окно разового назначения урока Schedule Single Lesson](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-single-lesson-modal.png)

### Скриншот 7: Модальное окно удаления из расписания Remove from Schedule
![Скриншот 7: Модальное окно удаления из расписания Remove from Schedule](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-remove-schedule.png)

### Скриншот 8: Модальное окно дедлайна с конструктором любого количества напоминаний любого периода
![Скриншот 8: Модальное окно дедлайна с конструктором любого количества напоминаний любого периода](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-payment-modal-clean-unlimited-reminders.png)

### Скриншот 9: Вкладка счетов студентов с финансовой панелью
![Скриншот 9: Вкладка счетов студентов с финансовой панелью](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-payment-modal-tab-invoices.png)

### Скриншот 10: Вкладка банковских реквизитов с авторасширением поля
![Скриншот 10: Вкладка банковских реквизитов с авторасширением поля](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-payment-modal-tab-requisites.png)

### Скриншот 11: Персональное напоминание ученику в чате Study alerts с кнопкой подтверждения
![Скриншот 11: Персональное напоминание ученику в чате Study alerts с кнопкой подтверждения](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-student-reminder-alert.png)
