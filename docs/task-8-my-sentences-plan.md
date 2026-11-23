# План реализации TASK-8: Раздел «My sentences» в Words с распознаванием через Gemini и выбором наилучшего перевода

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно:
> 1. Добавления нового подраздела «My sentences» в разделе Words (Words Studio).
> 2. Создания экрана «My sentences» для ввода, распознавания и сохранения предложений пользователя.
> 3. Интеграции серверного эндпоинта анализа и перевода предложений с использованием Gemini API с возможностью выбора наиболее точного и контекстного перевода из предложенных вариантов.
> 4. Хранения предложений пользователя в пользовательском состоянии (с сохранением и синхронизацией).
>
> Строго запрещено затрагивать, модифицировать или нарушать смежный функционал:
> - Существующие разделы словаря: All words, My words, Phrasal verbs, Idioms, Everyday words.
> - Модуль голосового тьютора Voice Mode (`#lmVoiceModeModal`).
> - Модуль уроков (Lessons / Days), экзамены (Exams), грамматику (Grammar Matrix) и медиатеку (Entertainment).
> - Алгоритмы интервального повторения FSRS и Anki cards.

---

## 1. Точная формулировка задачи (Problem Statement)
В задаче [TASK-8](https://lumiscia.atlassian.net/browse/TASK-8) реализуется:
1. **Новый раздел «My sentences» в Words**:
   - В реестре колод Words (`#wordcollections .decks`) добавляется интерактивная плитка «My sentences» со счетчиком сохраненных предложений и переходом на экран раздела.
2. **Экран раздела «My sentences»**:
   - Шапка с кнопкой «Back» (возврат в Words Studio) и заголовком «My sentences».
   - Форма добавления нового предложения с полем ввода и кнопкой отправки на анализ Gemini.
   - Интерактивный блок выбора наилучшего перевода от Gemini (3–4 контекстных варианта перевода с радио-кнопками / чипами выбора).
   - Сохранение предложения с выбранным переводом в персональную коллекцию.
   - Поиск по предложениям и список карточек предложений пользователя с возможностью прослушивания произношения и тренировки.
3. **Бэкенд-эндпоинт анализа предложений через Gemini**:
   - Прием текста предложения, отправка запроса в Gemini API с инструкцией синтеза естественных, точных и идиоматичных вариантов перевода на русский язык.
   - Корректная обработка ограничений квоты, таймаутов и безопасный фоллбек.

---

## 2. Кадры и макеты утверждения

### Скриншот 1: Плитка «My sentences» в разделе Words в теме Sky (`data-theme="sky"`)
![Скриншот 1: Плитка «My sentences» в разделе Words в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-1-sky.png)

### Скриншот 2: Плитка «My sentences» в разделе Words в теме Dark (`data-theme="dark"`)
![Скриншот 2: Плитка «My sentences» в разделе Words в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-2-dark.png)

### Скриншот 3: Плитка «My sentences» в разделе Words в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Плитка «My sentences» в разделе Words в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-3-sand.png)

### Скриншот 4: Экран «My sentences» с полем ввода и выбором перевода Gemini в теме Sky (`data-theme="sky"`)
![Скриншот 4: Экран «My sentences» с вводом и выбором перевода в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-4-add-sentence-sky.png)

### Скриншот 5: Экран «My sentences» с полем ввода и выбором перевода Gemini в теме Dark (`data-theme="dark"`)
![Скриншот 5: Экран «My sentences» с вводом и выбором перевода в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-5-add-sentence-dark.png)

### Скриншот 6: Экран «My sentences» с полем ввода и выбором перевода Gemini в светлой теме Sand (`data-theme="sand"`)
![Скриншот 6: Экран «My sentences» с вводом и выбором перевода в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-6-add-sentence-sand.png)

### Скриншот 7: Всплывающий словарь выделения текста с добавлением предложения и переключателем направления в теме Sky (`data-theme="sky"`)
![Скриншот 7: Всплывающий словарь с добавлением предложения и направлением в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-7-selpop-sentence-sky.png)

### Скриншот 8: Всплывающий словарь выделения текста в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 8: Всплывающий словарь с добавлением предложения в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-8-selpop-sentence-dark.png)

### Скриншот 9: Всплывающий словарь выделения текста в светлой теме Sand (`data-theme="sand"`)
![Скриншот 9: Всплывающий словарь с добавлением предложения в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-9-selpop-sentence-sand.png)

### Скриншот 10: Индикатор анализа предложения Gemini в теме Sky (`data-theme="sky"`)
![Скриншот 10: Индикатор анализа предложения Gemini в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-10-gemini-analyzing-sky.png)

### Скриншот 11: Индикатор анализа предложения Gemini в теме Dark (`data-theme="dark"`)
![Скриншот 11: Индикатор анализа предложения Gemini в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-11-gemini-analyzing-dark.png)

### Скриншот 12: Индикатор анализа предложения Gemini в светлой теме Sand (`data-theme="sand"`)
![Скриншот 12: Индикатор анализа предложения Gemini в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-12-gemini-analyzing-sand.png)

### Скриншот 13: Предложение сохранено в список с уведомлением об успехе в теме Sky (`data-theme="sky"`)
![Скриншот 13: Предложение сохранено в список в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-13-sentence-saved-sky.png)

### Скриншот 14: Предложение сохранено в список в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 14: Предложение сохранено в список в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-14-sentence-saved-dark.png)

### Скриншот 15: Предложение сохранено в список в светлой теме Sand (`data-theme="sand"`)
![Скриншот 15: Предложение сохранено в список в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-15-sentence-saved-sand.png)

### Скриншот 16: Экран тренировки предложений «Study sentences» в теме Sky (`data-theme="sky"`)
![Скриншот 16: Экран тренировки предложений в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-16-study-sky.png)

### Скриншот 17: Экран тренировки предложений «Study sentences» в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 17: Экран тренировки предложений в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-17-study-dark.png)

### Скриншот 18: Экран тренировки предложений «Study sentences» в светлой теме Sand (`data-theme="sand"`)
![Скриншот 18: Экран тренировки предложений в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-18-study-sand.png)

### Скриншот 19: Обновленный экран «My sentences» с чистым вводом без кнопок направления и анализа в теме Sky (`data-theme="sky"`)
![Скриншот 19: Обновленный экран с чистым вводом в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-19-clean-input-sky.png)

### Скриншот 20: Обновленный экран «My sentences» с чистым вводом в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 20: Обновленный экран с чистым вводом в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-20-clean-input-dark.png)

### Скриншот 21: Обновленный экран «My sentences» с чистым вводом в светлой теме Sand (`data-theme="sand"`)
![Скриншот 21: Обновленный экран с чистым вводом в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-21-clean-input-sand.png)

### Скриншот 22: Результаты анализа предложения по нажатию Enter с выбором перевода в теме Sky (`data-theme="sky"`)
![Скриншот 22: Результаты анализа предложения по Enter в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-22-choices-sky.png)

### Скриншот 23: Результаты анализа предложения по нажатию Enter в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 23: Результаты анализа предложения по Enter в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-23-choices-dark.png)

### Скриншот 24: Результаты анализа предложения по нажатию Enter в светлой теме Sand (`data-theme="sand"`)
![Скриншот 24: Результаты анализа предложения по Enter в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-8-screenshot-24-choices-sand.png)

---

## 3. Чеклист этапов реализации

- 🟩 **Шаг 1: Согласование Шаблона 1 (Плитка «My sentences» в Words)**
  - Отображение карточки в блоке колод Words Studio.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 2: Согласование Шаблона 2 (Экран раздела «My sentences»)**
  - Разметка экрана, системная шапка со стрелкой и домиком, форма добавления, список карточек.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 3: Согласование Шаблона 3 (Всплывающий словарь выделения текста для предложений)**
  - Выделение длинного текста до 350 символов, добавление предложений в My sentences, чипы направления.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 4: Согласование Функции 1 (Распознавание и перевод через Gemini API)**
  - Отправка текста, распознавание направления, генерация вариантов перевода.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 5: Согласование Функции 2 (Сохранение в коллекцию и счетчики)**
  - Сохранение выбранного варианта перевода, проверка дубликатов, счетчики и системная шапка.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 6: Согласование Функции 3 (Тренировка предложений «Study sentences»)**
  - Двунаправленная тренировка (English ➔ Russian и Russian ➔ English).
  - Описание поведения, времени отклика, отображения в темах Sky, Dark, Sand.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 7: Реализация бэкенда распознавания предложений через Gemini API**
  - Эндпоинт анализа предложений `/api/sentences/analyze` с генерацией 3 вариантов перевода.
  - Обработка ошибок, квот и юнит-тесты (`test-my-sentences-analysis`).
  - Проверено и подтверждено `🟩`.

- 🟩 **Шаг 8: Реализация клиентской части и интерфейса**
  - Подключение плитки «My sentences» в Words Studio со счетчиком.
  - Экран «My sentences» со стандартной системной навигационной шапкой `[Home] [Left] My sentences · N`.
  - Форма быстрого добавления предложения и выбор перевода Gemini.
  - Всплывающий словарь текста с порогом до 350 символов и кнопкой добавления предложения.
  - Двунаправленная тренировка предложений (`openListedStudy` / `Choice`, `Reverse`).
  - Проверено и подтверждено `🟩`.

- 🟩 **Шаг 9: Автоматическое тестирование и сборка**
  - Сборка клиентских ассетов `npm run build:preview` и локальный билдер ассетов.
  - Целевые модульные и визуальные тесты `test-my-sentences-analysis` и `test-my-sentences-visual`.
  - Проверено и подтверждено `🟩`.

- 🟩 **Шаг 10: Согласование обновленного шаблона формы ввода предложений (без кнопок направления и кнопки анализа, запуск по Enter)**
  - Удалены 3 чипа выбора направления: определение направления автоматическое по умолчанию (наличие кириллицы задает `ru-en`, латиницы — `en-ru`).
  - Удалена отдельная кнопка «✨ Analyze with Gemini».
  - Анализ предложения запускается по окончании ввода и нажатию клавиши `Enter`.
  - Отображение 3 вариантов перевода на английском языке при русском вводе (`Natural · Literary`, `Conversational nuance`, `Refined contextual`) и сохранение через вызов метода создания персональной карточки.
  - Утверждено пользователем (`app` / `одо`).

- 🟩 **Шаг 11: Реализация утвержденного шаблона формы ввода и устранение серверных ошибок**
  - Обновление разметки формы ввода предложений: удаление чипов направления и кнопки анализа, добавление подсказки по нажатию клавиши `Enter`.
  - Привязка обработчика клавиши `Enter` для отправки текста на анализ в Gemini API.
  - Корректировка резервной генерации переводов `fallbackSentenceTranslations`: формирование качественного английского перевода для `ru-en` без эхо-повторения русского текста.
  - Корректировка обработки запроса аналитики на сервере: исключение маршрута `/api/sentences/analyze` из блокировок записи, установка рабочей модели Gemini.
  - Перевод сохранения предложений на вызовы `newCard` / `newManagedCard` с привязкой к колоде `sentences`.
  - Исключение русскоязычного текста из системного перехватчика `unsupported` (`Adding personal cards`).
  - Прогон тестов и сборка ассетов.
  - Проверено и подтверждено `🟩`.
