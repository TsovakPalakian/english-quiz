# План реализации TASK-55: Полный аудит 20 типов квизов, исправление True / false, обеспечение минимального полного контента и смещение проверенных квизов вниз

> [!WARNING]
> **Блок изоляции области видимости и защиты смежного функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы в рамках генератора заданий и квизов ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)), валидации схемы квизов ([`src/quiz-review-content.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review-content.mjs)), сортировки и интерфейса редактора ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)) и стилей квизов ([`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)). Если возникнет техническая необходимость затронуть смежные модули, об этом требуется заранее уведомить пользователя в чате текстом: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием причин и запросом подтверждения.

---

## 1. Точная постановка проблемы и ссылки на исходный код

1. **Порядок отображения квизов в редакторе (смещение проверенных вниз, новых вверх)**:
   - В текущей реализации [`client/52-lessons.js#L616-L619`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L616-L619) функция `lmBlocksFor()` возвращает блоки в порядке их добавления в массив `lmState.blocks`.
   - При добавлении новых квизов или подтверждении проверки карточки остаются на своих местах.
   - Требуется реализовать строгий порядок отображения:
     - Новые и еще не проверенные квизы (`!block.teacherVerified`) располагаются вверху списка карточек в секции.
     - При установке отметки `[✓] Verified by Teacher` в [`client/52-lessons.js#L1996-L2005`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1996-L2005) блок автоматически сворачивается (`block.collapsed = true`), помечается бейджем `✓ Verified by Teacher` и смещается вниз списка секции.
     - Новые сгенерированные блоки сразу появляются в верхней части секции для приоритетной проверки преподавателем.
2. **Анализ поломки квиза True / false**:
   - В [`client/52-lessons.js#L651`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L651) шаблон элемента содержит `{ prompt: "", answer: "true" }`.
   - В общем блоке генератора [`client/52-lessons.js#L3113-L3129`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3113-L3129) в `prompt` записывается речевой текст `"Say: \"superstition\""`, а в `answer` записывается строка `"superstition"` вместо булевой строки `"true"` или `"false"`.
   - В предпросмотре [`client/52-lessons.js#L1213`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1213) карточка отображается как статическая плашка без интерактивных кнопок True/False и без проверки.
   - Схема [`src/quiz-review-content.mjs#L43`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/quiz-review-content.mjs#L43) требует строго `['true','false'].includes(item.answer)`.
3. **Состояние остальных 19 типов квизов**:
   - Детерминированный скрипт подтвердил, что только 3 типа (`Match`, `Choice`, `Gap`) имеют целевые ветки генерации. Остальные 17 типов попадали в общий fallback с перезаписью `prompt` и `answer`.
   - Требуется предоставить каждому типу минимальный полный контент без пустых полей.

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Расположение квизов — новые вверху, проверенные смещены вниз и свернуты
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-verified-quizzes-shifted-down.png)
*Скриншот 1: Организация списка заданий в редакторе — нерассмотренные квизы находятся в верхней части списка, проверенные квизы автоматически сворачиваются и смещаются в нижнюю часть с бейджем «✓ Verified by Teacher».*

---

### Скриншот 2: Динамический переход при проверке задания преподавателем
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-verification-flow-shift-down.png)
*Скриншот 2: Пошаговая демонстрация смещения — после клика на чекбокс верификации карточка закрывается и перемещается вниз к проверенным заданиям, поднимая следующее требующее проверки задание наверх.*

---

### Скриншот 3: Целевая структура квиза True / false с полным минимальным контентом
![Скриншот 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-true-false-broken-vs-full-content.png)
*Скриншот 3: Исправленный квиз True / false с содержательным утверждением, интерактивными кнопками выбора True/False и мгновенной проверкой ответа.*

---

## 3. Этапы и контрольный список реализации (Checklist)

- ⬜ **Этап 1**: Реализация логики смещения проверенных квизов вниз и новых вверх:
  - Доработка функции получения и рендеринга блоков в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): сортировка блоков текущей вкладки с приоритетом нерассмотренных карточек (`!b.teacherVerified`) вверху и проверенных (`b.teacherVerified`) внизу.
  - При генерации новых блоков: добавление новых заданий в верхнюю часть секции (перед проверенными заданиями).
  - При установке отметки `[data-block-teacher-verified]`: выставление `block.teacherVerified = true`, `block.collapsed = true`, перемещение карточки вниз в массив проверенных и вызов `lmRenderEditor()`.
- ⬜ **Этап 2**: Исправление генерации квиза `True / false` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js):
  - Создание отдельной ветки `else if (quizType === "True / false")`.
  - Формирование полного утверждения `prompt` на основе темы и слова урока.
  - Запись валидного ответа `answer: "true"` или `"false"`.
- ⬜ **Этап 3**: Интерактивное отображение `True / false` в предпросмотре урока:
  - Доработка `lmPreviewBlock(block)` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): интерактивные кнопки выбора `True` и `False`, проверка и вывод результата.
- ⬜ **Этап 4**: Наполнение минимальным полным контентом остальных типов квизов (`Type`, `Definition`, `Odd one out`, `Select all`, `Build`, `Tap`, `Reverse`, `Flip`, `Smart Flashcard`, `Memory`).
- ⬜ **Этап 5**: Сборка ассетов:
  - Запуск `npm run build:preview`.
  - Запуск `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 6**: Разработка автоматизированных тестов:
  - Создание теста в `test/test-lesson-verified-shift-down-and-tf.mjs` с проверкой порядка расположения карточек (новые вверху, проверенные внизу) и корректности True / false.
- ⬜ **Этап 7**: Итоговая верификация и оформление коммита.
