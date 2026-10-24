# WordNet в рабочем модуле

WordNet 3.0 использует отдельную D1 `learn-english-wordnet` через binding `WORDNET_DB`. Рабочие DB/STUDY_DB и карточки не изменяются. Импорт хранит полную лицензию Princeton, закреплённый manifest и неизменяемые записи. Переводы, IPA и CEFR не генерируются.

## Подготовка
Команды выполняются из корня проекта. Экспорт локальный, не отправляет данные и отказывается перезаписывать существующий файл:

```bash
node ops/export-wordnet-d1.mjs private/wordnet-3.0 private/wordnet-3.0/wordnet-d1.sql
npx --no-install wrangler d1 create learn-english-wordnet
```

После создания добавить в корневой `wrangler.toml` отдельную секцию `[[d1_databases]]` с `binding = "WORDNET_DB"`, `database_name = "learn-english-wordnet"` и реальным `database_id` из ответа Cloudflare. В `[vars]` добавить `LEARNING_WORDNET_ENABLED = "true"` только после успешного импорта:

```bash
npx --no-install wrangler d1 execute learn-english-wordnet --remote --config wrangler.toml --file private/wordnet-3.0/wordnet-d1.sql
```

Импорт предназначен только для новой пустой словарной базы, не для DB/STUDY_DB. Если импорт оборвался, не включать flag: завершённость проверяется manifest, числом записей и закреплённым SHA256. Автоматического повтора и удаления базы нет.

## Доступ
После публикации зарегистрированный WordNet доступен в существующих настройках Service selections → Dictionary. Выбрать `wordnet`, locale `en`/`en-US`/`en-GB`, mode `text`, подтвердить доступ для задачи `dictionary` и задать бюджет провайдера `princeton-wordnet` через существующие настройки. Подключение не переписывает сохранённые selections других сервисов и не обходит подтверждение доступа.

Для авторизованных преподавателя/разработчика серверный поиск: `POST /api/learning-workbench/dictionary/lookup`, JSON `{"word":"drizzle"}`. Действуют текущая сессия, same-origin, разрешение записей, выбранный провайдер и лимиты. Поиск не сохраняет результат в карточки. Отдельная страница или кнопка поиска этим изменением не добавляется.

## Проверка пользователем
```bash
npm run check -- --mode=local wordnet-import workbench-production-providers
```
Тесты агентом не запускались. После повторной авторизации пользователя отдельная D1 создана, Cloudflare подтвердил успешный импорт (206951 SQL-запрос, две таблицы, 44,30 MB). В корневой `wrangler.toml` добавлены реальный binding и flag будущего выпуска. Публикация не выполнялась; подключение runtime и сохранённый выбор Dictionary ещё требуют проверки/подтверждения. Повторно выполнять создание и импорт для этой базы не нужно.
