# Implementation Plan: Anki Cards Notifications, Sound Alerts and Timing Schedule

## Scope Isolation & Collateral Protection Warning

> <span style="color: red; font-weight: bold;">WARNING</span>: Touching, modifying, or breaking functionality unrelated to Anki cards notifications, header notification bell, sound alerts timing, and session completion notices is strictly prohibited. Edits are isolated exclusively to lesson notifications, shell header notification bell, and Anki cards completion flow.

---

## Approved Design Mockups & Screenshots

### Sky Theme (Primary)

#### «Скриншот 1»: Centered Notifications Modal with Sound Alert Timing Schedule
![Screenshot 1](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-modal-location-sky.png)

#### «Скриншот 2»: Shell Header Notification Bell & Profile Entry Point
![Screenshot 2](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-header-entry-sky.png)

#### «Скриншот 3»: Anki Session Completion Screen with Essential Review Warning
![Screenshot 3](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-completion-sky.png)

### Dark Theme

#### «Скриншот 4»: Centered Notifications Modal in Dark Theme
![Screenshot 4](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-modal-location-dark.png)

#### «Скриншот 5»: Header Notification Bell in Dark Theme
![Screenshot 5](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-header-entry-dark.png)

#### «Скриншот 6»: Anki Session Completion Screen in Dark Theme
![Screenshot 6](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-completion-dark.png)

### Sand Theme

#### «Скриншот 7»: Centered Notifications Modal in Sand Theme
![Screenshot 7](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-modal-location-sand.png)

#### «Скриншот 8»: Header Notification Bell in Sand Theme
![Screenshot 8](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-header-entry-sand.png)

#### «Скриншот 9»: Anki Session Completion Screen in Sand Theme
![Screenshot 9](file:///Users/tsovakpalakian/PycharmProjects/english-quiz/docs/task-anki-notify-completion-sand.png)

---

## Checklist

- 🟩 Shell header notification bell element with unread dot indicator in top navigation bar
- 🟩 Lesson notifications modal layout with Anki cards item and sound alert timing schedule
- 🟩 Audio alert synthesizer using Web Audio API AudioContext with sound playback
- 🟩 Audio timing chip presets (3h, 1h, 15m, 5m) with removal buttons
- 🟩 Custom alert timing adder (number input, unit selector, add button)
- 🟩 Session completion screen for Anki cards with essential review warning and notification shortcut button
- 🟩 Automated unit tests for notification generation and alert timing
- 🟩 Automated visual tests across Sky, Dark, and Sand themes
- 🟩 Production asset build verification
