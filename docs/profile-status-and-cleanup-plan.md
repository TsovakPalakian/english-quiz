# Комплексный план реализации планировщика занятий, контекстного меню, шапки и стабилизации интерфейса

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал чата, алгоритм интервального повторения FSRS, счетчики сообщений в боковом меню (`.side nav [data-msg-open]`), навигацию других разделов приложения, карточки «Next lesson», «Weak cards», «Still learning», систему генерации квизов и движок аудиозаписи.
> Изменения строго ограничены описанными ниже компонентами:
> 1. Шапка страницы и навигация: размещение кнопок «Домой», «Назад» и крупного заголовка в строке `.shell-header-left` напротив плашки профиля, строка хлебных крошек расположена ниже.
> 2. Левый клик по дате календаря: мгновенный переход к уроку при наличии ровно 1 занятия, модальное окно выбора при 2 и более занятиях, удаление задержки 250 мс.
> 3. Контекстное меню по правому клику (`contextmenu`): планирование занятия (время начала, настраиваемая длительность в минутах со значениями 45, 60, 90, 120 мин, выбор периода действия: месяц, учебный год или произвольный диапазон), привязка урока, переключение даты в расписании.
> 4. Интеграция с календарем: генерация календарных данных с напоминаниями за 60 и за 15 минут до урока (`TRIGGER:-PT60M`, `TRIGGER:-PT15M`), формирование ссылок «Add to Google Calendar» и потока `.ics` с правилом повторения (`RRULE`) на выбранный период.
> 5. Автоматическая отправка в чат Study alerts: публикация интерактивной карточки урока с призывом добавить занятие в календарь и автоматическая отправка сообщений об обновлениях времени.
> 6. Режим «In Class» и фильтрация звука: автоматический переход в статус `In Class` на интервал урока для преподавателя и студентов группы, воспроизведение звуков только для сообщений категории Study alerts при беззвучном поступлении личных сообщений.
> 7. Дедлайн оплаты занятий, расчет суммы и реквизиты: отображение даты дедлайна в календаре, расчет окончательной суммы с учетом посещаемости ученика на дату последнего урока месяца (либо ручной ввод учителем), выставление счета 1-го числа следующего месяца при уроке в последний день месяца (с оповещением строго в этот день), отправка карточки с реквизитами в Study alerts с кнопкой подтверждения «I have paid» и напоминаниями за 2 дня, 1 день и 1 час (`TRIGGER:-P2D`, `TRIGGER:-P1D`, `TRIGGER:-PT1H`).
> 8. Уведомление о пропуске урока учеником: кнопка «Report absence» в календаре студента для отправки сообщения преподавателю в чат Study alerts о невозможности присутствовать на занятии с фиксацией отметки.
> 9. Отправка отчета «Report to chat»: загрузка ресурсов через `window.ensureMessages()`, отправка по WebSocket Chat V2 в категорию `'learning'`, подтверждение статуса только после ответа сервера.
> 10. Полное исключение скрытых студентов: проверка `!user.hidden` и `COALESCE(u.hidden, 0) = 0` во всех счетчиках, списках участников, карточках групп и матрице посещаемости на клиенте и сервере.
> 11. Фильтрация экзаменов по уровню группы: отображение в `#admingroup` только экзаменов, чей уровень совпадает с уровнем группы `accountGroupLevel(selected)`.
> 12. Форма аккаунта (`#adminUser`): векторная SVG-иконка дома, выравнивание блока `Assigned group` по образцу `System Role`, расположение кнопок жизненного цикла в один ряд на десктопе.
> 13. Ручной выбор статуса: чтение сохраненного статуса из `localStorage` в начале `getUserStatus()`.
> 14. Тултип календаря: многострочный тултип столбиком с порядковыми номерами, удаление нативного атрибута `title`.
> 15. Очистка интерфейса: скрытие фонового зеленого индикатора в плашке профиля, динамическая статус-точка в настройках, скрытие карточек `#homeUnreadTile` и `.shell-progress`.

---

## Контрольный список реализации (Implementation Checklist)

- `🟩` **Этап 1: Очистка интерфейса и сокрытие невостребованных карточек**
  - Скрыть `#homeUnreadTile` и `.shell-progress` со стилем `display: none !important;` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
  - Синхронизировать утверждение видимости в [`test/test-role-navigation-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-role-navigation-ui.mjs).
- `🟩` **Этап 2: Стилистика карточки аккаунта (`#adminUser`) и плашки профиля**
  - Заменить текстовый символ `🏠` на векторную SVG-иконку дома в [`client/10-admin.js#L900`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L900).
  - Растянуть `Assigned group` на всю ширину сетки (`grid-column: 1 / -1`) и выровнять селектор с кнопкой в одну строку по образцу `System Role` в [`client/10-admin.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
  - Выстроить кнопки `Account Status & Lifecycle` в один ряд на десктопе и в колонку при ширине до 640px в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
  - Скрыть фоновый `.chat-presence` внутри `.pill-avatar-wrap` и `.popover-avatar-wrap` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
  - Заменить статичные индикаторы в настройках профиля на статус-точку в [`production/chat/90-settings.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js) и [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).
  - Разблокировать ручное переключение статуса в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).
- `🟩` **Этап 3: Фильтрация экзаменов по уровню группы**
  - Добавить `examLevel(exam)` и фильтровать списки `assignedExams` и `candidateExams` в `paintAdminGroup()` в [`client/10-admin.js#L414-L428`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L414-L428).
