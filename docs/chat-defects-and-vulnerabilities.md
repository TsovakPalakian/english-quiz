# Сбои чата и открытые уязвимости

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОЛА:**
> Этот документ ничего в коде не меняет. Пока нет отдельного `do` на конкретный пункт, запрещено править роли `USER`, `ADMIN`, `DEVELOPER`, состав групп, экзамены, уроки, словарь, формат шифра `chatenc:`, секрет `CHAT_ENCRYPTION_KEY` и `wrangler.toml`. Запрещено править руками `production/chat.js` и `preview.js`: клиент чата собирается из `production/chat/*.js` командой `npm run build:preview`. Стили чата лежат в `production/chat.css`. Если соседняя функция должна измениться, это нужно сказать отдельно и дождаться подтверждения.

Каждый пункт ниже самодостаточен. Следующий пункт не начинается, пока предыдущий не отмечен и не подтвержден отдельным `do`.

Старый план [`docs/vulnerability-repair-plan.md`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/vulnerability-repair-plan.md) не заменяется. Его этап 1, вложение отзыва, уже закрыт и здесь не повторяется. Этапы 2–7 того плана совпадают с пунктами V1–V6 ниже. V7 в том плане нет.

Статусы: `🟩` проверено и сделано, `🟨` текущая работа, `⬜` не начато, `🟥` проверено и требует переделки.

---

## V1. Сессия сверяет короткий срез хеша пароля

🟩 проверено

Кука сессии привязана не ко всему `password_hash`, а к первым 24 символам.

- Подпись: [`src/worker.js#L385`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L385) — `pwdv: String(user.password_hash || "").slice(0, 24)`.
- Проверка: [`src/worker.js#L453`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L453) и [`src/worker.js#L470`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L470). Совпадение среза принимается за тот же пароль.

Два разных хеша с одинаковым началом проходят одну куку. Смена пароля не обязана выкинуть старую сессию, если начало хеша совпало.

**Рекомендация.** В новой подписи и в проверке брать весь `password_hash`. Имя куки, срок сессии и набор полей payload не менять.

**Нельзя задеть.** Роли, отзыв персональных данных, запись пароля.

**Проверка.** Два хеша с одинаковыми первыми 24 символами и разным хвостом не принимают одну куку. Полное совпадение хеша принимает куку.

**Риск.** Уже выданные куки перестанут подходить. Нужен новый вход.

**Сообщение коммита:** `Bound the session cookie to the full password hash.`

---

## V2. Отсутствие колонки active оставляет вход

🟩 проверено

Если запрос сессии падает с текстом `no such column: active`, код делает второй запрос без этой колонки и возвращает аккаунт.

- Файл: [`src/worker.js#L465`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L465).
- Второй возврат: [`src/worker.js#L472`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L472).

Отключенный аккаунт проходит, когда колонка недоступна.

**Рекомендация.** Эту ветку не пускать вторым запросом. Сессия заканчивается отказом во входе.

**Нельзя задеть.** Успешный запрос, где колонка `active` есть. `active === 0` по-прежнему закрывает вход. `is_personal_data_revoked` не ослабляется.

**Проверка.** Ошибка с текстом `no such column: active` дает пустую сессию. Строка с `active === 0` дает пустую сессию. Строка с `active === 1` входит.

**Риск.** База без колонки `active` перестанет пускать всех, пока колонка не появится.

**Сообщение коммита:** `Rejected sessions when the active column is missing.`

---

## V3. Адрес блокировки входа берется из X-Forwarded-For

🟩 проверено

При пустом `CF-Connecting-IP` первый адрес из `X-Forwarded-For` становится ключом неудачных входов.

- Чтение: [`src/worker.js#L104`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L104).
- Ключ: [`src/worker.js#L112`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L112), предел 8 неудач и блок 15 минут в [`src/worker.js#L101`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L101).

Клиент может подставить заголовок и занять чужую корзину блокировки или уйти из своей.

**Рекомендация.** `clientIp` читает только `CF-Connecting-IP`. Пустое значение остается `unknown`. `X-Forwarded-For` не читается.

**Нельзя задеть.** Предел 8 неудач, срок 15 минут, ключи `login-fail/` и `register-fail/`.

**Проверка.** Запрос без `CF-Connecting-IP` и с произвольным `X-Forwarded-For` получает ключ от `unknown`.

**Риск.** Локальный запуск без `CF-Connecting-IP` делит одну корзину `unknown`.

**Сообщение коммита:** `Stopped login locks from trusting X-Forwarded-For.`

---

## V4. Поиск истории исполняет произвольное выражение

🟩 проверено

Режим `regex` строит `new RegExp` из строки до 120 символов и гоняет ее по каждой строке истории комнаты.

