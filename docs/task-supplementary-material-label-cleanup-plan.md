# План реализации: Удаление русскоязычного текста и точки из бейджа Supplementary Material

> [!WARNING]
> **Блок изоляции области видимости и защиты смежного функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы в рамках текстовой метки разделителя в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) и соответствующих проверок в [`test/test-lesson-complement-generation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-complement-generation.mjs). Если случайно или по технической необходимости потребуется затронуть смежные части, об этом обязательно требуется заранее уведомить пользователя в чате текстом: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

---

## 1. Точная постановка проблемы и ссылки на исходный код

1. **Наличие русскоязычного текста и разделительной точки в бейдже разделителя**:
   - В [`client/52-lessons.js#L3748-L3757`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3748-L3757) при автоматическом добавлении разделителя в функции `lmEnsureWordsInLesson()` вставлялась метка `label: "✨ Supplementary Material · Дополнительные материалы (Generated)"`.
   - В [`client/52-lessons.js#L1444-L1446`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1444-L1446) в рендерере редактора блока `renderSingleBlock()` в качестве значения по умолчанию использовалась строка `'✨ Supplementary Material · Дополнительные материалы'`.
   - В [`client/52-lessons.js#L1552`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1552) в рендерере предпросмотра `lmPreviewBlock()` в качестве значения по умолчанию использовалась строка `"✨ Supplementary Material · Дополнительные материалы"`.
2. **Требование**:
   - Убрать русскоязычный текст `Дополнительные материалы` и символ точки-разделителя (`·`).
   - Итоговый текст сгенерированного разделителя: `✨ Supplementary Material (Generated)`.
   - Итоговый базовый текст разделителя: `✨ Supplementary Material`.
   - Добавить автоматическую нормализацию для безопасного удаления русского суффикса и точки при отображении ранее сохраненных уроков.

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Живой экран урока с разделителем в теме Sky (`data-theme="sky"`)
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-supplementary-material-sky.png)
*Скриншот 1: Реальный экран материалов урока во вкладке «Words · 6» в теме Sky: отображение разделителя «✨ Supplementary Material (Generated)» без русского текста и точки.*

---

### Скриншот 2: Проверка экрана в темной теме (`data-theme="dark"`)
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-supplementary-material-dark.png)
*Скриншот 2: Контрастное отображение реального экрана материалов урока и разделителя без русскоязычного текста в теме Dark.*

---

### Скриншот 3: Проверка экрана в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-supplementary-material-sand.png)
*Скриншот 3: Отображение реального экрана материалов урока и бейджа разделителя в альтернативной светлой теме Sand.*

---

## 3. Этапы и контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Создание плана и документации задачи с прикреплением утвержденных скриншотов.
- 🟩 **Этап 2**: Обновление метки разделителя в `client/52-lessons.js` (`lmEnsureWordsInLesson`, `renderSingleBlock`, `lmPreviewBlock`) с поддержкой обратной совместимости через регулярное выражение.
- 🟩 **Этап 3**: Сборка клиентских скриптов командой `npm run build:preview`.
- 🟩 **Этап 4**: Добавление и актуализация модульных и визуальных тестов в `test/test-lesson-complement-generation.mjs`.
- 🟩 **Этап 5**: Прогон тестов и итоговая верификация.
