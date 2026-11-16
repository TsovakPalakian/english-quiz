# План исправления загрузки просмотрщика PDF.js и отображения учебника Speakout

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче загрузки просмотрщика PDF.js и отображения файла учебника `studentBook`. Задача строго и изолированно затрагивает отдачу статических файлов движка PDF.js (`/speakout/vendor/pdfjs/*`) и маршрутов чтения документов/сессий Speakout в [src/learning-stage-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs) и [src/learning-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-media.mjs). Весь остальной функционал платформы (грамматика, словарь, чат, биллинг, профили, экзамены) остается неизменным.

---

### Скриншот 1: Исходная ошибка на экране пользователя

![Скриншот 1: Аварийный fallback-экран Speakout PDF.js Standalone Viewer с ошибкой «The book viewer did not open.»](/Users/tsovakpalakian/.gemini/antigravity/brain/17d507a5-eb36-402c-889a-0045b3511a21/.user_uploaded/media_1794840714393_a9f6ee6d.png)

*Скриншот 1: Аварийный fallback-экран Speakout PDF.js Standalone Viewer с ошибкой «The book viewer did not open.» и незагруженным файлом учебника (Page 8 / 0).*

---

## 1. Анализ первопричины сбоя

1. В [speakout/web/app.js:1570-1571](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L1570-L1571) при событии `DOMContentLoaded` вызывается функция `loadPdfViewer()`, выполняющая динамический импорт `import('./vendor/pdfjs/pdf.mjs')`.
2. Запрос `GET /speakout/vendor/pdfjs/pdf.mjs` в [src/learning-stage-worker.mjs:212](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L212) блокируется проверкой `const actor=await auth.current(request);if(!actor)throw new StudyError(401,'Sign in first.');`. При отсутствии авторизационной куки сервер возвращает `HTTP 401 application/json`, из-за чего динамический импорт выбрасывает ошибку в браузере, и на экране появляется сообщение `"The book viewer did not open."`.
3. Запрос `GET /api/speakout/document?doc=studentBook` также блокируется проверкой на строке 212 с кодом `401`, что не позволяет просмотрщику загрузить файл `student_book.pdf` из Cloudflare R2, приводя к рендеру заглушки `Document Page 8 / 0`.

---

## 2. Чек-лист реализации

- 🟩 1. Разрешение публичной отдачи клиентских библиотек PDF.js (`/speakout/vendor/pdfjs/pdf.mjs` и `pdf.worker.mjs`) до проверки сессии аккаунта в [src/learning-stage-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs).
- 🟩 2. Разрешение чтения учебника `studentBook`, видеоскриптов `videoscripts` и сессии `/api/speakout/session` без принудительного 401 в [src/learning-stage-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs), с сохранением 403 Forbidden для закрытых ключей `keys` и `teacherResources` без роли преподавателя.
- 🟩 3. Добавление отказоустойчивого определения MIME-типа для PDF и медиафайлов по расширению ключа в [src/learning-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-media.mjs).
- 🟩 4. Обновление и запуск целевых тестов [test/test-speakout-viewer.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speakout-viewer.mjs).
- 🟩 5. Сборка продакшн-ассетов через `ops/build-learning-production-assets.mjs` и валидация.
