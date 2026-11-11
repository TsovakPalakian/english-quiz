# План устранения регрессии видимости диалога предпросмотра PDF-черновика (#lmPdfDraftDialog)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Выполняемая задача строго и изолированно касается исправления селектора сокрытия элементов при активном ревью черновика урока (`.lm-import-methods.is-reviewing-draft`):
> 1. Исключения контейнеров табов (`.lm-tab-pane` и `.lm-tabs-bar`) из селектора сокрытия прямых потомков `div` в карточке `.lm-import-methods`, предотвращая непреднамеренное скрытие вкладки `📁 File / PDF` и размещенного в ней `#lmPdfDraftDialog`.
> 2. Корректного сокрытия дроп-зоны `[data-lesson-pdf-import]` и подсказки `.lm-note-box` внутри `.lm-tab-pane` на время ревью черновика.
> 3. Запрещено затрагивать и модифицировать структуру базы данных, Cloudflare Worker, авторизацию, плеер тестов и другие смежные компоненты.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Симптомы сбоя в тестах**:
  1. [`test/test-lesson-pdf-ui.mjs:168`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-pdf-ui.mjs#L168):
     `locator.click: Timeout 30000ms exceeded. waiting for locator('#lmPdfDraftDialog').getByRole('button', { name: 'Cancel', exact: true })`.
  2. [`test/test-task-22-pdf-draft-flow-ui.mjs:115`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs#L115):
     `locator.waitFor: Timeout 30000ms exceeded. waiting for locator('#lmPdfDraftDialog[open]') to be visible. 62 × locator resolved to hidden <dialog open="" id="lmPdfDraftDialog" class="lm-pdf-draft saas-card">…</dialog>`.

- **Первопричина (Root Cause)**:
  - В [`site/preview.css:4819`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4819) для режима ревью черновика задано правило:
    ```css
    .lm-import-methods.is-reviewing-draft > div:not(.lm-pdf-draft):not(.lm-pdf-progress):not(.lm-pdf-next-upload):not(.lm-pdf-manual-collapsed) {
      display: none !important;
    }
    ```
  - Ранее в `.lm-import-methods` прямыми потомками были простые блоки ввода. После внедрения 4 таббоксов прямыми потомками `.lm-import-methods` стали `<div class="lm-tabs-bar">` и контейнеры табов `<div id="lmTabPaneFile" class="lm-tab-pane active">`.
  - При начале парсинга/ревью PDF контейнер `.lm-import-methods` получает класс `is-reviewing-draft`.
  - Селектор `> div:not(...)` сработал на `#lmTabPaneFile`, применив к нему `display: none !important;`.
  - Поскольку элемент `#lmPdfDraftDialog` монтируется рядом с индикатором прогресса внутрь `#lmTabPaneFile`, он оказался внутри скрытого родителя и стал невидимым для браузера и Playwright.

---

## 2. Предлагаемое решение (Remediation)

1. В [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css):
   - Добавить исключения `:not(.lm-tab-pane):not(.lm-tabs-bar)` в правило `.lm-import-methods.is-reviewing-draft > div:not(...)`, чтобы активный таб-контейнер и панель вкладок не скрывались.
   - Скрывать саму дроп-зону `[data-lesson-pdf-import]` и подсказку `.lm-note-box` внутри `.lm-import-methods.is-reviewing-draft`:
     ```css
     .lm-import-methods.is-reviewing-draft > label:not([data-lesson-pdf-import]),
     .lm-import-methods.is-reviewing-draft > textarea,
     .lm-import-methods.is-reviewing-draft > div:not(.lm-pdf-draft):not(.lm-pdf-progress):not(.lm-pdf-next-upload):not(.lm-pdf-manual-collapsed):not(.lm-tab-pane):not(.lm-tabs-bar),
     .lm-import-methods.is-reviewing-draft [data-lesson-pdf-import],
     .lm-import-methods.is-reviewing-draft .lm-note-box {
       display: none !important;
     }
     ```
   - Аналогично обновить селектор для `.show-manual-inputs`.

2. Пересобрать бандл и продакшн-ассеты:
   - `npm run build:preview`
   - `node ops/build-learning-production-assets.mjs`

3. Запустить целевые тесты:
   - `node --test test/test-task-22-pdf-draft-flow-ui.mjs`
   - `node --test test/test-lesson-pdf-ui.mjs`
   - `node --test test/test-wordwall-url-ingest.mjs`

---

## 3. Границы изменений (Scope Boundaries)

- **Затрагиваемые файлы**:
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
  - [`rollback/production-assets/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/rollback/production-assets/preview.css) (через сборщик `ops/build-learning-production-assets.mjs`)
- **Не затрагиваются**:
  - Логика парсинга, клиентские скрипты, схемы БД, авторизация и смежные модули.

---

## 4. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Создание плана устранения дефекта в `docs/task-53-pdf-draft-review-visibility-fix-plan.md`
- 🟩 **Этап 2**: Корректировка CSS-селектора `.lm-import-methods.is-reviewing-draft` в `site/preview.css`
- 🟩 **Этап 3**: Пересборка продакшн-ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`
- 🟩 **Этап 4**: Запуск и верификация тестов `test/test-task-22-pdf-draft-flow-ui.mjs` и `test/test-lesson-pdf-ui.mjs`
- 🟩 **Этап 5**: Верификация теста `test/test-wordwall-url-ingest.mjs`
- 🟩 **Этап 6**: Изолированная индексация изменений в Git (`git add`)
