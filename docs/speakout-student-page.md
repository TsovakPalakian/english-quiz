# Страница урока Speakout

После входа просмотрщик PDF отдается, и страница ученика показывает студию. Сложенные блоки редактора открываются кнопкой Editor.

Без сессии просмотрщик отвечает 401.

В студии нет колонки со списком уроков. Урок выбирается на каталоге. Другой урок открывается возвратом через Platform. Книга занимает всю ширину.

Кнопка 1B Two jobs открывает студию на странице 10 учебника. На полосе дорожки 1.04, 1.0X, VB1.02 и VB1.03. Кнопка 1C Checking in открывает студию на странице 12. На полосе дорожки 1.05, 1.06, 1.07 и 1.08. На обеих страницах есть Keys и Speech Record.

Ключ 1A остается на страницах 2–3. Ключ 1B, 1C и 1D открывает страницы 4–5: в файле ключа 1B начинается после страницы 3, а 1D стоит внизу страницы 4 и на странице 5. Отдельный разворот ключа для 1C в описании курса не записан.

Восемь дорожек 1B и 1C в списке загруженных файлов бакета нет. Кнопки запрашивают `speakout/a1/unit1/audio/1_04.mp3`, `1_0x.mp3`, `vb1_02.mp3`, `vb1_03.mp3`, `1_05.mp3`, `1_06.mp3`, `1_07.mp3` и `1_08.mp3`. Пока этих объектов нет, воспроизведение отвечает, что файл не найден.

## Проверка

`node --test test/test-speakout-viewer.mjs speakout/tests/lesson1a_ui.test.js speakout/tests/navigation_integration.test.js`

`node --test --test-name-pattern ui-boot test/test-ui-boot.mjs`

Arguments: `--test-name-pattern ui-boot`.

Environment: нет. После Editor проверка ждет 3 карточки: текст, карточки и задание. После повторного входа текст урока читается из открытого редактора.

Сборка: `node ops/build-learning-production-assets.mjs`. Деплой не выполнялся.

Строка коммита: `Opened Speakout studios for lessons 1B and 1C.`

Строка коммита проверки: `Expected three Speakout editor cards and the studio on the student page.`

Строка коммита колонки: `Removed the Speakout lesson list from the studio.`

Кнопки студии получают действие до загрузки просмотрщика. Файл просмотрщика при текущей сессии отдается как скрипт. Сессия не сбрасывается.

Строка коммита кнопок: `Kept Speakout controls alive when the PDF viewer opens with the current session.`

Повторное открытие урока не считает запрос книги повторной загрузкой каталога. Проверка импорта не принимает путь просмотрщика за модуль теста.

`node --test test/test-provider-removal.mjs`

Строка коммита проверок: `Stopped the Speakout viewer path from failing the import and cache checks.`
