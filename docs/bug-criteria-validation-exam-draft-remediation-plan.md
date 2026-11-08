# План устранения дефекта валидации критериев оценивания экзамена в режиме черновика (Bug ID: 983e19664eac604ce194479debe295a7 / 58748f985d4deaf0a5ba7faa4eaf55d6)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей задаче. Запрещено затрагивать логику авторизации, структуру БД, чат, биллинг, группы, обычные уроки вне экзаменов и смежные контроллеры. Все изменения строго и изолированно ограничены:
> 1. Валидацией контента критериев оценивания в [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs) с поддержкой флага `allowIncomplete`;
> 2. Передачей статуса опубликованности блока в валидатор при сохранении экзамена в [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs);
> 3. Расчетом баллов рубрики и валидацией шкалы оценивания в [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs), исключающим ложную ошибку `Set Maximum points explicitly for Task1.`;
> 4. Клиентской предпроверкой синтаксиса критериев при публикации и подсветкой поля в [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js);
> 5. Пересборкой ассетов через `npm run build:preview` и созданием целевых тестов в [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Суть дефекта (Bug ID: 983e19664eac604ce194479debe295a7)**:
   - При редактировании черновика экзамена (`C2 Exam`, блок `Examination block`, `published: false`) учитель `teacher_yester` на экране `material` вводит в задание `Task1` с установленным `maxPoints: "6"` критерий `тополя|3л`.
   - В `examElementMax(part)` в [`src/exam-scoring.mjs#L16-L19`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs#L16-L19) любая строка с вертикальной чертой `|` парсится через `number(line.split('|')[1])`. Для строки `тополя|3л` вызов `number("3л")` дает `NaN`, в результате чего `examElementMax` и расчет `max` возвращают `NaN`.
   - На строке [`src/learning-exams.mjs#L231`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs#L231) вызов `validateExamScoring(materials, !block.published)` проверяет `source.maxPoints == null || source.maxPoints === '' || !Number.isFinite(max) || max <= 0 || max > 1e12` ([`src/exam-scoring.mjs#L53`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs#L53)). Так как `source.maxPoints` заполнен (`"6"`), условие пропуска черновика на строке 52 не срабатывает, и сервер выбрасывает ошибочное исключение:
     `400 Set Maximum points explicitly for Task1.`.
   - Ошибка вводит учителя в заблуждение: максимальные баллы (6) уже явно заданы, а реальная причина — некорректная промежуточная строка критерия (`3л`).
   - Кроме того, в функции `validateAssessmentContent` в [`src/learning-study.mjs#L96-L101`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs#L96-L101) отсутствует учет режима черновика (`allowIncomplete`), из-за чего при любом наборе текста критериев автосохранение по таймеру 400 мс прерывает ввод учителя ошибкой 400.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  1. [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs): устойчивый парсинг строк критериев в `examElementMax`, исключающий появление `NaN` при вычислении баллов строк черновика (только валидные строки рубрики `Label | Number` суммируются; если валидных строк нет, используется `part.maxPoints`).
  2. [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs): добавление третьего аргумента `allowIncomplete = false` в `validateAssessmentContent`. В режиме черновика (`allowIncomplete === true`) сохраняются лимиты длины (до 3000 символов) и числа строк (до 20), но промежуточные незавершенные строки не блокируют автосохранение черновика. В режиме публикации (`allowIncomplete === false`) строгая валидация формата `Category | Points` сохраняется в неизменном виде.
  3. [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs): вызов `validateAssessmentContent(content, part.type, !block.published)` на строке 249 с передачей признака черновика.
  4. [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js): предпубликационная проверка синтаксиса критериев при клике `Publish`, фокусировка на некорректном `textarea[data-field="criteria"]`, добавление класса `.bad` и показ сообщения до сетевого запроса.
  5. [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs): целевые юнит- и интеграционные тесты для воспроизведения и проверки Bug ID: 983e19664eac604ce194479debe295a7.

- **Инварианты**:
  - При публикации экзамена (`published: true`) валидация жестко блокирует публикацию невалидных критериев с текстом `Use one criterion per line: Content | 3.`;
  - Не задеваются обычные уроки, режим прохождения экзамена учениками и расчет баллов проверенных работ;
  - Обеспечивается бесшовное автоматическое фоновое сохранение черновиков экзаменов без ложных ошибок о максимальных баллах.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Безопасный подсчет баллов рубрики в `examElementMax` в [`src/exam-scoring.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/exam-scoring.mjs) без `NaN`.
- 🟩 **Этап 2**: Серверная поддержка незавершенных критериев в черновиках экзаменов в [`src/learning-study.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-study.mjs) и [`src/learning-exams.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-exams.mjs).
- 🟩 **Этап 3**: Клиентская валидация синтаксиса критериев при публикации и фокусировка поля в [`client/main/exam-workflow.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js).
- 🟩 **Этап 4**: Пересборка клиентских ассетов (`npm run build:preview`).
- 🟩 **Этап 5**: Разработка автоматических тестов в [`test/test-exam-criteria-draft-flow.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-exam-criteria-draft-flow.mjs) и регрессионный прогон `node --test test/test-exam-workflow.mjs`.

---

## 4. Детерминированный метод верификации (Verification Method)

1. Сборка производных ассетов:
   `npm run build:preview`
2. Запуск целевых тестов:
   `node --test test/test-exam-criteria-draft-flow.mjs`
3. Запуск связанных регрессионных тестов экзаменов:
   `node --test test/test-exam-workflow.mjs test/test-learning-exam-lifecycle.mjs`
