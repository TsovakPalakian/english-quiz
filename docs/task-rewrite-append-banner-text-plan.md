# План обновления пояснительного текста активного урока в панели генерации

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно понятного и лаконичного пояснительного текста в синей плашке активного урока (`#lmAppendModeBadge`) вместо прежней технической формулировки.
> Заголовок активного урока сохраняется без изменений: `Active Lesson: <название> (<кол-во блоков> · <статус>)`.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Логику вычисления `hasExistingLesson` и синхронизацию названия и счетчика блоков урока `lmSyncLessonComplementTab`.
> - Логику генерации заданий `lmGenerateLessonFromScript` и `lmGenerateComplementTasks`.
> - Логику сохранения блоков в базу данных D1/R2.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Замена технического описания на понятное назначение**:
   - Прежний текст:
     `Append Mode Active: Materials generated in any tab will be safely added as new blocks. Existing blocks and metadata will never be overwritten.`
   - Новый лаконичный текст, четко объясняющий действие для преподавателя:
     `Generate additional exercises, vocabulary, and practice tasks to expand this lesson.`

2. **Сохранение заголовка активного урока**:
   - Строка `🛡️ Active Lesson: <title> (<count> blocks · <status>)` и бейдж `APPEND ONLY` сохраняются.

3. **Актуализация тестовых наборов**:
   - В файле [`test/test-lesson-complement-generation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-complement-generation.mjs#L99) проверка наличия текста в разметке обновляется под новую утвержденную формулировку.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): обновление текста в блоке `#lmAppendModeBadge`.
  - [`test/test-lesson-complement-generation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-complement-generation.mjs): актуализация текстовой проверки.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Название открытого урока и количество блоков подставляются динамически.
  - Плашка отображается при наличии у урока сохраненных блоков или заголовка.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование кадра с новым понятным пояснительным текстом в темах Sky, Dark и Light.
- ⬜ **Этап 2**: Обновление разметки блока `#lmAppendModeBadge` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- ⬜ **Этап 3**: Актуализация теста [`test/test-lesson-complement-generation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-complement-generation.mjs).
- ⬜ **Этап 4**: Пересборка клиентских и производственных ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 5**: Прогон целевых тестов.
- ⬜ **Этап 6**: Финализация задачи и предоставление единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Пояснительный текст активного урока в теме Sky:**
![Скриншот 1: Пояснительный текст в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-rewritten-banner-screenshot-1-sky.png)

### Скриншот 2
**Пояснительный текст активного урока в теме Dark (полная контрастность и гармония с темной темой):**
![Скриншот 2: Пояснительный текст в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-rewritten-banner-screenshot-2-dark.png)

### Скриншот 3
**Пояснительный текст активного урока в светлой теме Light:**
![Скриншот 3: Пояснительный текст в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-rewritten-banner-screenshot-3-light.png)
