# Список экзаменов: видимый текст в тесте

## Требование
В `test-chat-ui.mjs` после открытия группы A1 проверка названия `A1 Fixture exam` не должна падать из‑за `content-visibility: auto` у `.day`.

## Шаги
🟩 Перед `assert.match` прокрутить `[data-exam-open="11"]` и читать текст этой кнопки.
🟩 Прогнан `node ops/check-all.mjs test-chat-ui.mjs` — ok (~52 с).

## Проверка
🟩 Тест проходит; уведомление о назначении экзамена в чате не менялось.

## Итог
Починен ложный fail из‑за `content-visibility: auto`.

Commit message: Scrolled the exam row into view before reading its title in chat UI tests.
