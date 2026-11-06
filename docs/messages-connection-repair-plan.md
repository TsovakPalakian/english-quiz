# План стабилизации Messages (Remediation Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается менять роли `USER`, `ADMIN`, `DEVELOPER`, состав групп, экзамены, уроки, словарь, формат шифра `chatenc:` и секрет `CHAT_ENCRYPTION_KEY`. Запрещается править руками `production/chat.js` и `preview.js`: клиент чата собирается из `production/chat/*.js` командой `npm run build:preview`. Этот документ сам по себе код не меняет.

Живой `GET https://lumiscia.org/api/messages/socket` отвечает **426**. Экран Messages шлет текст только по этому WebSocket. `GET https://lumiscia.org/api/messages/send` отвечает **404**. В рабочей копии тот же путь отвечает **410**. Опубликованный Worker и это дерево расходятся.

---

## 1. Точная формулировка проблем

### Проблема 1. Сокет закрывается через 20 минут
- **Файл**: [`src/chat-durable.mjs#L603`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L603)
- **Закрытие**: [`src/chat-durable.mjs#L571`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L571)
- **Причина**: Срок сокета равен `min(сейчас + 20 минут, конец сессии)`. Сессия аккаунта живет 3 часа. Будильник закрывает сокет кодом **4000** с причиной `Renew session.` Клиент показывает `Connection interrupted. Reconnecting...` и открывает сокет снова.

### Проблема 2. Ошибка R2 рвет сокет на каждом событии
- **Файл**: [`src/chat-durable.mjs#L429-L432`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L429)
- **Причина**: `sessionAllowed` при исключении `MEDIA.head` закрывает сокет кодом **1011**. Клиент подключается снова. Следующее событие снова закрывает сокет.

### Проблема 3. Счетчик переподключений не копится, код 1005 молчит
- **Файл**: [`production/chat/20-connection.js#L153`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L153)
- **Сброс после снимка**: [`production/chat/20-connection.js#L194`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L194)
- **Отказ от повтора**: [`production/chat/20-connection.js#L237`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L237)
- **Причина**: `connect()` обнуляет `reconnectCount` в начале каждой попытки. Предел в 8 попыток не достигается. Код **1005** считается нормальным концом, новый сокет не открывается.

### Проблема 4. Send не уходит, пока сокет закрыт
- **Отказ команды**: [`production/chat/20-connection.js#L122-L123`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L122)
- **Сброс уже отправленной команды**: [`production/chat/20-connection.js#L141-L144`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L141)
- **Повтор только по новому нажатию**: [`production/chat/40-messages.js#L1035-L1036`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1035)
- **Идемпотентность на сервере**: [`src/chat-durable.mjs#L254`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L254)
- **Причина**: `request()` сразу отклоняет команду текстом `Chat is reconnecting. Your draft is saved.`, если сокет не `OPEN`. Черновик с тем же `clientKey` лежит в `localStorage` и сам не повторяется.

### Проблема 5. Каждый сокет заново собирает комнаты
- **Файл**: [`src/chat-worker.mjs#L378`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L378)
- **Причина**: Перед выдачей WebSocket вызывается `bootstrap`: комнаты, перенос истории, политика. Частые обрывы снова будят комнаты аккаунта.

### Проблема 6. Календарь еще зовет старые HTTP-пути
- **Файл**: [`client/53a-group-calendar.js#L1325-L1339`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1325) и [`client/53a-group-calendar.js#L2285-L2323`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2285)
- **Отказ в рабочей копии**: [`src/chat-worker.mjs#L304-L305`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L304)
- **Причина**: Если `sendGroupChatMessage` нет или он вернул пустой результат, календарь шлет `POST /api/messages/open` и `POST /api/messages/send`. В этой копии сервер отвечает 410. На живом сайте `GET /api/messages/send` отвечает 404.

### Проблема 7. Сбой чата подменяет ответ остального сайта
- **Файл**: [`src/chat-worker.mjs#L307-L399`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L307)
- **Блокировка записи группы**: [`src/chat-worker.mjs#L388`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L388)
- **Причина**: Один `try/catch` превращает исключение любого маршрута внутри блока в `Chat temporarily unavailable.` Смена группы сначала ждет `/invalidate` чата. Падение Durable Object чата блокирует эту запись.

Отдельный Worker только для `/api/messages` и сокета имеет смысл после этапов 1–4. Отдельный вход с собственной копией аккаунтов не нужен: видимость берется из тех же групп и той же сессии.

---

## 2. Границы

- **Можно менять на выбранном этапе**: файлы, названные в этом этапе.
- **Нельзя менять**: роли, группы, экзамены, уроки, словарь, байты шифра, секрет ключа, `wrangler.toml`.
- **Проверка каждого этапа**: точечный `node --test` по названному файлу теста и, для клиента, `npm run build:preview`. Полный набор тестов не запускать.
- **Публикация**: не через wrangler из этого плана. Публикация только по слову `publish`.

---

## 3. Этапы

### Этап 1. Сокет живет сессию

🟩 проверен `node --test test/test-chat-durable.mjs`: 44 прохождения, 0 падений

