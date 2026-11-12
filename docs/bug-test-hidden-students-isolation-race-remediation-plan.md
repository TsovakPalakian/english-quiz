# План устранения состояния гонки в тесте test-hidden-students-isolation.mjs

## 1. Точная формулировка проблемы и ссылки на код
В CI-окружении GitHub Actions тест [test/test-hidden-students-isolation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs#L272-L278) завершился с ошибкой:
`AssertionError [ERR_ASSERTION]: Teacher must see Students · 3, saw: `

Причина:
При вызове `window.enquizVisit('groups')` и `groupPull(true)` в браузере запускается первоначальная отрисовка карточек групп, а также асинхронный запрос каталогов `loadGroupDirectory()`, который по завершении повторно вызывает `paintGroups()`, перезаписывая `box.innerHTML`.
В более медленном CI-раннере селектор `b1Card.waitFor({timeout: 5000})` срабатывает на карточку из первой отрисовки, после чего `b1Card.innerText()` вызывается ровно в момент очистки/замены DOM-узлов `box.innerHTML`, возвращая пустую строку `""` (`saw: `).

## 2. Границы области действия и инварианты (Scope Boundaries & Invariants)
- **Строгая изоляция функционала**:
  > [!IMPORTANT]
  > <span style="color: red; font-weight: bold;">WARNING</span>: Функционал скрытия студентов, серверные и клиентские права доступа (`role === 'DEVELOPER'` vs `ADMIN`) и верстка карточек групп остаются строго неизменными.
- В [test/test-hidden-students-isolation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs#L272-L298) заменить ожидание простого селектора карточки на селектор с ожиданием контента:
  - Для учителя: `await page.locator('#groupList .day-row:has-text("B1 Group"):has-text("Students · 3")').waitFor({timeout: 5000});`
  - Для разработчика: `await page.locator('#groupList .day-row:has-text("B1 Group"):has-text("Students · 6")').waitFor({timeout: 5000});`
  Это гарантирует, что Playwright автоповторами дождется завершения асинхронных перерисовок `paintGroups()`.

## 3. Детерминированный метод верификации
- `node --test test/test-hidden-students-isolation.mjs`
- `npm run build:preview && node ops/build-learning-production-assets.mjs`

## 4. Контрольный список реализации (Checklist)
- 🟩 **Этап 1**: Анализ сбоя, подготовка и согласование плана с пользователем
- 🟩 **Этап 2**: Устранение гонки рендеринга в `test/test-hidden-students-isolation.mjs` через контентно-зависимые локаторы Playwright
- 🟩 **Этап 3**: Верификация прохождения теста локально и проверка всех сопутствующих тестов
- 🟩 **Этап 4**: Изолированная индексация изменений в Git (`git add`)
