# План устранения дефектов выставления счетов и интеграции с чатом ([TASK-21](https://lumiscia.atlassian.net/browse/TASK-21))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-21](https://lumiscia.atlassian.net/browse/TASK-21). Запрещено задевать структуру базы данных, логику авторизации пользователей, расчет посещаемости `calculateStudentTuition`, не относящиеся к задаче диалоги и экранные формы. Все правки строго и изолированно ограничены:
> 1. Модальным окном инвойса `showPaymentDeadlineModal` и функцией отправки счета `postPaymentInvoiceToChat` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
> 2. Монтированием и слоем всплывающего календаря `examRenderCalendar` в [`client/54-exams.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js) и стилями `.exam-cal` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
> 3. Рендерингом Markdown-гиперссылок/кнопок и фильтрацией системных API-путей от превью в [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js) и стилями кнопок в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

---

## 1. Точная формулировка проблем (Problem Statement)

1. **Блокировка виджета календаря поверх модального окна инвойса**:
   - Код: [`client/54-exams.js:1135-1143`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L1135-L1143), [`site/preview.css:3048-3052`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3048-L3052), [`client/53a-group-calendar.js:1134-1146`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1134-L1146).
   - Причина: контейнер `#examCal` монтируется в `document.body` с `z-index: 40`. Поскольку диалоговое окно `gcwPaymentModal` открывается через `dialog.showModal()`, браузер помещает его в `top-layer`. Все элементы `document.body` вне `top-layer` оказываются визуально позади модального окна и перекрываются им.
   - Ожидание: календарь выбора даты должен монтироваться поверх модального окна (внутри текущего `<dialog>` или в `top-layer`) с наивысшим приоритетом отображения, позволяя пользователю кликать по дням календаря.

2. **Неочевидная логика и назначение поля «Manual Amount» (UX & Documentation)**:
   - Код: [`client/53a-group-calendar.js:1061-1063`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1061-L1063), [`client/53a-group-calendar.js:1102-1112`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1102-L1112).
   - Причина: в таблице расчета оплат отсутствует подсказка (tooltip) и текстовое пояснение механики поля. Преподавателю неясно, заменяет ли ручной ввод всю сумму счета или служит полем для ввода скидки.
   - Ожидание: добавить понятное текстовое пояснение над таблицей и подсказку (tooltip) на заголовок колонки и поля ввода: значение переопределяет итоговую сумму счета для ученика (индивидуальная скидка или фиксированная договоренность); если поле оставить пустым — применяется сумма по расчету посещаемости.

3. **Сырые ссылки и сломанные превью в интеграции с чатом (Messaging UX)**:
   - Код: [`client/53a-group-calendar.js:1006-1008`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1006-L1008), [`production/chat/40-messages.js:215-251`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L215-L251).
   - Причина: сообщение инвойса генерирует сырые URL-адреса Google Calendar и `/api/groups/payment-deadline.ics` длиной более 200 символов в виде сплошного текста. Чат не парсит Markdown-ссылки `[label](url)`, а функция `decorateLinks` формирует пустые карточки `chat-preview` даже для системных API-маршрутов `/api/`, у которых нет превью и графики.
   - Ожидание: ссылки должны быть аккуратно оформлены в виде кликабельных кнопок/гиперссылок (`[📅 Add to Google Calendar](...)`, `[📥 Download .ics Reminder](...)`), а системные API-пути и технические ссылки скачивания файлов не должны порождать пустые серые превью-карточки.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js): добавление поясняющего блока и подсказок для `Manual Amount`, форматирование ссылок на календари в виде Markdown-кнопок/гиперссылок в `postPaymentInvoiceToChat`.
  - [`client/54-exams.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js): монтирование `#examCal` в `anchor.closest('dialog[open]') || document.body` и использование top-layer / высокого z-index для корректного отображения поверх любого открытого модального окна.
  - [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js): поддержка Markdown-ссылок `[label](url)` в `decorateLinks` с оформлением в кнопки/ссылки и фильтрация API-путей (`/api/`, `.ics`) от генерации сломанных превью-карточек.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стили `.exam-cal` (`z-index: 100000;`), стили кнопок-ссылок в сообщениях чата (`.chat-action-link` / `.chat-link-btn`).
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js): производные файлы сборки (`npm run build:preview`).
  - [`test/test-task-21-tuition-and-chat-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-21-tuition-and-chat-ui.mjs): модульные и визуальные тесты для проверки исправлений.

- **Инварианты**:
  - Сохранение публичных API функций `openUniversalDatePicker`, `postPaymentInvoiceToChat`, `sendGroupChatMessage`.
  - Полная обратная совместимость вызова Datepicker для форм вне `<dialog>`.
  - Полная сохранность логики авторизации, прав доступа, начисления оплат и работы WebSocket чата.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Отображение календаря поверх модальных окон в `client/54-exams.js` и `site/preview.css` (`anchor.closest('dialog[open]') || document.body`, `z-index: 100000`).
- 🟩 **Этап 2**: Добавление подсказок и поясняющего блока для поля «Manual Amount» в `client/53a-group-calendar.js`.
- 🟩 **Этап 3**: Оформление ссылок календаря в виде аккуратных кликабельных кнопок/гиперссылок в `postPaymentInvoiceToChat` (`client/53a-group-calendar.js`).
- 🟩 **Этап 4**: Поддержка Markdown-ссылок в сообщениях чата и исключение системных API-путей из генерации превью-карточек в `production/chat/40-messages.js`.
- 🟩 **Этап 5**: Сборка ассетов проекта (`npm run build:preview`), написание и прогон целевых тестов `test/test-task-21-tuition-and-chat-ui.mjs` и существующих тестов чата и календаря.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-task-21-tuition-and-chat-ui.mjs test/test-learning-attendance.mjs test/test-calendar-chat.mjs test/test-chat-presentation.mjs`.
3. Визуальная проверка верстки через Chromium Playwright.
