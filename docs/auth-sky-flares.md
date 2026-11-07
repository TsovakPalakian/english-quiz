# Искры и встречи на гостевом небе

Предупреждение: файл фиксирует только небо гостевого входа. Роли, группы, экзамены, уроки, словарь, `chatenc:` и `wrangler.toml` не менять.

## Что сделано

Яркие звезды созвездий, 16 блуждающих и фоновые звезды рисуются четырехлучевой искрой. Слабая звезда созвездия с величиной больше 3.5 остается кругом. Длина луча яркой звезды зависит от потока и обрезается расстоянием до соседней. Цвет берется из `appearance`. У фона свечение выключено.

Маневр делает два прохода, второй ближе, в сближении есть нить, разлет со скоростью 1.25. Танец идет восьмеркой со следом. У слияния перемычка толстеет и вспышка из двух колец. У черной дыры диск покачивается, джет вспыхивает дважды, есть второе кольцо. Границы фаз 0.22, 0.65 и 0.82 те же.

## Какие тесты запускать

`node --test test/test-auth-sky.mjs`

Environment пустой.

`node --test test/test-auth-sky-blackhole.mjs`

Environment пустой. Этот файл открывает Chrome и читает `rollback/production-assets`, поэтому перед ним нужен сборщик: `node --input-type=module -e "import './ops/build-learning-production-assets.mjs'"`.

Строка коммита: `Drew luminosity flares and richer star encounters on the guest sky.`

## Плашки под буквами

Небо больше не стирается под надписями главной, брендом и текстом входа, создания аккаунта, входа по коду и сброса пароля. Копирайт и эмблема по-прежнему закрывают небо.

Проверка: `node --test test/test-auth-sky.mjs`. Environment пустой.

Перед просмотром в Chrome: `node --input-type=module -e "import './ops/build-learning-production-assets.mjs'"`, затем `node --test test/test-auth-studio-ui.mjs`. Environment для окна: `SHOW_BROWSER=1;SLOW_MO=800`.

Строка коммита: `Left guest lettering on top of the sky.`

## Тонкие кресты и четыре явления

Искры тонкие, длина и толщина от светимости. Маневр, танец и слияние оставляют пыльный след на всей траектории. У слияния четыре кольца. Джет длиннее, спираль из частиц держится 1400 мс.

`node --test test/test-auth-sky.mjs`

`node --test test/test-auth-sky-blackhole.mjs` показывает по очереди маневр, танец, слияние и черную дыру. Перед ним сборщик: `node --input-type=module -e "import './ops/build-learning-production-assets.mjs'"`.

Окно: Arguments `test-auth-sky-blackhole`, Environment `CHECK_MODE=local;SHOW_BROWSER=1;SLOW_MO=800`.

Строка коммита: `Drew thin luminosity spikes and visible trails for the four sky events.`

## Прозрачные подписи

Небо больше не стирается под названием созвездия, главной звездой, второй именной звездой и ориентирами. Эмблема и копирайт по-прежнему закрывают небо.

`node --test test/test-auth-sky.mjs`. Environment пустой.

Строка коммита: `Left constellation and star names transparent over the sky.`

## Фон снова точками

Мелкие фоновые звезды снова кружки без креста и без ореола. 16 свободно летающих остаются крестом.

`node --test test/test-auth-sky.mjs`. Environment пустой.

Строка коммита: `Restored plain dots for the drifting background stars.`

## Крест созвездия как раньше

У звезды созвездия тонкий крест из линий только при величине до 3.5, длина не больше 28. Более слабая звезда снова круг. 16 свободно летающих остаются с заливным крестом.

`node --test test/test-auth-sky.mjs`. Environment пустой.

Строка коммита: `Restored the original thin cross on constellation stars.`

## Рисунок звезд возвращен

Фон снова точки, летающие звезды снова круги, у созвездия прежний короткий крест. Маневр, танец, слияние и черная дыра снова в прежнем виде. Прозрачные подписи, эмблема, копирайт и гостевые буквы без плашки остаются.

`node --test test/test-auth-sky.mjs`

`node --test test/test-auth-sky-blackhole.mjs`

Environment пустой. Перед вторым: `node --input-type=module -e "import './ops/build-learning-production-assets.mjs'"`.

Строка коммита: `Restored the original guest-sky stars and encounters.`
