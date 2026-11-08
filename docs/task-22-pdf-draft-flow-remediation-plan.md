# План устранения дефектов сохранения распарсенного контента уроков ([TASK-22](https://lumiscia.atlassian.net/browse/TASK-22))

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к задаче [TASK-22](https://lumiscia.atlassian.net/browse/TASK-22). Запрещено задевать структуру базы данных, логику авторизации пользователей, расчет посещаемости, другие разделы админки и личного кабинета, не относящиеся к задаче диалоги и экранные формы. Все правки строго и изолированно ограничены:
> 1. Отображением и поведением блока предпросмотра черновика урока `lmMountLessonDraftDialog` в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js);
> 2. Стилизацией плавающей панели действий и кнопок применения в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
> 3. Сборкой файла [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через `npm run build:preview`;
> 4. Добавлением целевых тестов интерфейса в [`test/test-task-22-pdf-draft-flow-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs) и верификацией существующего набора тестов [`test/test-lesson-pdf-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-pdf-ui.mjs).

---

## 1. Точная формулировка проблем (Problem Statement)

1. **Неочевидное и статичное расположение кнопки применения (`Apply selected sections to draft`)**:
   - Код: [`client/52b-lesson-pdf-import.js:1244-1246`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1244-L1246), [`client/52b-lesson-pdf-import.js:1446-1450`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1446-L1450), [`site/preview.css:4411-4438`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4411-L4438).
   - Причина: после разбора PDF или генерации из сценария блок `#lmPdfDraftDialog` встраивается перед зоной загрузки в блоке базовой информации. Кнопки `Cancel` и `Apply selected sections to draft` расположены в самом низу списка из 7 секций аккордеона. При скролле страницы или раскрытии секций кнопка уходит из зоны видимости, а ниже пользователь видит еще не заполненную форму урока (`Title`, `Description` и пустой редактор блоков). Это создает ложное ощущение, что парсер не сработал или требует повторного ручного ввода с нуля.
   - Ожидание: 
     - Добавить плавающую панель действий (`Floating Sticky Action Bar`), зафиксированную внизу экрана при скролле страницы на протяжении всего времени, пока открыт предпросмотр распарсенных данных;
     - Добавить дублирующую быструю кнопку применения в шапку блока `Review lesson draft`, позволяющую применить контент в один клик без необходимости пролистывать все секции;
     - Отображать на кнопке и в плавающей панели актуальное количество выбранных секций и элементов (например, `✓ Apply selected sections to draft (61)`);
     - Временно сворачивать / скрывать дублирующие поля ручного ввода и дропзоны (`#lmScriptInput`, `[data-lesson-pdf-import]`), пока пользователь не завершит шаг подтверждения или отмены предпросмотра;
     - Добавить поясняющий информационный баннер, наглядно разъясняющий, что итоговая форма урока заполнится сразу после нажатия кнопки применения.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): монтирование плавающей панели действий `lmPdfDraftFloatingBar`, быстрой кнопки в шапке диалога, динамический подсчет выбранных элементов при переключении чекбоксов, сворачивание второстепенных элементов ввода на время ревью, очистка при закрытии/применении.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стили плавающей панели действий `.lm-pdf-floating-bar`, бейджей, индикаторов и адаптивной фиксации `position: fixed; bottom: 0;`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): производный файл сборки (`npm run build:preview`).
  - [`test/test-task-22-pdf-draft-flow-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-22-pdf-draft-flow-ui.mjs): модульные и визуальные тесты нового UX флоу.

- **Инварианты**:
  - Сохранение полной функциональности и контрактных селекторов существующей кнопки `dialog.getByRole('button', { name: 'Apply selected sections to draft' })` для обратной совместимости с тестами и API;
  - Сохранение логики выбора и снятия секций, генерации словарных карточек, загрузки PDF и валидации бюджета блоков;
  - Отсутствие влияния на просмотр и редактирование обычных уроков без загрузки PDF/скрипта.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Создание разметки и логики плавающей панели действий (`Floating Action Bar`) и быстрой кнопки в шапке `lmMountLessonDraftDialog` в `client/52b-lesson-pdf-import.js`.
- 🟩 **Этап 2**: Стилизация плавающей панели, счетчиков и баннера-подсказки в `site/preview.css`.
- 🟩 **Этап 3**: Автоматическое обновление счетчиков выбранных секций и элементов при кликах по чекбоксам и скрытие/сворачивание зоны ручного ввода на время ревью в `client/52b-lesson-pdf-import.js`.
- 🟩 **Этап 4**: Сборка ассетов проекта через `npm run build:preview`.
- 🟩 **Этап 5**: Разработка целевых тестов `test/test-task-22-pdf-draft-flow-ui.mjs` и верификация регрессионного набора `test/test-lesson-pdf-ui.mjs`.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск целевых и регрессионных тестов:
   `node --test test/test-task-22-pdf-draft-flow-ui.mjs test/test-lesson-pdf-ui.mjs`.
3. Визуальная верификация верстки в браузере Playwright.
