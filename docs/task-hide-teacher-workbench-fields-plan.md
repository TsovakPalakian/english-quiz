# План скрытия полей Review queue, My quizzes, Speakout, Voice Mode и Speech для роли учителя

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Навигация и режимы для учеников (`role === 'USER'`), функционал разработчика (`role === 'DEVELOPER'`), логика чата, прохождения уроков, экзаменов, словарь, грамматика, караоке и прочие компоненты остаются полностью нетронутыми. Изменения строго изолированы:
> 1. Скрытием пунктов боковой панели навигации «Review queue», «My quizzes» и «Speakout» для роли преподавателя (`role === 'ADMIN'`).
> 2. Скрытием кнопки «Voice Mode» в панели интерактивных режимов урока для роли преподавателя (`role === 'ADMIN'`).
> 3. Скрытием вкладки «Speech» в панели инструментов урока для роли преподавателя (`role === 'ADMIN'`).
> 4. Сохранением полной видимости и доступности всех 5 элементов исключительно для роли разработчика (`role === 'DEVELOPER'`).

---

## 1. Точная формулировка задач (Problem Statement)

1. **Скрытие полей навигации в боковой панели**:
   - «Review queue» (`data-workbench-queue`): скрыть для учителя (`role === 'ADMIN'`), отображать только для разработчика (`role === 'DEVELOPER'`).
   - «My quizzes» (`data-workbench-mine`): скрыть для учителя (`role === 'ADMIN'`), отображать только для разработчика (`role === 'DEVELOPER'`).
   - «Speakout» (`data-jump="speakout"`): скрыть для учителя (`role === 'ADMIN'`), отображать только для разработчика (`role === 'DEVELOPER'`).
   - Изолировать прямой доступ к экранам `#workbenchqueue` и `#workbenchmine` для преподавателей.

2. **Скрытие элементов управления в уроке**:
   - «Voice Mode» (`#lmVoiceModeBtn`): скрыть кнопку в панели интерактивных режимов практики (`.lm-modes-bar`) для учителя, отображать только для разработчика.
   - «Speech» (`data-workbench-lesson-speech`): скрыть вкладку в панели инструментов урока (`.lm-daytools`) для учителя, отображать только для разработчика.

3. **Ничего не удалять**:
   - Никакие функциональные обработчики, функции генерации, модальные окна и логика бекенда не удаляются, а исключительно изолируются и скрываются на уровне прав доступа (`role === 'DEVELOPER'`).

---

## 2. Утвержденные скриншоты интерфейса

### Скриншот 1: Боковое меню учителя без полей Speakout, Review queue и My quizzes в теме Sky
![Скриншот 1: Боковое меню учителя в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-sidebar-sky.png)

### Скриншот 2: Боковое меню учителя в теме Dark
![Скриншот 2: Боковое меню учителя в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-sidebar-dark.png)

### Скриншот 3: Боковое меню учителя в теме Sand
![Скриншот 3: Боковое меню учителя в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-sidebar-sand.png)

### Скриншот 4: Панель инструментов и режимов урока для учителя без Speech и Voice Mode в теме Sky
![Скриншот 4: Панель инструментов урока для учителя в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-lesson-toolbar-sky.png)

### Скриншот 5: Панель инструментов и режимов урока для учителя в теме Dark
![Скриншот 5: Панель инструментов урока для учителя в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-lesson-toolbar-dark.png)

### Скриншот 6: Панель инструментов и режимов урока для учителя в теме Sand
![Скриншот 6: Панель инструментов урока для учителя в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-teacher-lesson-toolbar-sand.png)

---

## 3. Контрольный список реализации (Implementation Checklist)

- `🟩` Скрыть пункт «Speakout» в боковой навигации для роли учителя (перевести видимость исключительно на `DEVELOPER`).
- `🟩` Скрыть кнопку «Review queue» в боковой навигации для роли учителя (перевести видимость исключительно на `DEVELOPER`).
- `🟩` Скрыть кнопку «My quizzes» в боковой навигации для роли учителя (перевести видимость исключительно на `DEVELOPER`).
- `🟩` Ограничить доступ к маршрутам `#workbenchqueue` и `#workbenchmine` исключительно для разработчика.
- `🟩` Скрыть вкладку «Speech» в панели инструментов урока для роли учителя (отображать только для `DEVELOPER`).
- `🟩` Скрыть кнопку «Voice Mode» в панели режимов практики урока для роли учителя (отображать только для `DEVELOPER`).
- `🟩` Актуализировать тесты видимости навигации и элементов урока для ролей `USER`, `ADMIN` и `DEVELOPER`.
- `🟩` Выполнить сборку производственных бандлов (`npm run build:preview && node ops/build-learning-production-assets.mjs`).
- `🟩` Запустить целевые тесты и верифицировать 100% прохождение без регрессий.
