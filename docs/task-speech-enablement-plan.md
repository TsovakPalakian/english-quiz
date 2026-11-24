# План реализации: Включение Speech для студентов и учителей (Интерактивные макеты состояний Функции 1)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СМЕЖНОГО ФУНКЦИОНАЛА:**
> Выполняемая задача строго и изолированно затрагивает:
> 1. Состояния и макет студии Speech:
>    - Состояние 1 (Ожидание записи): переключатель `[ 🎙️ Record | 📁 Upload ]` с активной вкладкой `Record`, таймер `⏱ 00:00 / 01:00`, центрированная кнопка `Record speech`. Окно загрузки файла строго скрыто (`display: none !important`).
>    - Состояние 2 (Активная запись с микрофона): кнопка меняется на `[ ⏹️ Stop recording ]`, таймер отсчитывает время (`⏱ 00:07 / 01:00`).
>    - Состояние 3 (Режим Upload): активна вкладка `Upload`, кнопка `Record speech` скрыта, открыта компактная строка загрузки файла с кнопкой `Browse file`.
> 2. Строгое выравнивание сетки в блоке серверных записей:
>    - Колонка 1 (140px): название слота и метаданные.
>    - Колонка 2 (1fr): полоса воспроизведения и таймкод плеера с идентичной шириной и общим началом.
>    - Колонка 3 (68px): кнопки действий `Active` и `Use this` строго одинаковой ширины (68px) и высоты (24px).
>    - Колонка 4 (28px): кнопка удаления `🗑️` фиксированного размера (28×24px).
> 3. Размещение вкладки `Speech` в панели инструментов занятия строго после `Homework` и перед `Lesson PDF`.
> 4. Полное удаление избыточной кнопки `Discard`.
> 5. Серверное хранение аудиозаписей (до 3 записей по кольцевому буферу FIFO) с автовыбором последней записи.
> 6. Компактную кнопку-переключатель согласия `AI Speech Evaluation` со статусами `Enabled` / `Disabled`.
>
> Строго запрещено затрагивать и модифицировать:
> - Существующие вкладки урока (`Overview`, `Words`, `Phrases`, `Rules`, `Classwork`, `Homework`, `Lesson PDF`).
> - Модули экзаменов (`Exams`), режим фокуса (`Focus Mode`), словарные карточки (`Cards / Study`) и браузерный синтез речи (`SpeechSynthesis`).
> - Серверную логику анализа произношения и независимого AI-ревью.

---

## Чеклист реализации

- 🟩 **Шаблон 1. Шаблон студии Speech с соосными вкладками Record/Upload и кнопкой Record speech снизу**
  - Утвержден пользователем (`одо`).
- 🟩 **Функция 1. Переключение режимов Record/Upload, запись с таймером и кольцевой буфер FIFO на сервере (до 3 записей)**
  - Утвержден пользователем (`app`).
- 🟩 **Функция 2. Включение вкладки Speech в панели инструментов занятия для ролей USER и ADMIN после Homework**
  - Реализовано и верифицировано в кодовой базе (`lmTab` и `lmChromeHtml`).
- 🟩 **Функция 3. Компактный переключатель согласия AI Speech Evaluation и запуск анализа аудио**
  - Реализовано и верифицировано с поддержкой статусов `Enabled`/`Disabled` и обратной совместимостью формы.
- 🟩 **Стилизация в темах sky, dark, sand с системными CSS-переменными без жестких значений цвета**
  - Стилизовано с использованием переменных `--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`.
- 🟩 **Модульное и визуальное тестирование согласованного функционала**
  - Таргетированные тесты пройдены (`test-learning-workbench-ui` — 58 passed, `test-speech-practice-ui-visual` — 1 passed). Сборка локальных продакшн-ассетов выполнена успешно.

---

## Кадры состояний и макетов

### Скриншот 1. Макет в режиме ожидания записи (Record Idle) в теме Sky (`data-theme="sky"`)
![Скриншот 1. Макет ожидания записи в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-mockup-record-idle-sky.png)
*Скриншот 1. Исходное состояние: вкладка «Record» активна, таймер «00:00 / 01:00» справа. Ниже кнопка «Record speech». Окно загрузки файла строго скрыто. Список серверных записей выстроен по 4 колонкам.*

### Скриншот 2. Макет во время активной записи звука (Recording Active) в теме Sky (`data-theme="sky"`)
![Скриншот 2. Макет активной записи в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-mockup-recording-active-sky.png)
*Скриншот 2. Состояние записи: кнопка переключена на «Stop recording» с акцентной индикацией остановки, таймер ведет отсчет времени («00:07 / 01:00»).*

### Скриншот 3. Макет в режиме загрузки файла (Upload Mode) в теме Sky (`data-theme="sky"`)
![Скриншот 3. Макет режима Upload в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-upload-mode-sky.png)
*Скриншот 3. Режим Upload: вкладка «Upload» активна, кнопка «Record speech» скрыта, таймер заменен на бейдж лимита размера файла «Max file size: 10 MiB», отображается компактная строка выбора файла с кнопкой «Browse file».*

### Скриншот 4. Макет в режиме загрузки с выбранным аудиофайлом (File Selected) в теме Sky (`data-theme="sky"`)
![Скриншот 4. Макет в режиме Upload с выбранным файлом](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-upload-selected-sky.png)
*Скриншот 4. Выбранный файл отображается с именем, размером («128 KiB») и кнопками «Change file» и «Save to server».*

### Скриншот 5. Макет в режиме загрузки файла в светлой теме Sand (`data-theme="sand"`)
![Скриншот 5. Макет режима Upload в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-upload-mode-sand.png)
*Скриншот 5. Проверка режима Upload в светлой теме Sand.*

### Скриншот 6. Макет в режиме загрузки файла в темной теме Dark (`data-theme="dark"`)
![Скриншот 6. Макет режима Upload в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-upload-mode-dark.png)
*Скриншот 6. Проверка режима Upload в темной теме Dark.*

### Скриншот 7. Размещение кнопки Speech в панели инструментов занятия в теме Sky (`data-theme="sky"`)
![Скриншот 7. Размещение кнопки Speech в панели инструментов занятия в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-toolbar-focus-sky.png)
*Скриншот 7. Размещение вкладки Speech строго после Homework и перед Lesson PDF в панели инструментов занятия (Classwork → Homework → Speech → Lesson PDF) для ролей USER и ADMIN.*

### Скриншот 8. Размещение кнопки Speech в панели инструментов занятия в теме Sand (`data-theme="sand"`)
![Скриншот 8. Размещение кнопки Speech в панели инструментов занятия в теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-toolbar-focus-sand.png)
*Скриншот 8. Проверка размещения вкладки Speech в светлой теме Sand.*

### Скриншот 9. Размещение кнопки Speech в панели инструментов занятия в теме Dark (`data-theme="dark"`)
![Скриншот 9. Размещение кнопки Speech в панели инструментов занятия в теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-toolbar-focus-dark.png)
*Скриншот 9. Проверка размещения вкладки Speech в темной теме Dark.*
