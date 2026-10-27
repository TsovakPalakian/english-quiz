# План реализации: Перевод окон Settings, Review queue, My quizzes и AI providers в полноэкранные страницы

## 1. Описание задачи
В настоящее время:
- Кнопка **Settings** открывает маленькое всплывающее меню (`#shellSettings`) внизу сайдбара или плавающее модальное окно чата (`dialog.user-settings`).
- Кнопки **Review queue**, **My quizzes** и **AI providers** открывают отдельное модальное окно поверх страницы (`<dialog class="learning-kit-dialog">` с тёмным затемнением фона).

Пользователь запросил:
«Settings расположи это окно не отдельно а как все
эти тоже
Review queue
My quizzes
AI providers»

Требуется расположить эти 4 экрана не отдельно в виде всплывающих/модальных окон, а как стандартные страницы приложения («как все» — Library, Groups, Exams, Accounts, Bugs), интегрированные в основную рабочую область `<main>` со стандартной навигацией, сайдбаром, заголовком и хлебными крошками.

---

## 2. Чек-лист реализации

- 🟩 **Этап 1: Создание полноэкранной страницы для Settings**
  - 🟩 Добавить `<section id="settings">` в `site/preview.html` с `.meta` (кнопка `Back`, заголовок `<h1>Settings</h1>`) и контейнером `#settingsHost`.
  - 🟩 Назначить кнопке Settings в сайдбаре стандартный переход `data-jump="settings"`.
  - 🟩 Зарегистрировать страницу `settings` в маршрутизаторе `show(id)` и цепочке хлебных крошек `pagePathItems` в `client/00-core.js`.
  - 🟩 Обновить `production/chat/90-settings.js`: при наличии `#settingsHost` монтировать диалог настроек как инлайн-страницу (`.in-page`) без перекрытия экрана оверлеем (`showModal()`), сохранив полную совместимость с тестами (`dialog.user-settings[open]`).

- 🟩 **Этап 2: Создание полноэкранных страниц для Review queue, My quizzes и AI providers**
  - 🟩 Добавить секции `<section id="workbenchqueue">`, `<section id="workbenchmine">`, `<section id="workbenchproviders">` в `site/preview.html` с контейнерами хостов.
  - 🟩 Добавить атрибуты переходов `data-jump` для кнопок в сайдбаре в `client/52a-workbench.js`.
  - 🟩 Модифицировать `open()` в `client/52a-workbench.js`: при открытии очереди, личных квизов или настроек провайдеров монтировать в хост целевой страницы с классом `.workbench-page-view`.
  - 🟩 Зарегистрировать секции в маршрутизаторе `show(id)`, очищать состояние при уходе со страницы, зарегистрировать хлебные крошки в `pagePathItems`.

- 🟩 **Этап 3: Стилизация и адаптивность**
  - 🟩 Стилизовать `.user-settings.in-page` в `production/chat.css` и `.learning-kit-dialog.workbench-page-view` в `site/main-stage.css` (статическое позиционирование в потоке страницы, ширина 100%, отключение бэкдропа).
  - 🟩 Обеспечить адаптивность для мобильных экранов (320px–390px) и десктопа.

- 🟩 **Этап 4: Верификация, сборка и тестирование**
  - 🟩 Собрать клиентские скрипты (`npm run build:preview`) и продакшен-ассеты (`ops/build-learning-production-assets.mjs`).
  - 🟩 Прогнать тесты интерфейса (`test-ui-boot.mjs`, `test-chat-ui.mjs`, `test-learning-workbench-ui.mjs`, `test-local-workbench-launch-ui.mjs`, `test-workbench-production-providers.mjs`).
  - 🟩 Прогнать полный тестовый набор `ops/check-all.mjs` (165 скриптов).
