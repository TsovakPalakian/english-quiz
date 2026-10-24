# Сверка 88 созвездий с Go Astronomy

Дата: 24.10.2026. Только аудит: каталог, приложение и публикация не изменялись.

## Результат

- 41 схем имеют различия связей или состава вершин относительно Go Astronomy.
- 7 схем требуют отдельного решения о компонентах двойных звёзд: по неразрешённым изображениям Go нельзя доказать, к какой компоненте должна относиться линия.
- 40 схем визуально совпали по основному контуру. Это не означает побитового совпадения каталогов или повторного измерения астрометрии.

## Что сравнивалось

Просмотрены оригинальные карты Go Astronomy для всех 88 созвездий и рисунки, построенные из текущих `stars`, координат и `connections` в `data/constellations_catalogue.json`. Проверялись видимые ветви, замыкания, промежуточные вершины и принадлежность линий. Сравнение с D3 или Stellarium использовалось только как подсказка, не вместо просмотра карт Go.

Поворот карты, другая проекция и дополнительные несоединённые звёзды сами по себе не считались ошибкой контура. Почти коллинеарная промежуточная звезда может не менять форму, но всё равно отличаться по полноте состава: такой случай Phoenix вынесен отдельно в описание. Для Triangulum Australe ε уже есть в составе; ребро через неё не разбито на две записи, но видимый контур совпадает.

Это сверка условных соединительных рисунков, а не утверждение, что один из атласов задаёт единственный физически правильный рисунок. Здесь целевой образец — именно Go Astronomy. Фотометрия, все фоновые звёзды, глубокий космос и масштаб реального интерфейса заново не проверялись. Скриншоты не делались. Приведённые отличия — подтверждённые примеры, не готовый исчерпывающий список замен каждого ребра; перед исправлением нужен точный список рёбер для выбранной карты.

SHA-256 проверенного каталога: `324e9c6b20e91cf14b54bbb4d7510505d212963cfe78251225a54d3be36b0c8a`.

## Где найдены различия

