# Номера миграций

Дата: 22 октября 2026.

## Чеклист

- 🟩 `006_content_archive.sql` переименован в `008_content_archive.sql`. `006_integer_entity_ids.sql` не менялся.
- 🟩 Пример перенесен в `db/examples/001_example.sql`. Путь в `test/test-db-adapters.mjs` обновлен. Пустая `db/migrations/` удалена.
- 🟩 Старых путей в коде нет. Примерная схема открывается, оба файла миграций читаются.

Коммит: `Renamed the duplicate learning migration and moved the example schema.`
