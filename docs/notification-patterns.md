# Паттерны нотификаций Lumiscia

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Реализация имеет право менять только файлы из блока «Сделать». Запрещено менять чат, тексты календаря, `.ics`, Telegram, Firebase, расхождение сроков оплаты, караоке, словари, грамматику, экзамены, воркбенч, авторизацию и сессии. В `scheduled` разрешено только дописать вызов рассылки напоминаний. Существующую чистку сессий, сброс чата и воркбенч не менять.

Сделано: в документ добавлены Скриншот 2, Скриншот 3 и однозначное задание на сборку. Код приложения в этой правке не менялся. Тесты и сборка не запускались.

Проверка этой правки документа: нет. Arguments: нет. Environment: нет.

Строка коммита: `Specified notification windows, reminder API, and implementation limits.`

Разделы 1–5 и 9 — справочник текущего кода. Их тексты не переписывать и не «исправлять». Задание на код — только этот блок и разделы 6–7.

## Сделать

Файлы:

1. Правка [client/20b-lesson-notifications.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20b-lesson-notifications.js).
2. Новый `client/20c-my-reminders.js`. Сборка `npm run build:preview` сама берет `client/*.js` по имени. `preview.js` руками не править.
3. Дописать стили только для этих двух окон в [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css). Классы окна уроков уже есть, их не переименовывать.
4. Новый `src/account-reminders.mjs`.
5. В [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) только маршрут `GET` и `POST /api/me/reminders`.
6. В [src/learning-production-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-production-worker.mjs) в уже существующий `scheduled` только дописать вызов рассылки. Новый cron не добавлять: в [wrangler.toml](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/wrangler.toml#L76) уже стоит `crons = ["*/5 * * * *"]`.
7. Из окна уроков удалить карточки `Scheduled Class Today`, `Lesson Material Today` и `Lumiscia Studio Updated`. На Скриншоте 2 их нет.

Новые тесты:

- `test/test-lesson-notifications.mjs`
- `test/test-my-reminders.mjs`
- `test/test-lesson-notifications-ui.mjs` по образцу [test/test-notification-sounds-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-notification-sounds-ui.mjs)

После кода выполнить ровно эти команды:

```
npm run build:preview
node ops/build-learning-production-assets.mjs
node --test test/test-lesson-notifications.mjs test/test-my-reminders.mjs test/test-lesson-notifications-ui.mjs
```

Полный набор тестов не запускать. `production/chat.js` и `preview.js` руками не редактировать.

## Не трогать

- `window.sendGroupChatMessage`, `window.sendDirectChatMessage`, тексты разделов 3 и 9.
- `GET /api/groups/calendar.ics`, `GET /api/groups/schedule.ics`, `GET /api/groups/payment-deadline.ics`.
- Расхождение сроков оплаты: форма помнит 3 дня, 1 день, 4 часа и 1 час, запасной текст чата говорит 2 дня, 1 день и 1 час, файл `.ics` пишет `-P2D`, `-P1D`, `-PT1H`. Это не чинить в этой задаче.
- Telegram и Firebase. Раздел 8 оставить справкой. Пакет Firebase, service worker и VAPID не добавлять.

Имена `C2 Evening`, `Grammar Unit 4`, число `4` и дата `2026-11-18` на макетах — образец данных. В код их не вшивать.

Часы везде `Europe/Minsk`. Запас `18:30` для колокольчика и письма не подставлять: нет `startTime` — карточку и письмо этого урока пропустить.

Таймеры и `dueToday` считать только для вошедшего `authUser`. Если задан `viewAccount`, таймеры не ставить и чужой счет не показывать. Карточку квиза и письмо квиза слать только при роли `USER`.

## Скриншот 2

Скриншот 2. Окно `Lesson Notifications` после правки.

![Скриншот 2: Lesson Notifications после правки](notification-patterns-screenshot-2.jpg)

Скриншот 2. Бейдж `3 active` в этом кадре потому, что живы три карточки. В коде бейдж равен числу живых карточек: `1 active` или `{N} active`. Ноль живых карточек: бейдж `All read` и одна строка `No active reminders.`

Порядок карточек: сначала урок за 15 минут, затем урок за 1 час, затем квиз. Оба урока видны вместе только если сигнал за час уже наступил, до старта осталось не больше 15 минут и карточка за час не закрыта кнопкой `Mark all as read`.

Подпись тумблера урока на Скриншоте 2 обязательна дословно: `Receive an alert 1 hour and 15 minutes prior to class`.

Скриншот 2 не показывает кнопку входа во второе окно. Ее добавить в подвал слева от `Mark all as read`. Текст кнопки: `My reminders`. Она открывает окно Скриншота 3.

## Скриншот 3

Скриншот 3. Окно `My reminders`.

![Скриншот 3: окно My reminders](notification-patterns-screenshot-3.jpg)

Скриншот 3. Заголовок `My reminders`. Блок `REMIND ME ABOUT`: четыре флажка. Блок `SEND TO`: почта и открытое приложение. Блок `SAVED`: уже сохраненные строки. Кнопки `Cancel` и `Save reminder`.

Флажок `Email` на Скриншоте 3 включен как пример уже сохраненной записи. Первый заход без записи на сервере: `Email` выключен, `In the open app` включен, три первых предмета включены, `Custom note` выключен.

Адрес под `Email` только из профиля, поле ввода для адреса не делать. Пока `Custom note` выключен, дата, время и текст видны и неактивны. Текст-заполнитель поля: `Reminder text`.

Пилюли сохраненных строк: `Email + app`, `Email`, `App`. Строка без обоих каналов в список не попадает.

---

## Скриншот 1

Скриншот 1. Текущее окно `Lesson Notifications` до доработки.

![Скриншот 1: окно Lesson Notifications](notification-patterns-screenshot-1.png)

Скриншот 1. Шапка `Lesson Notifications`, бейдж `2 active`, две карточки `Vocabulary Review Ready` и `Lumiscia Studio Updated`, три тумблера, кнопки `Mark all as read` и `Done`.

Открытие: пункт меню профиля `data-profile-action="notifications"` вызывает `window.openLessonNotifications()` в [client/20a-user-profile-pill.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L353).

---

## 1. Куда сейчас уходит сигнал

Веб-пуша в репозитории нет. Поиск `firebase`, `FCM`, `PushManager`, `serviceWorker.register`, `VAPID` по `*.js`, `*.mjs`, `*.json`, `*.toml`, `*.html` дал ноль совпадений. Пока браузер закрыт, страница ничего не показывает.

| Канал | Куда | Когда срабатывает |
|---|---|---|
| Групповой чат | комната группы, категория `learning` или `personal` | учитель или ученик отправил текст из календаря |
| Личный чат | комната ученика, категория `learning` | счет и личный журнал |
| Системное уведомление браузера | `new Notification` | вкладка скрыта, разрешение есть, чат не замьючен, сообщение чужое |
| Звук чата | `NotificationSounds.playFor(room.sound)` | новое чужое сообщение, окно чата живо |
| Колокольчик уроков | модалка на странице | пользователь открыл окно; сервер ничего не шлет |
| Файл `.ics` | календарь телефона или Google Calendar | пользователь сам добавил событие |
| Почта `env.EMAIL.send` | ящик пользователя | только код входа, сброс пароля, passkey |
| Telegram | чаты разработчика | CI и отзыв с сайта, не ученик |

Категория `learning` в интерфейсе чата подписана `Study alerts`. Категория `personal` подписана `Personal`. Строка подписи: [production/chat/30-rooms.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L58).

---

## 2. Как слать в чат

Группа: `window.sendGroupChatMessage(groupId, text, options)` в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L973).

