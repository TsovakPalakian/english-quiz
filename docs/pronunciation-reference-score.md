# Оценка произношения по эталону

Пустая запись, русская речь и другое слово больше не получают проходной балл. 100 процентов только если запись совпала с эталоном Azure по звуку, ударению, интонации и выдоху. Любой сдвиг снижает балл и не округляется до 100. Без эталона ответ: `Reference pronunciation is not ready.`

Эталон: словарь IPA в SSML phoneme, голос `en-US-JennyNeural`. Если ключи Azure не заданы или синтез не удался, проходной балл не ставится.

## Проверка

Команда:

`node --test test/test-pronunciation-match.mjs test/test-lesson-pronounce-and-autoexpand.mjs test/test-external-language-adapters.mjs`

Arguments: нет.

Environment: нет.

Сборка: `npm run build:preview`, затем `node ops/build-learning-production-assets.mjs`. Деплой не выполнялся.

Строка коммита: `Scored pronunciation against the Azure reference instead of awarding a fixed pass.`

## Список

- 🟩 пустая речь, русская речь и другое слово не проходят
- 🟩 совпадение с эталоном дает 100
- 🟩 сдвиг ударения, тона или выдоха снижает балл
- 🟩 сборка production-assets содержит новый текст оценки
