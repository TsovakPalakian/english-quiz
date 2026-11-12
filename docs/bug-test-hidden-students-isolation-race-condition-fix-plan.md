# План устранения плавающего сбоя (race condition) в test-hidden-students-isolation.mjs

## 1. Точная формулировка проблемы и ссылки на код
В тесте [test/test-hidden-students-isolation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs#L286-L298) периодически (примерно в 1 из 4–5 запусков) возникает ошибка:
```
AssertionError [ERR_ASSERTION]: Developer must see Students · 6, saw: 
    at TestContext.<anonymous> (test/test-hidden-students-isolation.mjs:297:12)
```
Обратите внимание: `saw: ` возвращает абсолютно пустую строку `""`.

### Причина гонки (Root Cause):
1. В первой части теста (проверка под ролью учителя) вызов `paintGroups()` в [client/52-lessons.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L168-L170) асинхронно запускает `loadGroupDirectory()`:
   ```javascript
   if (isTeacher() && !sessionIsDeveloper() && !viewAccount && typeof loadGroupDirectory === "function" && !groupDirectoryReady()) {
     loadGroupDirectory().then(() => { if (document.querySelector("section.on")?.id === "groups") paintGroups(); });
   }
   ```
2. Функция `loadGroupDirectory()` отправляет 3 асинхронных сетевых запроса (`/api/admin/users`, `/api/groups/members`, `/api/accounts/group-teachers`). Тест не дожидается завершения этого фонового промиса и сразу переходит ко второй части (проверка под ролью разработчика).
3. Во второй части теста меняется роль на `DEVELOPER`, вызывается `groupPull(true)` и перерисовывается карточка со значением `Students · 6`.
4. В этот же момент (с задержкой в несколько миллисекунд) промис от `loadGroupDirectory()` из шага 1 наконец резолвится и вызывает колбэк `then(() => paintGroups())`.
5. Метод `paintGroups()` выполняет `box.innerHTML = "<h2>Study groups</h2>" + rows.map(...)`, очищая и заново собирая DOM-дерево списка групп.
6. Вызов `await b1Card.innerText()` в строке 296 попадает ровно в момент, когда старый узел уже отсоединен/очищен, а новый узел еще не возвращен браузером, возвращая пустую строку `""`.

## 2. Границы области действия и инварианты (Scope Boundaries & Invariants)
- **Строгая изоляция функционала**:
  > [!IMPORTANT]
  > <span style="color: red; font-weight: bold;">WARNING</span>: Логика приложения, серверные контракты и разметка карточек групп не модифицируются. Исправление изолировано исключительно в тестовом файле [test/test-hidden-students-isolation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs).
- В [test/test-hidden-students-isolation.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-hidden-students-isolation.mjs#L264-L298):
  1. Перед переключением контекста на роль разработчика дождаться завершения фонового промиса `loadGroupDirectory` (`await (typeof groupDirectoryJob !== "undefined" && groupDirectoryJob?.promise ? groupDirectoryJob.promise : Promise.resolve())`).
  2. Заменить однократное чтение текста через `b1Card.innerText()` на детерминированное автоповторяющееся ожидание стабилизации содержимого DOM через `page.waitForFunction`:
     ```javascript
     await page.waitForFunction(() => {
       const el = document.querySelector("#groupList .day-row");
       return el && el.innerText.trim().length > 0 && el.innerText.includes("Students · 6");
     }, { timeout: 5000 });
     ```
  3. Считывать стабилизированный текст карточки напрямую из актуального DOM-узла страницы.

## 3. Детерминированный метод верификации
- Запуск стресс-теста: цикл из 20 последовательных прогонов `test/test-hidden-students-isolation.mjs` без единого сбоя (`for i in {1..20}; do node --test test/test-hidden-students-isolation.mjs || break; done`).
- Прогон всего пула смежных тестов.

## 4. Контрольный список реализации (Checklist)
- 🟩 **Этап 1**: Анализ причины пустой строки `saw: `, подготовка и согласование плана с пользователем
- 🟩 **Этап 2**: Ожидание фонового промиса `loadGroupDirectory` и внедрение детерминированного ожидания стабилизации DOM через `page.waitForFunction` в `test/test-hidden-students-isolation.mjs`
- 🟩 **Этап 3**: Стресс-тестирование (20/20 успешных прогонов подряд)
- 🟩 **Этап 4**: Изолированная индексация изменений в Git (`git add`)