1. Если сессии нет, функция выходит.
2. Если сокет не готов, вызывается `connect()` и ожидание до 20 шагов по 100 мс.
3. Сокет: `open` с `{ kind: 'group', groupId }`.
4. Сокет: `send` с `{ roomId, category, clientKey, text }`.

Категория группы: [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L969). Если в `options.category` передана строка, берется она. Иначе роль `ADMIN` или `DEVELOPER`, либо учитель, дает `learning`. Остальные дают `personal`.

Лично: `window.sendDirectChatMessage(accountId, text, options)` в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L1005). Сокет: `open` с `{ kind: 'direct', accountId }`, затем `send`. Категория по умолчанию `learning`.

Календарь, который обязан получить ответ сокета: `dispatchCalendarChat` в [client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L13). Пустой ответ бросает `Message dispatch unconfirmed`.

Расписание урока и счет глотают ошибку отправки: [client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2199) и [client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1253).

Системное уведомление чата: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L63).

Условия одновременно:

- `prefs.notifications !== false`
- сообщение не свое
- чат не замьючен: архив, блок или `muteUntil` в [production/chat/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L269)
- `document.visibilityState === 'hidden'`
- `Notification.permission === 'granted'`

Текст окна браузера: заголовок `event.room.title`, тело `event.message.text.slice(0, 160)`, `tag` равен `event.room.id`.

