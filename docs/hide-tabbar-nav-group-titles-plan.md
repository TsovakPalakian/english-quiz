# План скрытия заголовков разделов в нижней панели навигации и настройки прозрачности Feedback везде, в том числе в гостевом режиме (TASK-HIDE-TABBAR-NAV-TITLES-AND-FEEDBACK-TRANSPARENCY)

**Связанные компоненты**:
- Стили десктопного сайдбара и нижней панели tabbar: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L2915-L2945), [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3404-L3415)
- Стили плавающей кнопки обратной связи: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4758-L4775)
- Исходная разметка навигации: [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L19-L36)
- Сборщик производственных ассетов: [`ops/build-learning-production-assets.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/build-learning-production-assets.mjs#L67-L70)

---

## 1. Точная формулировка проблемы и цели

1. **Заголовки групп в нижней панели**:
   В исходном шаблоне [`site/preview.html#L19-L36`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L19-L36) первичная навигация содержит текстовые заголовки групп разделов:
   - `<div class="nav-group-title">Overview</div>`
   - `<div class="nav-group-title">Curriculum</div>`
   - `<div class="nav-group-title">Workspace</div>`

   При сборке в [`ops/build-learning-production-assets.mjs#L67-L70`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/build-learning-production-assets.mjs#L67-L70) меню синхронизируется в элемент `<nav class="tabbar">`. При переходе на мобильную раскладку (`@media (max-width: 760px)`) активируется панель `.tabbar`. Текстовые метки «OVERVIEW», «CURRICULUM» и «WORKSPACE» отображаются прямо в нижней панели между кнопками действий, перегружая интерфейс.
   *Цель*: скрыть `.nav-group-title` внутри `.tabbar`, сохранив их в десктопном боковом меню (`.side nav`).

2. **Прозрачность плавающей кнопки Feedback везде, в том числе в гостевом режиме**:
   В [`site/preview.css#L4758-L4776`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4758-L4776) плавающая кнопка `.feedback-floating-btn` имеет плотный фон как в авторизованной рабочей зоне, так и на гостевом экране ночного неба (`body:is(.guest-home,.guest-auth)`). В результате кнопка перекрывает расположенные под ней элементы интерфейса и звездный фон.
   *Цель*: сделать кнопку Feedback полупрозрачной везде, в том числе на гостевой странице (`opacity: 0.55` в состоянии покоя с `backdrop-filter: blur(...)`), а при наведении (`:hover`) и фокусе (`:focus-visible`) переводить её в полностью непрозрачное активное состояние (`opacity: 1`).

---

## 2. Границы области изменений, изоляция и инварианты

> [!WARNING]
> Запрещено затрагивать, модифицировать или нарушать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы исключительно областью отображения нижней панели `.tabbar` и стилей кнопки `.feedback-floating-btn`.

Инварианты:
1. Заголовки `.nav-group-title` на десктопе в боковой панели (`.side nav`) остаются полностью видимыми и сохраняют все шрифтовые свойства, отступы и правила видимости для ролей.
2. Все кнопки навигации в `.tabbar` (Home, Lessons, Groups, Exams, Words, Grammar, Entertainment, Speakout, Messages, Settings/Profile) сохраняют свои роли, обработчики кликов, атрибуты `data-jump`, иконки и бейджи.
3. Функционал клика по кнопке `#feedbackFloatingTrigger` и открытие модального окна фидбека сохраняются без изменений.
4. В высококонтрастном режиме `data-high-visibility="1"` кнопка фидбека сохраняет свой контрастный стиль.

---

## 3. Чек-лист реализации

### ЭТАП 1. Стилизация нижней панели (`STAGE-TABBAR-CSS`)
- `🟩` Задача 1.1: Добавление изолированного CSS-правила `.tabbar .nav-group-title { display: none !important; }` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

### ЭТАП 2. Стилизация кнопки Feedback везде и на гостевой странице (`STAGE-FEEDBACK-CSS`)
- `🟩` Задача 2.1: Обновление базового правила `.feedback-floating-btn` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для полупрозрачного состояния покоя (`opacity: 0.55`, `background: color-mix(in srgb, var(--card) 45%, transparent)`) и перехода к `opacity: 1` при `:hover` и `:focus-visible`.
- `🟩` Задача 2.2: Обновление правила `body:is(.guest-home,.guest-auth) .feedback-floating-btn` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для полупрозрачного состояния покоя на звездном фоне (`opacity: 0.55`, `background: rgba(14, 26, 38, 0.55)`) и перехода к `opacity: 1` при `:hover` и `:focus-visible`.

### ЭТАП 3. Верификация сборки ассетов (`STAGE-BUILD-VERIFICATION`)
- `🟩` Задача 3.1: Сборка клиентского бандла и производственных ассетов `npm run build:preview && node ops/build-learning-production-assets.mjs`.

### ЭТАП 4. Тестирование (`STAGE-TEST-SUITE`)
- `🟩` Задача 4.1: Написание целевого теста для проверки скрытия `.nav-group-title` внутри `.tabbar` при сохранении их видимости в `.side nav`.
- `🟩` Задача 4.2: Проверка стилей полупрозрачности и состояний ховера для кнопки `.feedback-floating-btn` в обычном и гостевом режимах.
- `🟩` Задача 4.3: Запуск целевого теста и верификация отсутствия регрессий в существующих тестах.
