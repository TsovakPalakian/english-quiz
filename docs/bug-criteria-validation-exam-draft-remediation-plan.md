# План устранения дефекта валидации критериев оценивания экзамена в режиме черновика (Bug ID: 58748f985d4deaf0a5ba7faa4eaf55d6)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей задаче. Запрещено затрагивать логику авторизации, структуру БД, чат, биллинг, группы, обычные уроки вне экзаменов и смежные контроллеры. Все изменения строго и изолированно ограничены:
> 1. Валидацией контента критериев оценивания в [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs) с поддержкой флага `allowIncomplete`;
> 2. Передачей статуса опубликованности блока в валидатор при сохранении экзамена в [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs);
> 3. Расчетом баллов рубрики и валидацией шкалы оценивания в [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs);
> 4. Клиентской предпроверкой синтаксиса критериев при публикации и подсветкой поля в [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js);
> 5. Пересборкой ассетов через `npm run build:preview` и созданием целевых тестов в [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Суть дефекта**:
   - При создании или редактировании экзаменационного задания (`task`) учитель вводит критерии оценивания (`Grading criteria`) в формате многострочного текста (например, `тополя|3\nляляляля|`).
   - На каждое изменение в поле ввода срабатывает обработчик события `input` ([`client/main/exam-workflow.js:29-34`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js#L29-L34)), который через 400 мс дебаунса ([`client/52-lessons.js:424-427`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L424-L427)) инициирует автоматическое сохранение черновика экзамена на сервере через `POST /api/exams` ([`client/54-exams.js:97-138`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L97-L138)).
   - При обработке запроса сохранения сервер вызывает `validateAssessmentContent(content, part.type)` ([`src/learning-exams.mjs:249`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs#L249)).
   - Функция `validateAssessmentContent` в [`src/learning-study.mjs:96-101`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L96-L101) выполняет строгую проверку формата каждого критерия:
     `bits.length !== 2 || !bits[0].trim() || !Number.isFinite(points) || points <= 0 || points > 1e12` и при нарушении выбрасывает исключение `400 Use one criterion per line: Content | 3.`.
   - В результате, когда учитель печатает вторую строку критерия и делает естественную паузу (или вводит вертикальную черту `|` перед цифрой баллов), сервер отклоняет сохранение статусом 400.
   - Клиентский метод `examSave` перехватывает ошибку 400 ([`client/54-exams.js:167`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L167)) и отображает всплывающий тост-уведомление `window.LearningMain.notice(error.message, true)`.
   - Это прерывает ввод учителя каждые 400 мс (в логе инцидента зафиксировано 19 повторов за 6 минут), черновик не сохраняется в БД, а при перезагрузке страницы введенные данные рискуют быть утрачены.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  1. [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs): добавление третьего аргумента `allowIncomplete = false` в `validateAssessmentContent`. В режиме черновика (`allowIncomplete === true`) сохраняются жесткие лимиты на длину строки (до 3000 символов) и число строк (до 20), но промежуточные незавершенные строки не блокируют сохранение черновика. В режиме публикации (`allowIncomplete === false`) строгая валидация формата `Category | Points` сохраняется в неизменном виде.
  2. [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs): вызов `validateAssessmentContent(content, part.type, !block.published)` на строке 249 аналогично вызову `validateExamScoring(materials, !block.published)` на строке 231.
  3. [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs): устойчивый парсинг строк критериев в `examElementMax`, исключающий появление `NaN` при вычислении баллов незавершенных строк черновика, и пропуск проверки `max <= 0` для `criteria` при `allowIncomplete === true`.
  4. [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js): предпубликационная проверка валидности синтаксиса критериев при клике `Publish`, фокусировка на некорректном `textarea[data-field="criteria"]`, добавление класса `.bad` и показ сообщения без холостого падения сетевого запроса.
  5. [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs): целевые юнит- и интеграционные тесты.

- **Инварианты**:
  - Полное сохранение публичного контракта API: при публикации экзамена (`published: true`) валидация жестко блокирует публикацию невалидных критериев с текстом `Use one criterion per line: Content | 3.`;
  - Не задеваются обычные уроки, режим прохождения экзамена учениками и расчет баллов проверенных работ;
  - Обеспечивается бесшовное автоматическое фоновое сохранение черновиков экзаменов без прерывания учителя всплывающими окнами ошибок.

---

## 3. Этапы реализации и контрольный список (Checklist)

- ⬜ **Этап 1**: Серверная поддержка незавершенных критериев в черновиках экзаменов в [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs) и [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs).
- ⬜ **Этап 2**: Безопасный подсчет баллов рубрики и толерантность к черновикам в [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs).
- ⬜ **Этап 3**: Клиентская валидация синтаксиса критериев при публикации и фокусировка поля в [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js).
- ⬜ **Этап 4**: Пересборка клиентских ассетов (`npm run build:preview`).
- ⬜ **Этап 5**: Разработка автоматических тестов в [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs) и регрессионный прогон `node --test test/test-exam-workflow.mjs test/test-learning-exam-lifecycle.mjs`.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка производных ассетов:
   `npm run build:preview`
2. Запуск целевых тестов:
   `node --test test/test-exam-criteria-draft-flow.mjs`
3. Запуск связанных регрессионных тестов экзаменов:
   `node --test test/test-exam-workflow.mjs test/test-learning-exam-lifecycle.mjs`
