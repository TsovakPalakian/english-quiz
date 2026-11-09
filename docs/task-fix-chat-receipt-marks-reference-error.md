# Устранение ReferenceError: data is not defined в chatReceiptMarks

## Описание проблемы

В тесте [test/test-chat-reconnect.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-reconnect.mjs#L100-L105) функция `chatReceiptMarks` извлекается через `extractFunction` и запускается в изолированном контексте `vm.runInNewContext` без объявления глобальных переменных `data` и `account`:
```javascript
const marks=runInNewContext(extractFunction(messages,'chatReceiptMarks')+'\nchatReceiptMarks');
```
В [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L289-L291) прямое обращение к необъявленным идентификаторам `data` и `account` вызывает падение с ошибкой:
`ReferenceError: data is not defined`.

## Граница изолированности и защита смежного функционала

<span style="color: red; font-weight: bold;">WARNING</span> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Правка строго и изолированно затрагивает:
1. Защиту доступа к `data` и `account` через проверку `typeof` в `production/chat/40-messages.js`.
2. Пересборку продакшн-файла `production/chat.js` через `npm run build:preview`.
3. Запуск целевых тестов `test/test-chat-reconnect.mjs`, `test/test-chat-presentation.mjs` и `test/test-chat-durable.mjs`.

## Этапы выполнения

- 🟩 Этап 1: Фиксация проблемы и плана в документации `docs/task-fix-chat-receipt-marks-reference-error.md`.
- 🟩 Этап 2: Добавление проверок `typeof data !== 'undefined'` и `typeof account !== 'undefined'` в [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L283-L300).
- 🟩 Этап 3: Сборка продакшн-ассетов командой `npm run build:preview`.
- 🟩 Этап 4: Прогон целевых тестов `test/test-chat-reconnect.mjs`, `test/test-chat-presentation.mjs`, `test/test-chat-durable.mjs`.

## Чек-лист проверки

- 🟩 Тест `test/test-chat-reconnect.mjs` выполняется без ошибки `ReferenceError: data is not defined`.
- 🟩 Все 15 тестов в `test/test-chat-reconnect.mjs` пройдены успешно.
- 🟩 Тесты в `test/test-chat-presentation.mjs` и `test/test-chat-durable.mjs` сохраняют 100% прохождение.
- 🟩 Продакшн-ассеты собраны без ошибок.
