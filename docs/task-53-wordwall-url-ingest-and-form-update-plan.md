# План реализации 4 таббоксов генерации, центрирования дроп-зоны и компактной панели Quiz options

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ И ИЗОЛЯЦИИ ИЗМЕНЕНИЙ:**
> Выполняемая задача строго и изолированно касается функционала карточки генерации уроков (`#lmFrameImport`):
> 1. Организации 4 независимых таббоксов генерации: `File / PDF`, `Web URL`, `Manual Script` и четвертого динамического таббокса `Current Lesson Context` (отображается только при не пустом уроке для его дополнения).
> 2. Точного вертикального и горизонтального центрирования надписи «Drop lesson or exam file / PDF» внутри пунктирной рамки дроп-зоны.
> 3. Реализации раскрывающейся встроенной панели (аккордеона) `Quiz options` с расположением блока `Quiz Types` внизу и ультра-компактными элементами выбора без вертикального скролла.
> 4. Интеллектуального парсинга тем из внешних ссылок Wordwall/Quizlet через Gemini AI и автоматического обновления полей формы урока (`#lmTitle`, `#lmDesc`, `#lmUnit`, `#lmLesson`, `#lmClass`, `#lmScriptInput`, `lmState`).
> Запрещено затрагивать и нарушать авторизацию пользователей, хранилище D1/Cloudflare R2, систему оценивания экзаменов, плеер Full Focus Mode и другие смежные компоненты. Все изменения выполняются аддитивно с сохранением обратной совместимости.

---

## 1. Точная формулировка задачи и требований (Problem Statement)

1. **Разделение типов генерации на 4 отдельных таббокса**:
   - Вместо нагромождения всех элементов ввода в одной карточке вверху блока размещаются 4 вкладки:
     - **Таббокс 1 (`File / PDF`)**: загрузка бинарных файлов (.pdf, .docx, .txt, .md, .json, .csv).
     - **Таббокс 2 (`Web URL`)**: ввод внешней ссылки на Wordwall, Quizlet или статью с кнопкой `Fetch URL` и интеллектуальным анализом контекста через Gemini AI.
     - **Таббокс 3 (`Manual Script`)**: многострочное поле для ввода текста сценария или описания темы вручную с авто-расширением высоты.
     - **Таббокс 4 (`Current Lesson Context`)**: отображается динамически, только если текущий урок не пустой (`lmState && lmState.blocks && lmState.blocks.length > 0`). Позволяет дополнить существующий урок контрольными заданиями по его лексике и правилам без перезаписи первых двух секций (Metadata & Overview).

2. **Точное центрирование надписи дроп-зоны**:
   - В селекторе `.lm-drop` (`site/preview.css`) настраиваются правила `display: grid; place-items: center; place-content: center; min-height: 140px; padding: 20px 16px; box-sizing: border-box; text-align: center;`.
   - Текст «Drop lesson or exam file / PDF» и подзаголовок «Upload any file format...» выравниваются строго по центру пунктирного блока как по вертикали, так и по горизонтали.

3. **Размещение панели `Quiz options` исключительно в таббоксе `Complement Current Lesson`**:
   - Во вкладках `File / PDF`, `Web URL` и `Manual Script` этот блок полностью отсутствует, обеспечивая максимальную чистоту и простоту интерфейса.
   - Вся панель настройки генерации квизов (выбор количества заданий, секций `Classwork` / `Homework` в виде пилюль, кнопок `All 20` / `None` в виде пилюль и 20 типов квизов в виде компактных тегов) размещается **исключительно** в таббоксе `Complement Current Lesson`.
   - В остальных трех таббоксах интерфейс состоит только из релевантного поля ввода и кнопки генерации/импорта.

4. **Интеллектуальный парсинг Wordwall и авто-обновление формы**:
   - Извлечение реального контекста темы из ссылки (`SO_Inter_8.2 Relative clauses_edited` -> Speakout Intermediate, Unit 8, Lesson 2, тема Relative clauses, уровень B1).
   - Генерация через Gemini AI аутентичного словаря и правил без шаблонных слов-заглушек (`accuracy/fluency`).
   - Автоматическое обновление всех полей формы урока (`#lmTitle`, `#lmDesc`, `#lmUnit`, `#lmLesson`, `#lmClass`, `#lmScriptInput`, `lmState`).

---

## 2. Утвержденные визуальные макеты (Approved Mockups)

### Скриншот 1: Таббокс 1 (File / PDF) — отцентрированная дроп-зона (тема sky)
![Скриншот 1](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-1-tab-file.png)
*Скриншот 1. Вкладка File / PDF: отцентрированная дроп-зона «Drop lesson or exam file / PDF» с лаконичной подсказкой «Direct PDF Analysis: Gemini AI parses the document structure autonomously».*
[Открыть исходный файл Скриншота 1](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-1-tab-file.png)

