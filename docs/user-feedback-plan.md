# План реализации системы обратной связи (User Feedback & Bug Reporting)

## 1. Цели и задачи
Предоставить любому пользователю (как авторизованному, так и гостю) возможность быстро отправить сообщение о проблеме, баге или пожелании с прикреплением скриншота, минимизировав усилия пользователя:
- **Вставка из буфера обмена (`Cmd+V` / `Ctrl+V`)**: пользователь делает системный снимок экрана и просто вставляет его в форму.
- **Drag & Drop / выбор файла**: поддержка перетаскивания и стандартной загрузки с мобильных устройств.
- **Клиентское сжатие**: автоматическое уменьшение тяжелых Retina-скриншотов до ~100–150 КБ прямо в браузере через Canvas.
- **Автоматический сбор контекста**: URL страницы, разрешение экрана, браузер, ОС, логин/email пользователя (если авторизован), последние сетевые/консольные ошибки.
- **Двойная доставка (Вариант А)**:
  1. Запись в базу данных Cloudflare D1 (таблица `user_feedback`) для надёжного хранения и учёта.
  2. Моментальное уведомление со скриншотом в Telegram-чат разработчика через Telegram Bot API (`sendPhoto`).
- **Интерфейс разработчика**: просмотр обращений и скриншотов в кабинете разработчика (`DEVELOPER`) с возможностью отметки «Решено».

---

## 2. Архитектура и схема данных

### 2.1 Таблица D1 `user_feedback`
```sql
CREATE TABLE IF NOT EXISTS user_feedback (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('bug', 'idea', 'question')),
  message TEXT NOT NULL,
  screenshot_data TEXT DEFAULT '',
  user_id TEXT DEFAULT '',
  user_login TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  device_info TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON user_feedback(resolved, created_at DESC);
```

### 2.2 API Контракты
- `POST /api/feedback` (публичный с rate-limit):
  - Принимает `{ category, message, screenshot, contact, context }`.
  - Валидирует размер, сохраняет в D1, при наличии токенов отправляет фото в Telegram.
  - Возвращает `{ ok: true, id }`.
- `GET /api/feedback` (только `DEVELOPER` / `ADMIN`):
  - Возвращает список тикетов с пагинацией и статусами.
- `POST /api/feedback/resolve` (только `DEVELOPER` / `ADMIN`):
  - Принимает `{ id }`, меняет `resolved = 1`, `resolved_at = unixepoch()`.

---

## 3. Этапы и шаги реализации

- 🟩 **Этап 1: Клиентский интерфейс обратной связи**
  - 🟩 Точка входа: плавающая кнопка обратной связи (`.feedback-floating-btn` в правом нижнем углу на десктопе и мобильных устройствах).
  - 🟩 Модальное окно: переключатель категории (Ошибка / Идея), поле описания, блок контактов.
  - 🟩 Обработка скриншотов: модальный и глобальный перехват `paste` (`Cmd+V / Ctrl+V`), Drag & Drop зона, выбор файла через input.
  - 🟩 Быстрая клиентская компрессия изображения через Canvas (макс. 1400px по широкой стороне, качество 0.82, WebP/JPEG), предпросмотр миниатюры и удаление.
  - 🟩 Автоматический сбор телеметрии (URL, Viewport, DPR, UserAgent, глобальные ошибки из `window.__recentErrors`).
  - 🟩 Индикация отправки, валидации и состояние успеха («Спасибо за отзыв!»).

- 🟩 **Этап 2: Серверная часть (Cloudflare Worker & D1)**
  - 🟩 D1-схема таблицы `user_feedback` и индекса `idx_user_feedback_status` (`src/feedback.mjs`).
  - 🟩 Роут `POST /api/feedback` в `src/learning-integrated-worker.mjs` с валидацией, привязкой пользователя и сбором контекста.
  - 🟩 Роуты `GET /api/feedback` и `POST /api/feedback/resolve` с авторизацией для роли `DEVELOPER`.

- 🟩 **Этап 3: Интеграция с Telegram Bot API**
  - 🟩 Функция `notifyFeedbackTelegram` с поддержкой `sendPhoto` (multipart/form-data для скриншотов) и текстового `sendMessage`.
  - 🟩 Информативная подпись: категория, текст, контакт пользователя, URL, экран и устройство.
  - 🟩 Graceful fallback: отсутствие токенов Telegram не прерывает сохранение в D1 и возвращает клиенту успех.

- 🟩 **Этап 4: Панель разработчика (Developer Dashboard)**
  - 🟩 Вкладка «User feedback» в интерфейсе системных багов (`#bugTabs`, `client/03-core.js`, `client/24-bugs.js`).
  - 🟩 Отображение тикетов с бейджами категорий, кликабельными скриншотами и техническим контекстом.
  - 🟩 Кнопка «Mark resolved» с вызовом `POST /api/feedback/resolve`.

- 🟩 **Этап 5: Автотесты и интеграционная верификация**
  - 🟩 Модульные тесты `test/test-feedback.mjs` (5/5 тестов: D1-хранилище, статус резолва, отправка фото/текста в Telegram, эндпоинты воркера).
  - 🟩 Playwright UI-тест `test/test-feedback-ui.mjs` (открытие модала, переключение типов, вставка скриншота из буфера через `paste`, компрессия, отправка).
  - 🟩 Полный тестовый набор проекта (100% прохождение всех Node-, Python-, Vitest-тестов) и пересборка продакшен-ассетов.
