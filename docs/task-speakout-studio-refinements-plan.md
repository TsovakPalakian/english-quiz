# План реализации: Доработка и модернизация интерфейса Speakout Studio

> [!WARNING]
> **Scope Isolation and Collateral Protection Block**
> Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые задачи строго и изолированно должны задевать только свой функционал в рамках Speakout Studio (`speakout/web/index.html`, `speakout/web/style.css`, `speakout/web/app.js` и сопутствующие тесты). Если случайно или по технической необходимости требуется затронуть и скорректировать смежные части (из-за совместной работы компонентов или их взаимного влияния), об этом обязательно требуется заранее уведомить пользователя в чате текстом красного цвета: `<span style="color: red; font-weight: bold;">WARNING</span>` с описанием затронутых компонентов, обоснованием причин и запросом подтверждения до внесения изменений.

---

## 1. Обзор задачи и согласованные требования

1. **Верхний хедер и тулбар чтения книги:**
   - Удаление кнопки `Platform`, логотипа `SO` и текстового заголовка `Pearson Speakout 3rd Edition`.
   - Выравнивание кнопки `Keys` в одну горизонтальную линию хедера.
   - Выравнивание блока `Page:` и кнопок навигации `◀ Prev`, `Next ▶` в компактную строку в тулбаре.
   - Фиксация навигации исключительно страницами текущего урока (для Lesson 1A: `Page: 1 / 2 (Book p. 8)`).
   - Центрирование холста книги (`.pdf-canvas-wrapper` с `margin: 0 auto`).
   - Подавление баннера ошибки `#reader-error` при сохранении прогресса.
2. **Модальное окно ответов Keys:**
   - Одностраничный режим с вкладками `Page 4` и `Page 5`.
   - Масштабирование 140% для обеспечения четкой читаемости мелкого шрифта ответов.
   - Контрастный заголовок `.keys-modal-title` цветом `var(--ink)`.
3. **Модальное окно Speech Verification Studio:**
   - Ультрадетализированные осциллограммы (550 вертикальных линий) для образца учителя (Teacher Audio) и записи студента (My Recording).
   - Интерактивная перемотка по клику на полотно звуковой волны.
   - Пословная оценка точности произношения с цветовой индикацией.
   - Четкая видимость волны эталона в теме Aegean (`--ink: #E6F2FF`) и других темах.
4. **Аудиоплеер Speakout Studio:**
   - Строго круглая кнопка Play (`.btn-play-circle`, `border-radius: 50%`, 36px) с оптически центрированным белым треугольником.
   - Тонкие границы зацикливания Loop толщиной 3px цвета `--acc`.
   - Вынесенные наверх бейджи `A` и `B` над звуковой волной, удаление букв из вертикальных линий ручек.
   - Полное удаление плавающей надписи `A-B Loop` между границами.
   - Полупрозрачный фон выделения `color-mix(in srgb, var(--acc) 14%, transparent)`, обеспечивающий 100% видимость звуковой волны под областью зацикливания.
   - Сохранение исходной компоновки аудиоплеера Speakout (треки вверху, волна по центру, контролы и зум внизу).
5. **Функция автоинициализации первого трека:**
   - Автоматическая установка `audioPlayer.src = '/api/speakout/audio?track=1.01'` и отрисовка звуковой волны при загрузке страницы.

---

## 2. Утвержденные скриншоты шаблонов

### Шаблон 1: Верхний хедер, тулбар и центрированная страница книги
#### Скриншот 1: Шаблон хедера, тулбара и центрированной книги в теме Sky (`data-theme="sky"`)
![Скриншот 1: Шаблон хедера, тулбара и центрированной книги в теме Sky](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-studio-workspace-1-sky.png)

#### Скриншот 2: Шаблон хедера, тулбара и центрированной книги в теме Dark (`data-theme="dark"`)
![Скриншот 2: Шаблон хедера, тулбара и центрированной книги в теме Dark](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-studio-workspace-2-dark.png)

#### Скриншот 3: Шаблон хедера, тулбара и центрированной книги в теме Sand (`data-theme="sand"`)
![Скриншот 3: Шаблон хедера, тулбара и центрированной книги в теме Sand](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-studio-workspace-3-sand.png)

#### Скриншот 4: Шаблон хедера, тулбара и центрированной книги в теме Aegean (`data-theme="aegean"`)
![Скриншот 4: Шаблон хедера, тулбара и центрированной книги в теме Aegean](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-studio-workspace-4-aegean.png)

---

### Шаблон 2: Читабельное модальное окно ответов Keys (масштаб 140%)
#### Скриншот 5: Шаблон модального окна ответов Keys в теме Sky (`data-theme="sky"`)
![Скриншот 5: Шаблон модального окна ответов Keys в теме Sky](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-keys-readable-1-sky.png)

