# План скрытия компонента Group Diagnostic Overview со страницы группы

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей задаче. Запрещено затрагивать логику авторизации, журнал посещаемости, учет оплаты, систему чата, карточки учителей/студентов/уроков/экзаменов, а также общую структуру разделов приложения. Все изменения изолированы и направлены исключительно на сокрытие блока `Group Diagnostic Overview` на странице карточки группы (`#groupdetail`).

---

## 1. Точная формулировка задачи (Problem Statement)

- **Контекст**: На экране детального просмотра группы (`#groupdetail`) под виджетом календаря и посещаемости [`groupCalendarWidget`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L599) отображается блок аналитики ошибок группы [`#groupDetailDiagnostic`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L600-L608) с заголовком `Group Diagnostic Overview`.
- **Требование**: Временно убрать данный блок со страницы, сделав его невидимым для пользователей.
- **Технические точки сопряжения**:
  - [`site/preview.html:600`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L600): контейнер `<div id="groupDetailDiagnostic" class="group-diagnostic-panel" hidden>`.
  - [`client/53-group-directory.js:82-90`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L82-L90): функция `paintGroupDiagnostic(groupId)`, где при открытии группы выполняется `panel.hidden = false;`, делая панель видимой.
  - [`site/preview.css:5609-5616`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L5609-L5616): стили панели `#groupDetailDiagnostic`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Файлы в области изменений**:
  - [`client/53-group-directory.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js): обеспечение гарантированного сохранения скрытого состояния панели (`hidden = true` или пропуск принудительного показа).
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): атрибут `hidden` и стили сокрытия на контейнере `#groupDetailDiagnostic`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): производный артефакт клиентской сборки (`npm run build:preview`).
  - [`test/test-hide-group-diagnostic.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hide-group-diagnostic.mjs): специализированный тест проверки невидимости панели на странице.
- **Инварианты**:
  - Сохранение разметки и id элементов (`groupDetailDiagnostic`, `groupDiagTotalErrors`, `groupDiagBars`, `groupDiagLegend`, `groupDiagAdvice`) для предотвращения ошибок обращения к DOM `getElementById`.
  - Сохранение публичных API бэкенда (`/api/error-bank?action=subgroup-diagnostic`).
  - Полная неприкосновенность смежных карточек `Teachers`, `Students`, `Lessons`, `Exams` и виджета `groupCalendarWidget`.

---

## 3. Анализ смежных компонентов и предупреждение

<span style="color: red; font-weight: bold;">WARNING</span>:
Тест [`test/test-multi-teacher-topology-ui.mjs:1119`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs#L1119) содержит утверждение:
```javascript
await pageT1.locator('#groupDetailDiagnostic').waitFor({state:'visible'});
```
При скрытии блока `Group Diagnostic Overview` данный шаг в комплексном тесте топологии учителей ожидает видимости панели. Требуется либо адаптировать данный шаг теста к новому состоянию скрытости (проверять `isHidden()`), либо изолировать проверку в отдельном специализированном сценарии.

---

## 4. Этапы реализации (Checklist)

- 🟩 **Этап 1**: Согласование плана и мокапов («Скриншот 1» и «Скриншот 2») с пользователем.
- 🟩 **Этап 2**: Внесение точечных изменений в [`client/53-group-directory.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js) и [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) для скрытия панели `#groupDetailDiagnostic`.
- 🟩 **Этап 3**: Сборка клиентских ассетов (`npm run build:preview`).
- 🟩 **Этап 4**: Создание целевого теста [`test/test-hide-group-diagnostic.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hide-group-diagnostic.mjs), проверяющего скрытость блока в DOM и рендере.
- 🟩 **Этап 5**: Верификация прохождения тестов и сборки ассетов.
