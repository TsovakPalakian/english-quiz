# Pearson Speakout A1: План устранения уязвимостей безопасности и защиты данных

> **Предупреждение об изоляции области видимости**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Изменения вносятся строго изолированно в компоненты Speakout (`speakout/server/server.js`, `speakout/web/app.js`, `speakout/web/index.html`, `speakout/tests/security_hardening.test.js`). Любые смежные модули проекта english-quiz (`client/`, `production/`, `site/`) защищены от изменений.

---

### Анализ дефектов повторного аудита безопасности

По результатам проверки выявлено 3 дефекта реализации:

1. **Утечка ответов в `POST /api/speakout/test/A1/U1/submit` и эндпоинтах уроков**:
   - В [speakout/server/server.js:278](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L278) объект ответа содержит `results[item.id].expected` с верным ответом.
   - В [speakout/server/server.js:182, 195, 208, 221, 340, 353](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L182) для уроков 1B, 1C, 1D, Review, 2A, 2B санитизация не включает параметр `stripTestAnswers: true`.

2. **Отсутствие проверки границ каталога для аудио и видео**:
   - В [speakout/server/server.js:389](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L389) эндпоинт `GET /api/speakout/audio` передает путь `track.path` в `streamFileWithRange` без проверки `path.resolve(track.path).startsWith(COURSE_BASE_DIR)`.
   - В [speakout/server/server.js:406](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L406) эндпоинт `GET /api/speakout/video` формирует `fullVideoPath` без валидации вхождения в `COURSE_BASE_DIR`.

3. **Неэкранированные вставки в `innerHTML` (DOM XSS)**:
   - В [speakout/web/app.js:255, 449, 623](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L255) переменные `t.title` и `t.id` интерполируются в `innerHTML` без вызова `escapeHtml()`.
   - В [speakout/web/app.js:1724, 1741, 1784, 2034](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L1724) переменные `exp`, `correct`, `validAnswers[0]`, `row.getAttribute('data-answer')` вставляются в `innerHTML` без `escapeHtml()`.

---

### Чек-лист реализации

- 🟩 1. Базовый санитайзинг манифеста: удаление `answerKeys`, `path` и `videoDirectory` из `GET /api/speakout/manifest` ([speakout/server/server.js:169](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L169))
- 🟩 2. Блокировка учительских ресурсов: возврат HTTP 403 Forbidden для `teacherResources` ([speakout/server/server.js:423](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L423))
- 🟩 3. Ограничение заголовков CORS: замена wildcard `*` на проверку доменов `lumiscia.org` и `localhost` ([speakout/server/server.js:12-28](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L12-L28))
- 🟩 4. Устранение утечки путей файловой системы в ответах HTTP 404 ([speakout/server/server.js:73](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L73))
- 🟩 5. Валидация каталога для документов PDF `GET /api/speakout/document` ([speakout/server/server.js:446-452](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L446-L452))
- 🟩 6. Устранение утечки ответов: удаление `expected` из ответа `POST /api/speakout/test/A1/U1/submit` и передача `stripTestAnswers: true` в эндпоинтах уроков 1B, 1C, 1D, Review, 2A, 2B ([speakout/server/server.js:182, 195, 208, 221, 278, 340, 353](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L182))
- 🟩 7. Валидация границ каталога курса для аудио и видео: проверка вхождения в `COURSE_BASE_DIR` в `GET /api/speakout/audio` и `GET /api/speakout/video` ([speakout/server/server.js:389, 406](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/server/server.js#L389))
- 🟩 8. Устранение DOM XSS: внедрение `escapeHtml()` при формировании HTML треков (строки 255, 449, 623) и ответов (строки 1724, 1741, 1784, 2034) в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L255)
- 🟩 9. Актуализация целевых тестов безопасности в `speakout/tests/security_hardening.test.js` и запуск верификации (143 теста, 100% pass)

---

### Скриншот 16: Мастер-интерфейс Pearson Speakout A1

![Скриншот 16: Мастер-интерфейс Pearson Speakout A1](docs/speakout-screenshot-16-master-ui.jpg)
