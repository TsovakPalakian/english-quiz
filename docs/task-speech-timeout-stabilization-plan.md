# План стабилизации таймаута синтеза речи в тестах медиа

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается увеличения таймаута вызова `/usr/bin/say` в локальном тестовом модуле [`ops/quiz-media-native.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/quiz-media-native.mjs).
> Запрещено модифицировать продакшен-маршруты, логику валидации медиа и смежные тесты.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **[`test/test-quiz-media-preview.mjs#L23`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-media-preview.mjs#L23)**:
   - Ошибка: `Error: Local voice unavailable. No fallback was used.`.
   - В условиях параллельного запуска всех 290 скриптов системный процесс macOS `/usr/bin/say` не успевал завершить генерацию аудиофайлов для двух голосов (`Samantha` и `Daniel`) в пределах жесткого лимита 20 секунд (`timeout: 20000`).

---

## 2. Границы изменений (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`ops/quiz-media-native.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/quiz-media-native.mjs)
- **Инварианты**:
  - Сохранение штатных параметров аудио (`-r 150`, `--data-format=LEI16@24000`).
  - Сохранение временных файлов только в изолированных временных директориях с последующей очисткой в блоке `finally`.

---

## 3. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Увеличение таймаута вызова `/usr/bin/say` до 60000 мс в [`ops/quiz-media-native.mjs#L34`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/quiz-media-native.mjs#L34).
- 🟩 **Этап 2**: Валидация скрипта [`test/test-quiz-media-preview.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-quiz-media-preview.mjs).
- 🟩 **Этап 3**: Фиксация результатов и подготовка коммита.
