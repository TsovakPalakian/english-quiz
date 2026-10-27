# План исправления race condition в инициализации и тесте test-exams-ui.mjs

## Цель
Устранить таймаут Playwright в CI на GitHub Actions (`waiting for locator('[data-exam-level="A1"]') to be visible - resolved to hidden`) из-за состояния гонки между асинхронным завершением начальной инициализации `finishPlace()`, отложенной загрузкой ассетов редактора `deferScreenAssets('exams')` и тестом `test/test-exams-ui.mjs`.

## Чеклист реализации
- 🟩 1. Предотвращение перезаписи навигации в `client/45-core.js` (`finishPlace`) и экспорт `window.placeBoot`
- 🟩 2. Обновление ожидания начальной загрузки и секции `#exams.on` в `test/test-exams-ui.mjs`
- 🟩 3. Пересборка preview и production assets (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 4. Полная локальная верификация тестов (`npm run check`) — 166 скриптов прошли успешно
