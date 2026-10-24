# Схемы Go Astronomy и адаптивное размещение

Дата: 24.10.2026. Только локально: без публикации, commit/push и скриншотов.

## Выполненный объём

🟩 Обновлены 41 схема из [аудита](../reports/2026-10-24-go-astronomy-audit.md): связи, промежуточные вершины и замыкания. Добавлены 16 звёзд из закреплённого HYG 4.1. Исходные звёзды, координаты и измеренные яркости сохранены.

🟩 Gemini, Fornax, Cygnus, Serpens, Monoceros и Aquarius проверены в общем импорте. Fornax замкнут четырьмя связями; в Monoceros восстановлена верхняя треугольная связь; в Serpens восстановлена ветвь через μ. У Serpens две раздельные части: центральный рисунок Ophiuchus на исходной карте не выдается за Serpens.

🟩 Индивидуальные размер и положение вычисляются из реальных координат, текущих ширины/высоты окна, свободных областей интерфейса и места для подписей. Изменение окна и формы вызывает перерасчёт. Cancer помещается целиком. Ни связи, ни отдельные звёзды ради размещения не удаляются и не раздвигаются.

🟩 Несоединённые собственные звёзды сохранены в отрисовке; ненужные соседние вершины старого атласа исключены только из экранного представления, а не из исходного каталога. Они больше не уменьшают размер созвездия.

🟩 Сохранены происхождение схем и SHA-256 исходных карт. Повторный импорт D3 не затирает более поздние схемы Go. Тесты проверяют соответствие сохранённым путям, HYG, неизменность остальных 47 схем и повторяемость импорта.

🟩 Автоматические проверки пройдены: 12 тестов каталога, 9 тестов deep-sky, 7 тестов независимого аудита; геометрия/проекция; браузерные проверки форм и отрисовки линий; 880 размещений без обрезки и пересечений на перечисленных ниже экранах. Проверка целостности данных: 0 ошибок. Локальная сборка проверена по контрольной сумме через уже открытый сервер.

## Ограничения интерфейса

На экранах 1440×1000 все 88 схем помещаются на главной, при входе, регистрации и восстановлении пароля. На 390×844 они также помещаются, но это не означает одинаковую читаемость на маленьком экране.

В мобильных формах входа/регистрации охраняемые области занимают:

- `.auth-brand.brand.studio-brand`: x=20–370, y=8–200 — эмблема и надписи бренда.
- `#accountBody`: x=20–370, y=212–586 — форма и её элементы.
- `.site-copyright`: y=814–840 — нижняя строка.

Основная свободная область остаётся между формой и нижней строкой: около 228 px по высоте до внутренних отступов. В ней должны поместиться весь рисунок, название, главная звезда и подписи видимых ориентиров. Поэтому **Andromeda, Auriga, Boötes, Cassiopeia, Cygnus, Hercules, Lynx, Perseus** уменьшаются до примерно 58–75 px по большей стороне. Геометрия не обрезается, но это ограничение удобства просмотра, а не полноразмерный мобильный атлас. Во время восстановления пароля особенно уменьшается Cassiopeia. Расположение интерфейса автоматически не менялось.

Диагностика при уменьшении более чем вдвое относительно доступного окна или невозможности размещения доступна в `#authSky.dataset.skyLayoutIssues`: созвездие, размеры окна и именованные области интерфейса. Неудача поиска не объявляется доказательством математической невозможности размещения.

Cancer в проверке: примерно 860 px на главной 1440×1000, 354 px на главной 390×844, 208 px в мобильных формах входа/регистрации. Близкие компоненты ι Cancer могут разделяться долями пикселя: их физические координаты не раздвигались. Семь неоднозначных систем из аудита (Boötes, Cancer, Canes Venatici, Chamaeleon, Delphinus, Grus, Lyra) оставлены без подмены компонент.

## Достоверность и различия исходных карт

