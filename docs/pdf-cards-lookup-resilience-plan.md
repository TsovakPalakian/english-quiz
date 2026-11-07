# План устранения сбоя разрыва соединения и блокировки очереди при поиске карточек (PDF Cards Lookup Resilience Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать схему базы данных `cards`, `lessons`, систему аутентификации `identify`, механизм фоновой очереди личных ответов `personalQueue`, серверный сервис `StudyService.lookupSharedCard`, правила валидации уроков и несвязанные маршруты API. Изменения строго ограничены реализацией безопасного повтора при сетевых сбоях (status 0) в `client/main/main-bridge.js`, очисткой `pending` мутации при сбое `/api/cards/lookup`, фильтрацией ложной фиксации сетевого дефекта в `reportClientBug`, а также добавлением устойчивости к временным сетевым сбоям в цикле подготовки карточек `client/52b-lesson-pdf-import.js`.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Код ошибки и путь**: `POST /api/cards/lookup` -> `0 Connection interrupted. Saving is not confirmed; retry the same operation.` (Bug ID: `9ec0811f561c099613c309fa540c1e1e`).
- **Стек вызова на клиенте**:
  ```text
  Error: Connection interrupted. Saving is not confirmed; retry the same operation.
      at api (https://lumiscia.org/main-bridge.js:256:33)
      at async write (https://lumiscia.org/main-bridge.js:366:20)
      at async lmPdfPrepareCards (https://lumiscia.org/preview.js:24986:16)
      at async Object.perform (https://lumiscia.org/main-bridge.js:442:7)
      at async apply.onclick (https://lumiscia.org/preview.js:26070:9)
  ```
- **Файл сетевого моста**: [`client/main/main-bridge.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js)
- **Файл подготовки карточек PDF**: [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js)
- **Суть сбоя**:
  1. Во время пакетной подготовки карточек из разобранного PDF-документа функция `lmPdfPrepareCards` поочерёдно вызывает `lookupLessonCard` (`POST /api/cards/lookup`) и `dictionary` (`GET /api/cards/{id}/dictionary`).
  2. Первые 6 карточек успешно создались. На 7-й карточке произошёл кратковременный сетевой сбой браузера/соединения (`TypeError`, статус `0`, длительность 45 мс).
  3. В методе `api()` флаг `isIdempotent` был выставлен только для `GET` и `HEAD`, поэтому для `POST` запроса `maxAttempts = 1`, повторная попытка не производилась.
  4. При `!isIdempotent` сетевой сбой со статусом 0 в методе `api()` ошибочно вызвал `reportClientBug`, отправив ложный отчёт в `/api/bugs`.
  5. В функции `write()` при ошибке со статусом 0 запись `pending` сохранялась в `localStorage` под ключом `learning-main-pending-v3` и не очищалась.
  6. В результате операция карточки навечно блокировала очередь. При повторном клике «Apply» цикл начинался сначала, и несовпадение интента (`pending.intent !== intent`) приводило к ошибке: *«Есть неподтверждённая операция. Используйте «Повторить» или «Проверить сервер».»*.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/main/main-bridge.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js):
    - Добавление безопасного цикла повтора (2 попытки с паузой 300 мс) при `error.status === 0` в методе `write()`.
    - Сохранение того же `pending.body` и `mutationId` при повторе.
    - Выставление `quietBug: attempt === 1` для предотвращения ложной фиксации временных сетевых микросбоев.
    - Очистка `pending` из `localStorage` при окончательном сбое `/api/cards/lookup`.
    - Исключение `status === 0` для `/api/cards/lookup` в `reportClientBug`.
  - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js):
    - Добавление отказоустойчивости в цикле `lmPdfPrepareCards` при временном сбое связи (`err?.status === 0`).
  - [`test/test-cards-lookup-resilience.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-cards-lookup-resilience.mjs):
    - Модульные тесты для проверки повторов `write()` при `status: 0`, очистки `pending` и отсутствия ложных репортов багов.
  - Производный файл сборки: [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js).

- **Инварианты**:
  - Сохранение публичного контракта `window.LearningMain.lookupLessonCard` и `window.LearningMain.dictionary`.
  - Сохранение серверной идемпотентности через `operation_receipts`.
  - Сохранение линейной блокировки очереди для обычных правок уроков и карточек.

---

## 3. Детерминированный метод верификации (Verification Method)

1. Запуск целевого теста устойчивости: `node --test test/test-cards-lookup-resilience.mjs`.
2. Запуск связанных тестов очереди и сетевого моста: `node --test test/test-network-bridge-resilience.mjs test/test-lesson-write-queue.mjs test/test-lesson-pdf-enrichment.mjs`.
3. Сборка предпросмотра: `npm run build:preview`.
4. Проверка статуса репозитория: `git status --short`.

---

## 4. Контрольный список реализации (Implementation Checklist)

- `🟩` **Этап 1**: Реализация повтора при сетевом срыве (status 0) и очистка `pending` для `/api/cards/lookup` в `client/main/main-bridge.js`.
- `🟩` **Этап 2**: Фильтрация ложного репорта дефектов сетевого уровня для `/api/cards/lookup` в `reportClientBug`.
- `🟩` **Этап 3**: Повышение отказоустойчивости подготовки карточек в `client/52b-lesson-pdf-import.js`.
- `🟩` **Этап 4**: Написание целевых модульных тестов в `test/test-cards-lookup-resilience.mjs`.
- `🟩` **Этап 5**: Пересборка клиентских ассетов (`npm run build:preview`) и валидация тестами.
