# План перехода на живой поиск контактов и удаления кнопки поиска

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей изолированной задаче. Запрещено затрагивать логику отправки сообщений в чате, структуру Durable Objects, синхронизацию сессий, фильтрацию комнат в режиме `chats`, структуру папок, архив и диалоги создания групп. Все изменения строго и изолированно ограничены удалением кнопки `#msgLookup` из разметки и скриптов боковой панели диалогов/контактов, а также добавлением дебаунс-механизма живого серверного поиска `lookup` при вводе в `#msgRoomSearch` в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js), [`production/chat/30-rooms.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js) и [`production/chat.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.html).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Кнопка ручного запуска поиска и зависимость от нажатия Enter**:
   - В текущей реализации в разметке [`production/chat.html:15`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.html#L15) размещена отдельная кнопка:
     ```html
     <button id="msgLookup" type="button" class="chat-link saas-btn" hidden>Find by email or login</button>
     ```
   - В [`production/chat/30-rooms.js:265`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L265) видимость этой кнопки управляется вручную: `el('msgLookup').hidden = listMode !== 'contacts' || !!contactGroupView;`, а текст обновляется в строке 303: `el('msgLookup').textContent = 'Find by email, login or @username';`.
   - В [`production/chat/90-settings.js:44-67`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L44-L67) поиск на сервере (`request('lookup', { query: ... })`) инициируется только по явному клику на `#msgLookup` либо по нажатию клавиши `Enter` в поле `#msgRoomSearch`.
   - При обычном вводе текста в `#msgRoomSearch` срабатывает только локальная фильтрация уже загруженных контактов (`paintRooms`), но внешний поиск по глобальной базе пользователей (email, логин, `@username`) без нажатия кнопки или клавиши Enter не происходит.

2. **Требование пользователя**:
   - Убрать кнопку «Find by email, login or @username» (`#msgLookup`) из интерфейса.
   - Сделать поиск живым (live search): при вводе текста в поле поиска контактов запрос к поиску должен происходить автоматически без необходимости нажимать Enter или кликать по кнопке.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`production/chat.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.html): удаление кнопки `<button id="msgLookup">`.
  - [`production/chat/30-rooms.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js): удаление ссылок на `el('msgLookup')`.
  - [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js): удаление обработчика `el('msgLookup').onclick` и `Enter`, добавление дебаунсированного (300–400 мс) вызова `request('lookup')` при вводе в `#msgRoomSearch` в режиме `listMode === 'contacts'`, если введенный запрос содержит не менее 3 символов.
  - [`test/test-chat-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-ui.mjs): актуализация тестов UI чата, проверяющих вызов `lookup` при живом вводе вместо клика по удаленной кнопке `#msgLookup`.
  - [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js): пересборка через `npm run build:preview`.

- **Инварианты**:
  - Поиск в режиме `chats` (список недавних диалогов) продолжает работать мгновенно локально по названию комнат и тексту сообщений.
  - Локальная мгновенная фильтрация имеющихся контактов при каждом нажатии клавиши сохраняется.
  - Защита от спама и соблюдение лимита сетевых запросов (в `chat-durable.mjs` лимит составляет 10 запросов в минуту) обеспечивается дебаунсом (350 мс) и проверкой минимальной длины поисковой строки (не менее 3 символов).
  - В случае отсутствия совпадений на сервере интерфейс не блокируется и не показывает навязчивых alert-ошибок при промежуточном наборе.
  - Модальное окно создания чата (`openNewChat`) с кнопкой `[data-find-person]` не затрагивается без отдельного указания пользователя.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Удаление кнопки `#msgLookup` из [`production/chat.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.html) и ссылок на неё в [`production/chat/30-rooms.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js).
- 🟩 **Этап 2**: Реализация дебаунсированного живого поиска в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js) при событии `input` на поле `#msgRoomSearch` в режиме `contacts`.
- 🟩 **Этап 3**: Пересборка ассетов превью (`npm run build:preview`).
- 🟩 **Этап 4**: Актуализация и запуск целевых тестов [`test/test-chat-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-ui.mjs) и добавление специализированного теста [`test/test-chat-live-contacts-search.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-live-contacts-search.mjs).

---

## 4. Детерминированный метод верификации (Verification Method)

1. Выполнение команды сборки: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-chat-ui.mjs`.
3. Визуальное подтверждение отсутствия кнопки и корректности отображения списка контактов в точности по Скриншоту 2.
