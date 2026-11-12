# План исправления тестов: test-lesson-visual-components.mjs и test-mastery-score-and-teacher-verification.mjs

## 1. Точная формулировка проблемы и ссылки на код
В результате выполнения предыдущего запроса пользователя кнопки `Focus Mode` и `Voice Mode` были перенесены из статического нижнего тулбара [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L895-L899) в динамическую 3-ю строку навигации урока (`.lm-modes-bar.seg`) в [client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1308-L1315). Нижний ряд кнопок был переработан в `.lm-bottom-actions-row` с круглыми кнопками-таблетками `Preview` и `Approve all` под `+ Add content`.

Вследствие этого два статических теста, проверяющих файл `site/preview.html` через `fs.readFileSync`, завершились с ошибками:
1. [test/test-lesson-visual-components.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-visual-components.mjs#L24-L64):
   - `Visual Test 2`: ожидал наличие `id="lmFocusPlayerBtn"` непосредственно в `site/preview.html`.
   - `Visual Test 3`: ожидал наличие `id="lmVoiceModeBtn"` непосредственно в `site/preview.html`.
   - `Visual Test 6`: ожидал точную строку `style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;"` в `site/preview.html`.
2. [test/test-mastery-score-and-teacher-verification.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-mastery-score-and-teacher-verification.mjs#L109-L122):
   - `Stage 18 & 19`: ожидал наличие `id="lmVoiceModeBtn"` непосредственно в `site/preview.html`.

## 2. Границы области действия и инварианты (Scope Boundaries & Invariants)
- **Строгая изоляция функционала**:
  > [!IMPORTANT]
  > <span style="color: red; font-weight: bold;">WARNING</span>: Никакие изменения пользовательского интерфейса урока (3 строки навигации, круглые таблетки `Preview` и `Approve all`, адаптер цветов темы) не должны быть затронуты или откачены. Одобренный пользователем макет интерфейса строго сохраняется.
- Добавить адаптивный `flex-wrap: wrap` в инлайн-стиль `.lm-bottom-actions-row` в [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L895-L898) (`style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; margin-top:12px;"`).
- Синхронизировать утверждения в [test/test-lesson-visual-components.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-visual-components.mjs) и [test/test-mastery-score-and-teacher-verification.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-mastery-score-and-teacher-verification.mjs), чтобы проверка кнопок `id="lmFocusPlayerBtn"` и `id="lmVoiceModeBtn"` учитывала их перемещение в 3-ю строку панели урока (`client/52-lessons.js` / `preview.js` / `site/preview.html`).

## 3. Детерминированный метод верификации
- `npm run build:preview && node ops/build-learning-production-assets.mjs`
- `node --test test/test-lesson-visual-components.mjs test/test-mastery-score-and-teacher-verification.mjs test/test-wordwall-url-ingest.mjs`

## 4. Контрольный список реализации (Checklist)
- 🟩 **Этап 1**: Подготовка плана и согласование с пользователем
- 🟩 **Этап 2**: Обновление разметки `.lm-bottom-actions-row` в `site/preview.html` с добавлением адаптивного `flex-wrap: wrap`
- 🟩 **Этап 3**: Актуализация тестов `test/test-lesson-visual-components.mjs` и `test/test-mastery-score-and-teacher-verification.mjs` с поддержкой новой архитектуры 3-й строки навигации
- 🟩 **Этап 4**: Сборка бандлов (`npm run build:preview` и `ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 5**: Запуск тестов и проверка 100% прохождения
- 🟩 **Этап 6**: Изолированная индексация изменений в Git (`git add`)
