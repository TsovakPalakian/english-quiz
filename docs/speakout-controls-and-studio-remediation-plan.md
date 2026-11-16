# План выравнивания управления, устранения неполадок речевой студии и скрытия кнопки сохранения ответов

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задача строго и изолированно затрагивает:
1. Выравнивание элементов управления в верхней панели [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L63-L88) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L358-L450).
2. Размещение и удобное управление дорожками аудио в плеере [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L101-L177) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L493-L600).
3. Работу речевой студии Speech Studio, доступность распознавания речи в онлайн-режиме, контрастность цветов в светлой теме и элементы запуска записи в окне [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L370-L750), [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L224-L260) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L870-L1030).
4. Скрытие неактуальной кнопки Save answers на странице урока при показе интерактивной студии в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L143-L153).

Весь остальной функционал платформы остается неизменным.

---

### Скриншот 1: Расположение аудиотреков и кнопки Save answers на странице урока
![Скриншот 1: Расположение аудиотреков и кнопки Save answers на странице урока](docs/user-audio-toolbar-save-answers.png)

---

### Скриншот 2: Окно речевой студии с блокировкой распознавания речи и нарушением контрастности
![Скриншот 2: Окно речевой студии с блокировкой распознавания речи и нарушением контрастности](docs/user-speech-studio-issue.jpg)

---

### Скриншот 3: Шаблон 1 в теме Sky (Выровненная верхняя панель управления и размещение дорожек аудио)
![Скриншот 3: Шаблон 1 в теме Sky (Выровненная верхняя панель управления и размещение дорожек аудио)](docs/speakout-template-1-sky.png)

---

### Скриншот 4: Шаблон 1 в теме Dark (Проверка темной палитры)
![Скриншот 4: Шаблон 1 в теме Dark (Проверка темной палитры)](docs/speakout-template-1-dark.png)

---

### Скриншот 5: Шаблон 1 в теме Cream (Проверка альтернативной светлой темы)
![Скриншот 5: Шаблон 1 в теме Cream (Проверка альтернативной светлой темы)](docs/speakout-template-1-cream.png)

---

## 1. Точные причины выявленных проблем

1. **Кнопка «Save answers»**: В [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L143) кнопка `#seAnswers` рассчитывалась по условию `!doc.blocks.some(...)`. При открытии интерактивной студии Speakout Studio учебник отображается внутри фрейма, поэтому отдельные поля ввода CMS на странице отсутствуют. Кнопка `Save answers` под фреймом вводит пользователя в заблуждение, не имеет отношения к учебнику и должна быть скрыта при активном режиме `isA1Unit1 && !editing`.
2. **Неработающее окно речевой студии (Скриншот 2)**:
   - В [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L370-L372) метод `isOfflineSpeechEngineActive` возвращает `Boolean(window.__OFFLINE_SPEECH_ENGINE__ && !navigator.onLine)`. В стандартном браузере `navigator.onLine === true`, поэтому проверка всегда дает `false`. Это полностью блокирует вызов `startSpeechRecognition()` в строке 729 и выводит заглушку `Offline Engine Required: Text verification active only when speech recognizer runs locally without network`.
   - В [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L906) заголовок студии имеет фиксированный цвет `#f1f5f9`. В теме Sky фон карточки белый (`var(--card)`), из-за чего белый текст заголовка оказывается нечитаемым.
   - Кнопка закрытия `&times;` прижата вплотную к тексту статуса без отступа.
   - В окне студии отсутствует собственная кнопка включения и остановки записи: кнопка `🎙 Speech Record` находится на панели позади затемняющего оверлея, что делает управление записью недоступным внутри модального окна.
   - Поле `Target Model Phrase` отображает техническое название задания (`"Lesson 1A Exercise 1A & 1B"`), полученное из заголовка аудиофайла манифеста, вместо фразы для произношения.
3. **Управление аудиофайлами и выравнивание верхней панели**:
   - В верхней панели [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L63-L88) кнопки навигации страниц, поле ввода номера страницы, бейдж документа и кнопки зума имеют разнородные отступы, высоты и выравнивание базовой линии.
   - Выбор аудиотреков отделен от чтения страницы и расположен в нижнем доке, что создает разрыв внимания при работе с упражнениями в верхней части разворота.

---

## 2. Чек-лист реализации

- ⬜ **Этап 1 (Шаблон 1)**: Выравнивание элементов управления в верхней панели [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L358-L450) и гармонизация блока дорожек аудио.
- ⬜ **Этап 2 (Шаблон 2)**: Исправление речевой студии Speech Studio в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css): активация распознавания речи в онлайн-режиме, добавление кнопки записи внутри карточки, исправление контрастности цветов в теме Sky.
- ⬜ **Этап 3 (Шаблон 3)**: Скрытие кнопки `#seAnswers` («Save answers») при отображении интерактивной студии в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L143).
- ⬜ **Этап 4**: Сборка продакшен-ассетов через `node ops/build-learning-production-assets.mjs` и прогон тестов `node --test test/test-speakout-viewer.mjs speakout/tests/lesson1a_ui.test.js speakout/tests/navigation_integration.test.js` и `node --test --test-name-pattern ui-boot test/test-ui-boot.mjs`.
