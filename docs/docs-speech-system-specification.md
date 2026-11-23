# Speech Practice System & UI/UX Architecture Specification

> **Engineering System Specification:** Product Requirements and Architecture for Speech Practice System. Built strictly under the Zero-Compression Forensic Code Audit Protocol with absolute 1-to-1 extraction and zero generalized prose.

---

## 1. Product Overview and Core Architecture

The Speech Practice System delivers private, isolated, and verified pronunciation and conversational training for language learners. The system is deployed across Cloudflare Workers infrastructure and local pilot review testbeds with zero external tracking and mandatory explicit privacy consent gates.

Code references for architectural anchors:
- Frontend controller and DOM rendering engine: [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L1-L233)
- Core business logic and transaction lifecycle: [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L1-L199)
- Multi-turn dialogue and assessment dispute engine: [src/speech-coaching.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-coaching.mjs#L1-L78)
- Confirmed transcript language review coordinator: [src/speech-transcript-review.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-transcript-review.mjs#L1-L81)
- Metric normalization and rubric evaluator: [src/speech-assessment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-assessment.mjs#L1-L56)
- Workbench unified API routing dispatcher: [src/learning-workbench-api.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/learning-workbench-api.mjs#L21-L169)

---

## 2. Visual System Schemas

### 2.1. Screen Flow Diagram

Полная схема экранных переходов, модальных окон, карточек и форм раздела Speech на русском языке:

![Схема 1: Блок-схема всех экранных переходов (Screen Flow) на русском языке](task-speech-screen-flow-ru.png)
*Схема 1: Блок-схема всех экранных переходов (Screen Flow) на русском языке*
Файл: [task-speech-screen-flow-ru.png](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-screen-flow-ru.png)

---

### 2.2. Recording Studio Finite State Machine

Конечный автомат студии звукозаписи: детерминированные состояния, переходы, действия и guard-условия на русском языке:

![Схема 2: Конечный автомат студии звукозаписи (State Machine: 10 состояний) на русском языке](task-speech-state-machine-ru.png)
*Схема 2: Конечный автомат студии звукозаписи (State Machine: 10 состояний) на русском языке*
Файл: [task-speech-state-machine-ru.png](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-state-machine-ru.png)

---

### 2.3. Audio Capture and Execution Sequence Diagram

Диаграмма последовательности захвата звука AudioContext, синтеза 16 кГц WAV PCM16, отправки и оценки на русском языке:

![Схема 3: Диаграмма последовательности (Sequence Diagram) захвата звука AudioContext и сетевых запросов на русском языке](task-speech-sequence-diagram-ru.png)
*Схема 3: Диаграмма последовательности (Sequence Diagram) захвата звука AudioContext и сетевых запросов на русском языке*
Файл: [task-speech-sequence-diagram-ru.png](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-speech-sequence-diagram-ru.png)

---

## 3. Role Access Control Matrix

The system enforces strict permission boundaries defined in [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L23-L98) across three user roles:

| Capability / Scenario | Student (`USER`) | Teacher (`TEACHER` / `ADMIN`) | Developer (`DEVELOPER`) |
| :--- | :--- | :--- | :--- |
| View Assigned Tasks | Allowed for enrolled group and lesson cards | Allowed for assigned teaching groups | Global access across all groups and lessons |
| Create Lesson Speech Tasks | Forbidden (HTTP 403 Forbidden) | Allowed via `POST /local/speech/tasks` | Allowed via `POST /local/speech/tasks` |
| Record and Upload Audio | Allowed with local playback and consent verification | Allowed for testing and practice | Allowed without restrictions |
| View Student Audio Recordings | Allowed for own attempts only | Allowed if and only if student checked `includeAudio=true` | Allowed across all unredacted records |
| Correct Transcript Text | Allowed up to 6000 characters; score remains unchanged | Forbidden on student attempts | Forbidden on student attempts |
| Request Confirmed Language Review | Allowed on exact displayed transcript revision | Forbidden on student attempts | Allowed for developer-owned attempts |
| Share Attempt with Teacher | Allowed to active teachers assigned to group | Forbidden (cannot share to self) | Allowed |
| Submit Assessment Dispute | Allowed to active assigned reviewer with reason | Forbidden | Allowed |
| Adjudicate Assessment Dispute | Forbidden | Allowed for assigned teacher (Upheld / Needs reassessment) | Allowed with administrative override |
| Hard Delete Attempt and Audio | Allowed for own attempts; deletes audio, transcripts, shares | Forbidden on student attempts | Allowed for developer-owned attempts |
| Configure Providers & Quotas | Forbidden | Forbidden | Allowed via `/local/providers` and `/local/quota` |

---

## 4. Speech Modes Specification and Dependent Fields

All 5 modes defined in [src/speech-assessment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-assessment.mjs#L4) and their parameter dependencies:

| Mode Identifier | Display Name | Max Duration | Reading Reference | Reference Audio ID | Evaluator | Meaning and Vocabulary Criteria | Dialogue Scenario |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pronunciation` | Pronunciation | 30 seconds | Mandatory (1 to 2000 characters) | Optional (UUID) | `pronunciation` | Disabled / Hidden | Disabled / Hidden |
| `shadowing` | Shadowing | 30 seconds | Mandatory (1 to 2000 characters) | Mandatory (UUID in `qr_media`) | `pronunciation` | Disabled / Hidden | Disabled / Hidden |
| `retelling` | Retelling | 120 seconds | Strictly `null` | Optional (UUID) | `stt` | Mandatory: `sourceText` (max 6000), `keyIdeas` (max 3000), `targetVocabulary` (max 6000) | Disabled / Hidden |
| `free` | Free speech | 120 seconds | Strictly `null` | Optional (UUID) | `stt` | Optional: `sourceText`, `keyIdeas`, `targetVocabulary` | Disabled / Hidden |
| `dialogue` | Situational dialogue | 120 seconds | Strictly `null` | Optional (UUID) | `stt` | Optional criteria fields | Mandatory: `partnerRole` (max 200), `constraints` (max 3000), `maxTurns` (2 to 12) |

---

## 5. Recording Studio Lifecycle and Audio Processing Pipeline

Detailed technical steps implemented in [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L35-L40) and [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L165-L176):

1. **Capture Initialization:** Client requests mono audio stream via `navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })`.
2. **AudioContext Instantiation:** Instantiates `new AudioContext({ sampleRate: 16000 })` and resumes audio context.
3. **Streaming Node Graph:** MediaStreamSource connects to ScriptProcessor with buffer size 4096, 1 input channel, 1 output channel. Output connects to `audio.destination`.
4. **Buffer Accumulation:** `onaudioprocess` receives Float32Array channel slices, enforcing byte budget limit: `Math.min(selected().maxSeconds, Math.floor((10*1024*1024-44)/(audio.sampleRate*2)))`.
5. **WAV PCM16 Encoding Algorithm:** Function `wav(chunks, rate)` allocates `ArrayBuffer(44 + length * 2)` with Little-Endian DataView:
   - Bytes 00-03: ASCII `RIFF`
   - Bytes 04-07: Uint32 `36 + length * 2`
   - Bytes 08-11: ASCII `WAVE`
   - Bytes 12-15: ASCII `fmt `
   - Bytes 16-19: Uint32 `16` (Subchunk1Size for PCM)
   - Bytes 20-21: Uint16 `1` (AudioFormat: 1 = Linear PCM)
   - Bytes 22-23: Uint16 `1` (NumChannels: 1 = Mono)
   - Bytes 24-27: Uint32 `16000` (SampleRate in Hz)
   - Bytes 28-31: Uint32 `32000` (ByteRate: SampleRate * NumChannels * BitsPerSample/8)
   - Bytes 32-33: Uint16 `2` (BlockAlign: NumChannels * BitsPerSample/8)
   - Bytes 34-35: Uint16 `16` (BitsPerSample)
   - Bytes 36-39: ASCII `data`
   - Bytes 40-43: Uint32 `length * 2` (Subchunk2Size)
   - Bytes 44+: Quantized Int16 samples: `Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767))`
6. **Local Inspection:** Blob wrapped in `URL.createObjectURL(blob)` for in-browser verification prior to network transmission.
7. **Two-Phase Network Dispatch:**
   - Phase 1: Binary stream sent to `POST /local/speech/tasks/:id/upload` with header `Content-Type: audio/wav` and metadata header.
   - Phase 2: Analysis trigger sent to `POST /local/speech/tasks/:id/analyze` with explicit payload `{ mediaId, consent: true }`.

---

## 6. Attempt Results, Diagnostic Engine and 0-100 Scales

### 6.1. Metric Normalization Engine

Scoring logic implemented in [src/speech-assessment.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-assessment.mjs#L37-L56) evaluates all 6 metrics:

| Metric Key | Metric Label | Evaluator Task | Scale Normalization Formula |
| :--- | :--- | :--- | :--- |
| `accuracy` | Pronunciation accuracy | `pronunciation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |
| `fluency` | Fluency | `pronunciation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |
| `prosody` | Prosody | `pronunciation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |
| `grammar` | Grammar | `conversation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |
| `vocabulary` | Vocabulary | `conversation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |
| `task` | Task completion | `conversation` | `ratio = (value - scale.min) / (scale.max - scale.min)`; `score = Math.round(ratio * 1000) / 10` |

Sufficiency condition: `duration >= rubric.minimumSeconds && quality === 'ok'`. If insufficient, all metrics resolve to `null`.

Overall score computation: `Math.round(weights.reduce((sum, [k, w]) => sum + scores[k] * w, 0) * 10) / 10`.

### 6.2. Interactive Transcript Rendering and Phoneme Guides

Transcript tokenization in [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L131-L151) splits on whitespace `/(s+)/`. Words with findings receive `mark.speech-highlighted-word` and badge `span.speech-inline-phoneme`.

Complete dictionary of all 15 phoneme guides from [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L5-L21):

| Phoneme | Phoneme Classification Name | Articulatory Coaching Tip |
| :--- | :--- | :--- |
| `θ` | Voiceless dental fricative | Keep tongue tip between upper and lower teeth; blow gently without vocal vibration. |
| `ð` | Voiced dental fricative | Keep tongue tip between teeth; vibrate vocal cords to produce a voiced hum. |
| `iː` | Long front vowel | Spread lips wide in a smile, tongue high and front. Hold longer than /ɪ/. |
| `ɪ` | Short front lax vowel | Relax lips and jaw slightly. Pronounce shorter and softer than /iː/. |
| `uː` | Long back vowel | Round lips into a tight small circle, pull tongue back. Hold longer than /ʊ/. |
| `ʊ` | Short back lax vowel | Relax lips into a loose curve, shorter sound. |
| `ɑː` | Long open vowel | Open jaw wide, keep tongue flat and low. |
| `ʌ` | Short central vowel | Relax jaw in mid-open position, tongue neutral. |
| `ɔː` | Long back rounded vowel | Round lips moderately, tongue raised towards back. |
| `w` | Labio-velar approximant | Round lips tightly without teeth contact; glide into following vowel. |
| `v` | Voiced labiodental fricative | Place upper teeth on lower lip, keep vocal cords vibrating. |
| `r` | Post-alveolar approximant | Curl tongue tip slightly back without touching roof of mouth. |
| `l` | Alveolar lateral approximant | Press tongue tip firmly against alveolar ridge; air flows around sides. |
| `d` | Voiced alveolar plosive | Maintain vocal cord vibration through the final consonant; avoid devoicing. |
| `z` | Voiced alveolar fricative | Vibrate vocal cords; lengthen the preceding vowel. |

### 6.3. Transcript Revisions, Confirmed Language Review, and Social Governance

- **Correction Pipeline:** `POST /local/speech/attempts/:id/correct` inserts text into `qr_speech_corrections` with auto-incrementing `revision`. Original acoustic assessment scores are immutable.
- **Confirmed Language Review:** `POST /local/speech/attempts/:id/confirm-text` sends confirmed revision for separate evaluation of Grammar, Vocabulary, and Task completion metrics without modifying acoustic scores.
- **Teacher Sharing:** `POST /local/speech/attempts/:id/share` writes permissions to `qr_speech_shares` with boolean flag `include_audio`.
- **Dispute Resolution:** `POST /local/speech/attempts/:id/dispute` opens record in `qr_speech_disputes`. Teacher resolves via `POST /local/speech/disputes/:id/decision` with decision (`upheld` or `needs_reassessment`), comment, and teacher score.
- **Complete Purge:** `POST /local/speech/attempts/:id/remove` executes hard delete across attempts, media files, corrections, shares, and disputes.

---

## 7. Four Sight Forensic Anomaly Detection Report

| Anomaly Classification | Code Reference | Forensic Mechanism Description |
| :--- | :--- | :--- |
| `[HIDDEN_GUARD]` | [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L46-L56) | `const staff=['ADMIN','DEVELOPER'].includes(actor.role);` in `lessonCatalog()` returns empty contexts array to standard teachers, preventing card-level scope assignment unless elevated. |
| `[HIDDEN_GUARD]` | [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L87-L91) | Non-owner access to attempt audio is blocked unless teacher is actively assigned in `accounts-group-teachers` catalog document. |
| `[HIDDEN_GUARD]` | [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L178) | `quizSessionId` guard blocks template practice attempts from being shared with teachers. |
| `[ORPHAN_UI]` | [client/demos/speech-practice-ui.js](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/client/demos/speech-practice-ui.js#L188) | Global change listener for `#theme` invokes `afterRender` to redraw HTML5 canvas charts; element is external to speech component root. |
| `[ORPHAN_ENDPOINT]` | [ops/preview-quiz-review-backend.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/ops/preview-quiz-review-backend.mjs#L270) | Route `/local/speech/text-reviews/:id/cancel` mounted in preview server but dialogue coaching routes were omitted from local mock router. |
| `[DEAD_SCHEMA]` | [src/speech-practice.mjs](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/src/speech-practice.mjs#L31) | Field `level` (CEFR A1-C2) validated and stored in `qr_speech_tasks.value_json`, but ignored by acoustic scoring engine in `src/speech-assessment.mjs`. |

---

## 8. Database Schema and Endpoint Catalog

Complete inventory of 9 relational tables underpinning Speech:
1. `qr_speech_tasks`: Stores task configurations, modes, prompts, references, criteria, and dialogue parameters.
2. `qr_speech_attempts`: Stores attempt lifecycles, states, deadlines, result JSON, and owner IDs.
3. `qr_speech_corrections`: Stores student transcript edits with sequential revision tracking.
4. `qr_speech_shares`: Manages teacher access permissions and audio listening consent.
5. `qr_speech_usage`: Tracks audio second budgets and language review quota consumption.
6. `qr_speech_dialogues`: Maintains conversational dialogue sessions and turn counters.
7. `qr_speech_dialogue_turns`: Stores individual student-partner dialogue exchanges.
8. `qr_speech_text_reviews`: Manages confirmed transcript language assessment requests.
9. `qr_speech_disputes`: Tracks student appeals, teacher adjudication decisions, and manual scores.

---

## 9. UI/UX Спецификация экранов, дизайн-система и бриф для генерации альтернативных макетов (AI Prompt Kit)

### 9.1. Визуальная галерея экранов и шаблонов интерфейса

- **Скриншот UI-1: SaaS Шаблон 1 в теме Sky**
  ![Скриншот UI-1: SaaS Шаблон 1 в теме Sky](task-speech-template-1-saas-sky.png)
  *Статусная плашка движка, пустой экран с градиентным штрихом, нумерованные карточки шагов, селекторы с подсказками, интерактивный переключатель и футер действий.*

- **Скриншот UI-2: SaaS Шаблон 1 в теме Dark**
  ![Скриншот UI-2: SaaS Шаблон 1 в теме Dark](task-speech-template-1-saas-dark.png)
  *Адаптация под темную тему с глубокими фонами и сохранением читаемости текста.*

- **Скриншот UI-3: SaaS Шаблон 1 в светлой теме Sand**
  ![Скриншот UI-3: SaaS Шаблон 1 в светлой теме Sand](task-speech-template-1-saas-sand.png)
  *Теплая кремовая палитра без синих оттенков Sky.*

- **Скриншот UI-4: Шаблон 2 в теме Sky (Активное задание и студия записи)**
  ![Скриншот UI-4: Шаблон 2 в теме Sky](task-speech-ui-template-2-sky.png)
  *Карточка выбранного задания, аудиоплеер образца, панель записи с микрофона и зона загрузки файла.*

- **Скриншот UI-5: Шаблон 3 в теме Sky (Результаты анализа и коучинг)**
  ![Скриншот UI-5: Шаблон 3 в теме Sky](task-speech-ui-template-3-sky.png)
  *Сетка баллов 0–100, подсветка отклонений в словах, бейджи фонем и артикуляционные подсказки.*

### 9.2. Дизайн-токены и переменные оформления

| CSS Токен | Назначение | Тема Sky | Тема Dark | Тема Sand |
| :--- | :--- | :--- | :--- | :--- |
| `--bg` | Фоновое пространство страницы | Небесно-голубой | Темно-синий (`#0D1020`) | Теплый кремовый |
| `--card` | Фон карточек и форм | Белый (`#FFFFFF`) | Темный кард (`#171B33`) | Светлый песочный |
| `--ink` | Текст первого плана и заголовки | Графит | Светлый (`#EEF0FF`) | Темно-коричневый |
| `--mute` | Подсказки, плейсхолдеры | Серо-голубой | Серо-лавандовый (`#9AA0C4`) | Серо-бежевый |
| `--line` | Рамки, разделители | Светлая линия | Темная линия (`#262B4D`) | Мягкая бежевая линия |
| `--acc` | Акцентный цвет действий | Насыщенный бирюзовый | Фиолетовый (`#7C7BFF`) | Терракотовый |
| `--rad` / `--rad-sm` | Радиусы скругления | 16px / 10px | 16px / 10px | 16px / 10px |

### 9.3. Реестр полей формы, типы данных и поведение режимов

| Имя поля | Элемент UI | Тип данных | Обязательность | Поведение и зависимость от режима |
| :--- | :--- | :--- | :--- | :--- |
| `lessonContext` | Выпадающий список (Scope) | String / Integer | Да (в режиме урока) | Выбор между Whole lesson и карточкой слова из словаря урока. |
| `mode` | Выпадающий список (Practice Mode) | Enum (5 значений) | Да | Pronunciation, Shadowing, Retelling, Free speech, Situational dialogue. |
| `locale` | Выпадающий список (Locale) | Enum (2 значения) | Да | en-US (General American) или en-GB (Received Pronunciation). |
| `evaluation` | Выпадающий список (Evaluator) | Enum (2 значения) | Да | Pronunciation assessment (баллы 0–100) либо Transcription only (расшифровка). |
| `prompt` | Текстовая область (Prompt) | String (до 2000 знаков) | Да | Текст инструкции для ученика. Блокирует отправку при пустом значении. |
| `reference` | Текстовая область (Reading reference) | String (до 2000 знаков) | Опционально | Образец текста для чтения вслух в Pronunciation и Shadowing. |
| `referenceMediaId` | Поле ввода (Reference Audio ID) | String (UUID, до 36 знаков) | Да (для Shadowing) | Идентификатор эталонного аудиофайла диктора. |
| `sourceText` | Текстовая область (Source passage) | String (до 5000 знаков) | Да (для Retelling) | Исходный текст рассказа, который ученик пересказывает своими словами. |
| `keyIdeas` | Текстовая область (Key ideas) | Список строк (по одной на строку) | Да (для Retelling) | Опорные смысловые тезисы для проверки полноты содержания. |
| `targetVocabulary` | Текстовая область (Target vocabulary) | Список строк (по одной на строку) | Опционально | Обязательные слова и конструкции для использования в речи. |
| `languageReview` | Кнопка-переключатель (Selected / Not selected) | Boolean | Опционально | Запуск дополнительного цикла оценки лексики, грамматики и связности. |

### 9.4. Готовый бриф для внешнего ИИ (Prompt Kit for External AI UI Designers)

```markdown
# TASK: Design an Alternative High-End SaaS UI/UX for Language Learning Speech Practice

## 1. Domain Context
You are a Principal Product Designer designing an enterprise-grade SaaS web interface for an English Language Learning platform (Lumiscia Speech System).
The platform runs in modern browsers with dark, sky, and warm sand theme support using CSS custom variables.

## 2. Core Functional Requirements
The Speech module consists of 3 fundamental templates:
- Template 1: Empty state & Teacher Task Creation Panel (creating speaking assignments).
- Template 2: Student Recording Studio (mic capture, waveforms, audio playback, file upload, consent gate).
- Template 3: Attempt Analysis & Coaching Card (0–100 score gauges, word-level error highlighting, phoneme badges, articulation coach, audio comparison).

## 3. Detailed Scope for Template 1 (Creation Studio)
The creation interface must provide seamless inputs for:
1. Target Scope: Scope selector (Whole lesson vs Specific vocabulary item with part of speech and definition).
2. Practice Mode (5 distinct modes):
   - Pronunciation (phonetic articulation against reference text)
   - Shadowing (speaking simultaneously with a reference native audio track)
   - Retelling (reconstructing source passage using key ideas and target vocabulary)
   - Free Speech (open-ended speaking on prompt)
   - Situational Dialogue (multi-turn roleplay conversation with AI partner)
3. Locale: en-US and en-GB acoustic model picker.
4. Prompt: Multiline student instruction (up to 2000 chars) with character counter.
5. Reference Text & Media: Reading reference passage and reference audio ID.
6. Meaning & Semantic Criteria (Conditional for Retelling/Dialogue):
   - Source text passage
   - Key ideas (multiline / tag chips)
   - Target vocabulary (multiline / tag chips)
7. Separate Language Review: A modern SaaS stateful switch / toggle button (Selected / Not selected) replacing old-fashioned checkboxes.
8. Engine Status Banner: Pilot mode indicator, zero-leakage privacy guarantee, status pulse.

## 4. Design Aesthetics & Constraints
- Style: Modern B2B SaaS (similar to Linear, Stripe, Raycast, Vercel, Supabase).
- Visual structure: Clean grouped cards, numbered progression steps (1, 2, 3), clear typography hierarchy, subtle borders, soft shadows.
- No raw OS form controls: custom-styled selects, rounded inputs with focus glow, modern toggle pills.
- Strictly theme-adaptive: relies on design tokens (--bg, --card, --ink, --mute, --line, --acc).
- Deliverable: Propose 2-3 innovative layout alternatives (e.g. step-by-step wizard, interactive split-pane editor, or modular bento-box grid) with complete HTML/CSS structures and UX rationale.
```