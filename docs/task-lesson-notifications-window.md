# Окно Lesson Notifications

<span style="color: red; font-weight: bold;">WARNING</span>
Менять только окно уведомлений урока: `client/20b-lesson-notifications.js` и стили этого окна в `site/preview.css`. Чат, календарь, `.ics`, Telegram, Firebase, караоке, словари, грамматику, экзамены, воркбенч, авторизацию и сессии не трогать. `preview.js` руками не править.

## Кадр

Шапка: колокольчик, `Lesson Notifications`, пилюля, крестик. `ACTIVE REMINDERS`: имя слева, слово стадии справа, под именем одна строка. `NOTIFICATION PREFERENCES`: одна полоса `Today`, `Reviews`, `Sound` и строка `Sound stays on this device.` Подвал: `Mark all as read`, `Done`.

Стадии: `Today` / `Class today`, `Today` / `Material today`, `Waiting` / `Waiting for review`, `Published` / `Review published`. Пилюля: `{N} active` или `All read`. Пусто: `No active reminders.` Имени нет: `Lesson group`, `Active material`, `Exam`. Цвета из `--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`.

## Функции

- 🟩 Сбор карточек. Чужой просмотр пустой. `Today` прячет занятие и материал. `Reviews` прячет `Waiting` и `Published`.
- 🟩 Клик: занятие открывает группы, материал открывает урок, `Waiting` и `Published` открывают блоки экзамена. Пилюля и точка те же.
- 🟩 `Mark all as read` ставит `All read`, прячет точку, карточки остаются. Новые id после метки снова дают `{N} active` и точку. Пустой список кнопка не меняет.
- 🟩 `Today` и `Reviews` пересчитывают пилюлю и не трогают точку и `Sound`.
- 🟩 `Sound` пишет флаг на устройство. Список, пилюля и точка те же. Сигнал не уходит.
- 🟩 Крестик, `Done`, фон и `Escape` закрывают окно. Метка и тумблеры те же.

## Проверка

```
npm run build:preview
node --test test/test-lesson-notifications.mjs test/test-lesson-notifications-ui.mjs test/test-agreed-lesson-flow.mjs
```

Arguments: нет.
Environment: нет.

Строка коммита: `Tightened the lesson notifications window and split read state from card stages.`
