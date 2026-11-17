# План устранения проблем контрастности в темной теме, дублирования заголовков и генерации осмысленных предложений по уровням CEFR

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к стилизации квизов True / False, устранению дублирования заголовка задачи и интеллектуальной генерации предложений по уровням. Запрещено затрагивать логику авторизации сессий, серверные обработчики воркеров, расписание групп, плеер аудио/видео или другие типы блоков урока. Все изменения строго и изолированно ограничены файлами:
> 1. [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css);
> 2. [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js);
> 3. [`production/material-quiz.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/material-quiz.js);
> 4. Сборка производных ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`;
> 5. Добавление изолированных модульных и визуальных тестов в [`test/test-quiz-dark-contrast-and-level-generation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-dark-contrast-and-level-generation.mjs).

---

### Скриншот 1: Исправленный живой кадр карточки True / False в теме Sky (`data-theme="sky"`)
![Скриншот 1: Исправленный живой кадр карточки True / False в теме Sky](task-quiz-dark-contrast-and-level-gap-screenshot-1-sky.png)

### Скриншот 2: Проверка карточки True / False в тёмной теме Dark (`data-theme="dark"`) с контрастным текстом
![Скриншот 2: Проверка карточки True / False в тёмной теме Dark с контрастным текстом](task-quiz-dark-contrast-and-level-gap-screenshot-2-dark.png)

### Скриншот 3: Карточка Gap с осмысленным предложением уровня B1/B2 вместо заглушки
![Скриншот 3: Карточка Gap с осмысленным предложением уровня B1/B2 вместо заглушки](task-quiz-dark-contrast-and-level-gap-screenshot-3-gap.png)

---

## 1. Точная формулировка проблем и анализ первопричины

1. **Невидимый текст в темных темах**:
   - В правилах `.lm-tf-statement` (L3554) и `.lm-tf-btn` (L3572) файла [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) цвет текста был задан через несуществующую переменную `var(--text, #1e293b)` и `var(--text, #334155)`. В темных темах это приводило к слиянию почти черного текста с темным фоном карточки.
2. **Дублирование заголовка задачи**:
   - В [`client/52-lessons.js#L1246`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1246) функция `lmPreviewBlock` принудительно выводила `<h3>${block.title}</h3>`, тогда как родительский контейнер задания `.lm-assignment` на строке 1327 уже выводил `<h3>Task N · ${leader.title}</h3>`.
3. **Бессмысленная формулировка утверждения True / False**:
   - Регулярное выражение нормализации в [`client/52-lessons.js#L1261-L1264`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1261-L1264) и [`production/material-quiz.js#L27-L28`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/material-quiz.js#L27-L28) преобразовывало `Say: "..."` во фразу `The word "..." correctly translates to Russian.` без указания перевода `as "..."`.
4. **Роботизированная заглушка в генерации Gap**:
   - В [`client/52-lessons.js#L3233`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3233) при отсутствии примера у слова подставлялась техническая строка `"We need to understand ___ in context."` вместо осмысленного предложения, адаптированного под CEFR-уровень урока.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - `site/preview.css`: замена `var(--text, ...)` на `var(--lm-ink, var(--ink))` и привязка к переменным темы (`--lm-soft`, `--acc-s`, `--ok-s`, `--bad-s`);
   - `client/52-lessons.js`: удаление избыточного внутреннего `<h3>` в карточке `True / false`, обогащение утверждения полным переводом и подстановка осмысленных контекстных предложений под CEFR-уровень урока (`A1`–`C1`) вместо шаблонной заглушки;
   - `production/material-quiz.js`: синхронизация утверждения True / false с полным переводом.
2. **Контракт интерфейса**:
   - Сохранение полной обратной совместимости API квизов, валидации кликов и подсчета баллов;
   - Pixel-perfect соответствие утвержденным кадрам в Sky, Dark и светлых темах.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Создание изолированных тестов в `test/test-quiz-dark-contrast-and-level-generation.mjs` для проверки контрастности стилей тем, отсутствия дублирования заголовка и генерации предложений по уровню.
- 🟩 **Этап 2**: Корректировка `site/preview.css` для обеспечения контрастности в темных темах и адаптивности состояний кнопок и фидбека.
- 🟩 **Этап 3**: Корректировка `client/52-lessons.js` и `production/material-quiz.js`: исключение внутреннего дублирующего `<h3>`, обогащение промпта True / False переводом и внедрение генератора предложений по уровням CEFR.
- 🟩 **Этап 4**: Сборка производных ассетов (`npm run build:preview` и `node ops/build-learning-production-assets.mjs`).
- 🟩 **Этап 5**: Прогон целевых тестов и фиксация верификации.
