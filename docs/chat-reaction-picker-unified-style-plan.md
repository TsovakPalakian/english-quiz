# План приведения оформления панели реакций к единому стилю чата

## 1. Постановка задачи и ссылки на код

- **Проблема**: На данный момент раскрывающееся меню реакций (`.chat-reaction-picker`) в чате оформлено в тёмной цветовой гамме с жестко закодированными значениями цветов (`#17212b`, `#242f3d`, `#2b394a`, `#708499`, `#fff`). При этом сам чат и интерфейс приложения работают в светлой теме (`var(--card)`, `var(--ink)`, `var(--line)`, `var(--acc-s)`). В результате меню реакций выглядит чужеродным темным блоком с двойными рамками контейнера `#msgContext`.
- **Затрагиваемые файлы**:
  - [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L348-L362) — стили `.chat-reaction-picker`, `.chat-reaction-search-bar`, `.chat-reaction-grid`, `.chat-reaction-section-title`, `.chat-reaction-expand-btn`.
  - [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js#L86-L147) — разметка и логика раскрытия панели реакций в `#msgContext`.
- **Целевое состояние**:
  1. Панель реакций переводится на единую дизайн-систему чата и CSS-переменные темы (`var(--card)`, `var(--ink)`, `var(--line)`, `var(--acc-s)`, `var(--mute)`).
  2. Фон окна — светлый `var(--card)` (`#ffffff`), границы — `var(--line)` (`#e2e8f0`), текст и эмодзи — в тон интерфейса `var(--ink)`.
  3. **Удаление блока поиска**: строка поиска (`.chat-reaction-search-bar`) полностью убирается из панели реакций, освобождая место для прямого выбора эмодзи.
  4. Устраняется эффект двойной рамки: контейнер `#msgContext` органично вмещает панель реакций с корректными отступами и тенью.
  5. **Полное отсутствие горизонтальной прокрутки**: ширина фиксируется по ширине контейнера (`width: 100%`, `overflow-x: hidden`), переполнение сетки реакций прокручивается строго по вертикали вниз (`overflow-y: auto`).

---

## 2. Границы области изменений и изоляция

> [!IMPORTANT]
> **Блок изоляции функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задачи строго и изолированно должны затрагивать только оформление и верстку панели реакций чата ([production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css) и [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js)). Смежные разделы платформы (уроки, группы, биллинг, профиль, авторизация) не модифицируются.

---

## 3. Детерминированная верификация

1. Сборка продакшн-ассетов: `npm run build:preview`.
2. Запуск таргетированных тестов чата и UI: `node --test test/test-chat-search-ui.mjs` и тестов контекстного меню.
3. Добавление визуального теста Playwright, проверяющего соответствие цветовой схемы панели реакций переменным темы (`var(--card)`, `var(--ink)`, `var(--line)`).

---

## 4. Этапы реализации и чеклист

- ⬜ **Этап 1**: Создание визуального теста в `test/test-chat-reaction-picker-theme.mjs` для проверки светлой и темной тем панели реакций.
- ⬜ **Этап 2**: Рефакторинг разметки и стилей в [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js) и [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css): удаление блока поиска `.chat-reaction-search-bar`, переход на дизайн-токены `var(--card)`, `var(--ink)`, `var(--line)`, `var(--mute)`, `var(--acc-s)`, с полным исключением горизонтальной прокрутки (`overflow-x: hidden`) и вертикальным скроллом вниз (`overflow-y: auto`).
- ⬜ **Этап 3**: Корректировка разметки и класса контейнера при раскрытии реакций в [production/chat/85-message-actions.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/85-message-actions.js) для устранения артефакта двойных рамок.
- ⬜ **Этап 4**: Сборка продакшн-бандла `npm run build:preview` и запуск таргетированных тестов.
- ⬜ **Этап 5**: Фиксация результатов и подготовка отчёта для пользователя.
