# План устранения дефекта Bug ID: fe2a158bb1d3181f1a380470e6660eae

## Границы области видимости и изоляция изменений

> ### Предупреждение об изоляции функционала
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к исправлению дефекта опроса счетчиков администратора в функции `refreshAccountsCount` и фильтрации некритичных 403-ошибок.
> Запрещается изменять логику работы ролей пользователей на сервере, клиентские обработчики экрана сообщений `messages`, структуру базы данных, логику авторизации сессий, компоненты чата, систему FSRS, верстку экранов квизов или смежные фоновые обработчики.
> Изменения строго и изолированно затрагивают:
> 1. Функцию `refreshAccountsCount` в [client/05-account.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js);
> 2. Фильтрацию баг-репортов в [client/main/main-bridge.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js);
> 3. Фильтрацию ошибок в [src/bug-log.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs);
> 4. Пересборку бандла [preview.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через `npm run build:preview`;
> 5. Целевые тесты в [test/test-account-counters.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-counters.mjs) и [test/test-bug-log.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).
> Смежный функционал не затрагивается.

---

## 1. Точная формулировка проблемы и ссылки на исходный код

1. **Дефект**: В журнале ошибок зафиксирован инцидент с сигнатурой `fe2a158bb1d3181f1a380470e6660eae`:
   - Маршрут: `GET /api/admin/changes`.
   - Ответ сервера: `403 Teachers only.`.
   - Роль учетной записи: `USER`.
   - Экран вызова: `messages`.
2. **Анализ первопричины**:
   - При переходе на экран сообщений вызывается `show('messages')` в [client/00-core.js#L141](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L141).
   - В конце `show()` вызывается `paintSongGate()` ([client/00-core.js#L260](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L260)), которая вызывает `paintDeveloperChrome()` ([client/20-account.js#L87](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L87)).
   - `paintDeveloperChrome()` вызывает `refreshAccountsCount()` ([client/20-account.js#L103](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L103)).
   - В [client/05-account.js#L383-L399](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L383-L399) функция `refreshAccountsCount()` выполняет запрос `Promise.all([accountFetch('/api/admin/registrations'), accountFetch('/api/admin/changes')])`.
   - Проверка guard-условия `if (!isTeacher() || viewAccount)` в [client/05-account.js#L383](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L383) не содержит явной строгой проверки `['ADMIN', 'DEVELOPER'].includes(authUser.role)`, что допускает отправку запроса при несоответствии локального состояния сессии и серверной роли `USER`.
   - Запросы `accountFetch('/api/admin/registrations')` и `accountFetch('/api/admin/changes')` в [client/05-account.js#L393](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L393) отправляются без опции `{ quietBug: true }`. При получении ответа `403` мост в [client/main/main-bridge.js#L273](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L273) автоматически отправляет отчет в `POST /api/bugs`.
   - При ошибке промиса блок `.catch(() => {})` в [client/05-account.js#L398](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L398) не обновляет временную метку `accountsCountAt`. В результате условие `Date.now() - accountsCountAt < 30000` оценивается как ложное, вызывая лавинообразные повторные запросы при каждом клике или смене экрана.

---

## 2. Архитектурное решение и границы изменений

1. В [client/05-account.js#L381-L400](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L381-L400) внедрить строгое составное условие:
   ```javascript
   const isStaff = !viewAccount && !!authUser && ['ADMIN', 'DEVELOPER'].includes(authUser.role) && typeof isTeacher === 'function' && isTeacher();
   if (!isStaff) {
     accountsCountActor = ''; accountsCountAt = 0; accountsCountFlight = null;
     paintAccountsCount(0); return;
   }
   ```
2. Передать параметр `{ quietBug: true }` в вызовы фонового опроса:
   ```javascript
   accountFetch('/api/admin/registrations', { quietBug: true }),
   accountFetch('/api/admin/changes', { quietBug: true })
   ```
3. В блоке перехвата ошибок `.catch()` обновлять метку времени `accountsCountAt = Date.now();`, предотвращая повторную отправку запросов чаще одного раза в 30 секунд при ошибках авторизации или сети.
4. В [client/main/main-bridge.js#L190-L197](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L190-L197) подавлять отправку баг-репорта при 403 `Teachers only.` на эндпоинты `/api/admin/changes`, `/api/admin/registrations`, `/api/admin/users`.
5. В [src/bug-log.mjs#L115-L117](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115-L117) на уровне сервера игнорировать запись баг-репортов со статусом 403 и текстом `Teachers only.` на эндпоинтах администрирования.
6. Выполнить сборку производственного артефакта командой `npm run build:preview`.
7. Добавить целевые тесты в [test/test-account-counters.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-counters.mjs) и [test/test-bug-log.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs).

---

## 3. Чек-лист реализации

- `🟩` **Этап 1: Доработка guard-проверки и подавления баг-репортов в `client/05-account.js`**
  - Добавить строгую валидацию роли `['ADMIN', 'DEVELOPER'].includes(authUser.role)`.
  - Добавить `{ quietBug: true }` для маршрутов `/api/admin/registrations` и `/api/admin/changes`.
  - Добавить фиксацию `accountsCountAt = Date.now()` в секции `.catch()`.
- `🟩` **Этап 2: Фильтрация в `client/main/main-bridge.js` и `src/bug-log.mjs`**
  - В `client/main/main-bridge.js` (`reportClientBug`): исключить 403 `Teachers only.` на эндпоинтах администрирования.
  - В `src/bug-log.mjs` (`saveBug`): игнорировать 403 `Teachers only.` на эндпоинтах администрирования.
- `🟩` **Этап 3: Сборка клиентского бандла**
  - Запустить `npm run build:preview` и подтвердить генерацию `preview.js`.
- `🟩` **Этап 4: Написание и выполнение целевых тестов**
  - Добавить тесты в `test/test-account-counters.mjs`, проверяющие блокировку запросов при роли `USER`, флаг `quietBug: true` и троттлинг ошибок.
  - Добавить тест в `test/test-bug-log.mjs` на игнорирование 403 `Teachers only.`.
  - Запустить `node --test test/test-account-counters.mjs test/test-bug-log.mjs` и зафиксировать прохождение тестов.
- `🟩` **Этап 5: Финальная верификация и отчет**
  - Проверить чистоту рабочей копии.
  - Предоставить коммит в прошедшем времени на английском языке.
  - Вывести список измененных тестовых файлов без расширений.
