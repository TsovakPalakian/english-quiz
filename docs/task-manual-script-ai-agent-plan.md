# План реализации ИИ-агента инструкций в Manual Script (Natural Language Command & Function Calling) с обязательным одобрением

> <span style="color: red; font-weight: bold;">WARNING</span>: Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал: обработку естественных команд в поле `#lmScriptInput` вкладки `📝 Manual Script` в [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html), распределение по вкладкам урока (`Words · X`, `Phrases · Y`, `Rules · Z`), автономную генерацию русских переводов и примеров моделью Gemini в [`src/lesson-pdf-meta.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs), клиентский диспетчер вызова целевых функций в [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js) / [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js), этап обязательного предварительного одобрения распознанных действий (Approval Gate) перед изменением `lmState.blocks`, стили в [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css) и целевые тесты в `test/test-manual-script-ai-agent.mjs`.

---

## 1. Кадры интерфейса (Screenshots & Mockups)

### Скриншот 1: Ввод текста пользователя в Manual Script без перевода в теме Sky (`data-theme="sky"`)
![Скриншот 1: Ввод текста пользователя в Manual Script без перевода в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-1-sky.png)
*Скриншот 1: Вкладка «📝 Manual Script» с точным текстом запроса («Добавь эти слова или фразы...» без перевода) на фоне активного урока («Words · 6 | Phrases · 6 | Rules · 2») и кнопкой «✨ Execute AI Command →» в теме Sky.*

### Скриншот 2: Ввод текста пользователя в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 2: Ввод текста пользователя в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-2-dark.png)
*Скриншот 2: Контрастное отображение вкладки Manual Script в теме Dark с системными токенами `--bg`, `--card`, `--ink`, `--line`.*

### Скриншот 3: Ввод текста пользователя в светлой теме Sand (`data-theme="sand"`)
![Скриншот 3: Ввод текста пользователя в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-3-sand.png)
*Скриншот 3: Отображение вкладки Manual Script в альтернативной светлой теме Sand.*

### Скриншот 4: Экран подтверждения со сгенерированными переводами и распределением в Phrases в теме Sky (`data-theme="sky"`)
![Скриншот 4: Экран подтверждения со сгенерированными переводами и распределением в Phrases в теме Sky](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-4-approval-sky.png)
*Скриншот 4: ИИ автоматически перевел фразы на русский язык, составил примеры, определил назначение «Phrase → Phrases · 6 ➔ 9» и ожидает подтверждения по кнопке «✓ Approve & Add to Lesson» в теме Sky.*

### Скриншот 5: Экран подтверждения в тёмной теме Dark (`data-theme="dark"`)
![Скриншот 5: Экран подтверждения в тёмной теме Dark](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-5-approval-dark.png)
*Скриншот 5: Контрастное отображение экрана подтверждения добавления фраз в теме Dark.*

### Скриншот 6: Экран подтверждения в светлой теме Sand (`data-theme="sand"`)
![Скриншот 6: Экран подтверждения в светлой теме Sand](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-user-example-manual-script-screenshot-6-approval-sand.png)
*Скриншот 6: Отображение экрана подтверждения в светлой теме Sand.*

---

## 2. Ответ на ключевой вопрос: добавятся ли слова и фразы?

1. **ДА, ОНИ ДОБАВЛЯЮТСЯ НАПРЯМУЮ В СЛОВАРИ УРОКА**:
   - При одобрении фразы (`make future plans`, `make a to-do list`, `plan things in advance`) автоматически добавляются в словарь **Phrases**, и счетчик урока в редакторе сразу меняется: `Phrases · 6` &rarr; **`Phrases · 9`**.
   - Если во входном тексте есть одиночные слова (например, `detour`, `commute`), они добавляются в словарь **Words**, увеличивая счетчик `Words · 6` &rarr; **`Words · 8`**.
   - Если во входном тексте есть грамматические правила, они добавляются в словарь **Rules**, увеличивая счетчик `Rules · 2` &rarr; **`Rules · 3`**.
2. **Перевода может не быть во входном тексте**:
   - Если пользователь вставил только английские строки без перевода, ИИ **сам переводит их на русский язык** и генерирует контекстные примеры употребления.
   - Пользователь видит сгенерированные переводы на экране подтверждения и может их при желании скорректировать перед добавлением.
3. **Обязательный этап одобрения**:
   - Перед тем как записать новые блоки в урок, ИИ показывает таблицу с распознанными единицами, выбранным целевым словарем (`Words`, `Phrases`, `Rules`) и сгенерированными переводами.
   - По нажатию кнопки `✓ Approve & Add to Lesson` изменения необратимо и надежно вносятся в структуру текущего урока (`lmState.blocks`).

---

## 3. Границы изменений и инварианты

1. **Изолированные файлы**:
   - [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html): обновление плейсхолдера и добавление контейнера подтверждения `#lmScriptApprovalWrap`.
   - [`src/lesson-pdf-meta.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/lesson-pdf-meta.mjs): расширение промпта Gemini для распознавания команд и авто-перевода при отсутствии русскоязычного перевода.
   - [`client/52-lessons.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52-lessons.js): функция `lmEnsurePhrasesInLesson` и `lmEnsureRulesInLesson` для прямого добавления во вкладки `phrases` и `rules`.
   - [`client/52b-lesson-pdf-import.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/52b-lesson-pdf-import.js): клиентский обработчик команд и таблица подтверждения.
   - `test/test-manual-script-ai-agent.mjs`: целевые тесты распознавания, перевода и распределения по словарям.
2. **Инварианты**:
   - Сохранение полной работоспособности полного генератора уроков при вводе классических скриптов;
   - Никаких несанкционированных изменений в блоках урока без нажатия кнопки подтверждения;
   - Строгое использование CSS-переменных проекта (`--bg`, `--card`, `--ink`, `--mute`, `--line`, `--acc`, `--ok`).

---

## 4. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1: Добавление контейнера предпросмотра команд и одобрения в site/preview.html**
- 🟩 **Этап 2: Обновление промпта и схемы Gemini в src/lesson-pdf-meta.mjs для автономного перевода и категоризации**
- 🟩 **Этап 3: Реализация функций lmEnsurePhrasesInLesson и lmEnsureRulesInLesson в client/52-lessons.js**
- 🟩 **Этап 4: Реализация клиентского диспетчера команд и таблицы одобрения в client/52b-lesson-pdf-import.js**
- 🟩 **Этап 5: Написание целевых тестов в test/test-manual-script-ai-agent.mjs и сборка ассетов**
- 🟩 **Этап 6: Детерминированная проверка тестов, проверка 2 раза и финальный отчет**

---

## 5. Метод верификации

```bash
node --test test/test-manual-script-ai-agent.mjs
npm run build:preview
```
