# Дорожная карта и технические рекомендации по поэтапному устранению дефектов платформы

**Дата составления**: 4 ноября 2026 г.  
**Объект**: Веб-платформа Lumiscia / English Quiz  
**Архитектурный стек**: Cloudflare Workers, Cloudflare D1 (SQLite), Cloudflare R2, Cloudflare Durable Objects, Vanilla JS SPA Client (`client/*.js`, `production/chat/*.js`)  
**Основание**: Результаты протокола Zero-Compression Forensic Code Audit, аудита состояний гонки и аудита безопасности.

---

> [!WARNING]
> **ОБЩИЙ ЗАПРЕТ НА ДЕСТРУКТИВНЫЕ И НЕСВЯЗАННЫЕ ИЗМЕНЕНИЯ**:  
> Строго запрещается изменять, модифицировать или нарушать функциональность компонентов, не входящих в текущую изолированную фазу работ. Запрещено модифицировать публичные контракты API, сигнатуры существующих функций, логику авторизации Passkey, алгоритм интервального повторения FSRS, генератор интерактивных упражнений Wordwall, сквозное шифрование сообщений AES-256-GCM и схему экзаменационных блоков. Каждое изменение обязано быть строго локализовано в рамках указанных строк и файлов.

---

## 1. Сводная матрица этапов и статус задач

