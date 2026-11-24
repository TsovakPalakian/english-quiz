# План устранения перехвата кликов модальным окном в test-local-azure-preview-ui.mjs

## Предупреждение об изоляции задачи и недопустимости побочных модификаций

> **ВНИМАНИЕ**: Задача строго и изолированно затрагивает только устранение падения теста из-за перехвата кликов модальным диалогом уведомлений. Запрещено затрагивать, модифицировать или ломать функционал, не относящийся к текущей задаче. Если случайно или по технической необходимости требуется затронуть и скорректировать смежные части, об этом обязательно требуется заранее уведомить пользователя в чате текстом красного цвета: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

## 1. Точная формулировка проблемы и ссылки на код

- При выполнении теста [`test/test-local-azure-preview-ui.mjs#L25`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-azure-preview-ui.mjs#L25) происходит `TimeoutError` при попытке клика по селектору `.side nav button[data-jump="groups"]`:
  `<dialog open="" role="alertdialog" id="learning-main-banner" aria-label="Notification" data-compact-notices="true" aria-describedby="learning-main-status">…</dialog> intercepts pointer events`.
- Причина: при входе в профиль разработчика (`dev`) код [`client/24-bugs.js#L883`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/24-bugs.js#L883) отправляет сетевой запрос `accountFetch('/api/feedback?limit=1')`.
- В сервере предварительного просмотра [`ops/preview-learning-workbench.mjs#L153-L154`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs#L153-L154) маршрут `/api/feedback` не зарегистрирован в списке обработчиков и возвращает статус `404` с сообщением `Not connected in this local preview.`.
- Функция `accountFetch` в [`client/main/main-bridge.js#L333-L336`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L333-L336) при ошибке `404` вызывает `notice(error.message, true)`.
- Вызов `notice(..., true)` выполняет метод `showModal()` на элементе `dialog#learning-main-banner` в [`client/main/main-bridge.js#L99-L101`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L99-L101), переводя диалог в верхний слой (top layer) документа, где он блокирует события мыши для лежащих ниже элементов.
- Проверка в [`test/test-local-azure-preview-ui.mjs#L24`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-azure-preview-ui.mjs#L24) проверяет видимость кнопки закрытия `#learning-main-dismiss` синхронно до завершения фонового запроса, поэтому модальное окно открывается после этой строки и перехватывает клик в строке 25.

## 2. Границы области изменений и инварианты

- Изменения ограничены двумя файлами:
  1. [`ops/preview-learning-workbench.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-learning-workbench.mjs) — добавление обработки маршрутов `/api/feedback` и `/api/messages` с возвратом статуса `200` и пустой структуры данных обратной связи.
  2. [`test/test-local-azure-preview-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-local-azure-preview-ui.mjs) — добавление проверки закрытия диалога `#learning-main-banner` и валидация ответа эндпоинта `/api/feedback`.
- Инварианты:
  - Публичные интерфейсы API и обработчики ошибок сохраняются без изменений.
  - Поведение рабочего боевого приложения не затрагивается.

## 3. Чек-лист реализации

- 🟩 **Этап 1**: Добавление поддержки эндпоинтов `/api/feedback` и `/api/messages` в `ops/preview-learning-workbench.mjs`.
- 🟩 **Этап 2**: Корректировка сценария теста в `test/test-local-azure-preview-ui.mjs` с добавлением проверки ответа `/api/feedback` и надежного снятия модального диалога.
- 🟩 **Этап 3**: Детерминированная проверка запуском целевого теста `node --test test/test-local-azure-preview-ui.mjs` и тестов смежных компонентов.
- 🟩 **Этап 4**: Проверка сборки статических ресурсов через `npm run build:preview`.
