# План реализации формы пакетного добавления слов и фраз с ИИ-распознаванием и этапом одобрения

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: добавление 5-й вкладки «📦 Batch Vocabulary» в панель вкладок генератора урока (`.lm-tabs-bar` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)), форму ввода произвольного текста со списком слов/выражений, клиентский контроллер парсинга и распознавания с классификацией на слова и фразы в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) / [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js), таблицу предварительного просмотра и обязательного подтверждения (Approval Gate) перед добавлением в `lmState.blocks`, стили в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и целевые тесты в `test/test-batch-words-import.mjs`.

---

## 1. Кадры интерфейса (Screenshots & Mockups)

### Скриншот 1: Форма добавления слов и фраз пачками в теме Sky (`data-theme="sky"`)
![Скриншот 1: Форма добавления слов и фраз пачками в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-1-form-sky.png)
*Скриншот 1: Отображение 5-й вкладки «📦 Batch Vocabulary» в панели генератора уроков с многострочным полем ввода произвольного формата и кнопкой запуска ИИ-распознавания в теме Sky.*

### Скриншот 2: Форма добавления слов и фраз в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 2: Форма добавления слов и фраз в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-2-form-dark.png)
*Скриншот 2: Контрастное отображение формы пакетного ввода в теме Dark с системными токенами `--bg`, `--card`, `--ink`, `--line`.*

### Скриншот 3: Форма добавления слов и фраз в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Форма добавления слов и фраз в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-3-form-sand.png)
*Скриншот 3: Отображение формы пакетного ввода в светлой альтернативной теме Sand.*

### Скриншот 4: Таблица обязательного предварительного одобрения (Approval Gate) в теме Sky (`data-theme="sky"`)
![Скриншот 4: Таблица обязательного предварительного одобрения (Approval Gate) в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-4-approval-sky.png)
*Скриншот 4: Интерактивная таблица рецензирования с чекбоксами выбора, распределением «Word → Words» / «Phrase → Phrases», редактируемыми полями перевода и примеров и кнопкой «Approve & Add to Lesson» в теме Sky.*

### Скриншот 5: Таблица предварительного одобрения в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 5: Таблица предварительного одобрения в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-5-approval-dark.png)
*Скриншот 5: Контрастное отображение таблицы одобрения в теме Dark.*

### Скриншот 6: Таблица предварительного одобрения в светлой теме Sand (`data-theme="sand"`)
![Скриншот 6: Таблица предварительного одобрения в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-batch-words-screenshot-6-approval-sand.png)
*Скриншот 6: Отображение таблицы одобрения в теме Sand.*

---

## 2. Анализ задачи и цепочка действий

1. **Входная точка**:
   - В панели генерации урока (`#lmFrameImport`) наряду с существующими 4 вкладками (`File / PDF`, `Web URL`, `Manual Script`, `✨ Complement Current Lesson`) добавляется 5-я вкладка: `📦 Batch Vocabulary` (`#lmTabBtnBatch`).
2. **Шаблон 1 (Форма ввода)**:
   - Нажал вкладку «📦 Batch Vocabulary» — открывается панель `#lmTabPaneBatch`.
   - В поле `#lmBatchInput` пользователь вставляет текст в любом формате:
     - Список отдельных слов (через запятую, с новой строки или маркерами);
     - Слова и выражения с уже имеющимся переводом (`detour - объезд`, `commute: ежедневная поездка`);
     - Фразеологизмы, идиомы и коллокации (`take with a grain of salt`, `bite the bullet`);
     - Неструктурированный текст конспекта/заметок.
   - Кнопка `✨ Parse & Categorize with AI` (`#lmBatchParseBtn`) активна при наличии текста.
