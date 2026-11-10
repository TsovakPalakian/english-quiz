# План добавления ссылки на задачу Jira, жирного выделения и цветовых индикаторов статусов в Lumiscia CI

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, удалять или нарушать функционал приложения, не относящийся к текущей задаче. Запрещено затрагивать клиентские скрипты в каталоге `client/`, стили в каталоге `site/`, серверные обработчики в каталоге `src/`, логику тестирования или развертывание в Cloudflare. Изменения строго изолированы и затрагивают исключительно форматирование уведомлений в [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs), конфигурацию шага в [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml) и автоматические тесты в [`test/test-check-environment.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs).

---

## 1. Точная формулировка задачи (Problem Statement)

- **Контекст**: В текущем сообщении Lumiscia CI отсутствует ссылка на задачу Jira перед строкой `Commit:`, метки `Task:` и `Deploy:` не выделены полужирным шрифтом, а статус развертывания выводится без цветовой индикации.
- **Ограничения Telegram Bot API**: Telegram API не поддерживает произвольные цвета шрифта через HTML-атрибуты стиля (`style="color:..."` или `<font>`). Цветовая индикация реализуется через эмодзи-маркеры.
- **Целевое поведение**:
  1. Добавление строки `Task:` непосредственно перед строкой `Commit:` со ссылкой формата `https://lumiscia.atlassian.net/browse/TASK-<номер>`.
  2. Перевод отправки сообщений в Telegram на `parse_mode: 'HTML'` для поддержки тегов `<b>` и `<a>`.
  3. Выделение меток `<b>Task:</b>` и `<b>Deploy:</b>` полужирным начертанием.
  4. Строка `Tests:` выводится стандартным текстом без цветных маркеров (`Tests: success` / `Tests: failure`).
  5. Цветовая индикация добавляется исключительно к статусу `Deploy:`:
     - Зеленый маркер `🟢 success` при успешном деплое.
     - Красный маркер `🔴 skipped` при пропуске деплоя (вследствие сбоя тестов или нецелевой ветки).
     - Красный маркер `🔴 failure` при сбое деплоя.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs): добавление логики парсинга задачи, цветовых маркеров 🟢 / 🔴 исключительно для поля деплоя, параметров HTML-разметки и экранирования.
  - [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml): передача сообщения коммита в переменные окружения шага отправки уведомления.
  - [`test/test-check-environment.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs): тестирование корректности разметки, изоляции цветовых маркеров только для деплоя и ссылок.
- **Инварианты**:
  - Строгое экранирование спецсимволов HTML (`&`, `<`, `>`) в динамических полях.
  - Сохранение порядка строк в уведомлении.
  - Отсутствие строки `Task:`, если коммит не содержит идентификатор `TASK-\d+`.
  - Защита от утечки секретов и токенов.

---

## 3. Визуальные макеты отображения сообщения

### Скриншот 1: Успешный прогон — зеленый маркер только у Deploy (🟢 success), Tests без маркера
![Скриншот 1: Успешный прогон — зеленый маркер только у Deploy](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-ci-telegram-task-link-screenshot-1.png)

### Скриншот 2: Сбой тестов — красный маркер только у Deploy (🔴 skipped), Tests без маркера
![Скриншот 2: Сбой тестов — красный маркер только у Deploy](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-ci-telegram-task-link-screenshot-2.png)

---

## 4. Этапы реализации (Checklist)

- 🟩 **Этап 1**: Презентация обновленного макета со статусами только для деплоя пользователю и согласование.
- 🟩 **Этап 2**: Обновление функций `pipelineNotification` и `notifyTelegram` в [`ops/telegram-notify.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/telegram-notify.mjs) (парсинг `TASK-\d+`, теги `<b>Task:</b>`, `<b>Deploy:</b>`, цветовые маркеры `🟢 success` / `🔴 skipped` / `🔴 failure` исключительно для деплоя, экранирование спецсимволов).
- 🟩 **Этап 3**: Передача контекста сообщения коммита в [`.github/workflows/ci-cd.yml`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/.github/workflows/ci-cd.yml).
- 🟩 **Этап 4**: Добавление модульных тестов в [`test/test-check-environment.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-check-environment.mjs).
