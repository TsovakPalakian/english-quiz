# План: Приоритетный показ непроверенных карточек и группировка проверенных карточек в аккордеон

## Scope isolation and collateral protection

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче.
> Выполняемые правки строго изолированы в рамках логики распределения и рендеринга блоков в редакторе уроков ([client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1134-L1165)) и синхронизации сгенерированного скрипта ([preview.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js)).
> Запрещено затрагивать логику генерации квизов, систему оценивания, структуру сохранения снимков уроков, клиентские и серверные маршруты авторизации, экзаменационные ограничения и вспомогательные режимы тренировок.

---

## 1. Постановка проблемы и исходный код

1. **Непоследовательное разделение карточек по статусу верификации**:
   - В [client/52-lessons.js#L1137-L1165](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1137-L1165) разделение блоков на непроверенные (`!block.teacherVerified`) и проверенные (`block.teacherVerified === true`) со сворачиванием в аккордеон `.lm-verified-accordion` было реализовано только для вкладок `classwork` и `homework`:
     ```javascript
     } else if (lmTab() === "classwork" || lmTab() === "homework") {
     ```
   - На вкладках `words`, `phrases`, `rules` и `overview` рендеринг выполнялся через ветку `else`, выводя абсолютно все блоки в порядке их физического добавления в массив:
     ```javascript
     } else {
       mainHtml = blocks.map((b, i) => renderSingleBlock(b, i, blocks.length, false)).join("");
     }
     ```
   - В результате на вкладке `phrases` (пользовательский скриншот `media_1795128109684_99db8afe.jpg`) все 19 проверенных фраз отображались в развернутом виде, заполняя весь экран, а непроверенные карточки не получали приоритетного отображения вверху.

2. **Отсутствие индивидуального сворачивания проверенных карточек**:
   - В функции `renderSingleBlock(block, index, total, isVerifiedSection)` флаг `isVerifiedSection` передавался при рендеринге проверенных блоков, но класс `.is-shut` определялся исключительно по `block.collapsed`:
     ```javascript
     const blockHtml = '<article class="lm-block' + (block.collapsed ? " is-shut" : "") + ...
     ```
   - Из-за этого при раскрытии аккордеона проверенные карточки занимали полное вертикальное пространство вместо компактного свернутого вида каждой отдельной карточки.

---

## 2. Анализ и план решения

1. **Единый порядок сортировки и группировки для всех рабочих вкладок**:
   - Распространить логику разделения на все вкладки с карточками (`words`, `phrases`, `rules`, `classwork`, `homework`):
     - Карточки, требующие проверки учителем (`!block.teacherVerified`), отображаются первыми вверху секции в развернутом виде.
     - Карточки, уже проверенные учителем (`block.teacherVerified === true`), группируются в единый раскрываемый контейнер-аккордеон `<details class="lm-verified-accordion">` внизу страницы (по образцу вкладки `classwork` на Скриншоте 2).
2. **Динамический заголовок аккордеона**:
   - Для вкладок `phrases` формировать заголовок `Verified phrases`.
   - Для вкладок `words` формировать заголовок `Verified words`.
   - Для вкладок `rules` формировать заголовок `Verified rules`.
   - Для `classwork` и `homework` сохранять заголовок `Verified materials & quizzes`.
3. **Компактное сворачивание каждой проверенной карточки внутри аккордеона**:
   - Для проверенных блоков внутри аккордеона (`isVerifiedSection === true`) по умолчанию рендерить карточку в свернутом виде (`is-shut`, иконка `▸`), чтобы каждая проверенная карточка занимала минимальное место и не загромождала рабочую область.

---

## 3. Снимки экранов

### Скриншот 1: Текущее состояние вкладки Phrases (пользовательский скриншот)
![Скриншот 1: Текущее состояние вкладки Phrases с несвернутыми карточками](/Users/tsovakpalakian/.gemini/antigravity/brain/ebb02169-a8a6-4dac-85ee-081b47a2a0c5/.user_uploaded/media_1795128109684_99db8afe.jpg)
*Скриншот 1: Вкладка «Phrases · 19» в редакторе урока, где проверенные карточки отображаются развернутыми и без аккордеона.*

### Скриншот 2: Эталонное состояние аккордеона из вкладки Classwork (пользовательский скриншот)
![Скриншот 2: Эталонное состояние свернутого аккордеона из вкладки Classwork](/Users/tsovakpalakian/.gemini/antigravity/brain/ebb02169-a8a6-4dac-85ee-081b47a2a0c5/.user_uploaded/media_1795128262283_e2e19e5e.png)
*Скриншот 2: Свернутый аккордеон проверенных заданий «✔ Verified materials & quizzes (10 items) Click to expand 10 items ▸».*

### Скриншот 3: Предлагаемый макет в теме Sky (свернутый аккордеон внизу, непроверенная карточка вверху)
![Скриншот 3: Предлагаемый макет в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-verified-accordion-template-1-sky.png)
*Скриншот 3: Непроверенная карточка «pay attention to» находится вверху для проверки, проверенные карточки свернуты в аккордеон «✔ Verified phrases (3 items) Click to expand 3 items ▸» в теме оформления Sky.*

### Скриншот 4: Предлагаемый макет в теме Dark
![Скриншот 4: Предлагаемый макет в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-verified-accordion-template-2-dark.png)
*Скриншот 4: Вкладка Phrases в теме оформления Dark.*

### Скриншот 5: Предлагаемый макет в светлой теме Sand
![Скриншот 5: Предлагаемый макет в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-verified-accordion-template-3-sand.png)
*Скриншот 5: Вкладка Phrases в светлой теме оформления Sand.*

### Скриншот 6: Раскрытый аккордеон со свернутыми карточками в теме Sky
![Скриншот 6: Раскрытый аккордеон со свернутыми карточками в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-verified-accordion-template-expanded-sky.png)
*Скриншот 6: Раскрытый аккордеон, внутри которого каждая проверенная карточка свернута в одну компактную строку с заголовком и бейджем «✓ Verified by Teacher».*

---

## 4. Этапы реализации и чеклист

- 🟩 **Этап 1: Документирование и согласование макета**
  - 🟩 Создать документ `docs/task-verified-cards-accordion-plan.md` с описанием шагов, защитным блоком и чеклистом.
  - 🟩 Согласовать пункт шаблона и функции с пользователем.

- 🟩 **Этап 2: Реализация приоритетной сортировки и аккордеона на вкладках**
  - 🟩 В `client/52-lessons.js` расширить условие отображения аккордеона и приоритетной сортировки для вкладок `words`, `phrases`, `rules`.
  - 🟩 Настроить адаптивный заголовок аккордеона: `Verified words`, `Verified phrases`, `Verified rules`, `Verified materials & quizzes`.
  - 🟩 В `renderSingleBlock` для `isVerifiedSection === true` обеспечить сворачивание каждой отдельной карточки (`is-shut`), если она не была явно развернута.

- 🟩 **Этап 3: Тестирование и сборка ассетов**
  - 🟩 Написать целевые тесты в `test/test-lesson-verified-accordion-tabs.mjs`, проверяющие порядок следования карточек и наличие аккордеона на вкладках `phrases` и `words`.
  - 🟩 Выполнить сборку `npm run build:preview`.
  - 🟩 Выполнить сборку продакшен-ассетов `node ops/build-learning-production-assets.mjs`.
  - 🟩 Прогнать целевые тесты и убедиться в их успешном прохождении.
