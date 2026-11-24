# План устранения дефекта отображения бейджей и удаления иконки медали (TASK-13)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ ОБ ИЗОЛЯЦИИ И ЗАПРЕТЕ ЗАТРАГИВАНИЯ СМЕЖНОГО ФУНКЦИОНАЛА:**
> Выполняемые работы строго изолированы разметкой баннера мастерства на главной странице ученика (`#homeMasteryBanner`) и маршрутизацией статических файлов бейджей (`/badges/`).
> Запрещено модифицировать, нарушать или затрагивать:
> - Внутреннюю логику генерации квизов и движок интервального повторения FSRS ([client/50-quiz-fsrs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/50-quiz-fsrs.js)).
> - Структуру данных и серверные API авторизации, регистрации и сессий ([src/auth.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/auth.mjs)).
> - Редактор и менеджер уроков ([client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)).
> - Логику работы чата, сообщений и системы уведомлений ([production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js)).
> - Экзаменационный режим и логику назначения заданий.

---

## 1. Точная постановка проблемы на основе дефекта [TASK-13](https://lumiscia.atlassian.net/browse/TASK-13)

1. **Иконка медали в заголовке баннера мастерства**:
   - В [site/preview.html#L117](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L117) перед заголовком `Mastery Milestones & Badges` отображается эмодзи `🎖️` (`<span style="font-size:24px;">🎖️</span>`).
   - По требованию пользователя иконку требуется удалить, оставив заголовок выровненным по левому краю без декоративного символа.

2. **Отказ загрузки графических файлов бейджей (`/badges/*.png`)**:
   - В [site/preview.html#L127-L153](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L127-L153) теги изображений имеют пути `/badges/badge-1-symbol.png` — `/badges/badge-5-symbol.png`.
   - В [src/learning-stage-worker.mjs#L181-L185](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L181-L185) проверка `publicAsset` проверяет только пути из фиксированного списка `publicPaths` и префикс `/notification-audio/`. Запросы с префиксом `/badges/` не признаются публичными статическими ресурсами и завершаются ошибкой `501 Not migrated. No production fallback.`
   - Требуется добавить префикс `path.startsWith('/badges/')` в предикат `publicAsset` в [src/learning-stage-worker.mjs#L182](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L182).

---

## 2. Макеты и скриншоты предлагаемого интерфейса

### Скриншот 1: Баннер мастерства без медали с загруженными бейджами в теме Sky (`data-theme="sky"`)
![Скриншот 1: Баннер мастерства в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-13-screenshot-14-mastery-banner-sky.png)
*Скриншот 1. Баннер мастерства в теме Sky: заголовок без эмодзи медали, загруженные графические символы бейджей 1-5, шкала целевого процента.*

### Скриншот 2: Проверка баннера мастерства в темной теме Dark (`data-theme="dark"`)
![Скриншот 2: Баннер мастерства в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-13-screenshot-15-mastery-banner-dark.png)
*Скриншот 2. Баннер мастерства в теме Dark: высокая контрастность надписей, бейджи и чипы отображаются без остаточных заливок Sky.*

### Скриншот 3: Проверка баннера мастерства в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Баннер мастерства в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-13-screenshot-16-mastery-banner-sand.png)
*Скриншот 3. Баннер мастерства в теме Sand: гармоничная светлая палитра, четкая видимость артефактов бейджей.*

---

## 3. Чеклист реализации и верификации

- 🟩 Согласование шаблона баннера мастерства без медали с пользователем
- 🟩 Согласование функции серверной отдачи файлов бейджей
- 🟩 Удаление иконки медали `🎖️` из разметки заголовка
- 🟩 Добавление префикса `/badges/` в предикат публичных ассетов воркера
- 🟩 Добавление целевого теста отдачи статических файлов бейджей в тесты ассетов
- 🟩 Сборка продакшен-ассетов
- 🟩 Запуск целевых тестов и визуальной валидации баннера мастерства
