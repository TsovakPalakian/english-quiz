# Remediation Plan: Speech Task Studio Layout, Criteria Accordion, Consent Card & Progress Accordion

## Scope Boundary & Invariant Protection
> [!IMPORTANT]
> **Collateral Protection Policy**: Tasks must strictly and isolatedly touch only their own scoped functionality. Touching, breaking, or modifying any functionality unrelated to speech task criteria display, studio consent layout, dropzone styling, and comparable progress accordion styling is strictly forbidden.

## Problem Statement
In the speech task recording studio and student review area, four visual and functional defects have been identified from live inspection:
1. **Empty unstyled criteria accordion above banner**: An unstyled `<details><summary>Task material and goals</summary></details>` is rendered at the top of the speech panel when tasks have empty criteria objects. Because it contains no text, clicking it reveals nothing ("не скрывается"), and its unstyled summary sits directly touching the banner border below ("слито").
2. **Awkwardly wrapped and stacked consent checkbox**: The consent block (`.studio-consent-row`) tries to place explanatory text and a checkbox side-by-side with `justify-content: space-between`. Furthermore, due to global rules on `.lm label` applying `flex-direction: column`, the checkbox renders awkwardly on top of the text or wraps into multiple narrow lines ("тоже не очень выглядит").
3. **Unpadded content and browser focus outline on Comparable progress**: The empty state `<p>No comparable completed attempts yet.</p>` inside `<details class="speech-accordion">` lacks a wrapper element with `.speech-accordion-content`, resulting in missing padding and no dividing border. Additionally, clicking `<summary>` displays a thick default browser focus ring.
4. **Native file input button inside reference audio dropzone**: In `.speech-drop-zone`, the native `<input type="file" id="speech-file">` receives the `.input` class from workbench setup, resulting in a nested input border enclosing the native browser `[Choose file] No file chosen` control with clipped text ("снова не так выглядит").

## Remediation Checklist
- 🟩 **Stage 1**: Root-cause analysis and visual mockup generation
- 🟩 **Stage 2**: Check criteria content existence (`hasCriteriaContent`) and wrap in styled `.speech-accordion` below the task card
- 🟩 **Stage 3**: Refactor `.studio-consent-row` to a modern stacked SaaS card with horizontal checkbox alignment (`flex-direction: row !important; align-items: center;`)
- 🟩 **Stage 4**: Wrap `Comparable progress` content in `<div class="speech-accordion-content">` and remove default focus outline from `.speech-accordion summary`
- 🟩 **Stage 5**: Redesign `.speech-drop-zone` into a modern SaaS upload card with a dedicated "Browse file" button and hidden native `#speech-file`
- 🟩 **Stage 6**: Verify across themes (Sky, Dark, Sand) and automated tests
- 🟩 **Stage 7**: Build production assets and verify zero collisions

## Visual Mockups

### Скриншот 1: Исправленный SaaS-блок согласия (Sky)
![Скриншот 1: Исправленный SaaS-блок согласия (Sky)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-consent-refined-sky.png)

### Скриншот 2: Активная студия речи с исправленным блоком согласия
![Скриншот 2: Активная студия речи с исправленным блоком согласия](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-studio-refined-sky.png)

### Скриншот 3: Исправленный аккордеон Comparable progress (Sky)
![Скриншот 3: Исправленный аккордеон Comparable progress (Sky)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/comp-progress-refined-sky.png)

### Скриншот 4: Исправленный аккордеон Comparable progress (Dark)
![Скриншот 4: Исправленный аккордеон Comparable progress (Dark)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/comp-progress-refined-dark.png)

### Скриншот 5: Исправленный аккордеон Comparable progress (Sand)
![Скриншот 5: Исправленный аккордеон Comparable progress (Sand)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/comp-progress-refined-sand.png)

### Скриншот 6: Исправленная зона загрузки эталонного аудио Choose or drop reference audio (Sky)
![Скриншот 6: Исправленная зона загрузки эталонного аудио Choose or drop reference audio (Sky)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-dropzone-refined-sky.png)

### Скриншот 7: Исправленная зона загрузки эталонного аудио (Dark)
![Скриншот 7: Исправленная зона загрузки эталонного аудио (Dark)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-dropzone-refined-dark.png)

### Скриншот 8: Исправленная зона загрузки эталонного аудио (Sand)
![Скриншот 8: Исправленная зона загрузки эталонного аудио (Sand)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-dropzone-refined-sand.png)

### Скриншот 9: Активная студия речи с исправленной зоной загрузки (Sky)
![Скриншот 9: Активная студия речи с исправленной зоной загрузки (Sky)](/Users/tsovakpalakian/.gemini/antigravity/brain/1dd4ea02-3cbf-461c-bf30-58eeb67d36dd/task-studio-dropzone-sky.png)
