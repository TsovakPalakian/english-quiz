# План скрытия Voice Mode и Speech для учеников (Hide Voice Mode & Speech for Students Plan)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или нарушать функционал, не относящийся к текущей задаче. Режим Voice Mode для преподавателей и разработчиков, речевой тренажер Speech в воркбенче, Focus Mode, Evaluation Mode, Day quiz, плеер караоке и FSRS карточки остаются полностью нетронутыми. Изменения строго изолированы:
> 1. Скрытием кнопки «Voice Mode» в панели режимов урока (`.lm-modes-bar`) для роли ученика (`role === 'USER' && !viewAccount`).
> 2. Скрытием вкладки «Speech» в панели инструментов урока (`.lm-daytools`) для роли ученика (`role === 'USER' && !viewAccount`).

---

## 1. Точная формулировка задач (Problem Statement)

1. **Скрытие вкладки «Speech» в панели урока**:
   - В панели инструментов урока (`.lm-daytools`) рядом с кнопками «Classwork», «Homework» и «Lesson PDF» отображается кнопка «Speech» (`data-workbench-lesson-speech`).
   - Для роли ученика (`role === 'USER' && !viewAccount`) кнопка «Speech» скрывается. Для преподавателей и разработчиков доступ сохраняется.

2. **Скрытие кнопки «Voice Mode» в панели интерактивных режимов**:
   - В панели режимов практики урока (`.lm-modes-bar`) рядом с кнопками «Day quiz», «Focus Mode» и «Evaluation Mode» отображается кнопка «Voice Mode» (`#lmVoiceModeBtn`).
   - Для роли ученика (`role === 'USER' && !viewAccount`) кнопка «Voice Mode» скрывается. Для преподавателей и разработчиков кнопка остается доступной.

---

## 2. Утвержденные скриншоты панели урока для ученика

### Скриншот 1: Панель инструментов и режимов урока для ученика в теме Sky
![Скриншот 1: Панель инструментов и режимов урока для ученика в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-student-lesson-toolbar-sky.png)

### Скриншот 2: Панель инструментов и режимов урока для ученика в теме Dark
![Скриншот 2: Панель инструментов и режимов урока для ученика в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-student-lesson-toolbar-dark.png)

### Скриншот 3: Панель инструментов и режимов урока для ученика в теме Sand
![Скриншот 3: Панель инструментов и режимов урока для ученика в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-student-lesson-toolbar-sand.png)

---

## 3. Контрольный список реализации (Implementation Checklist)

- `🟩` Скрыть вкладку «Speech» в `lessonSpeechButton()` для роли ученика.
- `🟩` Скрыть кнопку «Voice Mode» (`#lmVoiceModeBtn`) в `lmChromeHtml()` для роли ученика.
- `🟩` Актуализировать тесты отображения панели урока с проверкой скрытия данных элементов для роли `USER`.
- `🟩` Выполнить сборку производственных ресурсов (`npm run build:preview && node ops/build-learning-production-assets.mjs`).
- `🟩` Верифицировать отсутствие регрессий во всех целевых тестовых наборах.
