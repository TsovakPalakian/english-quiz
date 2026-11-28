# План реализации: Двустороннее отображение облаков в компактном окне диалога, плавное изменение размеров, отображение статусов сообщений и синхронизация при пересылке

## 1. Постановка задачи и ссылки на код

1. **Двустороннее пространственное разделение облаков и удаление избыточного аватара слева**:
   - Файл: [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L1430-L1445).
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L644-L655).
   - Входящие сообщения собеседника в компактном окне отображаются строго слева без аватара `S1` (`.chat-mini-msg-row.other`), исходящие сообщения автора — справа (`.chat-mini-msg-row.own`).
   - Изоляция авторства: проверка флага `own` по совпадению `senderId` и учету квитанций.

2. **Плавная динамика изменения размеров компактного окна**:
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L613-L617).
   - Файл: [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L1715-L1760).
   - Файл: [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L1845-L1870).
   - При перетаскивании манипулятора изменения размера окна отключаются встроенные анимации высоты, предотвращая конфликт и дрожание.
   - При многострочном наборе текста высота окна синхронизируется плавно в реальном времени.

3. **Мгновенное отображение пересылаемых сообщений в целевом диалоге без перезагрузки**:
   - Файл: [production/chat/80-dialogs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js#L1020-L1035).
   - Файл: [production/chat/40-messages.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/40-messages.js#L1000-L1015).
   - При успешном выполнении `request('forward')` сформированное сообщение добавляется в массив строк целевой комнаты, кэш помечается для принудительного обновления (`refresh: true`), превью последнего сообщения обновляется.

4. **Отображение статусов квитанций (галочек) в компактном окне диалога**:
   - Файл: [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js#L1430-L1440).
   - Файл: [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css#L650-L660).
   - Отображение 3 состояний (1 серая галочка — отправлено, 2 серые галочки — доставлено, 2 синие галочки — прочитано) рядом с меткой времени исходящих реплик.

---

## 2. Утвержденные визуальные кадры

### Скриншот 1: Шаблон компактного диалога без аватаров слева с двусторонним разделением
![Шаблон компактного диалога без аватаров слева с двусторонним разделением](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-chat-mini-no-avatar-sky.png)

### Скриншот 2: Мгновенное появление пересланного сообщения в целевом диалоге
![Мгновенное появление пересланного сообщения в целевом диалоге](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-chat-target-forward.png)

### Скриншот 3: Статусы квитанций (галочки) в компактном окне
![Статусы квитанций (галочки) в компактном окне](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-chat-mini-receipts.png)

---

## 3. Границы изменений и изоляция

> [!IMPORTANT]
> **Блок изоляции функционала**:
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Задачи строго и изолированно затрагивают только файлы [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js), [production/chat/80-dialogs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js), [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css). Смежные разделы платформы (уроки, словарь, грамматика, авторизация, карточки) не модифицируются.

---

## 4. Этапы реализации и чеклист

- 🟩 **Этап 1**: Обновление стилей компактного окна в [production/chat.css](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.css): удаление аватара у `.chat-mini-msg-row.other`, настройка ширины до 84%, отключение transition при активном изменении размеров (`.is-resizing`), стили для статусов галочек (`.chat-mini-receipt`).
- 🟩 **Этап 2**: Корректировка генерации разметки в `syncMiniTimeline` в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js): отрисовка входящих без аватара, формирование статусов квитанций (`check` / `check-check`) для исходящих сообщений.
- 🟩 **Этап 3**: Оптимизация плавности изменения высоты и ручного изменения размера компактного окна в [production/chat/90-settings.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/90-settings.js).
- 🟩 **Этап 4**: Обновление обработчика `forwardMessage` в [production/chat/80-dialogs.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/80-dialogs.js) для мгновенного добавления сообщений в кэш целевой комнаты и принудительного обновления истории при переходе.
- 🟩 **Этап 5**: Пересборка продакшн-ассетов `npm run build:preview`.
- 🟩 **Этап 6**: Написание модульных и визуальных тестов в [test/test-chat-mini-sides-and-forward.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-chat-mini-sides-and-forward.mjs) и верификация выполнения тестов (код выхода 0).
