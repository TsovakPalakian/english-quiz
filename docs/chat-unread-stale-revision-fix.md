# Сброс уже прочитанных сообщений

## Постановка

Бейдж `unread.personal` возвращается после открытия чата.

- Локальный ноль: `production/chat/40-messages.js` (`openRoom`, `ack`, `markRead`).
- Старая сводка комнаты пишется поверх новой: `src/chat-durable.mjs` (`ChatInbox.command`, `open`).
- Список рисует число, пока комната не открыта: `production/chat/30-rooms.js` (`upsertRoom`).

Сервер уменьшает счетчик только когда курсор `read_*` доходит до последнего сообщения категории. Ответ `history`, собранный раньше `read`, не должен вернуть старое число.

## Граница

Меняются очередь `ack`, цель `markRead`, слияние `unread` при той же `revision` и запись комнаты во входящих.

Общая запись комнаты в `command` обслуживает `history`, `read`, `delivered`, `open` и остальные команды с полем `room`. Более новая `revision` сохраняется как раньше. Более старая не затирает счетчик. Шифрование, отправка и категории не меняются.

## Проверка

```
node --test --test-name-pattern "stale history summary does not restore unread|later read is queued while an earlier read is pending|same room revision does not raise unread|open room reads through the last message" test/test-chat-durable.mjs test/test-chat-reconnect.mjs
```

Arguments: `--test-name-pattern` как в команде выше.

Environment: не требуется.

Сборка: `npm run build:preview`.

Строка коммита: `Fixed read chat messages staying unread after the room is left.`

## Чеклист

- 🟩 Очередь более позднего `read`, пока предыдущий запрос еще идет.
- 🟩 `markRead` для комнаты и категории, которые открыли.
- 🟩 Запись комнаты во входящих только если `revision` не старше сохраненной.
- 🟩 Та же `revision` не поднимает локальный счетчик.
- 🟩 Проверка целевыми тестами и сборка `production/chat.js`.
