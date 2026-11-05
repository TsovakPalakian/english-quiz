# План синхронизации темы оформления с профилем пользователя (FEAT-PROFILE-THEME-SYNC)

**Связанные компоненты**:
- Клиентский модуль тем оформления: [`client/02-themes.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js#L554-L592)
- Стили Pill-бейджа и Popover: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L6952-L7330)
- Клиентский модуль профиля: [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js)

---

## 1. Спецификация функциональности

1. **Динамическая адаптация цветов к текущей теме**:
   - Замена жестко закодированных светлых оттенков фона (`#ffffff`, `#f8fafc`, `#f1f5f9`) и границ (`#e2e8f0`) в `.user-profile-pill` и `.user-profile-popover` на контекстные CSS-переменные активной темы: `var(--card)`, `var(--line)`, `var(--ink)`, `var(--mute)`, `var(--acc)`, `var(--acc-s)`.
   - Поддержка темных тем (`graphite`, `dark`, `ocean`, `plum`, `forest`, `wine`, `ember`, `lagoon`, `cherry`, `indigo`, `berry`, `fog`) с автоматической коррекцией контрастности текста, фонов чипов ролей и выпадающего меню.
2. **Синхронизация при циклическом переключении `#themeCycle`**:
   - При вызове `applyTheme(chosen, opts)` в [`client/02-themes.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js#L591) вызывается обновление интерфейса бейджа профиля.
3. **Сохранение индикаторов статуса и акцентов**:
   - Индикаторы статуса присутствия (`#10b981`, `#f59e0b`, `#94a3b8`) сохраняют цветовые значения с обводкой `var(--card)` для читаемости на любом фоне.

---

## 2. Границы области изменений и инварианты

> [!WARNING]
> Запрещено нарушать существующий алгоритм сохранения тем в `localStorage` (`THEME_KEY`), синхронизацию настроек пользователя `syncChange` и структуру предустановленных палитр `THEMES`. Изменения строго изолируются в стилях адаптации компонентов профиля к переменным темы и вызове функции обновления интерфейса профиля при смене темы.

Инварианты:
1. Поведение переключателя тем `#themeCycle` (циклическая смена темы, обновление подписи в футере сайдбара) сохраняется в полном объеме.
2. Сохранение пользовательских тем (`user-*`) и встроенных пресетов не нарушается.
3. Доступность всплывающего окна профиля и мобильной кнопки tabbar остается неизменной при любой выбранной теме.

---

## 3. Чек-лист реализации

### ЭТАП 1. Стилизация профиля под адаптивные переменные темы (`STAGE-THEME-STYLES`)

- `🟩` Задача 1.1: Перевод цветов фона, границ, текстов и ховеров в `.user-profile-pill`, `.user-profile-popover`, `.popover-header`, `.popover-item` на CSS-переменные `var(--card)`, `var(--line)`, `var(--ink)`, `var(--mute)` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `🟩` Задача 1.2: Добавление стилей бейджей ролей для темных тем оформления с повышенной контрастностью в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

### ЭТАП 2. Клиентский хук в модуле тем (`STAGE-THEME-HOOK`)

- `🟩` Задача 2.1: Добавление вызова `paintUserProfilePill()` в завершающий блок функции `applyTheme()` в [`client/02-themes.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js#L591).

### ЭТАП 3. Сборка и верификация (`STAGE-THEME-VERIFICATION`)

- `🟩` Задача 3.1: Сборка клиентских и производственных ассетов `npm run build:preview && node ops/build-learning-production-assets.mjs`.
- `🟩` Задача 3.2: Выполнение целевого тестового набора `node --test test/test-local-workbench-launch-ui.mjs test/test-wordwall-interactive-ui.mjs test/test-sensitive-paths.mjs test/test-learning-attendance.mjs`.
- `🟩` Задача 3.3: Playwright-проверка корректности контрастности и отображения профиля при переключении светлой темы (`almond`, `light`) и темной темы (`dark`, `graphite`) с сохранением скриншотов.
