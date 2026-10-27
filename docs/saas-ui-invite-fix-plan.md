# План исправления race condition при инвайт-регистрации в test-saas-ui.mjs

## Цель
Устранить таймаут Playwright в CI на GitHub Actions (`waiting for locator('[data-invite-email-send]') to be visible - resolved to hidden`) в тесте `test/test-saas-ui.mjs:215`.

## Причина сбоя
1. При переходе на `/?invite=teacher-fixture` инициализируется `loadOwnAccount()`.
2. После получения `user: null` от `/api/me` вызывается `leaveAccount({authEntry})`, запускающая асинхронную очистку хранилищ браузера (`clearOwnBrowserData()`).
3. При завершении `clearOwnBrowserData()` в `client/40-account.js` безусловно вызывался `show('home')`, переводящий приложение на главный экран и снимающий класс `.on` с `<section id="account">`.
4. В результате секция `#account` получала `display: none`, а кнопка `[data-invite-email-send]` внутри неё определялась Playwright как скрытая (`resolved to hidden`).
5. Дополнительно в тесте `test/test-saas-ui.mjs` ожидался только флаг `accountChecked` без ожидания полного завершения загрузки `placeBoot` и видимости `#account.on`.

## Чеклист реализации
- 🟩 1. Предотвращение сброса на `home` в `leaveAccount()` (`client/40-account.js`) и сохранение целевого экрана аккаунта/инвайта в `client/47-account.js`
- 🟩 2. Синхронизация ожидания начальной загрузки (`placeBoot`) и секции `#account.on` в `test/test-saas-ui.mjs`
- 🟩 3. Пересборка preview и production assets (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 4. Полная локальная верификация тестов (`npm run check`) — 166 скриптов успешно пройдены
