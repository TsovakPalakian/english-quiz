# План: Очистка виджета произношения и автоматизация AI-проверки

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: виджет произношения (`.pronounce-widget`) в `client/main/material-upgrades.js` и сопутствующие тесты в `test/test-lesson-pronounce-and-autoexpand.mjs`.

---

## 1. Утвержденные кадры интерфейса

### Скриншот 1: Утвержденный шаблон карточки произношения в теме Sky (`data-theme="sky"`)
![Скриншот 1: Утвержденный шаблон карточки произношения в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-pronounce-screenshot-1-sky.png)

### Скриншот 2: Утвержденный шаблон карточки произношения в теме Dark (`data-theme="dark"`)
![Скриншот 2: Утвержденный шаблон карточки произношения в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-pronounce-screenshot-2-dark.png)

### Скриншот 3: Утвержденный шаблон карточки произношения в теме Sand (`data-theme="sand"`)
![Скриншот 3: Утвержденный шаблон карточки произношения в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-pronounce-screenshot-3-sand.png)

---

## 2. Чек-лист этапов реализации

- 🟩 **Этап 1: Удаление элементов разметки**
  - Удалить кнопку `Check with AI` (`data-pronounce-check`) из `renderPronunciationExerciseHtml` в `client/main/material-upgrades.js`.
  - Удалить ссылку `Microphone unavailable?` (`data-pronounce-fallback`) из `renderPronunciationExerciseHtml` в `client/main/material-upgrades.js`.
- 🟩 **Этап 2: Автоматизация AI-оценки при остановке записи**
  - Вызывать оценку произношения сразу в обработчике `recorder.onstop` в `client/main/material-upgrades.js`.
  - Удалить отдельный слушатель клика на `data-pronounce-check`.
  - Удалить слушатель клика на `data-pronounce-fallback`.
- 🟩 **Этап 3: Актуализация модульных и визуальных тестов**
  - Обновить `test/test-lesson-pronounce-and-autoexpand.mjs`: убедиться, что удалены `data-pronounce-check` и `data-pronounce-fallback`.
  - Проверить наличие автоматического вызова оценки в кодовой базе.
- 🟩 **Этап 4: Сборка бандла и тестирование**
  - Выполнить `npm run build:preview`.
  - Выполнить `node --test test/test-lesson-pronounce-and-autoexpand.mjs`.
