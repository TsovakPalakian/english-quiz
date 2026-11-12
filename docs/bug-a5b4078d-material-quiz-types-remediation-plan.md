# План устранения ошибки TypeError в lmPaintChrome (Bug ID: `a5b4078d314f77640bc98606eb54386b`)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к безопасной инициализации панели добавления контента `#lmPicker` и проверке наличия объекта `window.MaterialQuiz`. Запрещено затрагивать алгоритмы подсчета баллов, структуру базы данных, логику авторизации сессий, серверные обработчики воркеров, расписание групп, медиа-плеер или сторонние секции уроков. Все изменения строго и изолированно ограничены файлами:
> 1. [`client/main/material-upgrades.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js);
> 2. Сборка производных ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`;
> 3. Добавление изолированных модульных тестов в [`test/test-material-quiz-demand-resilience.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-material-quiz-demand-resilience.mjs).

---

### Скриншот 1: Экран `daysetup` с панелью навигации и кнопкой перехода к материалу урока
![Скриншот 1: Экран daysetup с панелью навигации и кнопкой перехода к материалу урока](bug-a5b4078d-screenshot-1-daysetup-navigation.png)

### Скриншот 2: Всплывающая панель «Add content» (`#lmPicker`) с сеткой блоков и списком типов тестов
![Скриншот 2: Всплывающая панель Add content (#lmPicker) с сеткой блоков и списком типов тестов](bug-a5b4078d-screenshot-2-lm-picker-content.png)

### Скриншот 3: Верификация устранения сбоя в Playwright при переходе с daysetup на material
![Скриншот 3: Верификация устранения сбоя в Playwright при переходе с daysetup на material](bug-a5b4078d-screenshot-verification.png)

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Идентификатор инцидента**: Bug ID `a5b4078d314f77640bc98606eb54386b`
- **Маршрут / Экран**: `CLIENT /`, экран `daysetup`
- **Роль**: `DEVELOPER`, аккаунты `TsovakDev`, `Somestudent`
- **Стек ошибки**:
  ```
  TypeError: Cannot read properties of undefined (reading 'types')
      at lmPaintChrome (https://lumiscia.org/preview.js?v=11d89af862777c85:38878:611)
      at lmShow (https://lumiscia.org/preview.js?v=11d89af862777c85:25134:7)
      at HTMLDocument.<anonymous> (https://lumiscia.org/preview.js?v=11d89af862777c85:3133:9)
  ```
- **Хронология действий пользователя**:
  1. Пользователь находился на экране настройки дня [`daysetup`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L782).
  2. Перешел в ошибки по клику на кнопку `#dayMistakes` (экран `errors`).
  3. Вернулся назад по клику на `#errorsBack` (`[data-nav-back]`), вернувшись на экран `daysetup`.
  4. Нажал кнопку хлебных крошек с атрибутами `action: "pagePath,pageTab"` (`data-page-path="material"` и `data-page-tab="overview"`).
  5. В обработчике клика в [`client/00-core.js#L370-L375`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/00-core.js#L370-L375) сработала ветка:
     ```javascript
     if (target.dataset.pagePath === "material") {
       pushHistory();
       lmState.tab = target.dataset.pageTab || "overview";
       lmShow("preview");
       rememberPlace();
     } else visit(target.dataset.pagePath);
     ```
  6. Функция `lmShow("preview")` в [`client/52-lessons.js#L1581`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js#L1581) вызвала `lmPaintChrome()`.
  7. Функция `lmPaintChrome()` была переопределена в [`client/main/material-upgrades.js#L91-L97`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L91-L97):
     ```javascript
     picker.innerHTML='...'+'<div class="lm-picker-grid" data-material-quiz-types hidden>'+window.MaterialQuiz.types.filter(type=>!lmState?.examOwned||type!=='Flip').map(type=>'<button type="button" data-add-block="quiz" data-quiz="'+type+'">'+type+'</button>').join('')+'</div>';
     ```
  8. Поскольку модуль `/material-quiz.js` загружается асинхронно по требованию ([`production/catalog-loader.js#L168-L175`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/catalog-loader.js#L168-L175)), а экран `daysetup` не входит в список автоматического предзапроса в [`client/main/main-hooks.js#L1743`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L1743), глобальный объект `window.MaterialQuiz` на момент синхронного выполнения `lmPaintChrome()` имел значение `undefined`.
  9. Чтение свойства `.types` у `undefined` вызвало неперехваченное исключение `TypeError: Cannot read properties of undefined (reading 'types')`, заблокировав дальнейшее переключение интерфейса.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - В [`client/main/material-upgrades.js#L90-L97`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L90-L97) внедрить безопасное чтение списка типов тестов с отказоустойчивым массивом по умолчанию:
     ```javascript
     const quizTypes = window.MaterialQuiz?.types || ['Choice','Select all','True / false','Type','Gap','Build','Match','Listen','Spell','Memory','Tap','Reverse','Letters','Definition','Odd one out','Hangman','Flip'];
     if (!window.MaterialQuiz && typeof window.ensureMaterialQuiz === 'function') window.ensureMaterialQuiz();
     ```
   - В [`client/main/material-upgrades.js#L173`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L173) добавить защитную проверку `window.MaterialQuiz?.render ? window.MaterialQuiz.render(...) : '<div class="material-quiz-loading">Loading quiz…</div>'`, аналогично [`client/main/exam-workflow.js#L68`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/exam-workflow.js#L68).
   - В [`client/main/material-upgrades.js#L235`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L235) использовать безопасный вызов `window.MaterialQuiz?.bind(root, ...)`.
   - В [`client/main/main-hooks.js#L1743`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js#L1743) включить `'daysetup'` в перечень экранов предварительной загрузки `ensureMaterialQuiz`.
2. **Контракт интерфейса**:
   - Сохранение полной функциональности всплывающего пикера добавления контента `#lmPicker` как в обычном режиме уроков, так и в режиме экзамена (`lmState?.examOwned`);
   - Полное сохранение состава 17 типов викторин: `Choice`, `Select all`, `True / false`, `Type`, `Gap`, `Build`, `Match`, `Listen`, `Spell`, `Memory`, `Tap`, `Reverse`, `Letters`, `Definition`, `Odd one out`, `Hangman`, `Flip`;
   - Предотвращение сбоев при синхронном вызове `lmPaintChrome()` до завершения асинхронного сетевого запроса скрипта `/material-quiz.js`.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Создание изолированного воспроизводящего теста в [`test/test-material-quiz-demand-resilience.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-material-quiz-demand-resilience.mjs), проверяющего вызов `lmPaintChrome()` при отсутствии `window.MaterialQuiz` (`undefined`).
- 🟩 **Этап 2**: Реализация безопасного fallback-списка типов тестов и защитных проверок в [`client/main/material-upgrades.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js) и добавление `'daysetup'` в [`client/main/main-hooks.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/main-hooks.js).
- 🟩 **Этап 3**: Сборка производных ассетов через `node ops/build-learning-production-assets.mjs` и `npm run build:preview`.
- 🟩 **Этап 4**: Прогон целевого теста `node --test test/test-material-quiz-demand-resilience.mjs` и смежных тестов `test/test-screen-demand.mjs`.
- 🟩 **Этап 5**: Фиксация результатов верификации и предоставление отчета с единым обобщенным коммитом.
