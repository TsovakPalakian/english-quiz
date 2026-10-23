# Выпуск Learning Workbench

Это runbook, не разрешение применять миграции или включать платные услуги.
Основной Worker публикуется только из корневого wrangler.toml после production builder.

## Закрытый инспектор

Контейнер `ops/workbench-inspector/compose.yaml` запускается на Linux-хосте с Docker.
INSPECTOR_TOKEN передаётся через окружение, не через файлы проекта или аргументы CLI.
Значение: криптографически случайный base64url token, минимум 32 символа.
Контейнер слушает только 127.0.0.1:8088; оператор ставит перед ним HTTPS reverse proxy
с лимитом тела 20 MiB и таймаутом 10 секунд. Логи тел и Authorization запрещены.

Gateway публикуется отдельно с конфигурацией
`ops/workbench-inspector/wrangler.inspector.toml`. Публичных routes и workers.dev нет.
Ему нужны INSPECTOR_ENDPOINT (фиксированный HTTPS URL с путём /inspect),
секрет INSPECTOR_TOKEN и явный INSPECTOR_ENABLED=true после smoke-проверки decoder.
Не использовать пользовательский URL, query parameters, redirects или cookie forwarding.
FFmpeg проверяет декодирование целиком, не только заголовок; unsupported codecs отклоняются.
Нужны реальные PNG/JPEG/WAV/MP3/MP4 smoke-тесты на целевом контейнере.

Локальная воспроизводимая проверка (только синтетические файлы):

```sh
docker build -t lumiscia-workbench-inspector:local ops/workbench-inspector
node ops/verify-workbench-inspector-docker.mjs --run
```

Скрипт не собирает/не скачивает образ сам: использует уже собранный local image,
запускает одноразовый контейнер на случайном loopback-порту с ограничениями compose,
генерирует пять форматов через настоящий FFmpeg и проверяет негативные сценарии.
Токен не сохраняется и не выводится. После проверки контейнер удаляется, образ остаётся.
Локальная проверка не включает production gateway и не открывает публичный доступ.

## Bindings Основного Worker

Добавлять в **корневой** wrangler.toml только после создания и проверки ресурсов:

```toml
[[r2_buckets]]
binding = "WORKBENCH_MEDIA"
bucket_name = "learn-english-workbench-private-media"

[[services]]
binding = "WORKBENCH_MEDIA_INSPECTOR"
service = "learn-english-workbench-inspector"

[[send_email]]
name = "WORKBENCH_EMAIL"
destination_address = "info@lumiscia.org"
```

R2: отдельный bucket, r2.dev выключен, custom domains отсутствуют, публичный доступ
выключен. Не подменять им MEDIA/CONTENT_MEDIA. Не ставить общий TTL удаления:
одобренные шаблоны и snapshots могут ссылаться на старые объекты.
Удаление частных reports выполняется существующим privacy sweeper по политике;
сроки хранения speech и архивов отдельно согласуются до активации.
Email routing и verified recipient проверяются отдельно; UI не доказывает доставку.

Переменные: WORKBENCH_MEDIA_BUCKET, WORKBENCH_STORAGE_APPROVED,
LEARNING_WORKBENCH_WORKER_ID (существующий активный разработчик),
LEARNING_WORKBENCH_POLICY (approved JSON с явными rubrics/retention/language consent).
Ключи WORKBENCH_GEMINI_KEY и WORKBENCH_AZURE_KEY — только Worker secrets.
Project/model/resource/region — серверные переменные. Не загружать env-файлы целиком:
локальные имена GEMINI/AZURE отличаются от WORKBENCH_*.
Все флаги по умолчанию false; credentialRevision меняется при смене конфигурации.

## Схема И Резервирование

База новых таблиц — **STUDY_DB**, не auth DB.
До работ зафиксировать версию Worker, выключить записи и scheduled preparation,
сохранить export/Time Travel bookmark D1 и архив приватного R2 с внешним SHA-256.
Архивы содержат персональные данные: хранить приватно и удалять по согласованному сроку.

Fresh install без qr_*:

```sh
node ops/prepare-workbench-bootstrap.mjs --out .local-secrets/workbench-bootstrap
```

Пакет создаёт конечную qr_speech_tasks сразу, без DROP родительской таблицы 017.
Оригинальные 001–020 не меняются; manifest содержит их SHA-256 и digest итогового SQL.
SQL отказывает при существующей или частично установленной qr_* схеме.
Не применять этот пакет к уже установленному пилоту и не перезапускать после частичного сбоя.
Сначала проверить полный пакет на отдельной D1-копии, foreign_key_check, готовность схемы
и неизменность старых данных. Локальный SQLite тест не заменяет эту проверку D1.
Не удалять guard/qr_* таблицы ради повторного запуска на production.

Для существующего qr_* использовать только проверенный contiguous checksum baseline
и `ops/rehearse-learning-workbench.mjs` на локальном export. Перестроение 017 на
заполненной D1 требует отдельной стратегии; автоматическое применение запрещено.

Read-only `workbenchInfrastructure` проверяет schema/bindings/configuration, не отправляет
медиа, AI-запросы или письма и не подтверждает приватность удалённых ресурсов.

## Активация И Откат

Порядок: decoder → закрытый gateway → private bucket/mail verification → D1-копия и restore
→ применение проверенной схемы → root bindings/secrets → итоговая приёмка → публикация.
Сначала workbench read-only и network off. Затем настройки разработчика: initialize оставляет
все модели Off; отдельно подтвердить access policies/бюджеты и проверить одну реальную задачу.
Cron уже существует: LEARNING_PREPARATION_ENABLED и сохранённые dispatch/pipeline настройки
не включать до этой проверки. AI-видео с нулевой квотой не активировать и не заменять платным fallback.

Откат: выключить все WORKBENCH_OFF_FLAGS из src/workbench-infrastructure.mjs,
особенно writes/network/preparation, затем при необходимости вернуть предыдущую версию Worker.
Уже отправленный внешний запрос может завершиться и учитывается потраченным.
Новые таблицы и медиа сохраняются; не DROP и не менять одобренные версии.
Restore D1 проверять на отдельной копии; откат всей рабочей базы может потерять новые
пользовательские записи и требует согласованного окна обслуживания.
