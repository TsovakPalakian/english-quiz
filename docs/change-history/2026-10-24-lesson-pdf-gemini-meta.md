# PDF урока → Title / Description (Gemini)

## Требование

В режиме редактирования урока: поле загрузки/перетаскивания PDF; Gemini заполняет Title и короткое Description. Остальные вкладки (Overview, Words, …) и Speech practice — вне этого шага.

## Объем этого шага

🟩 Поле drop/upload в Basic information (только редактор).
🟩 `POST /api/lessons/parse-pdf` + Gemini: только `title` и `description`.
⬜ Overview, Words, Phrases, Rules, Classwork, Homework, Lesson PDF attachment.
⬜ Speech practice — не трогать.

## Проверка

🟩 `node --test test/test-lesson-pdf-meta.mjs` — 4/4.
🟩 UI: статус, подстановка Title/Description, `lmSchedule`; живой Gemini на проде не вызывался в этом шаге.
🟩 `npm run build:preview`.

## Итог

Прототип готов локально. Нужны `WORKBENCH_GEMINI_KEY`, модель и `LEARNING_LANGUAGE_NETWORK=true`. Только ADMIN/DEVELOPER, PDF до 25 MB. Без публикации.

🟩 Лимит PDF поднят до 25 MB (модуль, API, клиент).

Сообщение коммита: `Raised lesson PDF import limit to 25 MB`.
