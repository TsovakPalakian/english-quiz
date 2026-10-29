# Реестр инцидентов, анализ первопричин и правила предотвращения дефектов

Документ фиксирует дефекты, выявленные в ходе эксплуатации и нагрузочного тестирования платформы Lumiscia, технический анализ первопричин с указанием строк кода, примененные решения и обязательные правила предотвращения рецидивов.

---

## Раздел I: Исключения сторонних браузерных расширений

### Инцидент 1: Логирование сбоев сторонних плагинов Chrome (`Bug ID: 42986db9c097d4c1d8c823aaf6661628`)
- **Контекст**: клиентская часть платформы, URL `https://lumiscia.org/`, экран `home`.
- **Симптом**:
  ```text
  TypeError: Cannot read properties of undefined (reading 'M_ID')
      at Y (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js:1:761)
      at E (chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js:1:1442)
  ```
- **Первопричина**:
  В [client/main/main-bridge.js:205-207](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L205-L207) зарегистрированы глобальные слушатели:
  `window.addEventListener('error', event => reportClientBug(...))`
  `window.addEventListener('unhandledrejection', event => reportClientBug(...))`
  Исключение возникло внутри стороннего расширения Chrome с идентификатором `eppiocemhmnlbhjplcgkofciiegomcon`. Платформа Lumiscia не содержит свойств `M_ID`. Глобальные перехватчики перехватили чужой сбой и отправили 22 ложных отчета в базу дефектов через эндпоинт `/api/bugs`.
- **Решение**:
  1. В функции `reportClientBug` в [client/main/main-bridge.js:181-198](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L181-L198) внедрена проверка стека на протоколы расширений:
     `if(/chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:/.test(String(entry.stack||'')))return;`
  2. В слушателях `window.addEventListener('error')` и `window.addEventListener('unhandledrejection')` в [client/main/main-bridge.js:205-207](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L205-L207) добавлена проверка свойства `event.filename` и стека ошибки до формирования отчета.
- **Правило предотвращения**:
  Глобальные клиентские перехватчики ошибок обязаны валидировать источник сбоя. Запрещено отправлять на сервер отчеты, если стек или адрес файла содержит протоколы `chrome-extension:`, `moz-extension:`, `safari-extension:` или `safari-web-extension:`.

---

## Раздел II: Сетевые таймауты и фоновая телеметрия

### Инцидент 2: Фиксация естественного обрыва мобильного соединения как критического сбоя (`Bug ID: 6b31e5a5762aac816a9fb9af8f140d20`)
- **Контекст**: `POST /api/stats/event`, мобильная сеть 3G, длительность ожидания 75475 мс, экран `material`.
- **Симптом**:
  ```text
  Error: Connection interrupted. Saving is not confirmed; retry the same operation.
      at api (https://lumiscia.org/main-bridge.js:220:33)
      at async runPersonal (https://lumiscia.org/main-bridge.js:463:20)
  ```
- **Первопричина**:
  В функции `api()` в [client/main/main-bridge.js:218-224](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L218-L224) блок `catch(cause)` вызывал `reportClientBug` безусловно, не проверяя флаг `quietBug`.
  В очереди фоновой синхронизации `runPersonal()` в [client/main/main-bridge.js:470](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L470) параметр `quietBug` выставлялся только для задач `theme`, но отсутствовал для фоновых событий времени `activity`. В результате естественный таймаут нестабильного соединения 3G был зафиксирован как системная авария.
- **Решение**:
  1. В [client/main/main-bridge.js:222](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L222) вызов `reportClientBug` обернут в условие `if(!quietBug)`.
  2. Объект ошибки дополнен свойством `error.quietBug = quietBug`.
  3. В [client/main/main-bridge.js:470](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L470) передано:
     `quietBug: job.kind === 'theme' || job.kind === 'activity'`
  4. В [client/main/main-bridge.js:500](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L500) в блоке перехвата очереди добавлена проверка:
     `if(!error.reported && !error.quietBug)`
- **Правило предотвращения**:
  Фоновая телеметрия, сбор статистики и неблокирующие синхронизации обязаны выполняться с параметром `quietBug: true`. Сетевой слой обязан блокировать генерацию алертов при сетевых таймаутах для фоновых запросов.

---

## Раздел III: Зондирование сканерами уязвимостей и сетевой экран

### Инцидент 3: Логирование штатных блокировок сетевого экрана при сканировании ботами (`Bug ID: c26ac076c6c86b9c78a3a45205d6f37c`, `Bug ID: 66acfaafaf5b8f8d9282cdaafd816eca`, `Bug ID: 75157dfdda8a925612d41e35bbb8e52b`, `Bug ID: b0cf6da12c895931d59ba3bbb3d0fa72`)
- **Контекст**: эндпоинты `POST /api/graphql` и `POST /api/gql`, бот LeakIX (`User-Agent: Mozilla/5.0 (l9scan/...; +https://leakix.net)`).
- **Симптомы**:
  - `HTTP 403 Configured test host only.` (запросы по незащищенному протоколу `http:`).
  - `HTTP 403 Invalid origin.` (запросы по протоколу `https:`, но без совпадения заголовка `Origin`).
- **Первопричина**:
  Сетевой экран в [src/learning-integrated-worker.mjs:174-175](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L174-L175) содержит проверки:
  ```javascript
  if(url.protocol!=='https:'||url.hostname!==env.STAGE_ALLOWED_HOST)throw new StudyError(403,'Configured test host only.');
  if(!['GET','HEAD'].includes(method)&&request.headers.get('origin')!==url.origin)throw new StudyError(403,'Invalid origin.');
  ```
  При отклонении запроса сканера метод `recordHttpBug` в [src/bug-log.mjs:197-217](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L197-L217) логировал любые ответы со статусом вне диапазона 200..299 для путей с префиксом `/api/`. В платформе Lumiscia эндпоинты GraphQL отсутствуют, поэтому блокировка сканера фиксировалась как дефект сервиса.
