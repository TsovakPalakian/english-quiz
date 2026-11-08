# План исправления немедленной подгрузки фото профиля на стартовой странице

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей изолированной задаче. Запрещено затрагивать логику сообщений в чате, структуру Durable Objects, синхронизацию состояния уроков (`/api/me/state`), смену тем оформления, логику календаря и экзаменов. Обработка клика по аватару и открытие выпадающего меню `.user-profile-popover` должны оставаться неизменными. Все изменения строго и изолированно производятся в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js), сопровождаются сборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через `npm run build:preview` и проверяются целевыми тестами.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Причина отсутствия фото при первоначальном открытии страницы**:
   - При входе на стартовую страницу пользователь аутентифицируется через эндпоинт `/api/me` ([`client/47-account.js:171-195`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/47-account.js#L171-L195)).
   - Базовая модель пользователя из D1 (`/api/me`, [`src/worker.js:1844-1872`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js#L1844-L1872)) возвращает поля `{ id, login, email, name, role, ... }` без поля `avatarUrl`, так как аватары хранятся в подсистеме чата (`CHAT_BRIDGE` / R2 media).
   - В функции [`paintUserProfilePill()`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L119-L162) аватар берется из `user.avatarUrl || cachedAvatar`. Если в `localStorage` ключ `enquiz-user-avatar:<id>` отсутствует (новый сеанс, очищенный кэш или другой браузер), `effectiveAvatar` оказывается пустым.
   - В результате в элементе `.pill-avatar-img` синхронно отрисовываются текстовые инициалы (например, «TP», как показано на **Скриншоте 1**), но никакой фоновый сетевой запрос на проверку и подгрузку аватара на стартовой странице **не отправлялся вовсе**.

2. **Почему фото появлялось только после захода в Settings Profile**:
   - Только при переходе в настройки профиля загружался бандл чата и вызывался запрос `domain('/profile')` ([`production/chat/90-settings.js:530-533`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L530-L533)) к HTTP GET `/api/messages/profile`.
   - Ответ `/api/messages/profile` возвращал объект с актуальным `avatarUrl`. Только тогда адрес сохранялся в `profileViews` и в `localStorage.setItem('enquiz-user-avatar:' + id, url)`, а аватар в DOM обновлялся.

3. **Требование пользователя**:
   - На стартовой странице фото должно подгружаться сразу при загрузке, если оно есть у пользователя.
   - Другой функционал не трогать.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js):
    1. Добавление функции `ensureUserAvatar(user)` для немедленной асинхронной подгрузки профиля пользователя через `/api/messages/profile` при инициализации и отрисовке шапки.
    2. При наличии `avatarUrl` в ответе — сохранение в `localStorage` под ключом `enquiz-user-avatar:<id>`, выставление `user.avatarUrl` и мгновенное обновление элементов `.pill-avatar-img`, `.popover-avatar-img`, `#tabbarAvatarCircle`.
    3. При отсутствии фото — очистка устаревшей записи в `localStorage` и отображение инициалов.
    4. Предотвращение дублирующих параллельных запросов (`avatarFetchedUserId`).
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка корневого бандла командой `npm run build:preview`.
  - [`test/test-user-profile-pill-avatar-immediate-load.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-user-profile-pill-avatar-immediate-load.mjs): модульные и визуальные тесты немедленной подгрузки фото при наличии и отсутствии аватара.

- **Инварианты**:
  - Если фото уже сохранено в `localStorage`, оно мгновенно отображается при первом рендере без задержек и сдвигов интерфейса.
  - Сохраняется работа клика по кнопке профиля и выпадающей формы `.user-profile-popover` (Вариант 1).
  - Никакой сторонний функционал (уроки, карточки, темы, чат) не затрагивается.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Реализация фоновой немедленной подгрузки `ensureUserAvatar` в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js) с бесшовным обновлением DOM элементов аватара.
- 🟩 **Этап 2**: Сборка корневого бандла `preview.js` через `npm run build:preview`.
- 🟩 **Этап 3**: Написание и запуск целевых тестов на мгновенное отображение кэшированного фото и асинхронную подгрузку с сервера в [`test/test-user-profile-pill-avatar-immediate-load.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-user-profile-pill-avatar-immediate-load.mjs).
- 🟩 **Этап 4**: Прогон существующего набора тестов (`npm run check` / целевые тесты профиля).

---

## 4. Детерминированный метод верификации (Verification Method)

1. `npm run build:preview` — проверка успешной компиляции preview.js.
2. `node --test test/test-user-profile-pill-avatar-immediate-load.mjs` — проверка немедленной подгрузки аватара при чистом `localStorage`.
3. `node --test test/test-user-profile-pill-avatar-click.mjs` — проверка сохранения поведения клика и визуальных тестов Playwright.
