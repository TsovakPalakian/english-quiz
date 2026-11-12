# План исправления валидации пустого сценария уроков (TASK-53)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ И ИЗОЛЯЦИИ ИЗМЕНЕНИЙ:**
> Данное исправление строго ограничено обработчиком клика генерации сценария уроков в `client/52b-lesson-pdf-import.js`:
> 1. Восстановление установки сообщения валидации `Enter a script or topic description first.` в элементе `#lmScriptStatus`, если текст сценария пуст и отсутствуют блоки урока (необходимо для прохождения регрессионного теста `test-client-pdf-import.mjs`).
> 2. Запрещено модифицировать функционал кнопки `Fetch & Import Lesson` и удаление плашки `Paste a resource URL first.` (они остаются согласно требованиям пользователя).
> 3. Запрещено затрагивать верстку, стили тем, сохранение уроков в D1/R2, логику парсинга и работу квизов.

---

## 1. Точная формулировка проблемы и причины сбоя

- **Проблема**: В CI/CD тест `test/test-client-pdf-import.mjs` (шаг `lmGenerateLessonFromScript validates input and DOM event listeners dispatch drag-and-drop and tab toggles`) завершается ошибкой:
  ```text
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + ''
  - 'Enter a script or topic description first.'
  ```
- **Причина**: При удалении статусной плашки `Paste a resource URL first.` в обработчике `lmGenerateFromScriptBtn` была случайно удалена установка сообщения `Enter a script or topic description first.`, которую ожидает существующий контракт модульных тестов `test-client-pdf-import.mjs` при пустом вводе сценария.
- **Решение**: Восстановить установку `if (status) status.textContent = 'Enter a script or topic description first.';` в блоке `if (!text)` перед `return;` в `client/52b-lesson-pdf-import.js`. В пользовательском интерфейсе кнопка по-прежнему заблокирована (`disabled`) при пустом поле, но при программном вызове/валидации статусное сообщение корректно устанавливается в DOM, обеспечивая обратную совместимость и 100% прохождение тестов.

---

## 2. Макет интерфейса (тема 'sky')

### Скриншот 1: Отображение статусного сообщения валидации при пустом сценарии
![Скриншот 1](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-fix-screenshot-1-script-status.png)
*Скриншот 1. Вкладка Manual Script в теме 'sky': элемент статуса `#lmScriptStatus` отображает сообщение валидации «Enter a script or topic description first.», подтверждая контракт модульных тестов при пустом вводе.*
[Открыть исходный файл Скриншота 1](file:///Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-fix-screenshot-1-script-status.png)

---

## 3. Границы изменений (Scope Boundaries)

- **Затрагиваемые файлы**:
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): восстановление `if (status) status.textContent = 'Enter a script or topic description first.';` при `!text`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка бандла скриптов через `npm run build:preview`.
  - Пересборка продакшн-ассетов через `ops/build-learning-production-assets.mjs`.

---

## 4. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Создание плана исправления, фиксация причины сбоя и получение подтверждения от пользователя
- 🟩 **Этап 2**: Восстановление сообщения `Enter a script or topic description first.` в `client/52b-lesson-pdf-import.js`
- 🟩 **Этап 3**: Пересборка бандлов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 4**: Запуск целевого теста `node --test test/test-client-pdf-import.mjs` и верификация полного прохождения
- 🟩 **Этап 5**: Повторный запуск `test/test-wordwall-url-ingest.mjs` для проверки изоляции
- 🟩 **Этап 6**: Изолированная индексация изменений в Git (`git add`)
