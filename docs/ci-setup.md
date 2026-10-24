# Тесты, CI/CD и Telegram

## Что запускается

- `npm run check -- --mode=local` — полный автоматический набор на этом компьютере; при наличии установленного Chrome на macOS используется он.
- `npm run check -- --mode=ci` — тот же набор здесь, но с Chromium из Playwright и зависимостями проекта, без локальных запасных путей.
- `CHECK_MODE=ci npm run check` — тот же выбор через переменную окружения. Флаг имеет приоритет.
- `npm run check:remote -- main` — отправить запрос GitHub Actions для уже опубликованной ветки main. Команда не делает commit/push, не загружает локальные изменения и не запускает деплой. Нужны установленный GitHub CLI, `gh auth login` и workflow на основной ветке.
- Фильтр сохраняется: `npm run check -- --mode=local check-environment`.

Оба режима запускают Vitest и все автоматические `test/test-*.mjs`. Исключение `test-settings-production-ui.mjs` сохранено: он требует реального входа. Исключение отображается отдельно и не считается пройденным тестом. Скриншоты больше не создаются. Браузерные проверки идут последовательно, остальные — с ограниченным параллелизмом.

Пропуски внутри Node-тестов также показываются отдельно, а итог считает успешные/неуспешные файлы, не выдавая пропущенные подслучаи за пройденные. Например, существующая дополнительная проверка скачанного WordNet требует `WORDNET_TEST_IMPORT`; без подготовленного набора она остаётся явно пропущенной. Условие успеха pipeline — успешное завершение выбранного автоматического набора по exit codes.

## Подготовка компьютера

Нужны Node.js 24, Python 3.11+, Git, ffmpeg и ffprobe. Эти команды выполняет пользователь:

```bash
npm ci
npx playwright install chromium
npm install --prefix rollback/pdfjs-runtime --no-save --package-lock=false --ignore-scripts pdfjs-dist@6.4.299
```

Для полного прогона нужны локальные `wrangler.toml` и `private/private-migration-media/`. Обновить ресурсы перед тестами:

```bash
node ops/build-learning-production-assets.mjs
npm run check -- --mode=local
```

Режим ci на этом компьютере:

```bash
npm run check -- --mode=ci
```

## Приватные входные файлы GitHub

`wrangler.toml` и приватные inline-media не находятся в репозитории. Облачная сборка не подменяет их пустыми заглушками. На подготовленном компьютере:

```bash
python3 ops/ci-build-inputs.py pack
```

Команда создаёт `.local-secrets/ci-build-inputs.tar.gz` с правами 0600 и печатает SHA256. В архив включаются только `wrangler.toml` и проверенные по хешам `private/private-migration-media/*.bin`; `.env`, SQLite, резервные копии и токены не включаются. Существующий архив не перезаписывается.

Архив содержит приватные материалы: не добавлять его в Git и не размещать публично. Пользователь размещает его в приватном HTTPS-хранилище, доступном runner по секретной или подписанной ссылке. Срок действия ссылки должен покрывать весь прогон и последующий деплой; при истечении её нужно обновить. Сайт и чат не используются для передачи токенов или архива.

В GitHub: Settings → Secrets and variables → Actions → Repository secrets:

- `CI_BUILD_INPUTS_URL` — приватная HTTPS-ссылка на архив.
- `CI_BUILD_INPUTS_SHA256` — напечатанная SHA256.
- `TELEGRAM_BOT_TOKEN` — токен отдельного бота CI, не бота входа на сайт.
- `TELEGRAM_CHAT_ID` — числовой ID вашего чата; сначала отправить боту `/start`.
- `CLOUDFLARE_API_TOKEN` — ограниченный токен публикации Worker только в нужном аккаунте.
- `CLOUDFLARE_ACCOUNT_ID` — ID аккаунта Cloudflare.

При изменении конфигурации или приватных media архив и его SHA256 обновляются вместе. Восстановление проверяет SHA256 и разрешённые пути, запрещает ссылки, обход каталогов и перезапись существующих файлов. Архивы, приватные ресурсы и полные логи не загружаются в Actions artifacts.

## Поведение GitHub

Workflow: `.github/workflows/ci-cd.yml`.