- **Решение**:
  1. В [src/bug-log.mjs:197-217](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L197-L217) добавлено отсечение:
     - запросов от сканеров (`/l9scan|leakix|shodan|censys|nikto|sqlmap|nmap/i.test(userAgent)`);
     - зондирующих обращений к отсутствующим эндпоинтам (`/api/graphql`, `/api/gql`, `/api/swagger`, `/api/openapi`).
     При этом отслеживание ошибок хоста для легитимных путей API сохранено в соответствии с тестом [test/test-bug-log.mjs:96](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-bug-log.mjs#L96).
  2. В [src/learning-integrated-worker.mjs:1204-1208](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L1204-L1208) функция `bugWatch` дополнена аналогичными фильтрами, предотвращая лишнее клонирование тел запросов сканеров.
- **Правило предотвращения**:
  Механизм серверного мониторинга ошибок обязан разделять сбои бизнес-логики приложения и штатные блокировки сетевого экрана. Зонды сканеров уязвимостей и неавторизованные запросы к несуществующим системным путям не подлежат записи в журнал дефектов.

---

## Раздел IV: Синхронизация состояния и оптимистичный UI

### Инцидент 4: Мультипликация сетевых запросов при добавлении блоков экзаменов
- **Контекст**: экран `exams` ([client/54-exams.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js)).
- **Симптом**: при добавлении одного экзаменационного блока отправлялось 7 параллельных сетевых запросов `POST /api/exams`.
- **Первопричина**:
  Функция `examPush` в [client/54-exams.js:126](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L126) итерировала весь локальный список блоков без отслеживания базы изменений. Все неизмененные блоки повторно отправлялись на сервер.
- **Решение**:
  1. В [client/54-exams.js:8](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L8) объявлена коллекция снимков: `examBaselines = new Map()`.
  2. Коллекция наполняется при первичной загрузке в `examPull()` и обновляется при успешном ответе в `examRemoteSave()`.
  3. В [client/54-exams.js:126-135](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L126-L135) вычисляется массив `dirtyRows`: запрос отправляется исключительно для новых либо модифицированных сущностей.
- **Правило предотвращения**:
  Любая процедура синхронизации локального хранилища с сервером обязана использовать снимок состояния (baseline hash/map) и передавать по сети только измененные записи (`dirty rows`).

### Инцидент 5: Задержка отрисовки кнопки копирования идентификатора блока
- **Контекст**: карточка экзаменационного блока в списке ([client/54-exams.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js)).
- **Симптом**: кнопка `Copy ID` появлялась не сразу после создания блока, а только после сторонних кликов по странице.
- **Первопричина**:
  Функция `contentCopyButton('exam-block', id)` требует числовой идентификатор сервера. До ответа сервера блок имеет временный строковый ID. После завершения `examRemoteSave` перерисовка списков блоков `examPaintBlocks()` и `examPaintList()` отсутствовала в блоке `.then()`.
- **Решение**:
  В [client/54-exams.js:104-124](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L104-L124) в обработчик успешного ответа сервера добавлены прямые вызовы `examPaintList()` и `examPaintBlocks()`.
- **Правило предотвращения**:
  После получения постоянных серверных идентификаторов оптимистичный интерфейс обязан немедленно вызывать рендер зависимых элементов управления, не дожидаясь сторонних событий пользователя.

### Инцидент 6: Ошибка 404 Material not found при удалении локального блока
- **Контекст**: удаление только что добавленного блока экзамена.
- **Симптом**: сетевой запрос `POST /api/archive` возвращал код 404 `Material not found.`.
- **Первопричина**:
  В [client/54-exams.js:1004-1045](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L1004-L1045) функция `examDelete` отправляла сетевой запрос архивации для всех блоков без проверки признака персистентности. Для несохраненного блока с временным строковым идентификатором сервер возвращал 404.
- **Решение**:
  В [client/54-exams.js:1004-1045](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L1004-L1045) добавлена проверка идентификатора:
  - если ID строковый (не сохранен на сервере), запись удаляется локально без отправки сетевого запроса;
  - если ID числовой (сохранен на сервере), вызывается `archiveItem` с удалением из локального состояния.
- **Правило предотвращения**:
  Операции удаления в оптимистичных интерфейсах не должны обращаться к эндпоинтам персистентного удаления для временных локальных сущностей.

---

## Раздел V: Разграничение прав и гостевой доступ

### Инцидент 7: Ошибка HTTP 401 Unauthorized при обращении к категориям грамматики
- **Контекст**: главная страница Lumiscia, гостевой доступ.
- **Симптом**: консольная ошибка HTTP 401 при обращении к `/api/me/grammar-categories`.
- **Первопричина**:
  В [client/03c-cards.js:527](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js#L527) происходил прямой вызов персонального эндпоинта без проверки статуса авторизации.
- **Решение**:
  1. В [client/03c-cards.js:527](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js#L527) добавлена проверка наличия авторизованного профиля перед отправкой запроса.
  2. В [src/learning-stage-worker.mjs:275](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L275) эндпоинт открыт для безопасного чтения гостями с возвратом стандартного каталога правил.
- **Правило предотвращения**:
  Клиентский код обязан проверять авторизацию перед запросами к путям `/api/me/*`. Серверные обработчики каталогов общего назначения должны возвращать публичные данные для неавторизованных пользователей без генерации ошибок 401.
