# План оптимизации интерфейса и исправления дефектов расписания ([TASK-35](https://lumiscia.atlassian.net/browse/TASK-35))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к управлению расписанием, журналу и сообщениям Study alerts в задаче [TASK-35](https://lumiscia.atlassian.net/browse/TASK-35). Запрещено изменять серверные маршруты, систему экзаменов, словарь и сторонние экраны. Все изменения строго и изолированно ограничены шапкой, футером, журналом календаря в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), стилями календаря в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и оформлением карточек Study alerts в [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css).

---

## 1. Точная формулировка задач и анализ первопричин

### Задача 1: Трехколоночная компоновка шапки календаря
- **Требование пользователя**: Переключение даты (`← Month Year →`) вынести строго по центру вверху (без кнопки `Today` в блоке переключения месяца), а кнопку `Today` вернуть обратно на правую сторону.
- **Решение**: Реорганизовать сетку `.gcw-header`:
  - Левая колонка: переключатели вкладок `[ Calendar | Attendance | Statistics ]`;
  - Центральная колонка: навигация месяца `← November 2026 →` строго по центру;
  - Правая колонка: кнопки действий, где `Today` возвращена направо (`[ 📅 Set group schedule ]` и `[ Today ]`, либо `[ Today ]` и `[ 📅 Set group schedule ]`) (Скриншот 23, Скриншот 24, Скриншот 26);
  - Альтернативный двухуровневый вариант: навигация месяца в верхнем ряду по центру, вкладки и действия в нижнем ряду (Скриншот 25);
  - На вкладках `Attendance` и `Statistics` кнопки `Today` и `Set group schedule` скрываются (Скриншот 15, Скриншот 16).

### Задача 2: Сообщения Study alerts на всю ширину чата
- **Требование**: В Study alerts сообщения должны занимать все выделенное в чате пространство в длину/ширину.
- **Первопричина**: В [`production/chat.css#L93-L94`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L93-L94) сообщения ограничены правилом `max-width: 44%` (и `max-width: 55%` в группах).
- **Решение**: Для карточек Study alerts (`#messages .msg-message.is-learning`) установить правила `width: 100%; max-width: 100%; align-self: stretch; box-sizing: border-box;` (Скриншот 17).

### Задача 3: Автофокус на целевой дате урока на вкладке `Attendance`
- **Требование**: При переключении на `Attendance` автоматически фокусироваться на дате урока:
  1. Если на сегодняшнюю дату (`todayStr`) есть урок — фокус на сегодняшней дате;
  2. Если сегодняшняя дата не совпадает с уроком — фокус на ближайшей предшествующей дате урока;
  3. Если в месяце нет уроков до сегодняшней даты — фокус на первом уроке месяца.
- **Решение**: Вычислять целевую дату, подсвечивать заголовок `.is-focused-date` и столбец `.td-focused-col`, вызывать `focus()` на кнопке заголовка и центрировать скролл через `scrollIntoView({ inline: 'center', block: 'nearest' })` (Скриншот 15).

### Задача 4: Устранение падений при сохранении расписания и удалении слотов
- **Локализация в коде**:
  - [`client/53a-group-calendar.js#L2256`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2256): вызов `!mData.lessonDates.includes(d)` на объекте `Set` приводил к `TypeError: mData.lessonDates.includes is not a function` (Bug ID `bc203715d25c00a4a4cba8b79c49bd64`).
  - [`client/53a-group-calendar.js#L2549`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2549): вызов `await saveGroupAttendanceData(groupId, state.monthIndex, curData)` с передачей числа приводил к `TypeError: Cannot read properties of undefined (reading 'has')` в `getMonthData` (Bug ID `eaf912694cd8b55e8e4aa13c2790063f`).
- **Решение**: Использовать `mData.lessonDates.add(d)` для `Set`, скорректировать аргументы `await saveGroupAttendanceData(groupId, state, container)` на строках 2275, 2549 и 2820.

### Задача 5: Предупреждение при деструктивном удалении и live-обновление
- **Локализация в коде**: [`client/53a-group-calendar.js#L2518-L2554`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2518-L2554).
- **Решение**: Внедрить диалог подтверждения **Confirm Removal from Schedule** с перечнем дат и предупреждением об удалении посещаемости (Скриншот 12), после чего вызывать немедленную перерисовку сетки со статусным уведомлением (Скриншот 13).

### Задача 6: Конфиденциальность счетов студентов и персональные сообщения
- **Требование**: Студент не должен видеть финансовые данные других студентов в общем чате группы. Каждый студент должен получать персональное сообщение в личный чат Study alerts со своим расчетом.
- **Первопричина**: Отсутствовал метод `window.sendDirectChatMessage`, в результате чего приватная отправка пропускалась и расчет всей группы публиковался в общий чат.
- **Решение**: 
  1. Реализовать `window.sendDirectChatMessage(accountId, text, options)` в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js) через вызов `request('open', { kind: 'direct', accountId })`.
  2. Удалить детальный список студентов со суммами из общего группового чата, оставив общее уведомление.
  3. В персональное сообщение студента встроить интерактивную кнопку-ссылку подтверждения оплаты `[ ✅ I have paid (<amount> <currency>) ]` (Скриншот 21).

### Задача 7: Автоматическое растягивание поля банковских реквизитов
- **Требование**: Текст в поле реквизитов не должен обрезаться до 1.5 строк, поле должно занимать все необходимое пространство по высоте без скроллбара.
- **Первопричина**: Пересчет высоты `adjustHeight` производился при открытии модального окна, когда вкладка `Payment Requisites` была скрыта (`display: none`), из-за чего `scrollHeight` вычислялся некорректно.
- **Решение**: Вызывать `adjustHeight()` в обработчике переключения на вкладку `requisites` и установить `Math.max(140, reqTextarea.scrollHeight + 8) + 'px'` (Скриншот 22).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. Изменения затрагивают:
   - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
   - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
   - [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css);
   - сборку [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js);
   - тесты в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
