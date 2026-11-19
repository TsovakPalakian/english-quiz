# План стабилизации упавших тестов (Stabilization Plan for Failing Tests)

> [!WARNING]
> <span style="color: red; font-weight: bold;">WARNING</span>
> **ПРЕДУПРЕЖДЕНИЕ О ЗАТРАГИВАНИИ СМЕЖНОГО ФУНКЦИОНАЛА И НЕПРИКОСНОВЕННОСТИ СИСТЕМЫ:**
> Текущая задача строго изолирована и касается стабилизации 3 тестов (`test-lesson-import-dual-frames.mjs`, `test-lesson-pdf-import-autoexpand.mjs`, `test-voice-mode-tutor-examiner.mjs`).
> Запрещено модифицировать или нарушать работу смежных модулей: модального окна голосового режима `#lmVoiceModeModal`, генерации уроков из PDF/текста/ссылок, логики уроков и верификации слов.

---

## 1. Точная формулировка проблемы (Problem Statement)

1. **[`test/test-lesson-pdf-import-autoexpand.mjs#L67`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-pdf-import-autoexpand.mjs#L67)**:
   - Ошибка: `AssertionError [ERR_ASSERTION]: details[open] must use var(--saas-card)`.
   - Селектор `.lm-pdf-draft details[open]` в [`site/preview.css#L4735`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4735) не содержал обязательную fallback-переменную `var(--saas-card, ...)` и `color: var(--saas-text-primary, ...)`.

2. **[`test/test-lesson-import-dual-frames.mjs#L37`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs#L37)**:
   - Ошибка: `AssertionError [ERR_ASSERTION]: Voice mode bar is present`.
   - Тест проверял удаленную плашку `#lmVoiceModeBar` в Frame 1 [`site/preview.html`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.html).

3. **[`test/test-voice-mode-tutor-examiner.mjs#L14`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs#L14) и [`test/test-voice-mode-tutor-examiner.mjs#L99`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs#L99)**:
   - Ошибка: проверка `#lmVoiceModeBar exists in HTML` и таймаут Playwright в ожидании селектора `#lmVoiceModeBar`.
   - Тест требовал актуализации на штатную кнопку голосового режима `#lmVoiceModeBtn` в панели режимов урока (`.lm-modes-bar`).

---

## 2. Границы изменений (Scope Boundaries & Invariants)

- **Затрагиваемые файлы**:
  - [`site/preview.css`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css)
  - [`test/test-lesson-import-dual-frames.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs)
  - [`test/test-voice-mode-tutor-examiner.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs)
- **Инварианты**:
  - Сохранение полной функциональности голосового режима AI Tutor & Speaking Examiner через кнопку `#lmVoiceModeBtn`.
  - Сохранение совместимости стилей PDF preview с темами оформления и переменными `--saas-card` / `--saas-text-primary`.

---

## 3. Контрольный список реализации (Checklist)

- 🟩 **Этап 1**: Корректировка CSS-переменных в [`site/preview.css#L4735`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/site/preview.css#L4735) для `.lm-pdf-draft details[open]`.
- 🟩 **Этап 2**: Актуализация проверки голосового режима в [`test/test-lesson-import-dual-frames.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-lesson-import-dual-frames.mjs).
- 🟩 **Этап 3**: Актуализация проверки и Playwright-клика по `#lmVoiceModeBtn` в [`test/test-voice-mode-tutor-examiner.mjs`](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/test/test-voice-mode-tutor-examiner.mjs).
- 🟩 **Этап 4**: Сборка ассетов (`npm run build:preview`, `node ops/build-learning-production-assets.mjs`).
- 🟩 **Этап 5**: Валидация всех 3 целевых тестовых наборов.
