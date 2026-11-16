# План синхронизации тем оформления для встроенной студии Speakout

## Предупреждение об изоляции функционала

> [!WARNING]
> Запрещено модифицировать или нарушать функционал, не относящийся к текущей задаче. Выполняемые правки изолированно затрагивают исключительно синхронизацию темы оформления платформы со встроенными документами `iframe` Speakout Studio. Логика воспроизведения аудиодорожек, аутентификации сессий, загрузки и постраничного рендеринга PDF не изменяется.

## Утвержденные скриншоты

### Скриншот 30: Синхронизированная тема Pumpkin в Speakout Studio
![Скриншот 30: Синхронизированная тема Pumpkin в Speakout Studio](docs/speakout-screenshot-30-pumpkin-theme-sync.png)

### Скриншот 31: Синхронизированная тема Sky в Speakout Studio
![Скриншот 31: Синхронизированная тема Sky в Speakout Studio](docs/speakout-screenshot-31-sky-theme-sync.png)

### Скриншот 32: Синхронизированная тема Dark в Speakout Studio
![Скриншот 32: Синхронизированная тема Dark в Speakout Studio](docs/speakout-screenshot-32-dark-theme-sync.png)

## Этапы реализации

1. `client/02-themes.js`:
   - Реализация функции `syncThemeToFrames(themeName, customTheme)`.
   - Обход всех элементов `iframe` в текущем документе.
   - Синхронное обновление атрибутов `data-theme`, `data-painted-theme` и пользовательских CSS-переменных на `frame.contentDocument.documentElement`.
   - Передача события через `frame.contentWindow.postMessage({ type: 'enquiz-theme-change', theme: themeName, custom: customTheme })`.
   - Подключение обработчика события завершения загрузки `load` для каждого нового `iframe`, чтобы тема выставлялась немедленно при монтировании фрейма.
   - Вызов `syncThemeToFrames` внутри `applyTheme(name, options)`.

2. `speakout/web/app.js`:
   - Регистрация обработчиков сообщений `message` и изменений хранилища `storage` внутри контекста `speakout/web/app.js`.
   - Немедленное применение полученного значения темы к `document.documentElement` фрейма.

3. Тестирование и сборка:
   - Создание модульного и визуального теста синхронизации тем `test/test-speakout-theme-sync.mjs`.
   - Проверка сборки клиентских скриптов через `npm run build:preview`.
   - Проверка сборки производственных ресурсов через `node ops/build-learning-production-assets.mjs`.
   - Запуск целевых тестов `test/test-speakout-theme-sync.mjs` и `test/test-speakout-viewer.mjs`.

## Чеклист реализации

- 🟩 Реализация функции синхронизации тем со встроенными `iframe` в `client/02-themes.js`
- 🟩 Добавление обработчиков событий `message` и `storage` в `speakout/web/app.js`
- 🟩 Сборка `preview.js` через `npm run build:preview`
- 🟩 Сборка производственных ресурсов через `node ops/build-learning-production-assets.mjs`
- 🟩 Разработка и прохождение теста `test/test-speakout-theme-sync.mjs`
- 🟩 Прохождение целевых проверок Speakout
