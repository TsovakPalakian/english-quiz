# План унификации ссылок на календарь в сообщениях чата: замена длинных URL на компактные кнопки-действия

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к форматированию ссылок в оповещениях расписания в чате. Запрещено менять движок сообщений чата, логику создания комнат или структуру базы данных. Изменения строго изолированы обновлением синтаксиса ссылок в функции `postLessonAlertToChat` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), пересборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и модульными тестами в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Проблема**: В оповещении об уроке в чате (верхний фрагмент на пользовательском скриншоте) выводятся длинные сырые URL:
  ```text
  • Add to Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&text=...
  • Download .ics (Apple / Outlook / Mobile Calendar): https://lumiscia.org/api/groups/calendar.ics?...
  ```
  В отчете расписания (нижний фрагмент) те же ссылки отображаются аккуратными кнопками-плашками:
  ```text
  • [📅 Add to Google Calendar]
  • [📥 Download .ics Calendar File]
  ```
- **Первопричина**:
  - В обработчике рендеринга сообщений [`production/chat/40-messages.js#L182-L232`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L182-L232) синтаксис Markdown `[Текст кнопки](URL)` преобразуется в интерактивный элемент с классом `.chat-action-btn`.
  - При отсутствии скобок Markdown сырые URL подхватываются стандартным автолинкером обычного текста и отображаются в виде длинной гиперссылки.
  - В функции `postLessonAlertToChat` ([`client/53a-group-calendar.js#L2018-L2019`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2018-L2019)) строки формировались без Markdown-разметки:
    ```javascript
    '• Add to Google Calendar: ' + gCalUrl.toString(),
    '• Download .ics (Apple / Outlook / Mobile Calendar): ' + icsUrl,
    ```
    тогда как в отчете расписания ([`client/53a-group-calendar.js#L3296-L3297`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3296-L3297)) и счетах на оплату ([`client/53a-group-calendar.js#L1077-L1078`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1077-L1078)) используется Markdown:
    ```javascript
    `• [📅 Add to Google Calendar](${gCalUrl.toString()})`,
    `• [📥 Download .ics Reminder](${icsUrl})`,
    ```

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - Перевод строк добавления в календарь и скачивания .ics в `postLessonAlertToChat` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js) на синтаксис `[Текст](URL)`;
   - Совмещение с исправлением `let weekdayName` и `let monthName` в `showLessonSchedulerModal`;
   - Сборка клиентского кода командой `npm run build:preview`;
   - Проверка тестами в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
2. **Инварианты**:
   - Сохранение полного набора параметров генерации URL (заголовок, таймзона `Europe/Minsk`, время начала и длительность, напоминания);
   - Сохранение совместимости с рендерером чата `.chat-action-btn`.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Замена обычных текстовых ссылок на Markdown `[📅 Add to Google Calendar](${gCalUrl.toString()})` и `[📥 Download .ics Reminder](${icsUrl})` в `postLessonAlertToChat` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- 🟩 **Этап 2**: Исправление ошибки присваивания константам `weekdayName` и `monthName` в `showLessonSchedulerModal`.
- 🟩 **Этап 3**: Сборка обновленного клиентского скрипта `npm run build:preview`.
- 🟩 **Этап 4**: Написание тестов контракта форматирования Markdown-ссылок в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
- 🟩 **Этап 5**: Прогон тестов и фиксация результатов верификации (22 из 22 тестов пройдены успешно).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 30: Унификация ссылок календаря в сообщениях чата (Замена длинных URL на компактные кнопки)
![Скриншот 30: Унификация ссылок календаря в сообщениях чата (Замена длинных URL на компактные кнопки)](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-chat-action-buttons-unification.png)