Полный job test использует GitHub `macos-15`, потому что существующие проверки медиадекодера зависят от AVFoundation, xcrun и голосов Samantha/Daniel. Подмена этих проверок Linux-заглушками не выполнялась. macOS-runner может расходовать больше платных минут GitHub: до push проверить тариф/лимит Actions. При отсутствии нужных голосов подготовка явно завершится ошибкой; проверки не будут молча пропущены. В переменной репозитория `CI_TEST_RUNNER` можно указать метку собственного подготовленного macOS-runner вместо GitHub-hosted `macos-15`. Deploy и notify работают на Ubuntu. Полный режим ci на Linux не обещает поддержку нативного медиатеста macOS.

- Push в main: подготовка среды и ресурсов → полный набор тестов → деплой только при успешных тестах → итог Telegram с результатами и ссылкой на запуск.
- Ошибка подготовки или тестов: deploy пропускается; Telegram сообщает failure у test и skipped у deploy.
- Если подготовка не дошла до запуска тестов, сообщение отдельно указывает `Tests: not run`, а не выдаёт её за упавшие или прошедшие проверки.
- Ошибка сборки/публикации в deploy: Telegram сообщает failure у deploy.
- Ручной `check:remote`: только тесты и Telegram; deploy не запускается.
- Деплой использует корневой `wrangler.toml`, production builder и `--keep-vars`. Секреты Cloudflare доступны только deploy job.

В Settings → Environments можно защитить `production` ручным подтверждением; тогда после успешных тестов deploy будет ждать одобрения. GitHub Actions, приватное хранилище и Telegram должны быть доступны. При ошибке доставки уведомления job notify завершится ошибкой, результат останется доступен в Actions.

Сначала настроить секреты и проверить ручной запуск. Workflow должен быть опубликован на основной ветке; первый push без настроек завершится ошибкой подготовки и не выполнит deploy. Для первого размещения без автоматической публикации исходное изменение workflow можно коммитить с поддерживаемой GitHub пометкой `[skip ci]`, затем запустить `check:remote` вручную. Пометка не отменяет workflow_dispatch.

## Локальный коммит

В `.local-secrets/ci.env` (каталог уже игнорируется Git) пользователь задаёт:

```dotenv
TELEGRAM_BOT_TOKEN=REPLACE_WITH_BOT_TOKEN
TELEGRAM_CHAT_ID=REPLACE_WITH_NUMERIC_CHAT_ID
```

Ограничить права файла и явно включить hook:

```bash
chmod 600 .local-secrets/ci.env
npm run hooks:install
```

Установщик не перезаписывает чужой hooksPath или существующий post-commit. Установка действует только в этом checkout; после clone на другом компьютере её повторяют. Git-hook использует Node из PATH терминала/GUI-клиента.

После коммита hook синхронно собирает локальные ресурсы и запускает тесты текущего рабочего дерева, затем отправляет результат в Telegram. До завершения не менять файлы, чтобы результат соответствовал коммиту. Post-commit не отменяет уже созданный коммит при ошибке. Деплой не вызывается. Если Telegram ещё не настроен, hook явно сообщает, что тесты не запущены. `git commit --no-verify` не отключает post-commit; для разового отключения пользователь может использовать `git -c core.hooksPath=/dev/null commit ...`.

## Проверка пользователем

Агент эти команды не запускал:

```bash
npm run check -- --mode=local check-environment ci-build-inputs
npm run check -- --mode=ci check-environment ci-build-inputs
node ops/build-learning-production-assets.mjs
npm run check -- --mode=local
npm run check -- --mode=ci
npm run check:remote -- main
```

После настройки бота пользователь отдельно проверяет получение Telegram на локальном коммите и ручном workflow. Push в main после настройки может опубликовать сайт. Успешный первый облачный прогон, hook и публикация не объявляются проверенными до получения фактических результатов.

Установка зависимостей сообщила о 10 уязвимостях в дереве npm (4 moderate, 3 high, 3 critical). Причины не исследовались и `audit fix` не выполнялся: изменение версий вне согласованной инфраструктуры требует отдельного обсуждения.

Официальные справки: [Playwright в CI](https://playwright.dev/docs/ci), [удалённый запуск через GitHub CLI](https://cli.github.com/manual/gh_workflow_run).
