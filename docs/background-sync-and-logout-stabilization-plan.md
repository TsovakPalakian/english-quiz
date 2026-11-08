# План полной ликвидации блокировок очереди синхронизации и реализации невидимой фоновой работы

> [!WARNING]
> Запрещено модифицировать или ломать функционал, не относящийся к текущей задаче. Задача TASK-19 полностью исключена из скоупа. Все изменения строго изолированы в логике обработки локальной очереди и выхода из системы в [client/main/main-bridge.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js).

---

## 1. Точная формулировка проблемы и анализ исходного кода

### Дефект 1: Блокировка выхода из аккаунта («даже перезайти не могу»)
* **Файл**: [client/main/main-bridge.js#L280-L281](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L280-L281)
* **Вызов**: [client/40-account.js#L241](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/40-account.js#L241)
* **Следствие**: Метод `accountFetch('/api/logout')` выбрасывает исключение при наличии неудалённых записей в `personalQueue` или `pending`. Цепочка `leaveAccount({ signedOut: true })` прерывается, сессия не завершается. Пользователь заблокирован в текущем профиле (Скриншот 4).

### Дефект 2: Блокировка сохранения уроков и черновиков
* **Файл**: [client/main/main-bridge.js#L438-L440](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L438-L440)
* **Вызов**: [client/52b-lesson-pdf-import.js#L1232](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js#L1232)
* **Следствие**: Метод `perform()` требует предварительного вызова `drainPersonal()`. Если запись в очереди была заморожена со статусом `paused = true` ([client/main/main-bridge.js#L569](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L569)), `drainPersonal()` без параметра `retry = true` её пропускает ([client/main/main-bridge.js#L508](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L508)). Выбрасывается блокирующая ошибка `Personal changes are not saved yet...` (Скриншот 2).

### Дефект 3: Навязчивые модальные окна при навигации
* **Файл**: [client/main/main-bridge.js#L894-L898](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L894-L898)
* **Следствие**: На событии `DOMContentLoaded` при наличии неотправленных записей в `localStorage` вызывается `notice('Есть неподтверждённая операция...', true)`. На несвязанных экранах (в чате на Скриншоте 1 и в уроках на Скриншоте 3) всплывает блокирующее модальное окно.

### Дефект 4: Обрезание текста уведомления
* **Файл**: [client/main/main-bridge.js#L92](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L92)
* **Словарь**: [production/ui-english.json#L59](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/ui-english.json#L59)
* **Следствие**: Регулярное выражение удаляет `reload server.` в конце предложения, оставляя оборванный фрагмент `...then retry or`.

---

## 2. Архитектурное решение: 100% невидимая фоновая синхронизация

Интерфейс пользователя должен быть полностью освобождён от любых технических окон, плашек, тостов и сообщений (Скриншот 8):
1. **Снятие блокировки с выхода**: Метод `/api/logout` в [client/main/main-bridge.js#L281](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L281) безусловно очищает локальную очередь и позволяет завершить сессию.
2. **Ликвидация модального диалога**: Удаление вызова `notice(..., true)` на `DOMContentLoaded` в [client/main/main-bridge.js#L896](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L896).
3. **Разблокировка сохранения материалов**: Исключение проверки `if(personalQueue.length) throw new Error(...)` в [client/main/main-bridge.js#L440](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L440).
4. **Автономная досылка**: Очередь тихо досылается в фоне без участия пользователя, с автоповтором по событию `online`. При несовпадении `actorId` чужая очередь сбрасывается.

---

## 3. Чек-лист реализации

- 🟩 Этап 1: Удаление блокирующей ошибки при вызове `/api/logout` в [client/main/main-bridge.js#L281](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L281).
- 🟩 Этап 2: Удаление автоматического показа модального диалога на событии `DOMContentLoaded` в [client/main/main-bridge.js#L896](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L896).
- 🟩 Этап 3: Снятие барьера `throw new Error('Personal changes are not saved yet...')` в [client/main/main-bridge.js#L440](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L440).
- 🟩 Этап 4: Обеспечение автономной фоновой синхронизации по событию `online` и автоматического сброса очереди чужого аккаунта в [client/main/main-bridge.js#L508-L525](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-bridge.js#L508-L525).
- 🟩 Этап 5: Написание целевых модульных тестов в `test/test-learning-main.mjs` и визуального теста `test/test-clean-ui-background-sync.mjs`.

---

## 4. Методика верификации

1. Выполнение модульных тестов: `node --test test/test-learning-main.mjs`.
2. Сборка производственных артефактов: `npm run build:preview`.
3. Визуальная сверка интерфейса со Скриншотом 8 (полное отсутствие всплывающих окон и плашек).
