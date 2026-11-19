# План удаления дублирующей плавающей панели (Floating Action Bar) из диалога Review PDF Draft

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно удаления плавающей панели `#lmPdfDraftFloatingBar` (`.lm-pdf-floating-bar`) из диалога предпросмотра черновика урока (`Review PDF lesson draft` / `Review lesson draft`), так как она дублирует существующие кнопки в шапке и подвале формы.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Извлечение и парсинг структуры PDF (`lmPdfDraftBlocks`, `lmPdfIncomingBlocks`, `lmPdfBlockBudget`).
> - Работу аккордеонов секций (`Basic information`, `Overview`, `Words`, `Phrases`, `Rules`, `Classwork`, `Homework`, `Lesson PDF`) и их чекбоксов.
> - Существующие кнопки в шапке диалога (`.lm-pdf-quick-cancel` и `.lm-pdf-quick-apply`) и в подвале диалога (`cancel`, `apply`).
> - Логику применения выбранных разделов в черновик урока (`apply.onclick`).
> - Логику генерации заданий, сохранения уроков и авторизацию.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Устранение дублирующей всплывающей/плавающей панели (`#lmPdfDraftFloatingBar`)**:
   - Во время ревью сгенерированного черновика урока в нижней части экрана поверх футера отображалась фиксированная плавающая плашка с бейджем количества секций, счетчиком элементов и кнопками `Cancel` и `Apply selected sections to draft`.
   - Эти действия полностью дублируют кнопки, уже размещенные в шапке формы ревью (`Cancel`, `✓ Apply to draft`) и в нижней части диалога (`Cancel`, `Apply selected sections to draft`).
   - Панель перекрывает полезное пространство страницы и элементы футера («© 2026 Lumiscia. All rights reserved.»).

2. **Объем изменений**:
   - В [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): удалить генерацию и монтирование `#lmPdfDraftFloatingBar` (`.lm-pdf-floating-bar`), обработчики кликов на ее кнопках и очистку несуществующего элемента. Сохранить динамическое обновление счетчика в существующей кнопке шапки `.lm-pdf-quick-apply` и подвала `apply`.
   - В [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): удалить неиспользуемые стили `.lm-pdf-floating-bar`, `.lm-pdf-floating-info`, `.lm-pdf-floating-badge`, `.lm-pdf-floating-text`, `.lm-pdf-floating-actions`, `.lm-pdf-floating-cancel`, `.lm-pdf-floating-apply`, медиа-запросы для них, а также отступ `margin-bottom: 70px;` у `.lm-import-methods.is-reviewing-draft`.
   - В тестах ([`test/test-task-22-pdf-draft-flow-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs)): адаптировать проверки взаимодействия под существующие кнопки шапки (`.lm-pdf-quick-cancel`, `.lm-pdf-quick-apply`) и подвала формы.
   - Тест [`test/test-agreed-lesson-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-agreed-lesson-flow.mjs) уже содержит инвариант `assert.doesNotMatch(pdf, /id='lmPdfDraftFloatingBar'/);`, который будет полностью удовлетворен.
   - Выполнить пересборку клиентских ассетов `npm run build:preview`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js)
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) (пересборка)
  - [`test/test-task-22-pdf-draft-flow-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs)

- **Инварианты**:
  - Кнопка закрытия/отмены `Cancel` в шапке закрывает диалог без применения изменений.
  - Кнопка `✓ Apply to draft (N)` в шапке и `Apply selected sections to draft (N)` в подвале применяют выбранные секции в открытый урок.
  - Количество элементов `(N)` динамически пересчитывается при переключении чекбоксов секций.
  - Никакой фиксированный тулбар не перекрывает нижнюю область экрана.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование плана и визуальных кадров интерфейса без всплывающей панели.
- 🟩 **Этап 2**: Удаление разметки и обработчиков `#lmPdfDraftFloatingBar` в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js).
- 🟩 **Этап 3**: Очистка стилей плавающей панели в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и сборка `npm run build:preview`.
- 🟩 **Этап 4**: Актуализация тестов [`test/test-task-22-pdf-draft-flow-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs).
- 🟩 **Этап 5**: Восстановление точного контракта текста кнопки подвала `Apply selected sections to draft` в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js) без динамического суффикса для стабильности тестов [`test/test-client-pdf-import.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-client-pdf-import.mjs).
- 🟩 **Этап 6**: Финальная валидация тестовых наборов и подготовка единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Верхняя часть формы ревью черновика в теме Sky без всплывающей панели (кнопки Cancel и Apply to draft расположены в шапке):**
![Скриншот 1: Верхняя часть формы ревью черновика в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-1-sky.png)

### Скриншот 2
**Нижняя часть формы ревью черновика в теме Sky без всплывающей панели (кнопки Cancel и Apply selected sections to draft в подвале формы, футер свободен):**
![Скриншот 2: Нижняя часть формы ревью черновика в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-4-bottom-sky.png)

### Скриншот 3
**Форма ревью черновика в теме Dark без всплывающей панели:**
![Скриншот 3: Форма ревью черновика в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-2-dark.png)

### Скриншот 4
**Форма ревью черновика в светлой теме Light без всплывающей панели:**
![Скриншот 4: Форма ревью черновика в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-3-light.png)
