# План унификации интерфейса Manual Script: переход на единую штатную форму Review lesson draft

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается удаления отдельного промежуточного экрана согласования команд `#lmScriptApprovalWrap` (`Approval Gate`) и перевода генерации из вкладки `Manual Script` на единую штатную форму предпросмотра черновика урока (`Review lesson draft` / `#lmPdfDraftDialog`).
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Извлечение и парсинг текста из файлов PDF, URL или ручного скрипта (`lmParseScriptToLessonData`, `normalizeLessonPdfDraft`).
> - Автоматический перевод выражений и подбор контекстных примеров в модели генерации.
> - Работу единой штатной формы предпросмотра черновика урока (`#lmPdfDraftDialog`) и ее аккордеонов.
> - Механизм применения разделов в открытый урок (`apply.onclick`).
> - Авторизацию, права редактирования и сохранение структуры уроков.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Отказ от отдельного экрана Approval Gate в пользу единого штатного интерфейса**:
   - Ранее при вводе команд добавления лексики в поле `#lmScriptInput` (вкладка `Manual Script`) открывалась специальная таблица предварительного одобрения `#lmScriptApprovalWrap` с плашкой `AI Intent Detected` и кнопкой `Approve & Add to Lesson`.
   - Пользователь утвердил отказ от этой отдельной страницы и переход на единый для всех источников сценарий: показ стандартного диалога [`Review lesson draft`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1026) ([Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-1-sky.png)).
   - При вводе любого текста во вкладке `Manual Script` сгенерированные слова, фразы, правила и упражнения отображаются в единой форме с секциями аккордеона, где преподаватель видит состав материалов и применяет их кнопкой `✓ Apply to draft`.

2. **Объем изменений**:
   - В [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): удалить ответвление `isCommandPrompt` и вызов `lmMountScriptApprovalGate`, чтобы результат обработки текста всегда передавался в [`lmMountLessonDraftDialog`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1026). Удалить неиспользуемые функции рендеринга изолированной таблицы `lmMountScriptApprovalGate` и `lmExecuteCommandApproval`.
   - В [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): удалить неиспользуемую разметку `#lmScriptApprovalWrap` и `#lmScriptSuccessWrap`.
   - В тестах ([`test/test-manual-script-ai-agent.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-manual-script-ai-agent.mjs)): обновить проверки, подтвердив открытие штатного диалога `#lmPdfDraftDialog` вместо `#lmScriptApprovalWrap`.
   - Пересобрать ассеты через `npm run build:preview`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js)
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) (пересборка)
  - [`test/test-manual-script-ai-agent.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-manual-script-ai-agent.mjs)

- **Инварианты**:
  - Распознанные слова и фразы корректно извлекаются из текста сценария и переводятся на русский язык.
  - После нажатия `Generate tasks` / `Generate lesson` открывается штатный диалог `#lmPdfDraftDialog`.
  - В диалоге разделы `Words`, `Phrases` и `Rules` содержат сгенерированные элементы с возможностью редактирования и выбора чекбоксами.
  - По нажатию `✓ Apply to draft` элементы переносятся в структуру открытого урока.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование плана и визуального кадра штатной формы предпросмотра черновика урока.
- ⬜ **Этап 2**: Удаление отдельной ветки `isCommandPrompt` и вспомогательных функций таблицы одобрения в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js).
- ⬜ **Этап 3**: Очистка контейнера `#lmScriptApprovalWrap` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) и сборка `npm run build:preview`.
- ⬜ **Этап 4**: Актуализация тестового сценария [`test/test-manual-script-ai-agent.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-manual-script-ai-agent.mjs) и проверка прохождения тестов.
- ⬜ **Этап 5**: Финальная валидация и подготовка единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Утвержденная единая штатная форма Review lesson draft в теме Sky без отдельных окон:**
![Скриншот 1: Единая штатная форма Review lesson draft](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-1-sky.png)

### Скриншот 2
**Нижняя часть штатной формы Review lesson draft в теме Sky:**
![Скриншот 2: Нижняя часть штатной формы Review lesson draft](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-4-bottom-sky.png)

### Скриншот 3
**Штатная форма Review lesson draft в теме Dark:**
![Скриншот 3: Штатная форма Review lesson draft в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-floating-bar-screenshot-2-dark.png)
