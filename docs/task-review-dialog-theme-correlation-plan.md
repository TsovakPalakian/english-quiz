# План полной корреляции формы Review lesson draft с темами оформления (Theme Correlation)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно цветового оформления и корреляции со стилями активной темы для формы ревью черновика урока (`Review PDF lesson draft` / `.lm-pdf-draft`).
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Извлечение и парсинг структуры PDF (`lmPdfDraftBlocks`, `lmPdfIncomingBlocks`, `lmPdfBlockBudget`).
> - Структуру DOM и логику аккордеонов секций (`Basic information`, `Overview`, `Words`, `Phrases`, `Rules`, `Classwork`, `Homework`, `Lesson PDF`).
> - Логику работы кнопок шапки `.lm-pdf-quick-cancel` и `.lm-pdf-quick-apply`.
> - Логику работы кнопок подвала `cancel` и `apply`.
> - Логику сохранения уроков в D1/R2, квизы и авторизацию преподавателя.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Невидимость текста в теме Dark**:
   - В файле [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) в селекторе `.lm-pdf-draft` и его дочерних элементах использовались правила `color: var(--saas-text, #0f172a);` и `background: var(--saas-card, #ffffff);`.
   - Переменная `--saas-text` отсутствует в корневых определениях `:root` и `:root[data-theme="dark"]`, из-за чего значение цвета текста откатывалось к запасному почти черному цвету `#0f172a`.
   - На темно-синем фоне карточки `--card` (`#171B33`) в теме Dark черный текст сливался с фоном и становился неразличим.
   - Также присутствовали жестко закодированные значения `#ffffff`, `#f8fafc`, `#f0fdfa`, нарушающие гармонию тем оформления.

2. **Требование полной корреляции с общей темой**:
   - Все цвета элементов формы ревью черновика должны строиться исключительно на переменных активной темы:
     - Фон карточки диалога: `var(--card)`.
     - Основной текст и заголовки: `var(--ink)`.
     - Второстепенный текст, счетчики и подсказки: `var(--mute)`.
     - Границы элементов и разделители: `var(--line)`.
     - Фон аккордеонов в закрытом состоянии и фон полей ввода: `var(--bg)`.
     - Фон аккордеонов в открытом состоянии: `var(--card)`.
     - Акцентные кнопки применения: `var(--acc)` и `var(--on-acc)`.
     - Кнопки отмены: фон `var(--card)`, граница `var(--line)`, текст `var(--mute)` с переходом при наведении на `var(--bg)` и `var(--ink)`.
     - Информационные плашки: фон `var(--acc-s)`, граница `var(--line)`, текст `var(--ink)`.
   - Полное отсутствие жестко закодированных числовых hex-значений в правилах `.lm-pdf-draft`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): замена жестко закодированных цветов и неразрешенных переменных на системные переменные темы `--card`, `--ink`, `--mute`, `--line`, `--bg`, `--acc`, `--acc-s`, `--on-acc`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Все текстовые надписи читаемы с высокой контрастностью во всех темах без исключений.
  - Структура DOM, имена классов и логика обработчиков событий остаются неизменными.
  - Автоматические тесты сохраняют 100% прохождение.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование кадра формы Review lesson draft с полной корреляцией стилей тем Sky, Dark и Light.
- ⬜ **Этап 2**: Корректировка селекторов `.lm-pdf-draft` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) с привязкой к `--card`, `--ink`, `--mute`, `--line`, `--bg`, `--acc`, `--acc-s`, `--on-acc`.
- ⬜ **Этап 3**: Пересборка клиентских и производственных ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 4**: Прогон тестовых наборов `test/test-client-pdf-import.mjs`, `test/test-agreed-lesson-flow.mjs`, `test/test-lesson-pdf-ui.mjs`, `test/test-task-22-pdf-draft-flow-ui.mjs`.
- ⬜ **Этап 5**: Фиксация результатов и предоставление единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Форма Review lesson draft в теме Sky (цвета получены из переменных темы, текст четко виден):**
![Скриншот 1: Форма Review lesson draft в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-theme-correlated-screenshot-1-sky.png)

### Скриншот 2
**Форма Review lesson draft в теме Dark (полная контрастность, белый текст --ink на темном фоне --card, полная корреляция с темой):**
![Скриншот 2: Форма Review lesson draft в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-theme-correlated-screenshot-2-dark.png)

### Скриншот 3
**Форма Review lesson draft в теме Light (светлая тема, гармоничное соответствие переменным темы):**
![Скриншот 3: Форма Review lesson draft в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-theme-correlated-screenshot-3-light.png)
