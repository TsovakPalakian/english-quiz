# План отключения замыливания/вуали фона по умолчанию (без блюра)

## 1. Постановка задачи и ссылки на код
1. **Фон темы по умолчанию (`almond`)**:
   - В теме `almond` ([`client/02-themes.js#L401`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/02-themes.js#L401)) поверх фоновой картины `almond-blossom.jpg` накладывался полупрозрачный слой `--photo-wash: #D4EEEA99;` ([`site/preview.css#L468`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L468)).
   - Правило в [`site/preview.css#L1317`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L1317) и [`production/chat.css#L241`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L241) использует этот слой:
     ```css
     background-image: linear-gradient(var(--photo-wash, transparent), var(--photo-wash, transparent)), var(--theme-photo, none);
     ```
   - Задано значение токена `--photo-wash: transparent;` в [`site/preview.css#L468`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L468) и синхронизировано в [`preview.css#L393`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.css#L393).
   - Картина `almond-blossom.jpg` отображается полностью чистой и чёткой как на основном сайте, так и в чате.

---

## 2. Границы области изменений и изоляция функционала

> [!WARNING]
> **БЛОК ЗАПРЕТА ЗАТРАГИВАНИЯ СМЕЖНОГО ФУНКЦИОНАЛА:**
> Строго запрещено модифицировать или нарушать поведение компонентов, не относящихся к текущей задаче. Изменения изолированы исключительно токеном `--photo-wash` темы `almond` в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и [`preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.css). Логика сообщений, сессий, уроков, экзаменов и палитры остальных тем оформления не затрагиваются.

---

## 3. Этапы реализации и чеклист

- 🟩 **Этап 1**: Подготовка полноэкранных скриншотов через локальный HTTP-сервер (Скриншот 1 и Скриншот 2) и согласование с пользователем (утверждён Скриншот 2 со словом `do`).
- 🟩 **Этап 2**: Изменение значения токена `--photo-wash` на `transparent` в [`site/preview.css#L468`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L468) и [`preview.css#L393`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.css#L393).
- 🟩 **Этап 3**: Написание целевого модульного и визуального теста `test/test-default-theme-background.mjs`.
- 🟩 **Этап 4**: Сборка продакшн-ассетов через `ops/build-learning-production-assets.mjs` и детерминированная проверка тестами.
