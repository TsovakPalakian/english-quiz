# План устранения отображения скрытых студентов для учителей и учеников

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей задаче изоляции скрытых пользователей. Запрещено задевать структуру базы данных, логику авторизации сессий, грамматический тренажер, чаты, аналитику, систему экзаменов и сторонние экраны. Все правки строго и изолированно ограничены исключением скрытых студентов (`u.hidden = 1`) из подсчетов и списков для ролей Учителя (`ADMIN`, `TEACHER`) и Ученика (`USER`), сохраняя полный доступ к скрытым пользователям исключительно для Разработчика (`DEVELOPER`).

---

## 1. Точная формулировка проблемы и требования (Problem Statement)

1. **Некорректный подсчет студентов на странице учебных групп учителя (`#groups`)**:
   - В карточке группы (на странице учителя `site/preview.html#groups`, отрисовываемой в [`client/52-lessons.js:201`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L201)) отображается счетчик `Students · 6`.
   - В данной группе состоят 3 активных обычных студента и 3 скрытых студента (`hidden = 1`).
   - Учитель (`role: 'ADMIN'` / `'TEACHER'`) видит общее количество 6 вместо 3.
2. **Требование безопасности и ролевой изоляции**:
   - Скрытых пользователей (`hidden = 1`) имеет право видеть и учитывать **только разработчик** (`role === 'DEVELOPER'`).
   - Для учителей (`role === 'ADMIN'`) и учеников (`role === 'USER'`) скрытые пользователи должны быть **полностью скрыты**:
     - В счетчике студентов группы (`group.studentCount` / `Students · 3`).
     - В списках участников групп (`/api/groups/members`).
     - В ростерах группы на странице деталей группы (`#groupdetail`).
     - В календаре и ведомостях посещаемости групп.
     - В выгрузках API `/api/groups` для не-разработчиков.

---

## 2. Анализ причин (Root-Cause Analysis)

1. **В бэкенде [`src/learning-groups.mjs:108-118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L108-L118)**:
   - Метод `GroupService.list(actor)` проверяет наличие таблицы `users`:
     ```javascript
     const hasUsers = (await this.db.read("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")).length > 0;
     ```
   - В продакшене/интегрированной среде таблица `users` находится в базе аккаунтов (`env.DB`), а учебные группы — в `CURRICULUM_DB` (`this.db`).
   - Из-за этого `hasUsers` возвращает `false`, и запрос выполняется без соединения с `users` и без проверки `u.hidden = 0`, подсчитывая абсолютно всех студентов, включая скрытых.
   - Аналогично в [`src/learning-groups.mjs:146-154`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L146-L154) в методе `members(actor)` при `hasUsers === false` возвращаются идентификаторы скрытых студентов.
2. **Во фронтенде [`client/52-lessons.js:201`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L201)**:
   - Функция `paintGroups()` напрямую рендерит `group.studentCount || 0`.
   - В то же время функция `groupLiveStudentCount(group)` в [`client/53-group-directory.js:26-31`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L26-L31) уже корректно фильтрует `user.role === 'USER' && !user.hidden`, но в `paintGroups()` это значение не подставляется.

---

## 3. Границы изменений и инварианты (Scope Boundaries & Invariants)

- **Инвариант 1**: Разработчик (`DEVELOPER`) по-прежнему видит всех пользователей (включая скрытых).
- **Инвариант 2**: Учителя (`ADMIN`, `TEACHER`) и студенты (`USER`) не получают информацию о скрытых пользователях ни в API `/api/groups`, ни в `/api/groups/members`, ни в клиентском интерфейсе.
- **Инвариант 3**: Никакие другие сущности (уроки, темы, карточки, экзамены, чаты) не затрагиваются.

---

## 4. Чек-лист реализации (Implementation Checklist)

- 🟩 **Этап 1: Доработка серверной службы групп ([`src/learning-groups.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs))**
  - Исключение скрытых пользователей из `studentCounts` и `members` для учителей и учеников.
  - Сохранение полного отображения скрытых пользователей для роли `DEVELOPER`.
- 🟩 **Этап 2: Доработка клиентского отображения групп ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js))**
  - Использование актуального отфильтрованного счетчика учеников без скрытых пользователей при отрисовке карточек групп на странице учителя.
- 🟩 **Этап 3: Сборка клиентских ассетов (`npm run build:preview`)**
  - Компиляция `preview.js` из исходников `client/*.js`.
- 🟩 **Этап 4: Верификация тестами**
  - Написание целевых модульных тестов на изоляцию скрытых студентов от учителей в API и интерфейсе.
  - Запуск `node --test test/test-hidden-students-isolation.mjs test/test-teacher-group-isolation-api.mjs test/test-group-directory.mjs test/test-groups-dashboard-ui.mjs test/test-learning-attendance.mjs`.

---

## 5. Визуальные скриншоты интерфейса (UI Screenshots & Mockups)

### Скриншот 1: Текущее состояние карточки группы для учителя со скрытыми студентами (Students · 6)
![Скриншот 1: Текущее состояние карточки группы для учителя со скрытыми студентами](/Users/tsovakpalakian/.gemini/antigravity/brain/fe4597bd-fc87-4746-ab6c-b3c6050eb075/screenshot-1-current-teacher-group-card.png)
*Скриншот 1: Исходная карточка группы «B1 Group» на странице учителя, где в общее число ошибочно включены 3 скрытых студента (отображается Students · 6).*

### Скриншот 2: Предлагаемое отображение карточки группы для учителя без учета скрытых студентов (Students · 3)
![Скриншот 2: Предлагаемое отображение карточки группы для учителя без учета скрытых студентов](/Users/tsovakpalakian/.gemini/antigravity/brain/fe4597bd-fc87-4746-ab6c-b3c6050eb075/screenshot-2-proposed-teacher-group-card.png)
*Скриншот 2: Предлагаемая карточка группы «B1 Group» на странице учителя после исправления: скрытые пользователи исключены, отображается реальное количество активных студентов (Students · 3).*
