# Свои сообщения справа

<span style="color: red; font-weight: bold;">WARNING</span>: Не трогать и не ломать функциональность вне этой правки. Меняется только повторная пометка своего пузыря в `mergeNode`. Стили ленты, аватары, чужие пузыри, галочки, реакции и сервер не меняются.

## Постановка

1. Проблема: свой пузырь остается слева, если он уже нарисован без класса `is-own`. В [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js) при совпадении текста функция выходит до установки класса.
2. Граница: публичный вид пузыря тот же. Свой пузырь получает `is-own` и встает справа. Чужой остается слева.
3. Проверка: `node --test test/test-chat-presentation.mjs test/test-chat-message-series-ui.mjs` после `npm run build:preview`.
4. Отчет: квадраты ниже.

## Правка

1. В список сравнения пузыря добавить `senderId`.
2. При повторной отрисовке того же текста заново ставить или снимать `is-own`.
3. Сборщик `npm run build:preview` обновляет `production/chat.js`.

## Проверка

Команда: `npm run build:preview`

Команда: `node --test test/test-chat-presentation.mjs test/test-chat-message-series-ui.mjs`

Arguments: нет.

Environment: пустой.

Строка коммита: `Kept own chat messages on the right when the bubble is redrawn.`

## Чеклист

- 🟩 Пометка `is-own` при повторной отрисовке в production/chat/40-messages.js
- 🟩 Сборка production/chat.js
- 🟩 Тесты presentation и series
