# План устранения дефекта Bug ID: d0ddd0f9ae7d3f7b6b552ab174777a04

## Границы области видимости и изоляция изменений

> ### Предупреждение об изоляции функционала
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к исправлению дефекта опроса счетчиков администратора в функции `refreshAccountsCount`.
> Запрещается изменять логику работы ролей пользователей на сервере, клиентские обработчики экрана сообщений `messages`, структуру базы данных, логику авторизации сессий, компоненты чата, систему FSRS, верстку экранов квизов или смежные фоновые обработчики.
> Изменения строго и изолированно затрагивают только функцию `refreshAccountsCount` в [client/05-account.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js), пересборку бандла [preview.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через `npm run build:preview` и целевой тестовый файл [test/test-account-counters.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-counters.mjs).
> Смежный функционал не затрагивается.

---

## 1. Точная формулировка проблемы и ссылки на исходный код

1. **Дефект**: В журнале ошибок зафиксирован инцидент с сигнатурой `d0ddd0f9ae7d3f7b6b552ab174777a04`:
   - Маршрут: `GET /api/admin/registrations`.
   - Ответ сервера: `403 Teachers only.`.
   - Роль учетной записи: `USER`.
   - Экран вызова: `messages`.
2. **Анализ первопричины**:
   - При переходе между экранами (в вызове `show()` в [client/00-core.js#L260](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L260)) вызывается `paintSongGate()`, которая инициирует `paintDeveloperChrome()` в [client/20-account.js#L87](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L87).
   - В [client/20-account.js#L103](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L103) безусловно вызывается функция `refreshAccountsCount()`.
   - В [client/05-account.js#L383-L399](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L383-L399) функция `refreshAccountsCount()` выполняет запрос `Promise.all([accountFetch('/api/admin/registrations'), accountFetch('/api/admin/changes')])`.
   - Проверка guard-условия `if (!isTeacher() || viewAccount)` в [client/05-account.js#L383](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L383) не проверяет строго наличие `authUser && ['ADMIN', 'DEVELOPER'].includes(authUser.role)`, что допускает отправку запроса при несоответствии локального состояния сессии и серверной роли `USER`.
   - Запросы `accountFetch('/api/admin/registrations')` и `accountFetch('/api/admin/changes')` в [client/05-account.js#L393](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L393) отправляются без опции `{ quietBug: true }`. При получении ответа `403` мост в [client/main/main-bridge.js#L273](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L273) автоматически отправляет отчет в `POST /api/bugs`.
   - При ошибке промиса блок `.catch(() => {})` в [client/05-account.js#L398](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/05-account.js#L398) не обновляет временную метку `accountsCountAt`. Переменная `accountsCountFlight` сбрасывается в `null` в блоке `.finally()`. В результате условие `Date.now() - accountsCountAt < 30000` оценивается как ложное, вызывая лавинообразные повторные запросы при каждом клике или смене экрана (зафиксировано 7 запросов за 29 секунд).

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
4. Выполнить сборку производственного артефакта командой `npm run build:preview`.
5. Добавить целевые тесты в [test/test-account-counters.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-account-counters.mjs).

---

## 3. Чек-лист реализации

- `🟩` **Этап 1: Доработка guard-проверки и подавления баг-репортов в `client/05-account.js`**
  - Добавить строгую валидацию роли `['ADMIN', 'DEVELOPER'].includes(authUser.role)`.
  - Добавить `{ quietBug: true }` для маршрутов `/api/admin/registrations` и `/api/admin/changes`.
  - Добавить фиксацию `accountsCountAt = Date.now()` в секции `.catch()`.
- `🟩` **Этап 2: Сборка клиентского бандла**
  - Запустить `npm run build:preview` и подтвердить генерацию `preview.js`.
- `🟩` **Этап 3: Написание и выполнение целевых тестов**
  - Добавить тест в `test/test-account-counters.mjs`, проверяющий блокировку запросов при роли `USER`.
  - Добавить тест, подтверждающий передачу флага `quietBug: true`.
  - Добавить тест, подтверждающий троттлинг повторных запросов после ошибки.
  - Запустить `node --test test/test-account-counters.mjs` и зафиксировать прохождение тестов.
- `🟩` **Этап 4: Финальная верификация и отчет**
  - Проверить чистоту рабочей копии `git status`.
  - Предоставить коммит в прошедшем времени на английском языке.
  - Вывести список измененных тестовых файлов без расширений.
