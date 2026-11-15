# План разграничения ключей, исключения жестко зашитых паролей, сетевой доступности и диагностики речи Speakout A1

## 1. Запрет на нецелевые модификации

> <span style="color: red; font-weight: bold;">WARNING</span>
> Запрещено затрагивать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задачи строго и изолированно задевают только свой функционал. При необходимости модификации смежных модулей (`ops/run-learning-stage.mjs` для снятия блокировки `Localhost only.` или `src/learning-integrated-worker.mjs` для публикации маршрутов на `lumiscia.org`) требуется предварительное уведомление пользователя красным текстом и получение явного подтверждения.

---

## 2. Судебно-технический анализ замечаний

### 2.1. Исключение пароля по умолчанию в исходном коде
* **Текущее состояние в коде**:
  - [speakout/server/server.js:375](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L375): `const TEACHER_PASSWORD = process.env.SPEAKOUT_TEACHER_PASSWORD || 'speakout-teacher-2022';`
  - Позволяет получить роль учителя с паролем `speakout-teacher-2022`, если переменная окружения не задана.
* **Требуемое решение**:
  - Полное удаление жестко закодированного значения `'speakout-teacher-2022'`.
  - При отсутствии переменной `process.env.SPEAKOUT_TEACHER_PASSWORD` запрос роли преподавателя безусловно отклоняется со статусом `403 Forbidden` (`Teacher role assignment is disabled: SPEAKOUT_TEACHER_PASSWORD is not configured on the server`).

---

### 2.2. Разграничение доступа к книге ответов (`doc=keys`) для учеников
* **Текущее состояние в коде**:
  - [speakout/server/server.js:591-597](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L591-L597): проверка `session.role !== 'teacher' && session.role !== 'developer'` возвращает `403 Forbidden` для ученической сессии при вызове `GET /api/speakout/document?doc=keys`.
  - Модальное окно ключей самопроверки (Скриншот 19: страницы 2–3 и 4–5) не может загрузить PDF-документ книги ответов `SO3_A1_SB_AK.pdf`.
* **Требуемое решение**:
  - `doc=keys` (`SO3_A1_SB_AK.pdf` — Student's Book Answer Keys): разрешен для любой аутентифицированной сессии (включая роль `student`), неавторизованные запросы отклоняются со статусом `401 Unauthorized`.
  - `doc=teacherResources` (`SO3_A1_TRB.pdf` — Teacher's Resource Book & Photocopiables): строго защищен требованием роли `teacher` или `developer` (ученики получают `403 Forbidden`).

---

### 2.3. Сетевой запуск без параметров, доступ с iPad и домен lumiscia.org
* **Текущее состояние в коде**:
  - [speakout/server/server.js:691](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L691): автономный запуск без переменных `HOST` или `SPEAKOUT_HOST` слушает интерфейс `127.0.0.1`.
  - [ops/run-learning-stage.mjs:57](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/run-learning-stage.mjs#L57): проверка `Localhost only.` отклоняет запросы с других хостов локальной сети.
  - В Cloudflare Worker [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) отсутствуют маршруты перенаправления на Speakout.
* **Требуемое решение**:
  - В `speakout/server/server.js` изменить привязку по умолчанию при прямом запуске на `0.0.0.0:3456`, чтобы сервер сразу принимал соединения с iPad по локальной сети Wi-Fi.
  - Стенд `ops/run-learning-stage.mjs` и боевой воркер `src/learning-integrated-worker.mjs` остаются нетронутыми в соответствии с правилом изоляции скоупа, с документированием порядка их интеграции.

---

### 2.4. Эталонные транскрипты дорожек и достоверная диагностика сетевого статуса речи
* **Текущее состояние в коде**:
  - [speakout/web/app.js:28-34](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L28-L34): статический словарь `TRACK_MODEL_PHRASES`.
  - [speakout/web/app.js:507](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L507): надпись `Local Speech Engine` при `navigator.onLine === false`, хотя Web Speech API в браузере требует доступности облачного сервиса распознавания.
* **Требуемое решение**:
  - В `speakout/data/manifest.json` для всех аудиодорожек `audio.classAudio` прописать официальные верифицированные транскрипты упражнений. В `app.js` загружать целевые фразы из манифеста.
  - Исключить вводящую в заблуждение надпись `Local Speech Engine`. Отображать точный статус: `Web Speech API • Cloud Connected` при наличии сети и `Web Speech API • Network Connection Required (Chrome/WebKit)` при `!navigator.onLine` или ошибке `event.error === 'network'` (Скриншот 24).

---

### 2.5. Сверка сессий learning_stage в хранилище
* **Текущее состояние в коде**:
  - [speakout/server/server.js:150-157](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L150-L157): cookie `learning_stage` принимается без поиска в базе данных сессий.
* **Требуемое решение**:
  - Регистрация и проверка токенов сессий в таблице `speakout_sessions` базы данных `speakout.db`. При наличии валидной сессии ученика предоставляется доступ к книге ответов `doc=keys`.

---

## 3. Чек-лист реализации

- ⬜ 34. Исключение пароля по умолчанию `speakout-teacher-2022` из кодовой базы (только `process.env.SPEAKOUT_TEACHER_PASSWORD`).
- ⬜ 35. Открытие доступа к `doc=keys` (Student's Book Answer Keys) для аутентифицированных учеников с сохранением блокировки 401 для анонимных пользователей.
- ⬜ 36. Сохранение строгой блокировки 403 Forbidden для `doc=teacherResources` для всех не-учительских сессий.
- ⬜ 37. Установка сетевой привязки по умолчанию `0.0.0.0` в `speakout/server/server.js` для доступности с мобильных устройств (iPad).
- ⬜ 38. Наполнение официальных транскриптов дорожек в `speakout/data/manifest.json` и их загрузка в `speakout/web/app.js`.
- ⬜ 39. Достоверная индикация сетевого статуса `Web Speech API (Chrome/WebKit)` и устранение надписи `Local Speech Engine` (Скриншот 24).
- ⬜ 40. Сверка и валидация токенов сессий `learning_stage` в хранилище `speakout_sessions`.
- ⬜ 41. Актуализация и прохождение полного набора автоматизированных тестов.

---

### Скриншот 24: Модуль двухстраничных ключей ученика и диагностика сетевого статуса речи (Pearson Speakout A1 Student Keys & Verified Speech Status)

![Скриншот 24: Модуль двухстраничных ключей ученика и диагностика сетевого статуса речи](docs/speakout-screenshot-24-answer-keys-speech-status.jpg)
