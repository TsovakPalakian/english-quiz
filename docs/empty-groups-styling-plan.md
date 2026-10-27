# Empty Groups and Levels Styling Plan

## Goal
Visually dim empty level cards and empty study group items (where all counts/metrics are zero) in the Groups section (`#groups`), while keeping them fully interactive, clickable, and accessible with smooth hover transitions.

## Checklist
- 🟩 **Stage 1**: Add `.is-empty` class detection in `client/52-lessons.js` for level buttons in `levelButtons()` and group rows in `paintGroups()`.
- 🟩 **Stage 2**: Add CSS rules in `site/preview.css` for `.file-card.is-empty` and `.day-row.is-empty .day` with `opacity: 0.55` and full opacity on `:hover` and `:focus-visible`.
- 🟩 **Stage 3**: Build preview assets via `npm run build:preview`.
- 🟩 **Stage 4**: Verify with test suite `node ops/check-all.mjs` (165 passed) and capture local UI screenshots for user review.
- 🟩 **Stage 5**: Mark all items `🟩` and provide English past-tense commit message.