- `🟩` **Этап 4: Полное исключение скрытых студентов**
  - Добавить фильтр `!user.hidden` и `COALESCE(u.hidden, 0) = 0` в SQL-запросы `studentCounts` и `members()` в [`src/learning-groups.mjs#L106-L134`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-groups.mjs#L106-L134).
  - Добавить очистку `class_group_students` при удалении аккаунта в [`src/worker.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/worker.js).
  - Добавить фильтрацию `!user.hidden` в `groupDirectoryPeople` в [`client/53-group-directory.js#L23`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L23), в `getGroupStudents` в [`client/53a-group-calendar.js#L68-L74`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L68-L74), в `renderAttendanceMatrix` и `accountGroupMetrics` в [`client/10-admin.js#L46,L315,L413`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js).
- `🟩` **Этап 5: Шапка страницы (Вариант 1)**
  - Перенести кнопки навигации («Домой», «Назад») и крупный заголовок группы в верхнюю строку `.shell-header-left` напротив плашки профиля в [`client/00-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
  - Расположить строку пути (`Groups / B1 / B1 Group`) под заголовком без дублирования вверху.
- `🟩` **Этап 6: Навигация календаря левым кликом и многострочный тултип**
  - На левый клик ячейки даты назначить прямой переход к уроку при наличии ровно 1 занятия, либо открытие окна выбора `showEventChoiceDialog` при наличии 2 и более занятий в [`client/53a-group-calendar.js#L865-L895`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L865-L895), удалив задержку таймера 250 мс.
  - Удалить нативный атрибут `title` и формировать кастомный тултип столбиком с порядковыми номерами в [`client/53a-group-calendar.js#L542-L566`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L542-L566) и [`site/preview.css#L6555-L6575`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L6555-L6575).
- `🟩` **Этап 7: Контекстное меню даты и планировщик расписания по правому клику**
  - Добавить обработчик события `contextmenu` (и `longpress` на сенсорных устройствах) на ячейки `.gcw-day` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
  - Реализовать всплывающее меню с пунктами: «Plan & schedule lesson», «Open lesson», «Toggle scheduled date», «Set payment deadline».
  - Реализовать модальное окно планирования: выбор времени начала, настраиваемая длительность в минутах (`durationMinutes`) со значениями 45, 60, 90, 120 мин, селектор материала урока, расчет времени окончания и предпросмотр в таймзоне студента.
  - Добавить выбор периода действия расписания: текущий месяц («Current Month»), учебный год («Academic Year», 1 сентября – 31 мая) либо произвольный интервал дат («Custom Period»).
  - Сохранять данные расписания дня и периода в документ посещаемости группы (`group-attendance`).
- `🟩` **Этап 8: Автоматическая отправка карточки урока и обновлений в чат Study alerts**
  - Формировать сообщение в категории `'learning'` с датой, интервалом времени, периодом действия, призывом добавить занятие в календарь, кнопкой «Add to Google Calendar» и ссылкой подписки `.ics` с напоминаниями за 60 и за 15 минут (`VALARM`).
  - При редактировании времени или даты автоматически публиковать уведомление об изменении расписания в чат Study alerts.
- `🟩` **Этап 9: Дедлайн оплаты занятий, расчет суммы с учетом посещаемости, реквизиты и напоминания**
  - Отображать бейдж дедлайна оплаты в ячейке даты календаря (`.gcw-dot.is-payment` или плашка `Payment Due`).
  - Рассчитывать окончательную сумму к оплате на основе посещенных занятий ученика (`attendedLessons * pricePerLesson`) на дату последнего урока месяца с возможностью ручного задания дедлайна и суммы преподавателем.
  - Если последнее занятие выпадает на последний день месяца, счет выставляется 1-го числа следующего месяца с оповещением строго в этот день (без предварительных предупреждений за 2 и 1 день).
  - В карточке сообщения Study alerts выводить сумму, реквизиты, дату дедлайна, кнопку добавления в календарь и кнопку подтверждения «I have paid» с обратным уведомлением преподавателя.
  - Включать в событие оплаты календаря оповещения с триггерами `TRIGGER:-P2D`, `TRIGGER:-P1D`, `TRIGGER:-PT1H` (при выставлении счета заранее).
- `🟩` **Этап 10: Уведомление преподавателя о пропуске занятия учеником через календарь**
  - В представлении календаря для студента добавить кнопку «Report absence» на карточке предстоящего урока.
  - При подтверждении отправлять сообщение в чат Study alerts преподавателю с указанием даты и времени пропуска, а также фиксировать отметку отсутствия в журнале посещаемости.
- `🟩` **Этап 11: Надежная отправка отчета «Report to chat»**
  - В [`client/53a-group-calendar.js#L1050-L1075`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L1050-L1075) вызывать `await window.ensureMessages()`, отправлять отчет по WebSocket Chat V2 в категорию `'learning'`, на сервере в [`src/chat-durable.mjs#L542`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/chat-durable.mjs#L542) использовать `Number(g.id) === Number(body.groupId)` и подтверждать статус только при успехе.
- `🟩` **Этап 12: Режим «In Class» и фильтрация звуковых оповещений**
  - В интервал активного занятия автоматически возвращать статус `in_class` для преподавателя и студентов группы в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).
  - В [`production/chat/30-rooms.js#L452-L460`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/30-rooms.js#L452-L460) воспроизводить звуковой сигнал только для сообщений категории `'learning'` (Study alerts), если активен статус `in_class`.
- `🟩` **Этап 13: Сборка производственных ресурсов и верификация тестами**
  - Выполнить `npm run build:preview && node ops/build-learning-production-assets.mjs`.
  - Запустить целевые тесты: `node --test test/test-role-navigation-ui.mjs test/test-functional-preservation.mjs test/test-learning-attendance.mjs test/test-home-render.mjs test/test-chat-ui.mjs test/test-ui-boot.mjs test/test-learning-main.mjs`.
