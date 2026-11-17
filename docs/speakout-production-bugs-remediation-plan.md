# План устранения ошибок продакшена Speakout (TASK-70)

## Связанные инциденты

- `c69be8770b25ab4ec85112b785e51e77`: `POST /api/speakout/progress` -> `501 Not migrated. No production fallback.` (Count: 82)
- `20bdb2e05f22a44559cd8ebdb83d3778`: `GET /api/speakout/progress?user=1` -> `501 Not migrated. No production fallback.` (Count: 24)
- `7a295dfa0667c3fd72d54e0472906aff`: `POST /api/speakout/speech/record` -> `501 Not migrated. No production fallback.` (Count: 5)
- `cc58b4d3ee545451c7dbc597f448fa7b`: `GET /api/speakout/audio?track=1.04` -> `404 File not found.` (Count: 17)

## Связанные файлы

- [`src/learning-stage-worker.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs)
- [`src/learning-speakout.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-speakout.mjs)
- [`test/test-api-speech-speakout.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-api-speech-speakout.mjs)
- [`test/test-speakout-viewer.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speakout-viewer.mjs)

---

## 1. Точные формулировки проблем и первопричин

### Проблема A (Баги c69be8770b25ab4ec85112b785e51e77 и 20bdb2e05f22a44559cd8ebdb83d3778)
- В [`src/learning-stage-worker.mjs:153-170`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L153-L170) маршрут `/api/speakout/progress` не зарегистрирован ни в `read` / `allowedRead`, ни в `write` / `speakoutWrite`.
- При вызовах `POST /api/speakout/progress` и `GET /api/speakout/progress?user=...` воркер выбрасывает ошибку `501 Not migrated. No production fallback.`.
- Требуется добавление эндпоинтов в воркер с сохранением данных в таблицу `speakout_progress` базы данных D1 (`STUDY_DB`).

### Проблема B (Баг 7a295dfa0667c3fd72d54e0472906aff)
- В [`src/learning-stage-worker.mjs:153-170`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L153-L170) маршрут `POST /api/speakout/speech/record` не зарегистрирован в `write` / `speakoutWrite`.
- Запись голоса ученика из окна Speech Verification Studio отклоняется статусом `501`.
- Требуется добавление обработки эндпоинта с сохранением в таблицу `speakout_audio_recordings` базы данных D1.

### Проблема C (Баг cc58b4d3ee545451c7dbc597f448fa7b)
- При открытии урока 1B клиент запрашивает аудиодорожку `1.04` (`/api/speakout/audio?track=1.04`), которая сопоставлена с ключом `speakout/a1/unit1/audio/1_04.mp3`.
- В Cloudflare R2 бакете `learn-english-production-media` файл отсутствует, из-за чего [`storedMediaResponse`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-media.mjs#L20) возвращает `404 File not found.`.
- Требуется загрузить аудиофайлы урока 1B (`1_04.mp3`, `1_0x.mp3`, `vb1_02.mp3`, `vb1_03.mp3`) в R2 и обеспечить их отдачу с поддержкой HTTP 206 Partial Content.

---

## 2. Границы области изменений и инварианты

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задача строго и изолированно затрагивает только маршруты `/api/speakout/progress`, `/api/speakout/speech/record` и отдачу аудиофайлов Speakout. Весь смежный функционал платформы (тесты грамматики, словарь, чат, биллинг, профили пользователей, экзамены) остается неизменным.

Инварианты:
1. Публичные API-контракты платформы сохраняются без изменений.
2. Обработчики ошибок и телеметрия сохраняются без изменений.
3. Локальные тесты платформы (`test/test-ui-boot.mjs`, `test/test-api-speech-speakout.mjs`, `test/test-speakout-viewer.mjs`) должны сохранять 100% успешное прохождение.

---

## 3. Детерминированная верификация

1. Таргетированные тесты:
   - `node --test test/test-api-speech-speakout.mjs`
   - `node --test test/test-speakout-viewer.mjs`
   - `node --test speakout/tests/navigation_integration.test.js`
2. Сборка продакшен-ассетов:
   - `node ops/build-learning-production-assets.mjs`

---

## 4. Чек-лист реализации

- 🟩 **Пункт 1 (Функция 1)**: Маршруты `GET /api/speakout/progress` и `POST /api/speakout/progress` в Cloudflare Worker с сохранением в таблицу `speakout_progress`.
- 🟩 **Пункт 2 (Функция 2)**: Маршрут `POST /api/speakout/speech/record` в Cloudflare Worker с сохранением в таблицу `speakout_audio_recordings`.
- 🟩 **Пункт 3 (Функция 3)**: Загрузка аудиодорожек урока 1B (`1.04`, `1.0X`, `VB1.02`, `VB1.03`) и 1C (`1.05`, `1.06`, `1.07`, `1.08`) в Cloudflare R2 и стриминг с HTTP 206 Range.
- 🟩 **Пункт 4**: Верификация автоматическими тестами `node --test test/test-api-speech-speakout.mjs`, `node --test test/test-speakout-viewer.mjs` и сборка ассетов.
