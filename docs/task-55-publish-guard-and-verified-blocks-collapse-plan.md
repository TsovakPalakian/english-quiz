# План реализации TASK-55: Блокировка публикации при непроверенных материалах и автосворачивание проверенных блоков со статусом верификации

> [!WARNING]
> **Блок изоляции области видимости и защиты смежного функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые правки строго изолированы в рамках панели управления публикацией урока ([`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html)), логики валидации публикации и рендеринга карточек редактора ([`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js)) и стилей интерфейса редактора ([`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)). Если возникнет техническая необходимость затронуть смежные модули, об этом требуется заранее уведомить пользователя в чате текстом: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием причин и запросом подтверждения.

---

## 1. Точная постановка проблемы и ссылки на исходный код

1. **Доступность кнопки публикации при непроверенном материале**:
   - В [`client/52-lessons.js#L2541-L2550`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L2541-L2550) обработчик клика на `#lmPublish` переводит урок в статус `lmState.published = true` без проверки флага `teacherVerified` у блоков урока.
   - В [`client/52-lessons.js#L3452-L3492`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L3452-L3492) функция `lmSyncTeacherVerifySummary()` обновляет бейдж статуса, но не блокирует кнопку `#lmPublish` и не выставляет атрибуты `disabled` / `aria-disabled`.
   - В [`site/preview.html#L658-L660`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L658-L660) кнопка `#lmPublish` отображается активной наряду с `#lmSave` (Save draft). При наличии непроверенных заданий или материалов кнопка публикации должна быть некликабельной (`disabled`), разрешая исключительно сохранение черновика (`Save draft`).
2. **Отсутствие автосворачивания проверенных блоков и статуса на свернутой карточке**:
   - В [`client/52-lessons.js#L1996-L2005`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1996-L2005) при установке чекбокса `data-block-teacher-verified` свойство `block.teacherVerified` принимает значение `true`, но свойство `block.collapsed` не переводится в `true`, из-за чего проверенная карточка остается развернутой и загромождает рабочее пространство.
   - В [`client/52-lessons.js#L957-L965`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L957-L965) функция `lmHead()` генерирует заголовок блока, но в свернутом состоянии (`is-shut`) отсутствует зеленый бейдж верификации `✓ Verified by Teacher`, из-за чего преподаватель не видит статус готовности задания без его повторного раскрытия.
   - Требуется реализовать сворачивание проверенных блоков с выводом бейджа `✓ Verified by Teacher` в шапке блока, а также группировку проверенных материалов в раскрываемый аккордеон/контейнер для фокусировки внимания преподавателя на оставшихся непроверенных карточках.

---

## 2. Утвержденные визуальные макеты

### Скриншот 1: Блокировка кнопки Publish при наличии непроверенных материалов
![Скриншот 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-1-publish-button-disabled-unverified.png)
*Скриншот 1: Кнопка «Publish» переведена в некликабельное состояние (disabled) с иконкой замка и поясняющим уведомлением о том, что публикация заблокирована до завершения верификации всех блоков преподавателем; активной остается только кнопка «Save draft».*

---

### Скриншот 2: Автосворачивание проверенных блоков со статусом верификации и группировкой
![Скриншот 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-55-screenshot-2-verified-blocks-collapsed-status.png)
*Скриншот 2: Проверенные задания автоматически сворачиваются, отображая зеленый бейдж «✓ Verified by Teacher» непосредственно в шапке карточки рядом с типом квиза, а также организуются в раскрываемый контейнер проверенных материалов.*

---

## 3. Этапы и контрольный список реализации (Checklist)

- ⬜ **Этап 1**: Блокировка публикации при наличии непроверенных блоков:
  - Доработка `lmSyncTeacherVerifySummary()` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): вычисление `hasUnverified = lmState.blocks.some(b => !b.teacherVerified && b.type !== 'divider')`.
  - Установка свойства `disabled = true`, класса `is-disabled` и атрибута `title="All quizzes and materials must be verified by a teacher before publishing"` на элемент `#lmPublish` при `hasUnverified === true`.
  - Защита обработчика клика `#lmPublish`: прерывание выполнения с выводом системной подсказки `lmNote("Cannot publish: verify all lesson materials first")`, если публикация заблокирована.
- ⬜ **Этап 2**: Автоматическое сворачивание блока при подтверждении проверки преподавателем:
  - В обработчике `[data-block-teacher-verified]` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): при установке `checked === true` автоматически выставлять `block.collapsed = true`.
  - В шапке блока `lmHead()` в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): отображение компактного бейджа `<span class="lm-block-verified-tag">✓ Verified by Teacher</span>` рядом с типом блока, видимого в свернутом состоянии карточки.
- ⬜ **Этап 3**: Организация проверенных блоков в раскрываемый контейнер / компактный вид:
  - Добавление стилей в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) для некликабельной кнопки `#lmPublish.is-disabled`, бейджа `.lm-block-verified-tag` и секции проверенных материалов.
  - Поддержка разворачивания/сворачивания группы проверенных карточек при необходимости повторного редактирования.
- ⬜ **Этап 4**: Сборка рабочих файлов и продакшн-ассетов:
  - Запуск `npm run build:preview` для генерации [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js).
  - Запуск `node ops/build-learning-production-assets.mjs`.
- ⬜ **Этап 5**: Разработка автоматизированных тестов и валидация:
  - Создание тестового файла `test/test-lesson-publish-guard-and-collapse.mjs`.
  - Проверка блокировки `#lmPublish` при непроверенных блоках и снятия блокировки при полной верификации всех блоков.
  - Проверка выставления `block.collapsed = true` и рендеринга бейджа `✓ Verified by Teacher` в свернутой шапке.
- ⬜ **Этап 6**: Итоговая верификация и оформление коммита.