#### Скриншот 6: Шаблон модального окна ответов Keys в теме Dark (`data-theme="dark"`)
![Скриншот 6: Шаблон модального окна ответов Keys в теме Dark](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-keys-readable-2-dark.png)

#### Скриншот 7: Шаблон модального окна ответов Keys в теме Sand (`data-theme="sand"`)
![Скриншот 7: Шаблон модального окна ответов Keys в теме Sand](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-keys-readable-3-sand.png)

#### Скриншот 8: Шаблон модального окна ответов Keys в теме Aegean (`data-theme="aegean"`)
![Скриншот 8: Шаблон модального окна ответов Keys в теме Aegean](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-keys-readable-4-aegean.png)

---

### Шаблон 3: Модальное окно Speech Verification Studio
#### Скриншот 9: Шаблон Speech Verification Studio в теме Aegean (`data-theme="aegean"`)
![Скриншот 9: Шаблон Speech Verification Studio в теме Aegean](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-speech-studio-ultra-4-aegean.png)

#### Скриншот 10: Шаблон Speech Verification Studio в теме Sky (`data-theme="sky"`)
![Скриншот 10: Шаблон Speech Verification Studio в теме Sky](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-speech-studio-ultra-1-sky.png)

#### Скриншот 11: Шаблон Speech Verification Studio в теме Dark (`data-theme="dark"`)
![Скриншот 11: Шаблон Speech Verification Studio в теме Dark](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-speech-studio-ultra-2-dark.png)

#### Скриншот 12: Шаблон Speech Verification Studio в теме Sand (`data-theme="sand"`)
![Скриншот 12: Шаблон Speech Verification Studio в теме Sand](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-speech-studio-ultra-3-sand.png)

---

### Шаблон 4: Аудиоплеер Speakout с круглой кнопкой Play и видимой волной под Loop
#### Скриншот 13: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в теме Sky (`data-theme="sky"`)
![Скриншот 13: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в теме Sky](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-waveform-roundplay-1-sky.png)

#### Скриншот 14: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в темной теме Dark (`data-theme="dark"`)
![Скриншот 14: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в темной теме Dark](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-waveform-roundplay-2-dark.png)

#### Скриншот 15: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в светлой теме Sand (`data-theme="sand"`)
![Скриншот 15: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в светлой теме Sand](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-waveform-roundplay-3-sand.png)

#### Скриншот 16: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в теме Aegean (`data-theme="aegean"`)
![Скриншот 16: Шаблон аудиоплеера с круглой кнопкой Play и видимой волной в теме Aegean](file:///Users/tsovakpalakian/.gemini/antigravity/brain/73e0a3d6-0672-41a1-8ce1-9cb6c2075f4d/screenshot-waveform-roundplay-4-aegean.png)

---

## 3. Чек-лист реализации (Implementation Checklist)

- `🟩` **Этап 1: Разметка `speakout/web/index.html`**
  - Удалена кнопка `Platform`, логотип `SO` и текст `Pearson Speakout 3rd Edition`.
  - Удалена плавающая надпись `#waveform-loop-label`.
  - Обновлены ручки `#waveform-trim-left` и `#waveform-trim-right`: добавлены вынесенные наверх бейджи `A` и `B`.
  - Обновлена разметка модального окна Keys: одностраничные табы страниц.
  - Обновлена разметка Speech Verification Studio: холсты и карточки детальных волн.
- `🟩` **Этап 2: Стили `speakout/web/style.css`**
  - Стили кнопки `.btn-play-circle`: идеальный круг `border-radius: 50%`, 36px, центрирование треугольника.
  - Стили области зацикливания: полупрозрачный фон `color-mix(in srgb, var(--acc) 14%, transparent)`.
  - Стили ручек Loop: ширина 3px цвета `--acc`, позиционирование верхних бейджей `.handle-top-badge`.
  - Центрирование холста книги: `.pdf-canvas-wrapper` с `margin: 0 auto`.
  - Стили тулбара и модальных окон Keys и Speech Studio с поддержкой всех тем.
- `🟩` **Этап 3: Логика `speakout/web/app.js`**
  - Автоинициализация первого аудиотрека `1.01` при загрузке и смене уроков.
  - Ограничение навигации по страницам диапазоном текущего урока.
  - Подавление ошибки `#reader-error` при сохранении прогресса.
  - Одностраничный зум-рендер Keys (масштаб 140%).
  - Интерактивная отрисовка волн в Speech Studio с поддержкой тем (`--ink`, `--acc`, `--line`).
- `🟩` **Этап 4: Верификация и тесты**
  - Обновлены тесты `speakout/tests/navigation_integration.test.js` и пройдены все 76 тестов `speakout/tests/`.
  - Добавлены новые тесты `test/test-speakout-studio-refinements.mjs` (8/8 успешно).
  - Успешно собран продакшен-бандл ассетов: `npm run build:preview`.
