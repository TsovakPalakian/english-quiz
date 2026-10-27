# Feedback Theme Adaptation & In-Page View Layout Plan

## Objectives
1. Adapt `.feedback-dialog` and related feedback controls to follow the selected active theme CSS variables (`--card`, `--bg`, `--ink`, `--line`, `--mute`, `--acc`, `--on-acc`).
2. Confine the in-page Settings view strictly within `.phone .wrap` bounds (`width: 100% !important; max-width: 100% !important; box-sizing: border-box; overflow: hidden;`) so it never overflows to the right.
3. Remove the modal close button (`✕`) in all 4 in-page views: Settings, Review queue, My quizzes, and AI providers.
4. Preserve standard modal popup behavior for Settings when opened from Messages (`#messages`), including its dark backdrop and close (`✕`) button.

## Checklist

- [ ] `🟩` **Stage 1: Theme adaptation for Feedback modal and button**
  - Updated `site/preview.css` lines 3338–3373 to replace hardcoded dark colors with CSS theme custom properties.
  - Verified modal backdrop, dropzone, textarea, buttons, inputs, and floating button match the active theme palette across themes.
- [ ] `🟩` **Stage 2: Responsive in-page sizing and close-button removal for Settings**
  - Updated `production/chat.css` to ensure `.chat-dialog.user-settings.in-page` overrides `.chat-dialog.user-settings` max/fixed widths and forces `width: 100% !important; max-width: 100% !important; height: auto !important; max-height: none !important; box-shadow: none !important;`.
  - Hid modal close button `[data-msg-close]` inside `.chat-dialog.user-settings.in-page`.
  - In `production/chat/90-settings.js`, preserved modal launch for `#messages` context and direct profile dialog opens.
- [ ] `🟩` **Stage 3: Remove close button in Review queue, My quizzes, and AI providers**
  - In `site/main-stage.css`, hid `.learning-kit-dialog.workbench-page-view > header` so close buttons are removed in all 3 in-page workbench views.
- [ ] `🟩` **Stage 4: Build assets, full verification & tests**
  - Ran `npm run build:preview` and `node ops/build-learning-production-assets.mjs`.
  - Ran full test suite in CI mode (`npm run check -- --mode=ci`): 165/165 passed (0 errors, 0 skips).
