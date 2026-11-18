# Day quiz board

Экран Day quiz по закрытым пунктам 1–22. Остальные входы в `daysetup` оставляют прежнюю карточку Study.

## Кадры

- Пункт 1: All, Range, Random, Mistakes, режимы, полоса Start.
- Range: поля Cards, from, to.
- Random: ползунок и подпись N cards.
- Custom mix: группы Recognize, Write, Listen & meaning, Games, Review и Select all.
- Пункты 2–19: экраны шагов остаются как есть.
- Пункт 20: Start собирает очередь, таймер около 30 секунд на карточку.
- Пункт 21: запись ответа и Mistakes.
- Пункт 22: сохранение повторения.

## Шаги

🟩 Разметка `#dayQuizBoard` в `site/preview.html`. Старая карточка в `#dayStudyClassic`.

🟩 Стили `.dq-*` только из `--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--acc-s`, `--on-acc`, `--bad`.

🟩 Выбор набора, режима и типов в `client/03g-core.js`. Material Day quiz открывает тот же кадр.

🟩 Проверка `node --test test/test-day-quiz-board.mjs`.

🟩 Сборка `node ops/build-learning-production-assets.mjs`.

## Проверка

`node --test test/test-day-quiz-board.mjs`

Arguments: нет.

Environment: нет.

Строка коммита: `Added the Day quiz setup board with card sets and modes.`
