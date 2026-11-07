# Два отчета 7 ноября

Предупреждение: файл фиксирует только эти две правки. Роли, группы, экзаменационные баллы, PDF-лимиты, `GET /api/settings` и сбой D1 здесь не меняются.

## Назначение экзамена

Скрытый ученик больше не попадает в список Assign exam у ADMIN. Сервер такого ученика не видит и отвечал 404 `Student not found`. У DEVELOPER скрытый ученик в списке остается.

## Дневной вопрос

Карточка с серверным id попадает в вопрос только если `GET /api/me/cards/dictionary` ее вернул. Если проверка не удалась, такие карточки в вопрос не входят. Карточка без серверного id остается.

## Какие тесты запускать

npm `check`, Arguments `test-selected-card-save`, Environment `CHECK_MODE=local`. Файл `test/test-selected-card-save.mjs`.

Второй запуск не через npm `check`: `--test --test-name-pattern "exam assignment list omits a hidden student"`, файл `test/test-exam-workflow.mjs`. Environment пустой.

Строка коммита: `Kept hidden students and unreadable cards out of exam assignment and the daily quiz.`
