# План реализации страницы AI providers и обновления элементов бокового меню

## Scope Isolation & Collateral Protection Warning
> [!IMPORTANT]
> **Warning block:** Запрещено задевать, модифицировать или ломать функционал, не относящийся к текущей задаче. Выполняемые изменения строго и изолированно затрагивают:
> 1. Пункт меню `AI providers` в боковой панели (замена иконки настроек на иконку микропроцессора `cpu` и стиль выделения `bg-secondary`).
> 2. Индикатор `Theme / Sky` в нижней части боковой панели (иконка палитры `palette`, заголовок `Theme`, подзаголовок текущей темы).
> 3. Экран настроек `AI providers` (`Service selections`), включая метаданные ревизии, строки конфигурации адаптеров, плашку несохраненных изменений и информационный блок.
> Остальные компоненты системы (словарь, грамматика, квизы, медиаплееры и чат) остаются неизменными.

---

## Чеклист реализации

- 🟩 **Шаблон 1. Экран AI providers и элементы боковой панели (AI providers & Theme Sky)**
  - Утвержден пользователем (`да`).
- 🟩 **Функция 1. Синхронизация выбора провайдеров и сохранение ревизии настроек**
  - Утвержден пользователем (`да`).
- 🟩 **Стилизация в темах sky, dark, sand с использованием CSS-переменных**
  - Реализованы компоненты `.ai-providers-page`, `.ai-providers-card`, `.ai-meta-grid`, `.ai-tasks-list`, `.ai-task-row`, `.ai-tech-tag`, `.ai-unsaved-banner`, `.ai-info-callout`.
- 🟩 **Модульное и визуальное тестирование страницы AI providers и элементов меню**
  - Подтверждено тестами `test/test-provider-settings-ui.mjs` и `test/test-speech-practice-ui-visual.mjs`.

---

## Кадры состояний и цепочка действий

### Скриншот 14. Эталон интерфейса AI Providers из предоставленной ссылки (Lovable Studio)
![Скриншот 14. Эталон Lovable](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-ai-providers-exact-reference.png)
*Скриншот 14. Точный кадр интерфейса Service selections со ссылками провайдеров, выпадающими списками, плашкой несохраненных изменений и техническими тегами.*

### Скриншот 10. Эталонный экран AI providers и боковое меню в теме Sky
![Скриншот 10. Экран AI providers в теме Sky](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-ai-providers-layout-sky.png)
*Скриншот 10. Экран `AI providers` (`Service selections`) с боковым меню: иконка микропроцессора у `AI providers` и виджет `Theme / Sky` с палитрой внизу.*

### Скриншот 11. Экран AI providers в темной теме Dark
![Скриншот 11. Тема Dark](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-ai-providers-layout-dark.png)
*Скриншот 11. Проверка оформления экрана `AI providers` и бокового меню в темной теме.*

### Скриншот 12. Экран AI providers в светлой теме Sand
![Скриншот 12. Тема Sand](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-ai-providers-layout-sand.png)
*Скриншот 12. Проверка оформления экрана `AI providers` и бокового меню в светлой теме Sand.*

### Скриншот 13. Эталон из предоставленной ссылки (Lovable Studio)
![Скриншот 13. Эталон Lovable](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-ai-providers-page-sky.png)
*Скриншот 13. Снятый браузерным субагентом кадр страницы с адреса `https://a35c2d24c12e46f0a062d4ea42fa7ebf.prod.enter.pro/studio/ai-providers`.*
