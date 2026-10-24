# Починка падений npm run check

## Требование

Починить 4 падения: `test-exams-ui`, `test-learning-main`, `test-saas-ui`, `test-ui-boot`.

## Причины и правки

🟩 exams-ui: PDF input без pointer-events; скрыт в exam editor.
🟩 learning-main: якорь `finishPlace(target)`; `classList?.toggle` для guest-goodbye.
🟩 saas-ui: mock `/api/auth/providers`, регистрация без role, возврат через `[data-studio-back]`, name в invite.
🟩 ui-boot: `guest-goodbye` показывает «See you soon»; убран устаревший `[data-exam-pass]` из setup.
🟩 auth-studio-ui: регистрация без `.auth-tabs`; saas ходит через studio-back.

## Проверка

🟩 `test-auth-studio-ui`, `test-saas-ui`.
🟩 `npm run build:preview` + production assets.

Сообщение коммита: `Restored studio registration without auth tabs`.
