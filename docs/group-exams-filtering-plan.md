# План устранения коллизии отображения чужих экзаменов в группах (Group Exams Scope Isolation)

**Связанный раздел интерфейса**: [`site/preview.html#L2047-L2050`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html#L2047-L2050), [`client/10-admin.js#L193-L215`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L193-L215)  
**Вспомогательные модули сопоставления**: [`client/53-group-directory.js#L52`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L52), [`client/54-exams.js#L963`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L963), [`client/main/material-upgrades.js#L228`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L228)  
**Графический прототип дефекта**: `media_1793786207490_cbb3927c.png` (Экран `B2+ Kate Group` отображает 7 экзаменов чужих групп `B2+ New Group`, `A1 Demo`, `B1 Group` и неназначенные экзамены).

---

## 1. Точная формулировка проблемы и первопричина (Root-Cause Analysis)

1. **Неверный источник счетчика экзаменов в заголовке блока**:
   - В [`client/10-admin.js#L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L208) заголовок раскрывающегося блока генерируется выражением `accountCount('Exams', exams.length)`.
   - Переменная `exams` в строке 201 содержит `examLoad().filter(exam=>!exam.instanceStatus)` — массив всех базовых шаблонов экзаменов всей платформы (7 экзаменов).
   - В результате для группы `B2+ Kate Group`, не имеющей ни одного прикрепленного экзамена (`selected.examIds = []`), отображается заголовок `Exams · 7`.
2. **Отсутствие фильтрации массива экзаменов по принадлежности к текущей группе**:
   - В [`client/10-admin.js#L202-L207`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L202-L207) генерация строк `examRows = exams.map(...)` выполняется по всему глобальному массиву экзаменов платформы без предварительного отбора.
   - Экзамены, принадлежащие другим группам (`B2+ New Group`, `A1 Demo`, `B1 Group`) или имеющие статус `Unassigned`, выводятся непосредственно в список текущей группы с кнопкой `Assign` (`(+)`).
3. **Хрупкость функции сопоставления группы экзамена**:
   - В [`client/54-exams.js#L963`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L963) и [`client/main/material-upgrades.js#L228`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L228) функция `groupFor` проверяет только устаревшее поле `g.id === exam.groupId`, игнорируя массив связей `g.examIds` из таблицы `class_group_exams`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

> [!WARNING]
> Запрещено изменять логику работы серверных эндпоинтов `/api/groups/manage` и таблицы `class_group_exams`. Запрещено нарушать структуру публичных контрактов ответов API.
> Изменения изолированы логикой фильтрации и отрисовки списка экзаменов в клиенте.

1. **Инвариант принадлежности**: В списке прикрепленных экзаменов группы отображаются исключительно те экзамены, идентификаторы которых присутствуют в `selected.examIds`.
2. **Инвариант счетчика**: Число в заголовке `Exams · N` равно количеству экзаменов, прикрепленных к данной группе (`selected.examIds.length`).
3. **Инвариант назначения**: Назначение не прикрепленных экзаменов переносится во вложенный раскрывающийся блок `Assign exams` по аналогии с блоком назначения учителей `Assign teachers` ([`client/10-admin.js#L210`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L210)).

---

## 3. Детерминированный план изолированного исправления

---

### ЭТАП 1. Исправление отображения экзаменов в `client/10-admin.js` (`FIX-ADMIN-EXAMS`)

> [!WARNING]
> Запрещено затрагивать логику отрисовки учителей, студентов и уроков группы.

#### Задача 1.1 (`FIX-ADMIN-EXAMS-01`): Разделение массива экзаменов на прикрепленные и доступные для назначения
- **Файл**: [`client/10-admin.js#L199-L208`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/10-admin.js#L199-L208)
- **Правка**:
  1. Выделить массив прикрепленных экзаменов: `const assignedExams = exams.filter(exam => (selected.examIds || []).includes(exam.id));`.
  2. Выделить массив доступных для назначения экзаменов: `const candidateExams = exams.filter(exam => !(selected.examIds || []).includes(exam.id));`.
  3. В `<summary>` блока `data-group-exams` передавать `accountCount('Exams', assignedExams.length)`.
  4. В теле блока отображать `assignedRows` с кнопкой `Unassign` (`(-)`). Если прикрепленных экзаменов нет — отображать `<p class="hint">No exams yet.</p>`.
  5. Добавить вложенный блок `<details class="accounts-fold" data-group-exams-assign><summary>Assign exams</summary>` со списком `candidateRows` и кнопками `Assign` (`(+)`).
  6. Добавить `'exams-assign'` в массив сохраняемых состояний раскрытия `folds` в строке 199.
- **Статус**: 🟩

---

### ЭТАП 2. Синхронизация функции разрешения группы экзамена (`FIX-EXAM-GROUP-FOR`)

> [!WARNING]
> Запрещено нарушать сортировку и фильтрацию экзаменов по датам и уровням в каталоге экзаменов.

#### Задача 2.1 (`FIX-EXAM-GROUP-FOR-01`): Использование `examIds` в качестве первичного источника сопоставления группы
- **Файлы**: [`client/54-exams.js#L963`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/54-exams.js#L963), [`client/main/material-upgrades.js#L228`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/main/material-upgrades.js#L228), [`client/53-group-directory.js#L52`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53-group-directory.js#L52)
- **Правка**:
  1. В `groupFor(exam)` выполнять поиск группы по условию `classGroups.find(g => (g.examIds || []).includes(exam.id)) || classGroups.find(g => g.id === exam.groupId)`.
  2. В `groupExamMetrics(group)` для базовых экзаменов (`!row.instanceStatus`) выполнять проверку `(group.examIds || []).includes(row.id)`.
- **Статус**: 🟩

---

### ЭТАП 3. Сборка ассетов и детерминированная верификация (`VERIFY-BUILD-TESTS`)

#### Задача 3.1 (`VERIFY-BUILD-TESTS-01`): Сборка превью и продакшен-бандлов
- **Команды**:
  - `npm run build:preview`
  - `node ops/build-learning-production-assets.mjs`
- **Критерий приемки**: Успешная сборка `preview.js` и продакшен-ассетов без ошибок.
- **Статус**: 🟩

#### Задача 3.2 (`VERIFY-BUILD-TESTS-02`): Таргетированные тесты UI и групп
- **Команды**:
  - `node --test test/test-chat-ui.mjs`
  - `node --test test/test-ui-boot.mjs`
- **Критерий приемки**: 100% прохождение тестов интерфейса групп.
- **Статус**: 🟩
