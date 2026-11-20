# План оптимизации шапки квиза, нижней плашки Start и циклического выбора Custom mix

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно:
> 1. Удаления кнопки колокольчика из верхней панели навигации шапки (`userProfilePillHost`) с сохранением доступа к уведомлениям через меню профиля пользователя («Lesson notifications»).
> 2. Ограничения длины поля ввода названия урока (`maxlength="40"` в поле ввода названия) и установки безопасных границ заголовка в шапке (`padding-right: 56px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`), исключающих наложение текста на аватар пользователя.
> 3. Исключения нежелательного переноса текста в нижней плашке готовности квиза: фиксация содержимого кнопки Start в одну строку (`white-space: nowrap`, `flex-shrink: 0`) и аккуратное однострочное отображение статуса готовности слева.
> 4. Реализации двухпозиционного переключения кнопки «Select all» в группах Custom mix: при четном клике (или если все типы группы уже активны) снимать всё выделение с изменением названия на «Select all»; при нечетном клике — выделять все типы группы с изменением названия на «Deselect all».
> Запрещено затрагивать, модифицировать или нарушать смежный функционал:
> - Алгоритм расчета интервалов FSRS и сохранение прогресса Anki cards.
> - Внутреннюю логику и тайминги центра уведомлений.
> - Режимы Quick review, Write it, Listen, Play в блоке выбора режимов.
> - Фильтрацию карточек All, Range, Random, Mistakes.
> - Классический интерфейс настроек квиза `#dayStudyClassic` и экран урока `#material`.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Колокольчик в шапке навигации (Скриншот 2)**:
   - В [client/20a-user-profile-pill.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js#L230-L238) в контейнер `userProfilePillHost` выводится кнопка `#shellHeaderNotifyBell`.
   - В интерфейсе настройки квиза колокольчик перегружает верхнюю панель и визуально конфликтует с заголовком урока. Доступ к уведомлениям уже продублирован в выпадающем меню профиля пользователя. Требуется убрать кнопку колокольчика из шапки.

2. **Наложение длинного названия урока на аватар (Скриншот 2)**:
   - В [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L901) поле ввода названия урока имеет `maxlength="80"`, а в [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L10451) для `#dayQuizTitle` задано свойство `white-space: nowrap;` без ограничения ширины и отступа справа.
   - При длинном названии (например, 42 символа «Get to Know Each Other and Learning English») текст проходит под аватаром и выходит за границы экрана.
   - Требуется ограничить длину поля ввода названия урока (`maxlength="40"`) и зафиксировать в CSS безопасный правый отступ (`padding-right: 56px`), добавив скрытие излишка с многоточием (`overflow: hidden; text-overflow: ellipsis;`).

3. **Некрасивый перенос текста в нижней плашке и кнопке Start (Скриншот 3)**:
   - В [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L10552) кнопка `.dq-start` не имеет правила `white-space: nowrap;`, из-за чего окончание строки «min» переносится на вторую строку («Start · 19 cards · ~19 \n min»).
   - В левой части плашки строка `#dayQuizReady` переносит слово «exercises» на вторую строку.
   - Требуется задать кнопке `.dq-start` правила `white-space: nowrap; flex-shrink: 0;` для строго однострочного вида, а строке готовности слева обеспечить аккуратное отображение без разрыва слов.

4. **Двухпозиционный переключатель Select all в Custom mix (Скриншот 4)**:
   - В [client/03g-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03g-core.js#L2299-L2305) обработчик `[data-dq-all]` выполняет только добавление класса: `b.classList.add("on")`, а текст кнопки всегда остается «Select all».
   - Требуется реализовать поведение переключателя: если все типы в группе уже выбраны (четный клик), снимать выделение (`b.classList.remove("on")`), возвращая название «Select all»; если выбрана только часть или ничего — выделять все кнопки группы и менять название на «Deselect all».

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - `client/20a-user-profile-pill.js`: удаление генерации `bellHtml` в `userProfilePillHost`.
  - `site/preview.html`: установка `maxlength="40"` для поля ввода названия урока `#lmTitle`.
  - `site/preview.css`: стили `.dq-head` (`padding-right: 56px`), `#dayQuizTitle` (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;`), `.dq-start` (`white-space: nowrap; flex-shrink: 0;`).
  - `client/03g-core.js`: логика двухпозиционного переключения `[data-dq-all]` и динамическое обновление названия кнопки («Select all» / «Deselect all») в `paintDayQuizBoard()`.
  - Тесты в `test/`: верификация отсутствия колокольчика в шапке, усечения длинного заголовка, однострочной кнопки Start и переключения Select all.

- **Инварианты**:
  - Использование исключительно переменных CSS (`--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--acc-s`, `--on-acc`).
  - Сохранение полной работоспособности центра уведомлений через меню профиля.
  - Сохранение возможности выбора типов упражнений вручную по отдельности.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование Шаблона 1 (шапка экрана без колокольчика и с безопасным заголовком без наложения на аватар; одобрено пользователем).
- 🟩 **Этап 2**: Согласование Шаблона 2 (нижняя плашка квиза со строками `Quick review · 2 types · 19 cards` / `38 exercises · 19 min` и кнопкой Start; одобрено пользователем).
- 🟩 **Этап 3**: Согласование Функции 1 (двухпозиционный клик по Select all / Deselect all с обновлением текста кнопки; одобрено пользователем).
- 🟩 **Этап 4**: Применение изменений в клиентском коде и стилях.
- 🟩 **Этап 5**: Пересборка клиентских ассетов (`npm run build:preview` и сборщик продакшена).
- 🟩 **Этап 6**: Прогон целевых модульных и визуальных тестов.
- 🟩 **Этап 7**: Предоставление итогового отчета с обобщенным коммитом.

---

## 4. Кадры и согласование (Mockups & Screenshots)

### Скриншот 1: Шапка экрана квиза без колокольчика и с безопасным заголовком в теме Sky
![Скриншот 1: Шапка квиза без колокольчика в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-header-nobell-sky.png)
*Скриншот 1: Верхняя панель навигации в теме оформления Sky (`data-theme="sky"`): кнопка колокольчика удалена, заголовок урока аккуратно оканчивается многоточием перед аватаром без перекрытия.*

### Скриншот 2: Шапка экрана в темной теме оформления Dark
![Скриншот 2: Шапка квиза в темной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-header-nobell-dark.png)
*Скриншот 2: Проверка контрастности и отображения шапки экрана в темной теме оформления Dark (`data-theme="dark"`).*

### Скриншот 3: Шапка экрана в светлой теме оформления Sand
![Скриншот 3: Шапка квиза в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-header-nobell-sand.png)
*Скриншот 3: Проверка отображения шапки экрана в светлой теме оформления Sand (`data-theme="sand"`).*

### Скриншот 4: Нижняя плашка квиза с точным форматом двух строк и кнопкой Start в теме Sky
![Скриншот 4: Плашка квиза с точным форматом двух строк в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-foot-start-twolines-sky.png)
*Скриншот 4: Нижняя панель готовности в теме Sky (`data-theme="sky"`): на кнопке справа отображается только «Start», слева информация выведена в две строки без точки перед 38: первая строка `Quick review · 2 types · 19 cards`, вторая строка `38 exercises · 19 min`.*

### Скриншот 5: Нижняя плашка квиза в темной теме оформления Dark
![Скриншот 5: Плашка квиза в темной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-foot-start-twolines-dark.png)
*Скриншот 5: Проверка оформления плашки готовности с кнопкой Start и строками `Quick review · 2 types · 19 cards` / `38 exercises · 19 min` в темной теме оформления Dark (`data-theme="dark"`).*

### Скриншот 6: Нижняя плашка квиза в светлой теме оформления Sand
![Скриншот 6: Плашка квиза в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-foot-start-twolines-sand.png)
*Скриншот 6: Проверка оформления плашки готовности с кнопкой Start и строками `Quick review · 2 types · 19 cards` / `38 exercises · 19 min` в светлой теме оформления Sand (`data-theme="sand"`).*

### Скриншот 7: Группа Recognize с активными всеми 7 типами и кнопкой Deselect all в теме Sky
![Скриншот 7: Группа Recognize с кнопкой Deselect all в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-custom-deselect-all-sky.png)
*Скриншот 7: При выборе всех 7 типов упражнений в группе Recognize кнопка переключается на «Deselect all», а счетчик отображает «7 of 7 selected».*

### Скриншот 8: Группа Recognize после четного клика по Deselect all в теме Sky
![Скриншот 8: Группа Recognize после четного клика в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-custom-select-all-cleared-sky.png)
*Скриншот 8: После четного клика все типы группы выключаются, счетчик показывает «0 of 7 selected», а кнопка возвращается в состояние «Select all».*

### Скриншот 9: Группа Recognize с кнопкой Deselect all в темной теме оформления Dark
![Скриншот 9: Группа Recognize с кнопкой Deselect all в темной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-custom-deselect-all-dark.png)
*Скриншот 9: Проверка оформления группы Custom mix и кнопки «Deselect all» в темной теме оформления Dark (`data-theme="dark"`).*

### Скриншот 10: Группа Recognize с кнопкой Deselect all в светлой теме оформления Sand
![Скриншот 10: Группа Recognize с кнопкой Deselect all в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-custom-deselect-all-sand.png)
*Скриншот 10: Проверка оформления группы Custom mix и кнопки «Deselect all» в светлой теме оформления Sand (`data-theme="sand"`).*
