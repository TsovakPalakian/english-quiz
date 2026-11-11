# План стабилизации: Устранение регрессий в тестах импорта PDF и авто-расширения скрипта

## 1. Точная формулировка проблемы (Problem Statement)

При запуске полного набора тестов выявлены ошибки в 4 тестовых файлах:
1. `test/test-client-pdf-import.mjs` (строки 138 и 214):
   - Ошибка: `ReferenceError: lmDetectCefrLevel is not defined at Window.lmParseScriptToLessonData (client/52b-lesson-pdf-import.js#L874)`.
   - Причина: `test/test-client-pdf-import.mjs` извлекает только изолированные функции через AST-экстрактор (`extractFunctions`), куда не была включена функция `lmDetectCefrLevel`. Внутри `lmParseScriptToLessonData` обращение к `lmDetectCefrLevel` происходило напрямую без проверки существования функции в текущем скоупе `typeof lmDetectCefrLevel === 'function'`.
2. `test/test-grammar-enrichment.mjs` (строка 72) и `test/test-lesson-pdf-editor.mjs` (строка 35):
   - Ошибка: `TypeError: document.getElementById is not a function at lmInitScriptInputAutoExpand (client/52b-lesson-pdf-import.js#L1685)`.
   - Причина: при загрузке скрипта в изолированном контексте `node:vm` объект `document` инициализирован как пустая заглушка без метода `getElementById`. Верхнеуровневый вызов `lmInitScriptInputAutoExpand()` приводил к падению.
3. `test/test-lesson-script-and-document.mjs` (строка 408):
   - Ошибка: `TypeError: Cannot read properties of undefined (reading 'autoExpandInit') at lmInitScriptInputAutoExpand (client/52b-lesson-pdf-import.js#L1686)`.
   - Причина: в мок-окружении Happy-DOM / jsdom элемент `#lmScriptInput` не содержал свойства `dataset`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Запрет регрессий**:
  > <span style="color: red; font-weight: bold;">WARNING</span>
  > Запрещено модифицировать или нарушать функционал парсинга уроков, CEFR-детекции и авто-расширения текстового поля в реальном браузере. Изменения должны исключительно обеспечивать безопасную работу в любых мок-окружениях и изолированных контекстах `node:vm`.

- **Затронутые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): добавление защитных условий `typeof document.getElementById === 'function'`, безопасного доступа к `input.dataset` и проверки `typeof lmDetectCefrLevel === 'function'`.
  - [`test/test-client-pdf-import.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-client-pdf-import.mjs): регистрация `'lmDetectCefrLevel'` в списке экстрактора `IMPORT_PDF_FUNCTIONS`.

---

## 3. Чек-лист реализации (Implementation Checklist)

- 🟩 **Этап 1**: Безопасный вызов `lmDetectCefrLevel` в `client/52b-lesson-pdf-import.js` и регистрация `'lmDetectCefrLevel'` в `test/test-client-pdf-import.mjs`.
- 🟩 **Этап 2**: Защита `lmAutoExpandScriptInput` и `lmInitScriptInputAutoExpand` от отсутствующих методов DOM (`document.getElementById`, `input.dataset`, `input.addEventListener`).
- 🟩 **Этап 3**: Безопасный вызов при инициализации скрипта с проверкой готовности DOM.
- 🟩 **Этап 4**: Пересборка проекта через команду `npm run build:preview`.
- 🟩 **Этап 5**: Прогон 4 тестовых наборов (`test/test-client-pdf-import.mjs`, `test/test-grammar-enrichment.mjs`, `test/test-lesson-pdf-editor.mjs`, `test/test-lesson-script-and-document.mjs`) и 10 целевых наборов задачи.

---

## 4. Детерминированный метод верификации (Verification Method)

```bash
node --test \
  test/test-client-pdf-import.mjs \
  test/test-grammar-enrichment.mjs \
  test/test-lesson-pdf-editor.mjs \
  test/test-lesson-script-and-document.mjs
npm run build:preview
```

---

## 5. Утвержденные визуальные макеты (Screenshots & Mockups)

### Скриншот 1: Автоматическое расширение текстового поля `#lmScriptInput`
![Скриншот 1](/Users/tsovakpalakian/.gemini/antigravity/brain/8395590f-4612-46a7-937c-8e16daeef3e9/mockup_autoexpand_script.png)
*Скриншот 1: Безопасное авто-расширение высоты текстового поля без сбоев при отсутствии DOM-окружения.*

### Скриншот 2: Автоматическое определение уровня CEFR
![Скриншот 2](/Users/tsovakpalakian/.gemini/antigravity/brain/8395590f-4612-46a7-937c-8e16daeef3e9/mockup_automatic_group_level_inheritance.png)
*Скриншот 2: Автоматическое извлечение уровня группы с fallback-значением B1.*