Схемы Go условные; их растровые положения не заменяют измеренные координаты. В Sagittarius ω оставлена именно ω по HYG, а не заменена на 52 Sgr ради сходства с её растровым положением; этот участок не обещан пиксельно идентичным картинке Go. У Puppis южная вершина соответствует σ Puppis (HIP36377), хотя на карте стоит δ; в Carina обозначению ρ соответствует V337 Car (HIP50371). Неподписанные вершины Vela/Carina/Puppis сверялись с расположением соседей и яркими записями HYG; координаты из пикселей не создавались.

Автоматические тесты подтверждают целостность, воспроизводимость и отрисовку выбранных связей, но не являются независимой второй астрономической проверкой каждой визуальной транскрипции. Существующие замечания к описательной метаинформации deep-sky из общего аудита не входят в исправление соединительных рисунков.

## Проверенные окна

| Окно | Экран | Схем без обрезки/пересечений |
| --- | --- | --- |
| 1440×1000 | home | 88/88 |
| 1280×800 | home-resized | 88/88 |
| 1440×1000 | login | 88/88 |
| 1440×1000 | registration | 88/88 |
| 1440×1000 | recovery | 88/88 |
| 390×844 | home | 88/88 |
| 430×932 | home-resized | 88/88 |
| 390×844 | login | 88/88 |
| 390×844 | registration | 88/88 |
| 390×844 | recovery | 88/88 |

Измерения масштаба выше — снимок числовых результатов теста; при случайном выборе свободного места значения могут отличаться. Результаты не доказывают размещение во всех возможных размерах окон.

## Изменения схем

Числа — относительно каталога до этих правок. Дополнительные несоединённые звёзды старого каталога сохранены.

