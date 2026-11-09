# План устранения ошибки 501 на маршруте выгрузки расписания группы (`/api/groups/schedule.ics`) (Bug ID: `69228c43e763c56e997ebf21c168ab99`)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к генерации iCalendar-файла расписания группы `/api/groups/schedule.ics`. Запрещено изменять другие серверные маршруты, систему экзаменов, авторизацию, словарь и базу данных. Все изменения строго и изолированно ограничены добавлением обработчика `/api/groups/schedule.ics` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) и тестами в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Идентификатор ошибки**: Bug ID `69228c43e763c56e997ebf21c168ab99`
- **Маршрут**: `GET /api/groups/schedule.ics?groupId=24&month=2026-11`
- **Фактический ответ сервера**: `HTTP 501 Not migrated. No production fallback.` (`{"error":"Not migrated. No production fallback."}`)
- **Локализация в клиенте**: В [`client/53a-group-calendar.js#L3257`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L3257) ссылка для скачивания календаря расписания в чате формируется как:
  ```javascript
  const icsUrl = `${origin}/api/groups/schedule.ics?groupId=${encodeURIComponent(groupId)}&month=${encodeURIComponent(monthKey)}`;
  ```
- **Первопричина**: В файле [`src/learning-integrated-worker.mjs#L696-L830`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs#L696-L830) реализованы только маршруты разового урока `/api/groups/calendar.ics` и дедлайна оплаты `/api/groups/payment-deadline.ics`. Маршрут месячного расписания группы `/api/groups/schedule.ics` отсутствовал в списке обработчиков воркера, из-за чего входящие HTTP-запросы `GET` и `HEAD` проваливались в заглушку `src/learning-stage-worker.mjs:163`, возвращая статус 501.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - Внедрение обработчика `path === '/api/groups/schedule.ics'` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs);
   - Добавление модульных тестов `GET` и `HEAD` в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs).
2. **Контракт интерфейса**:
   - Поддержка методов `GET` и `HEAD`;
   - Доступность без обязательной авторизационной сессии (для прямого импорта и подписки календарными программами Google Calendar, Apple Calendar, Outlook);
   - Валидация обязательных query-параметров `groupId` и `month` (возврат HTTP 400 при их отсутствии);
   - Извлечение данных расписания из таблицы `catalog_documents WHERE namespace = 'group-attendance' AND key = groupId + ':' + monthKey`;
   - Формирование валидного потока RFC 5545 iCalendar (`VCALENDAR`):
     - Отдельное событие `VEVENT` для каждой запланированной даты урока в месяце;
     - Точное время начала и окончания урока в часовом поясе `Europe/Minsk`;
     - Название урока и группы в поле `SUMMARY`;
     - Уведомления-напоминания `VALARM` за 1 час (`-PT60M`) и за 15 минут (`-PT15M`);
     - Заголовки ответа: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: inline; filename="group-${groupId}-schedule-${monthKey}.ics"`, `Cache-Control: no-cache`.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Реализация серверного обработчика `path === '/api/groups/schedule.ics'` для методов `GET` и `HEAD` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs).
- 🟩 **Этап 2**: Формирование событий `VEVENT` на основе `lessonDates` и `scheduleData` документа посещаемости с часовым поясом `Europe/Minsk` и напоминаниями.
- 🟩 **Этап 3**: Корректная обработка `HEAD`-запросов (возврат заголовков без тела) и пустого расписания.
- 🟩 **Этап 4**: Написание автоматических тестов в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs) с проверкой статусов 200, заголовков и содержимого iCalendar.
- 🟩 **Этап 5**: Прогон тестов и фиксация результатов верификации (8 из 8 тестов пройдены успешно).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 28: Восстановление маршрута GET /api/groups/schedule.ics (Статус 200 OK)
![Скриншот 28: Восстановление маршрута GET /api/groups/schedule.ics (Статус 200 OK)](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-schedule-ics-endpoint-fix.png)
