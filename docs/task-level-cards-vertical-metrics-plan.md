# План реорганизации метрик карточек уровней CEFR в вертикальный столбик

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к отображению карточек уровней CEFR. Запрещено затрагивать логику курсов, календарь, чат, серверные маршруты, тесты других компонентов. Все изменения строго изолированы блоком карточек уровней в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) (и [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) при необходимости структуры DOM).

---

## 1. Точная формулировка проблемы и анализ кода

- **Локализация в коде**:
  - Генерация разметки карточек уровней: [`client/52-lessons.js#L118-L135`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L118-L135).
  - Стили метрик в карточках уровней каталога групп: [`site/preview.css#L5400-L5415`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L5400-L5415).
  - Стили карточек уровней каталога экзаменов: [`site/preview.css#L5710-L5741`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L5710-L5741).
- **Первопричина дефекта**:
  В правиле `#groupList .file-card .metric-pairs` задано свойство `display: flex; justify-content: space-between;`. При ширине карточки ~240–280px три горизонтальных блока (`Groups · X`, `Students · Y`, `Lessons · Z`) выстраиваются в одну строку. Когда числовые значения содержат две цифры (в карточке B1: `Students · 6` и `Lessons · 23`), текст сливается без промежутка (`6Lessons`).
- **Требуемое решение**:
  Перестроить вывод трех показателей в вертикальный столбик внутри карточки уровня.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. Изменения ограничены:
   - стилями карточек уровней в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
   - при выборе варианта 2 (выравнивание по краям без точки) — разметкой функции `levelButtons` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js);
   - сборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через `npm run build:preview`;
   - тестами визуального отображения и разметки.
2. Сохранять инварианты:
   - Вывод метрик на строках групп (`.day-row .day .about .metric-pairs`) остается неизменным.
   - Фильтрация по клику на карточку уровня (`data-group-level`, `data-exam-level`) сохраняет текущее поведение.
   - Класс `.is-empty` с прозрачностью 0.55 сохраняется для пустых уровней.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Согласование визуального варианта отображения (пользователем выбран **Вариант 2, Скриншот 2**).
- 🟩 **Этап 2**: Корректировка генерации разметки в `levelButtons` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) через вспомогательную функцию `levelMetricPairs` для раздельного вывода названия метрики и числового значения без слияния текста.
- 🟩 **Этап 3**: Применение стилей вертикального столбца с разнесением по краям (`display: flex; flex-direction: column; gap: 4px;` и `justify-content: space-between;` для дочерних строк) в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для `#groupList .file-card .metric-pairs` и `#examList .file-card .metric-pairs`.
- 🟩 **Этап 4**: Пересборка клиентского бандла командой `npm run build:preview` и генерация продакшен-ассетов через `ops/build-learning-production-assets.mjs`.
- 🟩 **Этап 5**: Добавление целевого теста [`test/test-level-cards-vertical-metrics-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-level-cards-vertical-metrics-ui.mjs) и адаптация проверок в [`test/test-groups-dashboard-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-groups-dashboard-ui.mjs).
- 🟩 **Этап 6**: Финальная валидация отсутствия регрессий в смежных экранах и захват подтверждающего скриншота фактического рендеринга.

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Утвержденный эталон: Скриншот 2 (Вариант вертикального расположения метрик по краям строки)
![Скриншот 2: Вариант вертикального расположения метрик по краям строки (наименование слева, значение справа)](/Users/tsovakpalakian/.gemini/antigravity/brain/5c793067-76f1-4552-abc6-d03e3e3b29f0/mockup-variant-2.png)

---

### Фактический скриншот реализации после интеграции (Скриншот 3)
![Скриншот 3: Фактическое отображение карточек уровней после применения изменений](/Users/tsovakpalakian/.gemini/antigravity/brain/5c793067-76f1-4552-abc6-d03e3e3b29f0/final-implementation-level-cards.png)

---

### Альтернативный вариант (отклонен): Скриншот 1 (Вариант с разделителем-точкой)
![Скриншот 1: Вариант вертикального расположения метрик списком с разделителем-точкой](/Users/tsovakpalakian/.gemini/antigravity/brain/5c793067-76f1-4552-abc6-d03e3e3b29f0/mockup-variant-1.png)
