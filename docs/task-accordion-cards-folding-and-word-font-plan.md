# План: Сворачивание карточек внутри аккордеона проверенных заданий и акцентное оформление целевых слов

## Scope isolation and collateral protection

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче.
> Выполняемые правки строго изолированы в рамках:
> 1. Логики состояния свернутости (`collapsed` / `isShut`) для проверенных карточек внутри аккордеона проверенных заданий ([client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1130-L1170)).
> 2. Стилизации полей ввода целевых слов и фраз (`data-item-field="word"`, `data-field="word"`, `data-item-field="phrase"`), а также краткого описания свернутой карточки ([site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)).
> 3. Синхронизации клиентского бандла ([preview.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js)) и целевых тестов ([test/test-lesson-verified-accordion-tabs.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-verified-accordion-tabs.mjs)).
> Запрещено затрагивать алгоритмы генерации квизов, систему оценивания, структуру сохранения снимков уроков, клиентские и серверные маршруты авторизации, экзаменационные ограничения и вспомогательные режимы тренировок.

---

## 1. Постановка проблемы и исходный код

1. **Несвернутое состояние карточек внутри раскрытого аккордеона проверенных материалов**:
   - В [client/52-lessons.js#L1132](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1132) вычисление класса скрытия тела карточки `.is-shut` производилось по формуле:
     ```javascript
     const isShut = isVerifiedSection ? (block.collapsed !== false) : Boolean(block.collapsed);
     ```
   - Однако при создании любых блоков и генерации заданий свойство `collapsed` явно инициализируется значением `false` (например, в [client/52-lessons.js#L695](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L695), [client/52-lessons.js#L3816](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3816)).
   - В результате выражение `(block.collapsed !== false)` на всех реальных данных вычисляется в `false`. При раскрытии аккордеона `Verified materials & quizzes` все проверенные карточки отображаются в полностью развернутом виде, занимая гигантскую высоту экрана (пользовательский скриншот `media_1795136088150_5c476a7c.jpg`).
   - Требуется гарантировать, что все карточки в проверенной секции по умолчанию физически свернуты (`.is-shut`) до компактной строки заголовка с кратким содержанием, и разворачиваются только по явному клику пользователя на кнопку сворачивания `data-lm-fold` (`▸`).

2. **Обычный шрифт в полях ввода целевых слов и названий заданий**:
   - Поля ввода слов и фраз (`data-item-field="word"`, `data-field="word"`, `data-item-field="phrase"`, например поле «Word / Phrase to pronounce») используют стандартный базовый шрифт нормальной толщины (400) и стандартный размер 14px, не акцентируя внимание на ключевом изучаемом слове.
   - В свернутом описании карточки (`.lm-summary`) целевое слово также не имеет достаточного визуального контраста.
   - Требуется сделать шрифт изучаемых слов полужирным (`font-weight: 700`) и немного увеличить размер шрифта (до `16px`), чтобы ключевое слово моментально считывалось как в развернутом поле ввода, так и в свернутом представлении карточки.

---

## 2. Анализ и план решения

1. **Надежное сворачивание карточек внутри секции проверенных материалов**:
   - Для карточек внутри проверенной секции (`isVerifiedSection === true`) по умолчанию устанавливать состояние свернутости (`isShut = true`), за исключением случаев, когда карточка была явно развернута пользователем (`block.collapsed === false && block.unfolded === true` / `block.verifiedExpanded === true`).
   - Синхронизировать обработчик кнопки `data-lm-fold` в [client/52-lessons.js#L2474](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2474) и `data-lm-edit` в [client/52-lessons.js#L2484](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2484), чтобы клик по стрелке `▸` открывал конкретную карточку и менял иконку на `▾`, а повторный клик возвращал ее в свернутое состояние.

2. **Акцентное типографическое оформление целевых слов**:
   - В [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) добавить стилизацию для полей ввода ключевых слов:
     ```css
     .lm-block input[data-item-field="word"],
     .lm-block input[data-field="word"],
     .lm-block input[data-item-field="phrase"] {
       font-weight: 700;
       font-size: 16px;
       letter-spacing: 0.01em;
     }
     ```
   - В [client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) и [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) обеспечить четкое выделение целевого слова полужирным шрифтом в строке `.lm-summary` свернутой карточки.

---

## 3. Визуальные снимки экранов (Screenshots & Mockups)

### Скриншот 1: Раскрытый аккордеон со свернутыми карточками в теме Sky
![Скриншот 1: Раскрытый аккордеон со свернутыми карточками в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-accordion-cards-collapsed-sky.png)
*Скриншот 1: Внутри раскрытого аккордеона «Verified materials & quizzes (10 items)» проверенные карточки компактно свернуты в одну строку с бейджем «✓ Verified by Teacher», стрелкой «▸» и выделенным полужирным словом в кратком содержании.*

### Скриншот 2: Раскрытая карточка Pronounce с полужирным и увеличенным шрифтом слова в теме Sky
![Скриншот 2: Раскрытая карточка Pronounce с полужирным и увеличенным шрифтом слова в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-accordion-cards-expanded-word-font-sky.png)
*Скриншот 2: Развернутая карточка задания «Task 1 · Quiz · Pronounce», где в поле ввода «Word / Phrase to pronounce» текст слова сделан полужирным (font-weight: 700) и увеличен до 16px.*

### Скриншот 3: Раскрытый аккордеон со свернутыми карточками в теме Dark
![Скриншот 3: Раскрытый аккордеон со свернутыми карточками в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-accordion-cards-collapsed-dark.png)
*Скриншот 3: Раскрытый аккордеон и свернутые карточки в темной теме оформления Dark.*

### Скриншот 4: Раскрытый аккордеон со свернутыми карточками в светлой теме Sand
![Скриншот 4: Раскрытый аккордеон со свернутыми карточками в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-accordion-cards-collapsed-sand.png)
*Скриншот 4: Раскрытый аккордеон и свернутые карточки в светлой теме оформления Sand.*

---

## 4. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1: Документирование и согласование макета**
  - 🟩 Создать документ `docs/task-accordion-cards-folding-and-word-font-plan.md` с описанием шагов, защитным блоком и чеклистом.
  - 🟩 Согласовать пункт шаблона и функции с пользователем.

- 🟩 **Этап 2: Реализация сворачивания карточек внутри аккордеона**
  - 🟩 Обеспечить состояние `isShut = true` по умолчанию для всех проверенных карточек внутри аккордеона.
  - 🟩 Настроить переключение сворачивания/разворачивания индивидуальной карточки по клику на стрелку `data-lm-fold` (`▸` / `▾`).

- 🟩 **Этап 3: Типографическое выделение изучаемых слов**
  - 🟩 В стилях применить `font-weight: 700` и увеличенный размер `font-size: 16px` для полей ввода слов (`data-item-field="word"`, `data-field="word"`, `data-item-field="phrase"`).
  - 🟩 Обеспечить контрастное полужирное отображение целевого слова в строке краткого описания свернутой карточки `.lm-summary`.

- 🟩 **Этап 4: Тестирование и сборка ассетов**
  - 🟩 Обновить и расширить целевые тесты в `test/test-lesson-verified-accordion-tabs.mjs`.
  - 🟩 Добавить визуальный тест `test/test-lesson-verified-card-folding-and-word-font-visual.mjs`.
  - 🟩 Выполнить сборку клиентских ассетов `npm run build:preview`.
  - 🟩 Выполнить сборку продакшен-ассетов `node ops/build-learning-production-assets.mjs`.
  - 🟩 Прогнать целевые тесты и убедиться в их 100% успешном прохождении.
