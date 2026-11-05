# План проектирования и интеграции модуля уведомлений уроков (Lesson Notifications Module)

> [!WARNING]
> **ПРЕДУПРЕЖДЕНИЕ О НЕПРИКОСНОВЕННОСТИ СТОРОННЕГО ФУНКЦИОНАЛА:**
> Запрещается модифицировать, перемещать или нарушать логику любых несвязанных модулей приложения (сайдбар, каталоги слов, грамматический тренажёр, караоке, администрирование групп, экзамены, воркбенч и системные логи). Все изменения строго локализованы в новом файле `client/20b-lesson-notifications.js`, связующем файле `client/20a-user-profile-pill.js` и стилях `site/preview.css`.

---

## 1. Постановка задачи и функциональные требования

1. **Модальное окно напоминаний (Lesson Notifications Modal)**:
   - При клике на пункт `Lesson notifications` в выпадающем меню профиля (или вызове `window.openLessonNotifications()`) открывается всплывающее диалоговое окно `#lessonNotificationsModal` поверх интерфейса.
   - Закрытие окна по кнопке `×`, кнопке `Done`, клику вне окна (по бэкдропу) или нажатию клавиши `Escape`.
2. **Содержимое и разделы уведомлений**:
   - **Шапка**: заголовок `Lesson Notifications`, счётчик активных напоминаний или статус `All read`.
   - **Список активных напоминаний**:
     - Ближайшие запланированные уроки группы текущего пользователя (`Scheduled Class Today` / `Lesson Material Today`).
     - Напоминания интервального повторения слов (`Vocabulary Review Ready`).
     - Системные уведомления (`Lumiscia Studio Updated v2.4.0`).
   - **Настройки оповещений (Notification Preferences)**:
     - Тумблер `Lesson start reminders (15 min before)`.
     - Тумблер `Daily word review`.
     - Тумблер `Audio alert sounds`.
     - Сохранение настроек в `localStorage` (`lumiscia-notify-*`).
   - **Действия**: кнопка `Mark all as read` (снимает зелёную точку уведомлений в поповере и переводит бейдж в `All read`) и кнопка закрытия `Done`.
3. **Визуальное соответствие дизайн-системе**:
   - Использование переменных `--saas-card`, `--saas-border`, `--saas-radius-xl, 16px`, теней `--saas-shadow-xl`, шрифтов и цветов активной темы оформления.

---

## 2. Чек-лист реализации

- 🟩 **Этап 1: Разработка клиентского модуля `client/20b-lesson-notifications.js`**
  - Создан компонент модального окна `#lessonNotificationsModal`.
  - Реализован сбор реальных напоминаний: проверка расписания `classGroups` / `lmLibrary.materials` и карточек повторения.
  - Управление состоянием тумблеров и сохранение в `localStorage`.
  - Управление зелёным индикатором новых уведомлений (`.popover-notify-dot`).

- 🟩 **Этап 2: Стилизация в `site/preview.css`**
  - Стилизовано модальное окно, бэкдроп с размытием, карточки напоминаний, бейджи категорий и переключатели (switch toggles).
  - Поддержка адаптивности для настольных и мобильных устройств.

- 🟩 **Этап 3: Подключение к кнопке в `client/20a-user-profile-pill.js`**
  - Привязка клика по `[data-profile-action="notifications"]` к вызову `window.openLessonNotifications()`.

- 🟩 **Этап 4: Сборка и верификация тестами**
  - Выполнена сборка ассетов: `npm run build:preview && node ops/build-learning-production-assets.mjs`.
  - Пройдены все 11 целевых тестов без ошибок.
  - Проведена полная Playwright-валидация (`verify-notifications.mjs`), сохранены скриншоты верификации `verified-lesson-notifications-modal.png` и `verified-lesson-notifications-read.png`.
