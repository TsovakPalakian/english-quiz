# План устранения 4 замечаний: доступ к ключам, оффлайн-шлюз речи, сетевой стенд и динамический подсчет страниц PDF

## 1. Точная формулировка проблем с кодовыми ссылками

### 1.1. Доступ ученика к ключам ответов Unit 1 (`doc=keys`)
* **Кодовая ссылка**: [speakout/server/server.js#L827-L836](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L827-L836)
* **Проблема**: Маршрут `GET /api/speakout/document?doc=keys` разрешает доступ только ролям `teacher` и `developer`. Аутентифицированная сессия ученика (`student`) получает статус `403 Forbidden`. При этом на утвержденном экране (Скриншот 17, 19) модальное окно Keys должно открывать ученику разворот страниц 2–3 (для урока 1A) и страниц 4–5 (для урока 1D) из файла `SO3_A1_SB_AK.pdf`.
* **Решение**: Разрешить доступ к `doc=keys` любой аутентифицированной сессии (включая роль `student`). При отсутствии сессии возвращать статус `401 Unauthorized`. Доступ к полному файлу книги учителя `doc=teacherResources` остается строго ограниченным ролями `teacher` и `developer` (статус `403 Forbidden` для ученика).

---

### 1.2. Спецификация сверки речи и отказ от вымышленных модельных фраз
* **Кодовая ссылка**: [speakout/web/app.js#L28-L34](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L28-L34), [speakout/web/app.js#L328-L334](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L328-L334), [speakout/web/app.js#L487-L516](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L487-L516)
* **Проблема**: В `app.js` объект `TRACK_MODEL_PHRASES` хранит 4 произвольно составленные строки, не извлеченные из аудиодорожек. Браузерный `SpeechRecognition` запускается безусловно (в Google Chrome обращаясь к облачным серверам Google), а текст распознавания скрывается искусственной проверкой `window.__OFFLINE_SPEECH_ENGINE__ && !navigator.onLine`.
* **Решение**: В строгом соответствии с пунктом 8 спецификации [docs/speakout-course-implementation-plan.md#L29](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/speakout-course-implementation-plan.md#L29) и [docs/speakout-course-implementation-plan.md#L215](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/speakout-course-implementation-plan.md#L215):
  1. Ученик слушает трек Pearson выбранного занятия.
  2. Браузер записывает ответ ученика через микрофон.
  3. Запись ученика воспроизводится следом за треком Pearson.
  4. Аудиофайл сохраняется в SQLite `speakout/data/speakout.db`.
  5. Распознанный текст и оценка точности отображаются рядом с эталоном **исключительно если подтверждено, что распознаватель данной машины работает автономно без сети**. Облачный `SpeechRecognition` не запускается вслепую, вымышленные фразы не подставляются.

---

### 1.3. Сетевой запуск стенда и безопасная обработка заголовка `X-Forwarded-Proto`
* **Кодовая ссылка**: [ops/run-learning-stage.mjs#L57, L117](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/run-learning-stage.mjs#L57), [speakout/server/server.js#L541-L547](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L541-L547)
* **Проблема 1**: Стенд `ops/run-learning-stage.mjs` слушает исключительно `127.0.0.1:8788` и отклоняет любые запросы с внешних хостов со статусом `403 Localhost only.`. Это препятствует подключению с iPad через локальную сеть или через домен `lumiscia.org`.
* **Проблема 2**: В `speakout/server/server.js` заголовок `x-forwarded-proto` считывается без проверки флага `TRUST_PROXY`. Клиент при обращении по незащищенному протоколу HTTP может передать заголовок `x-forwarded-proto: https`, из-за чего сервер установит cookie с флагом `; Secure`, и браузер откажется сохранять сессию по HTTP.
* **Решение**:
  - В `server.js` учитывать заголовок `x-forwarded-proto` исключительно при `process.env.TRUST_PROXY === 'true'`.
  - В `ops/run-learning-stage.mjs` сделать хост настраиваемым через `process.env.HOST || '127.0.0.1'`, а для маршрутов `/api/speakout` и `/speakout/` разрешить сетевые обращения.

---

### 1.4. Динамическое вычисление максимального числа страниц PDF
* **Кодовая ссылка**: [speakout/server/server.js#L627](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L627)
* **Проблема**: В валидаторе прогресса максимальный номер страницы жестко зафиксирован константой `177`. При замене файла учебника или открытии документа с другим числом страниц сохранение прогресса завершается ошибкой `400 Bad Request`.
* **Решение**: Реализовать динамическое определение числа страниц через модуль `pdf.mjs` (функция `getStudentBookTotalPages()`) с кэшированием вычисленного значения. Проверка диапазона страницы выполняется по формуле `1 <= page <= maxPages`, где `maxPages` извлекается из метаданных открытого файла PDF.

---

## 2. Границы области изменений и инварианты

- Изменения вносятся исключительно в файлы:
  - `speakout/server/server.js`
  - `speakout/web/app.js`
  - `ops/run-learning-stage.mjs`
  - `speakout/tests/security_hardening.test.js`
  - `docs/`
- Запрещено выполнять `git commit` и `git push`.
- Не затрагивать функционал платформы `study-service.mjs`, `learning.html` и смежные сервисы.

---

## 3. Чек-лист реализации

- 🟩 63. Разрешение доступа к `doc=keys` аутентифицированной сессии ученика (200 OK) при сохранении 403 Forbidden для `doc=teacherResources`.
- 🟩 64. Приведение логики речи в `app.js` к утвержденному регламенту: двухфазное воспроизведение (трек Pearson, затем запись ученика), исключение вымышленных строк `TRACK_MODEL_PHRASES` и включение сверки только при наличии автономного локального движка.
- 🟩 65. Защита заголовка `X-Forwarded-Proto` в `server.js`: учет значения `https` строго при наличии `process.env.TRUST_PROXY === 'true'`.
- 🟩 66. Обеспечение сетевого доступа в `ops/run-learning-stage.mjs`: настраиваемый `process.env.HOST` и пропуск запросов `/api/speakout` и `/speakout/`.
- 🟩 67. Динамическое вычисление максимального числа страниц PDF в `server.js` через метаданные документа вместо статической константы 177.
- 🟩 68. Обновление и добавление автоматизированных тестов для проверки всех 4 исправлений (28 тестов в `security_hardening.test.js`, 65 тестов суммарно).

---

### Скриншот 28: Архитектура авторизованного доступа к ключам Unit 1, автономного воспроизведения речи, сетевого шлюза стенда и динамического подсчета страниц PDF

![Скриншот 28: Архитектура авторизованного доступа к ключам Unit 1](docs/speakout-screenshot-28-keys-speech-dynamic-pages.jpg)
