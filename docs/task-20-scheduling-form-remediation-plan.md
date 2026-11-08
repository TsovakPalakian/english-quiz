# План устранения дефектов формы планирования урока ([TASK-20](https://lumiscia.atlassian.net/browse/TASK-20))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-20](https://lumiscia.atlassian.net/browse/TASK-20). Запрещено задевать структуру базы данных, логику авторизации, платежный учет `calculateStudentTuition`, систему чата `postLessonAlertToChat`, несвязанные диалоги и экранные формы. Все правки строго и изолированно ограничены модальным окном планирования урока `showLessonSchedulerModal` и обработчиком клика по дате `handleDateItemClick` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), позиционированием и z-index всплывающего календаря `examRenderCalendar` в [`client/54-exams.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js), а также стилями элементов `.gcw-time-preview`, `.gcw-tz-preview-box` и `.exam-cal` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Блокировка изменения даты в `Lesson Date`**:
   - Код: [`client/53a-group-calendar.js:1738-1741`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1738-L1741).
   - Поле отображается статическим текстом без возможности изменения даты прямо в окне планирования.
2. **Слом логики "Черновиков" (отсутствие валидации при сохранении)**:
   - Код: [`client/53a-group-calendar.js:296-297`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L296-L297), [`client/53a-group-calendar.js:1918-1927`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1918-L1927).
   - Форма позволяет сохранить слот с материалом `(None / Draft material)`, создавая запись в `lessonDates` без урока. Последующий клик по ячейке выдает ошибку `No lesson available for this date`.
3. **Глобальная выгрузка материалов (отсутствие скоупинга уроков по группе)**:
   - Код: [`client/53a-group-calendar.js:1718-1724`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1718-L1724).
   - Условие `!mat.groupId` выгружает в выпадающий список все не привязанные материалы платформы, включая тестовый мусор и неподходящие уровни.
4. **Блокировка интерфейса (Z-index календаря в Custom Period)**:
   - Код: [`client/54-exams.js:1134-1143`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L1134-L1143), [`site/preview.css:3048-3052`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3048-L3052).
   - Контейнер `#examCal` монтируется в `document.body` с `z-index: 40`. Так как модальное окно планирования открывается через `dialog.showModal()`, браузер помещает его в `top-layer`, из-за чего виджет календаря открывается позади формы.
5. **UI поля Class window (ввод в заблуждение оформлением input)**:
   - Код: [`client/53a-group-calendar.js:1764-1767`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1764-L1767), [`site/preview.css:7022-7029`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L7022-L7029).
   - Элемент `.gcw-time-preview` стилизован как поле ввода с рамкой, хотя заблокирован для ручного ввода.
6. **Логика блока Student Timezone (copy-paste баг и верстка)**:
   - Код: [`client/53a-group-calendar.js:1726-1730`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1726-L1730), [`client/53a-group-calendar.js:1769-1773`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1769-L1773), [`site/preview.css:7060-7066`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L7060-L7066).
   - В групповых занятиях выводится синхронизация с отдельным учеником (`Synchronized with: Mensa1345`), а внутренний отступ `padding` прижимает текст к левому краю.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js): интерактивное поле даты, блокировка сохранения при отсутствии материала, фильтрация уроков по `group.lessonIds` / `groupId`, редизайн строки Class window, корректный блок Group Timezone.
  - [`client/54-exams.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js): монтирование `#examCal` в `anchor.closest('dialog[open]') || document.body` для гарантированного отображения поверх `top-layer`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация `.gcw-time-preview`, `.gcw-tz-preview-box` (`padding: 12px 16px;`), `.exam-cal` (`z-index: 100000;`).
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): производный файл сборки (`npm run build:preview`).
  - [`test/test-group-calendar-scheduler-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-group-calendar-scheduler-ui.mjs): модульные и визуальные тесты модального окна.

- **Инварианты**:
  - Сохранение публичного API функций `showLessonSchedulerModal`, `handleDateItemClick`, `openUniversalDatePicker`.
  - Полная обратная совместимость вызова Datepicker для элементов вне модальных окон.
  - Неизменность структуры сохранения расписания и рассылки уведомлений в чат.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Интерактивное поле даты `Lesson Date` и синхронизация дня недели / подписей периодов.
- 🟩 **Этап 2**: Валидация выбора материала (блокировка кнопки `Save Schedule` при пустом материале) и безопасное открытие планировщика при клике по пустому слоту.
- 🟩 **Этап 3**: Фильтрация списка `Learning Material` строго по назначенным материалам группы (`group.lessonIds` и `mat.groupId`).
- 🟩 **Этап 4**: Исправление позиционирования и z-index для `#examCal` в `client/54-exams.js` и `site/preview.css` при открытии поверх `<dialog>`.
- 🟩 **Этап 5**: Редизайн поля `Class window` в текстовую информационную строку `.gcw-time-preview` без рамки инпута.
- 🟩 **Этап 6**: Обновление блока синхронизации времени группы: заголовок `Group Timezone & Sync Preview`, часовой пояс без перечисления имен, исправление отступов (`padding: 12px 16px;`).
- 🟩 **Этап 7**: Сборка ассетов (`npm run build:preview`), написание и запуск тестов `test/test-group-calendar-scheduler-ui.mjs`.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-group-calendar-scheduler-ui.mjs test/test-calendar-chat.mjs`.
3. Визуальная проверка верстки через Chromium Playwright.
