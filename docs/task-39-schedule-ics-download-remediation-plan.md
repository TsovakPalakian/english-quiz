# План устранения ошибки скачивания файла расписания .ics (TASK-39)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к выгрузке и скачиванию iCalendar-файла расписания группы (`/api/groups/schedule.ics`). Запрещено изменять другие серверные маршруты, систему экзаменов, авторизацию, словарь, карточки и базу данных. Все изменения строго и изолированно ограничены:
> 1. Обеспечением заголовка `Content-Disposition: attachment; filename="group-${groupId}-schedule-${monthKey}.ics"` (с поддержкой `?inline=1` при необходимости) в серверном обработчике `/api/groups/schedule.ics` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs);
> 2. Добавлением атрибута скачивания `download` для ссылок на `.ics` файлы в клиенте [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js) и компоненте сообщений чата [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js);
> 3. Обновлением сборки ассетов `preview.js` и `production/chat.js` через `npm run build:preview`;
> 4. Тестами в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs) и визуальными/интеграционными тестами в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Ключ задачи**: `TASK-39` ([Jira Issue](https://lumiscia.atlassian.net/browse/TASK-39))
- **Название**: `[bug] Ошибка API при скачивании файла .ics`
- **Маршрут**: `GET /api/groups/schedule.ics?groupId=24&month=2026-11`
- **Фактическое поведение в задаче**:
  При клике по кнопке `Download .ics Calendar File` файл календаря не скачивался на устройство пользователя. Вместо этого в новой вкладке открывался URL `/api/groups/schedule.ics?groupId=24&month=2026-11` с сырым ответом ошибки: `{"error":"Not migrated. No production fallback."}` (HTTP статус 501).
- **Первопричина**:
  1. На сервере маршрут `/api/groups/schedule.ics` изначально отсутствовал в перечне обработчиков воркера и проваливался в заглушку `src/learning-stage-worker.mjs:163` со статусом 501.
  2. В ответе сервера для `/api/groups/schedule.ics` заголовок `Content-Disposition` был установлен как `inline; filename="..."` вместо `attachment; filename="..."`, из-за чего браузер пытается отобразить файл внутри вкладки как текст вместо сохранения на диск.
  3. В клиентских ссылках чата и модальных окнах теги `<a>` формировались с атрибутом `target="_blank"` и без атрибута `download`, что провоцировало открытие пустой/сырой страницы вместо инициирования нативной загрузки файла.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Серверная часть ([`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs))**:
   - Маршрут `/api/groups/schedule.ics` для методов `GET` и `HEAD` возвращает валидный поток RFC 5545 iCalendar (`text/calendar; charset=utf-8`).
   - Заголовок `Content-Disposition` по умолчанию возвращает директиву `attachment; filename="group-${groupId}-schedule-${monthKey}.ics"`, обеспечивающую скачивание файла браузером. При передаче `?inline=1` сохраняется возможность получения inline-потока.
   - Заголовок `Cache-Control: no-cache`.
   - Валидация параметров `groupId` и `month` (HTTP 400 при отсутствии).
2. **Клиентская часть ([`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js))**:
   - В модальном окне оплаты для ссылки `Download .ics Calendar File` проставляется атрибут `download="payment-deadline.ics"`.
   - В разметчике ссылок сообщений чата для ссылок на файлы `.ics` проставляется атрибут `download` для инициирования прямого скачивания.
   - Сборка клиентских скриптов через `npm run build:preview`.
3. **Верификация**:
   - Автоматические тесты в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs).
   - Тесты клиентских ссылок и сборки ассетов.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Фиксация серверного обработчика `path === '/api/groups/schedule.ics'` в [`src/learning-integrated-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-integrated-worker.mjs) с заголовком `Content-Disposition: attachment; filename="group-${groupId}-schedule-${monthKey}.ics"`.
- 🟩 **Этап 2**: Проставление атрибута `download` для `.ics`-ссылок в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js) и [`production/chat/40-messages.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js).
- 🟩 **Этап 3**: Пересборка клиентских ассетов (`npm run build:preview`).
- 🟩 **Этап 4**: Актуализация и прогон тестов в [`test/test-learning-attendance.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-attendance.mjs) и проверка генерации iCalendar.
- 🟩 **Этап 5**: Верификация отсутствия побочных эффектов на смежные компоненты.

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 1: Исходная ошибка из Jira TASK-39 (HTTP 501 Not migrated)
![Скриншот 1: Исходная ошибка из Jira TASK-39](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-39-screenshot-1.png)

### Скриншот 2: Успешное скачивание файла group-24-schedule-2026-11.ics со статусом 200 OK и Content-Disposition: attachment
![Скриншот 2: Успешное скачивание файла расписания](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-39-screenshot-2.png)

### Скриншот 3: Верификация кнопки скачивания в интерфейсе чата с атрибутом download
![Скриншот 3: Верификация кнопки скачивания в интерфейсе чата с атрибутом download](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-39-screenshot-verification.png)
