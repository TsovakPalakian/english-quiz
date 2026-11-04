# Спецификация и план реализации модуля учета посещаемости учебных групп (Group Attendance)

**Связанный раздел интерфейса**: [`site/preview.html#L2047-L2050`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L2047-L2050), [`client/10-admin.js#L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L208)  
**Серверный сервис**: [`src/learning-groups.mjs#L11-L32`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L11-L32), [`src/teacher-group-access.mjs#L1-L80`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/teacher-group-access.mjs#L1-L80)  
**Графические прототипы**:
1. Матрица учета посещаемости: `media_1793785160380_b5d797c8.png` (Attendance in November: список студентов по вертикали, даты занятий по горизонтали, отметки `V` и 😔).
2. Календарь занятий месяца: `media_1793785180210_5675ee39.png` (Lessons in November: сетка дней месяца, выделение дней занятий, расчет стоимости: 9 уроков — 270 BYN, дедлайн оплаты).
3. Экран группы: `media_1793785580483_e52c44db.png` (Экран `B2+ Kate Group` с блоками Teachers, Students, Lessons, Exams).

---

## 1. Архитектурная концепция

Модуль добавляет блок `Attendance` непосредственно после раскрывающегося списка `Exams` в представлении группы [`client/10-admin.js#L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L208).

### 1.1. Составляющие компоненты модуля

1. **Календарь расписания месяца (Month Schedule Planner)**:
   - Выбор месяца и года.
   - Интерактивная календарная сетка понедельник — воскресенье (ПН–ВС) с возможностью кликом отмечать даты уроков.
   - Поля финансового расчета: цена за 1 урок (30 BYN), автоматический подсчет общего числа уроков и суммарной стоимости (9 уроков = 270 BYN), поле даты дедлайна оплаты (Deadline: 30 ноября).
2. **Матрица журнала посещаемости (Attendance Matrix Table)**:
   - Горизонтальная ось: даты выбранных уроков месяца в формате `DD.MM` (`02.11`, `04.11`, `09.11`, `11.11`, `16.11`, `18.11`, `23.11`, `25.11`, `30.11`).
   - Вертикальная ось: список студентов группы из таблицы `class_group_students` ([`src/learning-groups.mjs#L29`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L29)).
   - Интерактивные ячейки: переключение состояний кликом:
     - `V` (присутствовал — синий фон)
     - 😔 (отсутствовал — эмодзи)
     - пусто (занятие еще не проведено)
   - Панель быстрого переключения внизу таблицы (`V` / 😔).
3. **Хранение данных и права доступа**:
   - Данные сохраняются через API в таблицу `catalog_documents` пространства имен `group-attendance` либо отдельную таблицу `class_group_attendance`.
   - Редактирование разрешено только преподавателям, закрепленным за данной группой (`teacherMayTeachGroup`), и администраторам `DEVELOPER`.

---

## 2. Поэтапный план реализации

---

### ЭТАП 1. Серверная схема и API учета посещаемости (`ATT-BACKEND`)

> [!WARNING]
> Запрещено нарушать существующие контракты `GroupService` и обработчиков экзаменов. Изменения изолированы внутри новых маршрутов `/api/groups/attendance`.

#### Задача 1.1: Схема хранения и сервис посещаемости в `src/learning-attendance.mjs`
- **Файл**: `src/learning-attendance.mjs`
- **Функционал**: Класс `AttendanceService` с методами `getGroupAttendance(groupId, monthKey)`, `saveGroupAttendance(actor, groupId, monthKey, payload)`, `listGroupMonths(groupId)`.
- **Проверка прав**: Валидация преподавателя через `teacherMayTeachGroup(db, actor, groupId)`.
- **Статус**: 🟩

#### Задача 1.2: Регистрация маршрутов API воркера
- **Файл**: [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs)
- **Эндпоинты**:
  - `GET /api/groups/attendance?groupId=:id`
  - `POST /api/groups/attendance`
  - `DELETE /api/groups/attendance`
- **Статус**: 🟩

#### Задача 1.3: Автоматический тест серверной логики
- **Новый файл**: `test/test-learning-attendance.mjs`
- **Проверки**: Сохранение расписания, установка отметок студентов, изоляция прав чужого учителя (403 Forbidden).
- **Статус**: 🟩

---

### ЭТАП 2. Клиентский интерфейс аккордеона группы (`ATT-UI-INTEGRATION`)

> [!WARNING]
> Запрещено ломать работу существующих раскрывающихся списков `Teachers`, `Students`, `Lessons`, `Exams` в [`client/10-admin.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js).

#### Задача 2.1: Добавление секции `Attendance` после `Exams`
- **Файл**: [`client/10-admin.js#L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L208)
- **Функционал**: Вставка `<details class="accounts-fold" data-group-attendance><summary>Attendance</summary>...` после блока `data-group-exams`.
- **Содержимое**: Список сохраненных месяцев группы и кнопка создания расписания месяца `+ Schedule month`.
- **Статус**: 🟩

#### Задача 2.2: Сохранение состояния раскрытия списка в объекте `folds`
- **Файл**: [`client/10-admin.js#L199`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L199)
- **Функционал**: Добавление имени `'attendance'` в массив `['students','lessons','exams','teachers','teachers-list','attendance']`.
- **Статус**: 🟩

---

### ЭТАП 3. Интерактивные компоненты календаря и матрицы (`ATT-UI-COMPONENTS`)

> [!WARNING]
> Запрещено переопределять глобальные CSS-классы кнопок и таблиц. Стили изолируются префиксом `.attendance-*`.

#### Задача 3.1: Календарный планировщик расписания месяца
- **Файл**: `client/10-admin.js`
- **Компоненты**:
  - Месячная сетка ПН–ВС с подсветкой выбранных дней занятий (стилистика изображения 2).
  - Формула расчета: `[Количество уроков] × [Цена за урок] = [Итоговая сумма]`.
  - Поле ввода дедлайна оплаты.
- **Статус**: 🟩

#### Задача 3.2: Интерактивная таблица журнала посещаемости
- **Компоненты**:
  - Таблица с фиксированной левой колонкой имен студентов и горизонтальным скроллом дат (стилистика изображения 1).
  - Клик по ячейке: циклическое переключение `V` -> 😔 -> сброс.
  - Нижняя панель с кнопками быстрой отметки выбранного маркера.
- **Статус**: 🟩

#### Задача 3.3: Сборка и верификация клиентских ассетов
- **Команды**: `npm run build:preview`, `node ops/build-learning-production-assets.mjs`
- **Критерий приемки**: Корректная компиляция бандлов без синтаксических ошибок.
- **Статус**: 🟩
