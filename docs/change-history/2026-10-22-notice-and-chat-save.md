# Центр уведомления и сохранение без файлов

Дата: 22 октября 2026.

## Чеклист

- 🟩 Горизонтальный центр компактного уведомления переведен на `50vw`. Верх остался `50%`.
- 🟩 Локальные production-ассеты пересобраны. `test-exams-ui.mjs` прошел, публикация не выполнялась.
- 🟩 Save берет `message.files || []`. `production/chat.js` собран штатной командой. Открытие меню уже имело пустой список.
- 🟩 Меню прогнано в `test-chat-ui.mjs`: цитата, сохранение `Voice.wav` и копирование `Photo.png` со статусом Photo copied. Набор прошел.

Коммит: `Centered compact notices on the viewport and guarded chat saves without files.`
