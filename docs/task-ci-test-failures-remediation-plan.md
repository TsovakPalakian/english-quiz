# План устранения регрессионных сбоев CI-тестов (`test-lesson-pdf-ui.mjs`, `test-exams-ui.mjs`, `test-task-22-pdf-draft-flow-ui.mjs`)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые исправления строго и изолированно затрагивают исключительно три обнаруженные причины падения тестов: адаптивный перенос кнопок в мобильном вьюпорте редактора (`320px`) в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) и сохранение признака предвыбора секций `metadata` и `overview` для бинарного импорта PDF (`!isDocument`) в диалоге [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js). База данных, авторизация, логика Gemini AI, режим плеера и другие компоненты не модифицируются.

---

## 1. Точная формулировка проблем (Problem Statement)

1. **`test/test-exams-ui.mjs:162:12` — `AssertionError: Exam editor fits 320`**:
   - **Код**: [`site/preview.html:841-846`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L841-L846).
   - **Причина**: панель нижних кнопок действий в `#material` (`Preview`, `🎯 Focus Mode`, `🎙️ Voice Mode`, `✓ Approve All`) скомпонована как `<div style="display:flex; gap:8px; align-items:center;">` без свойства `flex-wrap: wrap;`. Суммарная ширина четырех кнопок в одну строку составляет `348px`, что превышает доступную ширину контейнера `#material` (`288px` при вьюпорте `320px`), вызывая горизонтальное переполнение (`scrollWidth > clientWidth`).
   - **Решение**: добавить `flex-wrap: wrap;` в контейнер кнопок панели действий в [`site/preview.html:841`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L841).

2. **`test/test-task-22-pdf-draft-flow-ui.mjs:161:12` — `AssertionError: Floating badge must update when section checkbox changes` (`actual: '5 sections selected'`, `expected: notStrictEqual`)**:
   - **Код**: [`client/52b-lesson-pdf-import.js:1078-1093`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1078-L1093).
   - **Причина**: переменная `isNonEmptyLesson` вычислялась как `Boolean(current && ((current.blocks || []).length > 0 || current.title || current.description))`, из-за чего для любого существующего урока (включая фикстуру `lesson 31` в тесте) секции `metadata` и `overview` создавались со снятыми чекбоксами (`checked: !isNonEmptyLesson` = `false`). При попытке теста снять чекбокс первой секции (`firstCheckbox.uncheck()`) состояние элемента не менялось (он уже был выключен), счетчик оставался равным 5, и тест падал.
   - **Решение**: ограничить признак `isNonEmptyLesson` исключительно сценарием генерации из текстовых скриптов и документов (`isDocument`), сохранив для бинарных PDF (`!isDocument`) исходное контрактное поведение со всеми 7 выбранными секциями:
     `const isNonEmptyLesson = Boolean(isDocument && current && ((current.blocks || []).length > 0 || current.title || current.description));`

3. **`test/test-lesson-pdf-ui.mjs:195:133` — `AssertionError: Missing section overview`**:
   - **Код**: [`client/52b-lesson-pdf-import.js:1089-1093`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1089-L1093), [`test/test-lesson-pdf-ui.mjs:184-195`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-pdf-ui.mjs#L184-L195).
   - **Причина**: аналогично п. 2, при повторном импорте PDF в существующий урок секция `overview` оставалась невыбранной по умолчанию (`!isNonEmptyLesson` = `false`). Тест на шаге 03 включал только `details.first()` (`metadata`) и нажимал кнопку применения, в результате чего блок обзора темы не попадал в урок (`Missing section overview`).
   - **Решение**: применение исправления из п. 2 восстанавливает выбор секции `overview` по умолчанию для импорта PDF (`!isDocument`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): добавление `flex-wrap: wrap;` в контейнер нижних кнопок действий в блоке `#material`.
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): условие `isDocument && current && ...` для изоляции правила исключения первых двух секций только для генерации из текстовых сценариев / документов, сохраняя полный выбор секций для PDF-импорта.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка через команду `npm run build:preview`.
  - [`rollback/production-assets/`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/rollback/production-assets/): актуализация локальных продакшен-ассетов через `node ops/build-learning-production-assets.mjs`.

