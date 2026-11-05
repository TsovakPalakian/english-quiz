# План интеграции профиля пользователя в мобильную панель навигации (FEAT-MOBILE-TABBAR-PROFILE)

**Связанные компоненты**:
- Разметка нижней мобильной панели: [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L2096-L2109)
- Стили нижней панели: [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L2926-L2965)
- Логика авторизации и отображения ролей: [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L89-L106)
- Клиентский модуль навигации и состояний: [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L75-L125)
- Клиентский модуль профиля: [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js)

---

## 1. Спецификация функциональности

1. **Доступность профиля для всех ролей на мобильных устройствах**:
   - В текущей реализации кнопка `Account` в элементе `.tabbar` скрыта для преподавателей, методистов и администраторов атрибутом `data-nav-role="student"`.
   - Кнопка навигации профиля в `.tabbar` должна быть доступна всем авторизованным пользователям (`authUser !== null`), независимо от роли.
2. **Индикация активного пользователя**:
   - Отображение компактного круглого аватара пользователя (20x20px с инициалами) или иконки пользователя Lucide `user` с онлайн-индикатором статуса прямо внутри кнопки панели.
   - Подпись кнопки: `Profile` (или `Settings` при переходе в настройки).
3. **Действие при нажатии**:
   - Нажатие кнопки открывает экран настроек `#settings` (или раскрывает единый Popover-профиль).
4. **Синхронизация подсветки активного раздела (`.on`)**:
   - При нахождении на экранах `settings`, `account`, `stats`, `themes` кнопка профиля в `.tabbar` получает класс `.on` и атрибут `aria-current="page"`.

---

## 2. Границы области изменений и инварианты

> [!WARNING]
> Запрещено нарушать существующую логику переключения экранов `show(id)` / `enquizVisit(id)`, контракты авторизации `authUser` и работу элементов десктопного сайдбара. Изменения строго изолируются в нижней мобильной панели `.tabbar`, логике видимости кнопки профиля для всех авторизованных ролей и синхронизации класса `.on`.

Инварианты:
1. При отсутствии авторизованного пользователя (`!authUser`) кнопка профиля в панели скрыта.
2. Для гостевого режима (`body.guest-auth`, `body.guest-home`) панель `.tabbar` остается полностью скрытой в соответствии с правилами `site/preview.css#L3536`.
3. Все существующие кнопки в `.tabbar` (`Home`, `Lessons`, `Classes`, `Exams`, `Words`, `Grammar`, `Entertainment`, `Archive`, `Bugs`, `Messages`) сохраняют свои роли, обработчики и условия отображения.

---

## 3. Чек-лист реализации

### ЭТАП 1. Разметка и видимость кнопки профиля в tabbar (`STAGE-TABBAR-MARKUP`)

- `🟩` Задача 1.1: Обновление кнопки профиля в элементе `.tabbar` файла [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L2108) с поддержкой всех авторизованных ролей.

### ЭТАП 2. Стилизация кнопки профиля в tabbar (`STAGE-TABBAR-STYLES`)

- `🟩` Задача 2.1: Стилизация аватара 20x20px и онлайн-точки внутри кнопки `.tabbar button[data-jump="settings"]` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

### ЭТАП 3. Клиентская логика и синхронизация (`STAGE-TABBAR-LOGIC`)

- `🟩` Задача 3.1: Обновление правил видимости в [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js) для отображения кнопки профиля для всех авторизованных пользователей.
- `🟩` Задача 3.2: Обеспечение синхронизации состояния `.on` в `chromeMark()` файла [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js) при открытии экранов профиля и настроек для персонала и студентов.

### ЭТАП 4. Сборка и верификация (`STAGE-TABBAR-VERIFICATION`)

- `🟩` Задача 4.1: Сборка клиентских и производственных ассетов `npm run build:preview && node ops/build-learning-production-assets.mjs`.
- `🟩` Задача 4.2: Выполнение целевого тестового набора `node --test test/test-local-workbench-launch-ui.mjs test/test-wordwall-interactive-ui.mjs test/test-sensitive-paths.mjs test/test-learning-attendance.mjs`.
- `🟩` Задача 4.3: Playwright-проверка отображения и кликабельности кнопки в `.tabbar` на мобильном экране (390x844) для ролей `ADMIN`, `TEACHER`, `STUDENT`.