Старт настроек: `notifications: false` в [production/chat/99-boot.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/99-boot.js#L33). Поверх кладется `localStorage` ключ `english-chat-settings:` плюс id аккаунта. Включение тумблера `Desktop notifications` зовет `Notification.requestPermission()` в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L751). Подпись тумблера: `New messages outside the active window` в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L608).

Звук: [production/chat/30-rooms.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L477). Пропуск, если статус `in_class` и категория не `learning`. Пауза между звуками 400 мс. Повтор того же id глушится ключом `english-chat-alert:`.

---

## 3. Тексты, которые уже шлет календарь

### 3.1 Объявление урока в группу

Функция `postLessonAlertToChat` в [client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L2115). Категория не передается, ее выбирает роль отправителя.

```
📅 CLASS SCHEDULE ANNOUNCEMENT
Group: {group}
Date: {Weekday}, {YYYY-MM-DD}
Time: {HH:MM} – {HH:MM} ({N} min)
Material: {title}
Period: {period}

👉 Students, please add this lesson to your calendar so you do not miss it:
• [📅 Add to Google Calendar]({url})
• [📥 Download .ics Reminder]({url})

🔔 Reminders are preconfigured to notify you 1 hour and 15 minutes before the lesson.
```

Перенос: первая строка `⚠️ SCHEDULE UPDATE: Lesson Rescheduled`. Строка `Material` есть только если заголовок материала не пустой.

`{period}`:

- `month` → `Current Month (Weekly)`
- `academic_year` → `Academic Year (Weekly Sep – May)`
- `custom` → `Custom Period`
- остальное → `Single Session`

### 3.2 Отчет расписания в группу, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3797).

```
📅 Schedule Report: {group} ({Month Year})
Scheduled lessons: {N} | Scheduled exams: {N}

Schedule:
• {Wed}, {Nov} {15} · {18:30} – {19:30} · {title}

👉 Add schedule to your calendar:
• [📅 Add to Google Calendar]({url})
• [📥 Download .ics Calendar File]({url})
```

Пустой месяц: `No sessions scheduled for this month.`

### 3.3 Счет лично ученику, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1195).

```
⚠️ Tuition Payment Reminder · Study alerts
Hello, {name}! This is a reminder regarding tuition for {Month Year}.

• Deadline: {YYYY-MM-DD} {HH:MM}
• Total Due: {amount} {currency}
• Classes Completed: {attended} of {total} (ended {YYYY-MM-DD})
• Status: Paid | Pending

Payment Requisites:
{text}

👉 Add payment deadline to your calendar:
• [📅 Add to Google Calendar]({url})
• [📥 Download .ics Reminder]({url})

• [✅ I have paid ({amount} {currency})]({origin}/?action=confirm-payment&groupId={id}&month={YYYY-MM}&studentId={id})
```

Хвост `(ended …)` есть только если известна дата последнего урока месяца.

### 3.4 Счет в группу, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1222). Суммы учеников в этот текст не входят.

```
💳 TUITION INVOICE & PAYMENT DETAILS
Group: {group}
Billing Month: {Month Year}
Payment Deadline: {YYYY-MM-DD} {HH:MM}

📢 Individual invoices and attendance breakdowns have been dispatched privately to each student in their Study alerts chat.

Payment Requisites:
{text}

👉 Add payment deadline to your calendar:
• [📅 Add to Google Calendar]({url})
• [📥 Download .ics Reminder]({url})

{bell line}

👉 Students: After completing payment, please click «I have paid» in the Group Calendar widget to notify the teacher.
```

Строка колокольчика, ровно одна:

- последний урок в последний день месяца: `🔔 Note: Since the last lesson falls on the last day of the month, the bill is issued on the 1st of the next month with same-day notice.`
- список правил не пуст: `🔔 Reminder alerts scheduled: {3 days}, {1 day}, {4 hours}, {1 hour} before deadline.`
- список пуст: `🔔 Reminder alerts are preconfigured at 2 days, 1 day, and 1 hour before the payment deadline.`

Три места хранят разное время оплаты:

1. Форма по умолчанию: 3 дня, 1 день, 4 часа, 1 час. [client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1286).
2. Запасной текст чата: 2 дня, 1 день, 1 час.
3. Файл оплаты `.ics` без конца месяца: `-P2D`, `-P1D`, `-PT1H`. Конец месяца: только `-PT1H`. [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L778).

### 3.5 Подтверждение оплаты в группу

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1982). Категория не передается.