| Созвездие / карта | Новых звёзд | Добавлено связей | Убрано связей | Связей теперь |
| --- | --- | --- | --- | --- |
| [Andromeda (And)](https://www.go-astronomy.com/constellations.php?Name=Andromeda) | 0 | 1 | 1 | 16 |
| [Aquarius (Aqr)](https://www.go-astronomy.com/constellations.php?Name=Aquarius) | 4 | 11 | 3 | 22 |
| [Aquila (Aql)](https://www.go-astronomy.com/constellations.php?Name=Aquila) | 0 | 6 | 3 | 12 |
| [Ara (Ara)](https://www.go-astronomy.com/constellations.php?Name=Ara) | 0 | 2 | 0 | 8 |
| [Auriga (Aur)](https://www.go-astronomy.com/constellations.php?Name=Auriga) | 0 | 1 | 0 | 11 |
| [Canis Major (CMa)](https://www.go-astronomy.com/constellations.php?Name=Canis+Major) | 1 | 5 | 1 | 15 |
| [Capricornus (Cap)](https://www.go-astronomy.com/constellations.php?Name=Capricornus) | 0 | 2 | 2 | 10 |
| [Carina (Car)](https://www.go-astronomy.com/constellations.php?Name=Carina) | 1 | 3 | 13 | 8 |
| [Centaurus (Cen)](https://www.go-astronomy.com/constellations.php?Name=Centaurus) | 0 | 12 | 5 | 22 |
| [Cetus (Cet)](https://www.go-astronomy.com/constellations.php?Name=Cetus) | 0 | 1 | 2 | 14 |
| [Columba (Col)](https://www.go-astronomy.com/constellations.php?Name=Columba) | 0 | 2 | 1 | 5 |
| [Corona Australis (CrA)](https://www.go-astronomy.com/constellations.php?Name=Corona+Australis) | 0 | 1 | 2 | 6 |
| [Crater (Crt)](https://www.go-astronomy.com/constellations.php?Name=Crater) | 0 | 1 | 2 | 8 |
| [Cygnus (Cyg)](https://www.go-astronomy.com/constellations.php?Name=Cygnus) | 0 | 4 | 0 | 12 |
| [Eridanus (Eri)](https://www.go-astronomy.com/constellations.php?Name=Eridanus) | 1 | 5 | 8 | 23 |
| [Fornax (For)](https://www.go-astronomy.com/constellations.php?Name=Fornax) | 0 | 2 | 0 | 4 |
| [Gemini (Gem)](https://www.go-astronomy.com/constellations.php?Name=Gemini) | 0 | 6 | 2 | 15 |
| [Hercules (Her)](https://www.go-astronomy.com/constellations.php?Name=Hercules) | 0 | 6 | 1 | 22 |
| [Hydra (Hya)](https://www.go-astronomy.com/constellations.php?Name=Hydra) | 0 | 4 | 4 | 18 |
| [Hydrus (Hyi)](https://www.go-astronomy.com/constellations.php?Name=Hydrus) | 0 | 2 | 3 | 4 |
| [Leo (Leo)](https://www.go-astronomy.com/constellations.php?Name=Leo) | 0 | 8 | 1 | 16 |
| [Lepus (Lep)](https://www.go-astronomy.com/constellations.php?Name=Lepus) | 0 | 2 | 0 | 12 |
| [Lupus (Lup)](https://www.go-astronomy.com/constellations.php?Name=Lupus) | 0 | 5 | 5 | 12 |
| [Monoceros (Mon)](https://www.go-astronomy.com/constellations.php?Name=Monoceros) | 0 | 1 | 0 | 9 |
| [Ophiuchus (Oph)](https://www.go-astronomy.com/constellations.php?Name=Ophiuchus) | 0 | 2 | 1 | 18 |
| [Orion (Ori)](https://www.go-astronomy.com/constellations.php?Name=Orion) | 0 | 3 | 2 | 25 |
| [Pavo (Pav)](https://www.go-astronomy.com/constellations.php?Name=Pavo) | 0 | 6 | 4 | 12 |
| [Perseus (Per)](https://www.go-astronomy.com/constellations.php?Name=Perseus) | 0 | 6 | 10 | 19 |
| [Phoenix (Phe)](https://www.go-astronomy.com/constellations.php?Name=Phoenix) | 1 | 2 | 1 | 8 |
| [Pisces (Psc)](https://www.go-astronomy.com/constellations.php?Name=Pisces) | 0 | 4 | 9 | 18 |
| [Puppis (Pup)](https://www.go-astronomy.com/constellations.php?Name=Puppis) | 1 | 5 | 6 | 10 |
| [Pyxis (Pyx)](https://www.go-astronomy.com/constellations.php?Name=Pyxis) | 0 | 0 | 1 | 2 |
| [Sagittarius (Sgr)](https://www.go-astronomy.com/constellations.php?Name=Sagittarius) | 3 | 9 | 11 | 27 |
| [Scorpius (Sco)](https://www.go-astronomy.com/constellations.php?Name=Scorpius) | 0 | 4 | 0 | 17 |
| [Scutum (Sct)](https://www.go-astronomy.com/constellations.php?Name=Scutum) | 1 | 2 | 1 | 5 |
| [Serpens (Ser)](https://www.go-astronomy.com/constellations.php?Name=Serpens) | 0 | 3 | 3 | 13 |
| [Sextans (Sex)](https://www.go-astronomy.com/constellations.php?Name=Sextans) | 0 | 1 | 1 | 3 |
| [Taurus (Tau)](https://www.go-astronomy.com/constellations.php?Name=Taurus) | 0 | 0 | 3 | 8 |
| [Ursa Major (UMa)](https://www.go-astronomy.com/constellations.php?Name=Ursa+Major) | 0 | 4 | 4 | 21 |
| [Vela (Vel)](https://www.go-astronomy.com/constellations.php?Name=Vela) | 3 | 5 | 1 | 11 |
| [Virgo (Vir)](https://www.go-astronomy.com/constellations.php?Name=Virgo) | 0 | 4 | 2 | 14 |

Всего: 88 созвездий, 852 записей звёзд / 839 уникальных HIP, 777 связей. Измеренная фотометрия существующих записей не менялась; условная яркость deep-sky пересчитана по прежнему алгоритму при пополнении состава звёзд.

## Локальный просмотр

[http://127.0.0.1:49752/](http://127.0.0.1:49752/). Сервер отдаёт актуальные собранные файлы. Внешние AI, почта и продакшен не вызывались.

Возможный следующий объём, только после отдельного согласования: изменить мобильную компоновку бренда/форм, чтобы освободить место и увеличить восемь перечисленных схем. Это затронет размещение, а не координаты и связи.

Commit message: `Fixed constellation figures and viewport-aware sky placement.`

## Дополнение: исходные изображения и экранный масштаб

🟩 Сохранены 88 уже загруженных оригинальных карт и манифест с URL/SHA-256: `private/reference/go-astronomy/2026-10-24/`. Все копии проверены по контрольным суммам. Архив исключён из Git и публикации; для переноса проекта копируется отдельно.

🟩 Убраны фиксированные 100 px минимального размера и 24 px целевого интервала. Теперь базовый размер задаётся долями текущего окна с поправкой на геометрию созвездия; при двукратном изменении обеих сторон окна он меняется ровно вдвое. Интерфейс и подписи по-прежнему ограничивают окончательное безопасное размещение, поэтому окончательный размер не обязан увеличиваться ровно вдвое при неизменном размере текста/форм.

🟩 Проверены контрольные суммы 88 копий, пропорциональность базового размера всех 88 схем в портретных/альбомных окнах и 880 браузерных размещений, включая изменение размера окна. Обрезки и пересечений не обнаружено. Старые числовые примеры размера выше относятся к предыдущей формуле, не являются настройками.

Commit message: `Archived reference charts and made sky scaling viewport-relative.`

## Дополнение: видимость верхней звезды Cancer

🟩 Исправлено подавление маркеров близкой пары ι Cancer: обе точки присутствовали в данных, но ограничение по расстоянию уменьшало обе до долей пикселя. При расчёте ограничения свечения точки ближе 1 угловой минуты больше не уменьшают друг другу маркеры. Это правило отображения близких пар, не утверждение о физической связанности. Координаты, фотометрия, выбор компонент и связи не менялись. Близкие маркеры могут естественно сливаться в один видимый источник, но больше не исчезают.

🟩 Проверены размер маркера на трёх масштабах и реальные пиксели ι Cancer (HIP43103) на экранах 1440×1000 и 390×844. Пиксельная проверка пройдена при отключённых в тесте случайных фоновых звёздах; скриншотов нет. Геометрические тесты и локальная сборка пройдены, публикации не было.

Commit message: `Restored visibility of close-pair star markers in Cancer.`

## Картинки в обычной папке проекта

🟩 Все 88 исходных JPG и манифест скопированы в `references/constellations/go-astronomy/`. Проверены формат JPEG, количество и SHA-256 всех копий. Приватные оригиналы сохранены. Сайт и сборка не менялись; публикации и commit/push не было.

Commit message: `Added all 88 original constellation images to the project references.`

## Публикация

🟩 По разрешению пользователя опубликовано через корневой `wrangler.toml` на `https://lumiscia.org/`. Основа: коммит `9f9d3f3`; deployment version `4b0df069-f156-4589-ac84-3d95023bf71e`. Production-assets пересобраны; геометрические тесты и diff-check прошли. Загружены новые index.html, catalog-loader.js и preview.js. Справочные изображения не включены в сайт; ручных изменений баз и секретов, commit/push и скриншотов не было.

🟩 Публичные index.html, catalog-loader.js и preview.js ответили HTTP 200; их SHA-256 совпали с локальной production-сборкой. Проверка выполнена без входа в аккаунт и без скриншотов.

Commit message: `Published corrected constellation figures and viewport-relative sky scaling.`
