# План исправления отображения сообщений, медиафайлов и статусов чата

## 1. Постановка задачи и ссылки на код

1. Пропорциональное вписывание вертикальных фотографий без обрезки деталей кадра в ленте сообщений:
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L107-L108).
   - Дефект: селектор `#messages .chat-file[data-photo-preview] img` содержит только `max-width: 100%`. Ограничение `max-height` отсутствует. Вертикальные снимки (соотношение 743×1024) растягиваются по высоте и выходят за видимые пределы контейнера сообщений.
   - Решение: задать контейнеру `max-width: min(320px, 100%)`, изображению `max-width: 100%`, `max-height: min(320px, 45vh)`, `width: auto`, `height: auto`, `object-fit: contain`, `border-radius: 8px`.

2. Скрытие имени отправителя в личных диалогах:
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L94-L96).
   - Дефект: имена авторов скрывались только при наличии класса `.is-series-continuation`. В приватных чатах имена собеседников избыточны.
   - Решение: добавить правило `#messages .msg-message:not(.is-group-message) > header { display: none !important; }`. В групповых чатах имена авторов сохраняются.

3. Расположение сообщений по сторонам (свои справа, чужие слева) и сохранение класса `.is-own`:
   - Файл: [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L172-L175).
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L771-L786).
   - Дефект: функция `isOwnMessage` выполняла проверку только по `senderId === myAccountId()`. В личных чатах отправленные сообщения после подтверждения сервером могли терять класс `.is-own`. В методе `mergeNode` условие `if (node.innerHTML === html) return;` блокировало обновление классов узла `article`.
   - Решение: дополнить `isOwnMessage` проверкой участника приватного чата (отправитель не равен `peerId`), в `mergeNode` актуализировать список классов независимо от содержимого `innerHTML`.

4. Гарантированный сброс счетчика прочитанных сообщений при выходе из чата:
   - Файл: [src/chat-durable.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L324).
   - Дефект: при `cursor === member[column] && unread === member['unread_' + kind]` метод `read` возвращал `{read: true, unchanged: true}` без поля `room`. Объект `ChatInbox` не обновлял сводку комнаты в таблице `rooms` базы SQLite, из-за чего при последующем чтении возвращался старый счетчик.
   - Решение: метод `read` возвращает актуальный объект `{read: true, room: this.summary(actor.id)}`.

## 2. Границы области изменений и инварианты

- Изменения затрагивают исключительно файлы [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css), [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js), [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js) и [src/chat-durable.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs).
- Запрещено модифицировать протокол шифрования `chatenc:`, клиентские модули за пределами `production/chat/`, структуру таблиц базы данных и логику распределения ролей.
- Не изменять незакоммиченные файлы `site/preview.css` и `test/test-bugs-ui.mjs`.

## 3. Методика детерминированной верификации

1. Сборка клиентских скриптов командой `npm run build:preview`.
2. Запуск набора тестов: `node --test test/test-chat-durable.mjs`.
3. Запуск тестов интерфейса сообщений: `node --test test/test-chat-actions-ui.mjs test/test-chat-message-series-ui.mjs`.
4. Визуальная верификация размеров фотографии в Playwright: подтверждение габаритов 232×320px и полного сохранения пропорций.

## 4. Чек-лист реализации

- 🟩 Согласование плана и мокапов с пользователем
- 🟩 Добавление стилей вписывания изображений, скрытия заголовков в личных чатах и контрастных рамок в production/chat.css
- 🟩 Корректировка вычисления принадлежности сообщений в production/chat/00-core.js
- 🟩 Снятие блокировки обновления классов в mergeNode в production/chat/40-messages.js
- 🟩 Возврат объекта room в методе read в src/chat-durable.mjs
- 🟩 Сборка ассетов npm run build:preview и запуск целевых тестов
- 🟩 Анализ причины таймаута в test/test-chat-ui.mjs (шаг 93) и согласование решения
- 🟩 Добавление фильтрации правого клика в pointerdown-обработчике production/chat/20-connection.js
- 🟩 Добавление поиска сообщений при клике в отступ в timeline.oncontextmenu в production/chat/85-message-actions.js
- 🟩 Пересборка клиентских ассетов npm run build:preview && node ops/build-learning-production-assets.mjs
- 🟩 Прогон полного теста test/test-chat-ui.mjs и целевых тестов

## 5. Анализ падения test/test-chat-ui.mjs и план стабилизации

### Точная причина дефекта:
1. В шаге 92 тест отправляет ответ через диалог (`study-reply`). Клиент показывает уведомление `#msgStatus` («personal chat»). Блок `#msgStatus` имеет высоту 34px и сдвигает `#msgTimeline` вниз на 34px.
2. В строке [test/test-chat-ui.mjs:386](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-ui.mjs#L386) Playwright измеряет сообщение `[data-msg-id="1"]` при видимом `#msgStatus` (`top: 186.39px`, `height: 60.3px`, центр Y: 216.54px) и начинает правый клик по координате `y = 216px`.
3. Событие `pointerdown` перехватывается глобальным обработчиком в [production/chat/20-connection.js:5-12](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L5-L12):
   ```javascript
   document.addEventListener('pointerdown', (event) => {
     const notice = el('msgStatus');
     if (!notice.hidden && !notice.contains(event.target)) status('');
   });
   ```
   Обработчик скрывает плашку `#msgStatus` на `pointerdown` без проверки типа клика (`event.button`).
4. При скрытии `#msgStatus` лента `#msgTimeline` моментально поднимается вверх на 34px. Верх сообщения `[data-msg-id="1"]` смещается до `top: 152.39px`, а низ — до `bottom: 212.69px`.
5. Браузер доставляет последующее событие `contextmenu` по ранее рассчитанной координате `y = 216px`. Точка 216px оказывается на 3.31px ниже карточки сообщения (`bottom: 212.69px`) в 10px-отступе (`margin`).
6. В [production/chat/85-message-actions.js:478](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L478) обработчик `timeline.oncontextmenu` выполняет `event.target.closest('.msg-message')`. Целевым узлом является `DIV.chat-timeline`, возвращается `null`, меню `#msgContext` не открывается, и шаг 93 завершается таймаутом Playwright.

### Изолированное решение:
1. В [production/chat/20-connection.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L9): в слушателе `pointerdown` добавить `if (event.button === 2) return;`, чтобы правый клик по сообщению не вызывал схлопывание статусной плашки до завершения клика и открытия меню.
2. В [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L478): в `timeline.oncontextmenu`, если `node` не найден напрямую, выполнять поиск карточки сообщения в радиусе внешнего отступа (`margin`) через `document.elementFromPoint(event.clientX, event.clientY + dy)`.
3. Пересобрать ассеты и подтвердить прохождение `node test/test-chat-ui.mjs`.

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено изменять или нарушать функциональность компонентов, не относящихся к текущей задаче: существующие тесты платформы, механизмы шифрования сообщений, работу групповых чатов, а также несохраненные изменения в site/preview.css и test/test-bugs-ui.mjs.
