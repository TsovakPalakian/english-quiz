# Запись речи: файл в хранилище, ключ в таблице

<span style="color: red; font-weight: bold;">WARNING</span>
Менять только сохранение и прослушивание записи ученика на Speakout. Загрузку материалов урока, прогресс, сессию и разбор живого текста не трогать.

## Пункты

🟩 Сохранение: байты webm в хранилище, в таблице пользователь, урок, дорожка и ключ. Успех показывает Saved. Отказ оставляет прежний ключ.
🟩 Прослушивание: ▶ Play без записи во вкладке берет файл по ключу. Пока файл идет, подпись ▶ Play. Нет ключа: `No student recording available. Press 🎙️ Record first.` Файл не открылся: `Student recording could not be played.` Запись во вкладке играет из памяти.

## Сделано

🟩 Проверки `node --test` по четырем файлам прошли.
🟩 `node ops/build-learning-production-assets.mjs` собрал страницу Speakout с новой отправкой. Деплой не делался.

## Проверка

```
node --test test/test-api-speech-speakout.mjs
node --test speakout/tests/lesson1a_server.test.js
node --test speakout/tests/security_hardening.test.js
node --test speakout/tests/lesson1a_ui.test.js
node ops/build-learning-production-assets.mjs
```

Arguments: нет.
Environment: `SPEAKOUT_STUDENT_PASSWORD=test-student-secret-2022` выставляют серверные тесты сами.

Commit: Stored Speakout speech recordings in media storage and kept only the key in the database.