- **Файлы**: [`src/chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs), точечные проверки в [`test/test-chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-durable.mjs).
- **Меняется**: срок сокета равен сроку сессии. 20 минут остаются только если срок сессии не передан. Подтвержденный отзыв по-прежнему закрывает сокет кодом 4003. Исключение `MEDIA.head` сокет не закрывает и это событие не отправляет.
- **Нельзя задеть**: текст сообщений, комнаты, вложения, формат `chatenc:`.
- **Проверка**: `node --test test/test-chat-durable.mjs` на срок, код 4003 и ошибку `head`.
- **Риск**: при долгом отказе R2 событие задерживается до следующей успешной проверки.
- **Сообщение коммита**: `Kept chat sockets open for the account session.`

### Этап 2. Переподключение останавливается и поднимается само

🟩 проверен `node --test test/test-chat-reconnect.mjs test/test-chat-durable.mjs` и `npm run build:preview`

- **Файлы**: [`production/chat/20-connection.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js), команда `ping` в [`src/chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs), затем сборка `production/chat.js`.
- **Меняется**: `reconnectCount` сбрасывается после снимка чата и по кнопке Chats. Код 1005 открывает новый сокет. Коды 1000 и 4003 новый сокет не открывают. Клиент шлет `ping` раз в 30 секунд. Сервер отвечает `{ok:true}` без выбора комнаты.
- **Нельзя задеть**: верстку списка комнат и текст черновика.
- **Проверка**: тест клиента на 1005, на остановку после восьми неудачных открытий и на сброс счетчика после снимка. Затем `npm run build:preview`.
- **Риск**: сервер, который закрывает сокет без кода каждую секунду, остановится на восьми попытках.
- **Сообщение коммита**: `Stopped the chat reconnect loop.`

### Этап 3. Send дожидается сокета

🟩 проверен `node --test test/test-chat-reconnect.mjs test/test-chat-durable.mjs` и `npm run build:preview`

- **Файлы**: [`production/chat/20-connection.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js), [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js), затем сборка `production/chat.js`.
- **Меняется**: неподтвержденная отправка с тем же `clientKey` уходит один раз после следующего снимка. Новый ключ для этой попытки не создается.
- **Нельзя задеть**: предел 4000 символов и запрет категории `learning` для ученика.
- **Проверка**: обрыв после Send, затем снимок, одна запись на сервере.
- **Риск**: если снимок не придет, пузырь останется в состоянии ошибки.
- **Сообщение коммита**: `Retried an unacked chat send after reconnect.`

### Этап 4. Повторный сокет не собирает все комнаты

🟩 проверен `node --test --test-name-pattern "Academic bridge|live inbox" test/test-chat-durable.mjs`

- **Файл**: [`src/chat-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs).
- **Меняется**: если inbox аккаунта уже живой и роль не менялась, полный `bootstrap` пропускается. Первое подключение и смена роли по-прежнему собирают политику.
- **Нельзя задеть**: правила, кто кого видит.
- **Проверка**: второй сокет не вызывает `migrate` по каждой комнате.
- **Риск**: состав группы у уже открытого сокета обновится после существующего `/invalidate`.
- **Сообщение коммита**: `Skipped a full chat bootstrap on reconnect.`

### Этап 5. Календарь не зовет мертвые HTTP-пути

🟩 проверен `node --test test/test-calendar-chat.mjs` и `node --test --test-name-pattern "Client contracts" test/test-learning-attendance.mjs`

- **Файл**: [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- **Меняется**: отчет и уведомление об отсутствии идут только через `sendGroupChatMessage`. Ветки `POST /api/messages/open` и `POST /api/messages/send` убираются. Ответы 410 и 404 в Worker не оживляются.
- **Нельзя задеть**: журнал посещаемости.
- **Проверка**: при живом сокете отчет уходит в чат. При закрытом сокете показывается ошибка, запроса на `/api/messages/send` нет.
- **Риск**: старый клиент без `sendGroupChatMessage` теряет запасной путь.
- **Сообщение коммита**: `Stopped calendar reports from calling retired chat routes.`

### Этап 6. Ошибка чата не подменяет весь сайт

🟩 проверен `node --test --test-name-pattern "learning route exception|failed chat invalidate|chat route still reports|does not trigger CHAT_BRIDGE|Logout keeps" test/test-chat-durable.mjs`

- **Файл**: [`src/chat-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs).
- **Меняется**: `try/catch` с текстом чата остается на маршрутах `/api/messages`. Чужой `application.fetch` не получает текст `Chat temporarily unavailable.` Сбой `/invalidate` не отменяет сохранение группы.
- **Нельзя задеть**: классы Durable Object и ключ шифрования. Новый Worker не заводится.
- **Проверка**: исключение учебного маршрута не получает текст чата. Падение `CHAT_BRIDGE` не отменяет сохранение группы.
- **Риск**: сокет узнает о новой группе на следующем `/policy`, не в том же ответе.
- **Сообщение коммита**: `Kept chat failures off non-chat responses.`

---

## 4. Порядок

Этапы 1 и 2 убирают цикл обрыва. Этап 3 возвращает Send после обрыва. Этапы 4–6 уменьшают нагрузку и отделяют сбой чата от остального сайта. Отдельный Worker для сокета рассматривается только после этапов 1–4.
