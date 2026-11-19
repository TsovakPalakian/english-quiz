# План стабилизации тестов test-chat-ui, test-provider-settings-ui и test-quota-limit-ui

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Данная задача устраняет регрессии и коллизии в 3 тестах:
> 1. `site/preview.html` ([#dayQuizHead](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1121-L1135)): разметка шапки квиза включает кнопки Home (`⌂`) и Back (`←`) в контейнере `.crumb` напрямую, без атрибута `data-nav-back` на `#dayQuizBack`, устраняя неоднозначность селектора `#daysetup [data-nav-back]` в `test-chat-ui.mjs`.
> 2. `client/demos/quiz-review-local.js` ([run](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/quiz-review-local.js#L56-L61), [render](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/quiz-review-local.js#L260-L267)): исключение некорректного глобального сброса `node.disabled = false` для всех кнопок в `#content`, восстанавливающее валидное состояние кнопок сохранения в `test-provider-settings-ui.mjs` и `test-quota-limit-ui.mjs`.
> Запрещено затрагивать, модифицировать или нарушать смежный функционал:
> - Логику расчетов очереди и режимов квиза в `client/03g-core.js`.
> - Поведение тестов генерации квизов в `test/test-quiz-generation-ui.mjs`.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Коллизия в `test/test-chat-ui.mjs` (шаг 15)**:
   - При добавлении `data-nav-back` к кнопке `#dayQuizBack` внутри секции `#daysetup` образовалось 2 элемента с атрибутом `data-nav-back`: `#dayQuizBack` (внутри `#dayQuizBoard`) и `#daySetupBack` (внутри `#dayStudyClassic`).
   - На шаге 15 тест вызывает `await page.locator('#daysetup [data-nav-back]').click()`. В строгом режиме Playwright возникает ошибка:
     `strict mode violation: locator('#daysetup [data-nav-back]') resolved to 2 elements: 1) #dayQuizBack, 2) #daySetupBack`.
   - Решение: разметка шапки `#dayQuizHead` оформляется контейнером `.crumb` с кнопками Home и Back в HTML напрямую без `data-nav-back` на `#dayQuizBack`. Нажатие на `#dayQuizBack` штатно обрабатывается слушателем клика в `client/03g-core.js:2215-2220`. Единственным элементом с `data-nav-back` внутри `#daysetup` остается `#daySetupBack`.

2. **Ложные разблокировки кнопок в `test/test-provider-settings-ui.mjs` и `test/test-quota-limit-ui.mjs`**:
   - В `client/demos/quiz-review-local.js` в блоке `finally` функции `run()` присутствовала строка:
     `document.querySelectorAll('#content button,#content select').forEach(node=>node.disabled=false);`
   - Эта строка принудительно снимала флаг `disabled` со всех элементов внутри `#content`, включая кнопку сохранения ненастроенной формы `#provider-settings-form [type="submit"]` и ненастроенной квоты `#quota-limit-form button`.
   - Тесты ожидают `isDisabled() === true`, пока пользователь не ввел данные, и падали с ошибкой `AssertionError: false !== true`.
   - Решение: удалить принудительную разблокировку всех дочерних элементов `#content` в `run()`, оставив корректное восстановление состояния элементов через исходный массив `buttons`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1121-L1135): инлайн-разметка `.crumb` в `#dayQuizHead` без `data-nav-back`.
  - [`client/demos/quiz-review-local.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/quiz-review-local.js#L56-L61): удаление ошибочного принудительного `disabled=false`.
  - [`test/test-day-quiz-board.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-day-quiz-board.mjs): проверка наличия `.crumb` и стрелок в `#dayQuizHead`.

- **Инварианты**:
  - Полное соответствие шапки квиза утвержденному кадру (кнопка Home, кнопка Back, заголовок в одну строку).
  - 100% прохождение тестов `test-chat-ui.mjs`, `test-provider-settings-ui.mjs`, `test-quota-limit-ui.mjs` и `test-day-quiz-board.mjs`.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Фиксация причин сбоев и плана устранения коллизий.
- 🟩 **Этап 2**: Корректировка разметки шапки `#dayQuizHead` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) с инлайн-блоком `.crumb` без `data-nav-back`.
- 🟩 **Этап 3**: Корректировка функции `run()` в [`client/demos/quiz-review-local.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/quiz-review-local.js).
- 🟩 **Этап 4**: Актуализация ассетов и тестов [`test/test-day-quiz-board.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-day-quiz-board.mjs).
- 🟩 **Этап 5**: Прогон 3 упавших тестов (`test-chat-ui.mjs`, `test-provider-settings-ui.mjs`, `test-quota-limit-ui.mjs`) и целевых тестов квиза.
- 🟩 **Этап 6**: Финальный отчет с обобщенным коммитом.