- **Andromeda (And)**: На Go Astronomy есть β–π; у нас её нет. У нас дополнительно соединены κ–ψ, чего нет на карте Go. [Карта](https://www.go-astronomy.com/constellations.php?Name=Andromeda).
- **Aquarius (Aqr)**: Иначе устроены центральная часть и нижние ветви; у Go замкнутые связи вокруг δ/τ/λ и более подробные южные ответвления, у нас часть звёзд остаётся отдельной. [Карта](https://www.go-astronomy.com/constellations.php?Name=Aquarius).
- **Aquila (Aql)**: Различаются верхнее продолжение через ε и нижняя часть рисунка: связи около ι/λ/θ, а также ветвь γ/δ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Aquila).
- **Ara (Ara)**: Не хватает видимого на Go ответвления α–θ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Ara).
- **Auriga (Aur)**: У нас отсутствует короткая связь ζ–η около южного ответвления от Capella; основной большой контур совпадает. [Карта](https://www.go-astronomy.com/constellations.php?Name=Auriga).
- **Canis Major (CMa)**: У Go иное соединение туловища и нижних ветвей: присутствует ветка через ν², иначе соединены ο/ε/δ/η; у нас часть точек показана отдельно. [Карта](https://www.go-astronomy.com/constellations.php?Name=Canis+Major).
- **Capricornus (Cap)**: Иначе проложен нижний контур и верхняя сторона: у нас дополнительные промежуточные ε/ν и иначе связанные вершины; рисунок Go имеет другую цепочку нижней дуги. [Карта](https://www.go-astronomy.com/constellations.php?Name=Capricornus).
- **Carina (Car)**: У нас добавлены соединённые вершины из соседних Vela/Puppis, включая продолжение от Canopus к ν Pup; отличаются мелкие связи около η/θ. На карте Go центральный рисунок Carina другой. [Карта](https://www.go-astronomy.com/constellations.php?Name=Carina).
- **Centaurus (Cen)**: Сильно упрощена верхняя часть: отдельными остаются несколько звёзд, соединённых у Go; иначе проведены средние и нижние ветви к южным указателям. [Карта](https://www.go-astronomy.com/constellations.php?Name=Centaurus).
- **Cetus (Cet)**: На Go голова замыкается непосредственно γ–ξ; у нас между ними добавлена ν и две связи γ–ν–ξ вместо одной. [Карта](https://www.go-astronomy.com/constellations.php?Name=Cetus).
- **Columba (Col)**: На Go ветка δ–γ–β имеет промежуточную соединённую γ; у нас проведён прямой отрезок δ–β, а γ оставлена отдельной. [Карта](https://www.go-astronomy.com/constellations.php?Name=Columba).
- **Corona Australis (CrA)**: У Go южная дуга от ζ направлена прямо к θ; у нас она проходит через дополнительную η², образуя заметный излом. [Карта](https://www.go-astronomy.com/constellations.php?Name=Corona+Australis).
- **Crater (Crt)**: Go соединяет γ непосредственно с β; у нас добавлены γ–λ–β, меняющие нижнюю сторону чаши. [Карта](https://www.go-astronomy.com/constellations.php?Name=Crater).
- **Cygnus (Cyg)**: На Go контур образует дополнительные замкнутые и боковые линии; у нас более простой крест, отдельными остаются ν/32 и другие вершины. [Карта](https://www.go-astronomy.com/constellations.php?Name=Cygnus).
- **Eridanus (Eri)**: На Go более подробная непрерывная цепь от Cursa к Achernar; у нас несколько промежуточных звёзд не включены в линии, иначе проведена верхняя часть и добавлена вершина π Cet из соседнего созвездия. [Карта](https://www.go-astronomy.com/constellations.php?Name=Eridanus).
- **Fornax (For)**: На Go замкнут четырёхугольник α–ω–ν–β–α. У нас только α–β–ν: ω присутствует, но не хватает связей α–ω и ω–ν. [Карта](https://www.go-astronomy.com/constellations.php?Name=Fornax).
- **Gemini (Gem)**: Не совпадают руки, ноги и центральные соединения близнецов: у нас ряд вершин (θ/ι/κ/ν и другие) оставлен отдельно, рисунок Go заметно полнее. [Карта](https://www.go-astronomy.com/constellations.php?Name=Gemini).
- **Hercules (Her)**: На Go иначе и подробнее соединены обе руки/ноги и верхние ответвления; у нас ι, ω, 29 и часть других звёзд показаны вне линий, сокращена цепь около θ/ρ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Hercules).
- **Hydra (Hya)**: Различаются центральные участки длинного тела и промежуточные вершины; у нас соединения с вершинами Crater, а на карте Go другие промежуточные цепочки. [Карта](https://www.go-astronomy.com/constellations.php?Name=Hydra).
- **Hydrus (Hyi)**: Go показывает замкнутый треугольник α–β–γ с промежуточной ε; у нас треугольник открыт, в верхней ветви добавлены η²/δ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Hydrus).
- **Leo (Leo)**: На Go подробнее голова (λ/κ и замыкание верхней части), а также южные ветви от θ через ι/σ; у нас эти вершины остаются отдельными. [Карта](https://www.go-astronomy.com/constellations.php?Name=Leo).
- **Lepus (Lep)**: На Go основной рисунок туловища замкнут дополнительными связями α–β и β–ε; у нас верхняя и нижняя части соединены иначе и контур открыт. [Карта](https://www.go-astronomy.com/constellations.php?Name=Lepus).
- **Lupus (Lup)**: Верхняя часть у Go замкнута через χ/φ/η, у нас заменена цепью χ–ψ–φ–δ. Иначе замкнуто туловище, разветвления около θ/κ и нижние связи. [Карта](https://www.go-astronomy.com/constellations.php?Name=Lupus).
- **Monoceros (Mon)**: Не хватает связи 13–18, замыкающей верхнюю треугольную часть. Различие компонент двойной ε следует рассматривать отдельно. [Карта](https://www.go-astronomy.com/constellations.php?Name=Monoceros).
- **Ophiuchus (Oph)**: Go проводит ветвь ε–υ–ζ через промежуточную υ; у нас есть прямое ε–ζ, а υ остаётся отдельной. [Карта](https://www.go-astronomy.com/constellations.php?Name=Ophiuchus).
- **Orion (Ori)**: У Go щит соединён с Bellatrix через π³, у нас через π¹; в поднятой руке Go имеет μ–ν, у нас μ–ξ. Есть и другие мелкие различия верхней ветви. [Карта](https://www.go-astronomy.com/constellations.php?Name=Orion).
- **Pavo (Pav)**: Go соединяет Peacock с γ и δ; у нас с β. Не хватает ветки δ–κ–π; κ показана отдельно. Иначе соединены δ/ε/ζ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Pavo).
- **Perseus (Per)**: Существенно отличаются связи у Mirfak и верхних ветвей, замыкания и обе нижние конечности; у нас добавлены небольшие петли, которых не видно на Go. [Карта](https://www.go-astronomy.com/constellations.php?Name=Perseus).
- **Phoenix (Phe)**: Основной контур совпадает, но на участке γ–β карты Go показана промежуточная ν, отсутствующая в нашем составе. Это расхождение полноты вершин, не крупное изменение формы. κ и η на Go вне линий; автоматически добавлять их в контур нельзя. [Карта](https://www.go-astronomy.com/constellations.php?Name=Phoenix).
- **Pisces (Psc)**: Иначе составлены кольца рыб и соединяющая цепь: у нас добавлены промежуточные вершины/замыкания, отличающиеся от контуров Go. [Карта](https://www.go-astronomy.com/constellations.php?Name=Pisces).
- **Puppis (Pup)**: На Go большой замкнутый южный контур с продолжением к Canopus и τ/ν; у нас он обрывается у γ Vel, Canopus/τ остаются отдельными, верхние мелкие соединения тоже другие. [Карта](https://www.go-astronomy.com/constellations.php?Name=Puppis).
- **Pyxis (Pyx)**: Go показывает γ–α–β; у нас добавлено длинное продолжение β–ζ Puppis в соседнее созвездие. [Карта](https://www.go-astronomy.com/constellations.php?Name=Pyxis).
- **Sagittarius (Sgr)**: В текущей схеме значительно больше поперечных связей, петель и северных вершин; верхняя часть и контур чайника/туловища не совпадают с Go. [Карта](https://www.go-astronomy.com/constellations.php?Name=Sagittarius).
- **Scorpius (Sco)**: Не хватает северных продолжений через ν/ρ и завершения хвоста к υ. В текущем рисунке эти звёзды остаются вне линий; основная цепь через Antares сохранена. [Карта](https://www.go-astronomy.com/constellations.php?Name=Scorpius).
- **Scutum (Sct)**: На Go боковая цепь проходит β–ε–δ–γ; у нас β–δ–γ без ε. Другая сторона β–α–γ совпадает. [Карта](https://www.go-astronomy.com/constellations.php?Name=Scutum).
- **Serpens (Ser)**: В голове Go после ε идёт μ Ser, затем соединение к Ophiuchus; у нас ε напрямую соединена с δ Oph, а μ отсутствует. В хвостовой цепи также отличается набор промежуточных вершин. Линии соседнего Ophiuchus на карте Go не считаются собственными линиями Serpens. [Карта](https://www.go-astronomy.com/constellations.php?Name=Serpens).
- **Sextans (Sex)**: Go показывает α–β, β–δ и α–γ. У нас α–β заменена на γ–δ, получилась другая ломаная. [Карта](https://www.go-astronomy.com/constellations.php?Name=Sextans).
- **Taurus (Tau)**: Go заканчивает нижнюю ветвь у ξ после γ–λ–ξ; у нас добавлены продолжения через ν, ο и 10. Верхняя часть и рога в основном совпадают. [Карта](https://www.go-astronomy.com/constellations.php?Name=Taurus).
- **Ursa Major (UMa)**: Отличаются передние и средние конечности: Go имеет продолжение υ–θ и замыкание λ–μ; у нас добавлена ветвь через φ, иначе соединены θ/ι/κ и не замкнут участок λ/μ. [Карта](https://www.go-astronomy.com/constellations.php?Name=Ursa+Major).
- **Vela (Vel)**: У Go замкнут основной контур через γ–ο–δ и есть южное ответвление от κ. У нас контур открыт между γ и δ, ο и часть южной ветви отсутствуют. [Карта](https://www.go-astronomy.com/constellations.php?Name=Vela).
- **Virgo (Vir)**: Go соединяет ζ–ι–μ, у нас α–ι–μ; также не хватает замыкания верхнего участка через ο. Это меняет обе боковые ветви. [Карта](https://www.go-astronomy.com/constellations.php?Name=Virgo).

## Неоднозначные компоненты

Эти случаи не включены в 41 подтверждённое расхождение контура/состава. Выбор компоненты нельзя обосновать только надписью системы на карте.

- **Boötes (Boo)**: Главный контур совпадает визуально. Связи верхней ветви идут к κ¹ вместо κ²; на карте Go стоит неразрешённая подпись κ, по изображению компоненту надёжно не установить. [Карта](https://www.go-astronomy.com/constellations.php?Name=Bootes).
- **Cancer (Cnc)**: Контур совпадает; верхняя ι — двойная. У нас выбрана слабая компонента HIP 43100, в изображении Go обозначена только общая ι; требуется проверка выбора компоненты, а не перестройка контура. [Карта](https://www.go-astronomy.com/constellations.php?Name=Cancer).
- **Canes Venatici (CVn)**: Отрезок Cor Caroli–Chara совпадает визуально. У нас связь привязана к α¹, а яркая α² сохранена отдельно; карта Go обозначает систему общей α, не позволяя установить компоненту по пикселям. [Карта](https://www.go-astronomy.com/constellations.php?Name=Canes+Venatici).
- **Chamaeleon (Cha)**: Контур совпадает визуально; источник привязывает две линии к другой компоненте двойной δ. Карта Go подписывает только δ, выбор компоненты по ней не доказуем. [Карта](https://www.go-astronomy.com/constellations.php?Name=Chamaeleon).
- **Delphinus (Del)**: Ромб и хвост совпадают; связи привязаны к γ¹ вместо γ². По неразрешённой общей подписи γ на карте Go компоненту установить нельзя. [Карта](https://www.go-astronomy.com/constellations.php?Name=Delphinus).
- **Grus (Gru)**: Общий треугольник, шея через μ/λ к γ и нижняя ветвь совпадают визуально. Но у нас треугольник привязан к δ², а шея к δ¹: почти совпадающие точки не соединены. Go обозначает их одним неразрешённым узлом δ¹/δ²; необходимо отдельно согласовать представление двойной. [Карта](https://www.go-astronomy.com/constellations.php?Name=Grus).
- **Lyra (Lyr)**: Контур ромба и треугольника с Vega совпадает визуально, но связи верхнего треугольника отнесены к другой компоненте ε. Общая подпись ε на Go не разрешает выбор компоненты. [Карта](https://www.go-astronomy.com/constellations.php?Name=Lyra).

## Полный реестр 88 схем

| Созвездие | Результат | Наблюдение |
| --- | --- | --- |
| [Andromeda (And)](https://www.go-astronomy.com/constellations.php?Name=Andromeda) | Расхождение | На Go Astronomy есть β–π; у нас её нет. У нас дополнительно соединены κ–ψ, чего нет на карте Go. |
| [Antlia (Ant)](https://www.go-astronomy.com/constellations.php?Name=Antlia) | Визуально совпадает | Основная ломаная ι–α–ε совпадает. |
| [Apus (Aps)](https://www.go-astronomy.com/constellations.php?Name=Apus) | Визуально совпадает | Совпадают β–γ, β–δ, δ–α. Пример показывает, почему нельзя подменять карту Go сравнением с другим атласом. |
| [Aquarius (Aqr)](https://www.go-astronomy.com/constellations.php?Name=Aquarius) | Расхождение | Иначе устроены центральная часть и нижние ветви; у Go замкнутые связи вокруг δ/τ/λ и более подробные южные ответвления, у нас часть звёзд остаётся отдельной. |
| [Aquila (Aql)](https://www.go-astronomy.com/constellations.php?Name=Aquila) | Расхождение | Различаются верхнее продолжение через ε и нижняя часть рисунка: связи около ι/λ/θ, а также ветвь γ/δ. |
| [Ara (Ara)](https://www.go-astronomy.com/constellations.php?Name=Ara) | Расхождение | Не хватает видимого на Go ответвления α–θ. |
| [Aries (Ari)](https://www.go-astronomy.com/constellations.php?Name=Aries) | Визуально совпадает | Контур 41–α–β–γ совпадает; отдельная δ у нас не изменяет контур. |
| [Auriga (Aur)](https://www.go-astronomy.com/constellations.php?Name=Auriga) | Расхождение | У нас отсутствует короткая связь ζ–η около южного ответвления от Capella; основной большой контур совпадает. |
| [Boötes (Boo)](https://www.go-astronomy.com/constellations.php?Name=Bootes) | Компоненты двойных | Главный контур совпадает визуально. Связи верхней ветви идут к κ¹ вместо κ²; на карте Go стоит неразрешённая подпись κ, по изображению компоненту надёжно не установить. |
| [Caelum (Cae)](https://www.go-astronomy.com/constellations.php?Name=Caelum) | Визуально совпадает | Совпадает ломаная γ–β–α–δ. Отличается поворот карты, не набор связей. |
| [Camelopardalis (Cam)](https://www.go-astronomy.com/constellations.php?Name=Camelopardalis) | Визуально совпадает | Совпадает разветвлённый рисунок с центральной α, веткой β–7 и двумя верхними ветвями. |
| [Cancer (Cnc)](https://www.go-astronomy.com/constellations.php?Name=Cancer) | Компоненты двойных | Контур совпадает; верхняя ι — двойная. У нас выбрана слабая компонента HIP 43100, в изображении Go обозначена только общая ι; требуется проверка выбора компоненты, а не перестройка контура. |
| [Canes Venatici (CVn)](https://www.go-astronomy.com/constellations.php?Name=Canes+Venatici) | Компоненты двойных | Отрезок Cor Caroli–Chara совпадает визуально. У нас связь привязана к α¹, а яркая α² сохранена отдельно; карта Go обозначает систему общей α, не позволяя установить компоненту по пикселям. |
| [Canis Major (CMa)](https://www.go-astronomy.com/constellations.php?Name=Canis+Major) | Расхождение | У Go иное соединение туловища и нижних ветвей: присутствует ветка через ν², иначе соединены ο/ε/δ/η; у нас часть точек показана отдельно. |
| [Canis Minor (CMi)](https://www.go-astronomy.com/constellations.php?Name=Canis+Minor) | Визуально совпадает | Совпадает отрезок Procyon–Gomeisa (α–β). |
| [Capricornus (Cap)](https://www.go-astronomy.com/constellations.php?Name=Capricornus) | Расхождение | Иначе проложен нижний контур и верхняя сторона: у нас дополнительные промежуточные ε/ν и иначе связанные вершины; рисунок Go имеет другую цепочку нижней дуги. |
| [Carina (Car)](https://www.go-astronomy.com/constellations.php?Name=Carina) | Расхождение | У нас добавлены соединённые вершины из соседних Vela/Puppis, включая продолжение от Canopus к ν Pup; отличаются мелкие связи около η/θ. На карте Go центральный рисунок Carina другой. |
| [Cassiopeia (Cas)](https://www.go-astronomy.com/constellations.php?Name=Cassiopeia) | Визуально совпадает | Совпадает W-образная цепочка ε–δ–γ–α–β. |
| [Centaurus (Cen)](https://www.go-astronomy.com/constellations.php?Name=Centaurus) | Расхождение | Сильно упрощена верхняя часть: отдельными остаются несколько звёзд, соединённых у Go; иначе проведены средние и нижние ветви к южным указателям. |
| [Cepheus (Cep)](https://www.go-astronomy.com/constellations.php?Name=Cepheus) | Визуально совпадает | Совпадает основной домик и обе нижние ветви, включая μ/ζ/δ и η/θ. |
| [Cetus (Cet)](https://www.go-astronomy.com/constellations.php?Name=Cetus) | Расхождение | На Go голова замыкается непосредственно γ–ξ; у нас между ними добавлена ν и две связи γ–ν–ξ вместо одной. |
| [Chamaeleon (Cha)](https://www.go-astronomy.com/constellations.php?Name=Chamaeleon) | Компоненты двойных | Контур совпадает визуально; источник привязывает две линии к другой компоненте двойной δ. Карта Go подписывает только δ, выбор компоненты по ней не доказуем. |
| [Circinus (Cir)](https://www.go-astronomy.com/constellations.php?Name=Circinus) | Визуально совпадает | Совпадают два луча α–β и α–γ. |
| [Columba (Col)](https://www.go-astronomy.com/constellations.php?Name=Columba) | Расхождение | На Go ветка δ–γ–β имеет промежуточную соединённую γ; у нас проведён прямой отрезок δ–β, а γ оставлена отдельной. |
| [Coma Berenices (Com)](https://www.go-astronomy.com/constellations.php?Name=Coma+Berenices) | Визуально совпадает | На Go, как и у нас, две стороны угла γ–β–α; замыкающей линии α–γ на карте Go нет. |
| [Corona Australis (CrA)](https://www.go-astronomy.com/constellations.php?Name=Corona+Australis) | Расхождение | У Go южная дуга от ζ направлена прямо к θ; у нас она проходит через дополнительную η², образуя заметный излом. |
| [Corona Borealis (CrB)](https://www.go-astronomy.com/constellations.php?Name=Corona+Borealis) | Визуально совпадает | Совпадает незамкнутая дуга ι–ε–δ–γ–α–β–θ. |
| [Corvus (Crv)](https://www.go-astronomy.com/constellations.php?Name=Corvus) | Визуально совпадает | Совпадают четырёхугольник β–δ–γ–ε и продолжение ε–α. |
| [Crater (Crt)](https://www.go-astronomy.com/constellations.php?Name=Crater) | Расхождение | Go соединяет γ непосредственно с β; у нас добавлены γ–λ–β, меняющие нижнюю сторону чаши. |
| [Crux (Cru)](https://www.go-astronomy.com/constellations.php?Name=Crux) | Визуально совпадает | Совпадают две перекладины α–γ и β–δ. |
| [Cygnus (Cyg)](https://www.go-astronomy.com/constellations.php?Name=Cygnus) | Расхождение | На Go контур образует дополнительные замкнутые и боковые линии; у нас более простой крест, отдельными остаются ν/32 и другие вершины. |
| [Delphinus (Del)](https://www.go-astronomy.com/constellations.php?Name=Delphinus) | Компоненты двойных | Ромб и хвост совпадают; связи привязаны к γ¹ вместо γ². По неразрешённой общей подписи γ на карте Go компоненту установить нельзя. |
| [Dorado (Dor)](https://www.go-astronomy.com/constellations.php?Name=Dorado) | Визуально совпадает | Совпадают γ–α и две треугольные части около α/β/ζ и β/δ. |
| [Draco (Dra)](https://www.go-astronomy.com/constellations.php?Name=Draco) | Визуально совпадает | Совпадают замкнутая голова, длинная цепочка тела, ответвления у δ/φ и хвост κ–λ; поворот/проекция карты иные. |
| [Equuleus (Equ)](https://www.go-astronomy.com/constellations.php?Name=Equuleus) | Визуально совпадает | Совпадает ломаная α–δ–γ. |
| [Eridanus (Eri)](https://www.go-astronomy.com/constellations.php?Name=Eridanus) | Расхождение | На Go более подробная непрерывная цепь от Cursa к Achernar; у нас несколько промежуточных звёзд не включены в линии, иначе проведена верхняя часть и добавлена вершина π Cet из соседнего созвездия. |
| [Fornax (For)](https://www.go-astronomy.com/constellations.php?Name=Fornax) | Расхождение | На Go замкнут четырёхугольник α–ω–ν–β–α. У нас только α–β–ν: ω присутствует, но не хватает связей α–ω и ω–ν. |
| [Gemini (Gem)](https://www.go-astronomy.com/constellations.php?Name=Gemini) | Расхождение | Не совпадают руки, ноги и центральные соединения близнецов: у нас ряд вершин (θ/ι/κ/ν и другие) оставлен отдельно, рисунок Go заметно полнее. |
| [Grus (Gru)](https://www.go-astronomy.com/constellations.php?Name=Grus) | Компоненты двойных | Общий треугольник, шея через μ/λ к γ и нижняя ветвь совпадают визуально. Но у нас треугольник привязан к δ², а шея к δ¹: почти совпадающие точки не соединены. Go обозначает их одним неразрешённым узлом δ¹/δ²; необходимо отдельно согласовать представление двойной. |
| [Hercules (Her)](https://www.go-astronomy.com/constellations.php?Name=Hercules) | Расхождение | На Go иначе и подробнее соединены обе руки/ноги и верхние ответвления; у нас ι, ω, 29 и часть других звёзд показаны вне линий, сокращена цепь около θ/ρ. |
| [Horologium (Hor)](https://www.go-astronomy.com/constellations.php?Name=Horologium) | Визуально совпадает | Совпадает ломаная α–ι–η–ζ–μ–β; отдельная сохранённая δ не меняет контур. |
| [Hydra (Hya)](https://www.go-astronomy.com/constellations.php?Name=Hydra) | Расхождение | Различаются центральные участки длинного тела и промежуточные вершины; у нас соединения с вершинами Crater, а на карте Go другие промежуточные цепочки. |
| [Hydrus (Hyi)](https://www.go-astronomy.com/constellations.php?Name=Hydrus) | Расхождение | Go показывает замкнутый треугольник α–β–γ с промежуточной ε; у нас треугольник открыт, в верхней ветви добавлены η²/δ. |
| [Indus (Ind)](https://www.go-astronomy.com/constellations.php?Name=Indus) | Визуально совпадает | Совпадает замкнутый контур α–θ–δ–β–η–α. |
| [Lacerta (Lac)](https://www.go-astronomy.com/constellations.php?Name=Lacerta) | Визуально совпадает | Совпадают оба многоугольника и хвост из девяти вершин. Карта Go существенно повёрнута относительно нашего север-верх; это различие ориентации, не соединений. |
| [Leo (Leo)](https://www.go-astronomy.com/constellations.php?Name=Leo) | Расхождение | На Go подробнее голова (λ/κ и замыкание верхней части), а также южные ветви от θ через ι/σ; у нас эти вершины остаются отдельными. |
| [Leo Minor (LMi)](https://www.go-astronomy.com/constellations.php?Name=Leo+Minor) | Визуально совпадает | Совпадает четырёхугольник 46–β–21–30 и ответвление 21–10. |
| [Lepus (Lep)](https://www.go-astronomy.com/constellations.php?Name=Lepus) | Расхождение | На Go основной рисунок туловища замкнут дополнительными связями α–β и β–ε; у нас верхняя и нижняя части соединены иначе и контур открыт. |
| [Libra (Lib)](https://www.go-astronomy.com/constellations.php?Name=Libra) | Визуально совпадает | Совпадают верхний треугольник и ветви к σ и υ–τ. |
| [Lupus (Lup)](https://www.go-astronomy.com/constellations.php?Name=Lupus) | Расхождение | Верхняя часть у Go замкнута через χ/φ/η, у нас заменена цепью χ–ψ–φ–δ. Иначе замкнуто туловище, разветвления около θ/κ и нижние связи. |
| [Lynx (Lyn)](https://www.go-astronomy.com/constellations.php?Name=Lynx) | Визуально совпадает | Контур совпадает: подписанная на Go 10 UMa — наша HIP 44248. Отдельная HIP 44700 не должна автоматически считаться пропущенной вершиной: Go также проводит прямую 38–10. |
| [Lyra (Lyr)](https://www.go-astronomy.com/constellations.php?Name=Lyra) | Компоненты двойных | Контур ромба и треугольника с Vega совпадает визуально, но связи верхнего треугольника отнесены к другой компоненте ε. Общая подпись ε на Go не разрешает выбор компоненты. |
| [Mensa (Men)](https://www.go-astronomy.com/constellations.php?Name=Mensa) | Визуально совпадает | После последней правки совпадает цепочка четырёх звёзд α–γ–η–β. |
| [Microscopium (Mic)](https://www.go-astronomy.com/constellations.php?Name=Microscopium) | Визуально совпадает | Совпадает пятиугольник ε–γ–α–ι–θ¹–ε. Дополнительная отдельная β у нас не меняет контур. |
| [Monoceros (Mon)](https://www.go-astronomy.com/constellations.php?Name=Monoceros) | Расхождение | Не хватает связи 13–18, замыкающей верхнюю треугольную часть. Различие компонент двойной ε следует рассматривать отдельно. |
| [Musca (Mus)](https://www.go-astronomy.com/constellations.php?Name=Musca) | Визуально совпадает | Совпадают четырёхугольник β–δ–γ–α и продолжение α–ε–λ. |
| [Norma (Nor)](https://www.go-astronomy.com/constellations.php?Name=Norma) | Визуально совпадает | Совпадает четырёхугольник δ–ε–γ²–η–δ. |
| [Octans (Oct)](https://www.go-astronomy.com/constellations.php?Name=Octans) | Визуально совпадает | Совпадает треугольник β–ν–δ; отдельная σ у нас не меняет контур. |
| [Ophiuchus (Oph)](https://www.go-astronomy.com/constellations.php?Name=Ophiuchus) | Расхождение | Go проводит ветвь ε–υ–ζ через промежуточную υ; у нас есть прямое ε–ζ, а υ остаётся отдельной. |
| [Orion (Ori)](https://www.go-astronomy.com/constellations.php?Name=Orion) | Расхождение | У Go щит соединён с Bellatrix через π³, у нас через π¹; в поднятой руке Go имеет μ–ν, у нас μ–ξ. Есть и другие мелкие различия верхней ветви. |
| [Pavo (Pav)](https://www.go-astronomy.com/constellations.php?Name=Pavo) | Расхождение | Go соединяет Peacock с γ и δ; у нас с β. Не хватает ветки δ–κ–π; κ показана отдельно. Иначе соединены δ/ε/ζ. |
| [Pegasus (Peg)](https://www.go-astronomy.com/constellations.php?Name=Pegasus) | Визуально совпадает | Большой квадрат и ветви совпадают. На оригинале Go ξ действительно лежит на соединённом участке α–ξ–ζ; исключать её по другому атласу нельзя. |
| [Perseus (Per)](https://www.go-astronomy.com/constellations.php?Name=Perseus) | Расхождение | Существенно отличаются связи у Mirfak и верхних ветвей, замыкания и обе нижние конечности; у нас добавлены небольшие петли, которых не видно на Go. |
| [Phoenix (Phe)](https://www.go-astronomy.com/constellations.php?Name=Phoenix) | Расхождение | Основной контур совпадает, но на участке γ–β карты Go показана промежуточная ν, отсутствующая в нашем составе. Это расхождение полноты вершин, не крупное изменение формы. κ и η на Go вне линий; автоматически добавлять их в контур нельзя. |
| [Pictor (Pic)](https://www.go-astronomy.com/constellations.php?Name=Pictor) | Визуально совпадает | Совпадает ломаная α–γ–β. |
| [Pisces (Psc)](https://www.go-astronomy.com/constellations.php?Name=Pisces) | Расхождение | Иначе составлены кольца рыб и соединяющая цепь: у нас добавлены промежуточные вершины/замыкания, отличающиеся от контуров Go. |
| [Piscis Austrinus (PsA)](https://www.go-astronomy.com/constellations.php?Name=Piscis+Austrinus) | Визуально совпадает | Совпадают основная фигура с Fomalhaut и небольшой треугольник μ–θ–ι справа. |
| [Puppis (Pup)](https://www.go-astronomy.com/constellations.php?Name=Puppis) | Расхождение | На Go большой замкнутый южный контур с продолжением к Canopus и τ/ν; у нас он обрывается у γ Vel, Canopus/τ остаются отдельными, верхние мелкие соединения тоже другие. |
| [Pyxis (Pyx)](https://www.go-astronomy.com/constellations.php?Name=Pyxis) | Расхождение | Go показывает γ–α–β; у нас добавлено длинное продолжение β–ζ Puppis в соседнее созвездие. |
| [Reticulum (Ret)](https://www.go-astronomy.com/constellations.php?Name=Reticulum) | Визуально совпадает | Совпадает замкнутый четырёхугольник ε–δ–β–α. |
| [Sagitta (Sge)](https://www.go-astronomy.com/constellations.php?Name=Sagitta) | Визуально совпадает | Совпадают γ–δ и два луча δ–α/δ–β. |
| [Sagittarius (Sgr)](https://www.go-astronomy.com/constellations.php?Name=Sagittarius) | Расхождение | В текущей схеме значительно больше поперечных связей, петель и северных вершин; верхняя часть и контур чайника/туловища не совпадают с Go. |
| [Scorpius (Sco)](https://www.go-astronomy.com/constellations.php?Name=Scorpius) | Расхождение | Не хватает северных продолжений через ν/ρ и завершения хвоста к υ. В текущем рисунке эти звёзды остаются вне линий; основная цепь через Antares сохранена. |
| [Sculptor (Scl)](https://www.go-astronomy.com/constellations.php?Name=Sculptor) | Визуально совпадает | Совпадает ломаная α–δ–γ–β. |
| [Scutum (Sct)](https://www.go-astronomy.com/constellations.php?Name=Scutum) | Расхождение | На Go боковая цепь проходит β–ε–δ–γ; у нас β–δ–γ без ε. Другая сторона β–α–γ совпадает. |
| [Serpens (Ser)](https://www.go-astronomy.com/constellations.php?Name=Serpens) | Расхождение | В голове Go после ε идёт μ Ser, затем соединение к Ophiuchus; у нас ε напрямую соединена с δ Oph, а μ отсутствует. В хвостовой цепи также отличается набор промежуточных вершин. Линии соседнего Ophiuchus на карте Go не считаются собственными линиями Serpens. |
| [Sextans (Sex)](https://www.go-astronomy.com/constellations.php?Name=Sextans) | Расхождение | Go показывает α–β, β–δ и α–γ. У нас α–β заменена на γ–δ, получилась другая ломаная. |
| [Taurus (Tau)](https://www.go-astronomy.com/constellations.php?Name=Taurus) | Расхождение | Go заканчивает нижнюю ветвь у ξ после γ–λ–ξ; у нас добавлены продолжения через ν, ο и 10. Верхняя часть и рога в основном совпадают. |
| [Telescopium (Tel)](https://www.go-astronomy.com/constellations.php?Name=Telescopium) | Визуально совпадает | Совпадает угол ζ–α–ε. |
| [Triangulum (Tri)](https://www.go-astronomy.com/constellations.php?Name=Triangulum) | Визуально совпадает | Совпадает треугольник α–β–γ; отдельно отмеченная на Go δ не является вершиной соединённых рёбер. |
| [Triangulum Australe (TrA)](https://www.go-astronomy.com/constellations.php?Name=Triangulum+Australe) | Визуально совпадает | Совпадает большой треугольник α–β–γ; ε присутствует на его стороне. На нашем графе ε хранится отдельной точкой поверх прямой β–γ, без разбиения ребра на две записи. |
| [Tucana (Tuc)](https://www.go-astronomy.com/constellations.php?Name=Tucana) | Визуально совпадает | Совпадает замкнутый шестиугольник γ–α–δ–ε–ζ–β–γ. |
| [Ursa Major (UMa)](https://www.go-astronomy.com/constellations.php?Name=Ursa+Major) | Расхождение | Отличаются передние и средние конечности: Go имеет продолжение υ–θ и замыкание λ–μ; у нас добавлена ветвь через φ, иначе соединены θ/ι/κ и не замкнут участок λ/μ. |
| [Ursa Minor (UMi)](https://www.go-astronomy.com/constellations.php?Name=Ursa+Minor) | Визуально совпадает | Совпадают ковш β–γ–η–ζ и ручка ζ–ε–δ–α. |
| [Vela (Vel)](https://www.go-astronomy.com/constellations.php?Name=Vela) | Расхождение | У Go замкнут основной контур через γ–ο–δ и есть южное ответвление от κ. У нас контур открыт между γ и δ, ο и часть южной ветви отсутствуют. |
| [Virgo (Vir)](https://www.go-astronomy.com/constellations.php?Name=Virgo) | Расхождение | Go соединяет ζ–ι–μ, у нас α–ι–μ; также не хватает замыкания верхнего участка через ο. Это меняет обе боковые ветви. |
| [Volans (Vol)](https://www.go-astronomy.com/constellations.php?Name=Volans) | Визуально совпадает | Совпадают два треугольника с общей ε: α–β–ε и ε–δ–γ. Отдельная ζ не меняет контур. |
| [Vulpecula (Vul)](https://www.go-astronomy.com/constellations.php?Name=Vulpecula) | Визуально совпадает | Совпадает ломаная 23–15–13–α–1; дополнительная отдельная 31 у нас не является частью линий. |

## Источники и ограничения

Оригиналы 88 карт сохранены локально в [справочном архиве](../../private/reference/go-astronomy/2026-10-24/README.md), с исходным манифестом и проверенными SHA-256. Архив находится внутри проекта, но исключён из Git и публикации.

Точные URL исходных карт, размеры и SHA-256 загруженных изображений сохранены в [go-astronomy-audit-sources.json](./2026-10-24-go-astronomy-audit-sources.json). Изображения не включены в репозиторий. Реестр относится к состоянию источников на дату проверки; изменение изображения на сайте потребует повторной сверки.

Одинаковое количество звёзд не считалось доказательством совпадения. Автоматически проверены полнота 88/88, уникальность сокращений, наличие источника для каждого созвездия и контрольные суммы исходных файлов. Само чтение линий выполнено визуально; независимой второй проверки всех рёбер не было. При неразрешённых двойных системах неопределённость явно сохранена.

