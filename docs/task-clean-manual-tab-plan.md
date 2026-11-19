# План очистки вкладки Manual Script от вспомогательных текстовых надписей и плашек

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно удаления текстовой метки `Enter lesson script, notes, or natural language command:` и информационной плашки `Natural Language Command Execution: ...` на вкладке `Manual Script`, а также блока голосового режима `#lmVoiceModeBar`.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Работу поля ввода сценария `#lmScriptInput` и кнопок быстрых шаблонов `+ Grammar Rule`, `+ Vocabulary List`, `+ Dialogue / Text`.
> - Логику генерации заданий `lmGenerateLessonFromScript` и парсинг текста.
> - Работу вкладок `File / PDF`, `Web URL`, `Complement Current Lesson`.
> - Логику сохранения блоков уроков в D1/R2.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Удаление текстовой метки над полем ввода**:
   - В файле [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) удаляется тег `<label for="lmScriptInput">Enter lesson script, notes, or natural language command:</label>`.
   - Кнопки быстрых шаблонов (`.lm-quick-templates`) выравниваются по правому краю над текстовой областью.

2. **Удаление информационной плашки Natural Language Command**:
   - В файле [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) удаляется контейнер `.lm-note-box` с текстом `🤖 Natural Language Command Execution: Write in Russian or English...`.

3. **Удаление плашки Voice Mode**:
   - Удаляется блок `#lmVoiceModeBar` в подвале блока импорта.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): удаление метки над `#lmScriptInput`, плашки `.lm-note-box` и блока `#lmVoiceModeBar`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): гармонизация отступов в блоке `.lm-script-container`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Поле `#lmScriptInput` сохраняет `id`, плейсхолдер и обработчики ввода.
  - Кнопка генерации `#lmGenerateFromScriptBtn` сохраняет функциональность.
  - Кнопки быстрых шаблонов `data-template` корректно подставляют текст в поле ввода.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование очищенного кадра вкладки Manual Script в темах Sky, Dark и Light.
- ⬜ **Этап 2**: Удаление метки `<label for="lmScriptInput">` и блока `.lm-note-box` из [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- ⬜ **Этап 3**: Удаление блока `#lmVoiceModeBar` из [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- ⬜ **Этап 4**: Пересборка клиентских и производственных ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 5**: Прогон целевых тестов `test/test-client-pdf-import.mjs`, `test/test-agreed-lesson-flow.mjs`.
- ⬜ **Этап 6**: Финализация задачи и предоставление единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Очищенная вкладка Manual Script в теме Sky (надписи и плашки удалены, свободный интерфейс с быстрыми шаблонами):**
![Скриншот 1: Вкладка Manual Script в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-clean-manual-tab-screenshot-1-sky.png)

### Скриншот 2
**Очищенная вкладка Manual Script в теме Dark (полная контрастность, читаемость темы оформления):**
![Скриншот 2: Вкладка Manual Script в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-clean-manual-tab-screenshot-2-dark.png)

### Скриншот 3
**Очищенная вкладка Manual Script в светлой теме Light:**
![Скриншот 3: Вкладка Manual Script в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-clean-manual-tab-screenshot-3-light.png)
