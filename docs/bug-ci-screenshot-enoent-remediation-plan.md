# План исправления ошибки ENOENT при сохранении скриншотов в тестах CI

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать или нарушать функционал приложения, серверные API, логику авторизации или сторонние компоненты. Изменения строго ограничены проверкой существования директории перед сохранением артефактов в [`test/test-hidden-students-isolation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs) и [`test/test-level-cards-vertical-metrics-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-level-cards-vertical-metrics-ui.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Локализация в коде**:
  - [`test/test-hidden-students-isolation.mjs#L280-L283`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs#L280-L283): вызов `await b1Card.screenshot({path: `${dir}/screenshot-2-proposed-teacher-group-card.png`})`.
  - [`test/test-level-cards-vertical-metrics-ui.mjs#L118-L123`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-level-cards-vertical-metrics-ui.mjs#L118-L123): вызов `await decks.screenshot({path: ...})`.
- **Первопричина**:
  В тестовом файле путь сохранения скриншота жестко указывает на локальную директорию рабочего пространства macOS (`/Users/tsovakpalakian/...`). В среде сборки GitHub Actions runner (`/Users/runner/work/...`) этой локальной папки не существует, из-за чего Playwright завершает тест системной ошибкой `ENOENT: no such file or directory`.
- **Решение**:
  Обернуть сохранение скриншотов в проверку `existsSync(dir)`. Если директория существует (локальная разработка), скриншот сохраняется; в окружении CI, где путь отсутствует, выполнение теста успешно продолжается без прерывания.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. Изменения затрагивают исключительно:
   - [`test/test-hidden-students-isolation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs);
   - [`test/test-level-cards-vertical-metrics-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-level-cards-vertical-metrics-ui.mjs).
2. Запрещено модифицировать исходный код приложения в `client/`, `site/` или `src/`.
3. Сохранять все проверки логики изоляции учеников и структуры карточек.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Добавление проверки `existsSync(dir)` перед вызовом `screenshot` в [`test/test-hidden-students-isolation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs).
- 🟩 **Этап 2**: Добавление проверки `existsSync(dir)` перед вызовом `screenshot` в [`test/test-level-cards-vertical-metrics-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-level-cards-vertical-metrics-ui.mjs).
- 🟩 **Этап 3**: Локальный запуск тестов без падений с проверкой положительного завершения.
- 🟩 **Этап 4**: Фиксация отчета об устранении дефекта.