- Сервер: [`src/chat-durable.mjs#L190`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L190) и [`src/chat-durable.mjs#L195`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L195).
- Экран: [`production/chat/80-dialogs.js#L158`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js#L158), пункт `Regex`.

Выражение с вложенным повтором занимает поток комнаты. Отправка и чтение этой комнаты ждут вместе с поиском.

**Рекомендация.** `searchMode === 'regex'` отвечает 400 и не вызывает `new RegExp`. Режимы `prefix` и `exact` остаются. Пункт Regex убирается с экрана, затем `npm run build:preview`.

**Нельзя задеть.** Страницы истории, предел 50 сообщений, категории `personal` и `learning`, отправку.

**Проверка.** `prefix` и `exact` находят прежние строки. `regex` дает отказ.

**Риск.** Сохраненный на экране режим Regex перестанет искать, пока выбор не вернется на Words или Exact phrase.

**Сообщение коммита:** `Rejected catastrophic regular expressions in chat history search.`

---

## V5. Строка без chatenc читается как текст

🟩 проверено

`open` возвращает значение без префикса `chatenc:` без расшифровки. `rows()` отдает его в историю.

- Открытие: [`src/chat-encryption.mjs#L16`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-encryption.mjs#L16).
- Чтение комнаты: [`src/chat-durable.mjs#L29`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L29).

Незапечатанные `body`, `format`, `payload`, `data` и `value` уходят клиенту открытым текстом.

**Рекомендация.** Если шифр комнаты включен, а значение этих колонок не начинается с `chatenc:`, чтение подставляет пустую строку и не вызывает `open`. Саму функцию `open` не менять: перенос старых строк в [`src/chat-worker.mjs#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L215) должен по-прежнему видеть старый текст, чтобы запечатать его.

**Нельзя задеть.** Формат `chatenc:`, `CHAT_ENCRYPTION_KEY`, импорт и перенос аккаунта.

**Проверка.** Запечатанная строка читается. Незапечатанная строка в истории пустая. Импорт старой строки по-прежнему запечатывает ее.

**Риск.** Сообщение, которое еще не запечатано, временно видно как пустое.

**Сообщение коммита:** `Hid unsealed chat rows from room reads.`

---

## V6. Сотрудник открывает любой профиль

🟩 проверено

Для роли `ADMIN` или `DEVELOPER` проверка профиля сразу возвращает истину на любой идентификатор, который не начинается с `group:`.

- Файл: [`src/chat-profiles.mjs#L7`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-profiles.mjs#L7) — `if(sid===String(actor.id)||staff(actor))return true`.

Контакты, комнаты и срок `discovered:` при этом не проверяются. Сотрудник может запросить профиль человека вне своих чатов.

**Рекомендация.** Ветку `staff(actor)` убрать. Профиль доступен, если это сам актер, контакт инбокса, собеседник активной комнаты или запись `discovered:` с живым сроком. Групповой идентификатор по-прежнему сверяется со списком групп инбокса.

**Нельзя задеть.** Состав групп, роли и правила, кто попадает в контакты при сборке политики.

**Проверка.** `ADMIN` не читает идентификатор вне своих контактов и комнат. Контакт из инбокса читается. Свой профиль читается.

**Риск.** Сотрудник не откроет профиль человека, которого политика еще не положила в его контакты.

**Сообщение коммита:** `Limited staff chat profiles to their own contacts.`

---

## V7. Запасной запрос пользователя не читает active и hidden

🟩 проверено

`d1UserById` при любой ошибке с текстом `no such column` повторяет выборку без `active` и без `hidden`.

- Первый запрос: [`src/worker.js#L902`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L902).
- Запасной запрос: [`src/worker.js#L907`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L907).
- Проверка живости: [`src/worker.js#L913`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L913). Отсекается только `active === 0`. Если колонки в строке нет, `active` не приходит и проверка проходит.
- Кто вызывает: [`src/worker.js#L919`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L919), `resolveStatTarget`. Скрытый или отключенный аккаунт может стать целью чужой статистики.

Это сосед V2. V2 закрывает вход по сессии. Этот пункт закрывает выбор чужого аккаунта для статистики.

**Рекомендация.** Ветка `no such column` не выполняет второй запрос и возвращает `null`. Успешный запрос, где `active` и `hidden` есть, не меняется.

**Нельзя задеть.** Свою статистику, когда `forId` пустой или равен актеру. Проверку ролей `DEVELOPER` и `ADMIN` после успешного чтения строки. Сессионный путь V2.

**Проверка.** Ошибка `no such column: hidden` или `no such column: active` не делает чужой аккаунт целью. Строка с `active === 0` тоже не становится целью. Строка с `active === 1` и `hidden === 0` для разрешенной роли остается целью.

**Риск.** База без этих колонок перестанет открывать чужую статистику, пока колонки не появятся.

**Сообщение коммита:** `Rejected stat targets when account columns are missing.`

---

## D1. Проверка сессии рвет рукопожатие сокета

🟩 проверено

До `acceptWebSocket` вызов `MEDIA.head` не пойман. Исключение уходит в общий `catch` и ответ становится JSON, а не сокет.

- Проверка: [`src/chat-durable.mjs#L606`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L606).
- Принятие сокета: [`src/chat-durable.mjs#L608`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L608).
- Общий отказ: [`src/chat-durable.mjs#L615`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L615).

После принятия сокета та же проверка уже ловит ошибку и не закрывает сокет: [`src/chat-durable.mjs#L435`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L435). Сбой хранилища на рукопожатии дает клиенту обрыв. Баннер `Connection interrupted. Reconnecting...` ставится в [`production/chat/20-connection.js#L270`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L270). Пока сокета нет, отправка и прочтение не доходят: [`production/chat/20-connection.js#L122`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L122).

Положительный `head` по-прежнему означает отозванную сессию и должен закрывать вход.

**Рекомендация.** Ошибку `MEDIA.head` до принятия сокета трактовать так же, как после принятия: сокет открывается, отзыв сессии по положительному `head` по-прежнему отвечает 401.

**Нельзя задеть.** Закрытие 4003 при живой записи `revoked-sid/`, срок сокета `chatSocketExpires`, ping.

**Проверка.** Бросок `MEDIA.head` до `acceptWebSocket` дает статус 101. Положительный `head` по-прежнему не пускает.

**Сообщение коммита:** `Kept the chat socket up when session storage lookup fails.`

---

## D2. Цифра непрочитанного не гаснет

🟩 проверено

Прочтение уходит только из открытой комнаты, и только когда вкладка видима, документ в фокусе, открыт не поиск и на узком экране не открыт список.

- Условия: [`production/chat/40-messages.js#L986`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L986).
- В прочтение попадает наибольший видимый `data-msg-id`: [`production/chat/40-messages.js#L1002`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1002).
- Ошибка запроса проглатывается: [`production/chat/40-messages.js#L978`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L978).
- После снимка повторно уходит только `delivered`: [`production/chat/40-messages.js#L983`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L983).

Сервер не пересчитывает остаток. Он вычитает число чужих сообщений в промежутке. Если курсор уже на последнем сообщении, ответ приходит без комнаты и цифра не меняется.

- Выход без комнаты: [`src/chat-durable.mjs#L321`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L321).
- Вычитание: [`src/chat-durable.mjs#L327`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L327).

Снимок при переподключении подставляет список целиком: [`production/chat/20-connection.js#L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L215). Если событие прочтения еще не лежит во входящих, старая цифра возвращается на экран.

**Рекомендация.** Открытая комната шлет прочтение по последнему сообщению этой категории и повторяет его после снимка. Сервер ставит `unread_*` равным числу чужих неудаленных сообщений новее курсора. Если курсор уже в конце, а цифра больше нуля, сервер все равно записывает остаток и возвращает комнату. Снимок не затирает комнату более старой ревизией.

**Нельзя задеть.** Счетчик `delivered`, категории `personal` и `learning`, архив и `blockedByMe` в [`production/chat/30-rooms.js#L11`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L11).

**Проверка.** Открытие комнаты при живом сокете обнуляет цифру этой комнаты и сумму вкладки Personal. Повторный снимок со старой ревизией цифру не возвращает. Ответ `read` всегда содержит `room`, когда цифра изменилась.

**Сообщение коммита:** `Cleared chat unread counts when a room is open.`

---

## D3. Событие группы выпадает из очереди

🟩 проверено

Входящие отклоняют событие группы, если этой группы нет в их списке, и отвечают успехом. Очередь комнаты после любого успешного вызова удаляет строку.

- Отклонение: [`src/chat-durable.mjs#L421`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L421).
- Удаление: [`src/chat-durable.mjs#L137`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L137).
- Ошибка всей пачки глотается: [`src/chat-durable.mjs#L140`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L140).

В списке человека сообщения нет. В самой комнате строка остается и видна при открытии истории. Одна битая строка в начале пачки останавливает следующие, пока будильник не повторит пачку.

Пропуск полного входа в [`src/chat-worker.mjs#L226`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L226) не обновляет список групп перед этими событиями. Новая группа может еще не быть в списке входящих.

**Рекомендация.** Ответ `ignored` не удаляет строку очереди. Удаление остается для `received` без `ignored` и для `duplicate`. Сбой одной строки не удаляет ее и не останавливает следующие строки пачки.

**Нельзя задеть.** Уникальность `event_key`, снимок входящих, шифр `payload`.

**Проверка.** Событие группы при пустом списке групп остается в `outbox`. Следующая строка той же пачки уходит, если ее вызов успешен.

**Сообщение коммита:** `Kept rejected group chat events in the delivery queue.`

---

## D4. Повтор отправки получает новый ключ

🟩 проверено

Запрос без ответа 20 секунд считается сбоем: [`production/chat/20-connection.js#L127`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L127). Если текст или вложения уже другие, клиент выпускает новый `clientKey`: [`production/chat/40-messages.js#L1113`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1113).

Сервер хранит одну строку на пару отправитель и `client_key`: [`src/chat-durable.mjs#L254`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L254). Новый ключ пишет второе сообщение, хотя первое уже могло сохраниться. Отчет календаря каждый раз берет новый ключ из времени и случайного хвоста: [`production/chat/90-settings.js#L978`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L978).

Повтор с тем же ключом вторую строку не создает.

**Рекомендация.** Пока сервер не подтвердил эту отправку, `clientKey` не меняется. Смена текста после подтверждения по-прежнему получает новый ключ. Календарный отчет держит один ключ на одну попытку отчета.

**Нельзя задеть.** Предел 4000 символов, запрет учебной категории для ученика, лимит 30 сообщений в минуту в [`src/chat-durable.mjs#L261`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L261).

**Проверка.** Таймаут и повтор того же текста дают одну строку. Измененный текст после успешного ответа дает вторую строку.

**Сообщение коммита:** `Reused the chat send key until the server accepted it.`

---

## D5. Личный чат не раскладывает собеседников по сторонам

🟩 проверено

Свои сообщения получают класс `is-own` и `margin-left: auto`: [`production/chat.css#L93`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L93). У всех пузырей при этом стоит `content-visibility: auto`: [`production/chat.css#L71`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L71). Для личной комнаты видимость снята: [`production/chat.css#L94`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L94). На экране личного чата оба собеседника остаются слева.

Класс ставится, когда `senderId` совпадает с аккаунтом: [`production/chat/40-messages.js#L756`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L756). Личная комната не получает `is-group-message`: [`production/chat/40-messages.js#L816`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L816) и [`production/chat/00-core.js#L97`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L97).

**Рекомендация.** В личной комнате свои пузыри стоят у правого края, чужие у левого. Для этих пузырей `content-visibility` становится `visible`. Группа и круг этим пунктом не меняются.

**Нельзя задеть.** Цвета учебной категории, выбор сообщений, аудио и видео.

**Проверка.** В комнате `direct` узел с `is-own` имеет выравнивание к концу ленты. Узел без `is-own` остается у начала. Узел группы не получает это правило.

**Сообщение коммита:** `Placed direct chat messages on opposite sides.`

---

## D6. Время в пузыре выглядит как дата

🟩 проверено

Часы и минуты пишутся через точку: [`production/chat/00-core.js#L82`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L82). Дата дня тоже пишется через точку: [`production/chat/00-core.js#L65`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L65). Подпись `04.06` читается как 4 июня, хотя это 04:06. Та же функция кормит время комнаты в списке: [`production/chat/00-core.js#L84`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L84).

**Рекомендация.** Часы и минуты писать через двоеточие: `04:06`. Дата дня остается `ДД.ММ.ГГГГ`.

**Нельзя задеть.** Полную подпись `stamp` с секундами и миллисекундами, кроме разделителя часов и минут.

**Проверка.** `time` для 04:06 возвращает `04:06`. `dateLabel` для 4 июня остается с точками.

**Сообщение коммита:** `Showed chat clock times with a colon.`

---

## D7. Галочка группы ждет самого медленного участника

🟩 проверено

Прочтение своего сообщения считается по минимуму курсоров всех активных собеседников: [`src/chat-durable.mjs#L114`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L114). Поле `read` истинно только когда этот минимум не ниже номера сообщения: [`src/chat-durable.mjs#L121`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L121).

Один участник, который комнату не открывал, оставляет все сообщения без галочки.

**Рекомендация.** В личной комнате оставить минимум одного собеседника. В группе и круге отдавать число прочитавших и число участников, а галочку «прочитали все» ставить отдельно от галочки «прочитал хотя бы один».

**Нельзя задеть.** Счетчик непрочитанного на списке. Он считается по своему курсору, не по чужим.

**Проверка.** В группе из трех активных участников одна галочка доставки не требует курсора третьего. Полная галочка требует всех.

**Сообщение коммита:** `Counted group read receipts without waiting for every member.`

---

## D8. В группе свои сообщения тоже слева

🟩 проверено

Чужие сообщения группы и круга держат левый отступ 44px: [`production/chat.css#L97`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L97). Свои (`is-own`) это правило не получают и остаются справа. Аватар ставится только чужому первому пузырю серии: [`production/chat/40-messages.js#L846`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L846). Свой пузырь аватар не получает: [`production/chat/40-messages.js#L850`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L850). Личная комната D5 не менялась: [`production/chat.css#L93`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L93).

**Рекомендация.** В группе и круге свои сообщения остаются справа, без левого аватара. Чужие остаются слева, аватар сохраняется.

**Нельзя задеть.** Пункт D5 для личной комнаты. Его можно делать в том же изменении стилей, если оба пункта подтверждены одним `do`.

**Проверка.** Узел группы с `is-own` не имеет левого отступа 44px и не содержит `.msg-sender-avatar`. Чужой узел группы сохраняет аватар.

**Сообщение коммита:** `Kept the sender's group messages on the right.`

---

## D9. Старые сообщения открываются только кнопкой

🟩 проверено

История отдает 50 строк: [`src/chat-durable.mjs#L210`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L210). Более ранние строки показываются кнопкой `Earlier messages`: [`production/chat/40-messages.js#L881`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L881). Прокрутка ленты запрашивает предыдущую страницу у верхнего края: [`production/chat/40-messages.js#L1061`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1061).

Строки с номером не выше `joined` сервер в личную историю не кладет: [`src/chat-durable.mjs#L206`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L206). Это отдельный пункт D13.

**Рекомендация.** Когда лента докручена до верха и `more` истинно, клиент сам запрашивает предыдущую страницу. Кнопка остается на случай, если запрос не стартовал.

**Нельзя задеть.** Обновление нижней страницы при переподключении и сохранение позиции, если пользователь не у нижнего края: [`production/chat/40-messages.js#L972`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L972).

**Проверка.** При `more === true` и прокрутке к верху уходит запрос `history` с `before` равным первому id. Повторный вызов на той же позиции не шлет второй запрос, пока первый не закончился.

**Сообщение коммита:** `Loaded earlier chat messages when the timeline reached the top.`

---

## D10. Поле ввода закрыто на все время отправки

🟩 проверено

На время `transmit` кнопка отправки выключается сразу: [`production/chat/40-messages.js#L1080`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1080). Ответ ждется до 20 секунд: [`production/chat/20-connection.js#L127`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L127). Пока ответа нет, новый текст не ввести. Повторный `send` и так отсекается флагом `busy`: [`production/chat/40-messages.js#L1144`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1144).

**Рекомендация.** Поле остается доступным. Кнопка отправки остается выключенной, пока `busy` истинно.

**Нельзя задеть.** Очистку поля только после успеха и только если текст поля все еще равен отправленному: [`production/chat/40-messages.js#L1107`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1107).

**Проверка.** Во время ожидающей отправки `composer.disabled` ложен, `msgSend` выключен. После успеха прежнее поведение очистки сохраняется.

**Сообщение коммита:** `Left the chat composer editable while a send is in flight.`

---

## D11. Значок Retry сам ничего не отправляет

🟩 проверено

Неудачная отправка рисует подпись Retry: [`production/chat/40-messages.js#L265`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L265). Повтор вызывает только снимок через `flushUnacked`: [`production/chat/20-connection.js#L249`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L249). Нажатие на значок вызывает повтор: [`production/chat/40-messages.js#L1143`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1143).

**Рекомендация.** Нажатие на `.msg-receipt` у сообщения с `failed` вызывает `flushUnacked`, если `busy` ложен.

**Нельзя задеть.** Повтор с тем же `clientKey` из пункта D4. Этот пункт можно делать вместе с D4 одним `do`.

**Проверка.** После сбоя нажатие на значок снова вызывает `request('send')` с прежним `clientKey`.

**Сообщение коммита:** `Retried a failed chat send from its receipt control.`

---

## D12. Следующее личное сообщение до согласия отклоняется

🟩 проверено

Первая отправка в незащищенный личный чат ставит согласие `pending`, если принимающий еще не может ответить согласием: [`src/chat-durable.mjs#L265`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L265). Следующая отправка того же человека падает, пока состояние не `accepted`: [`src/chat-durable.mjs#L95`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L95). Текст отказа: `Wait for this person to accept your message request.` Поле показывает его до отправки: [`production/chat/30-rooms.js#L309`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L309).

На экране это выглядит как потерянное сообщение. Защищенный чат группы и круга этим правилом не закрывается: [`src/chat-durable.mjs#L87`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L87).

**Рекомендация.** Пока согласие `pending` и запрос отправил сам актер, поле ввода показывает этот текст до нажатия Send. Серверный отказ остается.

**Нельзя задеть.** Блокировку, отказ `rejected` и запрет отправки ученику в круг, где писать могут только админы.

**Проверка.** При `state === 'pending'` и `requestedBy` равном актеру поле показывает ожидание до отправки. Защищенная комната этот текст не показывает.

**Сообщение коммита:** `Showed the pending chat request before the next send.`

---

## D13. Вернувшийся ученик теряет старые личные сообщения группы

🟩 проверено

Новый ученик по-прежнему не видит личные сообщения группы до своего входа. На карточке, рядом с `Reassign group`, есть галочка `Show earlier group messages`: [`client/10-admin.js#L980`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L980). Она уходит один раз вместе с назначением: [`client/40-account.js#L538`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L538).

Если галочка стоит, порог `joined` этого ученика в группе становится 0, а отметка прочтения остается на последнем сообщении: [`src/chat-durable.mjs#L157`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L157). Пока ученик активен, повторное сохранение порог не двигает. Если его уберут и добавят снова, галочка снова снята.

Одобрение заявки, круг, учебные сообщения и `clear-history` не менялись. История по-прежнему режется порогом: [`src/chat-durable.mjs#L205`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L205).

Этот пункт меняет, кто видит прошлые сообщения. Его не начинать вместе с остальными, пока не будет отдельного подтверждения.

**Рекомендация.** После отдельного `do` решить одно из двух: оставить порог и прямо писать на экране, что видна история с момента возвращения, или не сдвигать `joined` у ученика, который уже был в этой комнате.

**Нельзя задеть.** Очистку истории командой `clear-history` и учебные сообщения.

**Сообщение коммита:** зависит от выбранного варианта и пишется перед правкой.

---

## D14. Отчет группы проверяет несуществующие роли

🟩 проверено

Если вызов не передал категорию, клиент считает сотрудника по `ADMIN`, `DEVELOPER` и `isTeacher()`: [`production/chat/90-settings.js#L955`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L955). В сессии есть `USER`, `ADMIN` и `DEVELOPER`. Без `options.category` и без `isTeacher()` отчет ученика уходит как `personal`.

Календарь сейчас передает категорию сам. Прямой вызов `sendGroupChatMessage` без категории по-прежнему попадает в эту ветку.

**Рекомендация.** Сотрудника определять по `ADMIN`, `DEVELOPER` и уже существующей `isTeacher()`. Имена `TEACHER` и `LEAD_INSTRUCTOR` убрать. Категорию календаря не менять.

**Нельзя задеть.** Маршрут отсутствия `/api/groups/absence`.

**Проверка.** Вызов без категории от `ADMIN` отправляет `learning`. Вызов от `USER` отправляет `personal`. Вызов с явной категорией сохраняет ее.

**Сообщение коммита:** `Sent staff group reports as learning messages.`

---

## L1. Импорт PDF не сохраняет большой выбор разделов

🟩 проверено

Два клиентских отказа на экране material у `teacher_yester`, роль `ADMIN`. Запрос на сервер не уходил.

- `00ee751b02a0bbd0862bf52db8ce6b55`, два раза, 07 Nov 2026, 01:03. Текст: `Selected content is too large for one save. Apply fewer sections.`
- `b280759a63fbd7ac7c074233ea361326`, один раз, 07 Nov 2026, 01:42. Текст: `The lesson would exceed 200 blocks. Select fewer sections.`

Выбор теперь пишется пакетами не длиннее 58000 байт: [`client/52b-lesson-pdf-import.js#L38`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L38). Вызов после подготовки карточек: [`client/52b-lesson-pdf-import.js#L1395`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1395). Один блок, который сам длиннее 58000 байт, по-прежнему останавливает сохранение тем же текстом.

До Apply абзац `#lmPdfBlockBudget` показывает занятые блоки и остаток: [`client/52b-lesson-pdf-import.js#L851`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L851). Счет считает [`client/52b-lesson-pdf-import.js#L14`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L14). Если после сборки черновика блоков больше 200, сохранение не вызывается: [`client/52b-lesson-pdf-import.js#L1393`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1393).

Сервер по-прежнему отвергает урок длиннее 200 блоков: [`src/learning-study.mjs#L297`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L297).

**Нельзя задеть.** Разбор PDF, карточки словаря, оповещение о пропущенном правиле Grammar и публикацию урока.

**Проверка.** Выбор, который в одном JSON больше 58000 байт, сохраняется несколькими пакетами, пока итог не выше 200 блоков. Выбор, который делает урок длиннее 200 блоков, не вызывает сохранение и показывает занятый и свободный остаток.

**Сообщение коммита:** `Saved a large PDF lesson import in bounded batches.`

---

## L2. Публикация экзамена требует баллы у Answer отдельно от Task

🟩 проверено

`467217076178f02171fee47a6fe57512`. `POST /api/exams` ответил 400: `Set Maximum points explicitly for Answer.` Аккаунт `teacher_yester`, роль `ADMIN`, экран material, 07 Nov 2026, 01:30. Экзамен `C2 Exam`, группа 24. До этого те же `POST /api/exams` для черновика отвечали 200.

В теле у Task1 стоит `maxPoints` `3`. У блока Answer `answerEnabled` истинно, `maxPoints` пустая строка, `assignmentKey` указывает на Task1.

Черновик по-прежнему пропускает пустые баллы: [`src/learning-exams.mjs#L231`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs#L231) вызывает проверку с `allowIncomplete`, пока блок не опубликован. Публикация эту уступку снимает. Пустые баллы дают отказ: [`src/exam-scoring.mjs#L53`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs#L53). Баллы Task1 на Answer не копируются.

До запроса Publish редактор ищет тот же пропуск и ведет к полю Maximum points: [`client/main/exam-workflow.js#L2`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js#L2), вызов [`client/main/main-hooks.js#L1107`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L1107), поле [`client/main/exam-workflow.js#L13`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js#L13). Серверный отказ 400 остается.

**Рекомендация.** Перед публикацией редактор проверяет то же правило и ведет к пустому полю Maximum points блока Answer. Серверный отказ остается. Баллы Task1 сами на Answer не копируются: у Answer должно быть свое явное число.

**Нельзя задеть.** Сохранение черновика, режим `allowIncomplete` для неопубликованного блока, типы квизов и предел баллов `1e12`.

**Проверка.** Неопубликованный блок с пустыми баллами Answer сохраняется. Публикация того же блока без баллов Answer получает 400. Редактор до запроса показывает, какому блоку не хватает баллов.

**Сообщение коммита:** `Pointed exam publish at an Answer block that has no points.`

---

## L3. Назначение экзамена ученику 10 отвечает Student not found

🟩 проверено

`5f433eaf4d8023e2a9f27d4cf98d878b`. `POST /api/exams/assign` три раза ответил 404 `Student not found.` Аккаунт `teacher_yester`, роль `ADMIN`, экран exams, 07 Nov 2026, с 01:31 до 01:45. Тело: `examId` `188134573829690`, `groupId` `24`, `studentId` `"10"`.

Справочник ученика теперь сравнивает `String(user.id)` с `targetId`: [`src/learning-messages.mjs#L250`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L250). Число `10` и строка `"10"` находят одну запись. Чужой роли ответ `This account is not a student.`: [`src/learning-messages.mjs#L252`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L252). Неактивный ученик при назначении из подгруппы получает `This student account is inactive.`: [`src/learning-messages.mjs#L253`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L253).

Назначение на всю группу осталось на [`src/learning-messages.mjs#L244`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L244). Проверка публикации осталась на [`src/learning-messages.mjs#L242`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-messages.mjs#L242).

**Рекомендация.** Сравнивать идентификатор через `String` с обеих сторон. Если аккаунт найден, но он не `USER` или не активен, ответ называет эту причину, а не отсутствие ученика.

**Нельзя задеть.** Назначение на всю группу, проверку опубликованного экзамена и перенос экземпляров экзамена.

**Проверка.** Ученик с числовым id `10`, ролью `USER` и членством в группе 24 назначается. Строка `"10"` и число `10` находят одну запись. Неактивный ученик получает отказ с причиной неактивности.

**Сообщение коммита:** `Matched exam assignment students when their ids differ by type.`

---

## L4. Дневной квиз отвечает по карточке, которую ученик не может прочитать

🟩 проверено

`01102c71c0b8ee869a93d9048f7d98c4`. `POST /api/cards/3653/answers` ответил 404 `Card not found.` Аккаунт `teacher_1345`, роль `USER`, экран dayq, 07 Nov 2026, 01:08. Тело: `quizType` `FSRS Flashcard`, `correct` true, `expectedRevision` 0. До этого квиз уже показал карточку: в следе есть `dayStart` и `dayFsrsGrade`.

Перед стартом очередь оставляет только карточки, которые `GET /api/me/cards/dictionary` вернул этому ученику: [`client/03g-core.js#L91`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L91), вызов [`client/03g-core.js#L1433`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1433). Отбор: [`client/03g-core.js#L76`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L76).

Если оценка все же получает 404, запись снимается с очереди и тот же запрос не повторяется: [`client/main/main-bridge.js#L512`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L512), [`client/main/main-bridge.js#L566`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L566). Экран убирает карточку и пишет `This card is no longer available.`: [`client/03g-core.js#L1993`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1993).

`cardAccess` не менялся: [`src/learning-study.mjs#L34`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L34). Запись ответа по-прежнему идет через `readableCard`: [`src/learning-study.mjs#L456`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L456).

**Рекомендация.** В очередь дня попадают только карточки, которые `GET` карточки для этого ученика возвращает. Если оценка все же получает 404, квиз убирает эту карточку из очереди и показывает, что она больше не доступна. Правило `cardAccess` не ослабляется.

**Нельзя задеть.** Типы квизов, ревизию прогресса и запись правильного ответа для карточки, которую ученик читать может.

**Проверка.** Карточка, видимая ученику, принимает `FSRS Flashcard`. Карточка вне `cardAccess` не попадает в очередь. Повторный 404 по старой очереди снимает карточку с экрана и не повторяет тот же запрос.

**Сообщение коммита:** `Skipped day-quiz cards the student cannot read.`

---

## N1. Неверный код входа не всегда тратит попытку

🟩 проверено

После неверного шестизначного кода счетчик попыток пишется в том же ключе. Если эта запись не проходит, код удаляется: [`src/email-otp.mjs#L155`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L155). Следующий ввод получает `Request a new code first.` Успешная запись по-прежнему отвечает `Wrong code.` и увеличивает `attempts`: [`src/email-otp.mjs#L160`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L160).

Верный код по-прежнему принимается только при совпадении хеша: [`src/email-otp.mjs#L151`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L151). Предел `MAX_ATTEMPTS` остался 5: [`src/email-otp.mjs#L147`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/email-otp.mjs#L147). Срок 10 минут, повтор раз в 45 секунд и предел выдачи по адресу не менялись.

**Рекомендация.** Если запись увеличенного счетчика не удалась, код этого письма удаляется и следующий ввод требует новый код. Верный код по-прежнему принимается только при совпадении хеша.

**Нельзя задеть.** Срок кода 10 минут, повторную отправку раз в 45 секунд и предел выдачи по адресу.

**Проверка.** Успешная запись неверного кода увеличивает `attempts` на 1. Сбой записи дает отказ и не оставляет прежний счетчик пригодным для новой серии попыток. Верный код до предела по-прежнему входит.

**Сообщение коммита:** `Invalidated a sign-in code when its attempt counter could not be saved.`

---

## N2. Перенос старого профиля чата молчит при ошибке

🟩 проверено

`reconcileLegacyProfiles` переносит аватар, имя и строку профиля со старого id на новый: [`src/chat-worker.mjs#L37`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L37). Ошибка чтения `legacy_account_ids` больше не проглатывается и доходит до `policy`: [`src/chat-worker.mjs#L72`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L72).

Повтор переносит аватар только если у нового id его еще нет: [`src/chat-worker.mjs#L46`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L46). Имя переносится так же: [`src/chat-worker.mjs#L53`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L53). `INSERT OR IGNORE` и пропуск равных id остались: [`src/chat-worker.mjs#L57`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L57), [`src/chat-worker.mjs#L43`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L43).

**Рекомендация.** Ошибка переноса не прячется. Повторный вход снова пытается перенести только те поля, которых еще нет на новом id. Уже перенесенные поля не затираются.

**Нельзя задеть.** Условие `INSERT OR IGNORE` и пропуск пары, где старый и новый id равны.

**Проверка.** Сбой чтения `legacy_account_ids` виден вызывающему `policy`. Повтор после восстановления базы переносит аватар один раз. Второй проход не меняет уже записанный новый id.

**Сообщение коммита:** `Surfaced chat profile migration failures instead of ignoring them.`

---

## N3. Подпись ADMIN в шапке зависит от начала логина

🟩 проверено

Роль `ADMIN` больше не подписывается Teacher из-за начала логина. Подпись Teacher ставится, если id есть в `teacherIds` группы: [`client/20a-user-profile-pill.js#L82`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L82), вызов [`client/20a-user-profile-pill.js#L100`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L100). `ADMIN` без назначения видит Support. `DEVELOPER` остается Support: [`client/20a-user-profile-pill.js#L96`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L96). `USER` остается Student: [`client/20a-user-profile-pill.js#L108`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L108).

`isTeacher()` не менялась.

**Рекомендация.** Подпись Teacher ставить по назначению в группы, а не по префиксу логина. `DEVELOPER` по-прежнему Support. `USER` по-прежнему Student.

**Нельзя задеть.** Проверки `isTeacher()` и списки групп.

**Проверка.** `ADMIN`, назначенный учителем группы, видит Teacher даже если логин не начинается на `teacher`. `ADMIN` без групп видит Support. `USER` видит Student.

**Сообщение коммита:** `Labeled admin accounts from their group assignment.`

---

## N4. Счет учеников группы не сводит число и строку

🟩 проверено

Список людей группы приводит id к строке: [`client/53-group-directory.js#L22`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L22). Живой счет теперь берет те же строки: [`client/53-group-directory.js#L29`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L29). Число `10` и строка `"10"` входят в счет. Скрытый, неактивный и отозванный ученик в счет не входят. Отбор учителей по ролям `ADMIN` и `DEVELOPER` не менялся: [`client/53-group-directory.js#L23`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L23).

**Рекомендация.** В счет передавать те же строковые id, что и в список. Условия `active`, `hidden` и `revoked` не ослаблять.

**Нельзя задеть.** Отбор учителей по ролям `ADMIN` и `DEVELOPER` в том же списке.

**Проверка.** Ученик с числовым id в одной выдаче и строковым id в другой входит в счет своей группы. Скрытый и неактивный ученик в счет не входит.

**Сообщение коммита:** `Counted group students when their ids differ by type.`

---

## Порядок

1. D1, затем D2. Пока сокет рвется, прочтение не доходит, и цифра на списке не гаснет.
2. V1, V2, V7, V3. Сессия, запасной запрос статистики и блокировка входа.
3. V4, V5, V6. Поиск, незапечатанный текст, чужой профиль.
4. D3 и D4. Пропажа события группы и вторая копия сообщения.
5. D5 и D6. Стороны личного чата и запись времени. D8 можно присоединить к D5 отдельным подтверждением.
6. D7, D9, D10, D11, D12, D14.
7. D13 только после отдельного решения, что делать со старой историей вернувшегося ученика.
8. L1, L2, L3, L4. Это уроки, импорт PDF и экзамены. Их не смешивать с правками чата. Каждый ждет свой `do`.
9. N1, N2, N3, N4. Код входа, перенос профиля, подпись роли и счет учеников. Каждый ждет свой `do` и не тянет за собой соседние пункты.

Отдельный Worker для чата не создается.
