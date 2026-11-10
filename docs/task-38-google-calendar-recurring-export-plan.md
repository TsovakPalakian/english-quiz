# План исправления бага экспорта расписания в Google Calendar (TASK-38: [bug] Экспорт расписания в Google Calendar)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к экспорту расписания группы в Google Calendar. Запрещено затрагивать финансовую ведомость, структуру базы данных, логику авторизации, систему экзаменов или движок чата. Изменения строго изолированы формированием параметров ссылки Google Calendar (`dates` и `recur`) в отчете расписания `data-gcw-action="report-chat"` и модальном окне назначения расписания в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), пересборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и модульными/визуальными тестами в [`test/test-task-38-google-calendar-export.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-38-google-calendar-export.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Ключ задачи**: `TASK-38`
- **Заголовок**: `[bug] Экспорт расписания в Google Calendar`
- **Проблема**:
  При нажатии на кнопку `[📅 Add to Google Calendar]` в отчете бота по расписанию группы (`📅 Schedule Report: <Group Title>`) система переносит пользователя в веб-интерфейс Google Календаря и пытается создать ровно **одно** единичное событие на одну дату (по умолчанию на текущий день, например 9 ноября, 17:00–18:00). На сетке недели все остальные дни остаются абсолютно пустыми, несмотря на то, что в расписании группы запланировано 9 уроков и 3 экзамена на разные дни недели (понедельник, среда, пятница).
- **Локализация в кодовой базе**:
  1. В [`client/53a-group-calendar.js#L3303-L3308`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3303-L3308) при генерации сообщения отчета расписания (`data-gcw-action="report-chat"`) URL формируется следующим образом:
     ```javascript
     const gCalUrl = new URL('https://calendar.google.com/calendar/render');
     gCalUrl.searchParams.set('action', 'TEMPLATE');
     gCalUrl.searchParams.set('text', `Group Schedule · ${state.groupTitle}`);
     gCalUrl.searchParams.set('details', `Lessons for ${monthName} ${state.year}`);
     gCalUrl.searchParams.set('ctz', 'Europe/Minsk');
     ```
     Здесь полностью отсутствуют параметры `dates` и `recur` (`RRULE`)! Google Календарь при отсутствии диапазона дат подставляет текущую дату и время без повторений.
  2. В функции `postLessonAlertToChat` в [`client/53a-group-calendar.js#L2004-L2012`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2004-L2012):
     ```javascript
     const dayCode = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][dObj.getDay()];
     let gRecur = '';
     if (period === 'month') {
       const lastDay = new Date(y, m, 0).getDate();
       gRecur = `RRULE:FREQ=WEEKLY;BYDAY=${dayCode};UNTIL=${y}${String(m).padStart(2, '0')}${String(lastDay).padStart(2, '0')}T235959Z`;
     }
     ```
     Здесь передавался только один день недели первого урока (`${dayCode}`), а остальные выбранные дни недели (например, среда и пятница) терялись. При этом для периода `custom` правило повторения вообще отсутствовало.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - В `client/53a-group-calendar.js` (блок `report-chat` на вкладке календаря):
     - Анализировать массив дат `sortedDates` за текущий месяц;
     - Определять дату первого занятия, время начала и длительность из `scheduleData` (сохраняя дефолт `18:30` / 60 мин);
     - Формировать параметр `dates` вида `YYYYMMDDTHHmmSS/YYYYMMDDTHHmmSS` для первой даты;
     - Извлекать все уникальные дни недели из запланированных дат месяца (`BYDAY=MO,WE,FR`);
     - Задавать дату окончания месяца `UNTIL=YYYYMMDDТ235959Z`;
     - Формировать `recur=RRULE:FREQ=WEEKLY;BYDAY=${byDays};UNTIL=${until}`;
     - Передавать в `details` структурированное краткое расписание занятий.
   - В `client/53a-group-calendar.js` (модальное окно `Set Group Schedule` и функция `postLessonAlertToChat`):
     - Передавать все выбранные дни недели `selectedDays` в `postLessonAlertToChat` для генерации мультидневного правила `BYDAY`;
     - Для периода `custom` формировать `UNTIL` на основе конечной даты диапазона.
   - Сборка клиентского скрипта `preview.js` через `npm run build:preview`.
   - Создание изолированного файла тестов [`test/test-task-38-google-calendar-export.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-38-google-calendar-export.mjs).
2. **Инварианты**:
   - Сохранение формата ссылок Markdown `• [📅 Add to Google Calendar](url)` и `• [📥 Download .ics Calendar File](url)`;
   - Сохранение часового пояса `ctz=Europe/Minsk`;
   - Полная обратная совместимость с существующими тестами `test/test-task-35-calendar-management.mjs` и `test/test-learning-attendance.mjs`.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Формирование параметров `dates` и `recur` (`RRULE:FREQ=WEEKLY;BYDAY=...;UNTIL=...`) в `data-gcw-action="report-chat"` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js) для полного охвата всех дней недели месяца.
- 🟩 **Этап 2**: Передача всех выбранных дней недели (`selectedDays`) в функцию `postLessonAlertToChat` и поддержка `UNTIL` для `custom period`.
- 🟩 **Этап 3**: Сборка клиентских ассетов командой `npm run build:preview`.
- 🟩 **Этап 4**: Написание модульных и визуальных Playwright-тестов в [`test/test-task-38-google-calendar-export.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-38-google-calendar-export.mjs).
- 🟩 **Этап 5**: Прогон тестов, верификация отсутствия регрессий в существующих тестах календаря и фиксация результатов (все 4 новых теста и 24 регрессионных теста успешно пройдены).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 1: Ошибка единичного события в Google Calendar при переходе из отчета расписания
![Скриншот 1: Ошибка единичного события в Google Calendar при переходе из отчета расписания](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-38-screenshot-1.png)

### Скриншот 2: Пустая недельная сетка в Google Calendar из-за отсутствия параметров серии
![Скриншот 2: Пустая недельная сетка в Google Calendar из-за отсутствия параметров серии](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-38-screenshot-2.png)

### Скриншот 3: Целевое решение: передача параметров серии повторений (RRULE) для всех дней недели и заполнение всей сетки Google Calendar
![Скриншот 3: Целевое решение: передача параметров серии повторений (RRULE) для всех дней недели и заполнение всей сетки Google Calendar](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-38-screenshot-3.png)

### Скриншот 4: Результат выполнения визуального теста отправки отчета расписания
![Скриншот 4: Результат выполнения визуального теста отправки отчета расписания](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-38-screenshot-verification.png)
