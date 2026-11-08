# План исправления клика по аватару профиля: открытие формы профиля (Вариант 1, Скриншот 2)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать функционал, не относящийся к текущей изолированной задаче. Запрещено затрагивать логику отправки сообщений в чате, структуру Durable Objects, синхронизацию сессий, календарь, расписание и экзамены. Просмотр полноразмерных фотографий (`openAvatar`) в сообщениях чата, списках контактов и комнат должен оставаться полностью рабочим без изменений. Все изменения строго и изолированно ограничены исключением перехвата клика для элементов профиля в шапке (`.user-profile-pill`, `.user-profile-popover`, `[data-mobile-profile-tab]`) в [`production/chat/10-profiles.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/10-profiles.js) и [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js).

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **Глобальный перехватчик событий в фазе захвата (Capture Phase) блокирует открытие формы**:
   - Код: [`production/chat/10-profiles.js:335-360`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/10-profiles.js#L335-L360) (а также скомпилированный [`production/chat.js:615-640`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js#L615-L640)).
   - Слушатель `document.addEventListener('click', ..., true)` перехватывает клик по любому элементу с селектором `[data-avatar-subject].has-avatar-photo`.
   - Внутри слушателя вызываются `event.preventDefault()` и `event.stopImmediatePropagation()`, после чего принудительно открывается модальное окно `openAvatar(subject)` с заголовком "Photo" и изображением `<img class="chat-avatar-full">`.
   - Событие клика останавливается до того, как оно сможет дойти до обработчика кнопки профиля в шапке (`pillBtn.onclick`).
   - **Следствие**: когда у пользователя нет фотографии (отображаются инициалы), клик успешно доходит до `pillBtn.onclick` и открывает форму/карточку `.user-profile-popover`. Но как только загружается фотография, на элементе появляется класс `.has-avatar-photo`, и вместо поповера начинает открываться модальное окно «Photo».

2. **Требование пользователя по Варианту 1 (Скриншот 2)**:
   - Клик по аватару с фотографией в шапке должен открывать ровно то же окно/форму (`.user-profile-popover`), что открывается без фотографии: выпадающую карточку профиля с переключателями статуса (*Online*, *In Class*, *Away*), именем, email, ролью, кнопками перехода в настройки (*Settings ⌘,*) и выходом (*Log out*).
   - Во всех остальных частях приложения (сообщения чата, списки диалогов, контакты) функционал `openAvatar` сохраняется в неизменном виде («только здесь»).

---

## 2. Границы области изменений и инварианты (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`production/chat/10-profiles.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/10-profiles.js): добавление исключения в слушатели `click` и `keydown` для селекторов `.user-profile-pill-wrap, .user-profile-pill, .user-profile-popover, [data-mobile-profile-tab]`.
  - [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js): подтверждение беспрепятственного срабатывания `pillBtn.onclick` при наличии фото.
  - [`production/chat.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat.js) и [`preview.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/preview.js): пересборка через `npm run build:preview`.
  - [`test/test-user-profile-pill-avatar-click.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-user-profile-pill-avatar-click.mjs): модульные и визуальные тесты клика по аватару с фото и без него.

- **Инварианты**:
  - Аватары в сообщениях чата (`#messages`), списках комнат, контактах и прочих окнах продолжают открывать фото (`openAvatar`) при клике.
  - Сохраняется доступность (ARIA), атрибуты `aria-haspopup="true"`, `aria-expanded`, клавиатурная навигация (`Enter`, `Space`, `Escape`, `Cmd+,`).
  - Серверные контракты и схема базы данных не затрагиваются.

---

## 3. Этапы реализации и контрольный список (Checklist)

- 🟩 **Этап 1**: Изоляция перехвата `openAvatar` в [`production/chat/10-profiles.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/production/chat/10-profiles.js) — добавление условия `if (node.closest('.user-profile-pill-wrap, .user-profile-pill, .user-profile-popover, [data-mobile-profile-tab]')) return;` для событий `click` и `keydown`.
- 🟩 **Этап 2**: Проверка обработчиков в [`client/20a-user-profile-pill.js`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/20a-user-profile-pill.js) для гарантированного открытия выпадающей формы `.user-profile-popover` при наличии фотографии в точности по Скриншоту 2.
- 🟩 **Этап 3**: Сборка ассетов (`npm run build:preview`).
- 🟩 **Этап 4**: Написание и выполнение целевых тестов (`test/test-user-profile-pill-avatar-click.mjs`).

---

## 4. Детерминированный метод верификации (Verification Method)

1. `npm run build:preview`.
2. Запуск целевых тестов `node --test test/test-user-profile-pill-avatar-click.mjs`.
3. Визуальная проверка открытия формы профиля `.user-profile-popover` в браузере.
