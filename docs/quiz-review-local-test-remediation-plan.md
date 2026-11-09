# План стабилизации теста quiz-review-local и рандомизации тестового раннера ([BUG-FIX](https://github.com/))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к стабилизации теста `test/test-quiz-review-local.mjs` и рандомизации раннера `ops/check-all.mjs`. Запрещено задевать клиентские модули приложения, стили, серверную логику и сторонние тесты. Правки строго и изолированно ограничены файлами [`test/test-quiz-review-local.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-review-local.mjs) и [`ops/check-all.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Гонка состояний в тесте `test/test-quiz-review-local.mjs:76`**:
   ```text
   locator.scrollIntoViewIfNeeded: Element is not attached to the DOM
   Call log:
     - attempting scroll into view action
       - waiting for element to be stable
   ```
   **Причина сбоя**:
   На строке 72 выполняется выбор контекста:
   `await choose('student');await nav('word');await page.locator('#context').selectOption('personal');`
   Событие смены опции запускает асинхронную функцию `run(refresh)` в [`client/demos/quiz-review-local.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/quiz-review-local.js), которая выполняет сетевые запросы к локальному бэкенду и по завершении перезаписывает содержимое `#content` через `render()`.
   Из-за отсутствия ожидания завершения перезагрузки контекста на строке 72, последующие строки 73–75 отрабатывают по устаревшим DOM-узлам. В момент вызова `setViewportSize` и `scrollIntoViewIfNeeded` на строке 76 асинхронный `render()` замещает узел в DOM, что приводит к исключению `Element is not attached to the DOM`.

2. **Отсутствие рандомизации порядка тестов в `ops/check-all.mjs`**:
   Текущий запуск упорядочивает тесты детерминированно по весам и алфавиту, что маскирует взаимную зависимость тестов от порядка их выполнения. Необходима поддержка флагов `--shuffle` и `--seed <number>` (или переменной окружения `CHECK_SHUFFLE`), чтобы рандомизировать порядок очереди тестов с воспроизводимым сидом.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`test/test-quiz-review-local.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-review-local.mjs): добавление ожидания завершения обновления контекста после `selectOption('personal')` и синхронизация состояния DOM перед прокруткой.
  - [`ops/check-all.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs): внедрение алгоритма псевдослучайного перемешивания (Fisher–Yates shuffle) на базе сида для списков `fastScripts` и `browserScripts`.
- **Инварианты**:
  - Полное сохранение всех проверок прав доступа, переходов между экранами, валидаций квот и отсутствия внешних сетевых запросов.
  - Сохранение штатного поведения `node ops/check-all.mjs` без параметров по умолчанию.

---

## 3. Контрольный список (Checklist)

- 🟩 **Этап 1**: Добавление явного ожидания завершения перезагрузки контекста `personal` (`waitForFunction`) на строке 72 и стабилизация селектора перед `scrollIntoViewIfNeeded` на строке 76 в [`test/test-quiz-review-local.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-review-local.mjs).
- 🟩 **Этап 2**: Внедрение поддержки `--shuffle` и `--seed` в [`ops/check-all.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/check-all.mjs) с логированием используемого сида.
- 🟩 **Этап 3**: Детерминированная верификация: запуск `test/test-quiz-review-local.mjs` в цикле и прогон раннера с флагом `--shuffle`.

---

## 4. Метод верификации (Verification Method)

1. Запуск теста: `node --test test/test-quiz-review-local.mjs`.
2. Запуск раннера с перемешиванием: `node ops/check-all.mjs --shuffle quiz-review`.