---

### Скриншот 2: Таббокс 2 (Web URL) — поле ввода ссылки и кнопка импорта (тема sky)
![Скриншот 2](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-2-tab-url.png)
*Скриншот 2. Вкладка Web URL: строка ввода ссылки (Supported: Wordwall, Quizlet, Web Articles) с кнопкой Fetch & Import Lesson.*
[Открыть исходный файл Скриншота 2](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-2-tab-url.png)

---

### Скриншот 3: Таббокс 3 (Manual Script) — поле ввода сценария с быстрыми шаблонами (тема sky)
![Скриншот 3](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-3-tab-script.png)
*Скриншот 3. Вкладка Manual Script: текстовое поле с быстрыми шаблонами (+ Grammar Rule, + Vocabulary List, + Dialogue) и кнопкой Generate Lesson Draft.*
[Открыть исходный файл Скриншота 3](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-3-tab-script.png)

---

### Скриншот 4: Таббокс 4 (Complement Current Lesson) — генератор заданий с кнопками-пилюлями (тема sky)
![Скриншот 4](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-4-tab-current-lesson.png)
*Скриншот 4. Вкладка дополнения открытого урока: генератор заданий с кнопками-пилюлями (Target Sections: Classwork/Homework, All 20/None, поле количества заданий, 20 типов квизов внизу).*
[Открыть исходный файл Скриншота 4](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-approved-screenshot-4-tab-current-lesson.png)

---

## 3. Границы изменений (Scope Boundaries)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): верстка 4 таббоксов (`#tabBtnFile`, `#tabBtnUrl`, `#tabBtnScript`, `#tabBtnLesson`), центрированная дроп-зона, разметка встроенной ультра-компактной панели `#lmQuizOptionsInlinePanel`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стили `.lm-drop` (`place-content: center; padding: 20px 16px;`), стили табов и ультра-компактных чипов / тегов.
  - [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): логика переключения 4 таббоксов, динамическое отображение 4-го таба при наличии блоков, раскрытие/сворачивание панели `Quiz options`, ультра-компактный выбор типов.
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): парсер контекста ссылки Wordwall/Quizlet/Web, авто-заполнение полей формы урока (`#lmTitle`, `#lmDesc`, `#lmUnit`, `#lmLesson`, `#lmClass`, `#lmScriptInput`, `lmState`).
  - [`src/lesson-pdf-meta.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs): специализированный промпт генерации Gemini под извлеченную тему ссылки, устранение статичных слов-заглушек `accuracy/fluency`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентского бандла `npm run build:preview`.
  - [`test/test-wordwall-url-ingest.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-wordwall-url-ingest.mjs): модульные и визуальные тесты 4 таббоксов, центрирования дроп-зоны, ультра-компактной панели и авто-заполнения формы.
  - Пересборка продакшн-ассетов через `ops/build-learning-production-assets.mjs`.

- **Инварианты**:
  - Сохранение ручного ввода скрипта и загрузки PDF/файлов.
  - Сохранение обратной совместимости API и структуры блоков.

---

## 4. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Создание плана и фиксация макетов 4 таббоксов, центрирования и ультра-компактных квизов в `docs/task-53-wordwall-url-ingest-and-form-update-plan.md`
- 🟩 **Этап 2**: Разметка 4 таббоксов в `site/preview.html` и логика динамического отображения 4-го таба при не пустом уроке
- 🟩 **Этап 3**: Точное вертикальное и горизонтальное центрирование надписи `Drop lesson or exam file / PDF` в `site/preview.css`
- 🟩 **Этап 4**: Реализация ультра-компактной панели с кнопками-пилюлями и блоком `Quiz Types` внизу в `client/52-lessons.js`
- 🟩 **Этап 5**: Интеллектуальный парсер внешних ссылок Wordwall/Quizlet через Gemini AI без шаблонных слов-заглушек в `client/52b-lesson-pdf-import.js` и `src/lesson-pdf-meta.mjs`
- 🟩 **Этап 6**: Автоматическое заполнение метаданных и полей формы урока (`#lmTitle`, `#lmDesc`, `#lmUnit`, `#lmLesson`, `#lmClass`, `#lmScriptInput`)
- 🟩 **Этап 7**: Разработка автоматизированного теста `test/test-wordwall-url-ingest.mjs`
- 🟩 **Этап 8**: Сборка превью и продакшн-ассетов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 9**: Изолированная индексация изменений в git (`git add`)
