# План устранения таймаута видимости проверенного квиза в CI (`test-quiz-generation-ui.mjs`)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Данная задача затрагивает компонент локального тестирования и ревью генерации квизов:
> 1. `client/demos/quiz-review-local.js`: обработчик клика `open-generated` (открытие связанного квиза из карточки задания на генерацию).
> 2. `test/test-quiz-generation-ui.mjs`: шаг 08 сценария UI-теста, ожидающий видимость плашки верификации преподавателя `.verified`.
> Запрещено затрагивать и модифицировать любой несвязанный функционал.

---

### Анализ причины сбоя

- **Симптом в CI (GitHub Actions)**:
  `locator.waitFor: Timeout 30000ms exceeded.`
  `waiting for locator('[data-item="5759622b-8467-4d72-a032-92cba5a13bdb"] .verified') to be visible`
  `62 × locator resolved to hidden <p class="verified">✓ Elena · 2026-11-18</p>`
- **Коренная причина**:
  Элемент `.verified` присутствует в DOM (`62 × locator resolved to hidden`), но расположен внутри свернутого родительского элемента `<details>` (родительской группы типов или карточки квиза).
  В `client/demos/quiz-review-local.js` функция `openKitVersion` обходит всех предков элемента и гарантированно раскрывает их:
  `for(let node=item;node;node=node.parentElement)if(node.tagName==='DETAILS'){node.open=true;if(node.dataset.expand)expansion.set(node.dataset.expand,true);}`
  Однако действие `open-generated` лишь выставляло флаги в `expansion` без принудительного раскрытия дерева предков после `refresh()`. Под нагрузкой CI родительский `<details>` оставался закрытым, что блокировало видимость `.verified` в Playwright.

---

### Чеклист этапов реализации

- 🟩 **Этап 1**: Обеспечение раскрытия родительских `<details>` и сохранения состояния в `client/demos/quiz-review-local.js` при действии `open-generated`
- 🟩 **Этап 2**: Добавление защитного раскрытия предков в `test/test-quiz-generation-ui.mjs` (по аналогии со шагами 11 и 15 того же теста)
- 🟩 **Этап 3**: Верификация теста `node --test test/test-quiz-generation-ui.mjs`
- 🟩 **Этап 4**: Полный прогон `node ops/check-all.mjs` (280 из 280)
