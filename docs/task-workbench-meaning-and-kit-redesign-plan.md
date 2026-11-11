# Детальный план реализации и спецификация UI/UX редизайна Learning Workbench

## 1. Контекст проблемы и анализ текущих дефектов интерфейса

Текущая реализация `Learning kit` в файле [`client/52a-workbench.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js) вызывает полное блокирование пользователя:

1. **Тупиковое состояние пустого селектора значений**:
   В строке [`client/52a-workbench.js#L170`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js#L170) генерируется селектор `Meaning`. При отсутствии записей в `qr_card_senses` метод [`senses()`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-kits.mjs#L28) возвращает `[]`, список содержит только `<option value="">Select a meaning</option>`, а пользователю выводится сообщение `<p>No meaning selected.</p>` ([строка 172](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js#L172)).
2. **Второй тупиковый экран связывания**:
   Кнопка `Link an exact meaning` ([строка 174](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js#L174)) открывает форму со списком `Choose the intended meaning` ([строка 190](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js#L190)). Если для слова нет строк в таблице `qr_senses` ([`src/kit-legacy-mapping.mjs#L22`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/kit-legacy-mapping.mjs#L22)), список пуст, а атрибут `required` делает форму нерешаемым препятствием.
3. **Отсутствие создания смысловых определений в интерфейсе**:
   Серверный метод `createSense` объявлен в [`src/quiz-review.mjs#L55-L61`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review.mjs#L55-L61), но не выведен в роутер [`src/learning-workbench-api.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-workbench-api.mjs) и не имеет интерфейсных форм.
4. **Разрыв между карточкой урока и интерактивным комплектом**:
   В таблице `cards` уже имеются поля `en`, `ru`, `pos` и `word_key`, однако модальное окно не использует существующие данные для автоматической инициализации значения.
5. **Предотвращение дублирования с Study Engine (`daysetup`)**:
   В приложении уже существует полнофункциональный движок групповых тренировок `daysetup` -> `buildDayQueue` -> `dayq` ([`client/03g-core.js#L1458`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1458)). Окно карточки не должно перегружаться дублирующими списками чекбоксов, а должно оставаться чистым центром фокусной отработки конкретного слова или фразового глагола с бесшовным мостом к уроку.

---

## 2. Изоляция функционала и запрет нецелевых изменений

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задача строго изолирована рамками диалогового окна Learning kit, создания и привязки значений слов, бесшовного перехода к групповой тренировке урока и отображения статистики освоения. Запрещено модифицировать логику расписания уроков, систему оплаты занятий, чат, аудиосообщения, экзаменационный блок и механизмы аутентификации.

---

## 3. Разделение ответственности и эргономика интерфейса (Без дублирования)

Для исключения дублирования функционала и перегрузки модального окна применяется четкое разделение ролей:

1. **Фокусная карточка слова / фразового глагола (Скриншот 5)**:
   - Полная концентрация на выбранной лексической единице (слово `cooking` или фразовый глагол `look after`).
   - Отображение аудиопроизношения, транскрипции, перевода, семантической дефиниции и примеров предложений.
   - Запуск индивидуальной тренировки выбранного слова по любому из 20 типов упражнений.
   - Баннер быстрого перехода к тренировке урока: кнопка **«🚀 Open Lesson Study (12 items)»**, которая открывает нативный экран `daysetup` без нагромождения чекбоксов внутри модального окна.
2. **Групповая тренировка урока (Study Engine)**:
   - Переход на нативный экран настройки дня `daysetup` ([`client/03g-core.js#L1482`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1482)), где реализован выбор режимов, расчет таймера и запуск очереди вопросов по всем словам урока.

---

## 4. Сбор и отображение статистики освоения

В архитектуре платформы сбор статистики функционирует на уровне базы данных и API:

1. **История сессий тренировок**:
   В таблице `qr_session_snapshots` ([`src/kit-sessions.mjs#L44`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/kit-sessions.mjs#L44)) фиксируются попытки прохождения. Сервис [`KitStatistics.sessionsFor()`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/kit-statistics.mjs#L8-L20) рассчитывает процент правильных ответов и отдает историю сессий по эндпоинту `GET /api/learning-workbench/study/history?cardId=...`.
2. **Аналитика устной речи**:
   В таблице `qr_speech_attempts` ([`src/kit-statistics.mjs#L24-L33`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/kit-statistics.mjs#L24-L33)) сохраняются фоновые метрики произношения: точность фонетики, беглость и просодия с разбивкой по неделям (`GET /api/learning-workbench/study/pronunciation`).
3. **Отображение во вкладке Progress & Mastery**:
   Шкала освоения слова от 0% до 100%, точность по типам заданий и журнал прошлых попыток с разбором ошибок.

---

## 5. Чек-лист реализации

- 🟩 **Этап 1: Документация, спецификация и согласование мокапов**
  - 🟩 Разработать детальные прототипы и сгенерировать скриншоты:
    - `docs/task-workbench-redesign-screenshot-1.png`
    - `docs/task-workbench-redesign-screenshot-2.png`
    - `docs/task-workbench-redesign-screenshot-3.png`
    - `docs/task-workbench-redesign-screenshot-4.png`
    - `docs/task-workbench-redesign-screenshot-5.png`
  - 🟩 Зафиксировать техническую спецификацию в данном документе.
  - 🟩 Получить прямое подтверждение пользователя со словом `do`.

- 🟩 **Этап 2: Бэкенд API для создания значений карточки**
  - 🟩 Реализовать HTTP-маршрут `POST /api/learning-workbench/meanings/create` в файле [`src/learning-workbench-api.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-workbench-api.mjs).
  - 🟩 В методе `coverage()` ([`src/learning-kits.mjs#L38`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-kits.mjs#L38)) возвращать данные карточки (`cardTranslation`, `pos`, `transcription`) при отсутствии привязанных записей.
  - 🟩 Обеспечить поддержку создания значения из карточки в один клик.

- 🟩 **Этап 3: Клиентский интерфейс настройки значения слова**
  - 🟩 В файле [`client/52a-workbench.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52a-workbench.js) переработать блок `selectionRequired` в соответствии со Скриншотом 1.
  - 🟩 Реализовать кнопку быстрого создания значения в 1 клик.
  - 🟩 Добавить инлайн-форму ручного создания значения с валидацией полей.
  - 🟩 Подключить кнопку поиска по словарю через эндпоинт `/dictionary/lookup`.

- 🟩 **Этап 4: Каталог упражнений для 20 типов, бесшовный мост к уроку и статистика**
  - 🟩 Реализовать адаптивную сетку с фильтрами по 4 категориям для 20 типов упражнений (Скриншот 2).
  - 🟩 Реализовать сфокусированный интерфейс карточки с кнопкой быстрого перехода к уроку **«🚀 Open Lesson Study (12 items)»** (Скриншот 5).
  - 🟩 Интегрировать переход к нативному экрану `daysetup` из [`client/03g-core.js#L1482`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1482).
  - 🟩 Оформить вкладку `My Progress & Errors` на основе данных `GET /api/learning-workbench/study/history`.
  - 🟩 Вынести функции модерации, AI-генерации и привязки к экзамену во вкладку `Teacher Studio` (Скриншот 3).

- 🟩 **Этап 5: Автотесты, сборка ассетов и верификация**
  - 🟩 Написать целевые тесты для эндпоинта создания значений в `test/test-learning-kits.mjs`.
  - 🟩 Написать целевые тесты сценариев интерфейса в `test/test-learning-workbench-ui.mjs` и `test/test-learning-workbench.mjs`.
  - 🟩 Запустить таргетированные тесты командой `node --test` (все 83 теста пройдены успешно).
  - 🟩 Выполнить сборку клиентских ассетов командой `npm run build:preview`.

---

## 6. Графические макеты интерфейса

### Скриншот 1: Первичная настройка значения слова (Fast Setup & Inline Meaning Creation)

![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-workbench-redesign-screenshot-1.png)

*Подпись: Скриншот 1. Интерфейс карточки слова без словарного значения: отображение перевода из карточки, кнопка быстрого создания в 1 клик и инлайн-форма ручной настройки с поиском по словарю.*

---

### Скриншот 2: Интерактивный хаб тренировок слова для всех 20 типов упражнений (Practice Quizzes Hub)

![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-workbench-redesign-screenshot-2.png)

*Подпись: Скриншот 2. Хаб тренировок слова с активным значением: панель значения, фильтр по 4 категориям для всех 20 типов упражнений, сетка карточек с кнопками Practice и кнопка комплексной тренировки.*

---

### Скриншот 3: Студия преподавателя и управление упражнениями (Teacher Studio)

![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-workbench-redesign-screenshot-3.png)

*Подпись: Скриншот 3. Панель инструментов преподавателя: пакетная генерация недостающих заданий через AI, привязка к экзаменам и таблица версий с очередью проверки.*

---

### Скриншот 4: Прототип групповой тренировки с фразовыми глаголами (Group Drill Prototype)

![Скриншот 4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-workbench-redesign-screenshot-4.png)

*Подпись: Скриншот 4. Экспериментальный прототип выбора слов чекбоксами внутри модального окна.*

---

### Скриншот 5: Эргономичный интерфейс слова без нагромождения чекбоксов (Refined Word Focus & Lesson Bridge)

![Скриншот 5](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-workbench-redesign-screenshot-5.png)

*Подпись: Скриншот 5. Финальный эргономичный интерфейс: полное внимание текущему слову или фразовому глаголу («look after»), запуск индивидуальных упражнений и аккуратная кнопка-мост к тренировке всего урока («Open Lesson Study») без дублирования функционала и без громоздких чекбоксов.*
