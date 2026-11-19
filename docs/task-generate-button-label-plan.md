# План замены текста кнопки генерации на «Generate»

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно текста кнопки генерации (`#lmGenerateFromScriptBtn`), где текст заменяется на лаконичное `Generate` вместо составных `Generate task` / `Generate tasks` / `Generate lesson`.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Обработчик клика кнопки запуска генерации `lmGenerateLessonFromScript`.
> - Логику валидации заполненности ввода сценария `syncScriptBtn`.
> - Логику генерации заданий, сохранения уроков и авторизацию преподавателя.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Замена надписи на кнопке на «Generate»**:
   - В файле [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3918-L3923) и [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L777) текст кнопки `#lmGenerateFromScriptBtn` унифицируется до единого лаконичного слова:
     `Generate`
   - Исключаются вариативные окончания и составные фразы (`Generate tasks`, `Generate task`, `Generate lesson`).

2. **Сохранение привязок и тестов**:
   - Адаптация проверок в [`test/test-lesson-import-button-label.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-button-label.mjs) под новое значение `Generate`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): установка `btn.textContent = "Generate";`.
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): статическое значение текста кнопки `Generate`.
  - [`test/test-lesson-import-button-label.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-button-label.mjs): актуализация ожидаемого текста кнопки.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Кнопка остается неактивной (disabled), пока поле ввода сценария пусто.
  - Кнопка активируется сразу при появлении текста в поле ввода или выборе шаблона.
  - Нажатие на кнопку отправляет сценарий на генерацию и запускает процесс импорта.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование кадра кнопки со значением «Generate» в темах Sky, Dark и Light.
- ⬜ **Этап 2**: Обновление функции синхронизации текста кнопки в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) и шаблона [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- ⬜ **Этап 3**: Актуализация тестового сценария [`test/test-lesson-import-button-label.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-button-label.mjs).
- ⬜ **Этап 4**: Пересборка клиентских и производственных ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 5**: Прогон целевых тестов.
- ⬜ **Этап 6**: Финализация задачи и предоставление единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Кнопка с надписью Generate в теме Sky:**
![Скриншот 1: Кнопка с надписью Generate в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-generate-btn-screenshot-1-sky.png)

### Скриншот 2
**Кнопка с надписью Generate в теме Dark (полная контрастность и гармония с темой):**
![Скриншот 2: Кнопка с надписью Generate в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-generate-btn-screenshot-2-dark.png)

### Скриншот 3
**Кнопка с надписью Generate в светлой теме Light:**
![Скриншот 3: Кнопка с надписью Generate в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-generate-btn-screenshot-3-light.png)
