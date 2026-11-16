# План полного переноса материалов Speakout A1 Unit 1 на сервер Cloudflare

## 1. Постановка задачи и цель

В соответствии с требованием пользователя:
> *«все данные по урокам должны храниться на сервере. ничего не должно быть локально. все материалы только на сервере»*

Все файлы учебных материалов Pearson Speakout 3rd Edition (2022) Level A1 (Unit 1: Lesson 1A Hello и Lesson 1D BBC Video), а также интерактивные структуры уроков должны быть перенесены из локальной файловой системы разработчика (`/Users/tsovakpalakian/Education/...`) на серверную инфраструктуру платформы [https://lumiscia.org](https://lumiscia.org):
1. **Объектное хранилище Cloudflare R2** (`learn-english-production-media`, привязка `CONTENT_MEDIA`): размещение бинарных файлов (PDF, MP3, MP4).
2. **База данных Cloudflare D1** (`learn-english-study`, привязка `STUDY_DB`, таблица `speakout_documents`): сохранение опубликованных интерактивных структур уроков с флагом `published = 1`.
3. **Маршрутизация в Cloudflare Worker** ([src/learning-stage-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs#L160-L226)): стриминг аудио, видео и PDF с поддержкой HTTP 206 Partial Content (Range requests) и отдача данных уроков.

---

## 2. Границы области изменений и изоляция (Scope Invariants)

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче переноса материалов Speakout Unit 1. Выполняемые задачи строго и изолированно должны задевать только свой функционал (`speakout/`, Cloudflare R2 бакет `CONTENT_MEDIA`, таблица D1 `speakout_documents` и обработчики `/api/speakout/*`). Весь смежный функционал платформы (тесты грамматики, словарь, чат, биллинг, профили пользователей, экзамены) остается неизменным.

- Публичные API-контракты платформы сохраняются без изменений.
- Обработчики ошибок и телеметрия сохраняются без изменений.
- Локальные тесты платформы (`test/test-ui-boot.mjs`, `speakout/tests/*.test.js`) должны сохранять 100% успешное прохождение.

---

## 3. Реестр переносимых файлов и объем данных

Суммарный объем файлов для переноса: **204.40 MB** (214 325 659 байт), **16 файлов**.

| Категория | Имя файла | Исходный путь | Объем | Целевой ключ в Cloudflare R2 |
|---|---|---|---|---|
| Master PDF | `Speakout 3rd Edition A1 Student's Book.pdf` | `/Users/tsovakpalakian/Education/...` | 145.87 MB | `speakout/a1/documents/student_book.pdf` |
| Master PDF | `SO3_A1_SB_AK.pdf` | `/Users/tsovakpalakian/Education/...` | 0.63 MB | `speakout/a1/documents/teacher_keys.pdf` |
| Master PDF | `Speakout_A1_SB_Videoscripts.pdf` | `/Users/tsovakpalakian/Education/...` | 0.21 MB | `speakout/a1/documents/videoscripts.pdf` |
| Photocopiable PDF | `SO3_A1_PC_1A_Grammar.pdf` | `/Users/tsovakpalakian/Education/...` | 0.56 MB | `speakout/a1/unit1/photocopiables/1a_grammar.pdf` |
| Photocopiable PDF | `SO3_A1_PC_1A_Vocab.pdf` | `/Users/tsovakpalakian/Education/...` | 0.53 MB | `speakout/a1/unit1/photocopiables/1a_vocab.pdf` |
| BBC Video MP4 | `SO3 A1 U1 BBC StreetInt.mp4` | `/Users/tsovakpalakian/Education/...` | 29.03 MB | `speakout/a1/unit1/videos/street_interviews.mp4` |
| BBC Video MP4 | `SO3 A1 U1 BBC Vlogs.mp4` | `/Users/tsovakpalakian/Education/...` | 19.19 MB | `speakout/a1/unit1/videos/vlogs.mp4` |
| Class Audio MP3 | `009_SO3_A1_SB_1A_Audio_1_01.mp3` | `/Users/tsovakpalakian/Education/...` | 1.38 MB | `speakout/a1/unit1/audio/1_01.mp3` |
| Class Audio MP3 | `010_SO3_A1_SB_1A_Audio_1_02.mp3` | `/Users/tsovakpalakian/Education/...` | 0.56 MB | `speakout/a1/unit1/audio/1_02.mp3` |
| Class Audio MP3 | `011_SO3_A1_SB_1A_Audio_1_03.mp3` | `/Users/tsovakpalakian/Education/...` | 0.44 MB | `speakout/a1/unit1/audio/1_03.mp3` |
| Class Audio MP3 | `018_SO3_A1_SB_1A_Audio_VB1_01.mp3` | `/Users/tsovakpalakian/Education/...` | 2.33 MB | `speakout/a1/unit1/audio/vb1_01.mp3` |
| Class Audio MP3 | `021_SO3_A1_SB_1D_Audio_VB1_04.mp3` | `/Users/tsovakpalakian/Education/...` | 1.15 MB | `speakout/a1/unit1/audio/vb1_04.mp3` |
| Workbook Audio MP3 | `SO3_A1_WB_1A_Audio_1_01.mp3` | `/Users/tsovakpalakian/Education/...` | 0.56 MB | `speakout/a1/unit1/audio/wb_1_01.mp3` |
| Workbook Audio MP3 | `SO3_A1_WB_1A_Audio_1_02.mp3` | `/Users/tsovakpalakian/Education/...` | 0.50 MB | `speakout/a1/unit1/audio/wb_1_02.mp3` |
| Workbook Audio MP3 | `SO3_A1_WB_1A_Audio_1_03.mp3` | `/Users/tsovakpalakian/Education/...` | 0.68 MB | `speakout/a1/unit1/audio/wb_1_03.mp3` |
| Workbook Audio MP3 | `SO3_A1_WB_1A_Audio_1_04.mp3` | `/Users/tsovakpalakian/Education/...` | 0.78 MB | `speakout/a1/unit1/audio/wb_1_04.mp3` |

---

## 4. Этапы реализации

### Этап 1: Загрузка медиафайлов в Cloudflare R2
- Разработка скрипта миграции `ops/upload-speakout-media-to-r2.mjs`.
- Загрузка всех 16 файлов в бакет `learn-english-production-media`.
- Проверка целостности SHA-256 и доступности заголовков Content-Type.

### Этап 2: Публикация уроков 1A и 1D в Cloudflare D1
- Формирование JSON-документов для уроков Lesson 1A и Lesson 1D со всеми интерактивными блоками (текст, аудио, упражнения, видео, сопоставления).
- Запись данных в таблицу `speakout_documents` базы `learn-english-study` с параметром `published = 1`.
- Проверка чтения данных через эндпоинт `/api/speakout/lesson?level=A1&unit=0&lesson=0` и `/api/speakout/lesson?level=A1&unit=0&lesson=1`.

### Этап 3: Поддержка стриминга в Cloudflare Worker
- Добавление в [src/learning-stage-worker.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-stage-worker.mjs) потокового чтения медиафайлов из R2 (`CONTENT_MEDIA`) с поддержкой HTTP 206 Range для видео и аудио.
- Добавление маршрутов отдачи манифеста и документов `/api/speakout/*`.
- Обновление ссылок в [speakout/data/manifest.json](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/data/manifest.json) с локальных путей на серверные URL.

### Этап 4: Верификация и тестирование
- Прогон юнит-тестов `speakout/tests/*.test.js`.
- Прогон интеграционных тестов `test/test-ui-boot.mjs`.
- Проверка отсутствия локальных путей файловой системы в коде клиента.
- Сборка продакшен-ассетов через `ops/build-learning-production-assets.mjs`.

---

## 5. Чек-лист реализации

- 🟩 Этап 1: Загрузка 16 файлов медиа в Cloudflare R2 бакет `learn-english-production-media`
- 🟩 Этап 2: Генерация и запись документов Lesson 1A и Lesson 1D в Cloudflare D1 `speakout_documents` (`published = 1`)
- 🟩 Этап 3: Настройка обработчиков Cloudflare Worker для стриминга аудио, видео и PDF из R2
- 🟩 Этап 4: Очистка [speakout/data/manifest.json](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/data/manifest.json) от локальных путей файловой системы
- 🟩 Этап 5: Верификация воспроизведения аудио и видео через HTTP 206 Range
- 🟩 Этап 6: Прогон автоматических тестов `test/test-ui-boot.mjs` и `speakout/tests/*.test.js`

---

## 6. Утвержденные визуальные макеты интерфейса

- **Скриншот 17**: Единый рабочий интерфейс урока 1A («Hello»)
  ![Скриншот 17](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/speakout-screenshot-17-approved-single-screen.jpg)

- **Скриншот 18**: Единый рабочий интерфейс урока 1D («BBC Video»)
  ![Скриншот 18](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/speakout-screenshot-18-approved-lesson-1d.jpg)

- **Скриншот 20**: Рабочая область медиафайлов и ответов
  ![Скриншот 20](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/speakout-screenshot-20-unified-media-workspace.jpg)
