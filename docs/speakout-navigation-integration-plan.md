# План бесконфликтной интеграции Speakout A1 Unit 1 и устранения регрессии test-ui-boot

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче интеграции Speakout A1 Unit 1. Выполняемая задача строго и изолированно затрагивает сохранение контракта открытия `#speakouteditor.on` платформы, размещение карточки запуска интерактивной студии Speakout внутри редактора уроков и обработку query-параметра `lesson` в модуле Speakout.

---

### Скриншот 29: Исходное состояние экрана редактора платформы со строкой Nothing on this page yet
![Скриншот 29: Исходное состояние экрана редактора платформы со строкой Nothing on this page yet](docs/speakout-screenshot-29-platform-editor-empty-state.png)

### Скриншот 17: Утвержденный единый экран первой очереди Speakout (состояние Lesson 1A Hello: PDF.js + полоса треков + Keys)
![Скриншот 17: Утвержденный единый экран первой очереди Speakout](docs/speakout-screenshot-17-approved-single-screen.jpg)

---

### План и контрольный список выполнения (Checklist)

* `🟩` **Этап 1. Документирование и фиксация архитектурного решения**
  * Обновлен план работ для устранения `ReferenceError: lmState is not defined` в тесте `test/test-ui-boot.mjs`.

* `🟩` **Этап 2. Восстановление штатного контракта навигации платформы**
  * Из [client/03-core.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/03-core.js) и [client/main/main-hooks.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js) удален принудительный редирект `window.location.href`, открытие уроков штатно выполняется через экран `#speakouteditor.on`.

* `🟩` **Этап 3. Интеграция кнопки запуска интерактивной студии в редакторе**
  * В [production/speakout-editor.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/speakout-editor.js) на экране `#speakouteditor` для уроков A1 Unit 1 (1A и 1D) внедрена контрастная карточка запуска с кнопкой `Open Speakout Studio`, открывающей интерактивную студию со страницами 8–9 учебника, звуковыми дорожками и ключами.

* `🟩` **Этап 4. Сборка продакшн-ассетов**
  * Выполнена детерминированная пересборка `preview.js` через `npm run build:preview` и синхронизация ассетов через `ops/build-learning-production-assets.mjs`.

* `🟩` **Этап 5. Верификация тестов платформы и модуля Speakout**
  * Тест [test/test-ui-boot.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-ui-boot.mjs) успешно пройден: 113 из 113 проверок завершены успешно (0 сбоев).
  * Все 70 тестов в `speakout/tests/` успешно пройдены (0 сбоев).
  * Все 153 теста `vitest` успешно пройдены (0 сбоев).
