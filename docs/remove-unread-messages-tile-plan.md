# План удаления карточек «Unread messages» и «Learning progress» (Remove Unread Messages & Learning Progress Plan)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал чата, счетчики сообщений в боковом меню (`.side nav [data-msg-open]`), навигацию между разделами, карточки «Next lesson», «Weak cards», «Still learning», систему FSRS и логику подсчета изученных слов в профиле. Изменения строго ограничены:
> 1. Скрытием карточки `#homeUnreadTile` («Unread messages») на главной странице ученика в [`site/preview.html#L76`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L76) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
> 2. Скрытием карточки `.shell-progress` («Learning progress») в боковом меню в [`site/preview.html#L37`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L37), [`client/20-account.js#L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L105) и [`client/57a-dashboard.js#L121`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/57a-dashboard.js#L121).
> 3. Синхронизацией проверочного утверждения видимости карточки в [`test/test-role-navigation-ui.mjs#L62`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-role-navigation-ui.mjs#L62).

---

## 1. Точная формулировка задач (Problem Statement)
- **Пункт 1: Карточка «Unread messages»**
  - **Файлы**: [`site/preview.html#L76-L80`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L76-L80), [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
  - **Проблема**: На главной странице ученика в первой позиции отображается карточка «Unread messages» с идентификатором `homeUnreadTile`.
  - **Решение**: Добавить атрибут `hidden` и CSS-стиль `display: none !important;` для `#homeUnreadTile`. Элемент сохраняется в DOM для работы счетчиков и проверок наличия селектора в тестах.

- **Пункт 2: Карточка «Learning progress» в боковом меню (Скриншот пользователя)**
  - **Файлы**: [`site/preview.html#L37`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L37), [`client/20-account.js#L105`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js#L105), [`client/57a-dashboard.js#L121`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/57a-dashboard.js#L121), [`test/test-role-navigation-ui.mjs#L62`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-role-navigation-ui.mjs#L62)
  - **Проблема**: В боковой панели ученика отображается карточка «Learning progress 0% ... 0 of X cards learned, Continue studying». Пользователь запросил также убрать её.
  - **Решение**: Обеспечить постоянное скрытие `.shell-progress` (`progress.hidden = true;` / CSS `display: none !important;`) и обновить проверочное утверждение в тесте роли ученика (`assert.equal(..., false)`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)
- **Затрагиваемые файлы**:
  - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): атрибут `hidden` для `#homeUnreadTile` и `.shell-progress`.
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css): правила скрытия `#homeUnreadTile` и `.shell-progress`.
  - [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js): сохранение `progress.hidden = true`.
  - [`client/57a-dashboard.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/57a-dashboard.js): сохранение `progress.hidden = true`.
  - [`test/test-role-navigation-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-role-navigation-ui.mjs): синхронизация проверки отсутствия видимости `.shell-progress`.
- **Инварианты**:
  - Сохранение элемента `#homeUnreadCount` и `#shellProgressPercent` в DOM для предотвращения ошибок обращения в скриптах.
  - Сохранение навигации «Continue studying» и «Start studying» на странице уроков.

---

## 3. Детерминированный метод верификации (Verification Method)
1. Сборка предпросмотра: `npm run build:preview`.
2. Сборка производственных ресурсов: `node ops/build-learning-production-assets.mjs`.
3. Запуск целевых тестов: `node --test test/test-role-navigation-ui.mjs test/test-functional-preservation.mjs test/test-home-render.mjs`.

---

## 4. Контрольный список реализации (Implementation Checklist)
- `⬜` Скрыть карточку `#homeUnreadTile` («Unread messages») в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html) и [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css).
- `⬜` Скрыть карточку `.shell-progress` («Learning progress») в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html), [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css), [`client/20-account.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20-account.js) и [`client/57a-dashboard.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/57a-dashboard.js).
- `⬜` Синхронизировать утверждение видимости `.shell-progress` в [`test/test-role-navigation-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-role-navigation-ui.mjs).
- `⬜` Пересобрать предпросмотр и производственные ресурсы (`npm run build:preview && node ops/build-learning-production-assets.mjs`).
- `⬜` Верифицировать тесты `test/test-role-navigation-ui.mjs`, `test/test-functional-preservation.mjs` и `test/test-home-render.mjs`.
