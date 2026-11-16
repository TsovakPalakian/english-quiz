# План устранения расхождения экрана урока Speakout и интеграции утвержденного шаблона

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче отображения утвержденного шаблона Speakout Studio на экране `#speakouteditor`. Задачи строго и изолированно затрагивают отображение блока студии Speakout внутри `#speakouteditor` ([production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js)), директиву `frame-ancestors 'self'` в [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs) для бесшовного встраивания студии без нарушения CSP, и сохранение контракта видимости `#speakouteditor.on` для прохождения тестов [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs). Весь остальной функционал платформы (грамматика, словарь, чат, биллинг, профили, экзамены) остается неизменным.

---

### Скриншот 30: Текущее состояние экрана редактора со свернутыми блоками, присланное пользователем
![Скриншот 30: Текущее состояние экрана редактора со свернутыми блоками](docs/speakout-screenshot-30-user-reported-collapsed-blocks.png)

---

### Скриншот 17: Утвержденный единый экран первой очереди Speakout (состояние Lesson 1A Hello: PDF.js + полоса треков + Keys)
![Скриншот 17: Утвержденный единый экран первой очереди Speakout](docs/speakout-screenshot-17-approved-single-screen.jpg)

---

### Скриншот 18: Утвержденный единый экран первой очереди Speakout (состояние Lesson 1D BBC Video: плеер + полоса треков + Keys)
![Скриншот 18: Утвержденный единый экран первой очереди Speakout](docs/speakout-screenshot-18-approved-lesson-1d.jpg)

---

## 1. Точная причина расхождения интерфейса

1. **Сворачивание блоков в `<details>`**: В [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L128) функция `readBlocks()` генерирует разметку `<article class="se-block lm-block..."><details><summary>...</summary>${body}</details></article>` без атрибута `open`. При открытии опубликованного урока все блоки сворачиваются, создавая эффект пустого экрана со списком серых полос.
2. **Исчезновение точки входа в студию**: В [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js#L145) кнопка перехода в студию отображалась исключительно при условии `if (!doc.blocks.length)`. После заполнения базы D1 13 блоками условие перестало выполняться, скрыв доступ к студии.
3. **Разделение сущностей**: Экран `#speakouteditor` спроектирован как текстовый редактор блоков CMS, тогда как утвержденные экраны **Скриншот 17** и **Скриншот 18** реализованы в автономном интерактивном модуле [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html) (просмотр оригинального PDF учебника через PDF.js, нижняя док-панель аудио/видео треков, модальное окно Keys и Speech Studio).

---

## 2. Архитектурное решение

1. **Встраивание утвержденного шаблона в `#speakouteditor`**:
   - При открытии урока Speakout Level A1 Unit 1 (1A и 1D) в режиме просмотра (`!editing`) экран `#speakouteditor` монтирует интерактивную полноэкранную рабочую область Pearson Speakout Studio (Скриншот 17 / 18) через iframe `/speakout/?lesson=1A` (или `1D`).
   - Для разрешения встраивания в [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs#L2) директива CSP `frame-ancestors 'none'` обновляется на `frame-ancestors 'self'`, что позволяет платформе безопасно встраивать собственные страницы без риска кликджекинга со сторонних доменов.
2. **Сохранение контракта навигации и тестирования**:
   - Экран `#speakouteditor.on` остается активным, кнопка возврата `[data-nav-back]` возвращает в каталог `#speakout`, кнопка `Editor` (`#seEdit`) переключает в режим редактирования блоков, полностью удовлетворяя всем проверкам [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs).
3. **Развертывание резервных блоков**:
   - В функции `readBlocks()` для блоков снимается принудительное скрытие контента, обеспечивая доступность содержимого.

---

## 3. Чек-лист реализации

- 🟩 **Этап 1**: Разрешение `frame-ancestors 'self'` в CSP заголовках [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs)
- 🟩 **Этап 2**: Интеграция точки входа и баннера интерактивной области Speakout Studio (Скриншоты 17 / 18, 41 / 50) в `#speakouteditor` в [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js)
- 🟩 **Этап 3**: Внедрение платформенного алгоритма темы `.theme-seg` и мобильной адаптивности в [speakout/web/style.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/style.css) и [speakout/web/index.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/speakout/web/index.html)
- 🟩 **Этап 4**: Локальная компиляция продакшен-ассетов через `ops/build-learning-production-assets.mjs` и `npm run build:preview`
- 🟩 **Этап 5**: Верификация 113 проверок [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs) и 70 целевых тестов `speakout/tests/`
