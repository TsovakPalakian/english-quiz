# Комплексный аудит и план исправления компонента Voice Mode (AI Tutor & Oral Examiner)

## 1. Точная формулировка выявленных дефектов и ссылки на исходный код

В ходе пошагового аудита исходного кода и тестирования в среде Chromium/Playwright выявлено 7 конкретных дефектов:

1. **Неактивная статическая плашка (Orphan UI)** в [site/preview.html#L801-L808](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L801-L808):
   Блок `.lm-voice-mode-bar` содержит текст `Voice Mode in Antigravity (AI Tutor & Oral Examiner)` и иконку микрофона, однако является пассивным тегом `<div>`. В разметке отсутствуют тег `<button>`, атрибут `role="button"`, класс `cursor: pointer` и обработчик события клика. Клик пользователя по данной плашке не производит никакого действия.

2. **Зависание воспроизведения синтеза речи и сборка мусора V8 (Chromium SpeechSynthesis GC Bug)** в [client/52c-focus-player.js#L393-L407](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L393-L407):
   Экземпляр `SpeechSynthesisUtterance` объявляется локально переменной `const utterance`. Сборщик мусора движка V8 удаляет объект до завершения воспроизведения аудио, из-за чего обработчик `utterance.onend` не вызывается. Статус `#lmVoiceStatus` безвозвратно блокируется в значении `AI Speaking...`, препятствуя дальнейшей записи с микрофона.

3. **Блокировка автовоспроизведения в браузере Safari** в [client/52c-focus-player.js#L437-L442](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L437-L442):
   Функция `voiceSpeakText` запускается внутри `setTimeout` с задержкой 400 мс. По правилам WebKit вызов `window.speechSynthesis.speak()` теряет контекст активации пользователем (`transient user activation`), что приводит к молчаливому отклонению аудиопотока браузером.

4. **Гонка отмены синтеза речи (Cancellation Race Condition)** в [client/52c-focus-player.js#L396](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L396):
   Синхронный вызов `voiceSynthesis.cancel()` непосредственно перед `voiceSynthesis.speak(utterance)` отменяет очередь воспроизведения в WebKit и Gecko.

5. **Блокирующее окно `prompt()` при отсутствии API распознавания** в [client/52c-focus-player.js#L521-L523](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L521-L523):
   При отсутствии объекта `SpeechRecognition` в браузере вызывается синхронный нативный метод `window.prompt()`, блокирующий интерфейс и нарушающий регламент доступности.

6. **Сбой повторного запуска распознавания (InvalidStateError)** в [client/52c-focus-player.js#L515-L519](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L515-L519):
   При повторном клике по кнопке `#lmVoiceMicBtn` после завершения или ошибки вызов `.start()` выбрасывает исключение `InvalidStateError`, перехватывается блоком `catch` и вызывает `.stop()` без пересоздания экземпляра сессии распознавания.

7. **Полное отсутствие логики Oral Examiner и контекста урока** в [client/52c-focus-player.js#L409-L426](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js#L409-L426):
   Функция `voiceGenerateReply` содержит пять жестких текстовых сопоставлений (`hello`, `word`, `rule`, `check`). Режим экзаменатора с вопросами по материалу урока, выставлением оценки и фиксацией результата в модуле не реализован. Неактивен элемент таймера `#lmVoiceTimer` в [site/preview.html#L930](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L930).

---

## 2. Прикрепленные скриншоты интерфейса

### Скриншот 1: Интерактивная плашка Voice Mode в блоке Frame 1
![Скриншот 1: Интерактивная плашка Voice Mode в блоке Frame 1](task-voice-mode-screenshot-1-bar-interactive.png)
*Скриншот 1: Интерактивная плашка «Voice Mode in Antigravity (AI Tutor & Oral Examiner)» в Frame 1 с кнопкой-бейджем «Open AI Tutor» и поддержкой клика и клавиши Enter.*

### Скриншот 2: Диалоговое окно Voice Mode с историей реплик и контролами
![Скриншот 2: Диалоговое окно Voice Mode с историей реплик и контролами](task-voice-mode-screenshot-2-modal-dialog.png)
*Скриншот 2: Модальное окно Voice Mode с дисклеймером, полем текстового ввода, кнопками Send и Speak.*

### Скриншот 3: Ошибка тройного дублирования реплики пользователя и шаблонного ответа ИИ
![Скриншот 3: Ошибка тройного дублирования реплики пользователя и шаблонного ответа ИИ](task-voice-mode-screenshot-3-duplicate-recognition-bug.png)
*Скриншот 3: Зафиксированный пользователем баг — реплика «How are you» отправляется трижды подряд без паузы из-за множественных событий onresult, и ИИ отвечает одинаковой стандартной фразой.*

---

## 3. Границы области действия и изоляция (Scope Boundaries & Invariants)

> [!IMPORTANT]
> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать или модифицировать смежный функционал редактора уроков (Frame 1 Import Tabs, Frame 2 Basic Info, блоки контента `#lmBlocks`, генератор заданий, верификацию учителем `Verified by Teacher`). Изменения вносятся строго изолированно в контроллер голосового режима [client/52c-focus-player.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52c-focus-player.js) и связующую разметку модального окна и плашки в [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).

---

## 4. Детерминированный метод верификации

1. Сборка предпросмотра: `npm run build:preview`.
2. Запуск визуальных и компонентных тестов: `node --test test/test-lesson-visual-components.mjs test/test-mastery-score-and-teacher-verification.mjs`.
3. Создание и запуск целевого браузерного интеграционного теста `test/test-voice-mode-tutor-examiner.mjs` в среде Chromium с проверкой:
   - Открытия модального окна кликом по плашке `.lm-voice-mode-bar`.
   - Защиты от дублирования сообщений (дедупликация и пауза перед отправкой).
   - Разнообразных диалоговых ответов AI Tutor на «How are you», приветствия, правила и лексику.
   - Корректной смены статусов синтезатора речи без зависания `AI Speaking...`.
   - Работы экзаменатора `Speaking Examiner` с вопросами по лексике текущего урока.

---

## 5. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Проведение глубокого аудита кода, фиксация точек отказа и захват скриншотов текущего интерфейса
- 🟩 **Этап 2**: Согласование плана и получение прямого разрешения пользователя со словом `do`
- 🟩 **Этап 3**: Превращение плашки `.lm-voice-mode-bar` в кликабельный интерактивный элемент открытия Voice Mode
- 🟩 **Этап 4**: Устранение бага сборщика мусора Chromium (сохранение глобальной ссылки на `utterance`) и сброса статуса
- 🟩 **Этап 5**: Корректная обработка жизненного цикла `SpeechRecognition` с перезапуском сессии при повторном клике Speak
- 🟩 **Этап 6**: Интеграция сценариев Oral Examiner с вопросами по словам и правилам текущего урока
- 🟩 **Этап 7**: Написание модульного и визуального теста `test/test-voice-mode-tutor-examiner.mjs` и сборка бандла
- 🟩 **Этап 8**: Согласование плана устранения дублирования распознавания, расширения диалоговых ответов и переименования режима
- 🟩 **Этап 9**: Внедрение дебаунса/дедупликации `SpeechRecognition`, остановка сессии после распознавания реплики и защита от повторной отправки
- 🟩 **Этап 10**: Интеллектуальный генератор диалоговых реплик AI Tutor (приветствия, смол-ток, вопросы, развернутые ответы вместо шаблона)
- 🟩 **Этап 11**: Переименование термина `Oral Examiner` в `Speaking Examiner` во всех интерфейсных текстах и кнопках
- 🟩 **Этап 12**: Обновление тестов `test/test-voice-mode-tutor-examiner.mjs`, сборка ассетов и верификация
