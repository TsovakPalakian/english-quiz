# План реализации TASK-54: Реалистичная оценка произношения, сброс при перезаписи, дедупликация карточек и тематическое расширение лексики (фразовые глаголы, идиомы, устойчивые фразы)

> [!WARNING]
> **Блок изоляции области видимости и защиты смежного функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы в рамках виджета произношения ([`client/main/material-upgrades.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js)), оценщика произношения ([`src/learning-stage-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs)), генератора дополнений урока ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)) и тематического генератора ([`src/lesson-pdf-meta.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs)). Если возникнет техническая необходимость затронуть смежные модули, об этом требуется заранее уведомить пользователя в чате текстом: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием причин и запросом подтверждения.

---

## 1. Точная постановка проблемы и ссылки на исходный код

1. **Ложная оценка произношения и отсутствие сброса при перезаписи**:
   - В [`client/main/material-upgrades.js#L517-L525`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L517-L525) и [`src/learning-stage-worker.mjs#L256-L265`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L256-L265) оценка вычислялась псевдослучайно (`Math.floor(Math.random()*8)+90`), без сравнения фактически произнесенного слова с целевым словом упражнения.
   - При нажатии кнопки `🎤 Re-record` в [`client/main/material-upgrades.js#L430-L498`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L430-L498) предыдущий бейдж оценки (`Score: 90% · Passed`) и текст обратной связи не сбрасывались.
2. **Дублирование карточек в одной и той же секции (Classwork / Homework)**:
   - В [`client/52-lessons.js#L2903-L2987`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2903-L2987) при повторной генерации или при количестве упражнений больше пула слов происходило зацикливание по модулю без проверки наличия уже существующих упражнений с таким же целевым словом и типом задания в текущей секции.
3. **Нехватка лексики и отсутствие устойчивых выражений/идиом при запросе 20 заданий**:
   - При наличии в уроке всего 6 слов функция `lmExtractLessonVocabularyPool()` в [`client/52-lessons.js#L2812-L2833`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2812-L2833) циклически брала только эти 6 слов.
   - Требуется динамическое пополнение пула урока до запрошенного количества за счет тематических слов, фразовых глаголов, идиом и устойчивых словосочетаний (collocations), соответствующих текущей теме урока (например, "Superstitions and Prepositions"), с автоматическим внесением новых карточек в раздел `Words`.

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Реалистичная оценка произношения и сброс результата при перезаписи
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-54-screenshot-1-pronunciation-realistic-score-and-reset.png)
*Скриншот 1: Отображение реальной оценки несоответствия (Score: 15% · Needs work) при неверно произнесенном слове и инвариант немедленного сброса результата при клике «Re-record».*

---

### Скриншот 2: Строгая дедупликация карточек в блоках Homework и Classwork
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-54-screenshot-2-deduplication-unique-cards.png)
*Скриншот 2: Исключение дублирования упражнений — каждое сгенерированное задание в секции обладает уникальной целевой единицей и типом.*

---

### Скриншот 3: Тематическое расширение словарного запаса (слова, фразовые глаголы, идиомы, коллокации)
![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-54-screenshot-3-topic-expansion-vocabulary.png)
*Скриншот 3: Пополнение пула генерации до 20 уникальных единиц по теме урока без зацикливания и синхронизация их с вкладкой Words.*

---

### Скриншот 4: Визуальное отделение дополнительного материала во вкладке Words
![Скриншот 4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-54-screenshot-4-words-tab-supplementary-separator.png)
*Скриншот 4: Линия-разделитель и бейдж Supplementary Material, визуально отделяющие сгенерированный дополнительный лексический материал от основного вокабуляра урока во вкладке Words.*

---

## 3. Этапы и контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Реалистичная валидация произношения: интеграция распознавания речи в браузере (`SpeechRecognition` / фонетическое сопоставление) с передачей распознанного текста на эндпоинт `/api/lessons/assess-pronunciation`, расчет метрики сходства и вывод детального расхождения («Heard: X | Target: Y»).
- 🟩 **Этап 2**: Гарантия сброса состояния при перезаписи: очистка бейджа оценки, блока ошибок и аудиоконтейнера сразу при нажатии `🎤 Re-record`.
- 🟩 **Этап 3**: Строгая дедупликация карточек в `client/52-lessons.js`: проверка сигнатуры задания `(section + quizType + targetKey)` против уже существующих блоков в уроке, предотвращающая повторное создание одинаковых карточек.
- 🟩 **Этап 4**: Тематическое расширение лексического пула: генерация и извлечение фразовых глаголов, идиом и устойчивых сочетаний по теме урока при генерации до 30 заданий.
- 🟩 **Этап 5**: Автоматическое добавление всех новых тематических выражений в список `Words` (`wordcard`) с переводом и примером употребления, с обязательным визуальным разделением линией-разделителем (`divider`) и бейджем `Supplementary Material` для отделения от основного вокабуляра урока.
- 🟩 **Этап 6**: Сборка ассетов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`).
- 🟩 **Этап 7**: Разработка и прогон модульных и визуальных тестов (`test-lesson-pronounce-and-autoexpand.mjs`, `test-lesson-complement-generation.mjs`).
- 🟩 **Этап 8**: Итоговая верификация и подготовка единого обобщенного коммита.
