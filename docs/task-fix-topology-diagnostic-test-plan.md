# План адаптации теста топологии учителей под скрытое состояние Group Diagnostic Overview

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, удалять или нарушать функционал приложения, не относящийся к текущей задаче. Запрещено вносить нерелевантные правки в клиентский код ([`client/`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/)), стили ([`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)), разметку ([`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)), логику авторизации или смежные шаги сценариев. Изменения строго изолированы и затрагивают исключительно шаг 15 в тестовом сценарии [`test/test-multi-teacher-topology-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Контекст**: В рамках предыдущей задачи блок `Group Diagnostic Overview` ([`#groupDetailDiagnostic`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L600)) был скрыт со страницы деталей группы ([`#groupdetail`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L588)) посредством добавления атрибута `hidden`, стилей `display: none !important;` и отключения принудительного показа в [`client/53-group-directory.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L82-L91).
- **Симптом сбоя в CI**: При выполнении комплексного теста [`test/test-multi-teacher-topology-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs#L1119) на шаге 15:
  ```
  ✖ 15. Subgroup Diagnostic Heatmap: Teacher 101_1 views Group 101 diagnostic breakdown and advice; IDOR prevents unauthorized access (30981.553458ms)
    locator.waitFor: Timeout 30000ms exceeded.
    waiting for locator('#groupDetailDiagnostic') to be visible
    63 × locator resolved to hidden <div hidden="" id="groupDetailDiagnostic" class="group-diagnostic-panel">…</div>
  ```
- **Причина**: Шаг 15 ожидал видимости элемента `#groupDetailDiagnostic` (`waitFor({state:'visible'})`), который теперь по утвержденным требованиям скрыт.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Файлы в области изменений**:
  - [`test/test-multi-teacher-topology-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs): обновление шага 15 для согласования с новым инвариантом скрытости UI-блока и валидации контракта API/IDOR.
- **Инварианты**:
  - Сохранение полной изоляции и скрытости блока `#groupDetailDiagnostic` в UI (`hidden`, `display: none !important;`).
  - Проверка, что блок `#groupDetailDiagnostic` на странице `#groupdetail` гарантированно скрыт (`isHidden() === true`).
  - Сохранение и валидация бэкенд-эндпоинта аналитики ошибок (`/api/error-bank?action=subgroup-diagnostic`):
    - Назначенный учитель группы 101 (`teacher_101_1`) имеет авторизованный доступ к данным аналитики своей группы (HTTP 200, корректный `totalErrors: 3`, рекомендации).
    - Попытка доступа к неназначенной группе (IDOR) блокируется с HTTP 403 Forbidden.
    - Студент не имеет доступа к аналитике (HTTP 403 Forbidden) и не видит панель на странице.

---

## 3. Анализ смежных компонентов

<span style="color: red; font-weight: bold;">WARNING</span>:
Изменение шага 15 в [`test/test-multi-teacher-topology-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs#L1108-L1134) синхронизирует тест с ранее выполненным сокрытием компонента `Group Diagnostic Overview`. Никакие другие шаги (с 1 по 14 и с 16 по 17), а также исходные файлы приложения не модифицируются.

---

## 4. Этапы реализации (Checklist)

- 🟩 **Этап 1**: Согласование плана с пользователем.
- 🟩 **Этап 2**: Точечное обновление шага 15 в [`test/test-multi-teacher-topology-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-multi-teacher-topology-ui.mjs) (проверка `isHidden()` для панели и прямая проверка API/IDOR).
- 🟩 **Этап 3**: Запуск целевого теста `node --test test/test-multi-teacher-topology-ui.mjs` и верификация успешного прохождения всех 17 шагов.
- 🟩 **Этап 4**: Предоставление финального отчета, commit message и списка измененных тестов.
