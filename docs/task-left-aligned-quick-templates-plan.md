# План выравнивания быстрых шаблонов по левому краю над полем ввода

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается исключительно выравнивания блока быстрых шаблонов (`.lm-quick-templates`: `Quick templates: + Grammar Rule + Vocabulary List + Dialogue / Text`) по левому краю над текстовым полем сценария `#lmScriptInput`.
> Запрещено затрагивать, модифицировать или ломать смежный функционал:
> - Обработчики кликов по кнопкам шаблонов `data-template` и подстановку текста в поле.
> - Работу кнопки генерации `#lmGenerateFromScriptBtn` и валидацию `syncScriptBtn`.
> - Логику вкладок `File / PDF`, `Web URL`, `Complement Current Lesson`.

---

## 1. Точная формулировка задачи (Problem Statement)

1. **Выравнивание по левому краю**:
   - В файле [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L754) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) контейнер блока быстрых шаблонов получает выравнивание `justify-content: flex-start;`.
   - Элементы `Quick templates:`, `+ Grammar Rule`, `+ Vocabulary List`, `+ Dialogue / Text` начинаются непосредственно от левой границы текстовой области, обеспечивая естественное чтение слева направо.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): установка выравнивания по левому краю для строки шаблонов.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка клиентских ассетов (`npm run build:preview`).

- **Инварианты**:
  - Кнопки шаблонов сохраняют свои стили, отступы и атрибуты `data-template`.
  - Клик по кнопке вставляет соответствующий образец текста в `#lmScriptInput`.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟨 **Этап 1**: Согласование кадра с левым выравниванием быстрых шаблонов в темах Sky, Dark и Light.
- ⬜ **Этап 2**: Обновление разметки строки шаблонов в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).
- ⬜ **Этап 3**: Пересборка клиентских и производственных ассетов через `npm run build:preview` и `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 4**: Прогон целевых тестов.
- ⬜ **Этап 5**: Финализация задачи и предоставление единого обобщенного коммита.

---

## 4. Визуальные кадры интерфейса (Screenshots & Mockups)

### Скриншот 1
**Быстрые шаблоны по левому краю над полем ввода в теме Sky:**
![Скриншот 1: Шаблоны по левому краю в теме Sky](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-left-templates-screenshot-1-sky.png)

### Скриншот 2
**Быстрые шаблоны по левому краю над полем ввода в теме Dark (полная контрастность и читаемость):**
![Скриншот 2: Шаблоны по левому краю в теме Dark](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-left-templates-screenshot-2-dark.png)

### Скриншот 3
**Быстрые шаблоны по левому краю над полем ввода в светлой теме Light:**
![Скриншот 3: Шаблоны по левому краю в теме Light](/Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-left-templates-screenshot-3-light.png)
