# План устранения уязвимостей сессий, разграничения ключей, доступа с мобильных устройств и доработки речевого движка Speakout A1

## 1. Запрет на нецелевые модификации

> <span style="color: red; font-weight: bold;">WARNING</span>
> Запрещено затрагивать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задачи строго и изолированно задевают только свой функционал. При необходимости модификации смежных модулей (`ops/run-learning-stage.mjs` или `src/learning-integrated-worker.mjs` для обеспечения доступа с внешних хостов и планшетов) требуется предварительное уведомление и подтверждение пользователя.

---

## 2. Исходный судебно-технический анализ замечаний

### 2.1. Серверное хранение сессий и исключение подделки ролей через клиентские cookie
* **Текущее состояние в коде**:
  - [speakout/server/server.js:48-54](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L48-L54): при наличии cookie `learning_stage` роль пользователя считывается напрямую из клиентской cookie `learning_role` (`cookies.learning_role === 'teacher' ? 'teacher' : ...`).
  - [speakout/server/server.js:57-63](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L57-L63): при наличии cookie `speakout_session` роль учителя присваивается на основании клиентской cookie `speakout_role` (`cookies.speakout_role === 'teacher' ? 'teacher' : 'student'`).
  - [speakout/server/server.js:66-76](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L66-L76): заголовок `Authorization: Bearer <token>` длиной от 8 символов признается авторизованной сессией без сверки с базой данных.
  - [speakout/server/server.js:310-321](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L310-L321): `POST /api/speakout/session` генерирует случайный токен, но не сохраняет его ни в оперативной памяти, ни в SQLite.
* **Требуемое решение**:
  - Создание таблицы `speakout_sessions` в базе данных `speakout/data/speakout.db`:
    `CREATE TABLE IF NOT EXISTS speakout_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`.
  - Все активные токены сессий регистрируются на стороне сервера.
  - Функция `getSessionFromRequest(req)` производит обязательную сверку токена с таблицей `speakout_sessions`. Если токен отсутствует или срок `expires_at` истек, сессия признается недействительной (`null`).
  - Роль пользователя определяется исключительно записью в базе данных. Чтение клиентских cookie `speakout_role` и доверие к непроверенным Bearer-токенам исключаются.
  - Роль учителя (`teacher`) выдается только при совпадении переданного пароля с установленным системным паролем учителя.

---

### 2.2. Защита документов с ключами ответов (`doc=keys`)
* **Текущее состояние в коде**:
  - [speakout/server/server.js:516-522](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L516-L522): маршрут `GET /api/speakout/document?doc=keys` проверяет только факт наличия любой авторизованной сессии (`!session || !session.authenticated`).
  - Так как ученическая сессия создается свободно, полный PDF-документ книги ключей `SO3_A1_SB_AK.pdf` доступен любому ученику.
* **Требуемое решение**:
  - Перевод полного документа `SO3_A1_SB_AK.pdf` (`doc=keys`) в статус документа преподавателя с обязательной проверкой роли `teacher` или `developer` (HTTP 403 Forbidden для учеников).
  - Для интерфейса самопроверки учеников первой очереди предоставляются только проверенные ключи текущего разворота из проверенного манифеста `manifest.json`.

---

### 2.3. Сетевая доступность для мобильных устройств (iPad) и домена lumiscia.org
* **Текущее состояние в коде**:
  - [speakout/server/server.js:613](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L613): сервер слушает исключительно петлевой интерфейс `127.0.0.1`.
  - [ops/run-learning-stage.mjs:57, 117](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/run-learning-stage.mjs#L57): сервер локального стенда привязан к `127.0.0.1:8788` и проверяет условие `if (req.headers.host!==new URL(origin).host) throw new StudyError(403,'Localhost only.');`.
  - В боевом воркере [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) отсутствуют маршруты перенаправления на модуль Speakout.
* **Требуемое решение**:
  - В `speakout/server/server.js` поддержка параметра хоста через переменную окружения `HOST` (с возможностью привязки к `0.0.0.0` для доступа с iPad по локальной сети Wi-Fi).
  - Описание регламента публикации статических ассетов и настройки маршрутизации Cloudflare Worker для публичного домена `lumiscia.org`.

---

### 2.4. Источники фраз, непрерывная индикация статуса и верификация речи
* **Текущее состояние в коде**:
  - [speakout/web/app.js:28-34](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L28-L34): словарь `TRACK_MODEL_PHRASES` содержит жестко закодированные строки.
  - [speakout/web/app.js:460-462](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L460-L462): распознанный текст без фильтрации помещается в DOM.
  - [speakout/web/app.js:468-472](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L468-L472): статус движка (`Web Speech Engine • Online` / `Local Speech Engine`) выводится только в блоке 100% совпадения.
* **Требуемое решение**:
  - Загрузка эталонных текстов упражнений и транскриптов из манифеста `manifest.json`.
  - Непрерывное отображение статуса движка распознавания в шапке модального окна и в строке статуса (Скриншот 23).
  - Пословная подсветка совпадения слов и процентная шкала точности произношения.

---

## 3. Чек-лист реализации

- 🟩 27. Серверная таблица сессий `speakout_sessions` в SQLite и отказ от доверия клиентским cookie ролей.
- 🟩 28. Защита эндпоинта создания роли учителя паролем и проверка валидности токенов в базе данных.
- 🟩 29. Защита полного файла ключей `doc=keys` (доступ только для ролей `teacher` и `developer`).
- 🟩 30. Настраиваемый сетевой интерфейс (`HOST=0.0.0.0`) для автономного запуска и регламент доступа с iPad.
- 🟩 31. Непрерывная индикация состояния движка распознавания речи в интерфейсе Speech Studio (Скриншот 23).
- 🟩 32. Пословная верификация распознанного текста и расчет процента соответствия эталонной фразе.
- 🟩 33. Расширение набора автоматизированных тестов для проверки постоянного хранения сессий и защиты ключей.

---

### Скриншот 23: Модуль непрерывной индикации статуса распознавания и адаптивной сверки речи (Pearson Speakout A1 Speech Studio & Persistent Engine Status)

![Скриншот 23: Модуль непрерывной индикации статуса распознавания и адаптивной сверки речи](docs/speakout-screenshot-23-speech-studio-adaptive-verification.jpg)
