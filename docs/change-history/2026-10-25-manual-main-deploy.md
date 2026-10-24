# Ручная публикация из main

🟨 Разрешить deploy после успешных тестов при push или workflow_dispatch только для `refs/heads/main`. Другие ветки и теги не публикуются.
🟨 Telegram показывает фактический результат deploy, в том числе при ручном запуске; CLI `check:remote` предупреждает о возможной публикации из main.
🟨 Обновить документацию и добавить проверки сообщения Telegram для ручного запуска. Сборка, секреты и флаги Wrangler не меняются.
⬜ Пользователь проверяет `npm run check -- --mode=local check-environment`. Реальный ручной запуск main может опубликовать сайт и агентом не выполняется.

## Результат
Изменение подготовлено локально. Тесты, commit, push, workflow_dispatch и деплой агентом не запускались.

Сообщение коммита: `Enabled manual main deployments and corrected Telegram deployment results`.
