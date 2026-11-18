# План реализации визуального прогрессбара анализа текста песни (Reading the lyrics…)

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: визуализацию этапов анализа текста песни через прогрессбар на странице песни (`#songUser [data-lyric-check]`) и в статусах редактора, вспомогательные стили прогрессбара в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css), обновление состояния анализа в [`client/main/main-hooks.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js) / [`client/03f-songs.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03f-songs.js) и целевые тесты в `test/test-song-analysis-progressbar.mjs`.

---

## 1. Кадры интерфейса (Screenshots & Templates)

### Скриншот 1: Интерактивный прогрессбар анализа песни с управлением в теме Sky (`data-theme="sky"`)
![Скриншот 1: Интерактивный прогрессбар анализа песни с управлением в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-4-managed-sky.png)
*Скриншот 1: Отображение прогрессбара анализа песни с индикатором шага, кнопкой отмены «Cancel», процентами, треком прогресса и кнопкой «Details» в теме Sky.*

### Скриншот 2: Интерактивный прогрессбар в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 2: Интерактивный прогрессбар в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-5-managed-dark.png)
*Скриншот 2: Контрастное отображение карточки песни и управляемого прогрессбара в теме Dark с системными переменными.*

### Скриншот 3: Интерактивный прогрессбар в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Интерактивный прогрессбар в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-6-managed-sand.png)
*Скриншот 3: Отображение управляемого прогрессбара в светлой теме Sand.*

### Скриншот 4: Раскрытая панель детализации этапов анализа в теме Sky (`data-theme="sky"`)
![Скриншот 4: Раскрытая панель детализации этапов анализа в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-7-details-sky.png)
*Скриншот 4: Отображение аккордеона со списком 4 этапов анализа текста песни при клике на «Details ▴» в теме Sky.*

### Скриншот 5: Раскрытая панель детализации в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 5: Раскрытая панель детализации в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-8-details-dark.png)
*Скриншот 5: Контрастное отображение списка этапов анализа в теме Dark.*

### Скриншот 6: Раскрытая панель детализации в светлой теме Sand (`data-theme="sand"`)
![Скриншот 6: Раскрытая панель детализации в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-9-details-sand.png)
*Скриншот 6: Отображение списка этапов в теме Sand.*

### Скриншот 7: Состояние отмены анализа с кнопкой перезапуска в теме Sky (`data-theme="sky"`)
![Скриншот 7: Состояние отмены анализа с кнопкой перезапуска в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-10-cancelled-sky.png)
*Скриншот 7: Отображение карточки песни после нажатия кнопки «Cancel» со статусом «Analysis cancelled» и кнопкой «Retry analysis» в теме Sky.*

### Скриншот 8: Состояние отмены анализа в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 8: Состояние отмены анализа в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-11-cancelled-dark.png)
*Скриншот 8: Контрастное отображение отмененного состояния в теме Dark.*

### Скриншот 9: Состояние отмены анализа в светлой теме Sand (`data-theme="sand"`)
![Скриншот 9: Состояние отмены анализа в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-song-analysis-progressbar-screenshot-12-cancelled-sand.png)
*Скриншот 9: Отображение отмененного состояния в теме Sand.*

---

## 2. Анализ проблемы и предлагаемое решение

1. **Текущее поведение**:
   - При открытии песни, первичном импорте или нажатии «Check the words again» запускается функция `stageAnalyzeSong(song, status)`.
   - В процессе работы функция обновляет текстовый статус через `write(text, bad)` в элементе `[data-lyric-check]`:
     - `Reading the lyrics…`
     - `Reviewing expressions X of Y…`
     - `Looking up N new words…` / `Checked X of N new words…`
     - `Looking up phrase X of Y…`
     - `Checked the words. Added N expressions...`
   - Текущий вывод представляет собой простой плоский параграф текста без индикации движения процесса, возможности отмены или детализации шагов.
2. **Предлагаемое решение**:
   - Разработать интерактивный компонент прогрессбара `.song-analysis-box` с треком `.song-progress-track` и заполнением `.song-progress-fill`.
   - Внедрить трехзвенный каскадный ансамбль моделей (Словарь и spaCy -> Qwen 2.5 1.5B -> Google Gemini 2.0 Flash) с отбором кандидатов по максимальному показателю `overallScore`.
   - Добавить кнопку безопасной отмены `Cancel` с разрывом соединений через `AbortController` и переход в состояние `Analysis cancelled` с кнопкой `Retry analysis`.
   - Добавить раскрывающийся аккордеон `Details ▴` с отслеживанием статусов 4 шагов консенсуса (`Pending`, `In progress`, `Done`).
   - Использовать строго системные переменные темы (`--card`, `--line`, `--ink`, `--mute`, `--acc`, `--acc-s`, `--ok`, `--bad`).

---

## 3. Границы изменений и инварианты

1. **Изоляция изменений**:
   - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): добавление стилей `.song-analysis-box`, `.song-progress-track`, `.song-progress-fill`, анимации и состояний отмены;
   - [`client/main/main-hooks.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js) / [`client/03f-songs.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03f-songs.js): реализация управляемого каскада анализа, контроллера отмены `AbortController` и интерактивных кнопок `Cancel`, `Retry analysis`, `Details ▴`;
   - [`test/test-song-analysis-progressbar.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-song-analysis-progressbar.mjs): изолированные модульные и визуальные тесты прогрессбара, отмены и каскадного переключения;
   - Сборка производных ассетов через `npm run build:preview`.
2. **Инварианты**:
   - Полное сохранение существующей логики сохранения меток, фраз и карточек в библиотеку;
   - Корректная изоляция при смене учетных записей через `viewGen`;
   - Стабильная работа функций в среде `node:vm` без DOM.

---

## 4. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1: Добавление стилей управляемого прогрессбара и деталей в site/preview.css**
- 🟩 **Этап 2: Реализация управляемого каскада, отмены AbortController и раскрытия деталей в client/main/main-hooks.js и client/03f-songs.js**
- 🟩 **Этап 3: Создание автоматизированных тестов в test/test-song-analysis-progressbar.mjs**
- 🟩 **Этап 4: Сборка производных ассетов через npm run build:preview**
- 🟩 **Этап 5: Детерминированная верификация тестов и финальный коммит**

---

## 5. Метод верификации

```bash
node --test test/test-song-analysis-progressbar.mjs
npm run build:preview
```
