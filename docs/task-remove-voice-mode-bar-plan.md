# План удаления плашки Voice Mode из блока Generate & Import Lessons

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается удаления уведомляющей плашки `#lmVoiceModeBar` (`.lm-voice-mode-bar`) из нижней части Frame 1 (`Generate & Import Lessons` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)).
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Доступ к голосовому режиму через штатную кнопку `#lmVoiceModeBtn` в панели режимов урока (`.lm-modes-bar`).
> - Работу модального диалога голосового режима (`#lmVoiceModeModal`).
> - Вкладки генерации и импорта (`File / PDF`, `Web URL`, `Manual Script`, `Complement Current Lesson`).
> - Метаданные урока и Frame 2 (`Basic information`).
> - Авторизацию преподавателей и серверный маршрут `/api/lessons/voice-reply`.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Удаление дублирующей плашки `#lmVoiceModeBar`**:
   - В нижней части Frame 1 (`Generate & Import Lessons`) под зоной импорта отображалась плашка с иконкой микрофона, заголовком `Voice Mode in Antigravity (AI Tutor & Speaking Examiner)`, кнопкой `Open AI Tutor` и дисклеймером нейросети ([Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-voice-bar-current.png)).
   - Этот элемент дублирует штатную кнопку голосового режима `Voice Mode` ([`#lmVoiceModeBtn`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1423)), расположенную в панели режимов редактора урока (`.lm-modes-bar`), создавая визуальный шум в блоке импорта.
   - Пользователь запросил полностью убрать эту плашку из блока Frame 1.

2. **Объем изменений**:
   - В [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): удалить элемент `<div class="lm-voice-mode-bar" id="lmVoiceModeBar" ...>...</div>`.
   - В [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js): очистить обработчики клика и нажатия Enter по `#lmVoiceModeBar`, сохранив штатный триггер по `#lmVoiceModeBtn`.
   - В тестах ([`test/test-lesson-import-dual-frames.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs) и [`test/test-voice-mode-tutor-examiner.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs)): удалить проверку присутствия плашки `#lmVoiceModeBar` в Frame 1 и перевести запуск модального окна в UI-тестах на штатную кнопку `#lmVoiceModeBtn`.
   - Пересобрать ассеты через `npm run build:preview`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)
  - [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js)
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) (пересборка)
  - [`test/test-lesson-import-dual-frames.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs)
  - [`test/test-voice-mode-tutor-examiner.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs)

- **Инварианты**:
  - Блок Frame 1 (`Generate & Import Lessons`) заканчивается зоной выбранного метода импорта без лишних нижних баннеров.
  - Голосовой режим Voice Mode остается доступен через кнопку `#lmVoiceModeBtn` в панели режимов урока.
  - Модальный диалог голосового помощника (`#lmVoiceModeModal`) функционирует в полном объеме.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Согласование плана и визуальных кадров блока Generate & Import Lessons без плашки Voice Mode.
- 🟩 **Этап 2**: Удаление разметки `#lmVoiceModeBar` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- 🟩 **Этап 3**: Очистка обработчиков события для `#lmVoiceModeBar` в [`client/52c-focus-player.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js) и пересборка `npm run build:preview`.
- 🟩 **Этап 4**: Актуализация тестов [`test/test-lesson-import-dual-frames.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs) и [`test/test-voice-mode-tutor-examiner.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs).
- 🟩 **Этап 5**: Финальная валидация и подготовка единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Исходный элемент: плашка Voice Mode, подлежащая удалению:**
![Скриншот 1: Плашка Voice Mode](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-voice-bar-current.png)

### Скриншот 2
**Блок Generate & Import Lessons в теме Sky без плашки Voice Mode:**
![Скриншот 2: Блок Generate & Import Lessons в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-voice-bar-screenshot-1-sky.png)

### Скриншот 3
**Блок Generate & Import Lessons в тёмной теме Dark без плашки Voice Mode:**
![Скриншот 3: Блок Generate & Import Lessons в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-voice-bar-screenshot-2-dark.png)

### Скриншот 4
**Блок Generate & Import Lessons в светлой теме Light без плашки Voice Mode:**
![Скриншот 4: Блок Generate & Import Lessons в светлой теме Light](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-remove-voice-bar-screenshot-3-light.png)
