# План исправления дефектов дашборда группы и функционала календаря ([TASK-18](https://lumiscia.atlassian.net/browse/TASK-18))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-18](https://lumiscia.atlassian.net/browse/TASK-18). Запрещено задевать структуру базы данных, логику авторизации, платежный учет `calculateStudentTuition`, систему чата `postLessonAlertToChat`, глобальный словарь, грамматику и сторонние экраны. Все правки строго и изолированно ограничены карточками дашборда группы в [`client/53-group-directory.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js), [`client/10-admin.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js), разметкой в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html), логикой календаря и журнала посещаемости в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), а также стилями ячеек и бейджей в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).

---

## 1. Точная формулировка проблем (Problem Statement)

1. **Конфликт терминологии (UX & Copywriting)**:
   - В верхних карточках дашборда выводятся `Lessons · <N>` и `Exams · <M>` (суммарное количество уроков и экзаменов группы в [`client/53-group-directory.js:71-72`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L71-L72)).
   - В нижней панели виджета календаря выводятся такие же термины `Lessons · <K>` и `Exams · <L>` (количество дат запланированных занятий в текущем месяце в [`client/53a-group-calendar.js:839-840`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L839-L840)).
   - **Решение**: Разграничить понятия: в футере календаря использовать формулировки `Scheduled lessons · <K>` и `Scheduled exams · <L>`, явно обозначающие запланированные на месяц занятия. В карточке `Lessons` сверху сохранить прямое наименование уроков группы.

2. **Логика счетчиков при пустых данных (Data Logic)**:
   - **Карточка Students**: функция `accountCount(label, count)` в [`client/10-admin.js:34`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L34) использует `count ? ' · ' + count : ''`. При `count === 0` ноль отсекается, и карточка отображает только `Students` без `· 0`. Ожидается `Students · 0`.
   - **Посещаемость пустой группы**: функция `calculateAttendancePct` в [`client/53a-group-calendar.js:115-117`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L115-L117) при `!marked` возвращает захардкоженное значение `33` (`return 33;`). В результате для пустой группы отображается `Attendance · 33%`. Ожидается `0%` (или `N/A`).

3. **Интерактивность календаря — фокус на сегодняшней дате (Calendar UI)**:
   - При инициализации виджета группы в [`client/53a-group-calendar.js:41-43`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L41-L43) дата жестко захардкожена: `year = 2026; monthIndex = 10; selectedDate = '2026-11-05'`.
   - В результате при открытии дашборда календарь выделяет 5 ноября вместо сегодняшнего дня.
   - **Решение**: Инициализировать состояние актуальной датой `new Date()`, фокусировать и подсвечивать сегодняшний день (`Today`) при первой отрисовке.

4. **Мертвые зоны в таблице посещаемости (Attendance UI)**:
   - В HTML кнопка ячейки `<button class="gcw-cell-btn is-unmarked" ...>` рендерится ([`client/53a-group-calendar.js:736`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L736)), но в стилях ([`site/preview.css:7169-7172`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L7169-L7172)) класс `.gcw-cell-btn.is-unmarked` имеет `background: transparent; color: transparent; border: 1.5px solid transparent;`.
   - Ячейка абсолютно невидима и выглядит как мертвое пустое пространство.
   - **Решение**: Добавить видимое интерактивное оформление для неотмеченной ячейки (пунктирный контур `border: 1.5px dashed var(--line); background: var(--bg-card);`, плейсхолдер `+` или точка, hover-эффект с акцентной подсветкой).

5. **Компонент диагностики группы (Dashboard UI)**:
   - **Заголовок**: в [`site/preview.html:594`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L594) компонент ошибочно назван `Subgroup Diagnostic Heatmap`. Заменяется на `Group Diagnostic Overview`.
   - **Дефект верстки бейджа**: в [`site/preview.css:3679-3680`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3679-L3680) стиль `.group-diag-pill` имеет асимметричный `border-left-width: 4px;`, который на скругленной плашке `● All clear` выглядит как съехавшая полоса/сломанный левый бордер. Заменяется на симметричный аккуратный тег со сбалансированной границей.
   - **Текст**: в [`client/53-group-directory.js:107`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L107) фраза `...recorded for this subgroup` заменяется на `...recorded for this group`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/10-admin.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js): поддержка явного нуля в `accountCount`.
  - [`client/53-group-directory.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js): копирайтинг `recorded for this group`.
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js): `calculateAttendancePct` (возврат 0 вместо 33), динамическая дата `new Date()` вместо захардкоженного `2026-11-05`, терминология в футере (`Scheduled lessons`, `Scheduled exams`).
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): обновление заголовка `Group Diagnostic Overview`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация `.gcw-cell-btn.is-unmarked`, исправление верстки `.group-diag-pill`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): производный файл сборки (`npm run build:preview`).
  - [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs): обновление/добавление тестов для проверки контрактов.

- **Инварианты**:
  - Сохранение публичного API функций `renderGroupCalendarWidget`, `calculateAttendancePct`, `loadGroupAttendanceData`.
  - Сохранение совместимости сохранения журнала посещаемости и API `/api/groups/attendance`.
  - Неизменность работы карточек на дашборде администратора и учителя.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Коррекция `accountCount` в `client/10-admin.js` для гарантированного рендеринга `· 0` при нулевом значении.
- 🟩 **Этап 2**: Исправление `calculateAttendancePct` в `client/53a-group-calendar.js` (устранение хардкода 33% при отсутствии отметок -> возврат 0%).
- 🟩 **Этап 3**: Автоматическое выделение и фокус сегодняшней даты при инициализации и загрузке календаря в `client/53a-group-calendar.js`.
- 🟩 **Этап 4**: Устранение конфликта терминологии: разделение понятий общих материалов группы (`Lessons`, `Exams`) и запланированных сессий календаря (`Scheduled lessons`, `Scheduled exams`).
- 🟩 **Этап 5**: Устранение невидимых «мертвых зон» в таблице посещаемости: добавление видимого пунктирного интерактивного стиля для `.gcw-cell-btn.is-unmarked` в `site/preview.css`.
- 🟩 **Этап 6**: Исправление компонента диагностики: переименование в `Group Diagnostic Overview`, устранение дефекта верстки бейджа `All clear`, исправление фразы `recorded for this group`.
- 🟩 **Этап 7**: Сборка ассетов (`npm run build:preview`), написание и прогон целевых тестов.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых тестов: `node --test test/test-group-directory.mjs test/test-learning-attendance.mjs`.
3. Визуальная валидация сгенерированных артефактов и UI-элементов.
