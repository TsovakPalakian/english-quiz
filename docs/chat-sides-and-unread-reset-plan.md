# План исправления чата: стороны сообщений, аватары, прочитанные, иконки меню, панель реакций и 3 статуса галочек

## 1. Постановка задачи и ссылки на код

1. **Личные диалоги (Direct Chats) — невидимое разделение на 2 части и вынос аватаров на внешние стороны**:
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L835-L860).
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L92-L102).
   - **Требование 1 (Отсутствие видимой линии)**: Никакой визуальной разделительной линии в чате быть не должно (`chat-timeline::before { display: none }`). Разделение на две части является пространственным: сообщения собеседника занимают не более ~44% ширины слева, сообщения автора занимают не более ~44% ширины справа.
   - **Требование 2 (Позиционирование аватаров за пределами бабблов)**: 
     - У собеседника слева аватар выносится влево за пределы баббла (`left: -46px; right: auto;`).
     - У автора справа аватар выносится вправо за пределы баббла (`right: -46px; left: auto;`).
   - **Требование 3 (Группировка аватаров)**: У первого сообщения серии автора/собеседника отображается аватар, а последующие сообщения одного автора подряд внутри той же минуты идут компактно без повторения аватара.

2. **Групповые чаты (Group Chats) — группировка аватаров строго по минуте и сообщения автора справа**:
   - Файл: [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L172-L183).
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L829-L860).
   - **Требование**: Сообщения автора строго отображаются справа со своим аватаром справа. Для участников слева: если сообщение отправлено на одной минуте (например, 20:26), а следующее сообщение того же автора — на следующей минуте (например, 20:27), второе сообщение отображается **с аватаром**. Если следом идёт третье сообщение того же автора на той же 27-й минуте — оно идёт под вторым **без аватара**. При прерывании другим участником сообщение нового участника получает аватар.

3. **Сброс счётчиков прочитанных сообщений**:
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1018-L1068).
   - Файл: [production/chat/20-connection.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L237).
   - **Требование**: При входе в чат и прокрутке гарантировать отправку серверного `ack('read')` без блокировки локальным обнулением, обновлять локальный кэш снимка `writeChatCache`, исключая повторное появление прочитанных сообщений как непрочитанных после перезагрузки.

4. **Восстановление иконок Reply и Select в контекстном меню сообщения**:
   - Файл: [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L77-L98).
   - Файл: [ops/build-chat-icons.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/build-chat-icons.mjs#L15-L25).
   - **Требование**: Иконки для действий `Reply` (иконка `reply`) и `Select` (иконка `circle-check`) отображаются слева от текста в контекстном меню.

5. **Панель реакций: частые смайлики пользователя и раскрывающийся список (в стиле Telegram)**:
   - Файл: [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L100-L115).
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L339-L345).
   - **Требование**: Полоса реакций в меню сообщения отображает топ наиболее частых смайликов пользователя + стрелку `v` (`chevron-down`). По нажатию на `v` открывается расширенная панель реакций с поиском, чипами категорий и разделом `POPULAR`.

6. **3 состояния статуса доставки/прочтения (галочки)**:
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L263-L277).
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L121-L124).
   - **Требование**:
     - **Состояние 1 (Отправлено)**: 1 серая галочка (`mark: 'check'`, класс `.msg-receipt`, серый цвет `color: #8c9ba5`).
     - **Состояние 2 (Доставлено)**: 2 серые галочки (`mark: 'check-check'`, класс `.msg-receipt.is-delivered`, серый цвет `color: #8c9ba5`).
     - **Состояние 3 (Прочитано)**: 2 синие галочки (`mark: 'check-check'`, класс `.msg-receipt.is-read`, синий цвет `color: #248bda`).

---

## 2. Границы области изменений и изоляция

> [!IMPORTANT]
> **Блок изоляции функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задачи строго и изолированно должны затрагивать только компоненты чата ([production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js), [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js), [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js), [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css), [production/chat/20-connection.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js), [ops/build-chat-icons.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/build-chat-icons.mjs), [src/chat-durable.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs)). Смежные разделы платформы не модифицируются.

---

## 3. Этапы реализации и чеклист

- 🟩 **Этап 1**: Реализация правила группировки по минуте (`sameSenderSeries`) в [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js), чтобы смена минуты (20:26 -> 20:27) начинала новую серию с аватаром, а сообщения на той же минуте шли под ним без аватара.
- 🟩 **Этап 2**: Позиционирование аватаров за внешними пределами бабблов в [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css) и [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js): для автора — справа (`right: -46px; left: auto;`), для собеседника — слева (`left: -46px; right: auto;`).
- 🟩 **Этап 3**: Условное пространственное разделение на 2 части без видимой линии (ширина баббла до 44%, слева для собеседника, справа для автора).
- 🟩 **Этап 4**: Исправление `isOwnMessage` в [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js) (удаление `sender !== peer`, строгое определение авторства).
- 🟩 **Этап 5**: Корректировка `markRead()` и `ack()` в [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js) и синхронизации кэша снимка в [production/chat/20-connection.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js).
- 🟩 **Этап 6**: Восстановление иконок `reply`, `circle-check`, `quote` в [ops/build-chat-icons.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/build-chat-icons.mjs) и пересборка [production/chat-icons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat-icons.js).
- 🟩 **Этап 7**: Реализация панели реакций с частыми смайликами пользователя, кнопкой раскрытия `v` и расширенным поп-апом реакций в [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js) и [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css).
- 🟩 **Этап 8**: Реализация 3 статусов галочек (1 серая — отправлено, 2 серые — доставлено, 2 синие — прочитано) в [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js) и [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css).
- 🟩 **Этап 9**: Актуализация тестов [test/test-chat-visual-fixes.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-visual-fixes.mjs) и [test/test-chat-message-series-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-message-series-ui.mjs), сборка продакшн-ассетов через `npm run build:preview`.
