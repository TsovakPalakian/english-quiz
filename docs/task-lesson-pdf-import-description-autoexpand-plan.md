# План реализации автоматического расширения текстовых областей Description и Overview в черновике урока

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: авто-расширение полей описания и обзора (`data-pdf-field="description"`, `data-pdf-field="overview"`) в модальном окне черновика урока [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js), тему открытого аккордеона в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и соответствующие тесты в `test/test-lesson-pdf-import-autoexpand.mjs`.

---

## 1. Утвержденные кадры интерфейса

### Скриншот 1: Утвержденный шаблон секции Basic information в теме Sky (`data-theme="sky"`)
![Скриншот 1: Утвержденный шаблон секции Basic information в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-1-sky.png)
*Скриншот 1: Поле Description автоматически расширено по высоте до полного объема текста без вертикального скроллбара в теме Sky.*

### Скриншот 2: Утвержденный шаблон секции Basic information в теме Dark (`data-theme="dark"`)
![Скриншот 2: Утвержденный шаблон секции Basic information в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-2-dark.png)
*Скриншот 2: Контрастное отображение блока Basic information и расширенного поля Description в теме Dark.*

### Скриншот 3: Утвержденный шаблон секции Basic information в теме Sand (`data-theme="sand"`)
![Скриншот 3: Утвержденный шаблон секции Basic information в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-3-sand.png)
*Скриншот 3: Отображение блока Basic information в независимой светлой теме Sand.*

### Скриншот 4: Утвержденный шаблон секции Overview в теме Sky (`data-theme="sky"`)
![Скриншот 4: Утвержденный шаблон секции Overview в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-4-overview-sky.png)
*Скриншот 4: Поле Lesson overview автоматически расширено под 5 строк текста без вертикального скроллбара в теме Sky.*

### Скриншот 5: Утвержденный шаблон секции Overview в теме Dark (`data-theme="dark"`)
![Скриншот 5: Утвержденный шаблон секции Overview в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-5-overview-dark.png)
*Скриншот 5: Контрастное отображение блока Overview и расширенного поля Lesson overview в теме Dark.*

### Скриншот 6: Утвержденный шаблон секции Overview в теме Sand (`data-theme="sand"`)
![Скриншот 6: Утвержденный шаблон секции Overview в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-lesson-pdf-import-screenshot-6-overview-sand.png)
*Скриншот 6: Отображение блока Overview в светлой теме Sand.*

---

## 2. Точная формулировка проблемы и анализ первопричины

1. **Ограниченная высота и скроллбар в поле Description**:
   - В [`client/52b-lesson-pdf-import.js#L1133`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1133) поле `<textarea class="saas-textarea" data-pdf-field="description" style="min-height:60px">` имело фиксированную минимальную высоту без обработчика авто-расширения, приводя к скрытию текста за вертикальным скроллбаром.
2. **Ограниченная высота и скроллбар в поле Lesson overview**:
   - В [`client/52b-lesson-pdf-import.js#L1141`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1141) поле `<textarea class="saas-textarea" data-pdf-field="overview" style="min-height:96px">` аналогично не подстраивало высоту под объем текста.
3. **Белый фон открытого аккордеона в темных темах**:
   - В [`site/preview.css#L4704`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4704) свойство `.lm-pdf-draft details[open]` содержало фиксированное значение `background: #ffffff`, нарушавшее цветовую схему темной темы.

---

## 3. Границы области изменений и инварианты

1. **Изоляция изменений**:
   - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): добавление изолированной функции `lmAutoExpandTextarea(el, minHeight)` и привязка к полям `description` и `overview` при рендере и по событиям `'input'` и `'change'`.
   - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): замена фиксированного `#ffffff` на `var(--saas-card, #ffffff)` в селекторе `.lm-pdf-draft details[open]`.
2. **Инварианты**:
   - Сохранение полной функциональности сбора данных черновика урока при клике на кнопку подтверждения;
   - Сохранение валидации длины текста через `maxlength="2400"`;
   - Безопасная работа функции в изолированных контекстах `node:vm` без DOM.

---

## 4. Контрольный чек-лист этапов реализации

- 🟩 **Этап 1: Реализация функции lmAutoExpandTextarea и подключение к полям в client/52b-lesson-pdf-import.js**
- 🟩 **Этап 2: Адаптация темы открытого аккордеона в site/preview.css**
- 🟩 **Этап 3: Создание автоматизированных модульных и визуальных тестов в test/test-lesson-pdf-import-autoexpand.mjs**
- 🟩 **Этап 4: Сборка производных ассетов через npm run build:preview**
- 🟩 **Этап 5: Прогон тестов и фиксация верификации**

---

## 5. Детерминированный метод верификации

```bash
node --test test/test-lesson-pdf-import-autoexpand.mjs
npm run build:preview
```
