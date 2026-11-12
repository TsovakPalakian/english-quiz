# План устранения разрыва между Preview и Approve all под + Add content

## 1. Точная формулировка проблемы и ссылки на код
В [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L3361) для селектора `.lm-preview-btn` задано свойство:
```css
.lm-preview-btn { display: block; margin: 0 auto; }
```
Когда кнопка `.lm-preview-btn` размещается внутри флекс-контейнера `.lm-bottom-actions-row` [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L895-L898), свойство `margin: 0 auto` в модели Flexbox раскрывается в `margin-left: auto; margin-right: auto;`.
В результате `margin-right: auto` отталкивает соседнюю кнопку `Approve all` (`#lmApproveAllBlocksBtn`) к правому краю карточки, образуя неестественный широкий разрыв между кнопками.

Пользователь требует:
> Approve all размести рядом с Preview справа, под + Add content

## 2. Границы области действия и инварианты (Scope Boundaries & Invariants)
- **Строгая изоляция функционала**:
  > [!IMPORTANT]
  > <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче (генераторы тестов, плеер фокуса, аудио/караоке, работу D1/R2, прокторинг). Задача строго ограничена сбросом отступа кнопки `.lm-preview-btn` внутри `.lm-bottom-actions-row` для компактного размещения кнопок `Preview` и `Approve all` рядом друг с другом.
- В [site/preview.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L2907-L2909) для `.lm-bottom-actions-row` зафиксировать:
  ```css
  .lm-bottom-actions-row { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
  .lm-bottom-actions-row .lm-preview-btn { margin: 0 !important; }
  .lm-bottom-actions-row .lm-approve-all-btn { margin: 0 !important; }
  ```
- В [site/preview.html](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L895-L898) удалить конфликтный инлайн-разделитель и синхронизировать инлайн-стили с CSS.

## 3. Согласованный макет интерфейса (Тема sky)

### Скриншот 1: Кнопка Approve all расположена компактно рядом с Preview справа под + Add content (тема sky)
![Скриншот 1](/Users/tsovakpalakian/.gemini/antigravity/brain/91dc66f9-0518-46eb-b888-d98c935ea578/task-53-screenshot-1-approve-all-next-to-preview.png)

## 4. Контрольный список реализации (Checklist)
- 🟩 **Этап 1**: Анализ проблемы, подготовка точного макета в теме sky и согласование плана с пользователем
- 🟩 **Этап 2**: Сброс `margin` для `.lm-preview-btn` и `.lm-approve-all-btn` внутри `.lm-bottom-actions-row` в `site/preview.css` и `site/preview.html`
- 🟩 **Этап 3**: Сборка клиентских бандлов и статических ассетов (`npm run build:preview && node ops/build-learning-production-assets.mjs`)
- 🟩 **Этап 4**: Верификация визуальных тестов (`test-lesson-visual-components.mjs`, `test-wordwall-url-ingest.mjs`)
- 🟩 **Этап 5**: Изолированная индексация изменений в Git (`git add`)