- **Инварианты**:
  - Сохранение генерации уроков и экзаменов без ошибок.
  - Сохранение полной адаптивности редактора экзаменов на всех контрольных разрешениях (`1280px`, `390px`, `320px`).
  - Сохранение правила TASK-53: при генерации из сценария в существующий урок (`isDocument === true`) первые две секции (`metadata`, `overview`) не перезаписываются по умолчанию.

---

## 3. Чек-лист реализации (Implementation Checklist)

- 🟩 **Этап 1**: Добавление `flex-wrap: wrap;` в контейнер кнопок действий редактора материалов в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- 🟩 **Этап 2**: Корректировка условия `isNonEmptyLesson` в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js) с учетом флага `isDocument`.
- 🟩 **Этап 3**: Пересборка предпросмотра через `npm run build:preview` и сборка локальных продакшен-ассетов через `node ops/build-learning-production-assets.mjs`.
- 🟩 **Этап 4**: Запуск детерминированной верификации трех тестовых наборов:
  `node ops/check-all.mjs test-exams-ui`
  `node test/test-lesson-pdf-ui.mjs`
  `node test/test-task-22-pdf-draft-flow-ui.mjs`
- 🟩 **Этап 5**: Верификация смежных тестов генератора (`test-lesson-import-button-label.mjs`, `test-lesson-import-cefr-and-scoring.mjs`, `test-client-pdf-import.mjs`, `test-lesson-visual-components.mjs`).

---

## 4. Визуальные макеты и скриншоты (Screenshots & Mockups)

### Скриншот 1: Адаптивный перенос кнопок редактора экзаменов при ширине вьюпорта 320px
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-53-ci-fix-screenshot-1-exam-editor-320.png)
*Скриншот 1: Корректный перенос кнопок действий Preview, Focus Mode, Voice Mode, Approve All без горизонтального скролла (`node.scrollWidth <= node.clientWidth + 1`).*

### Скриншот 2: Предвыбор всех секций по умолчанию при импорте PDF-файла
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-53-ci-fix-screenshot-2-pdf-draft-sections.png)
*Скриншот 2: Диалог черновика PDF с активными чекбоксами Basic information и Overview и плавающей панелью «7 sections selected».*

---

## 5. Изоляция состава коммита 051efb18 (Commit Scope Cleanup)

- **Целевые файлы задачи (оставляем в коммите)**:
  1. [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js)
  2. [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)
  3. [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js)
  4. [`test/test-lesson-visual-components.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-visual-components.mjs)
  5. [`docs/task-ci-test-failures-remediation-plan.md`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-ci-test-failures-remediation-plan.md)
  6. [`docs/task-53-ci-fix-screenshot-1-exam-editor-320.png`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-53-ci-fix-screenshot-1-exam-editor-320.png)
  7. [`docs/task-53-ci-fix-screenshot-2-pdf-draft-sections.png`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-53-ci-fix-screenshot-2-pdf-draft-sections.png)

- **Посторонние файлы (извлекаются из коммита обратно в рабочую копию)**:
  - 31 файл документации и скриншотов других задач (караоке, старые таски 22–28, баг-репорты).

- **Чек-лист очистки**:
  - 🟩 **Этап 6**: Мягкий откат коммита `git reset HEAD~1` для сохранения файлов на диске без потери данных.
  - 🟩 **Этап 7**: Сброс индекса и добавление в staging строго 7 целевых файлов задачи.
  - 🟩 **Этап 8**: Восстановление затронутых тестами верификационных скриншотов (`task-40`, `task-42`, `task-44`, `task-telegram`).
