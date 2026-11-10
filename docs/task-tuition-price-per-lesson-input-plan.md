# План возвращения поля ввода стоимости урока («Price Per Lesson») во вкладку «Student Invoices»

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к расчету и отображению стоимости урока в модальном окне счетов `Tuition Deadline & Payment Management`. Запрещено менять другие вкладки («Deadline & Reminders», «Payment Requisites»), общие структуры базы данных или авторизацию. Изменения строго и изолированно ограничены добавлением элемента управления стоимостью урока в `showPaymentDeadlineModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js), пересборкой [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js) и тестами в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).

---

## 1. Точная формулировка проблемы и анализ первопричины

- **Проблема**: В модальном окне управления оплатами `Tuition Deadline & Payment Management` во вкладке `Student Invoices` отсутствует поле для ввода базовой стоимости урока (`Price Per Lesson`). Если ставка за урок меняется, преподаватель не имеет возможности задать новое значение, из-за чего колонка `AUTO CALC` рассчитывается по старой ставке по умолчанию (30 BYN).
- **Первопричина**:
  - Ранее в монолитной форме диалога присутствовало поле:
    ```html
    <div class="gcw-field-group">
      <label for="gcwModalPricePerLesson">Price Per Lesson (${currency})</label>
      <input type="number" id="gcwModalPricePerLesson" value="${currentPrice}" min="0" step="1">
    </div>
    ```
  - При разделении диалога на три вкладки («Deadline & Reminders», «Student Invoices», «Payment Requisites») в задаче TASK-35 поле ввода стоимости урока было упущено в разметке панели `data-panel="invoices"`.
  - При этом серверная часть в [`src/learning-attendance.mjs#L132`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-attendance.mjs#L132) и клиентская синхронизация в [`client/53a-group-calendar.js#L447`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js#L447) полностью поддерживают сохранение и передачу поля `pricePerLesson`.

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

1. **Изоляция изменений**:
   - Внедрение компактной карточки-строки `Price Per Lesson (${currency})` с числовым полем ввода `#gcwModalPricePerLesson` во вкладку `Student Invoices` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js);
   - Динамический пересчет колонки `AUTO CALC` для всех студентов и итоговой сводки `TOTAL INVOICED` / `PENDING` в реальном времени при изменении значения в поле ввода;
   - Сохранение установленного значения `monthData.pricePerLesson` при нажатии на кнопку `Save & Send Invoices Privately`;
   - Сборка клиентского бандла `npm run build:preview`;
   - Добавление автоматических контрактных и визуальных тестов в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
2. **Инварианты**:
   - Приоритет ручной суммы (`manualAmount`) сохраняется: если для конкретного студента задана индивидуальная сумма, она перекрывает расчет по общей ставке;
   - Корректная обработка нулевой или пустой ставки (по умолчанию возврат к 30 BYN);
   - Сохранение структуры счетов и отправки персональных уведомлений в чат.

---

## 3. Контрольный чек-лист (Checklist)

- 🟩 **Этап 1**: Добавление разметки блока `Price Per Lesson (${currency})` с полем `#gcwModalPricePerLesson` во вкладку `Student Invoices` диалога `showPaymentDeadlineModal` в [`client/53a-group-calendar.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/53a-group-calendar.js).
- 🟩 **Этап 2**: Реализация слушателя события `input` на поле `#gcwModalPricePerLesson` с мгновенным пересчетом `Auto Calc` и итоговых сумм в сводке `updateInvoicesDisplay()`.
- 🟩 **Этап 3**: Сохранение `monthData.pricePerLesson` в обработчике кнопки `Save & Send Invoices Privately`.
- 🟩 **Этап 4**: Пересборка клиентского бандла `npm run build:preview`.
- 🟩 **Этап 5**: Написание модульных и визуальных Playwright UI тестов в [`test/test-task-35-calendar-management.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-task-35-calendar-management.mjs).
- 🟩 **Этап 6**: Прогон тестов и фиксация результатов верификации (24 из 24 тестов пройдены успешно).

---

## 4. Эталонные скриншоты для сверки (Reference Mockups)

### Скриншот 31: Добавление поля Price Per Lesson во вкладку Student Invoices модального окна Tuition Deadline & Payment Management
![Скриншот 31: Добавление поля Price Per Lesson во вкладку Student Invoices модального окна Tuition Deadline & Payment Management](/Users/tsovakpalakian/.gemini/antigravity/brain/3755d172-65be-45cd-88b8-6f26e62495ad/mockup-tuition-rate-per-lesson-input.png)
