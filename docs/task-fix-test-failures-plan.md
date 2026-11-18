# Plan: Fix Failing Regression Tests

## Warning Block
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: исправление приоритета заголовка/описания при разборе скрипта уроков, экспорт функции описания в изолированное тестовое окружение, и устранение дублирования кнопки навигации назад в `#daysetup`.

## Problem Statement
1. `test/test-client-pdf-import.mjs#L215`: `ReferenceError: lmDetailedLessonDescription is not defined` в `lmParseScriptToLessonData`.
2. `test/test-lesson-script-and-document.mjs#L84`: `AssertionError: actual 'ecology', expected 'Environmental Conservation and Sustainability'` из-за перехвата строки 0 проверкой `bareCandidate`.
3. `test/test-chat-ui.mjs#L149`: Playwright strict mode violation из-за наличия двух элементов `[data-nav-back]` внутри `#daysetup` (`#dayQuizBack` и `#daySetupBack`).

## Implementation Checklist
- 🟩 1. Скорректировать порядок разбора строк в `client/52b-lesson-pdf-import.js`: выполнять проверку строк 0 и 1 на заголовок и описание до проверки отдельных английских выражений без перевода; добавить безопасный вызов `typeof lmDetailedLessonDescription === 'function'`.
- 🟩 2. Добавить `lmDetailedLessonDescription` в массив `IMPORT_PDF_FUNCTIONS` в `test/test-client-pdf-import.mjs`.
- 🟩 3. Удалить атрибут `data-nav-back` у кнопки `#dayQuizBack` в `site/preview.html` и подключить делегирование клика `#dayQuizBack` на `#daySetupBack` в `client/03g-core.js`.
- 🟩 4. Пересобрать клиентские скрипты через `npm run build:preview`.
- 🟩 5. Запустить целевые тесты: `test/test-client-pdf-import.mjs`, `test/test-lesson-script-and-document.mjs`, `test/test-chat-ui.mjs`.
