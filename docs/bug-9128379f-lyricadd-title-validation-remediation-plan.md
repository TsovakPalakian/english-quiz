# План устранения дефектов клиентской валидации на экране добавления песни (Bug ID: 9128379f4005cdbf356aeff1b7f39731, 1635b572126c53630777e204b4658d49, 86bdd5035805fbd788e620d342d05f49)

## Границы области видимости и изоляция изменений

> ### <span style="color: red; font-weight: bold;">WARNING</span>: Предупреждение о неприкосновенности стороннего функционала
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей задаче. Запрещено затрагивать серверную логику (`src/`), структуру базы данных, логику авторизации, карточки слов, квизы, уроки, экзамены, чат и смежные редакторы материалов.
> Изменения строго и изолированно затрагивают:
> 1. Клиентскую валидацию обязательных полей (`title`, `lyrics`) и формата аудиофайла (`file`) в функции `stageStoreSong` в [`client/main/main-hooks.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L592);
> 2. Атрибут `accept` файлового инпута в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1051) и проверку формата при выборе файла в [`client/03f-songs.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03f-songs.js#L1362);
> 3. Сборку клиентского бандла [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) через команду `npm run build:preview`;
> 4. Добавление изолированных модульных и визуальных тестов в [`test/test-lyricadd-validation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lyricadd-validation.mjs).
> Смежный функционал не затрагивается.

---

## 1. Точная формулировка проблемы (Problem Statement)

- **Код**:
  - [`client/main/main-hooks.js:592-620`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L592-L620) (`stageStoreSong`)
  - [`client/main/main-bridge.js:793-798`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L793-L798) (`uploadSongAudio`)
  - [`site/preview.html:1051`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L1051) (`accept="audio/*,video/*"`)
- **Стеки ошибок из журнала**:
  - **Bug ID 9128379f4005cdbf356aeff1b7f39731** (отсутствие `title`):
  ```
  Error: A title is required.
      at api (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:273:33)
      at async write (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:374:16)
      at async https://lumiscia.org/preview.js?v=a6acc6e66a2f10ab:33663:102
      at async Object.perform (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:462:7)
  ```
  - **Bug ID 1635b572126c53630777e204b4658d49** (отсутствие `lyrics`):
  ```
  Error: Title and content are required.
      at api (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:273:33)
      at async write (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:374:16)
      at async https://lumiscia.org/preview.js?v=a6acc6e66a2f10ab:33663:102
      at async Object.perform (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:462:7)
  ```
  - **Bug ID 86bdd5035805fbd788e620d342d05f49** (неподдерживаемый формат файла):
  ```
  Error: Select an MP3, WAV or OGG file.
      at Object.uploadSongAudio (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:796:71)
      at stageUploadSongFile (https://lumiscia.org/preview.js?v=a6acc6e66a2f10ab:33908:30)
      at https://lumiscia.org/preview.js?v=a6acc6e66a2f10ab:33667:28
      at async Object.perform (https://lumiscia.org/main-bridge.js?v=9f2e704af3f7a444:462:7)
  ```
- **Причина возникновения**:
  На экране добавления песни `lyricadd` в функции `stageStoreSong` отсутствует комплексная клиентская валидация перед вызовом `perform` и отправкой данных на сервер:
  1. Если название пустое, сервер возвращает HTTP 400 (`A title is required.`);
  2. Если название указано, но текст песни пуст, сервер возвращает HTTP 400 (`Title and content are required.`);
  3. Если выбран неподдерживаемый формат аудио/видео (что допускалось атрибутом `accept="audio/*,video/*"`), песня сохраняется на сервере, но последующий вызов `uploadSongAudio` выбрасывает исключение `Select an MP3, WAV or OGG file.`, которое перехватывается `perform` и регистрируется как ошибка клиента.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`client/main/main-hooks.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js): в `stageStoreSong` до вызова `perform` добавить:
    - Проверку `!existingId && !changes.title`: сообщение `"Write the song title."`, фокус на `#lyricTitle`;
    - Проверку `!String(changes.lyrics || '').trim()`: сообщение `"Paste the lyrics."`, фокус на `#lyricText`;
    - Проверку `file`: проверка типа и расширения файла (допустимы только MP3, WAV, OGG: `['audio/wav', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/x-wav', 'audio/wave']` или расширения `mp3`, `wav`, `ogg`), при нарушении сообщение `"Select an MP3, WAV or OGG file."`, без вызова `perform` и сохранения невалидной песни.
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): обновление `accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"` для `#lyricFile`.
  - [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): сборка через `npm run build:preview`.
  - [`test/test-lyricadd-validation.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lyricadd-validation.mjs): модульные и визуальные тесты на все 3 сценария валидации.

- **Инварианты**:
  - Полное сохранение контракта `stageStoreSong(existingId)`;
  - Сохранение корректного сохранения песен и загрузки валидных MP3, WAV и OGG файлов;
  - Исключение отправки некорректных запросов к `/api/library` и `/api/library/:id/media`.

---

## 3. Визуальные макеты / скриншоты (UI/UX Mockups)

### Скриншот 1
Демонстрация работы валидации при отсутствии названия песни: под кнопкой "Read the words" выводится сообщение `"Write the song title."` с красным выделением (`bad`), вверху страницы появляется уведомление Learning, фокус переводится в поле `Song title`.

![Скриншот 1 — Ошибка валидации названия песни](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/bug-9128379f-screenshot-1.png)

### Скриншот 2
Демонстрация работы валидации при отсутствии текста песни: под кнопкой "Read the words" выводится сообщение `"Paste the lyrics."` с красным выделением (`bad`), вверху страницы появляется уведомление Learning, фокус переводится в поле `Lyrics`.

![Скриншот 2 — Ошибка валидации текста песни](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/bug-9128379f-screenshot-2.png)

### Скриншот 3
Демонстрация работы валидации при выборе неподдерживаемого формата файла: под кнопкой "Read the words" выводится сообщение `"Select an MP3, WAV or OGG file."` с красным выделением (`bad`), вверху страницы появляется уведомление Learning.

![Скриншот 3 — Ошибка валидации формата файла](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/bug-9128379f-screenshot-3.png)

---

## 4. Контрольный список реализации (Checklist)

- 🟩 **Этап 1: Добавление комплексной клиентской валидации в `stageStoreSong` (`client/main/main-hooks.js`) и ограничение типов файлов (`site/preview.html`)**
  - Валидация названия: `!existingId && !changes.title` -> `"Write the song title."`
  - Валидация текста: `!String(changes.lyrics || '').trim()` -> `"Paste the lyrics."`
  - Валидация формата файла: `file` -> проверка допустимых MIME и расширений -> `"Select an MP3, WAV or OGG file."`
  - Сужение `accept` на `<input id="lyricFile">` и `<input data-lyric-file>` до `audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg`.
- 🟩 **Этап 2: Сборка клиентского бандла**
  - Запуск `npm run build:preview` для генерации актуального `preview.js`.
- 🟩 **Этап 3: Написание и выполнение целевых тестов**
  - Создание тестов в `test/test-lyricadd-validation.mjs` (юнит-тесты и Playwright визуальные тесты на все 3 случая).
  - Запуск `node --test test/test-lyricadd-validation.mjs` и существующих тестов `test/test-learning-main.mjs`.
- 🟩 **Этап 4: Финальная верификация и отчет**
  - Контроль чистоты рабочей копии `git status` и `git diff`.
  - Предоставление коммита в прошедшем времени на английском языке и списка тестовых файлов без расширений.

---

## 5. Детерминированный метод верификации (Verification Method)

1. Запуск целевых тестов: `node --test test/test-lyricadd-validation.mjs`.
2. Запуск регрессионных тестов: `node --test test/test-learning-main.mjs`.
3. Сборка производственных ассетов: `npm run build:preview`.
4. Проверка отсутствия нецелевых правок в `git diff`.
