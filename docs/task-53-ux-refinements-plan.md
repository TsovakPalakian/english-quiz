# План доработки UX генератора уроков (деактивация кнопок, перенос текста и предупреждения Video choice)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ И ИЗОЛЯЦИИ ИЗМЕНЕНИЙ:**
> Данные доработки строго ограничены карточкой `#lmFrameImport` и вкладками генерации:
> 1. Полным удалением текстовой плашки `Paste a resource URL first.` и блокировкой кликабельности кнопки `Fetch & Import Lesson` (`disabled`), если в поле ввода ссылки нет текста.
> 2. Блокировкой кнопки `Generate Lesson Draft →` (`disabled`), если текстовое поле сценария (`#lmScriptInput`) пустое.
> 3. Переносом информационного блока `💡 Direct AI Structuring: Gemini detects title, vocabulary, and grammar rules automatically.` под кнопку генерации с выравниванием в одну полную строку.
> 4. Переносом красного предупреждающего баннера `#lmVideoChoiceWarning` строго внутрь вкладки `Complement Current Lesson` (полное устранение его отображения на вкладках `File / PDF`, `Web URL`, `Manual Script`).
> 5. Отключением выбора типа `Video choice` по умолчанию (по умолчанию активны 19 типов квизов, `Video choice` не выбран, красный баннер по умолчанию скрыт).
> Запрещено затрагивать авторизацию, сохранение уроков в D1/R2, логику парсинга и плееры тестов.

---

## 1. Точная формулировка задач и требований

1. **Удаление плашки «Paste a resource URL first.»**:
   - Полностью убрать установку и отображение сообщения `Paste a resource URL first.`.
   - Кнопка `Fetch & Import Lesson` (`#lmUrlFetchBtn`) должна быть отключена (`disabled`) по умолчанию и становиться активной только тогда, когда пользователь ввел или вставил непустой URL в `#lmUrlInput`.

2. **Блокировка кнопки при отсутствии контента**:
   - Во вкладке `📝 Manual Script`: кнопка `Generate Lesson Draft →` (`#lmGenerateFromScriptBtn`) по умолчанию отключена (`disabled`), если поле `#lmScriptInput` пустое. При вводе текста или нажатии быстрых шаблонов (`+ Grammar Rule`, `+ Vocabulary List`, `+ Dialogue`) кнопка мгновенно становится активной.
   - Во вкладке `🌐 Web URL`: кнопка `Fetch & Import Lesson` отключена (`disabled`), пока поле пустое.

3. **Скриншот 1: Перенос текста под кнопку в одну строку**:
   - Во вкладке `📝 Manual Script`: кнопка `Generate Lesson Draft →` размещается над пояснительным блоком (справа под textarea).
   - Информационный блок `💡 Direct AI Structuring: Gemini detects title, vocabulary, and grammar rules automatically.` переносится ниже кнопки на всю ширину карточки в одну строку (с `white-space: nowrap;`).

4. **Изоляция красного предупреждения и снятие выделения с Video choice**:
   - Красный баннер `#lmVideoChoiceWarning` переносится из общей карточки внутрь контейнера Таббокса 4 (`#lmTabPaneLesson`). Он полностью отсутствует и не отображается на вкладках `File / PDF`, `Web URL`, `Manual Script`.
   - В реестре опций квизов по умолчанию тип `Video choice` снят (не выбран, отображается как неактивная пилюля `+ 📹 Video choice`). Активны 19 типов квизов.
   - Красный предупреждающий баннер по умолчанию скрыт и появляется только при ручной активации пользователем пилюли `Video choice`.

---

## 2. Предварительные макеты реализации (тема 'sky')

### Скриншот 1: Крупный план блока кнопки и однострочной подсказки (Manual Script)
![Скриншот 1](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-1-detail-single-line.png)
*Скриншот 1. Детальный вид: кнопка «Generate Lesson Draft →» размещена справа, под ней на всю ширину в одну строку выведен блок Direct AI Structuring, красное предупреждение внизу отсутствует.*
[Открыть исходный файл Скриншота 1](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-1-detail-single-line.png)

---

### Скриншот 2: Полный вид вкладки Manual Script — отключенная кнопка при пустом сценарии
![Скриншот 2](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-2-tab-script.png)
*Скриншот 2. Вкладка Manual Script целиком: пустое поле сценария, неактивная кнопка (disabled), подсказка в одну строку, отсутствие красного предупреждения.*
[Открыть исходный файл Скриншота 2](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-2-tab-script.png)

---

### Скриншот 3: Полный вид вкладки Web URL — отключенная кнопка при пустой строке
![Скриншот 3](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-3-tab-url.png)
*Скриншот 3. Вкладка Web URL целиком: кнопка «Fetch & Import Lesson» заблокирована (disabled) при пустом поле URL, статусная плашка «Paste a resource URL first.» удалена, красное предупреждение отсутствует.*
[Открыть исходный файл Скриншота 3](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-3-tab-url.png)

---

### Скриншот 4: Вкладка Complement Current Lesson — тип Video choice снят по умолчанию
![Скриншот 4](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-4-tab-complement.png)
*Скриншот 4. Вкладка Complement Current Lesson: тип Video choice снят по умолчанию (+ 📹 Video choice, 19 active), красное предупреждение скрыто и локализовано строго в этой вкладке.*
[Открыть исходный файл Скриншота 4](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-refined-screenshot-4-tab-complement.png)

---

## 3. Границы изменений (Scope Boundaries)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): верстка вкладки `Manual Script` (перенос строки подсказки под кнопку, атрибут `disabled`), верстка вкладки `Web URL` (атрибут `disabled` у кнопки), перенос `#lmVideoChoiceWarning` внутрь `#lmTabPaneLesson`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация заблокированных кнопок (`:disabled { opacity: 0.5; cursor: not-allowed; }`), стиль строки `lm-note-box` в одну строку.
  - [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): отключение `Video choice` по умолчанию в списке `LM_ALL_QUIZ_TYPES`, динамическое переключение активности кнопок при событии `input` в `#lmScriptInput` и `#lmUrlInput`.
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): удаление установки текста `'Paste a resource URL first.'`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): сборка `npm run build:preview`.
  - Пересборка продакшн-ассетов через `ops/build-learning-production-assets.mjs`.
  - [`test/test-wordwall-url-ingest.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-wordwall-url-ingest.mjs): обновление тестов под отключение `Video choice` по умолчанию и валидацию активности кнопок.

---

## 4. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Фиксация требований, создание плана и утверждение макетов (Скриншоты 1, 2, 3)
- 🟩 **Этап 2**: Удаление плашки `Paste a resource URL first.` и реализация динамической блокировки кнопки `Fetch & Import Lesson`
- 🟩 **Этап 3**: Блокировка кнопки `Generate Lesson Draft →` при пустом `Manual Script`, перенос информационного блока под кнопку в одну строку
- 🟩 **Этап 4**: Локализация `#lmVideoChoiceWarning` строго внутри вкладки `Complement Current Lesson`, отключение `Video choice` по умолчанию
- 🟩 **Этап 5**: Пересборка бандлов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 6**: Прогон и верификация тестов (`test-wordwall-url-ingest.mjs`, `test-task-22-pdf-draft-flow-ui.mjs`, `test-lesson-pdf-ui.mjs`)
- 🟩 **Этап 7**: Изолированная индексация изменений в Git (`git add`)
