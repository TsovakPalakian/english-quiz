# План восстановления политики frame-ancestors в src/learning-embed.mjs

<span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче восстановления политики `frame-ancestors 'none'`. Задача строго и изолированно затрагивает константу `stageContentPolicy` в [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs#L2) для прохождения теста [test/test-learning-song-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-song-media.mjs#L227). Все остальные модули, маршруты API и тесты платформы остаются неизменными.

---

## 1. Точная причина сбоя теста

В [test/test-learning-song-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-song-media.mjs#L227) в тесте `Lesson media HTTP protects role/origin and resolves local files without R2` выполняется проверка:
```javascript
assert.match(fetched.headers.get('content-security-policy'), /frame-ancestors 'none'/);
```
В файле [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs#L2) директива константы `stageContentPolicy` содержала `frame-ancestors 'self'`. Это вызвало несовпадение с регулярным выражением `/frame-ancestors 'none'/` и привело к ошибке `AssertionError [ERR_ASSERTION]`.

---

## 2. Изолированное решение

1. В константе `stageContentPolicy` файла [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs#L2) восстановить значение директивы `frame-ancestors 'none'`.
2. Выполнить сборку продакшен-ассетов: `node ops/build-learning-production-assets.mjs` и `npm run build:preview`.
3. Запустить целевой тест: `node --test test/test-learning-song-media.mjs`.
4. Запустить все 70 тестов Speakout: `node --test speakout/tests/*.test.js`.

---

## 3. Чек-лист реализации

- 🟩 **Этап 1**: Восстановление `frame-ancestors 'none'` в [src/learning-embed.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-embed.mjs#L2)
- 🟩 **Этап 2**: Сборка продакшен-ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`
- 🟩 **Этап 3**: Верификация теста [test/test-learning-song-media.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-learning-song-media.mjs)
- 🟩 **Этап 4**: Верификация всех 70 проверок в `speakout/tests/*.test.js`
