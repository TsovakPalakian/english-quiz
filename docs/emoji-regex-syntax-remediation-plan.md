# План исправления синтаксиса регулярного выражения эмодзи в чате

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к исправлению синтаксиса регулярного выражения распознавания эмодзи `emojiParts`. Запрещено задевать обработку сообщений, WebSocket-соединение чата, разметку сообщений, модальные окна, базы данных или авторизацию. Все правки строго и изолированно ограничены:
> 1. Регулярным выражением `emoji` в функции `emojiParts` в файле [`production/chat/00-core.js:109-111`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L109-L111);
> 2. Сборкой файла [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js) через команду `npm run build:preview`;
> 3. Целевыми модульными тестами распознавания эмодзи в [`test/test-chat-emoji-syntax.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-emoji-syntax.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Конфликт парсера RegExp в IDE**:
   - Код: [`production/chat/00-core.js:109-111`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js#L109-L111).
   - Причина: в регулярном выражении свойство `\p{Emoji_Modifier}` дважды помещено внутрь символьного класса `[...]`: `[\p{Emoji_Modifier}]?`. В парсере регулярных выражений IDE (PyCharm / WebStorm / IntelliJ) с флагом `/u` помещение Unicode property escapes внутрь квадратных скобок `[...]` трактуется как синтаксическая ошибка (поддержка `\p{...}` внутри `[...]` регламентирована стандартом ECMAScript 2024 с флагом `/v`). В результате парсер IDE сбивается на закрывающей квадратной скобке `]`, помечая последующие закрывающие круглые скобки `)*)$` как непарные (`Unmatched ')'`).
   - Решение: удалить избыточные квадратные скобки вокруг атомарного свойства `\p{Emoji_Modifier}`, заменив `[\p{Emoji_Modifier}]?` на `\p{Emoji_Modifier}?`. Это устраняет ошибку парсера IDE и сохраняет полное соответствие всем типам эмодзи (одиночные, с модификатором тона кожи, составные ZWJ, флаги и последовательности тегов).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`production/chat/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/00-core.js): исправление регулярного выражения `emoji` в функции `emojiParts`.
  - [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js): производный файл сборки (`npm run build:preview`).
  - [`test/test-chat-emoji-syntax.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-emoji-syntax.mjs): детерминированный модульный тест для проверки работы регулярного выражения на всех классах эмодзи.

- **Инварианты**:
  - Сохранение полной функциональности функции `emojiParts`: распознавание одиночных эмодзи, флагов, модификаторов тона кожи, последовательностей ZWJ и цифр с кейкапами;
  - Отсутствие изменений в поведении клиентского чата.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Исправление регулярного выражения `emoji` в `production/chat/00-core.js`.
- 🟩 **Этап 2**: Сборка производного файла `production/chat.js` через `npm run build:preview`.
- 🟩 **Этап 3**: Написание и выполнение модульных тестов `test/test-chat-emoji-syntax.mjs`.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-chat-emoji-syntax.mjs`.
