# План удаления кнопки Check с мгновенной проверкой и отделения названия упражнения с выделением целевого слова

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно:
> 1. Удаления кнопки `Check (Enter)` (`#focusCheckBtn`) из карточки интерактивного режима Focus Mode (`#lmFocusPlayerOverlay`).
> 2. Мгновенного запуска проверки ответа (`focusCheckAnswer()`) сразу при выборе варианта ответа (по клику или по горячим клавишам 1-4) с показом плашки результата (`.focus-feedback`) и подсветкой правильного/неправильного варианта, а также немедленного отображения кнопки перехода к следующему вопросу (`#focusNextBtn`).
> 3. Обновления строки горячих клавиш: `⌨️ 1-4: Select | Enter: Next | Esc: Exit`.
> 4. Корректного разделения названия упражнения и текста вопроса:
>    - Название упражнения («Check Adjective Preposition Pairs») отделяется визуально и структурно от формулировки вопроса («Which preposition correctly follows 'interested'?»).
>    - Если в формулировке или блоке заголовок объединен с вопросом через перевод строки или в данных блока, они разделяются на отдельный заголовок упражнения `.focus-exercise-title` и текст вопроса `.focus-prompt`.
>    - Целевое слово или фраза в кавычках (например, `'interested'`) выделяется полужирным шрифтом (`<strong>'interested'</strong>`).
> Запрещено затрагивать, модифицировать или нарушать смежный функционал:
> - Адаптивную генерацию дополнительных карточек при ошибках (`focusApplyAdaptiveRemediation`).
> - Расчет критериев завершения сессии и порог 90% (`focusNextQuestion`).
> - Голосовой режим (`lmVoiceModeBar`, `openVoiceMode`).
> - Основной редактор уроков и импорт материалов, кроме корректной передачи раздельного заголовка при генерации/импорте упражнений.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Лишнее подтверждение кнопкой Check**:
   - В текущей реализации [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L144-L149) при клике по варианту карточка переходит в промежуточное состояние выбора (`focusSelectedOption = optIdx`), активируя кнопку `Check (Enter)`.
   - Пользователю требуется совершать дополнительное действие (нажимать Check или Enter), чтобы увидеть, верен ли ответ.
   - Требуется убрать кнопку `Check (Enter)` и сразу при клике на вариант (или нажатии 1-4) фиксировать ответ, подсвечивать результат и выводить блок обратной связи, предоставляя кнопку `Next question →` (или `Finish Session` на последнем вопросе).

2. **Слитное отображение заголовка упражнения и вопроса**:
   - В текущей разметке [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L131-L132) выводится верхний кикер `currentQ.title` (например, «EXERCISE») и единый `h2.focus-prompt`, куда попадает объединенная строка:
     `Check Adjective Preposition Pairs Which preposition correctly follows 'interested'?`
   - Из-за отсутствия явного разделения заголовок упражнения сливается с вопросом в одну нечитаемую строку.
   - Требуется структурировать отображение:
     - Название упражнения: отдельным блоком (`Check Adjective Preposition Pairs`).
     - Вопрос: отдельным абзацем/заголовком с отступом (`Which preposition correctly follows 'interested'?`).
     - Целевое слово в кавычках (например, `'interested'`) должно быть выделено полужирным начертанием (`<strong>'interested'</strong>`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js):
    - В `focusSelectOption(optIdx)`: мгновенная фиксация выбранного варианта и немедленный вызов `focusCheckAnswer()`.
    - В `renderFocusPlayer()`: удаление кнопки `focusCheckBtn`, разделение заголовка и вопроса с парсингом кавычек для полужирного выделения, обновление подсказки горячих клавиш.
    - В обработчике клавиатуры: нажатие Enter при отображенном результате вызывает `focusNextQuestion()`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css):
    - Стили для `.focus-exercise-title` и форматированного текста вопроса с полужирным акцентом.
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js):
    - Обеспечение сохранения `title` у блока упражнения при импорте.
  - Тесты:
    - [`test/test-focus-mode-theme.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-focus-mode-theme.mjs): актуализация тестов под мгновенную проверку и проверку тем оформления.
  - Сборка производственных ассетов командой `npm run build:preview` (`ops/build-learning-production-assets.mjs`).

- **Инварианты**:
  - Все цвета и оформление берутся строго из CSS-переменных активной темы (`--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--acc-s`, `--on-acc`, `--ok`, `--bad`). Никаких жестко закодированных HEX-цветов в новом CSS.
  - Порог адаптивного обучения, FSRS/мастеринг и учет ошибок сохраняются в полной мере.
  - Клавиатурная навигация 1-4, Enter, Esc, стрелки влево/вправо сохраняет функциональность без сбоев.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование утвержденных макетов карточки упражнения в Focus Mode (без кнопки Check, с отделенным заголовком и выделенным словом) в темах Sky, Dark и Sand.
- 🟩 **Этап 2**: Реализация мгновенной проверки при выборе варианта (`focusSelectOption` -> `focusCheckAnswer`) и удаление кнопки `#focusCheckBtn` в [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js).
- 🟩 **Этап 3**: Реализация разделения названия упражнения и вопроса с полужирным выделением слов в кавычках (`<strong>'interested'</strong>`) в [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- 🟩 **Этап 4**: Обновление импорта в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js).
- 🟩 **Этап 5**: Актуализация тестов в [`test/test-focus-mode-theme.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-focus-mode-theme.mjs).
- 🟩 **Этап 6**: Сборка производственных ассетов `npm run build:preview`.
- 🟩 **Этап 7**: Прогон целевых тестов.
- 🟩 **Этап 8**: Предоставление единого обобщенного коммита по завершении.

---

## 4. Кадры и согласование (Mockups & Screenshots)

### Скриншот 1: Исходное состояние карточки (до ответа, без кнопки Check) в теме Sky (`data-theme="sky"`)
![Скриншот 1: Исходное состояние карточки в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-focus-screenshot-1-sky-initial.png)

### Скриншот 2: Состояние с мгновенным отображением результата и кнопкой Next в теме Sky (`data-theme="sky"`)
![Скриншот 2: Мгновенный результат в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-focus-screenshot-2-sky-answered.png)

### Скриншот 3: Состояние с мгновенным результатом в теме Dark (`data-theme="dark"`)
![Скриншот 3: Мгновенный результат в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-focus-screenshot-3-dark-answered.png)

### Скриншот 4: Состояние с мгновенным результатом в светлой теме Sand (`data-theme="sand"`)
![Скриншот 4: Мгновенный результат в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-focus-screenshot-4-sand-answered.png)
