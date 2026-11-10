# План реализации управления получателями Telegram-уведомлений разработчика

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемая задача строго и изолированно затрагивает функционал вкладки управления получателями Telegram в разделе разработчика Bugs и доставку уведомлений обратной связи в [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs). Функционал пайплайнов CI/CD в [ops/telegram-notify.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs), авторизация через Telegram в [src/telegram-oauth.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/telegram-oauth.mjs) и прочие компоненты системы остаются неизменными.

---

### Утвержденный макет интерфейса

### Скриншот 3: Новая отдельная вкладка Telegram alerts в разделе Bugs
![Скриншот 3: Новая отдельная вкладка Telegram alerts в разделе Bugs](/Users/tsovakpalakian/.gemini/antigravity/brain/b3ab5c91-8058-4d84-813b-655017c121ef/mockup-telegram-tab.png)

### Скриншот 4: Реальная реализация вкладки Telegram alerts в живом браузере
![Скриншот 4: Реальная реализация вкладки Telegram alerts в живом браузере](task-telegram-recipients-screenshot.png)

### Скриншот 5: Заблокированная кнопка Test для выключенных получателей
![Скриншот 5: Заблокированная кнопка Test для выключенных получателей](/Users/tsovakpalakian/.gemini/antigravity/brain/b3ab5c91-8058-4d84-813b-655017c121ef/mockup-disabled-test-button.png)

---

### Контрольный список реализации

- 🟩 **Этап 1: Документация и планирование**
  - Подготовка проектного документа в `docs/` с утвержденным скриншотом и изолированным чек-листом.
- 🟩 **Этап 2: Серверная модель данных и API**
  - Реализация функций `getTelegramRecipients`, `setTelegramRecipients`, `testTelegramRecipient` в [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs).
  - Интеграция эндпоинтов `GET /api/feedback/telegram-recipients`, `POST /api/feedback/telegram-recipients` и `POST /api/feedback/telegram-test` в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs).
  - Обновление рассылки `notifyFeedbackTelegram` в [src/feedback.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/feedback.mjs) для отправки всем активным получателям из таблицы `catalog_documents`.
- 🟩 **Этап 3: Клиентский интерфейс раздела Bugs**
  - Добавление кнопки вкладки `Telegram alerts` в разметку [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L2042-L2045).
  - Регистрация вкладки `telegram` в клиентской маршрутизации [client/03-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03-core.js#L132-L139).
  - Отрисовка формы добавления, таблицы получателей, бейджей статуса, кнопок редактирования, удаления и тестового пинга в [client/24-bugs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js).
- 🟩 **Этап 4: Блокировка теста для выключенных получателей (UI и API)**
  - Блокировка кнопки `Test` (`disabled` с подсказкой `Recipient is disabled. Change status to Active to test.`) в [client/24-bugs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js).
  - Серверный запрет выполнения `POST /api/feedback/telegram-test` для `status === 'disabled'` в [src/learning-integrated-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs).
- 🟩 **Этап 5: Сборка и тестирование**
  - Запуск `npm run build:preview` и `ops/build-learning-production-assets.mjs`.
  - Обновление тестов в [test/test-telegram-recipients.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-telegram-recipients.mjs) и [test/test-telegram-recipients-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-telegram-recipients-ui.mjs).
  - Прогон полного набора тестов `npm run check`.
- 🟩 **Этап 6: Финальная валидация и коммит**
  - Предоставление финального отчета, коммит-сообщения и списка тестовых файлов.
