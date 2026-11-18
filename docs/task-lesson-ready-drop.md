# Готовность черновика без второй зоны файла

<span style="color: red; font-weight: bold;">WARNING</span>: Не трогать и не ломать функциональность вне этой правки. Меняется только готовность черновика в `lmPdfProgress`: карточка Import another PDF не строится, зона Drop lesson or exam file / PDF на баре File / PDF не прячется. Кружок и список на баре источника остаются. Поля, генерация, диалог черновика и остальные бары не меняются.

## Постановка

1. Проблема: при подписи Draft ready функция строит карточку Import another PDF и зону Drop another file here, а на File / PDF прячет свою зону файла. В [client/52b-lesson-pdf-import.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js) это ветка `label==='Draft ready'` и строка `drop.hidden=true`.
2. Граница: кружок 100% и список сохраненного остаются на баре источника. Вторая карточка отсутствует на File / PDF, Web URL, Manual Script и Complement Current Lesson. Своя зона файла на File / PDF остается видимой.
3. Проверка: `node --test test/test-lesson-ready-drop.mjs`
4. Состояния: `🟩` проверено, `🟨` в работе, `⬜` не начато, `🟥` нужна переделка.

## Цепочка

- Повторное действие на Manual Script, Web URL, Complement Current Lesson и File / PDF оставляет кружок и список.
- Карточка Import another PDF и зона Drop another file here не строятся.
- На File / PDF остается Drop lesson or exam file / PDF.
- Тема sky берет цвета из переменных. В dark и sand у кружка нет небесной заливки Sky.

## Шаги

- 🟩 Убрать построение карточки и скрытие зоны файла в client/52b-lesson-pdf-import.js
- 🟩 Собрать preview.js из client
- 🟩 Проверка test/test-lesson-ready-drop.mjs
- 🟩 Вторая загрузка в test/test-lesson-pdf-ui.mjs идет через прежнюю зону файла

Проверка: `node --test test/test-lesson-ready-drop.mjs`

Arguments: нет.

Environment: нет.

Строка коммита: Kept the file drop on the File / PDF bar after a draft is ready.
