# План стабилизации закрепления инспектора звёзд (Star Inspector Pin Stabilization)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать логику астрономических вычислений, каталога звёзд, анимации созвездий, карточек инспектора и несвязанных тестов. Изменения строго ограничены атрибутом закрепления `dataset.skyPinned` в `client/06-auth-sky.js` и синхронизацией ожидания в `test/test-star-inspector-ui.mjs`.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Файл и строки сбоя**: [`test/test-star-inspector-ui.mjs#L88-L96`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-star-inspector-ui.mjs#L88-L96)
- **Суть проблемы**:
  1. В тесте выполняется `await page.mouse.click(starPos.x, starPos.y);`. При этом Playwright перемещает курсор мыши на координаты звезды, что немедленно генерирует событие `mousemove`.
  2. Обработчик `onMove` в [`client/06-auth-sky.js#L1032`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L1032) отображает карточку с `isPinned = false` и добавляет CSS-класс `.active`.
  3. Ожидание `await page.waitForFunction(() => document.querySelector('.auth-sky-star-inspector.active'))` в [`test/test-star-inspector-ui.mjs#L90`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-star-inspector-ui.mjs#L90) разрешалось сразу же от события наведения (`hover`), ещё до того, как браузер обрабатывал событие клика (`onClick` в [`client/06-auth-sky.js#L1084`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js#L1084)), устанавливающее `pinned = true`.
  4. Следующая строка теста `await page.mouse.move(10, 10)` отправляла курсор мыши в сторону. Если клик ещё не успел применить флаг `pinned = true`, обработчик `onMove` расценивал это как обычный увод мыши и вызывал `hideInspector()`. В результате проверка `assert.equal(await inspector.isVisible(), true)` на строке 96 падала с ошибкой `false !== true`.

---

## 2. Границы области изменений и инварианты (Scope & Invariants)

- В [`client/06-auth-sky.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/06-auth-sky.js): при фиксации `pinned = true` проставляется детерминированный DOM-атрибут `canvas.dataset.skyPinned = 'true'`, а при `hideInspector()` удаляется `delete canvas.dataset.skyPinned`.
- В [`test/test-star-inspector-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-star-inspector-ui.mjs): на строке 90 ожидается подтверждение фактической фиксации клика `canvas.dataset.skyPinned === 'true'` (вместе с классом `.active`).
- Сохранены все существующие контракты API, публичные методы и обработчики событий.

---

## 3. Чек-лист реализации

- 🟩 **Этап 1: Добавление атрибута `dataset.skyPinned` в `client/06-auth-sky.js`**
  - Файл: `client/06-auth-sky.js`
  - Установка `canvas.dataset.skyPinned = 'true'` при `isPinned = true` в `showInspector()`.
  - Удаление `delete canvas.dataset.skyPinned` в `hideInspector()`.

- 🟩 **Этап 2: Детерминированное ожидание закрепления в `test/test-star-inspector-ui.mjs`**
  - Файл: `test/test-star-inspector-ui.mjs`
  - Заменена строка 90 на проверку `document.getElementById('authSky')?.dataset?.skyPinned === 'true'`.
  - Добавлена проверка сброса `dataset.skyPinned` при клике вне карточки на строке 102.

- 🟩 **Этап 3: Сборка и детерминированная верификация**
  - Запущены `npm run build:preview && node ops/build-learning-production-assets.mjs` — выполнено чисто без ошибок.
  - Проведена серия из 5 последовательных запусков `node --test test/test-star-inspector-ui.mjs` — все 5 итераций пройдены успешно (100% pass).
  - Проверены смежные целевые тесты (11 из 11 тестов успешны).
