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

### 1.2. Автоматическое сворачивание проверенных блоков со статусом в шапке
- **Проблема**: При выставлении отметки `[✓] Verified by Teacher` в [`client/52-lessons.js#L1996-L2005`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1996-L2005) карточка остается развернутой, загромождая экран. В шапке блока [`client/52-lessons.js#L957-L965`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L957-L965) статус верификации отсутствует.
- **Требование**: При установке чекбокса верификации карточка автоматически сворачивается (`block.collapsed = true`), а в шапке блока (`.lm-block-head`) отображается зеленый бейдж `✓ Verified by Teacher`, видимый в свернутом состоянии.
- **Исходный код**: [`client/52-lessons.js#L957-L965`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L957-L965), [`client/52-lessons.js#L1996-L2005`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1996-L2005).

### 1.3. Приоритетный порядок квизов: непроверенные вверху, проверенные смещены вниз
- **Проблема**: В [`client/52-lessons.js#L616-L619`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L616-L619) блоки выводятся в порядке их физического добавления в массив. Преподавателю приходится прокручивать проверенные задания, чтобы найти новые.
- **Требование**:
  - Все новые и еще не проверенные квизы (`!block.teacherVerified`) располагаются в верхней части списка секции.
  - Вновь сгенерированные блоки добавляются наверх секции.
  - При подтверждении проверки карточка закрывается и смещается вниз списка секции к проверенным заданиям.
- **Исходный код**: [`client/52-lessons.js#L616-L619`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L616-L619), [`client/52-lessons.js#L1067-L1089`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1067-L1089).

### 1.4. Исправление генерации и работы квиза True / false
- **Проблема**: В генераторе [`client/52-lessons.js#L3113-L3129`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3113-L3129) в поле `prompt` записывается речевой шаблон `"Say: \"...\""`, а в `answer` попадает строковое значение целевого слова вместо булева значения. В предпросмотре [`client/52-lessons.js#L1213`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1213) карточка отображается как статическая строка без кнопок выбора и проверки.
- **Требование**: Выделенная ветка генератора для `True / false` с содержательным утверждением `prompt` о значении слова или контекстном предложении, строго валидным ответом `answer: "true"` или `"false"`, интерактивными кнопками выбора `[ True ]` и `[ False ]` в предпросмотре, мгновенной проверкой и выводом результата.
- **Исходный код**: [`client/52-lessons.js#L651`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L651), [`client/52-lessons.js#L1213`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1213), [`src/quiz-review-content.mjs#L43`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review-content.mjs#L43).

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

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Блокировка кнопки Publish при наличии непроверенных материалов
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-publish-button-disabled-unverified.png)
*Скриншот 1: Неактивная кнопка Publish с иконкой замка и поясняющим баннером; активна только кнопка Save draft.*

---

### Скриншот 2: Автосворачивание проверенных блоков со статусом в шапке
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-verified-blocks-collapsed-status.png)
*Скриншот 2: Свернутые блоки с зеленым бейджем «✓ Verified by Teacher» в шапке карточки и раскрываемый контейнер проверенных материалов.*

---

### Скриншот 3: Расположение квизов в редакторе — новые вверху, проверенные смещены вниз
![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-verified-quizzes-shifted-down.png)
*Скриншот 3: Организация списка заданий в редакторе — нерассмотренные квизы находятся в верхней части списка, проверенные квизы автоматически сворачиваются и смещаются в нижнюю часть с бейджем «✓ Verified by Teacher».*

---

### Скриншот 4: Динамический переход при проверке задания преподавателем
![Скриншот 4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-verification-flow-shift-down.png)
*Скриншот 4: Пошаговая демонстрация смещения — после клика на чекбокс верификации карточка закрывается и перемещается вниз к проверенным заданиям, поднимая следующее требующее проверки задание наверх.*

---

### Скриншот 5: Анализ поломки True / false и целевая структура с полным минимальным контентом
![Скриншот 5](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-true-false-broken-vs-full-content.png)
*Скриншот 5: Сопоставление текущей некорректной генерации (Say: "word" с невалидным ответом) и исправленной карточки с полным утверждением, интерактивными кнопками True/False, проверкой и мгновенным начислением балла.*

---

### Скриншот 6: Матрица аудита всех 20 типов квизов генератора уроков
![Скриншот 6](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-all-quiz-types-audit-matrix.png)
*Скриншот 6: Сводная матрица всех 20 типов квизов с указанием текущего состояния полей, выявленных дефектов и требований к минимальному полному наполнению каждого типа.*

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
