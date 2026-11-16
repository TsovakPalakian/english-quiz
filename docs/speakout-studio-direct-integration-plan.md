# План прямой интеграции утвержденных шаблонов Speakout Studio в экран урока

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче интеграции утвержденных шаблонов Speakout Studio на экране урока `#speakouteditor`. Задача строго и изолированно затрагивает отображение интерактивной студии (Шаблоны 4 и 7) в контейнере экрана `#speakouteditor` ([production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js)) и переход из каталога уроков ([client/03-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03-core.js)). Весь остальной функционал платформы (грамматика, словарь, чат, биллинг, профили, экзамены) остается неизменным.

---

## 1. Точная причина отсутствия утвержденного экрана на скриншоте пользователя

1. На присланном пользователем скриншоте отображен экран `#speakouteditor` в режиме `!editing`, где функция `readBlocks()` рендерит список свернутых блоков CMS (`▶ Heading`, `▶ Lesson Overview`, `▶ Open Student's Book (Pages 8–9)`).
2. Утвержденный **Шаблон 4** (интерактивная студия Lesson 1A: ридер PDF.js, тулбар навигации, нижний док аудиотреков, кнопка ключей Answer Keys) был реализован в автономном модуле `/speakout/?lesson=1A`, но на самом экране `#speakouteditor` отображались серые свернутые блоки редактора вместо рабочей области студии.
3. Утвержденный **Шаблон 8** (конструктор блоков урока) должен активироваться исключительно по нажатию кнопки `Editor` (`#seEdit`), тогда как при обычном открытии урока студент и преподаватель должны сразу видеть утвержденный рабочий экран **Шаблона 4** (для 1A) или **Шаблона 7** (для 1D).

---

## 2. Карта расположения всех 9 утвержденных шаблонов

1. **Шаблон 1 (Каталог уровней)**: экран `#speakout` (`speakView = "levels"` в [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L476-L483)).
2. **Шаблон 2 (Выбор юнита уровня A1)**: экран `#speakout` (`speakView = "level"` в [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L487-L495)).
3. **Шаблон 3 (Список уроков юнита 1)**: экран `#speakout` (`speakView = "unit"` в [client/00-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L498-L506)).
4. **Шаблон 4 (Рабочий экран интерактивной студии Lesson 1A)**: рабочая область студии с учебником Student's Book, тулбаром и треками.
5. **Шаблон 5 (Модальное окно Answer Keys)**: окно разворота проверочных ответов Teacher's Book.
6. **Шаблон 6 (Панель Speech Studio)**: панель адаптивной записи и верификации речи.
7. **Шаблон 7 (Рабочий экран видеоурока 1D BBC Video)**: экран видеоурока с плеером BBC, скриптами и заданиями.
8. **Шаблон 8 (Режим конструктора блоков)**: блочный редактор урока по нажатию кнопки `Editor` (`#seEdit`).
9. **Шаблон 9 (Мобильный адаптивный интерфейс)**: мобильная раскладка студии при ширине экрана до 640px.

---

## 3. Архитектурное решение отображения

1. В [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js):
   - При открытии уроков уровня A1 Unit 1 (1A и 1D) в режиме просмотра (`!editing`) в контейнере `#seBlocks` монтируется утвержденная интерактивная студия Speakout Studio (Шаблон 4 для 1A и Шаблон 7 для 1D) во всю доступную высоту экрана.
   - Свернутые блоки CMS скрываются из режима просмотра и открываются только при переходе в режим редактирования по кнопке `Editor` (`#seEdit`) — это утвержденный **Шаблон 8**.
2. В [client/03-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03-core.js#L83-L87):
   - Обеспечивается прямой бесшовный переход из Шаблона 3 (список уроков) к интерактивной студии Шаблона 4 (1A) или Шаблона 7 (1D).

---

## 4. Чек-лист реализации

- 🟩 **Этап 1**: Подключение интерактивной студии (Шаблоны 4 и 7) в контейнер `#seBlocks` экрана `#speakouteditor` в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js)
- 🟩 **Этап 2**: Сохранение доступа к блочному редактору (Шаблон 8) по кнопке `Editor` (`#seEdit`)
- 🟩 **Этап 3**: Локальная сборка продакшен-ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`
- 🟩 **Этап 4**: Верификация всех 113 проверок [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs) и 70 проверок `speakout/tests/`
