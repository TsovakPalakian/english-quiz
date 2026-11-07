# Правки экрана чата

Предупреждение: этот файл только фиксирует уже сделанные правки и точные запуски. Он не разрешает менять код, роли, группы, экзамены, уроки, словарь, формат `chatenc:` и `wrangler.toml`.

## Что сделано

1. Над Theme больше нет второй надписи Messages.
2. После открытия комнаты синяя цифра непрочитанного снимается.
3. Свой пузырь справа, чужой слева.
4. Клик по фото в шапке комнаты и в ленте открывает панель комнаты. Свое фото в настройках чата по-прежнему открывает фото.
5. Флажок Show earlier group messages стоит в одной строке с текстом.
6. Повторный вход не прячет уже видимое сообщение студента. Прочтение обнуляет счетчик на сервере.

Строка коммита: `Aligned chat bubbles, cleared read badges, and opened the room panel from the header photo.`

## Какие тесты запускать

Полный набор и `test/test-chat-ui.mjs` для просмотра этих правок не запускать. Второй файл проходит весь сайт.

### 1. Окно Chrome

Имя конфигурации: `Chat visual fixes`.

- Команда: npm
- Скрипт: `check`
- Arguments: `test-chat-visual-fixes`
- Environment: `CHECK_MODE=local;SHOW_BROWSER=1;SLOW_MO=800`

Запускается только `test/test-chat-visual-fixes.mjs`: боковая надпись, цифра непрочитанного, стороны пузырей, панель по фото, флажок.

### 2. Без окна

Имя конфигурации: `Student message after sign-in`.

Это не npm `check`. Фильтр `test-chat-durable` взял бы весь файл `test/test-chat-durable.mjs`.

- Node parameters: `--test --test-name-pattern "signing in again keeps a student message"`
- Файл: `test/test-chat-durable.mjs`
- Environment: пустой
