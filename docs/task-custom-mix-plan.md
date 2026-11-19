# План приведения шапки квиза к виду экрана урока, отображения групп Custom mix и расчета времени по упражнениям (Тема Sky)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно:
> 1. Приведения шапки `#dayQuizBoard` к виду шапки урока (Скриншот 3): навигационный блок хлебных крошек `.crumb` с кнопками Home (`⌂`) и Back (`←`) через системный механизм `data-nav-back`, заголовок урока в одну строку без верхнего кикера пользователя и без кнопки "Back to editor".
> 2. Отображения всех 18 типов упражнений в 5 группах блока `#dayQuizCustom` в режиме Custom mix (`.dq-group { display: block; }`), двухколоночная сетка типов (`.dq-types { grid-template-columns: repeat(2, minmax(0, 1fr)); }`), замена иконки режима на `🎛️` и удаление лишней кнопки `Select all` из группы Review.
> 3. Выбора по умолчанию в режиме Custom mix только карточки `Flip` (`1 of 7 selected`), с активной кнопкой Start.
> 4. Расчета фактического количества упражнений через `studyExerciseCount(selectedCards, types)` и времени квиза от количества упражнений (`exercises * 30` секунд, ~30 сек/упражнение), отображения числа упражнений в строке `READY TO START` (`Write it · 4 types · 48 exercises`) и времени на кнопке Start (`Start · 12 cards · ~24 min`).
> Запрещено затрагивать, модифицировать или нарушать смежный функционал:
> - Режимы Quick review, Write it, Listen, Play, Spaced repetition в `dayQuizMode`.
> - Логику фильтрации карточек All, Range, Random, Mistakes в `limitStudyCards`.
> - Классический интерфейс настроек квиза `#dayStudyClassic` и экран урока `#material`.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Шапка экрана квиза (`#dayQuizBoard`)**:
   - В текущей разметке шапка содержит двухстрочную структуру с кикером `#dayQuizWho` («Tsovak Palakian») и простой кнопкой возврата `←`.
   - Требуется привести к виду шапки урока (Скриншот 3): хлебные крошки с иконками `[⌂]` (Home) и `[←]` (Back), заголовок урока в одну строку по центру относительно кнопок, аватар пользователя справа, без кнопки «Back to editor» и без кикера.

2. **Отображение групп и типов Custom mix**:
   - Блок `#dayQuizCustom` содержит 18 типов ответов в 5 группах (Recognize, Write, Listen & meaning, Games, Review). При переключении в режим Custom mix родительский контейнер становится видимым, но `<section class="dq-group">` скрывались глобальным CSS-правилом [`section { display: none; }`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L1335). Требуется явное свойство `display: block;` для класса `.dq-group`.
   - Сетка кнопок типов ответов `.dq-types` должна отображаться в 2 колонки (`repeat(2, minmax(0, 1fr))`), соответствуя утвержденным макетам.
   - Иконка режима в карточке Custom mix должна быть `🎛️`.
   - В группе Review лишняя кнопка `Select all` должна быть удалена.

3. **Выбор по умолчанию в Custom mix**:
   - По умолчанию в группе Recognize должен быть выбран только `Flip` (`1 of 7 selected`), все остальные типы выключены. Кнопка Start при этом сразу активна (`Start · 12 cards · ~6 min`).

4. **Количество упражнений и расчет времени сессии**:
   - При выборе нескольких типов карточек (например, 12 карточек в режиме Write it с 4 типами упражнений) формируется 48 упражнений. Ранее время и подпись считались только от количества карточек (12 * 30с = 6 мин), что не отражало фактическую длину сессии (48 * 30с = 24 мин).
   - Требуется выводить количество упражнений в плашке Ready (`Write it · 4 types · 48 exercises`) и рассчитывать время сессии исходя из `exercises * 30` секунд (`~24 min`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1123-L1250): приведение `.dq-head` к `data-nav-back` и единой строке заголовка; замена иконки режима на `🎛️`; установка `class="on"` для Flip по умолчанию; удаление кнопки `Select all` в секции `Review`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L10059-L10140): стилизация `.dq-head` и `display: block;` для `.dq-group`, двухколоночная сетка `.dq-types`.
  - [`client/03g-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L1018, #L1072-L1085, #L1666): выбор только Flip в `resetDayQuizBoardPicks()`, расчет `exercises` и `mins` от очереди упражнений в `paintDayQuizBoard()`, установка `sessionMs = queue.length * 30 * 1000` в `beginQuiz()`.
  - [`test/test-day-quiz-board.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-day-quiz-board.mjs): модульные тесты для шапки, сетки, иконки, дефолтного Flip и расчета времени упражнений.
  - [`test/test-day-quiz-board-visual.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-day-quiz-board-visual.mjs): визуальные тесты тем Sky, Dark, Sand.

- **Инварианты**:
  - Использование исключительно переменных CSS (`--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--acc-s`, `--on-acc`, `--bad`).
  - Сохранение полной работоспособности всех режимов квиза и системы навигации.
  - Кнопка Start блокируется только если выбрано 0 типов или 0 карточек.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование живых кадров страницы в теме Sky с шапкой (Home + Back + Title), блоком кастомного выбора с Flip и расчетом упражнений (одобрено пользователем `одо` и `да`).
- 🟩 **Этап 2**: Приведение разметки в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) и стилей в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- 🟩 **Этап 3**: Корректировка логики в [`client/03g-core.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js).
- 🟩 **Этап 4**: Актуализация модульных и добавление визуальных тестов в `test/`.
- 🟩 **Этап 5**: Пересборка клиентских ассетов (`npm run build:preview` и `node ops/build-learning-production-assets.mjs`).
- 🟩 **Этап 6**: Прогон целевых тестов.
- 🟩 **Этап 7**: Предоставление финального отчета с обобщенным коммитом.

---

## 4. Кадры и согласование (Mockups & Screenshots)

### Скриншот 1: Шапка квиза в одну строку с кнопками Home и Back
![Скриншот 1: Шапка квиза в одну строку](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-header-match-screenshot-closeup-sky.png)

### Скриншот 2: Custom mix с выбранным по умолчанию только Flip в 2 колонки
![Скриншот 2: Custom mix с Flip по умолчанию](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-custom-mix-default-flip-1-sky.png)

### Скриншот 3: Плашка Ready to start с количеством упражнений (Вариант A) и Start с временем
![Скриншот 3: Плашка Ready to start с числом упражнений](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-exercise-count-screenshot-1-sky-opt-a.png)

### Скриншот 4: Проверка темы Dark
![Скриншот 4: Проверка темы Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-exercise-count-screenshot-3-dark.png)

### Скриншот 5: Проверка темы Sand
![Скриншот 5: Проверка темы Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-exercise-count-screenshot-4-sand.png)
