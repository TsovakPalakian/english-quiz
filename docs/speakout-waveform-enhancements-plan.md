# План доработки студийного аудиоплеера с формой волны, зумом, границами Loop и скоростями

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задача строго и изолированно затрагивает:
1. Контрастность и видимость формы волны осциллограммы на Canvas (включая несыгранную часть справа и адаптацию к темам) в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js).
2. Плавную синхронную подсветку воспроизведения волны в реальном времени без задержек в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js).
3. Отображение коэффициента зума непосредственно в кнопке управления зумом и скрытие/удаление отдельной плашки `🔍 Zoom: 1.0x` в [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html), [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css).
4. Скрытие маркеров границ `< A` и `B >`, если режим Loop выключен, и их отображение только при активном Loop в [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html), [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js) и [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css).
5. Расширение диапазона скоростей воспроизведения от `0.5x` до `3.0x` с шагом 0.25 (`[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]`) в [speakout/web/app.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/app.js).

Все остальные модули платформы (PDF-вьюер, Speech Studio, CMS, тесты) остаются незатронутыми.

---

### Исходные скриншоты проблемы и требований пользователя

#### Скриншот 1: Кнопка увеличения зума (исходный текст «+ (5x)»)
![Скриншот 1: Кнопка увеличения зума](user-zoom-in-button.png)

#### Скриншот 2: Отдельная верхняя плашка зума «🔍 Zoom: 1.0x» (подлежит удалению)
![Скриншот 2: Отдельная верхняя плашка зума](user-zoom-badge.png)

#### Скриншот 3: Границы диапазона зацикливания «< A» и «B >» (должны скрываться при выключенном Loop)
![Скриншот 3: Границы диапазона зацикливания](user-loop-handles.png)

#### Скриншот 4: Кнопка переключения скорости воспроизведения «1x»
![Скриншот 4: Кнопка переключения скорости](user-speed-pill.png)

---

### Утверждаемый Шаблон 1 в трех цветовых палитрах

#### Скриншот 5: Шаблон 1 в теме Sky (основная тема)
![Скриншот 5: Шаблон 1 в теме Sky](speakout-template-1-sky.png)

#### Скриншот 6: Шаблон 1 в теме Dark (проверка темной темы)
![Скриншот 6: Шаблон 1 в теме Dark](speakout-template-1-dark.png)

#### Скриншот 7: Шаблон 1 в теме Cream (проверка альтернативной светлой темы)
![Скриншот 7: Шаблон 1 в теме Cream](speakout-template-1-cream.png)

---

### Чек-лист реализации

| Статус | ID | Этап реализации |
| :---: | :---: | :--- |
| 🟩 | `WF-01` | **Шаблон 1**: Согласование макета панели плеера с контрастной волной, зумом в кнопке, скрытыми ручками Loop и рядом скоростей 0.5–3.0x |
| 🟩 | `WF-02` | **Функция 1 (Контрастность волны и синхронная подсветка)**: Адаптивный цвет несыгранных столбцов на Canvas и немедленный рендеринг при старте воспроизведения/timeupdate через `requestAnimationFrame` |
| 🟩 | `WF-03` | **Функция 2 (Индикатор зума в кнопке и удаление плашки)**: Удаление `#wf-zoom-badge` из шапки, обновление текста кнопки на `+ (1.0x)`...`+ (5.0x)` |
| 🟩 | `WF-04` | **Функция 3 (Скрытие маркеров Loop)**: Скрытие ручек `#waveform-trim-left` и `#waveform-trim-right` при `loopActive === false` и показ при `loopActive === true` |
| 🟩 | `WF-05` | **Функция 4 (Диапазон скоростей 0.5–3.0x)**: Массив скоростей `[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]`, циклический переключатель и обновление метки кнопки |
| 🟩 | `WF-06` | **Тестирование и сборка**: Обновление юнит- и интеграционных тестов в [speakout/tests/waveform_player.test.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/tests/waveform_player.test.js) и сборка продакшен-ассетов |
