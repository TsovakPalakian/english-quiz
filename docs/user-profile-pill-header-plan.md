# План реализации компактного Pill-бейджа профиля и выпадающего меню настроек (FEAT-USER-PROFILE-PILL)

**Связанные компоненты**:
- Шаблон разметки: [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)
- Таблица стилей интерфейса: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
- Клиентский модуль профиля: [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js)
- Модуль аутентификации и состояния пользователя: [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js)

---

## 1. Спецификация функциональности (Вариант 1)

### 1.1. Элемент шапки (Pill Badge)
1. **Капсула**: скругленный контейнер (`border-radius: 9999px`), белый фон `var(--card, #ffffff)`, рамка `1px solid var(--line, #e2e8f0)`, легкая тень, плавное изменение фона при наведении.
2. **Аватар**: круг 32x32px с градиентным фоном и инициалами (или изображением `avatarUrl`), тонкая обводка.
3. **Индикатор онлайна**: точка 10x10px в правом нижнем углу аватара с белым кантом (`bg-emerald-500` по умолчанию).
4. **Имя пользователя**: жирный текст 12px с обрезанием переполнения (`text-overflow: ellipsis; white-space: nowrap; max-width: 130px;`).
5. **Чип роли**:
   - `ADMIN` / `Администратор`: фон `bg-indigo-50`, текст `text-indigo-700`, рамка `border-indigo-200`, эмодзи `👑`.
   - `LEAD INSTRUCTOR` / `Методист`: фон `bg-violet-50`, текст `text-violet-700`, рамка `border-violet-200`, эмодзи `🎓`.
   - `TEACHER` / `Преподаватель`: фон `bg-blue-50`, текст `text-blue-700`, рамка `border-blue-200`, эмодзи `📚`.
   - `STUDENT` / `Студент`: фон `bg-emerald-50`, текст `text-emerald-700`, рамка `border-emerald-200`, эмодзи `🎒`.
6. **Шеврон**: иконка стрелки вниз с плавной анимацией вращения на 180° при открытом меню.

### 1.2. Выпадающее меню (Settings Popover)
1. **Позиционирование**: абсолютное, привязанное к правому краю капсулы (`right: 0; top: calc(100% + 8px); width: 320px; z-index: 100;`).
2. **Оформление**: карточка со скруглением 16px, выраженной тенью и рамкой в едином стиле интерфейса.
3. **Состав секций**:
   - Карточка пользователя: увеличенный аватар 48px, имя, email, бейдж роли с эмодзи.
   - Быстрый переключатель статуса: три кнопки выбора («В сети», «На занятии», «Отошел») с сохранением в `localStorage`.
   - Акцентная кнопка «Панель настроек (Settings)»: шестеренка, шорткат `⌘,` (или `Ctrl+,`), клик открывает экран `#settings`.
   - Навигационные пункты: «Мой профиль и данные», «Роли и права в Lumiscia», «Уведомления уроков».
   - Подвал: кнопка «Выйти» (красный акцент, вызов стандартного обработчика логаута) и номер версии системы `v2.4.0 Lumiscia`.
4. **Интерактивность и доступность**:
   - Закрытие по клику вне контейнера меню.
   - Закрытие по клавише `Escape`.
   - Горячая клавиша `⌘,` (Mac) и `Ctrl+,` (Windows/Linux) для открытия настроек.
   - Атрибуты `aria-expanded` и `aria-haspopup`.

---

## 2. Границы области изменений и инварианты

> [!WARNING]
> Запрещено нарушать существующую логику навигации `show(id)` / `enquizVisit(id)`, контракты авторизации `authUser` и работу существующей боковой панели сайдбара. Изменения строго изолируются в добавлении компонента Pill-бейджа, стилей Popover-меню и вспомогательных событий клавиатуры.

Инварианты:
1. При отсутствии авторизованного пользователя (`!authUser`) капсула профиля скрыта (`display: none`).
2. При переходе в режим просмотра ученика (`viewAccount`) отображается имя и роль просматриваемого профиля без нарушения работы сессии.
3. Открытие настроек через капсулу вызывает штатный переход к секции `#settings` (`show('settings')`).
4. Нажатие кнопки «Выйти» выполняет штатную процедуру сброса авторизации приложения.

---

## 3. Чек-лист реализации

### ЭТАП 1. Разметка и контейнер в шапке (`STAGE-HEADER-MARKUP`)

- `🟩` Задача 1.1: Добавление контейнера шапки `#shellHeader` с точкой монтирования `#userProfilePillHost` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).

### ЭТАП 2. Стилизация Pill-бейджа и Popover (`STAGE-PILL-STYLES`)

- `🟩` Задача 2.1: Стилизация капсулы Pill-бейджа, аватара 32px, онлайн-точки, бейджей ролей и анимации шеврона в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `🟩` Задача 2.2: Стилизация карточки выпадающего меню Popover, переключателя статусов, кнопок навигации, шортката и кнопки выхода в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `🟩` Задача 2.3: Адаптивность для мобильного экрана (сворачивание имени при ширине экрана менее 600px).

### ЭТАП 3. Клиентский модуль и события (`STAGE-PILL-LOGIC`)

- `🟩` Задача 3.1: Создание клиентского скрипта [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js) с генерацией HTML-разметки на основе объекта `authUser`.
- `🟩` Задача 3.2: Обработка клика раскрытия меню, клика вне области (`click outside`), нажатия `Escape` и глобальных горячих клавиш `⌘,` / `Ctrl+,`.
- `🟩` Задача 3.3: Обработка переключения статуса присутствия с сохранением в `localStorage` и обновлением цвета онлайн-точки.
- `🟩` Задача 3.4: Привязка перехода в настройки (`show('settings')`) и логаута (`data-account="logout"`).
- `🟩` Задача 3.5: Вызов обновления бейджа из [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js) при смене пользователя или состояния.

### ЭТАП 4. Сборка и верификация (`STAGE-VERIFICATION`)

- `🟩` Задача 4.1: Сборка клиентских и производственных ассетов `npm run build:preview && node ops/build-learning-production-assets.mjs`.
- `🟩` Задача 4.2: Запуск тестов `node --test test/test-local-workbench-launch-ui.mjs test/test-wordwall-interactive-ui.mjs test/test-sensitive-paths.mjs test/test-learning-attendance.mjs`.
- `🟩` Задача 4.3: Playwright-проверка интерактивности бейджа (раскрытие Popover, клик по Settings, переключение статуса, закрытие по Escape/клику вне меню) и создание итогового скриншота.
