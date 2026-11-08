# План выравнивания тестов чеков доставки и стилей чата

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей изолированной задаче. Запрещено затрагивать логику приложения, серверные воркеры, Durable Objects или стили чата. Изменения строго и изолированно ограничены актуализацией мока в тесте [`test/test-chat-presentation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-presentation.mjs) и актуализацией ожидаемых значений CSS в инвариантном тесте [`test/test-chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-durable.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Рассинхронизация мока чека в `test-chat-presentation.mjs`**:
   - Код: [`test/test-chat-presentation.mjs:46-51`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-presentation.mjs#L46-L51).
   - Тест `unchanged receipts do not rebuild icons or mutate the timeline` проверяет, что повторный вызов `mergeNode` для неизмененного доставленного сообщения (`delivered: true`) не производит мутаций DOM (`writes === 0`).
   - В коде [`production/chat/40-messages.js:761`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L761) проверяется класс доставленного чека: `receipt.classList.contains('is-delivered') !== Boolean(face.delivered && !face.read && !face.some)`.
   - В моке строки 46 `classList.contains` возвращал безусловный `() => false`. Из-за этого доставленный чек определялся как измененный, и выполнялось 7 записей в DOM на каждую из 100 итераций (`700 !== 0`).

2. **Рассинхронизация проверки CSS в `test-chat-durable.mjs`**:
   - Код: [`test/test-chat-durable.mjs:1035-1036`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-durable.mjs#L1035-L1036).
   - Тест проверяет CSS чеков в файле [`production/chat.css:127-128`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L127-L128).
   - В [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css) цвет прочитанных чеков был скорректирован до `#248bda`, а размер SVG до `15px`.
   - В тесте жестко зашиты устаревшие значения `#1682e8` и `16px`.

3. **Сбой Chromium в `test-chat-search-ui.mjs`**:
   - Ошибка `dyld: Library not loaded ... libaperitif.dylib ... library load denied by system policy` вызвана системным сбоем клонирования бандла Chrome при обновлении macOS. При прямом повторном запуске тест выполняется успешно (код 0).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`test/test-chat-presentation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-presentation.mjs): добавление возврата `true` для класса `is-delivered` в моке `receipt.classList.contains`.
  - [`test/test-chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-durable.mjs): приведение регулярных выражений проверки CSS в соответствие с фактическими стилями в [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css).

- **Инварианты**:
  - Стили в [`production/chat.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css) не модифицируются.
  - Логика клиентского и серверного кода чата сохраняется без изменений.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Выравнивание мока доставленного чека в [`test/test-chat-presentation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-presentation.mjs).
- 🟩 **Этап 2**: Выравнивание регулярных выражений проверки CSS в [`test/test-chat-durable.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-durable.mjs).
- 🟩 **Этап 3**: Детерминированная проверка обоих тестовых файлов.

---

## 4. Детерминированный метод верификации (Verification Method)

1. `node --test test/test-chat-presentation.mjs`
2. `node --test test/test-chat-durable.mjs`
3. `node --test test/test-chat-search-ui.mjs`