3. **Функция 1 (ИИ-распознавание и авто-категоризация)**:
   - Нажал кнопку `✨ Parse & Categorize with AI`:
     - Отображается плавный прогресс-бар анализа (`#lmBatchProgressWrap`);
     - ИИ (или локальный эвристический парсер при отсутствии сети) выделяет лексические единицы;
     - Автоматически классифицирует:
       - **Word**: отдельные слова, сложные существительные → направляются в *Слова урока* (`tab: 'words'`);
       - **Phrase**: устойчивые выражения, идиомы, глагольные фразы, фразеологизмы → направляются во *Фразы урока* (`tab: 'phrases'`);
     - Извлекает или генерирует русский перевод и контекстный пример на английском языке.
4. **Шаблон 2 (Approval Gate — Обязательное подтверждение перед добавлением)**:
   - После окончания анализа форма переключается в режим предварительного одобрения (`#lmBatchReviewWrap`):
     - Таблица со всеми распознанными кандидатами;
     - Чекбокс включения/исключения каждого элемента;
     - Селектор/бейдж категории с возможностью переключения (`Word` / `Phrase`);
     - Редактируемые инпуты термина, русского перевода и примера;
     - Индикаторы назначения: синий бейдж `Word → Words`, зеленый бейдж `Phrase → Phrases`;
     - Кнопка `← Edit Text` возвращает к исходному тексту для доработки;
     - Кнопка `✓ Approve & Add to Lesson` добавляет утвержденные элементы в структуру урока.
5. **Функция 2 (Интеграция в урок)**:
   - Нажал кнопку `✓ Approve & Add to Lesson`:
     - Одобренные слова добавляются в `lmState.blocks` (`tab: 'words'`, `type: 'wordcard'`);
     - Одобренные фразы добавляются в `lmState.blocks` (`tab: 'phrases'`, `type: 'phrase'`);
     - Пересчитываются счетчики урока (`counts.words`, `counts.phrases`);
     - Сохраняются изменения (`lmRenderEditor()`, `lmPersist()`, `lmSchedule()`);
     - Отображается информационный баннер об успешном добавлении с возможностью отмены (Undo).

---

## 3. Границы изменений и инварианты

1. **Изолированные файлы**:
   - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): добавление кнопки вкладки `#lmTabBtnBatch` и разметки `#lmTabPaneBatch`.
   - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): стилизация таблицы и контролов вкладки пакетов лексики через селекторы `.lm-batch-*`.
   - [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): регистрация вкладки в `lmSwitchImportTab` / `lmInitImportTabs`, обработка добавления слов и фраз в `lmState.blocks`.
   - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): логика парсинга, ИИ-извлечения и интерфейса предварительного одобрения.
   - `test/test-batch-words-import.mjs`: модульные и визуальные тесты функционала.
2. **Инварианты**:
   - Не изменять логику работы существующих 4 вкладок (`File / PDF`, `Web URL`, `Manual Script`, `Complement Current Lesson`).
   - Использовать существующие системные CSS-переменные проекта (`--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--acc-s`, `--ok`, `--bad`). Не писать хардкод-чисел цветов Sky в новых селекторах.
   - Никакие слова или фразы не добавляются в урок без прямого нажатия пользователем кнопки одобрения `✓ Approve & Add to Lesson`.

---

## 4. Контрольный чек-лист (Checklist)

- ⬜ **Этап 1: Добавление вкладки «📦 Batch Vocabulary» и контейнера формы в site/preview.html**
- ⬜ **Этап 2: Стилизация контейнера, таблицы предварительного просмотра и контролов в site/preview.css**
- ⬜ **Этап 3: Подключение переключения вкладки в client/52-lessons.js**
- ⬜ **Этап 4: Реализация логики парсинга, классификации на слова/фразы и этапа одобрения в client/52b-lesson-pdf-import.js**
- ⬜ **Этап 5: Реализация добавления одобренных элементов в tab: 'words' и tab: 'phrases' в lmState.blocks**
- ⬜ **Этап 6: Написание тестов в test/test-batch-words-import.mjs и сборка ассетов через npm run build:preview**
- ⬜ **Этап 7: Детерминированная проверка тестов, проверка правильности 2 раза и финальный отчет**

---

## 5. Метод верификации

```bash
node --test test/test-batch-words-import.mjs
npm run build:preview
```
