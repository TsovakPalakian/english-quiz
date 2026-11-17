# План реализации: Навигация, изолированное аудио и кнопка записи в Speech Verification Studio

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задача строго и изолированно затрагивает:
1. Добавление навигации между упражнениями/треками урока (`◀ Prev`, переключатели треков, `Next ▶`, счетчик) и кнопки возврата `◀ Back` в модальном окне Speech Verification Studio в [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L259-L352) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css#L1550-L1650).
2. Выделение изолированного аудиоуправления студии (`studioAudioPlayer`), чтобы воспроизведение эталона `Teacher Audio` не затрагивало и не запускало плеер книги на главной странице урока в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L1725-L1735).
3. Добавление кнопки записи голоса пользователя `🎙️ Record` непосредственно в карточку `My Recording (Student Voice)` в [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L309-L320), [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css) и [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js).
4. Проверочные тесты в [speakout/tests/navigation_integration.test.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/tests/navigation_integration.test.js).

Весь остальной функционал платформы остается неизменным.

---

### Скриншот 1: Шаблон Speech Verification Studio с панелью навигации по упражнениям, кнопкой Back и кнопкой записи Record в теме Sky (`data-theme="sky"`)
![Скриншот 1: Шаблон Speech Verification Studio с панелью навигации и кнопкой записи в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/screenshot-speech-studio-nav-1-sky.png)

---

### Скриншот 2: Шаблон Speech Verification Studio в темной теме Dark (`data-theme="dark"`)
![Скриншот 2: Шаблон Speech Verification Studio в темной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/screenshot-speech-studio-nav-2-dark.png)

---

### Скриншот 3: Шаблон Speech Verification Studio в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Шаблон Speech Verification Studio в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/screenshot-speech-studio-nav-3-sand.png)

---

### Скриншот 4: Шаблон Speech Verification Studio в теме Aegean (`data-theme="aegean"`)
![Скриншот 4: Шаблон Speech Verification Studio в теме Aegean](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/screenshot-speech-studio-nav-4-aegean.png)

---

## 1. Точные причины выявленных проблем

1. **Запуск плеера главной страницы вместо локального воспроизведения**: В [speakout/web/app.js#L1725-L1734](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js#L1725-L1734) обработчик `btnPlayModelSample` вызывал `DOM.audioPlayer.play()`, который управляет основным аудиоплеером книги в нижнем доке страницы. В результате запуск образца учителя в модальном окне переключал глобальный плеер и изменял состояние основной страницы. Требуется выделение локального экземпляра плеера студии (`new Audio()` либо `<audio id="studio-audio-player">`), полностью изолированного от страницы книги.
2. **Отсутствие кнопки записи внутри модального окна**: В блоке [speakout/web/index.html#L309-L335](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L309-L335) присутствовали только таймер и кнопка воспроизведения `▶ Play`. Кнопка записи находилась на внешней панели книги за затемняющим оверлеем. В карточку `My Recording` добавляется прямая кнопка `🎙️ Record` (переключающаяся в `⏹️ Stop` во время записи).
3. **Отсутствие навигации между упражнениями в окне студии**: В [speakout/web/index.html#L260-L352](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html#L260-L352) отсутствовали кнопки переключения треков урока (`1.01`, `1.02`, `1.03`, `VB1.01`) и кнопки шага `◀ Prev` / `Next ▶`.

---

## 2. Чек-лист реализации

- 🟩 **Этап 1 (Шаблон 1)**: Шаблон модального окна Speech Verification Studio с панелью навигации по упражнениям, кнопкой возврата `◀ Back`, кнопкой записи `🎙️ Record` и изолированным плеером `Teacher Audio`.
- 🟩 **Этап 2 (Функция 1)**: Изоляция аудиоуправления студии от глобального плеера книги (`DOM.audioPlayer`) и обработка кнопки записи `🎙️ Record` внутри окна студии.
- 🟩 **Этап 3 (Функция 2)**: Реализация логики переключения треков урока (`1.01`, `1.02`, `1.03`, `VB1.01`) и кнопок шага `◀ Prev` / `Next ▶` внутри студии.
- 🟩 **Этап 4**: Сборка продакшен-ассетов через `node ops/build-learning-production-assets.mjs` и верификация тестами `node --test speakout/tests/navigation_integration.test.js` и `node --test test/test-speakout-viewer.mjs`.
