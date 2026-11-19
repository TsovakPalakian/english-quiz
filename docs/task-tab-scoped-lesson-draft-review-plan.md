# План размещения формы Review lesson draft внутри каждой вкладки импорта

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается закрепления формы ревью черновика урока (`Review lesson draft`) непосредственно внутри контейнера активной вкладки импорта (`File / PDF`, `Web URL`, `Manual Script`, `Complement Current Lesson`), очистки полей ввода при старте генерации и отображения индивидуального кругового индикатора прогресса на каждой вкладке.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Извлечение и парсинг структуры уроков (`lmPdfDraftBlocks`, `lmParseScriptToLessonData`).
> - Работу кнопок применения черновика и сохранение блоков в базу данных D1/R2.
> - Авторизацию преподавателя, режимы экзаменов и квизы.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Размещение формы черновика внутри активной вкладки**:
   - При запуске генерации из вкладки `Manual Script` форма черновика урока `Review lesson draft` монтируется и отображается непосредственно внутри этой же вкладки (`#lmTabPaneScript`), сохраняя активную вкладку `Manual Script`.
   - При запуске импорта из других вкладок (`File / PDF`, `Web URL`, `Complement Current Lesson`) форма монтируется в соответствующий контейнер вкладки.
   - Панель навигации по 4 вкладкам (`.lm-tabs-bar`) остается видимой и доступной.

2. **Очистка формы ввода и круговой прогресс**:
   - При нажатии на кнопку запуска генерации текстовое поле ввода `#lmScriptInput` (или `#lmUrlInput`, файл в `File / PDF`) вычищается.
   - На активной вкладке отображается собственный круговой индикатор прогресса (`.lm-pdf-ring`).

3. **Полная корреляция с темами оформления**:
   - Форма черновика использует системные переменные активной темы: `--card`, `--ink`, `--mute`, `--line`, `--bg`, `--acc`, `--acc-s`, `--on-acc`.
   - В теме `Dark` обеспечивается стопроцентная контрастность и читаемость светлого текста `--ink` на темном фоне `--card`.
   - Нижняя плашка `Voice Mode in Antigravity` (`#lmVoiceModeBar`) удаляется.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): точка монтирования формы ревью внутри активного таб-контейнера (`activePane.append(dialog)`), вызов `lmClearImportFields()` при старте, привязка индивидуального кольцевого прогресса к табу.
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): удаление `#lmVoiceModeBar`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): привязка стилей `.lm-pdf-draft` и табов к системным переменным `--card`, `--ink`, `--mute`, `--line`, `--bg`, `--acc`, `--on-acc`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Переключение вкладок сохраняет состояние черновика на той вкладке, где он был сгенерирован.
  - Нажатие `Cancel` удаляет форму черновика и возвращает исходное поле ввода.
  - Нажатие `Apply to draft` переносит сформированные блоки в структуру урока.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование кадра формы Review lesson draft внутри вкладки Manual Script в темах Sky, Dark и Light.
- 🟩 **Этап 2**: Удаление блока `#lmVoiceModeBar` из [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- 🟩 **Этап 3**: Корректировка логики монтирования формы черновика внутри контейнера активной вкладки (`#lmTabPaneScript`, `#lmTabPaneFile`, `#lmTabPaneUrl`, `#lmTabPaneLesson`) и вычищения полей ввода в [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js).
- 🟩 **Этап 4**: Обновление селекторов `.lm-pdf-draft` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для полной корреляции с переменными темы.
- 🟩 **Этап 5**: Пересборка клиентских ассетов (`npm run build:preview`) и производственной сборки (`node ops/build-learning-production-assets.mjs`).
- 🟩 **Этап 6**: Прогон целевых тестов `test/test-client-pdf-import.mjs`, `test/test-agreed-lesson-flow.mjs`, `test/test-task-22-pdf-draft-flow-ui.mjs`.
- 🟩 **Этап 7**: Финализация и подготовка единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Форма Review lesson draft внутри активной вкладки Manual Script в теме Sky (вкладка активна, поле ввода вычищено, форма размещена внутри вкладки, плашка Voice Mode удалена):**
![Скриншот 1: Форма внутри вкладки Manual Script в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-manual-tab-draft-screenshot-1-sky.png)

### Скриншот 2
**Форма Review lesson draft внутри активной вкладки Manual Script в теме Dark (полная контрастность, белый текст --ink на темном фоне карточки --card, высокая читаемость):**
![Скриншот 2: Форма внутри вкладки Manual Script в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-manual-tab-draft-screenshot-2-dark.png)

### Скриншот 3
**Форма Review lesson draft внутри активной вкладки Manual Script в теме Light:**
![Скриншот 3: Форма внутри вкладки Manual Script в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-manual-tab-draft-screenshot-3-light.png)
