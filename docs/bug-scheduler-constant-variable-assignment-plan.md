# План устранения ошибки `TypeError: Assignment to constant variable` в модальном окне `Schedule Single Lesson` (Bug ID: `55b33e0e394df3aaf5ea523286c7c9ea`)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к выбору даты в диалоге планирования разового урока `Schedule Single Lesson`. Запрещено изменять другие модальные окна, систему авторизации, расчет оплат и базу данных. Все изменения строго и изолированно ограничены исправлением декларации переменных `weekdayName` и `monthName` в функции `showLessonSchedulerModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), сборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и модульными/визуальными тестами в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Идентификатор ошибки**: Bug ID `55b33e0e394df3aaf5ea523286c7c9ea`
- **Тип ошибки**: `TypeError: Assignment to constant variable.`
- **Стек вызова**:
  ```text
  TypeError: Assignment to constant variable.
      at https://lumiscia.org/preview.js?v=7c88956e1e927cd7:29765:25
      at HTMLDivElement.<anonymous> (https://lumiscia.org/preview.js?v=7c88956e1e927cd7:31588:31)
  ```
- **Локализация в коде**:
  - В [`client/53a-group-calendar.js#L2691-L2692`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2691-L2692) переменные дня недели и месяца были объявлены через ключевое слово `const`:
    ```javascript
    const dObj = new Date(dateStr + 'T00:00:00');
    const weekdayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
    const monthName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    ```
  - При клике на кнопку `#gcwSchedDateBtn` (`Lesson Date - Click to change`) открывается календарный пикер `openUniversalDatePicker`.
  - При выборе пользователем новой даты срабатывает колбэк в строках 2821–2824:
    ```javascript
    dateStr = newDate;
    const newDObj = new Date(dateStr + 'T00:00:00');
    weekdayName = newDObj.toLocaleDateString('en-US', { weekday: 'long' });
    monthName = newDObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    ```
  - Попытка присвоения нового значения константам `weekdayName` и `monthName` приводит к критическому сбою `TypeError: Assignment to constant variable.`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - Замена `const` на `let` для переменных `dObj`, `weekdayName`, `monthName` в начале функции `showLessonSchedulerModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
   - Корректная очистка расписания с исходной даты `initialDateStr` при переносе урока на новую дату `dateStr`;
   - Пересборка клиентского бандла `npm run build:preview`;
   - Добавление автоматического визуального и логического теста в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
2. **Инварианты**:
   - Сохранение валидации выбранного учебного материала перед сохранением урока;
   - Корректное отображение выбранной даты и дня недели в элементе `#gcwSchedDateText`;
   - Сохранение неизменности API других диалоговых окон календаря группы.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Замена `const` на `let` для `dObj`, `weekdayName`, `monthName` в `showLessonSchedulerModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- 🟩 **Этап 2**: Проверка логики переноса урока на другую дату без дублирования на исходной дате.
- 🟩 **Этап 3**: Сборка обновленного клиентского скрипта `npm run build:preview`.
- 🟩 **Этап 4**: Написание автоматического теста в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs) с эмуляцией выбора новой даты в пикере.
- 🟩 **Этап 5**: Прогон тестов и фиксация результатов верификации (22 из 22 тестов пройдены успешно).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 29: Устранение ошибки TypeError при смене даты урока в модальном окне Schedule Single Lesson
![Скриншот 29: Устранение ошибки TypeError при смене даты урока в модальном окне Schedule Single Lesson](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-schedule-single-lesson-date-picker-fix.png)
