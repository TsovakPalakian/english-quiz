# План устранения мигания темы при входе после авторизации

> **Блок изоляции изменений**
> 
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемая задача строго и изолированно задевает исключительно синхронное восстановление темы оформления при переходе из гостевого состояния в авторизованное в процедуре `enterAccount`. Смежные компоненты авторизации, навигации, каталога и синхронизации данных модификации не подлежат.

## 1. Проблема

При нахождении на гостевом экране (`body.guest-auth`, `body.guest-home`) атрибут корневого элемента DOM `document.documentElement` содержит `data-theme="almond"`.
При успешной авторизации функция `enterAccount` в [`client/40-account.js:123`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L123) вызывает `show("home")` в строке [`client/40-account.js:137`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L137). Домашний экран отображается со старым атрибутом `data-theme="almond"`.
Применение сохраненной темы пользователя отложено до завершения сетевого вызова `loadAccountThemes()` к `/api/me/themes` в [`client/47-account.js:109`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/47-account.js#L109). Возникает видимая вспышка светлой темы `almond` перед переключением на сохраненную тему.

## 2. Архитектурное решение

1. В [`client/40-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js) внутри `enterAccount(user)` перед вызовом `show("home")` добавить синхронное извлечение сохраненной темы через `currentTheme()` ([`client/02-themes.js:427`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js#L427)) и немедленный вызов `applyTheme(savedTheme, { sync: false })`.
2. В [`client/47-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/47-account.js) в `applyAccountThemes(pack)` предотвращать повторное перекрашивание, если активная в DOM тема уже соответствует теме из профиля аккаунта.
3. Добавить автоматический тест в `test/test-auth-theme-flicker.mjs`, фиксирующий корректную установку `data-theme` до отображения экрана `home`.
4. Собрать рабочий клиентский бандл командой `npm run build:preview`.

## 3. Контрольный список (Checklist)

- `🟩` Этап 1: Добавление синхронного применения темы в `enterAccount` в [`client/40-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js)
- `🟩` Этап 2: Сборка клиентского бандла `preview.js` через `npm run build:preview`
- `🟩` Этап 3: Создание автоматического теста в `test/test-auth-theme-flicker-ui.mjs`
- `🟩` Этап 4: Запуск целевого теста и верификация отсутствия регрессий