```
✅ PAYMENT CONFIRMATION: Student {name} confirmed tuition payment of {amount} {currency} for {YYYY-MM}.
```

### 3.6 Отсутствие в группу, категория `personal`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1839).

```
📢 Absence Notice: {name}
Date: {YYYY-MM-DD}
Lesson: {title}
Time: {HH:MM}
Reason: {text}
```

`Time` есть только если время урока известно. Пустая причина: `Reason: Not specified`.

### 3.7 Личный журнал, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3889).

```
📋 Personal Attendance Journal: {group} ({Month Year})
Student: {name}
Attendance: {pct}% ({pres} attended, {abs} missed of {marked})

Your Sessions:
• {Wed}, {Nov} {15}: Present ✅
• {Wed}, {Nov} {15}: Absent ⚠️
```

Пустой список: `No sessions recorded yet.`

### 3.8 Журнал группы, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3909).

```
📋 Attendance Journal: {group} ({Month Year})
Sessions held: {marked} of {scheduled} | Average Presence: {pct}%

Session Records:
• {Wed}, {Nov} {15}: {pct}% ({pres} present · Absent: {names})
```

Нет отсутствующих: `All present`. Пустой журнал: `No session records found.`

### 3.9 Статистика группы, категория `learning`

[client/53a-group-calendar.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3952).

```
📊 Group Statistics: {group} ({Month Year})
Total Lessons: {N} | Total Exams: {N} | Students: {N}
Group Attendance: {pct}% ({attended} attended, {missed} missed)

Attendance Rankings:
1. {name} — {pct}% ({pres} attended, {abs} missed of {lessons})
```

---

## 4. Будильники календаря, не страница

Урок, один день: `GET /api/groups/calendar.ics` в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L696).

- `DTSTART;TZID=Europe/Minsk`
- `DESCRIPTION:Reminder: Lesson in 1 hour` и `TRIGGER:-PT60M`
- `DESCRIPTION:Reminder: Lesson in 15 minutes` и `TRIGGER:-PT15M`
- `ACTION:DISPLAY`

Месяц целиком: `GET /api/groups/schedule.ics` в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L830). На каждую дату урока те же два `VALARM`. Время берется из `scheduleData[date].startTime`, запас `18:30`, длина запас 60.

Эти будильники звонят в приложении календаря после того, как человек скачал файл или открыл ссылку Google. Страница Lumiscia их не исполняет.

Оплата: `GET /api/groups/payment-deadline.ics`. Тексты будильника:

- `Reminder: Tuition payment due in 2 days` / `TRIGGER:-P2D`
- `Reminder: Tuition payment due tomorrow` / `TRIGGER:-P1D`
- `Reminder: Tuition payment due in 1 hour` / `TRIGGER:-PT1H`
- конец месяца: `Reminder: Tuition payment due today` / `TRIGGER:-PT1H`

