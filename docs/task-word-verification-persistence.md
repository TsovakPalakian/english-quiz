# План: Персистентность верификации и сохранение новых слов и фраз в уроках

## Scope isolation and collateral protection

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче.
> Выполняемые задачи строго и изолированно затрагивают только логику снимка блоков урока в `lessonSnapshot`, связывание поиска слов `lmLookupWord` с серверным созданием карточек и fallback в `saveLesson`.
> Запрещено модифицировать сторонние маршруты, личные ответы учеников, экзаменационные блоки и логику авторизации.

---

## Утвержденный снимок экрана

![Скриншот 1: Редактор урока с частично заверифицированными блоками](/Users/tsovakpalakian/.gemini/antigravity/brain/d9b60ed4-a7ab-4a41-b528-a01a0ce54a9f/.user_uploaded/media_1795052089674_5003dd58.jpg)
*Скриншот 1: Редактор урока, вкладка «Phrases · 9», статус «Published», кнопка «● Verified by Teacher» со статусом «Partially Verified (14/23)» и карточка фразы «afraid of».*

---

## Этапы реализации и чеклист

- 🟩 **Этап 1: Создание документации и плана работ**
  - 🟩 Создать `docs/task-word-verification-persistence.md` с описанием шагов, защитным блоком и чеклистом статусов (`🟩`, `🟨`, `⬜`, `🟥`).

- 🟩 **Этап 2: Сохранение верификации и метаданных карточек слов/фраз в `lessonSnapshot`**
  - 🟩 В `client/main/main-bridge.js` в `lessonSnapshot()` обеспечить сохранение в `content` свойств `teacherVerified`, `assignmentKey`, `assignmentId`, `pdfImport`, `pdfVocabulary` для блоков с `cardId` (`wordcard` и `word`).
  - 🟩 Убедиться, что при смене статуса `teacherVerified` снимок фиксирует изменение и включает блок в `upserts`.

- 🟩 **Этап 3: Подключение серверного создания и поиска карточек в `lmLookupWord` и fallback в `saveLesson`**
  - 🟩 В `client/52-lessons.js` в `lmLookupWord()` добавить делегирование в `stageLookupLessonWord()` при его наличии в окружении.
  - 🟩 В `client/main/main-bridge.js` в `saveLesson()` добавить fallback автоматического создания shared-карточки через `lookupLessonCard()`, если блок поступил без `stageId`.

- 🟩 **Этап 4: Тестирование и сборка ассетов**
  - 🟩 Написать целевые тесты, проверяющие персистентность `teacherVerified` на карточках слов/фраз после сохранения и восстановления из серверного формата, а также сохранение новых карточек (`test/test-word-verification-persistence.mjs`).
  - 🟩 Запустить `npm run build:preview` для генерации актуального `preview.js`.
  - 🟩 Запустить сборщик продакшен-ассетов `node ops/build-learning-production-assets.mjs`.
  - 🟩 Прогнать тестовые наборы и убедиться в успешном прохождении всех тестов.
