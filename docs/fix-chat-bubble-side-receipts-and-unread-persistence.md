# Исправление стороны сообщений, галочек и сохранения прочитанности чата

<span style="color: red; font-weight: bold;">WARNING</span>: Выполняемые задачи строго и изолированно должны задевать только свой функционал. Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Правка изолирована файлами `production/chat/00-core.js`, `production/chat/40-messages.js`, `test/test-chat-presentation.mjs` и генерацией `production/chat.js`.

---

## 1. Исходные дефекты и утвержденный скриншот

На представленном скриншоте **«Скриншот 1»** зафиксированы 4 дефекта отображения и синхронизации:

![Скриншот 1: Анализ интерфейса чата, расположения сообщений, аватаров и счетчиков непрочитанного](/Users/tsovakpalakian/.gemini/antigravity/brain/11669654-ace8-4dc2-b4bc-c6eeeb250bae/.user_uploaded/media_1794229215612_6405142b.png)
*«Скриншот 1: Анализ интерфейса чата, расположения сообщений, аватаров и счетчиков непрочитанного»*

1. **Сообщения автора смещены влево**: функция `isOwnMessage` вернула `false`, класс `.is-own` не выставлен.
2. **Отсутствуют галочки доставки и прочтения**: блок `<span class="msg-receipt">` генерируется только при `own === true`.
3. **Подставляется чужой аватар «S»**: для чужих сообщений слева выводится аватар отправителя, в то время как для своих сообщений аватар автора скрыт.
4. **Прочитанные сообщения возвращаются при повторном входе**: из-за локального обнуления счетчика при открытии `hadUnread` становится `false`, и планировщик `chatMarkReadPlan` возвращает `action: 'skip'`, пропуская отправку `ack('read')` на сервер.

---

## 2. Этапы реализации

### Этап 1: Изоляция идентификатора автора и сохранение профиля в кэше IndexedDB
- В [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js):
  - В `writeChatCache(snapshot = data)` добавить сохранение `profile` в кэш IndexedDB и значение аргумента по умолчанию `snapshot = data`.
  - В `applyChatCache(cached)` восстанавливать `data.profile = cached.profile || null`.
  - В `isOwnMessage(m)` расширить проверку авторства: совпадение `senderId` с `myAccountId()`, а также совпадение `m.sender` с именем профиля `data?.profile?.name`.

### Этап 2: Безусловная синхронизация прочитанности при открытии комнаты
- В [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js):
  - В методе `openRoom(id)` в блоке `finally` вызывать `markRead(true, id, openedKind)` безусловно, чтобы гарантировать фиксацию курсора `through` в Durable Object при каждом входе в комнату.

### Этап 3: Тестирование и сборка ассетов
- Добавить тесты в [test/test-chat-presentation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-presentation.mjs).
- Собрать продакшн-ассеты: `npm run build:preview`.
- Прогнать целевые тесты: `node --test test/test-chat-presentation.mjs` и `node --test test/test-chat-durable.mjs`.

---

## 3. Чеклист прогресса

- 🟩 Сохранение и восстановление профиля в кэше IndexedDB в production/chat/00-core.js
- 🟩 Безусловная отправка квитанции прочтения при открытии комнаты в production/chat/40-messages.js
- 🟩 Целевые тесты для распознавания автора и сохранения прочитанности в test/test-chat-presentation.mjs
- 🟩 Сборка production/chat.js командой npm run build:preview
- 🟩 Полная верификация тестами node --test test/test-chat-presentation.mjs test/test-chat-durable.mjs
