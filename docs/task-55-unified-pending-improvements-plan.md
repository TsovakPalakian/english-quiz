# Сводный план реализации TASK-55: Все несделанные правки по урокам, квизам и верификации

> [!WARNING]
> **Блок изоляции области видимости и защиты смежного функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы в рамках управления публикацией и структурой уроков ([`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)), логики редактора и генератора заданий ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)), валидации схемы квизов ([`src/quiz-review-content.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review-content.mjs)) и стилей редактора ([`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)). Если возникнет техническая необходимость затронуть смежные модули, об этом требуется заранее уведомить пользователя в чате текстом: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием причин и запросом подтверждения.

---

## 1. Сводная постановка проблем и ссылки на исходный код

В данный сводный документ сведены 5 несделанных правок:

### 1.1. Блокировка кнопки Publish при наличии непроверенных материалов
- **Проблема**: В [`client/52-lessons.js#L2541-L2550`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2541-L2550) кнопка `#lmPublish` переводит урок в статус публикации `lmState.published = true`, даже если в уроке присутствуют непроверенные преподавателем задания (`teacherVerified !== true`).
- **Требование**: Кнопка `#lmPublish` должна быть некликабельной (`disabled = true`, класс `is-disabled`, курсор `not-allowed`, иконка замка `🔒`) до тех пор, пока абсолютно все блоки урока не будут проверены преподавателем (`hasUnverified === false`). Доступно только сохранение черновика (`#lmSave` «Save draft»). При попытке клика отображается уведомление о необходимости предварительной проверки всех материалов.
- **Исходный код**: [`client/52-lessons.js#L3452-L3492`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3452-L3492), [`site/preview.html#L658-L660`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L658-L660).

### 1.2. Физическое сворачивание всех проверенных блоков в единый раскрываемый контейнер
- **Проблема**: Если блоки верифицируются преподавателем и сворачиваются индивидуально, их заголовки продолжают занимать много вертикального пространства страницы (10–20 строк), вынуждая прокручивать экран.
- **Требование**:
  - Все проверенные преподавателем блоки (`teacherVerified === true`) физически объединяются в единый раскрываемый аккордеон-контейнер (`<details class="lm-verified-accordion">`) в нижней части секции.
  - В свернутом состоянии контейнер занимает ровно одну строку: `▶ Verified materials & quizzes · N items (Click to expand)`.
  - При клике на заголовок контейнер раскрывается, показывая входящие в него проверенные задания.
  - Каждое проверенное задание внутри контейнера снабжено зеленым бейджем `✓ Verified by Teacher`.
- **Исходный код**: [`client/52-lessons.js#L957-L975`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L957-L975), [`client/52-lessons.js#L1074-L1095`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1074-L1095).

### 1.3. Приоритетный порядок квизов: непроверенные вверху, проверенные смещены вниз
- **Проблема**: В [`client/52-lessons.js#L616-L619`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L616-L619) блоки выводятся в порядке их физического добавления в массив. Преподавателю приходится искать новые задания среди уже проверенных.
- **Требование**:
  - Все новые и непроверенные квизы (`!block.teacherVerified`) располагаются в верхней части списка секции в развернутом виде, требуя внимания учителя.
  - Вновь сгенерированные блоки добавляются на самый верх секции.
  - При подтверждении проверки (`[✓] Verified by Teacher`) блок автоматически закрывается и физически перемещается вниз страницы в единый свернутый контейнер проверенных заданий.
- **Исходный код**: [`client/52-lessons.js#L616-L625`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L616-L625), [`client/52-lessons.js#L1074-L1095`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1074-L1095).

### 1.4. Исправление генерации, стилей и структуры карточки квиза True / false
- **Проблема**:
  1. В интерфейсе (пользовательский скриншот [`docs/task-55-screenshot-user-reported-broken-tf.png`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-user-reported-broken-tf.png)) карточка `True / false` отображает устаревший шаблонный заголовок `Say: "superstition"` и нестилизованные радиокнопки, где текст `True` и `False` выводится сверху над круглыми чекбоксами без выравнивания.
  2. Это не соответствует утвержденному макету (Скриншот 3 / Скриншот 5), в котором карточка оформлена в виде горизонтальных интерактивных кнопок-плашек с выделенным блоком утверждения.
- **Требование к точному соответствию утвержденному макету (Pixel-Perfect)**:
  - **Блок утверждения**: Стилизованный блок с акцентной полосой слева и четким текстом утверждения (`Statement: "..."`). Для старых уроков со строкой `Say: "..."` выполнять автоматическую нормализацию в полноценное утверждение (`The word "..." correctly translates to Russian.`).
  - **Интерактивные кнопки выбора**: Вместо вертикальных нестилизованных радио-кружков отображать две горизонтальные карточки-кнопки `[ True ]` и `[ False ]` (`.lm-tf-btn`). При выборе кнопка подсвечивается синей рамкой и светлым фоном (`var(--primary-bg)`), сохраняя состояние выбора.
  - **Кнопка проверки и результат**: Кнопка `Check answer` (`data-quiz-check`) и блок обратной связи зеленого цвета при верном ответе (`✓ Correct! ... (+1 pt)`) или красного при ошибке.
- **Исходный код**: [`client/52-lessons.js#L657`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L657), [`client/52-lessons.js#L929-L933`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L929-L933), [`client/52-lessons.js#L1212-L1228`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1212-L1228), [`site/preview.css#L3527-L3531`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3527-L3531).

### 1.5. Наполнение минимальным полным контентом остальных типов квизов
- **Проблема**: В константе `LM_ALL_QUIZ_TYPES` определены 20 типов. 16 типов попадают в общий блок fallback с пустыми полями (`options: ["","","",""]`, `parts: ""`, `text: ""`, `front: ""`, `back: ""`).
- **Требование**: Обеспечение генерации валидных структур данных без пустых полей для типов `Type`, `Definition`, `Odd one out`, `Select all`, `Build`, `Tap`, `Reverse`, `Flip`, `Smart Flashcard`, `Memory`, `Listen`.
- **Исходный код**: [`client/52-lessons.js#L3010-L3130`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3010-L3130), [`src/quiz-review-content.mjs#L26-L48`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review-content.mjs#L26-L48).

### 1.6. Блокировка pointer events диалогом `#learning-main-banner` в CI (`test-local-workbench-launch-ui.mjs`)
- **Проблема**: В CI при выполнении `test/test-local-workbench-launch-ui.mjs:64:80` вызов `page.locator('[data-workbench-mine]:visible').click()` падает по тайм-ауту 30000ms: `<dialog open="" role="alertdialog" id="learning-main-banner" aria-label="Notification" data-compact-notices="true" aria-describedby="learning-main-status">…</dialog> intercepts pointer events`.
- **Причина**: При смене роли на `u1` через выпадающий список `#local-workbench-role` происходит сетевой запрос смены роли и перезагрузка страницы `location.reload()`. Прерванные сетевые запросы (`AbortError`) или фоновые уведомления вызывают `notice(error.message, true)` в [`client/main/main-bridge.js#L322-L324`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L322-L324), что открывает модальный диалог `<dialog open="" role="alertdialog" id="learning-main-banner">`. В строке [`test/test-local-workbench-launch-ui.mjs#L45`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-workbench-launch-ui.mjs#L45) уже предусмотрено закрытие баннера: `if(await page.locator('#learning-main-banner').isVisible()) await page.locator('#learning-main-dismiss').click();`, но во вспомогательной функции `switchRole` ([`test/test-local-workbench-launch-ui.mjs#L56-L59`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-workbench-launch-ui.mjs#L56-L59)) закрытие отсутствовало.
- **Требование**:
  1. В [`test/test-local-workbench-launch-ui.mjs#L56-L59`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-workbench-launch-ui.mjs#L56-L59) в функцию `switchRole` добавить закрытие баннера при его наличии: `if(await page.locator('#learning-main-banner').isVisible()) await page.locator('#learning-main-dismiss').click();`.
  2. В [`client/main/main-bridge.js#L322`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L322) подавлять всплытие системного модального уведомления для прерванных запросов `error?.name === 'AbortError'`.

### 1.7. Раздельная независимая порядковая нумерация заданий для Classwork и Homework
- **Проблема**: В [`client/52-lessons.js#L1271-L1279`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1271-L1279) сквозной номер задания (`Task 1`, `Task 2`, ...) вычисляется по общему массиву `lmState.blocks` без разделения по вкладкам. В результате задания в `Homework` продолжают нумерацию `Classwork` (например, задания 1–3 в `Classwork`, затем задания 4–5 в `Homework`). В редакторе [`client/52-lessons.js#L1074-L1095`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1074-L1095) локальный номер задания внутри текущей секции отсутствует.
- **Требование**:
  - Каждая секция (`Classwork` и `Homework`) должна иметь собственную изолированную нумерацию заданий от 1:
    - Во вкладке `Classwork`: `Task 1`, `Task 2`, `Task 3`, ...
    - Во вкладке `Homework`: `Task 1`, `Task 2`, `Task 3`, ...
  - Нумерация отображается как в шапке карточки редактора (`lmHead`: `Task 1 · Quiz · Gap`), так и в предпросмотре для ученика (`lmPreviewParts`: `Task 1`, `Task 2`).
  - При перемещении карточек вверх/вниз или переносе в свернутый контейнер проверенных материалов порядковые номера автоматически пересчитываются строго внутри своей вкладки.
- **Исходный код**: [`client/52-lessons.js#L963-L972`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L963-L972), [`client/52-lessons.js#L1074-L1095`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1074-L1095), [`client/52-lessons.js#L1271-L1280`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1271-L1280).

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Физически свернутый контейнер проверенных заданий (закрытое состояние)
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-physical-collapse-verified-container-closed.png)
*Скриншот 1: Непроверенные задания расположены вверху для работы учителя, а проверенные физически свернуты в единую строку внизу страницы: «▶ Verified materials & quizzes · 3 items (Click to expand)», не занимая полезное пространство экрана.*

---

### Скриншот 2: Раскрытый контейнер проверенных заданий с вложенными карточками
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-physical-collapse-verified-container-open.png)
*Скриншот 2: Раскрытый кликом контейнер проверенных материалов, в котором отображаются свернутые карточки заданий с бейджем «✓ Verified by Teacher» и кратким описанием.*

---

### Скриншот 3: Интерактивный квиз True / false с полным содержанием
![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-3-true-false-interactive-full.png)
*Скриншот 3: Исправленный предпросмотр True / false: содержательное предложение о явлении погоды, радиокнопки [ True ] / [ False ], кнопка проверки ответа и расчет балла (+1 pt).*

---

### Скриншот 4: Блокировка публикации при наличии непроверенных материалов
![Скриншот 4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-4-publish-gating-state.png)
*Скриншот 4: Заблокированная кнопка Publish с иконкой замка и поясняющим уведомлением; доступна только кнопка Save draft.*

---

### Скриншот 5: Анализ поломки True / false и целевая структура с полным минимальным контентом
![Скриншот 5](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-true-false-broken-vs-full-content.png)
*Скриншот 5: Сопоставление прежней некорректной генерации (Say: "word" с невалидным ответом) и исправленной карточки с полным утверждением.*

---

### Скриншот 6: Матрица аудита всех 20 типов квизов генератора уроков
![Скриншот 6](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-all-quiz-types-audit-matrix.png)
*Скриншот 6: Сводная матрица всех 20 типов квизов с указанием состояния полей, выявленных дефектов и требований к минимальному полному наполнению каждого типа.*

---

### Скриншот 7: Фактический снимок экрана с дефектом отображения True / false (загружен пользователем)
![Скриншот 7](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-user-reported-broken-tf.png)
*Скриншот 7: Снимок экрана пользователя, демонстрирующий проблему текущего отображения: устаревший шаблон Say: "superstition", вертикальные смещенные радио-кружки и кнопка Check вместо утвержденного дизайна.*

---

## 3. Этапы и контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Блокировка публикации при наличии непроверенных блоков:
  - Вычисление флага `hasUnverified` в `lmSyncTeacherVerifySummary()`.
  - Установка атрибутов `disabled = true`, класса `is-disabled` и `title` на кнопку `#lmPublish`.
  - Защита обработчика клика `#lmPublish` с выводом уведомления `Cannot publish: verify all lesson materials first`.
- 🟩 **Этап 2**: Автоматическое сворачивание и бейдж верификации в шапке:
  - При установке отметки `[data-block-teacher-verified]` выставление `block.collapsed = true`.
  - В функции `lmHead()` рендеринг бейджа `<span class="lm-verified-badge" title="Verified by Teacher">✓ Verified by Teacher</span>` рядом с типом блока.
- 🟩 **Этап 3**: Порядок отображения заданий (новые вверху, проверенные внизу):
  - Сортировка блоков текущей секции при отображении: карточки с `teacherVerified !== true` выводятся первыми, карточки с `teacherVerified === true` выводятся в конце.
  - Добавление вновь сгенерированных блоков в начало списка секции.
  - Динамическое перемещение блока вниз при клике на чекбокс верификации с перерисовкой редактора.
- 🟩 **Этап 4**: Выделенная генерация и интерактивность квиза `True / false`:
  - Генерация содержательного предложения `prompt` и валидного ответа `answer: "true"` или `"false"`.
  - Рендеринг интерактивных кнопок выбора `[ True ]` и `[ False ]` в `lmPreviewBlock()`, обработка проверки и начисление баллов.
- 🟩 **Этап 5**: Обеспечение полного минимального контента для остальных 16 типов квизов (`Type`, `Definition`, `Odd one out`, `Select all`, `Build`, `Tap`, `Reverse`, `Flip`, `Smart Flashcard`, `Memory`, `Listen`).
- 🟩 **Этап 6**: Сборка рабочих файлов и продакшн-ассетов:
  - Запуск `npm run build:preview`.
  - Запуск `node ops/build-learning-production-assets.mjs`.
- 🟩 **Этап 7**: Разработка автоматизированных тестов:
  - Создание тестов в `test/test-lesson-task55-unified.mjs` с проверкой блокировки публикации, автосворачивания, порядка сортировки карточек и работы True / false.
- 🟩 **Этап 8**: Итоговая верификация и подготовка обобщенного коммита.
- 🟩 **Этап 9**: Устранение перехвата кликов модальным диалогом `#learning-main-banner` в `test/test-local-workbench-launch-ui.mjs` и подавление модальных алертов при `AbortError` в `client/main/main-bridge.js`.
- 🟩 **Этап 10**: Физическое сворачивание всех проверенных заданий секции в единый раскрываемый контейнер `<details class="lm-verified-accordion">` внизу страницы, освобождающий все экранное пространство для активных заданий.
- 🟩 **Этап 11**: Раздельная независимая порядковая нумерация заданий для `Classwork` и `Homework` (`Task 1`, `Task 2`, ...) в редакторе карточек и в предпросмотре урока.
- 🟩 **Этап 12**: Доведение верстки карточки `True / false` до точного соответствия утвержденному макету (Скриншот 3 / Скриншот 5): стилизованные горизонтальные кнопки-плашки `[ True ]` и `[ False ]`, контейнер утверждения, нормализация старых prompt'ов `Say: "..."` и кнопка `Check answer` с блоком баллов.