Правила формы 3 дня / 1 день / 4 часа / 1 час в этот файл не попадают.

---

## 5. Окно Lesson Notifications сейчас

Так окно работает до правки. После правки список карточек задает раздел 6, не этот раздел.

Файл [client/20b-lesson-notifications.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20b-lesson-notifications.js#L1). Список собирается на клиенте в `getActiveNotifications`. Серверного списка нет.

Карточки, которые окно ставит само:

| id | title | desc | badge |
|---|---|---|---|
| `lesson-today-{id}` | Scheduled Class Today | `{group} has an active session scheduled for today.` | Today |
| `material-today-{id}` | Lesson Material Today | `{material} is assigned for today.` | Today |
| `fsrs-review-card` | Vocabulary Review Ready | `Spaced repetition cards are queued for retention practice.` | Review |
| `system-v240` | Lumiscia Studio Updated | `Version 2.4.0 active: improved isolated workbench and unified profile bar.` | v2.4.0 |

Урок на сегодня ищется в `classGroups` по `date === today` и `hidden` ложь. Если урока нет, ищется материал в `lmLibrary.materials` с той же датой. Карточки `fsrs-review-card` и `system-v240` добавляются всегда, даже при нуле должных карточек. Число `dueToday` это окно не читает.

Тумблеры пишутся в `localStorage` и на список не влияют. Функция `getNotificationSettings` вызывается только чтобы нарисовать галочки.

| Тумблер на Скриншоте 1 | Ключ | Старт | Подпись сейчас |
|---|---|---|---|
| Lesson start reminders | `lumiscia-notify-lesson-reminders` | включен, пока значение не `false` | `Receive an alert 15 minutes prior to class` |
| Daily word review | `lumiscia-notify-daily-review` | включен, пока значение не `false` | `Spaced repetition queue alerts for retention` |
| Audio alert sounds | `lumiscia-notify-sound` | выключен, пока значение не `true` | `Play notification tone for timely awareness` |

`audioAlerts` нигде не вызывает `NotificationSounds`. Таймера на 15 минут в этом файле нет. Метка «прочитано»: `lumiscia-notify-read-ts`. Если метка моложе 24 часов, бейдж показывает `All read` и прячет `.popover-notify-dot`.

Живой счет квиза уже есть в другом месте. `GET /api/error-bank?action=stats` в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1017) возвращает `dueToday`. Счет: активные строки `account_error_items` с `next_review_at <= now` в [src/learning-error-bank.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-error-bank.mjs#L499). Домашняя карточка ученика читает это поле в [client/57a-dashboard.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/57a-dashboard.js#L17) и пишет бейдж `{N} due` или `All clear`. Колокольчик эту карточку не использует.

---

## 6. Правила карточек окна со Скриншота 2

Живые карточки только трех видов. Старые id `lesson-today-*`, `material-today-*`, `fsrs-review-card` и `system-v240` удалить.

Урок. Источник времени на открытой вкладке: `scheduleData[date].startTime` и `durationMinutes` уже загруженного календаря группы вошедшего пользователя. Конец: старт плюс `durationMinutes`. Нет `startTime` — карточки нет. Группа: `classGroups`, не скрытая, пользователь в ней. Заголовок группы: `title`. Строка материала: название материала по `scheduleData[date].materialId`, если название уже есть в памяти страницы. Нет названия — третью строку не рисовать.

Id карточек: `lesson-{groupId}-{YYYY-MM-DD}-60` и `lesson-{groupId}-{YYYY-MM-DD}-15`.

Показ:

- Сейчас раньше, чем старт минус 60 минут: уроковых карточек нет, таймер на старт минус 60 минут стоит.
- Сейчас от старта минус 60 минут до старта минус 15 минут: видна только карточка за час.
- Сейчас от старта минус 15 минут до старта: видны обе, если карточку за час не закрыли.
- Сейчас равно старту или позже: обеих нет.

Текст карточки за час:

```
Lesson in 1 hour
{group}
{Weekday}, {YYYY-MM-DD} · {HH:MM} – {HH:MM}
{material}
```

Текст карточки за 15 минут: заголовок `Lesson in 15 minutes`, остальные строки те же. Бейдж обеих: `SOON`.

Тумблер `Lesson start reminders` выключен: уроковые карточки не рисовать и таймеры не ставить. Подпись тумблера заменить на строку со Скриншота 2.

Квиз. Запрос `GET /api/error-bank?action=stats`. Поле `dueToday` из [src/learning-error-bank.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-error-bank.mjs#L519). Роль не `USER`, ошибка сети или `dueToday` равен 0: карточки нет. Старое предложение `Spaced repetition cards are queued for retention practice.` не оставлять.

Id: `quiz-{YYYY-MM-DD}` по дате `Europe/Minsk`. Заголовок `Vocabulary Review Ready`. Бейдж `REVIEW`. Строки:

```
{N} cards are due for spaced repetition.
Open Smart Quiz to review them.
```

Тумблер `Daily word review` выключен: карточку квиза не рисовать и запрос для окна не слать.

Звук и системное окно отдельно от списка. Список виден при каждом открытии, пока карточка жива. Звук и `Notification` срабатывают один раз на id.

Ключ звука урока: `lumiscia-notify-fired:{accountId}:{cardId}`. Ключ квиза: `lumiscia-notify-quiz-fired:{accountId}:{YYYY-MM-DD}`. Квиз звенит снова в те же сутки, если новое `dueToday` больше числа, записанного рядом с ключом.

Звук: `NotificationSounds.play()` и только при включенном `Audio alert sounds`. Каталог звуков не открывать и `playFor` не звать.

Системное окно: `new Notification(title, { body, tag: cardId })`. Звать только если `window.Notification.permission === 'granted'` и `document.visibilityState === 'hidden'`. `requestPermission` из этих окон не звать. Разрешение остается у тумблера чата `Desktop notifications`.

`Mark all as read` пишет `lumiscia-notify-read-ts` и скрывает карточки, чье время сигнала раньше этой метки. Карточка урока за 15 минут остается, если ее минута позже метки. Квиз после этой кнопки скрыт и появляется снова в те же сутки только если `dueToday` стало больше числа, записанного в момент прочтения. Старое правило «бейдж All read на 24 часа независимо от новых карточек» удалить. Зеленая точка `.popover-notify-dot` видна, пока есть хотя бы одна живая карточка.

Закрытая вкладка колокольчик не рисует. Письмо уходит только из раздела 7 и только если у записи включен `email`.

## 7. Окно Скриншота 3, запись и почта

Окно открывается кнопкой `My reminders`. Закрытие: `Cancel`, крестик, фон, `Escape`. `Save reminder` шлет `POST` и закрывает окно только после ответа `200`.

Запись одна на аккаунт, в `catalog_documents`, namespace `account-reminders`, key равен id аккаунта. Новую таблицу D1 не создавать.

`GET /api/me/reminders` без записи отвечает:

```
{ "lesson60": true, "lesson15": true, "quiz": true, "custom": null, "email": false, "inApp": true }
```

`POST /api/me/reminders` принимает только эти поля. Лишний ключ: `400`. Нет сессии: `401`. `STAGE_WRITES` не `true`: `503`.

`custom` либо `null`, либо объект `{ "date": "YYYY-MM-DD", "time": "HH:MM", "text": "..." }`. Текст от 1 до 200 символов. Пустой текст при включенном `Custom note`: `400` и строка под полями `Enter the reminder text.`

Почта идет тем же `env.EMAIL.send`, что код входа в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L535). Отправитель: `env.EMAIL_FROM` или `noreply@lumiscia.org`, имя `Lumiscia`. Нет `env.EMAIL.send`: письмо пропустить, ответ `GET`/`POST` не ломать.

Окно письма, `Europe/Minsk`, без догоняющей отправки после конца окна:

- урок за час: `[старт-60 минут, старт-55 минут)`
- урок за 15 минут: `[старт-15 минут, старт-10 минут)`
- квиз: `[09:00, 09:05)`, один раз в сутки, только если `dueToday > 0`
- своя заметка: `[выбранная минута, выбранная минута + 5 минут)`

Тема и тело письма урока:

```
Subject: Lesson in 1 hour
{group}
{Weekday}, {YYYY-MM-DD} · {HH:MM} – {HH:MM}
{material}
```

Вторая тема: `Lesson in 15 minutes`. Строка `{material}` только если у урока есть название.

Квиз:

```
Subject: Smart Quiz review is ready
{N} cards are due for spaced repetition.
Open Lumiscia and start Smart Quiz.
```

Своя заметка: тема `Reminder`, тело равно `custom.text`. Отдельное поле темы не добавлять.

Повтор той же минуты не шлет письмо второй раз. Ключ отправки в namespace `account-reminder-sent`: `{accountId}:lesson-{groupId}-{YYYY-MM-DD}-60`, `{accountId}:lesson-{groupId}-{YYYY-MM-DD}-15`, `{accountId}:quiz-{YYYY-MM-DD}`, `{accountId}:custom-{YYYY-MM-DD}T{HH:MM}`.

Урок для письма искать так: `class_group_students.account_id`, затем документ `group-attendance` с ключом `{groupId}:{YYYY-MM}`, поле `scheduleData[date].startTime`. Даты — сегодня и завтра в `Europe/Minsk`. Название группы: `class_groups.title` при `deleted_at IS NULL`. Название материала: `lessons.title` по `materialId`, если строки нет — строку материала опустить.

На открытой вкладке при `inApp: true` те же карточки раздела 6 слушаются локальным таймером. Своя заметка добавляет карточку `Custom reminder` с телом `custom.text` и id `custom-{date}T{time}` с выбранной минуты до плюс 5 минут. `inApp: false` гасит локальные таймеры этого аккаунта, тумблеры Скриншота 2 не переписывает.

## 8. Firebase, не делать

Этот раздел не задание. Пакет, service worker, VAPID и запрос в FCM не добавлять.

В репозитории Firebase нет. Для открытой вкладки он не нужен: хватает таймера страницы, колокольчика и `Notification`.

Единственная роль здесь — Firebase Cloud Messaging, если сигнал должен всплыть при закрытой вкладке Lumiscia, но живом браузере.

Цепочка:

1. Проект Firebase, веб-приложение, ключ VAPID.
2. Service worker на сайте.
3. Страница просит разрешение `Notification`, получает токен, отдает токен воркеру.
4. В минуту напоминания тот же cron, что шлет почту, шлет HTTPS-запрос в FCM HTTP v1 с этим токеном.
5. Браузер показывает системное окно. Закрытый браузер токен не слушает.

Что Firebase здесь не заменяет:

- почту: уже есть `env.EMAIL.send`
- чат: уже есть сокет `send`
- колокольчик при открытой вкладке
- вход и базу: свои сессии и D1

Пока продукт только веб и сигнал нужен лишь при открытой вкладке, FCM не подключается. FCM добавляется отдельным пунктом, когда понадобится закрытая вкладка.

---

## 9. Telegram, не ученик

CI: `pipelineNotification` и `notifyTelegram` в [ops/telegram-notify.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs#L83) и [ops/telegram-notify.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs#L136). Получатели: `TELEGRAM_CHAT_ID` и `GET /api/ci/telegram-recipients`.

Отзыв сайта: [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L482). Первая строка `🐞 ОШИБКА`, `💡 ИДЕЯ / ПРЕДЛОЖЕНИЕ` или `❓ ВОПРОС`, затем автор, текст, страница, последние 5 крошек, `ID`.

Проверочный пинг: `🔔 Lumiscia Telegram Alert Test` в [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L210).

Урок, квиз и личное напоминание ученика в Telegram не слать.

---

## 10. Чеклист

- 🟩 Справочник текущих каналов и текстов
- 🟩 Скриншот 2, Скриншот 3 и задание разделов «Сделать», 6 и 7
- ⬜ Окно Lesson Notifications по Скриншоту 2 и разделу 6
- ⬜ Окно My reminders, `GET`/`POST /api/me/reminders` и письма по разделу 7
- ⬜ Тесты и команды из блока «Сделать»
- ⬜ Firebase не входит в эту задачу
