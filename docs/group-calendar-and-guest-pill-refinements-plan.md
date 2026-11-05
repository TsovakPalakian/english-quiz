# План доработки календаря группы, ролей профиля, посещаемости, чата и шапки (Group Calendar, Roles, Attendance & Shell Refinements Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать схему базы данных `catalog_documents`, таблицы пользователей `users`, систему аутентификации `identify`, права преподавателей `teacherMayTeachGroup`, редактор уроков `lmOpenLesson`, систему тестирования экзаменов `examOpenSelected` и несвязанные маршруты API. Изменения строго ограничены:
> 1. Скрытием плашки профиля для неавторизованных пользователей на гостевой странице и на экранах уроков, экзаменов и редакторов в [`client/20a-user-profile-pill.js#L96-L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L96-L105) и [`client/00-core.js#L145-L235`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L145-L235), а также автоматическим возобновлением показа плашки при возврате на обычные экраны.
> 2. Заменой плашек ролей на `Support`, `Teacher`, `Student` с сохранением шрифта и регистром Title Case (первая буква заглавная, остальные строчные) без принудительного `text-transform: uppercase` в [`client/20a-user-profile-pill.js#L74-L86`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L74-L86) и [`site/preview.css#L7038`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L7038).
> 3. Изоляцией состояния календаря и посещаемости по ключу месяца (`monthCache`) и устранением бага 400 `Invalid lesson date` (Bug ID `da451ab5390e0ca7fc44e086628f6156`) в [`client/53a-group-calendar.js#L170-L205`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L170-L205).
> 4. Корректным подсчетом уроков и экзаменов группы за месяц в [`client/53a-group-calendar.js#L304,L485`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L304).
> 5. Форматированием плашек футера через интерпункт (`·`) вместо двоеточия в [`client/53a-group-calendar.js#L483-L490`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L483-L490).
> 6. Полным удалением фиктивных примеров студентов `SAMPLE_STUDENT_NAMES` с отображением исключительно реального состава группы в [`client/53a-group-calendar.js#L8,L38-L72`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L8).
> 7. Отображением диалога выбора при наличии нескольких уроков или совмещении урока и экзамена на одной дате в [`client/53a-group-calendar.js#L680-L689`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L680-L689).
> 8. Устранением парных ошибок 410 при нажатии «Report to chat» (Bug ID `c64bce63dafe98052d4808fd43ae9e24` для `/api/messages/open` и Bug ID `e6b2359ef481fcbec55f7da09323d338` для `/api/messages/send`) через экспорт метода `sendGroupChatMessage` в [`production/chat/90-settings.js#L933`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L933), вызов его в [`client/53a-group-calendar.js#L832-L852`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L832) без обращения к устаревшим HTTP-маршрутам `/api/messages/open` и `/api/messages/send`, а также фильтрацию 410 в [`src/bug-log.mjs#L115`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115) и [`client/main/main-bridge.js#L190`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L190).
> 9. Подгрузкой фотографии профиля пользователя через `/api/messages/avatar?subject=...` с механизмом отката к инициалам в [`client/20a-user-profile-pill.js#L112-L115`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L112) и вызовом `scheduleProfiles()` в [`production/chat/90-settings.js#L565,L645`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L565).
> 10. Синхронизацией навигационной цепочки открытых данных в контейнере `.shell-header-left` в [`client/00-core.js#L309-L326`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L309) и [`site/preview.html#L43-L46`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L43).
> 11. Выравниванием заголовка Settings слева и плашки профиля справа на одной строке сетки в [`site/preview.html#L43`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L43) и [`site/preview.css#L6928-L6943`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L6928).
> 12. Скрытием верхней плашки `shellHeader` на экранах уроков, экзаменов и в их редакторах, а также обязательным возобновлением показа при выходе на предыдущие и общие экраны в [`client/00-core.js#L145-L235`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L145) и [`client/20a-user-profile-pill.js#L96-L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L96-L105).

---

## 1. Точная формулировка задач (Problem Statement)

### Пункт 1 (Скриншот 1: плашка гостя на лендинге)
- **Файл**: [`client/20a-user-profile-pill.js#L96-L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L96-L105)
- **Проблема**: На странице неавторизованного пользователя (`#home`, звездное небо с кнопкой «Enter the Learning Studio») вверху отображается плашка профиля `Guest GUEST v`, а заголовок `shellHeader` принудительно отображается через `header.hidden = false`.
- **Решение**: При отсутствии авторизованного пользователя (`!user`) очищать контейнер `host.innerHTML = ''`, скрывать заголовок `header.hidden = true` и прекращать выполнение функции.

### Пункт 2 (Роли Support, Teacher, Student в Title Case без верхнего регистра)
- **Файлы**: [`client/20a-user-profile-pill.js#L74-L86`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L74-L86), [`site/preview.css#L7033-L7041`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L7033)
- **Проблема**: Разработчик и учитель помечаются как `ADMIN` заглавными буквами из-за `text-transform: uppercase` и общего условия `user.role === 'ADMIN'`. Пользователь потребовал использовать три роли: `Support` (для разработчиков и поддержки), `Teacher` (для учителей), `Student` (для студентов) с сохранением шрифта и написанием с заглавной буквы с последующими строчными.
- **Решение**: Установить в `getUserRoleInfo`:
  - `Support` для разработчиков (`isDeveloper()`, `user.role === 'DEVELOPER'`);
  - `Teacher` для учителей (`isTeacher()`, `user.role === 'TEACHER'`, `user.leadInstructor`, `teacher_...`);
  - `Student` для студентов (`user.role === 'USER'`, ученики);
  - `Guest` для гостей.
  В `site/preview.css` заменить `text-transform: uppercase;` на `text-transform: none;` в `.pill-role-badge`, сохраняя размер шрифта, насыщенность и геометрию бейджа.

### Пункт 3 (Bug ID `da451ab5390e0ca7fc44e086628f6156`: 400 Invalid lesson date при смене месяца)
- **Файлы**: [`client/53a-group-calendar.js#L10-L36,L170-L205`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L10), [`src/learning-attendance.mjs#L117-L118`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-attendance.mjs#L117)
- **Проблема**: В `groupWidgetStates` состояние `lessonDates` и `attendance` сохранялось в общем объекте группы без разделения по месяцам. При переключении месяца с октября на сентябрь или ноябрь (где на сервере еще нет сохраненных записей) `state.lessonDates` не очищалось и сохраняло октябрьские даты (`2026-10-05`). При отметке посещаемости отправлялся запрос с `month: "2026-09"`, содержащий дату `2026-10-05`, что приводило к отказу сервера `400 Invalid lesson date: 2026-10-05`.
- **Решение**: Изолировать кэш дат и посещаемости по ключу месяца `monthCache = new Map<monthKey, { lessonDates, attendance, revision, loaded }>`. При формировании полезной нагрузки для `POST /api/groups/attendance` строго фильтровать `lessonDates` и даты в объекте `attendance` по префиксу `monthKey + '-'`.

### Пункт 4 (Скриншот 2: количество уроков 0 внизу при наличии отметок на календаре)
- **Файл**: [`client/53a-group-calendar.js#L304,L485`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L304)
- **Проблема**: В виджете календаря за ноябрь 2026 года на числах 1 и 5 отображаются синие точки запланированных уроков группы, однако в нижнем бейдже выводится `Lessons: 0`. Переменная `lessonCount` вычисляется исключительно из `state.lessonDates.size` (ручные отметки посещаемости), без учета фактических запланированных уроков группы из `lmLibrary.materials`.
- **Решение**: Определять количество уроков за отображаемый месяц как объединение дат из расписания материалов группы (`lmLibrary.materials`) и сохраненных дат посещаемости (`state.lessonDates`), отображая точное количество уроков месяца в нижнем бейдже.

### Пункт 5 и Дополнение (Форматирование разделителей через точку `·` вместо двоеточия и учет экзаменов)
- **Файлы**: [`client/53a-group-calendar.js#L483-L490,L805`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L483-L490)
- **Проблема**: В футере календаря показатели отображаются через двоеточие (`Lessons: 7`, `Students: 1`, `Attendance: 100%`), а экзамены отсутствуют. Пользователь запросил отображение через точку (`·`), аналогично верхним карточкам (`Lessons · 24`, `Students · 1`, `Exams · 1`).
- **Решение**: Форматировать плашки футера через интерпункт `·`: `Lessons · <b>X</b>`, `Exams · <b>Y</b>`, `Students · <b>Z</b>`, `Attendance · <b>P%</b>`. Подсчитывать количество экзаменов группы за отображаемый месяц и выводить их в отдельный бейдж.

### Пункты 6 и 8 (Выбор при нескольких уроках или совмещении урока и экзамена на одной дате)
- **Файл**: [`client/53a-group-calendar.js#L680-L689`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L680-L689)
- **Проблема**: При нажатии на дату выполняется жесткое условие `if (isScheduled && lessonObj) ... else if (examObj) ...`, которое открывает только первый найденный урок, игнорируя остальные уроки на это же число и полностью блокируя доступ к экзамену на ту же дату.
- **Решение**: Реализовать поиск всех уроков и экзаменов группы на выбранную дату через `getLessonsForDate(groupId, dateStr)` и `getExamsForDate(groupId, dateStr)`. Если на дату назначен ровно один элемент, открывать его сразу. Если элементов два или более (несколько уроков на разное время, либо урок и экзамен), открывать модальное окно со списком карточек событий (время, название, тип «Lesson» / «Exam») с кнопками перехода к соответствующему уроку или экзамену.

### Пункт 7 (Скриншот 3: отображение только реальных студентов группы без примеров)
- **Файл**: [`client/53a-group-calendar.js#L8,L38-L72`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L8)
- **Проблема**: В коде объявлен статический массив `SAMPLE_STUDENT_NAMES = ['Denis', 'Igor', 'Olga', 'Robert', 'Tatyana', 'Tsovak']`, который подставляется как резервный список из 6 (или 4) фиктивных студентов, даже когда в группе числится только 1 реальный студент (`Students · 1`).
- **Решение**: Полностью удалить массив `SAMPLE_STUDENT_NAMES` и генерацию фиктивных записей. Загружать реальных студентов группы через `groupDirectoryPeople([grp], false)`. Если справочник директории еще не готов, вызывать `loadGroupDirectory()` и обновлять виджет по завершении загрузки. Если в группе 1 студент, отображать ровно 1 студента. Если в группе 0 студентов, отображать нулевой состав без фиктивных имен.

### Пункт 9 (Bug ID `c64bce63dafe98052d4808fd43ae9e24` и `e6b2359ef481fcbec55f7da09323d338`: 410 при нажатии «Report to chat»)
- **Файлы**: [`client/53a-group-calendar.js#L832-L852`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L832), [`src/chat-worker.mjs#L304-L305`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-worker.mjs#L304), [`src/bug-log.mjs#L115`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs#L115), [`client/main/main-bridge.js#L190`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L190)
- **Проблема**: При нажатии «Report to chat» в футере календаря код последовательно вызывает устаревшие HTTP-маршруты `/api/messages/open` и `/api/messages/send`. При включенном `CHAT_V2_ENABLED` сервер возвращает HTTP 410 с сообщением «Reload the page to connect to the new chat.», что регистрируется клиентом как две отдельные ошибки приложения.
- **Решение**: Экспортировать в модуле чата метод `window.sendGroupChatMessage(groupId, text)` для отправки через WebSocket Chat V2; в `client/53a-group-calendar.js` отправлять отчет через данный метод; исключить 410 статус по путям `/api/messages/` из логгеров ошибок в `main-bridge.js` и `bug-log.mjs`.

### Пункт 10 (Не подгружается фото пользователя)
- **Файлы**: [`client/20a-user-profile-pill.js#L112-L115`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L112), [`production/chat/90-settings.js#L565-L570,L645`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L565)
- **Проблема**: Объект `authUser`, возвращаемый `/api/me`, не содержит свойства `avatarUrl`. Плашка профиля и форма настроек проверяют `user.avatarUrl`, поэтому аватар не подгружается и остаются только текстовые инициалы «TP» или иконка камеры. Кроме того, при открытии вкладки Profile в настройках чата не инициируется вызов `scheduleProfiles()`.
- **Решение**: Загружать изображение аватара по адресу `/api/messages/avatar?subject=${encodeURIComponent(user.id)}` с обработчиком `onerror`, скрывающим `img` и показывающим инициалы при отсутствии загруженного фото (HTTP 404). В форме настроек чата после вставки разметки вкладки вызывать `scheduleProfiles()`.

### Пункт 11 (Ссылка на открытые данные / навигационная цепочка в верхней панели)
- **Файлы**: [`client/00-core.js#L309-L326`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L309), [`site/preview.html#L43-L46`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L43)
- **Проблема**: Контейнер `.shell-header-left` пустует, а навигационные цепочки (breadcrumbs) и кнопки возврата дублируются внутри страниц на отдельных строках.
- **Решение**: Транслировать хлебные крошки / ссылку на текущие открытые данные в `.shell-header-left`, обеспечивая единообразную навигацию ко всем открытым сущностям.

### Пункт 12 (Выравнивание Settings и плашки профиля на одной сетке)
- **Файлы**: [`site/preview.html#L43-L46`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L43), [`site/preview.css#L6928-L6943`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L6928)
- **Проблема**: В разделе Settings заголовок и навигация находятся ниже плашки профиля, образуя пустую строку слева от плашки профиля и смещая контент страницы вниз.
- **Решение**: Выровнять заголовок/хлебные крошки Settings слева, а плашку с аватаркой справа в единой строке сетки `.shell-header`, исключив лишний пустой вертикальный отступ.

### Пункт 13 (Скрытие верхней плашки на экранах урока, экзамена и их редакторов и возобновление показа при возврате)
- **Файлы**: [`client/00-core.js#L145-L235`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L145), [`client/20a-user-profile-pill.js#L96-L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L96-L105)
- **Проблема**: На странице просмотра урока (`material`), экзамена (`examblocks`) и в их редакторах верхняя плашка `shellHeader` занимает полезную высоту экрана и дублирует элементы управления. При этом при возврате обратно показ плашки должен надежно возобновляться.
- **Решение**: В центральной функции навигации `show(id)` при переходе на экраны `material`, `examblocks`, `speaklesson`, `speakouteditor` скрывать `#shellHeader` (`header.hidden = true`). При возврате обратно на любые другие экраны (`groups`, `groupdetail`, `days`, `settings`, `exams`) при наличии `authUser` автоматически восстанавливать видимость плашки (`header.hidden = false`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js):
    - Скрытие плашки профиля и `shellHeader` для неавторизованных пользователей и на экранах уроков/экзаменов.
    - Роли `Support`, `Teacher`, `Student` (Title Case) в `getUserRoleInfo`.
    - Подгрузка аватара через `/api/messages/avatar?subject=...` с `onerror` откатом к инициалам.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html):
    - Отмена принудительного верхнего регистра (`text-transform: none;`) для `.pill-role-badge` с сохранением текущего шрифта.
    - Выравнивание сетки шапки с заголовком страницы слева и плашкой профиля справа.
  - [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js):
    - Изоляция состояния дат и посещаемости по месяцам (`monthCache`) и фильтрация отправляемых дат по префиксу `monthKey + '-'`.
    - Удаление `SAMPLE_STUDENT_NAMES` и привязка к реальному списку `groupDirectoryPeople`.
    - Подсчет фактических уроков и экзаменов группы за выбранный месяц.
    - Добавление бейджа `Exams · <b>Y</b>` в строку статистики футера виджета.
    - Форматирование разделителей футера через интерпункт `·` вместо двоеточия.
    - Функции поиска всех уроков и всех экзаменов на дату: `getLessonsForDate` и `getExamsForDate`.
    - Модальный диалог выбора события при наличии нескольких уроков или совмещении урока и экзамена на одной дате.
    - Отправка отчета календаря через метод WebSocket чата без вызова устаревших HTTP-эндпоинтов `/api/messages/open` и `/api/messages/send`.
  - [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js):
    - Управление видимостью `shellHeader` при смене экранов (`show(id)`) со скрытием на уроках/экзаменах и обязательным возобновлением показа при выходе обратно.
    - Отображение хлебных крошек / ссылки на открытые данные в `.shell-header-left`.
  - [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js):
    - Экспорт глобального метода `window.sendGroupChatMessage(groupId, text)` для отправки отчетов календаря в WebSocket Chat V2.
    - Вызов `scheduleProfiles()` при отрисовке формы профиля для загрузки аватара.
  - [`client/main/main-bridge.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js) и [`src/bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs):
    - Исключение статуса 410 для устаревших путей `/api/messages/` из регистрации ошибок.
  - Производные файлы сборки: [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js), [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js).

- **Инварианты**:
  - Сохранение контрактов вызова `lmOpenLesson(id)` и `examOpenSelected(id)`.
  - Сохранение механизма учета посещаемости и синхронизации CAS ревизий.
  - Сохранение прав преподавателя на редактирование расписания.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Запуск теста клиентского импорта и структуры: `node --test test/test-client-pdf-import.mjs`.
2. Запуск теста службы посещаемости: `node --test test/test-learning-attendance.mjs`.
3. Запуск теста логгера багов: `node --test test/test-bug-log.mjs`.
4. Сборка предпросмотра и чата: `npm run build:preview`.
5. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
6. Проверка чистоты рабочего дерева: `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟩` Скрыть плашку профиля и `shellHeader` на гостевой странице для неавторизованных пользователей в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).
- `🟩` Обновить плашки ролей на `Support`, `Teacher`, `Student` (Title Case) в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js) и отменить `text-transform: uppercase` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `🟩` Устранить ошибку 400 `Invalid lesson date` (Bug ID `da451ab5390e0ca7fc44e086628f6156`) через изоляцию состояния по ключу месяца `monthCache` и фильтрацию дат по префиксу `monthKey + '-'` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- `🟩` Удалить `SAMPLE_STUDENT_NAMES` и фиктивных студентов в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), обеспечив отображение исключительно реального состава группы через `groupDirectoryPeople`.
- `🟩` Исправить подсчет уроков за месяц, добавить бейдж экзаменов и заменить разделители в футере календаря на точку `·` вместо двоеточия (`Lessons · X`, `Exams · Y`, `Students · Z`, `Attendance · P%`) в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- `🟩` Реализовать поиск всех событий на дату (`getLessonsForDate`, `getExamsForDate`) и модальный диалог выбора при нескольких уроках или совмещении урока и экзамена в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- `🟩` Устранить парные ошибки 410 при нажатии «Report to chat» (Bug ID `c64bce63dafe98052d4808fd43ae9e24` и Bug ID `e6b2359ef481fcbec55f7da09323d338`) через экспорт `window.sendGroupChatMessage` в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js), вызов его в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js) и фильтрацию 410 в [`src/bug-log.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/bug-log.mjs) и [`client/main/main-bridge.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js).
- `🟩` Реализовать подгрузку фото профиля пользователя через `/api/messages/avatar?subject=...` с откатным показом инициалов в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js) и вызов `scheduleProfiles()` в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js).
- `🟩` Реализовать ссылку на открытые данные / хлебные крошки в `.shell-header-left` в [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js).
- `🟩` Выровнять заголовок Settings и плашку профиля в единой строке сетки в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `🟩` Скрыть верхнюю плашку `shellHeader` на страницах уроков, экзаменов и в их редакторах, и возобновлять показ при возврате в [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js) и [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).
- `🟩` Пересобрать предпросмотр и производственные ресурсы (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`).
- `🟩` Верифицировать тесты `test/test-learning-attendance.mjs`, `test/test-bug-log.mjs` и `test/test-client-pdf-import.mjs`.
