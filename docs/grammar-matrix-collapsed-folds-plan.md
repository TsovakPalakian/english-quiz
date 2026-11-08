# План: сворачивание блоков по умолчанию и унификация стрелок аккордеонов

## 1. Постановка задачи и ссылки на код
1. **Грамматический хаб (`#tenses`)**:
   - В функции `paintHub()` в [`client/00-core.js#L780-L803`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L780-L803) блоки `<details class="resource-fold" id="grammarRulesFold">` и `<details class="resource-fold" id="grammarConfusedFold">` рендерятся без атрибута `open` и свернуты по умолчанию.
   - Стрелка `▶` расположена слева перед заголовком в виде стандартного маркера раскрытия.
2. **Экран деталей карточки слова (`#made`)**:
   - В [`client/03c-cards.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js) (строки 56, 64, 83, 320, 337, 353, 363, 369) аккордеоны `<details class="saas-details made-details">` рендерятся без атрибута `open` и свернуты по умолчанию.
   - В [`site/preview.css#L1424-L1435`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L1424-L1435) для `.made-details summary` удалена кастомная правая стрелка `▾`, скрытие маркера и выравнивание `space-between`. Стрелка `▶` отображается слева перед текстом идентично блокам грамматического хаба.

---

## 2. Границы области изменений и изоляция функционала

> [!WARNING]
> **БЛОК ЗАПРЕТА ЗАТРАГИВАНИЯ СМЕЖНОГО ФУНКЦИОНАЛА:**
> Строго запрещено модифицировать или нарушать поведение компонентов, не относящихся к текущей задаче. Изменения изолированы исключительно удалением атрибута `open` у `<details class="resource-fold">` в [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js), у `<details class="saas-details made-details">` в [`client/03c-cards.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js), а также стилем `.made-details summary` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css). Логика тренажеров, карточек, поиска, подсчета элементов и стили других экранов не затрагиваются.

---

## 3. Этапы реализации и чеклист

- 🟩 **Этап 1**: Согласование понимания задачи и макета Скриншот 2 с пользователем, ожидание прямого разрешения со словом `do`.
- 🟩 **Этап 2**: Удаление атрибута `open` в [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js) (`#grammarRulesFold`, `#grammarConfusedFold`).
- 🟩 **Этап 3**: Удаление атрибута `open` в [`client/03c-cards.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03c-cards.js) (Usages, English → Russian, Russian → English, Phrases, Usage quizzes, Quiz).
- 🟩 **Этап 4**: Обновление правил CSS в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для `.made-details summary`, убирающее правую стрелку и переключающее на левую стрелку `▶` как на Скриншоте 1.
- 🟩 **Этап 5**: Сборка бандла `preview.js` через `npm run build:preview` и продакшн-ассетов через `ops/build-learning-production-assets.mjs`.
- 🟩 **Этап 6**: Написание тестов `test/test-collapsed-folds.mjs` (проверка отсутствия `open` по умолчанию, раскрытия, DOM runtime и Playwright рендеринга стрелок) и детерминированная верификация.
- 🟩 **Этап 7**: Финальный отчет с обобщенным коммит-сообщением.
