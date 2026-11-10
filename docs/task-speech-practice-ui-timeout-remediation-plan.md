# План устранения тайм-аута в тесте test-speech-practice-ui.mjs

> [!WARNING]
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемая задача строго и изолированно затрагивает стабилизацию времени записи и диагностику ошибок в [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs). Исходный код приложения и серверные модули остаются неизменными.

---

### Анализ первопричины сбоя (Root-Cause Analysis)

1. В [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs#L31) запись аудио длится ровно 750 мс:
   `await new Promise(resolve=>setTimeout(resolve,750));`
2. В модуле [ops/local-speech-provider.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/local-speech-provider.mjs#L2) установлено минимальное требование к длительности образца речи: `minimumSeconds: 0.5`.
3. При параллельном выполнении всего набора тестов через `ops/check-all.mjs` (8 воркеров Node.js и 3 процесса браузера Chromium) нагрузка на процессор приводит к задержке передачи аудиобуферов в `ScriptProcessorNode` (размер буфера 4096 сэмплов при частоте 16 кГц равен 256 мс). Если за 750 мс успевает заполниться только 1 буфер (256 мс), длительность записи составляет 0.256 секунды, что строго меньше пороговых 0.5 секунды.
4. Серверный валидатор в [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L112) отклоняет запрос с ошибкой `400 Record a longer sample before sending for analysis.`.
5. Клиент отображает ошибку в `#notice`, запись не сохраняется в базу данных, и вызов `page.waitForFunction` в [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs#L40) ожидает появления `Count: 1` до истечения предельного тайм-аута 60000 мс.

---

### Контрольный список реализации

- 🟩 **Этап 1: Документация и планирование**
  - Создание проектного документа плана в `docs/` с изолированным чек-листом.
- 🟩 **Этап 2: Стабилизация теста записи речи**
  - Увеличение времени удержания записи в [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs#L31) с 750 мс до 1600 мс, что гарантирует сбор не менее 5 буферов (более 1.2 секунды аудио) даже при высокой нагрузке на процессор.
  - Добавление проверки `#notice.error` в предикат `page.waitForFunction` в [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs#L40) для немедленного выявления серверных ошибок валидации вместо зависания на 60 секунд.
- 🟩 **Этап 3: Проверка и полный прогон тестового набора**
  - Запуск изолированного теста [test/test-speech-practice-ui.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-speech-practice-ui.mjs).
  - Выполнение полного набора тестов `npm run check`.
- 🟩 **Этап 4: Финальный отчет и коммит**
  - Фиксация статусов чек-листа `🟩`.
  - Предоставление финального отчета и коммит-сообщения.
