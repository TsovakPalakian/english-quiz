# План стабилизации таймаутов браузерных тестов при параллельной нагрузке

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей изолированной задаче. Запрещено затрагивать логику приложения, серверные воркеры, Durable Objects или структуру проверяемых данных. Изменения строго и изолированно ограничены добавлением явных безопасных таймаутов `{timeout: 60000}` в вызовы `page.waitForFunction` в тестовых файлах [`test/test-chat-recording-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-recording-ui.mjs) и [`test/test-speech-practice-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs) для предотвращения таймаутов при высокой процессорной нагрузке во время пакетного прогона `check-all`.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Таймаут в `test-chat-recording-ui.mjs`**:
   - Код: [`test/test-chat-recording-ui.mjs:63`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-recording-ui.mjs#L63).
   - Функция: `const waitSent=async count=>{await page.waitForFunction(count=>document.querySelectorAll('.msg-message[data-msg-id]').length>=count,count);assert.equal(sent.length,count);};`.
   - Проблема: при запуске 224 тестовых сценариев параллельно процессорное время распределяется между десятками экземпляров Chromium, и MediaRecorder / WebSocket не успевает доставить сообщение за 10 000 мс (`Timeout 10000ms exceeded`).

2. **Таймаут в `test-speech-practice-ui.mjs`**:
   - Код: [`test/test-speech-practice-ui.mjs:40`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs#L40).
   - Функция: `await page.waitForFunction(()=>document.querySelector('[data-speech-stats]')?.textContent.includes('Count: 1'));`.
   - Проблема: при высокой конкуренции параллельных тестов цепочка `upload` -> `analyze` -> `load` -> перерисовка графика и блока статистики `[data-speech-stats]` занимает более 30 000 мс (`Timeout 30000ms exceeded`).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`test/test-chat-recording-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-recording-ui.mjs): добавление `{timeout: 60000}` в `waitSent`.
  - [`test/test-speech-practice-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs): добавление `{timeout: 60000}` в `waitForFunction` ожидания обновления статистики.

- **Инварианты**:
  - Все проверяемые утверждения `assert.equal`, `assert.deepEqual`, `assert.match` сохраняются без изменений.
  - Логика тестируемых компонентов чата и речевой практики не затрагивается.
  - При быстром выполнении (в отсутствие перегрузки процессора) тесты завершаются мгновенно без ожидания полного таймаута.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Добавление адаптивного таймаута в [`test/test-chat-recording-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-recording-ui.mjs).
- 🟩 **Этап 2**: Добавление адаптивного таймаута в [`test/test-speech-practice-ui.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs).
- 🟩 **Этап 3**: Верификация целевых тестов и проверка устойчивости.

---

## 4. Детерминированный метод верификации (Verification Method)

1. `node --test test/test-chat-recording-ui.mjs`
2. `node --test test/test-speech-practice-ui.mjs`
3. `node --test test/test-chat-live-contacts-search.mjs`