| Этап | Идентификатор | Компонент и локализация | Описание дефекта | Влияние на систему | Статус |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Этап 1** | `SEC-NEW-01` | [`src/learning-integrated-worker.mjs#L387`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L387) | Обход проверки nonce в Google OAuth flow при отсутствии cookie | Уязвимость авторизации (OAuth CSRF) | 🟩 |
| **Этап 1** | `SEC-NEW-02` | [`src/learning-production-worker.mjs#L25`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-production-worker.mjs#L25) | Отсутствие проверки формата и энтропии секрета `SESSION_SECRET` | Снижение стойкости HMAC подписей сессий | 🟩 |
| **Этап 1** | `SEC-NEW-03` | [`src/feedback.mjs#L238`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L238), [`client/24-bugs.js#L311`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L311) | Отсутствие валидации MIME во вложениях и пропуск `rel="noopener noreferrer"` | Риск инъекции данных и Reverse Tabnabbing | 🟩 |
| **Этап 1** | `SEC-NEW-04` | [`site/preview.html#L1477`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1477) | Отсутствие атрибута `noopener` на статической ссылке с `target="_blank"` | Риск Reverse Tabnabbing в WebKit | 🟩 |
| **Этап 2** | `RACE-SRV-01` | [`src/chat-worker.mjs#L306`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L306) | Вызов `/suspend` и закрытие сокетов 4002 при сохранении профиля `/api/me/account` | Разрыв соединения чата при редактировании профиля | 🟩 |
| **Этап 2** | `RACE-SRV-02` | [`src/chat-durable.mjs#L411`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L411), [`src/chat-durable.mjs#L443`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L443) | Сброс флага `active` и постоянная блокировка сокетов 403 `Sign in first.` | Невозможность восстановить соединение без повторного логина | 🟩 |
| **Этап 2** | `RACE-SRV-03` | [`src/chat-worker.mjs#L60`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L60) | Блокировка 503 `Permissions are being synchronized.` при наличии `policyDirtyAt` | 120-секундный каскадный отказ сокетов при инвалидации | 🟩 |
| **Этап 2** | `RACE-SRV-04` | [`src/chat-durable.mjs#L606`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L606) | Блокировка отправки `snapshot` внешним вызовом `await this.presence()` | Задержка входа клиента чата в рабочее состояние | 🟩 |
| **Этап 3** | `RACE-CLI-01` | [`production/chat/90-settings.js#L530`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L530) | Блокирующий вызов сокета `request('profiles')` при открытии вкладки настроек | Падение вкладки с ошибкой при реконнекте сокета | ⬜ |
| **Этап 3** | `RACE-CLI-02` | [`src/chat-worker.mjs#L316`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L316) | Неполный ответ эндпоинта `GET /api/messages/profile` | Необходимость вторичных запросов аватара по сокету | ⬜ |
| **Этап 3** | `RACE-CLI-03` | [`production/chat/20-connection.js#L180`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L180) | Пропуск вызова `paintProfiles()` при обработке входящего снимка `snapshot` | Пропадание фото аватара при переподключении сокета | ⬜ |
| **Этап 4** | `RACE-CLI-04` | [`client/52-lessons.js#L780`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L780) | Перезапись активного экрана экзамена фоновым событием входящего сообщения | Сброс фокуса и потеря ввода учащегося во время теста | ⬜ |
| **Этап 4** | `RACE-CLI-05` | [`client/00-core.js#L230`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L230) | Сохранение устаревшего контекста предыдущей роли при смене аккаунта | Утечка интерфейсных прав между студентом и учителем | ⬜ |
| **Этап 4** | `RACE-CLI-06` | [`client/52-lessons.js#L1120`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1120) | Зависание очереди сохранения ответов экзамена при получении статуса 409 | Остановка синхронизации прогресса тестирования | ⬜ |
| **Этап 5** | `SCHEMA-01` | Схемы миграций баз данных D1 | Наличие 60 неиспользуемых таблиц `_v6` и `_v9` в схеме базы данных | Избыточность схемы D1 и замедление системного анализа | ⬜ |
| **Этап 5** | `VERIFY-01` | Модули сборки и тестирования | Верификация отсутствия регрессий через целевые тест-сьюты и билдер | Подтверждение стабильности платформы | ⬜ |

---

## 2. Детальные технические рекомендации по этапам

---

### ЭТАП 1. Базовые инварианты безопасности и криптографической устойчивости

> [!WARNING]
> Запрещено модифицировать обработчики маршрутов, отличные от указанных. Запрещено менять структуру токенов сессий и формат ответа API авторизации.

#### Задача 1.1 (`SEC-NEW-01`): Перевод проверки nonce в Google OAuth в режим fail-closed
- **Файл**: [`src/learning-integrated-worker.mjs#L385-L387`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L385-L387)
- **Точный фрагмент кода**:
  ```javascript
  const cookieNonce=googleCookie(request);
  const state=await readGoogleState(env,url.searchParams.get('state'));
  if(cookieNonce&&cookieNonce!==state.n)throw new StudyError(401,'Google sign-in does not match this session.');
  ```
- **Причина дефекта**: Если запрос к `/api/auth/google/callback` поступает без cookie `__Host-lumiscia-google`, переменная `cookieNonce` принимает значение `""`. Условие `cookieNonce && ...` вычисляется в `""` (falsy), исключение не выбрасывается, и запрос выполняется без подтверждения принадлежности браузеру.
- **Рекомендация по исправлению**:
  ```javascript
  if(!cookieNonce||cookieNonce!==state.n)throw new StudyError(401,'Google sign-in does not match this session.');
  ```
- **Критерий приемки**: Тест с отсутствующим cookie возвращает статус 401.

#### Задача 1.2 (`SEC-NEW-02`): Валидация формата и энтропии сессионного секрета `SESSION_SECRET`
- **Файл**: [`src/learning-production-worker.mjs#L23-L25`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-production-worker.mjs#L23-L25)
- **Точный фрагмент кода**:
  ```javascript
  env={...env,SESSION_SECRET:env.CONTENT_SESSION_SECRET||env.SESSION_SECRET};
  if(env.CONTENT_MEDIA_BUCKET!==PRODUCTION_MEDIA_BUCKET||!env.CONTENT_ALLOWED_HOST
    ||typeof env.SESSION_SECRET!=='string'||!env.SESSION_SECRET.trim()||!env.DB||!env.MEDIA||!env.ASSETS||!env.CONTENT_MEDIA)return null;
  ```
- **Причина дефекта**: В тестовой среде (`src/learning-stage-worker.mjs:81`) действует проверка `/^[a-f0-9]{64,128}$/i`. В продакшен-воркере допускается секрет произвольной длины от 1 символа.
- **Рекомендация по исправлению**:
  ```javascript
  if(env.CONTENT_MEDIA_BUCKET!==PRODUCTION_MEDIA_BUCKET||!env.CONTENT_ALLOWED_HOST
    ||typeof env.SESSION_SECRET!=='string'||!/^[a-f0-9]{64,128}$/i.test(env.SESSION_SECRET.trim())||!env.DB||!env.MEDIA||!env.ASSETS||!env.CONTENT_MEDIA)return null;
  ```
- **Критерий приемки**: При передаче короткого секрета окружение возвращает `null`.

#### Задача 1.3 (`SEC-NEW-03`): Валидация вложений обратной связи и защита ссылок
- **Файлы**: [`src/feedback.mjs#L238-L240`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs#L238-L240), [`client/24-bugs.js#L311`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L311)
- **Точный фрагмент кода в `src/feedback.mjs`**:
  ```javascript
  const dataUrl = typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:') && item.dataUrl.length < 2_000_000
    ? item.dataUrl
    : '';
  ```
- **Точный фрагмент кода в `client/24-bugs.js`**:
  ```javascript
  ${href ? `<a href="${href}" target="_blank" download="${esc(f.name)}" style="color:var(--accent,#0284c7);text-decoration:none;font-weight:600;margin-left:4px;" title="Download file">⬇</a>` : ''}
  ```
- **Рекомендация по исправлению**:
  1. В `src/feedback.mjs` ограничить разрешенные MIME-типы:
     ```javascript
     const dataUrl = typeof item.dataUrl === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(item.dataUrl) && item.dataUrl.length < 2_000_000
       ? item.dataUrl
       : '';
     ```
  2. В `client/24-bugs.js` добавить `rel="noopener noreferrer"` к ссылке загрузки вложения.
- **Критерий приемки**: Попытка отправки `data:text/html` отсекается до пустой строки, ссылка содержит атрибуты `rel="noopener noreferrer"`.

#### Задача 1.4 (`SEC-NEW-04`): Добавление `noopener` на статическую ссылку
- **Файл**: [`site/preview.html#L1477`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1477)
- **Точный фрагмент кода**:
  ```html
  <p class="src"><a href="pdf/16.09.2026.pdf" target="_blank" rel="noreferrer">16.09.2026.pdf</a></p>
  ```
- **Рекомендация по исправлению**:
  ```html
  <p class="src"><a href="pdf/16.09.2026.pdf" target="_blank" rel="noopener noreferrer">16.09.2026.pdf</a></p>
  ```

---

### ЭТАП 2. Устранение каскадных сбросов соединений и блокировок в Durable Objects

> [!WARNING]
> Запрещено изменять протокол шифрования сообщений AES-256-GCM, формат хранения сообщений в DO и структуру ключей аутентификации сокетов.

#### Задача 2.1 (`RACE-SRV-01`): Исключение `/api/me/account` из списка `policyMutation`
- **Файл**: [`src/chat-worker.mjs#L306`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L306)
- **Причина дефекта**: Маршрут `/api/me/account` необоснованно классифицирован как `policyMutation`. При сохранении имени или аватара вызывается метод `/invalidate` объекта `CHAT_BRIDGE`, который рассылает директиву `/suspend` во все инбоксы `CHAT_INBOX`. Инбокс принудительно обрывает сокет клиента с кодом закрытия 4002.
- **Рекомендация по исправлению**:
  Удалить путь `/api/me/account` из массива мутаций политик:
  ```javascript
  const policyMutation = ['/api/accounts/role', '/api/accounts/delete', '/api/accounts/group', '/api/accounts/archive'].includes(url.pathname);
  ```
- **Критерий приемки**: Сохранение настроек профиля через HTTP POST `/api/me/account` не вызывает закрытия сокета `CHAT_INBOX`.

#### Задача 2.2 (`RACE-SRV-02`): Предотвращение перманентной блокировки сокета 403 `Sign in first.`
- **Файлы**: [`src/chat-durable.mjs#L411`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L411), [`src/chat-durable.mjs#L443`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L443)
- **Причина дефекта**: После вызова `/suspend` свойство `profile.active` принимает значение `false`. Метод `snapshot()` возвращает профиль без полей `active`, `username`, `avatarUrl`. При повторном подключении воркер пропускает `/configure`, сокет отклоняется с кодом 403 `Sign in first.`.
- **Рекомендация по исправлению**:
  1. В `ChatInbox.snapshot()` гарантировать включение полей `active: this.profile?.active !== false`, `username`, `avatarUrl`.
  2. В `ChatInbox.configure()` выполнять деактивацию соединения только при явной смене системной роли пользователя или отзыве прав доступа, сохраняя сессию активной при штатном обновлении данных.
- **Критерий приемки**: Сокет восстанавливает связь без ошибки 403 при переподключении.

#### Задача 2.3 (`RACE-SRV-03`): Устранение 120-секундного каскадного отказа HTTP 503 при инвалидации
- **Файл**: [`src/chat-worker.mjs#L60-L65`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L60-L65)
- **Причина дефекта**: Метод `ChatBridge.policy()` выбрасывает ошибку 503 `Permissions are being synchronized.`, пока выставлена отметка времени `policyDirtyAt`. Сокеты, пытающиеся выполнить рукопожатие, получают отказ 503 в течение 120 секунд.
- **Рекомендация по исправлению**:
  Возвращать текущую кэшированную версию политики безопасности во время асинхронной пересборки прав вместо генерации исключения 503.
- **Критерий приемки**: Запросы рукопожатия WebSocket во время синхронизации политики завершаются со статусом 101 Switching Protocols.

#### Задача 2.4 (`RACE-SRV-04`): Разрыв циклической RPC-блокировки между `ChatInbox` и `ChatBridge`
- **Файл**: [`src/chat-durable.mjs#L606`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L606)
- **Причина дефекта**: Вызов `server.send({type: 'snapshot'})` откладывается до завершения внешнего сетевого вызова `await this.presence()`. Задержки ответа `CHAT_BRIDGE /presence` блокируют получение начального состояния клиентом.
- **Рекомендация по исправлению**:
  Отправлять начальный `snapshot` клиенту немедленно после установки WebSocket соединения:
  ```javascript
  server.send(JSON.stringify({ type: 'snapshot', ...this.snapshot() }));
  this.presence().catch((err) => console.error('Presence sync failed:', err));
  ```
- **Критерий приемки**: Клиент получает снимок комнат и контактов в первом сообщении без сетевых задержек.

---

### ЭТАП 3. Разделение загрузки профиля и сокета чата в интерфейсе

> [!WARNING]
> Запрещено изменять разметку и логику соседних вкладок чата (комнаты, диалоги, поиск сообщений, список заблокированных). Редактирование скриптов чата производить строго в `production/chat/*.js`.

#### Задача 3.1 (`RACE-CLI-01`): Исключение сокет-запроса `request('profiles')` со страницы профиля
- **Файл**: [`production/chat/90-settings.js#L524-L544`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L524-L544)
- **Причина дефекта**: Загрузка вкладки настроек профиля выполняет `request('profiles', { ids: [profile.id] })` через сокет. Если соединение сокета находится в стадии переподключения, страница падает с ошибкой `Chat is reconnecting. Your draft is saved.`.
- **Рекомендация по исправлению**:
  Использовать данные из ответа `domain('/profile')` и локального объекта учетной записи без вызова сокета.
- **Критерий приемки**: Вкладка профиля открывается и сохраняет данные даже при выключенном или переподключающемся сокете.

#### Задача 3.2 (`RACE-CLI-02`): Обогащение ответа эндпоинта `GET /api/messages/profile`
- **Файл**: [`src/chat-worker.mjs#L316`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L316)
- **Рекомендация по исправлению**:
  Возвращать полный профиль пользователя, включающий `username`, `avatarUrl`, `phone`, `birthday`, устраняя потребность во вторичных сокет-запросах.
- **Критерий приемки**: Запрос `GET /api/messages/profile` содержит валидный `avatarUrl`.

#### Задача 3.3 (`RACE-CLI-03`): Отрисовка аватара при входящем `snapshot`
- **Файл**: [`production/chat/20-connection.js#L180`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/20-connection.js#L180)
- **Рекомендация по исправлению**:
  При получении сообщения типа `snapshot` вызывать функцию обновления аватаров `paintProfiles()` для профиля текущего пользователя и контактов.
- **Критерий приемки**: Фото аватара немедленно отображается в шапке и профиле после установления связи.

---

### ЭТАП 4. Устранение клиентских гонок экранов и очередей

> [!WARNING]
> Запрещено изменять алгоритмы расчета баллов экзаменов, структуру конспектов уроков и логику отображения карточек слов.

#### Задача 4.1 (`RACE-CLI-04`): Защита активного экрана экзамена от фоновых событий
- **Файл**: [`client/52-lessons.js#L780`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L780)
- **Причина дефекта**: Глобальные события чата и уведомлений инициируют принудительную перерисовку контейнера страницы, стирая текущее состояние ввода студента во время тестирования.
- **Рекомендация по исправлению**:
  Добавить проверку активного экрана: если открыт экран сдачи экзамена (`activeExamSession`), отложить перерисовку внешних блоков до выхода из сессии тестирования.
- **Критерий приемки**: Фоновые события не сбрасывают состояние активного экзамена.

#### Задача 4.2 (`RACE-CLI-05`): Изоляция контекста аккаунта при смене пользователя
- **Файл**: [`client/00-core.js#L230`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L230)
- **Причина дефекта**: Функция `initAccount` не очищает в памяти глобальные кэши предыдущей роли при авторизации под другой учетной записью.
- **Рекомендация по исправлению**:
  При вызове `initAccount` производить полный сброс переменных `viewAccount`, `materialReviewStudent`, кэша комнат чата и локального состояния списков групп.
- **Критерий приемки**: Переключение между профилями гарантирует отсутствие остаточных данных предыдущей сессии.

#### Задача 4.3 (`RACE-CLI-06`): Разрешение версионных конфликтов 409 в очереди синхронизации
- **Файл**: [`client/52-lessons.js#L1120`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1120)
- **Причина дефекта**: При получении ответа 409 Conflict очередь повторных попыток зацикливается, блокируя сохранение последующих ответов.
- **Рекомендация по исправлению**:
  При ответе 409 запрашивать серверную ревизию документа, объединять локальные неотправленные ответы с серверным снимком и обновлять локальный номер ревизии.
- **Критерий приемки**: Очередь успешно завершает синхронизацию после конфликта ревизий.

---

### ЭТАП 5. Регламент работы со схемой БД и комплексная верификация

> [!WARNING]
> Запрещено удалять таблицы базы данных без предварительного подтверждения отсутствия внешних связей и создания полной резервной копии.

#### Задача 5.1 (`SCHEMA-01`): Формирование миграции консервации 60 неиспользуемых таблиц `_v6` и `_v9`
- **Объект**: 60 таблиц, выявленных в ходе аудита `[DEAD_SCHEMA]` (со списком: `card_progress_v6`, `lesson_blocks_v6`, `security_sessions_v9`, `chat_assignments_v9` и 56 остальных таблиц, зафиксированных в реестре [`docs/zero-compression-codebase-audit.md`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/zero-compression-codebase-audit.md)).
- **Рекомендация**:
  1. Подготовить SQL-файл безопасного вывода из эксплуатации `migrations/archive_legacy_schemas.sql`.
  2. Провести тестовый запуск в локальном окружении D1 (`wrangler d1 execute`).
  3. Проверить отсутствие обращений к данным таблицам со стороны сторонних систем архивации.

#### Задача 5.2 (`VERIFY-01`): Финальная комплексная верификация платформы
- **Программа проверки**:
  1. Таргетированные тесты Durable Objects:
     ```bash
     node --test test/test-chat-durable.mjs
     ```
  2. Таргетированные тесты пользовательского интерфейса чата:
     ```bash
     node --test test/test-chat-ui.mjs
     ```
  3. Тесты миграций целочисленных идентификаторов:
     ```bash
     node --test test/test-account-integer-id-migration.mjs
     ```
  4. Сборка клиентского бандла:
     ```bash
     npm run build:preview
     ```
  5. Сборка производственных ассетов:
     ```bash
     node ops/build-learning-production-assets.mjs
     ```
- **Критерий приемки**: 100% прохождение тестов, сборка ассетов без предупреждений.
