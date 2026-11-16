# План исправления области видимости переменной custom в функции applyTheme и стабилизации UI-тестов

> [!WARNING]
> Запрещено затрагивать, модифицировать или нарушать функционал, не относящийся к текущей задаче. Исправление вносится строго изолированно в функцию `applyTheme` в [client/02-themes.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js) с последующей сборкой [preview.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и продакшен-ассетов [rollback/production-assets/](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/rollback/production-assets/). Все остальные компоненты приложения, авторизация, карточки, экзамены и студия Speakout сохраняют исходное поведение.

---

### Описание проблемы

В функции `applyTheme` переменная `custom` была объявлена внутри блока `else` с помощью ключевого слова `const`:
```javascript
const custom = chosen.indexOf("user-") === 0 ? loadCustomThemes().find((row) => row.id === chosen) : null;
```
При этом в конце функции на строке 593 вызывается:
```javascript
syncThemeToFrames(chosen, custom);
```
Из-за блочной области видимости `const` обращение к `custom` вне блока `else` (а также в ветке `opts.keepPainted`) приводило к выбросу исключения:
```
ReferenceError: custom is not defined
```
Это исключение прерывало цепочку `loadAccountThemes().then(...).then(...)` при загрузке страницы, в результате чего флаг `accountReady` оставался `false`. Все сценарии интеграционных UI-тестов Playwright, ожидающие инициализации аккаунта или применяющие темы, зависали по 30-секундному таймауту.

---

### Чеклист исправления

| Статус | ID | Этап реализации |
| :---: | :---: | :--- |
| 🟩 | `TS-01` | **План и диагностика**: локализация ошибки `ReferenceError: custom is not defined` и подготовка спецификации исправления |
| 🟩 | `TS-02` | **Область видимости в client/02-themes.js**: перенос объявления `let custom = null;` на верхний уровень функции `applyTheme`, корректное извлечение кастомной темы в обеих ветках (`opts.keepPainted` и `else`) |
| 🟩 | `TS-03` | **Сборка превью и продакшен-ассетов**: запуск `npm run build:preview` и `node ops/build-learning-production-assets.mjs` |
| 🟩 | `TS-04` | **Верификация тестов**: прогон упавших UI-тестов (`test-ui-boot.mjs`, `test-lesson-pdf-ui.mjs`, `test-auth-studio-ui.mjs` и общего набора `ops/check-all.mjs --mode=local`) |
