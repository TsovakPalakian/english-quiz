# План стабилизации тестового набора после доработок квизов и генерации

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Данная задача требует внесения точечных защитных правок в смежные модули:
> 1. `client/52-lessons.js`: добавление защитных проверок `typeof lmMarkDraftSaved === 'function'` в `lmOpenLesson` и `lmCreateLesson` для изоляции юнит-тестов с вызовом единичных функций в песочницах VM.
> 2. `client/52b-lesson-pdf-import.js`:
>    - Добавление защитной проверки `typeof lmPdfUseSource === 'function'` в обработчиках импорта.
>    - Восстановление монтирования `floatingBar` (`#lmPdfDraftFloatingBar`) и кнопок отмены/применения `dialog.append(cancel, apply)`.
>    - Уточнение дедупликации `overview` в `lmPdfAppendSections`, чтобы существующий заголовок в табе не блокировал добавление нового текстового описания урока.
> 3. `client/52c-focus-player.js`:
>    - Добавление локального генератора `voiceGenerateReply` в качестве фоллбэка для диалогового голосового режима, когда серверный роут `/api/lessons/voice-reply` недоступен (в оффлайн-режиме или локальных интеграционных тестах Playwright).
> Запрещено затрагивать и ломать любой иной несвязанный функционал.

---

### Анализ обнаруженных сбоев (7 из 280 тестов)

1. **`test/test-learning-main.mjs:2467` & `test/test-lesson-script-and-document.mjs:338, 408`**:
   - *Ошибка*: `ReferenceError: lmMarkDraftSaved is not defined`.
   - *Причина*: Функции `lmOpenLesson` и `lmCreateLesson` вызывают `lmMarkDraftSaved()`. В изолированных тестах, которые извлекают только тестируемые функции через `extractFunctions` в пустой `runInNewContext`, `lmMarkDraftSaved` отсутствует в контексте.
   - *Решение*: Вызывать безопасно: `if (typeof lmMarkDraftSaved === 'function') lmMarkDraftSaved();`.

2. **`test/test-client-pdf-import.mjs:338, 365`**:
   - *Ошибка*: `ReferenceError: lmPdfUseSource is not defined`.
   - *Причина*: В `client/52b-lesson-pdf-import.js` вызывается `lmPdfUseSource('file')`, однако HappyDOM тест извлекает фиксированный массив `IMPORT_PDF_FUNCTIONS`, куда `lmPdfUseSource` не входит.
   - *Решение*: Вызывать безопасно: `if (typeof lmPdfUseSource === 'function') lmPdfUseSource('file');`.

3. **`test/test-lesson-pdf-overview-append.mjs:32`**:
   - *Ошибка*: `AssertionError: 0 !== 1`.
   - *Причина*: В `lmPdfAppendSections` вычислялся общий ключ для всех блоков overview (`['overview']`). При наличии в черновике заголовка с `tab: 'overview'` ключ попадал в `known`, и новое текстовое описание ошибочно пропускалось как дубликат.
   - *Решение*: Исключить ложные пропуски в overview: добавлять блок, если в черновике еще нет текстового блока с таким содержанием.

4. **`test/test-lesson-pdf-ui.mjs:168` & `test/test-task-22-pdf-draft-flow-ui.mjs:122`**:
   - *Ошибка*: Таймаут ожидания кнопки `Cancel` в `#lmPdfDraftDialog` и `Floating action bar must be mounted and visible: false !== true`.
   - *Причина*: Кнопки `cancel`, `apply` не добавлялись в `dialog` через `dialog.append(...)`, а плавающая панель `floatingBar` не монтировалась в `document.body`.
   - *Решение*: Восстановить монтирование `floatingBar` и прикрепление кнопок к `dialog`.

5. **`test/test-voice-mode-tutor-examiner.mjs:118`**:
   - *Ошибка*: `AssertionError: Examiner uses authentic lesson vocabulary in Question 1`.
   - *Причина*: Голосовой режим обращался исключительно к серверному эндпоинту `/api/lessons/voice-reply`. На локальном статическом HTTP сервере теста этот роут отсутствует, из-за чего интерфейс выводил сообщение о недоступности диалога вместо аутентичного вопроса экзаменатора.
   - *Решение*: Обеспечить плавный fallback на локальный генератор `voiceGenerateReply` при отсутствии ответа от сервера или оффлайн-тестировании.

---

### Чеклист этапов реализации

- 🟩 **Этап 1**: Защитные вызовы `lmMarkDraftSaved` в `client/52-lessons.js`
- 🟩 **Этап 2**: Защитные вызовы `lmPdfUseSource`, монтирование `floatingBar` и кнопок отмены/применения в `client/52b-lesson-pdf-import.js`
- 🟩 **Этап 3**: Корректная логика добавления секции `overview` в `lmPdfAppendSections`
- 🟩 **Этап 4**: Фоллбэк локального генератора диалога в `client/52c-focus-player.js`
- 🟩 **Этап 5**: Пересборка бандлов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 6**: Верификация всех 7 тестовых сценариев и прогон `node ops/check-all.mjs` (280 из 280 тестов успешно пройдены)