2. Запрещено модифицировать серверные API и контракты публичных интерфейсов.
3. Сохранять работоспособность всех существующих тестов чата и календаря.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Реализация утвержденной двухуровневой шапки (Вариант C): дата и навигация месяца по центру на верхнем уровне, переключатели вкладок и кнопки действий строкой ниже (Скриншот 25, Скриншот 27).
- 🟩 **Этап 2**: Скрытие кнопок `📅 Set group schedule` и `Today` на вкладках `Attendance` и `Statistics` (Скриншот 15, Скриншот 16).
- 🟩 **Этап 3**: Растягивание сообщений Study alerts на всю ширину ленты в [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css) (Скриншот 17).
- 🟩 **Этап 4**: Автофокус, центрирование скролла и визуальная подсветка целевой даты урока на вкладке `Attendance` (Скриншот 15).
- 🟩 **Этап 5**: Исправление ошибки `mData.lessonDates.includes` на `mData.lessonDates.add` в `showSetGroupScheduleModal` и `showLessonSchedulerModal`.
- 🟩 **Этап 6**: Исправление аргументов `saveGroupAttendanceData(groupId, state, container)` на строках 2275, 2549 и 2820.
- 🟩 **Этап 7**: Диалог подтверждения удаления расписания (Скриншот 12) и мгновенная live-перерисовка календарной сетки с уведомлением (Скриншот 13).
- 🟩 **Этап 8**: Конфиденциальная доставка счетов: внедрение `window.sendDirectChatMessage(accountId, text, options)` в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js), исключение разбивки по студентам из общего чата группы и добавление кнопки `[ ✅ I have paid ]` (Скриншот 21).
- 🟩 **Этап 9**: Автоматическое растягивание поля банковских реквизитов на вкладке `Payment Requisites` без вертикального скроллбара и обрезки строк (Скриншот 22).
- 🟩 **Этап 10**: Сборка ассетов `npm run build:preview`, запуск целевых тестов и обновление документа верификации [`docs/guide-task-35-calendar-management.md`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/guide-task-35-calendar-management.md).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 23: Дата строго по центру вверху, Today возвращена направо рядом с Set group schedule (Вариант A)
![Скриншот 23: Дата строго по центру вверху, Today возвращена направо рядом с Set group schedule (Вариант A)](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-variant-a-date-center-today-right.png)

### Скриншот 24: Дата строго по центру вверху, Today первой в правой группе кнопок (Вариант B)
![Скриншот 24: Дата строго по центру вверху, Today первой в правой группе кнопок (Вариант B)](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-variant-b-today-first-right.png)

### Скриншот 25: Двухуровневая компоновка: дата по центру на верхнем уровне, кнопки и вкладки на нижнем (Вариант C)
![Скриншот 25: Двухуровневая компоновка: дата по центру на верхнем уровне, кнопки и вкладки на нижнем (Вариант C)](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-variant-c-2tier-top-date.png)

### Скриншот 26: Полный контекст календаря с Вариантом A шапки
![Скриншот 26: Полный контекст календаря с Вариантом A шапки](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-full-calendar-date-center-today-right.png)

### Скриншот 21: Персональный счет студента в Study alerts с кнопкой подтверждения оплаты
![Скриншот 21: Персональный счет студента в Study alerts с кнопкой подтверждения оплаты](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-student-private-invoice-with-button.png)

### Скриншот 22: Модальное окно реквизитов с полностью раскрытым полем ввода текста
![Скриншот 22: Модальное окно реквизитов с полностью раскрытым полем ввода текста](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-modal-requisites-fully-expanded.png)

### Скриншот 18: Переключение даты по центру вверху, шедулер справа (Вариант 1)
![Скриншот 18: Переключение даты по центру вверху, шедулер справа](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-option-1-center-nav-right-schedule.png)

### Скриншот 19: Кнопка Today слева от месяца в центре, шедулер справа (Вариант 2)
![Скриншот 19: Кнопка Today слева от месяца в центре, шедулер справа](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-option-2-today-left-center.png)

### Скриншот 20: Полный контекст календаря с трехколоночной сбалансированной шапкой
![Скриншот 20: Полный контекст календаря с трехколоночной сбалансированной шапкой](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-header-full-calendar-preview.png)

### Скриншот 17: Сообщения Study alerts на всю ширину выделенного пространства чата
![Скриншот 17: Сообщения Study alerts на всю ширину выделенного пространства чата](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-study-alerts-full-width.png)

### Скриншот 15: Вкладка Attendance с автофокусом на целевой дате урока и скрытыми кнопками
![Скриншот 15: Вкладка Attendance с автофокусом на целевой дате урока и скрытыми кнопками](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-attendance-tab-focused-date.png)

### Скриншот 16: Вкладка Statistics со скрытыми кнопками Today и Set group schedule
![Скриншот 16: Вкладка Statistics со скрытыми кнопками Today и Set group schedule](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-statistics-tab-clean.png)

### Скриншот 12: Модальное окно подтверждения удаления Confirm Removal from Schedule
![Скриншот 12: Модальное окно подтверждения удаления Confirm Removal from Schedule](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-confirm-removal-warning.png)

### Скриншот 13: Мгновенное обновление календарной сетки с уведомлением об удалении
![Скриншот 13: Мгновенное обновление календарной сетки с уведомлением об удалении](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-instant-removal-feedback.png)
