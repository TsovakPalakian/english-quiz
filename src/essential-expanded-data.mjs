export function expandAdditionalEssential(groups){
  const add=(groupId,title,pos,rows)=>{
    const group=groups.find(group=>group.id===groupId);
    let topic=group.topics.find(topic=>topic.title===title);
    if(!topic){topic={id:'topic-'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),title,entries:[]};group.topics.push(topic);}
    for(const line of rows.trim().split('\n')){
      if(!line.trim())continue;
      const [en,ru,example,exampleRu,rowPos]=line.split('~');
      if(!en||!ru||!example||!exampleRu)throw new Error('Incomplete Essential entry: '+line);
      if(!topic.entries.some(entry=>entry.en.toLowerCase()===en.toLowerCase()))topic.entries.push({en,ru,example,exampleRu,pos:rowPos||pos});
    }
  };

  add('speech','Indefinite pronouns','pronoun',`
somebody~кто-то; кто-нибудь~Somebody left a message.~Кто-то оставил сообщение.~pronoun
anybody~кто-нибудь; любой~Did anybody call me?~Мне кто-нибудь звонил?~pronoun
everybody~все; каждый~Everybody is listening.~Все слушают.~pronoun
nobody~никто~Nobody knows the answer.~Никто не знает ответа.~pronoun
another~другой; ещё один~Have another cup of tea.~Выпей ещё одну чашку чая.~determiner
other~другой~I have other plans.~У меня другие планы.~determiner
each other~друг друга~They respect each other.~Они уважают друг друга.~pronoun
one another~один другого; друг друга~We should help one another.~Нам следует помогать друг другу.~pronoun
whichever~какой бы ни; любой~Choose whichever you like.~Выбирай любой, какой тебе нравится.~determiner
whatever~что бы ни; всё что~Do whatever is necessary.~Делай всё, что необходимо.~pronoun`);
  add('speech','Question words','pronoun',`
whom~кого; кому~Whom did you invite?~Кого ты пригласил?~pronoun
whoever~кто бы ни; всякий кто~Whoever arrives first wins.~Кто бы ни пришёл первым, побеждает.~pronoun
wherever~где бы ни; куда бы ни~Sit wherever you prefer.~Садись куда угодно, где тебе удобнее.~adverb
whenever~когда бы ни; в любое время~Call me whenever you want.~Звони мне в любое время, когда захочешь.~conjunction
how far~как далеко~How far is the station?~Как далеко станция?~adverb
how fast~как быстро~How fast can you run?~Как быстро ты умеешь бегать?~adverb
how come~как так; почему~How come you are late?~Как так вышло, что ты опоздал?~adverb
how old~сколько лет~How old is your sister?~Сколько лет твоей сестре?~adverb
what time~в какое время; во сколько~What time does the train leave?~Во сколько отправляется поезд?~phrase
what kind~какой; какого рода~What kind of music do you like?~Какую музыку ты любишь?~phrase`);
  add('speech','Prepositions of place and direction','preposition',`
among~среди~He stood among the trees.~Он стоял среди деревьев.~preposition
around~вокруг; около~We walked around the lake.~Мы гуляли вокруг озера.~preposition
against~против; у; к~Lean the bicycle against the wall.~Прислони велосипед к стене.~preposition
beneath~под; ниже~The valley lay beneath the clouds.~Долина лежала под облаками.~preposition
underneath~под; внизу~Check underneath the sofa.~Посмотри под диваном.~preposition
inside~внутри~Wait inside the hall.~Жди внутри зала.~preposition
outside~снаружи; за пределами~Leave your shoes outside.~Оставь обувь снаружи.~preposition
beyond~за; по ту сторону~The forest extends beyond the river.~Лес простирается за рекой.~preposition
near~около; возле~We live near the park.~Мы живём возле парка.~preposition
past~мимо~Walk past the library.~Пройди мимо библиотеки.~preposition`);
  add('speech','Prepositions of time','preposition',`
towards~к; ближе к~It got colder towards evening.~К вечеру похолодало.~preposition
till~до~Stay till five o'clock.~Оставайся до пяти часов.~preposition
upon~по; в момент~Upon arrival, register at the desk.~По прибытии зарегистрируйтесь на стойке.~preposition
following~после; вслед за~Following the lecture, we asked questions.~После лекции мы задали вопросы.~preposition
prior to~до; перед~Check your passport prior to departure.~Проверь паспорт перед вылетом.~preposition
ahead of~раньше; впереди~We arrived ahead of time.~Мы приехали раньше времени.~preposition
up to~вплоть до~He worked up to midnight.~Он работал вплоть до полуночи.~preposition
around~около; приблизительно в~Let us meet around noon.~Давай встретимся около полудня.~preposition
over~в течение; за~We talked over the weekend.~Мы общались в течение выходных.~preposition
as of~начиная с; по состоянию на~As of tomorrow, new rules apply.~Начиная с завтрашнего дня, действуют новые правила.~preposition`);
  add('speech','Conjunctions and connectors','conjunction',`
so~так что; поэтому~It was raining, so we stayed home.~Шёл дождь, поэтому мы остались дома.~conjunction
yet~однако; тем не менее~He is strict, yet fair.~Он строгий, однако справедливый.~conjunction
whereas~тогда как; в то время как~She likes coffee, whereas I prefer tea.~Она любит кофе, тогда как я предпочитаю чай.~conjunction
furthermore~более того; кроме того~Furthermore, the price is reasonable.~Более того, цена вполне разумная.~adverb
besides~кроме того~Besides, we do not have enough time.~Кроме того, у нас нет достаточного времени.~adverb
nevertheless~тем не менее; всё же~It was cold, nevertheless we went outside.~Было холодно, тем не менее мы вышли на улицу.~adverb
even though~даже хотя; несмотря на то что~Even though he was tired, he helped us.~Даже хотя он устал, он помог нам.~conjunction
as well as~а также; так же как и~She speaks French as well as German.~Она говорит по-французски, а также по-немецки.~conjunction
despite~несмотря на~Despite the rain, the match continued.~Несмотря на дождь, матч продолжился.~preposition
provided that~при условии что~You may borrow it, provided that you return it tomorrow.~Ты можешь одолжить это при условии, что вернёшь завтра.~conjunction`);
  add('speech','Quantity words','noun',`
plenty~множество; изобилие~We have plenty of time.~У нас много времени.~noun
most~большинство; большая часть~Most students passed the test.~Большинство студентов сдали тест.~determiner
all~все; весь~All tickets are sold.~Все билеты проданы.~determiner
none~ни один; нисколько~None of the chairs were free.~Ни один из стульев не был свободен.~pronoun
a lot of~много~She reads a lot of books.~Она читает много книг.~phrase
lots of~куча; много~There are lots of apples.~Здесь много яблок.~phrase
majority~большинство~The majority agreed with the plan.~Большинство согласилось с планом.~noun
minority~меньшинство~A small minority opposed the decision.~Небольшое меньшинство выступило против решения.~noun
half~половина~Half of the work is complete.~Половина работы завершена.~noun
extra~дополнительный; лишний~Do you need extra sugar?~Тебе нужен дополнительный сахар?~adjective`);
  add('speech','Frequency','adverb',`
regularly~регулярно~Exercise regularly to stay healthy.~Занимайся регулярно, чтобы оставаться здоровым.~adverb
constantly~постоянно~Technology is constantly evolving.~Технологии постоянно развиваются.~adverb
frequently~часто~Trains run frequently on this line.~Поезда ходят часто по этой линии.~adverb
normally~обычно; как правило~I normally wake up at seven.~Я обычно просыпаюсь в семь.~adverb
periodically~периодически~Check your email periodically.~Периодически проверяй свою электронную почту.~adverb
repeatedly~неоднократно; снова и снова~She warned him repeatedly.~Она неоднократно предупреждала его.~adverb
continuously~непрерывно~The stream flows continuously.~Ручей течёт непрерывно.~adverb
monthly~ежемесячно~We pay the bill monthly.~Мы оплачиваем счёт ежемесячно.~adverb
hourly~ежечасно~Buses depart hourly.~Автобусы отправляются каждый час.~adverb
scarcely~едва ли; почти никогда~He scarcely leaves his office.~Он едва ли выходит из своего кабинета.~adverb`);
  add('speech','Degree and intensity','adverb',`
deeply~глубоко; сильно~I deeply appreciate your advice.~Я глубоко ценю твой совет.~adverb
greatly~значительно; весьма~The situation has greatly improved.~Ситуация значительно улучшилась.~adverb
totally~полностью; совершенно~I totally agree with you.~Я полностью согласен с тобой.~adverb
entirely~целиком; полностью~The choice is entirely yours.~Выбор целиком твой.~adverb
highly~высоко; очень~This book is highly recommended.~Эта книга очень рекомендуется.~adverb
thoroughly~тщательно; основательно~Read the contract thoroughly.~Внимательно и основательно прочитай договор.~adverb
barely~едва; с трудом~We barely caught the train.~Мы едва успели на поезд.~adverb
intensely~интенсивно; сильно~The sun was shining intensely.~Солнце светило очень сильно.~adverb
remarkably~удивительно; примечательно~She is remarkably calm.~Она удивительно спокойна.~adverb
perfectly~идеально; совершенно~Everything is perfectly clear.~Всё совершенно понятно.~adverb`);
  add('speech','Essential verbs','verb',`
see~видеть; смотреть~I can see the mountains.~Я вижу горы.~verb
hear~слышать~Can you hear that noise?~Ты слышишь этот шум?~verb
say~сказать; говорить~What did he say?~Что он сказал?~verb
tell~рассказывать; сообщать~Tell me the truth.~Расскажи мне правду.~verb
look~смотреть; выглядеть~Look at that beautiful bird.~Посмотри на ту красивую птицу.~verb
listen~слушать~Listen carefully to the instructions.~Внимательно слушай инструкции.~verb
speak~разговаривать; владеть языком~She can speak three languages.~Она может говорить на трёх языках.~verb
talk~беседовать; говорить~We need to talk about the project.~Нам нужно поговорить о проекте.~verb
show~показывать~Show me your ticket, please.~Покажи мне свой билет, пожалуйста.~verb
call~звонить; звать~I will call you tomorrow morning.~Я позвоню тебе завтра утром.~verb`);
  add('speech','Common contractions','contraction',`
isn't~не является; не (is not)~He isn't at work today.~Он не на работе сегодня.~contraction
aren't~не являются; не (are not)~They aren't coming with us.~Они не идут с нами.~contraction
wasn't~не был; не была (was not)~The movie wasn't boring.~Фильм не был скучным.~contraction
weren't~не были (were not)~We weren't late for the meeting.~Мы не опоздали на встречу.~contraction
haven't~не имеют; не (have not)~I haven't seen that movie.~Я не видел этот фильм.~contraction
hasn't~не имеет; не (has not)~She hasn't called yet.~Она ещё не звонила.~contraction
hadn't~не имел; не (had not)~They hadn't arrived before noon.~Они не приехали до полудня.~contraction
wouldn't~не стал бы (would not)~I wouldn't do that.~Я бы так не делал.~contraction
shouldn't~не следует; не должен (should not)~You shouldn't worry so much.~Тебе не следует так сильно беспокоиться.~contraction
couldn't~не мог; не смог (could not)~He couldn't solve the puzzle.~Он не смог решить головоломку.~contraction`);
  add('speech','Sequence and comparison','adverb',`
secondly~во-вторых~Secondly, check the date.~Во-вторых, проверь дату.~adverb
thirdly~в-третьих~Thirdly, prepare the documents.~В-третьих, подготовь документы.~adverb
meanwhile~тем временем; пока~Meanwhile, dinner was getting ready.~Тем временем ужин готовился.~adverb
afterwards~после; впоследствии~We had lunch, and afterwards we went for a walk.~Мы пообедали, а после пошли на прогулку.~adverb
beforehand~заранее; предварительно~Book your tickets beforehand.~Забронируй билеты заранее.~adverb
likewise~аналогично; также~He smiled, and she did likewise.~Он улыбнулся, и она сделала то же самое.~adverb
subsequently~впоследствии; позже~He subsequently moved to another city.~Впоследствии он переехал в другой город.~adverb
simultaneously~одновременно~Two events happened simultaneously.~Два события произошли одновременно.~adverb
alternatively~в качестве альтернативы; либо~Alternatively, you can send an email.~Либо вы можете отправить электронное письмо.~adverb
eventually~в конечном счете; со временем~Eventually, the truth came out.~В конечном счёте правда открылась.~adverb`);
  add('basics','Time and time units','noun',`
millisecond~миллисекунда~A millisecond is one thousandth of a second.~Миллисекунда — это одна тысячная секунды.~noun
moment~момент; мгновение~Wait a moment, please.~Подожди мгновение, пожалуйста.~noun
period~период; отрезок времени~He studied here for a short period.~Он учился здесь короткий период времени.~noun
era~эра; эпоха~A new era of exploration has begun.~Началась новая эра исследований.~noun
epoch~эпоха~The Renaissance was a remarkable epoch.~Ренессанс был замечательной эпохой.~noun
millennium~тысячелетие~The castle has stood for nearly a millennium.~Замок простоял почти тысячелетие.~noun
lifetime~продолжительность жизни; вся жизнь~It was the journey of a lifetime.~Это было путешествие всей жизни.~noun
generation~поколение~Values change from generation to generation.~Ценности меняются от поколения к поколению.~noun
interval~интервал; перерыв~There is a ten-minute interval between acts.~Между действиями есть десятиминутный интервал.~noun
quarter~четверть часа~It is a quarter past three.~Сейчас четверть четвёртого.~noun`);
  add('basics','Dates and years','noun',`
anniversary~годовщина; юбилей~They celebrated their wedding anniversary.~Они отпраздновали годовщину свадьбы.~noun
schedule~расписание; график~The train is running on schedule.~Поезд идёт по расписанию.~noun
holiday~праздник; отпуск~Tomorrow is a national holiday.~Завтра государственный праздник.~noun
workday~рабочий день~My workday starts at eight.~Мой рабочий день начинается в восемь.~noun
timetable~расписание уроков или рейсов~Look at the bus timetable.~Посмотри на расписание автобусов.~noun
deadline~крайний срок~The project deadline is Friday.~Крайний срок проекта — пятница.~noun
eve~канун~We met on New Year's Eve.~Мы встретились в канун Нового года.~noun
day off~выходной день~Sunday is my regular day off.~Воскресенье — мой постоянный выходной день.~noun
appointment~назначенная встреча; приём~I have a doctor's appointment tomorrow.~У меня завтра приём у врача.~noun
agenda~повестка дня; план~What is on the agenda for today?~Что сегодня на повестке дня?~noun`);
  add('basics','Fractions and percentages','numeral',`
fifth~пятая часть; одна пятая~One fifth of the class attended.~Одна пятая класса присутствовала.~numeral
sixth~шестая часть; одна шестая~He ate a sixth of the pie.~Он съел шестую часть пирога.~numeral
eighth~восьмая часть; одна восьмая~Cut the melon into eighths.~Разрежь дыню на восьмые части.~numeral
tenth~десятая часть; одна десятая~A tenth of the salary goes to savings.~Десятая часть зарплаты идёт в сбережения.~numeral
proportion~пропорция; доля~A high proportion of students pass.~Высокая доля студентов сдаёт экзамен.~noun
share~доля; часть~Everyone paid their share.~Каждый заплатил свою долю.~noun
whole~целое; весь объем~The whole is greater than the sum of its parts.~Целое больше, чем сумма его частей.~noun
rate~ставка; показатель; коэффициент~The interest rate remains low.~Процентная ставка остаётся низкой.~noun
segment~сегмент; отрезок~Divide the line into three segments.~Разделите линию на три сегмента.~noun
portion~порция; доля~She divided the soup into equal portions.~Она разделила суп на равные порции.~noun`);
  add('basics','Units of measurement','noun',`
pound~фунт (единица веса)~The bag weighs two pounds.~Сумка весит два фунта.~noun
ounce~унция~Add one ounce of butter.~Добавь одну унцию масла.~noun
ton~тонна~The truck can carry five tons.~Грузовик может перевозить пять тонн.~noun
gallon~галлон~Buy a gallon of milk.~Купи галлон молока.~noun
pint~пинта~He ordered a pint of juice.~Он заказал пинту сока.~noun
yard~ярд~The field is one hundred yards long.~Поле длиной в сто ярдов.~noun
acre~акр~They bought ten acres of farmland.~Они купили десять акров сельскохозяйственной земли.~noun
hectare~гектар~The park covers twenty hectares.~Парк занимает двадцать гектаров.~noun
celsius~градус Цельсия~The temperature is twenty degrees Celsius.~Температура двадцать градусов по Цельсию.~noun
fahrenheit~градус Фаренгейта~Water freezes at thirty-two degrees Fahrenheit.~Вода замерзает при тридцати двух градусах по Фаренгейту.~noun`);
  add('basics','Colours and shades','adjective',`
orange~оранжевый~The carrot is bright orange.~Морковь ярко-оранжевая.~adjective
violet~фиолетовый~The night sky had a violet tint.~Ночное небо имело фиолетовый оттенок.~adjective
gold~золотой~She wore a gold necklace.~На ней было золотое ожерелье.~adjective
silver~серебряный~The coin is made of silver.~Монета сделана из серебра.~adjective
bronze~бронзовый~He won a bronze medal.~Он выиграл бронзовую медаль.~adjective
indigo~индиго; тёмно-синий~Indigo is between blue and violet.~Индиго находится между синим и фиолетовым.~adjective
teal~бирюзово-зелёный; цвет чирка~The curtains are dark teal.~Шторы тёмно-бирюзовые.~adjective
amber~янтарный~The traffic light turned amber.~Светофор загорелся янтарным светом.~adjective
olive~оливковый~She chose an olive jacket.~Она выбрала оливковую куртку.~adjective
coral~коралловый~The dress is a lovely coral colour.~Платье прекрасного кораллового цвета.~adjective`);
  add('basics','Shapes','noun',`
diamond~ромб; бриллиант~The road sign is shaped like a diamond.~Дорожный знак имеет форму ромба.~noun
hexagon~шестиугольник~A honeycomb cell is a hexagon.~Ячейка пчелиных сот — это шестиугольник.~noun
pentagon~пятиугольник~Draw a regular pentagon on paper.~Нарисуй правильный пятиугольник на бумаге.~noun
star~звезда; пятиконечник~Hang a golden star on the tree.~Повесь золотую звезду на дерево.~noun
pyramid~пирамида~The glass building looks like a pyramid.~Стеклянное здание похоже на пирамиду.~noun
prism~призма~A glass prism separates sunlight into colours.~Стеклянная призма разделяет солнечный свет на цвета.~noun
ring~кольцо; окружность~Sit in a ring around the campfire.~Сядьте в кольцо вокруг костра.~noun
crescent~полумесяц~A crescent moon appeared in the sky.~В небе появился полумесяц.~noun
heart~сердце; форма сердца~Draw a small heart in the corner.~Нарисуй маленькое сердечко в углу.~noun
cross~крест~The flag features a red cross.~На флаге изображён красный крест.~noun`);
  add('basics','Countries and nationalities','noun',`
Italy~Италия~Rome is the capital of Italy.~Рим — столица Италии.~noun
Italian~итальянец; итальянский~He loves Italian food.~Он любит итальянскую кухню.~adjective
Spain~Испания~We travelled across Spain in summer.~Мы путешествовали по Испании летом.~noun
Spanish~испанец; испанский~Spanish architecture is famous worldwide.~Испанская архитектура известна по всему миру.~adjective
China~Китай~China has a very long history.~У Китая очень долгая история.~noun
Chinese~китаец; китайский~Chinese calligraphy requires great skill.~Китайская каллиграфия требует большого мастерства.~adjective
Canada~Канада~Canada is known for its vast lakes.~Канада известна своими огромными озёрами.~noun
Canadian~канадец; канадский~Maple syrup is a Canadian specialty.~Кленовый сироп — канадское фирменное блюдо.~adjective
Australia~Австралия~Kangaroos are native to Australia.~Кенгуру родом из Австралии.~noun
Australian~австралиец; австралийский~The Australian coast is popular for surfing.~Австралийское побережье популярно для сёрфинга.~adjective`);
  add('basics','Languages','noun',`
Hindi~хинди~Hindi is spoken by millions of people.~На хинди говорят миллионы людей.~noun
Turkish~турецкий язык~Turkish has many loanwords in other languages.~В турецком языке много заимствованных слов в других языках.~noun
Polish~польский язык~Polish pronunciation can be challenging.~Польское произношение может быть непростым.~noun
Dutch~нидерландский язык; голландский~Dutch is closely related to German.~Нидерландский язык близко родственен немецкому.~noun
Swedish~шведский язык~Swedish is spoken in Sweden and parts of Finland.~На шведском языке говорят в Швеции и некоторых частях Финляндии.~noun
Greek~греческий язык~Many scientific terms come from Greek.~Многие научные термины происходят из греческого языка.~noun
Georgian~грузинский язык~Georgian has a unique alphabet.~У грузинского языка уникальный алфавит.~noun
Persian~персидский язык; фарси~Persian literature has rich poetic traditions.~Персидская литература имеет богатые поэтические традиции.~noun
Finnish~финский язык~Finnish belongs to the Finno-Ugric language family.~Финский язык принадлежит к финно-угорской языковой семье.~noun
Hebrew~иврит~Hebrew was revived as a spoken language in modern times.~Иврит был возрождён как разговорный язык в Новейшее время.~noun`);
  add('basics','Basic adjectives and opposites','adjective',`
fast~быстрый; скорый~Cheetahs are very fast runners.~Гепарды — очень быстрые бегуны.~adjective
slow~медленный~The turtle was slow but steady.~Черепаха была медленной, но уверенной.~adjective
strong~сильный; крепкий~He has a strong heart and character.~У него сильное сердце и крепкий характер.~adjective
weak~слабый~The tea is too weak.~Чай слишком слабый.~adjective
heavy~тяжёлый~This iron box is very heavy.~Этот железный ящик очень тяжёлый.~adjective
light~лёгкий (по весу)~Feathers are extremely light.~Перья необычайно лёгкие.~adjective
high~высокий (о предметах)~The mountain is very high.~Гора очень высокая.~adjective
low~низкий~The water level was low.~Уровень воды был низким.~adjective
rich~богатый~The soil is rich in minerals.~Почва богата минералами.~adjective
poor~бедный; скудный~A poor harvest affected the village.~Бедный урожай отразился на деревне.~adjective`);
  add('topics','Introductions and personal information','interjection',`
good morning~доброе утро~Good morning, how are you today?~Доброе утро, как ваши дела сегодня?~interjection
good afternoon~добрый день~Good afternoon, ladies and gentlemen.~Добрый день, дамы и господа.~interjection
good evening~добрый вечер~Good evening and welcome.~Добрый вечер и добро пожаловать.~interjection
goodbye~до свидания; прощай~Goodbye, see you tomorrow.~До свидания, увидимся завтра.~interjection
welcome~добро пожаловать~Welcome to our school.~Добро пожаловать в нашу школу.~interjection
pleased~рад; доволен~Pleased to meet you.~Рад познакомиться с вами.~adjective
nationality~национальность; гражданство~What is your nationality?~Какое у вас гражданство?~noun
birthplace~место рождения~My birthplace is a quiet mountain village.~Моё место рождения — тихая горная деревня.~noun
occupation~род занятий; профессия~State your occupation on the form.~Укажите ваш род занятий в анкете.~noun
signature~подпись~Put your signature at the bottom.~Поставьте вашу подпись внизу.~noun
gender~пол~Select your gender from the list.~Выберите ваш пол из списка.~noun
marital status~семейное положение~Please confirm your marital status.~Пожалуйста, подтвердите ваше семейное положение.~noun
hometown~родной город~Yerevan is my hometown.~Ереван — мой родной город.~noun
nickname~прозвище; никнейм~His friends call him by a nickname.~Друзья зовут его по прозвищу.~noun
title~обращение; звание~Choose your preferred title: Mr or Ms.~Выберите предпочтительное обращение: мистер или мисс.~noun
passport~паспорт~Have your passport ready.~Держите паспорт наготове.~noun
identity~личность; удостоверение~Confirm your identity with a photo ID.~Подтвердите вашу личность документом с фотографией.~noun
citizen~гражданин~He is a citizen of this country.~Он гражданин этой страны.~noun
native language~родной язык~My native language is Armenian.~Мой родной язык — армянский.~noun
background~происхождение; биография~Tell us about your educational background.~Расскажите нам о вашем образовании и опыте.~noun`);
  add('topics','Family and relatives','noun',`
stepmother~мачеха~Her stepmother was very caring.~Её мачеха была очень заботливой.~noun
stepfather~отчим~His stepfather taught him to drive.~Отчим научил его водить машину.~noun
nephew~племянник~My nephew is three years old.~Моему племяннику три года.~noun
niece~племянница~She bought a book for her niece.~Она купила книгу для своей племянницы.~noun
granddaughter~внучка~The grandfather hugged his granddaughter.~Дедушка обнял свою внучку.~noun
grandson~внук~Their grandson studies at university.~Их внук учится в университете.~noun
sibling~родной брат или сестра~Do you have any siblings?~У тебя есть братья или сёстры?~noun
twin~близнец~They are twin sisters.~Они сёстры-близнецы.~noun
ancestor~предок~Our ancestors built this stone wall.~Наши предки построили эту каменную стену.~noun
descendant~потомок~He is a descendant of the royal family.~Он потомок королевской семьи.~noun
relative~родственник~Many relatives came to the wedding.~Многие родственники пришли на свадьбу.~noun
mother-in-law~тёща; свекровь~Her mother-in-law makes great pies.~Её свекровь печёт замечательные пироги.~noun
father-in-law~тесть; свёкор~My father-in-law loves gardening.~Мой тесть любит садоводство.~noun
godmother~крёстная мать~She received a letter from her godmother.~Она получила письмо от своей крёстной матери.~noun
godfather~крёстный отец~His godfather gave him a watch.~Крёстный отец подарил ему часы.~noun`);
  add('topics','Friends and relationships','noun',`
companion~спутник; компаньон~A loyal dog is a faithful companion.~Верная собака — преданный спутник.~noun
acquaintance~знакомый~He is not a close friend, just an acquaintance.~Он не близкий друг, просто знакомый.~noun
mate~приятель; товарищ~I went to the cinema with a mate.~Я пошёл в кино с приятелем.~noun
ally~союзник~Trustworthy allies are valuable in life.~Надёжные союзники ценны в жизни.~noun
roommate~сосед по комнате~My roommate is quiet and neat.~Мой сосед по комнате тихий и аккуратный.~noun
classmate~одноклассник~I met an old classmate downtown.~Я встретил старого одноклассника в центре города.~noun
bond~связь; узы~They share a deep bond of friendship.~Их объединяют глубокие узы дружбы.~noun
loyalty~преданность; верность~Loyalty is the cornerstone of true friendship.~Верность — краеугольный камень настоящей дружбы.~noun
sympathy~сочувствие; симпатия~She expressed sincere sympathy.~Она выразила искреннее сочувствие.~noun
quarrel~ссора; ссориться~They had a small quarrel yesterday.~Вчера они немного поссорились.~noun
forgive~прощать~It is important to forgive mistakes.~Важно прощать ошибки.~verb
reconcile~мириться; примирять~The two friends reconciled after a talk.~Двое друзей помирились после разговора.~verb
confide~доверять тайну; делиться~She confided her secrets to her best friend.~Она доверила свои секреты лучшей подруге.~verb
admire~восхищаться~I admire his honesty and courage.~Я восхищаюсь его честностью и мужеством.~verb
appreciate~ценить~I appreciate your constant support.~Я ценю твою постоянную поддержку.~verb`);
  add('topics','Appearance','adjective',`
slender~стройный; изящный~She has a slender and athletic build.~У неё стройное и спортивное телосложение.~adjective
plump~пухлый; полный~The baby has plump red cheeks.~У малыша пухлые красные щёчки.~adjective
muscular~мускулистый~Athletes have muscular bodies.~У спортсменов мускулистые тела.~adjective
pale~бледный~His face looked pale after the journey.~Его лицо выглядело бледным после дороги.~adjective
tanned~загорелый~They returned from the beach nicely tanned.~Они вернулись с пляжа красиво загорелыми.~adjective
wrinkle~морщина~He has smile wrinkles around his eyes.~У него морщинки от улыбок вокруг глаз.~noun
dimple~ямочка (на щеке или подбородке)~She has a cute dimple on her left cheek.~У неё милая ямочка на левой щеке.~noun
scar~шрам~He has a small scar on his forehead.~У него маленький шрам на лбу.~noun
mole~родинка~There is a tiny mole on her neck.~У неё крошечная родинка на шее.~noun
bald~лысый~My grandfather is completely bald.~Мой дедушка совершенно лысый.~adjective
wavy~волнистый~She has long wavy brown hair.~У неё длинные волнистые каштановые волосы.~adjective
ponytail~конский хвост (прическа)~She tied her hair in a ponytail.~Она завязала волосы в хвост.~noun
mustache~усы~He decided to grow a mustache.~Он решил отрастить усы.~noun
attractive~привлекательный~The smile makes him very attractive.~Улыбка делает его очень привлекательным.~adjective
neat~опрятный; аккуратный~He always looks neat and tidy.~Он всегда выглядит опрятно и аккуратно.~adjective
shabby~потрёпанный~He wore a shabby old coat.~На нём было потрёпанное старое пальто.~adjective
elegant~элегантный~She looked elegant in that navy suit.~Она выглядела элегантно в том тёмно-синем костюме.~adjective
chubby~круглолицый; пухленький~The child had chubby hands.~У ребёнка были пухленькие ручки.~adjective
graceful~изящный; грациозный~The dancer made graceful movements.~Танцор делал грациозные движения.~adjective
posture~осанка~Good posture keeps your back healthy.~Хорошая осанка сохраняет спину здоровой.~noun`);
  add('topics','Personality','adjective',`
polite~вежливый~The boy gave a polite answer.~Мальчик дал вежливый ответ.~adjective
rude~грубый~It is rude to interrupt others.~Грубо перебивать других.~adjective
curious~любознательный; любопытный~Children are naturally curious about the world.~Дети от природы любознательны к миру.~adjective
brave~храбрый; смелый~The brave firefighter entered the building.~Храбрый пожарный вошёл в здание.~adjective
cowardly~трусливый~Running away was a cowardly act.~Бегство было трусливым поступком.~adjective
ambitious~амбициозный; целеустремленный~An ambitious student studies hard.~Целеустремлённый студент усердно учится.~adjective
lazy~ленивый~Do not be lazy on Sunday morning.~Не ленись воскресным утром.~adjective
diligent~прилежный; старательный~She is a diligent worker.~Она старательный работник.~adjective
modest~скромный~Despite his success, he remains modest.~Несмотря на успех, он остаётся скромным.~adjective
cheerful~жизнерадостный; весёлый~A cheerful greeting brightened my day.~Жизнерадостное приветствие скрасило мой день.~adjective
sensitive~чуткий; чувствительный~He is sensitive to other people's feelings.~Он чуток к чувствам других людей.~adjective
calm~спокойный~Stay calm during emergencies.~Сохраняйте спокойствие в чрезвычайных ситуациях.~adjective
charitable~благотворительный; отзывчивый~She is known for her charitable spirit.~Она известна своей отзывчивостью и щедростью.~adjective
selfish~эгоистичный~Sharing food is not selfish.~Делиться едой — это не эгоистично.~adjective
cunning~хитрый~The fox used a cunning trick.~Лиса применила хитрую уловку.~adjective
creative~творческий; созидательный~He found a creative solution to the problem.~Он нашёл творческое решение проблемы.~adjective
dependable~надёжный; верный слову~A dependable partner keeps promises.~Надёжный партнёр держит обещания.~adjective`);
  add('topics','Feelings and emotions','adjective',`
delighted~восхищенный; очень радостный~We were delighted with the concert.~Мы были в восторге от концерта.~adjective
furious~яростный; разъяренный~He was furious about the broken window.~Он был в ярости из-за разбитого окна.~adjective
anxious~тревожный; беспокойный~She felt anxious before the exam.~Она чувствовала тревогу перед экзаменом.~adjective
proud~гордый~Parents are proud of their children.~Родители гордятся своими детьми.~adjective
ashamed~стыдящийся; пристыженный~He felt ashamed of his lie.~Ему было стыдно за свою ложь.~adjective
jealous~ревнивый; завистливый~Do not be jealous of other people's success.~Не завидуй чужому успеху.~adjective
bored~скучающий~The lecture was dull, and students felt bored.~Лекция была скучной, и студенты заскучали.~adjective
curious~любопытствующий; заинтересованный~The dog was curious about the cardboard box.~Собаке была любопытна картонная коробка.~adjective
confused~запутавшийся; смущенный~I was confused by the complicated map.~Я запутался из-за сложной карты.~adjective
lonely~одинокий~He felt lonely living alone in the big city.~Он чувствовал себя одиноко, живя один в большом городе.~adjective
surprised~удивленный~We were surprised by the unexpected visit.~Мы были удивлены неожиданным визитом.~adjective
scared~испуганный~The sudden thunder made the cat scared.~Внезапный гром испугал кошку.~adjective
peaceful~умиротворенный; безмятежный~Listening to rain makes me peaceful.~Шум дождя делает меня умиротворённым.~adjective
hopeful~надеющийся; полный надежд~Doctors are hopeful about the recovery.~Врачи полны надежд на выздоровление.~adjective
enthusiastic~воодушевленный; увлеченный~She was enthusiastic about the new project.~Она была полна энтузиазма по поводу нового проекта.~adjective
guilty~виноватый; виновный~He had a guilty look on his face.~У него было виноватое выражение лица.~adjective`);
  add('topics','The human body','noun',`
elbow~локоть~He rested his elbow on the table.~Он оперся локтем о стол.~noun
wrist~запястье~She wore a silver bracelet on her wrist.~Она носила серебряный браслет на запястье.~noun
chest~грудь; грудная клетка~Take a deep breath and expand your chest.~Сделай глубокий вдох и расправь грудь.~noun
stomach~желудок; живот~His stomach rumbled because of hunger.~Его желудок урчал от голода.~noun
throat~горло~A warm tea relieves a sore throat.~Тёплый чай успокаивает больное горло.~noun
chin~подбородок~He touched his chin while thinking.~Он коснулся подбородка во время размышлений.~noun
forehead~лоб~Wipe the sweat from your forehead.~Вытри пот со лба.~noun
eyebrow~бровь~She raised an eyebrow in surprise.~Она подняла бровь от удивления.~noun
eyelash~ресница~An eyelash fell on her cheek.~Ресница упала ей на щёку.~noun
heel~пятка~The new shoe rubbed his heel.~Новый туфель натёр ему пятку.~noun
toe~палец ноги~He dipped his big toe into the pool.~Он опустил большой палец ноги в бассейн.~noun
spine~позвоночник~Swimming strengthens your spine.~Плавание укрепляет позвоночник.~noun
rib~ребро~The athlete bruised a rib during training.~Спортсмен ушиб ребро во время тренировки.~noun
jaw~челюсть~A clenched jaw indicates stress.~Сжатая челюсть указывает на стресс.~noun
waist~талия~Measure around your natural waist.~Измерьте обхват вокруг вашей естественной талии.~noun
hip~бедро; тазобедренный сустав~She placed her hands on her hips.~Она положила руки на бёдра.~noun`);
  add('topics','Health and wellbeing','adjective',`
dizzy~головокружительный; чувствующий головокружение~I felt dizzy after standing up too fast.~У меня закружилась голова после слишком быстрого подъёма.~adjective
nausea~тошнота~Fresh air helped ease the nausea.~Свежий воздух помог снять тошноту.~noun
sneezing~чихание~Frequent sneezing is a reaction to dust.~Частое чихание — это реакция на пыль.~noun
bandage~бинт; повязка~The nurse wrapped a bandage around the cut.~Медсестра наложила бинт на порез.~noun
bruise~синяк; ушиб~Cold ice reduces a bruise quickly.~Холодный лёд быстро уменьшает синяк.~noun
headache~головная боль~A brief walk relieved my headache.~Короткая прогулка сняла мою головную боль.~noun
fitness~хорошая физическая форма; фитнес~Regular running improves overall fitness.~Регулярный бег улучшает общую физическую форму.~noun
nutrition~питание~Balanced nutrition supports the immune system.~Сбалансированное питание поддерживает иммунную систему.~noun
hygiene~гигиена~Hand hygiene prevents infections.~Гигиена рук предотвращает инфекции.~noun
fatigue~переутомление; усталость~Chronic fatigue impairs concentration.~Хроническая усталость ухудшает концентрацию.~noun
heal~заживать; исцелять~The wound will heal within a week.~Рана заживёт в течение недели.~verb
breathe~дышать~Breathe deeply through your nose.~Дышите глубоко через нос.~verb
pill~таблетка; пилюля~Take one vitamin pill every morning.~Принимай одну витаминную таблетку каждое утро.~noun
therapy~терапия; лечение~Physical therapy restored his mobility.~Физиотерапия восстановила его подвижность.~noun
wellness~хорошее самочувствие; благополучие~Yoga promotes mental wellness.~Йога способствует душевному благополучию.~noun
ointment~мазь~Apply the herbal ointment twice a day.~Наносите травяную мазь дважды в день.~noun`);
  add('topics','Doctors and pharmacies','noun',`
referral~направление к врачу~The GP gave me a hospital referral.~Терапевт дал мне направление в больницу.~noun
chemist~аптекарь; химик~Ask the chemist for cough drops.~Попроси у аптекаря леденцы от кашля.~noun
pharmacist~фармацевт~The pharmacist explained the dosage.~Фармацевт объяснил дозировку.~noun
surgeon~хирург~The surgeon performed the operation successfully.~Хирург успешно провёл операцию.~noun
dentist~стоматолог; зубной врач~Visit the dentist twice a year.~Посещай стоматолога дважды в год.~noun
clinic~клиника; поликлиника~The local clinic opens at eight.~Местная клиника открывается в восемь.~noun
ward~больничная палата~Visitors entered the pediatric ward.~Посетители вошли в детское отделение палаты.~noun
syringe~шприц~The nurse prepared a sterile syringe.~Медсестра подготовила стерильный шприц.~noun
thermometer~термометр; градусник~Check your temperature with a thermometer.~Проверь температуру термометром.~noun
dosage~дозировка~Do not exceed the recommended dosage.~Не превышайте рекомендуемую дозировку.~noun
antibiotic~антибиотик~Complete the full course of antibiotics.~Завершите полный курс антибиотиков.~noun
painkiller~обезболивающее средство~A painkiller relieved the headache.~Обезболивающее сняло головную боль.~noun
injection~укол; инъекция~The doctor gave an intramuscular injection.~Врач сделал внутримышечный укол.~noun
wheelchair~инвалидная коляска~The hospital entrance has ramps for wheelchairs.~У входа в больницу есть пандусы для колясок.~noun
crutch~костыль~He walked on crutches after the ankle sprain.~Он ходил на костылях после растяжения связок лодыжки.~noun
plaster~лейкопластырь; гипс~Put a waterproof plaster over the blister.~Наклей водостойкий лейкопластырь на мозоль.~noun
diagnose~ставить диагноз~The specialist diagnosed the cause of the rash.~Специалист определил причину сыпи.~verb
examine~осматривать; обследовать~The pediatrician will examine the child.~Педиатр осмотрит ребёнка.~verb
remedy~лекарство; средство~Honey and lemon is a traditional remedy.~Мёд и лимон — традиционное средство.~noun
ambulance~скорая помощь~Call an ambulance immediately in emergency.~Немедленно вызывай скорую помощь при экстренной ситуации.~noun`);
  add('topics','Home and housing','noun',`
apartment~квартира~They rented a bright two-room apartment.~Они сняли светлую двухкомнатную квартиру.~noun
cottage~коттедж; загородный домик~We spent the summer in a small wooden cottage.~Мы провели лето в маленьком деревянном коттедже.~noun
terrace~терраса; веранда~There are potted flowers on the terrace.~На террасе стоят цветы в горшках.~noun
cellar~погреб; винный подвал~Keep homemade jams in the cool cellar.~Храни домашнее варенье в прохладном погребе.~noun
attic~чердак; мансарда~Pigeons built a nest under the attic roof.~Голуби свили гнездо под крышей чердака.~noun
chimney~дымоход; труба~Smoke rose from the brick chimney.~Дым поднимался из кирпичной трубы.~noun
corridor~коридор~Walk down the corridor to find the exit.~Иди по коридору, чтобы найти выход.~noun
porch~крыльцо; веранда~We sat on the porch watching the rain.~Мы сидели на крыльце и смотрели на дождь.~noun
fence~забор; ограда~A white fence surrounds the garden.~Белый забор окружает сад.~noun
roof~крыша; кровля~Rain pattered against the tin roof.~Дождь барабанил по жестяной крыше.~noun
hallway~прихожая; коридор~Leave your wet shoes in the hallway.~Оставь мокрую обувь в прихожей.~noun
floorboard~половая доска; паркетина~The old wooden floorboards creaked softly.~Старые деревянные половицы тихо скрипели.~noun
shutter~ставень~Close the window shutters before the storm.~Закрой оконные ставни перед грозой.~noun
neighbourhood~район; окрестности~This is a calm and green neighbourhood.~Это спокойный и зелёный район.~noun
suburb~пригород~Many families prefer living in the suburbs.~Многие семьи предпочитают жить в пригороде.~noun`);
  add('topics','Furniture and household objects','noun',`
armchair~кресло~Grandmother loves reading in her soft armchair.~Бабушка любит читать в своём мягком кресле.~noun
closet~стенной шкаф; гардеробная~Hang your shirts inside the closet.~Повесь рубашки в стенной шкаф.~noun
bookshelf~книжная полка~The bookshelf is filled with classic novels.~Книжная полка заполнена классическими романами.~noun
carpet~ковёр~A woven Persian carpet covered the wooden floor.~Тканый персидский ковёр покрывал деревянный пол.~noun
drapes~портьеры; плотные шторы~Draw the drapes to block the harsh sunlight.~Задерни портьеры, чтобы закрыть яркий солнечный свет.~noun
cushion~диванная подушка~Place a cushion behind your back for comfort.~Положи подушку под спину для удобства.~noun
duvet~пуховое одеяло~Sleep warmly under a thick down duvet.~Спи в тепле под толстым пуховым одеялом.~noun
pillow~подушка (для сна)~A comfortable feather pillow helps good sleep.~Удобная пуховая подушка помогает крепкому сну.~noun
chandelier~люстра~A sparkling crystal chandelier hung from the ceiling.~Сверкающая хрустальная люстра висела под потолком.~noun
lantern~фонарь; светильник~Carry a small lantern along the garden path.~Неси маленький фонарь по садовой дорожке.~noun
drawer~выдвижной ящик~Keep your keys in the top drawer.~Храни ключи в верхнем выдвижном ящике.~noun
hanger~вешалка-плечики~Hang your damp coat on a sturdy hanger.~Повесь влажное пальто на прочную вешалку.~noun
kettle~чайник~The electric kettle boiled water rapidly.~Электрический чайник быстро вскипятил воду.~noun
toaster~тостер~Put two slices of rye bread into the toaster.~Положи два кусочка ржаного хлеба в тостер.~noun
pan~сковорода~Fry eggs on a non-stick frying pan.~Пожарь яйца на сковороде с антипригарным покрытием.~noun
pot~кастрюля; горшок~Boil potatoes in a large cooking pot.~Свари картофель в большой кастрюле.~noun
spoon~ложка~Stir the hot soup with a wooden spoon.~Помешай горячий суп деревянной ложкой.~noun
fork~вилка~Use a silver fork to eat the fresh salad.~Используй серебряную вилку, чтобы есть свежий салат.~noun
knife~нож~Cut the fresh bread with a serrated knife.~Нарежь свежий хлеб зазубренным ножом.~noun
towel~полотенце~Dry your hands thoroughly with a clean towel.~Тщательно вытри руки чистым полотенцем.~noun`);
  add('topics','Housework','verb',`
scrub~тереть щеткой; скрести~Scrub the kitchen sink until it shines.~Потри кухонную раковину щёткой, пока она не заблестит.~verb
mop~мыть шваброй; швабра~Mop the tiled entryway after rain.~Помой плитку в прихожей шваброй после дождя.~verb
dust~вытирать пыль; пыль~Dust the wooden shelves once a week.~Вытирай пыль с деревянных полок раз в неделю.~verb
rinse~полоскать; промывать~Rinse the clean dishes under warm water.~Сполосни чистую посуду под тёплой водой.~verb
laundry~стирка; грязное белье~Sort the dirty laundry into light and dark.~Разложи грязное бельё на светлое и тёмное.~noun
detergent~стиральный порошок; моющее средство~Pour liquid detergent into the washing machine.~Налей жидкий стиральный порошок в стиральную машину.~noun
bleach~отбеливатель~Do not spill chlorine bleach on colored fabric.~Не проливай хлорный отбеливатель на цветную ткань.~noun
soak~замачивать белье~Soak the stained tablecloth in warm water.~Замочи испачканную скатерть в тёплой воде.~verb
declutter~избавляться от лишних вещей~Declutter your living room this weekend.~Избавься от лишних вещей в гостиной на этих выходных.~verb
polish~полировать; полироль~Polish the wooden dining table with beeswax.~Отполируй деревянный стол пчелиным воском.~verb
sponge~губка~Wipe the kitchen counter with a damp sponge.~Протри кухонную столешницу влажной губкой.~noun
bucket~ведро~Fill a plastic bucket with soapy water.~Наполни пластиковое ведро мыльной водой.~noun
broom~метла; веник~The corn broom stands in the storage corner.~Веник стоит в углу кладовой.~noun
dustpan~совок для мусора~Sweep the crumbs into the red dustpan.~Замети крошки в красный совок.~noun
garbage~бытовые отходы; мусор~Put the kitchen garbage into biodegradable bags.~Складывай кухонный мусор в биоразлагаемые пакеты.~noun
clutter~беспорядок; хлам~Clear the unnecessary clutter off the table.~Убери лишний хлам со стола.~noun
unclog~прочищать (засор)~Use hot water and soda to unclog the drain.~Используй горячую воду и соду, чтобы прочистить слив.~verb
organise~наводить порядок; организовывать~Organise your wardrobe by colour and season.~Наведи порядок в гардеробе по цветам и сезонам.~verb
chores~домашние дела; рутинная работа~We share household chores fairly at home.~Мы делим домашние дела поровну дома.~noun
air~проветривать комнату~Air the bedroom thoroughly every morning.~Тщательно проветривай спальню каждое утро.~verb`);
  add('topics','Daily routines','verb',`
awaken~просыпаться; будить~Gentle bird songs awaken the countryside.~Нежные трели птиц пробуждают деревню.~verb
snooze~вздремнуть; отложить будильник~Do not hit the snooze button three times.~Не откладывай сигнал будильника три раза.~verb
stretch~потягиваться; растягиваться~Stretch your arms and legs after getting up.~Потяни руки и ноги после того, как встал.~verb
put on~надевать одежду~Put on a warm scarf before going out.~Надень тёплый шарф перед выходом.~verb
comb~расчёсывать; гребень~Comb your hair neatly in the bathroom mirror.~Аккуратно расчеши волосы перед зеркалом в ванной.~verb
shave~бриться~He uses warm foam to shave his beard.~Он использует тёплую пену, чтобы побрить бороду.~verb
travel~добираться до места~I travel by train to the university campus.~Я добираюсь на поезде до университетского кампуса.~verb
lunchtime~обеденный перерыв~We eat fresh soup at lunchtime.~Мы едим свежий суп в обеденный перерыв.~noun
unwind~расслабляться; отдыхать~Listening to classical music helps me unwind.~Прослушивание классической музыки помогает мне расслабиться.~verb
bedtime~время отхода ко сну~Children have a regular bedtime at nine.~У детей постоянное время отхода ко сну в девять.~noun
alarm clock~будильник~Set the alarm clock for seven sharp.~Поставь будильник ровно на семь.~noun
brush teeth~чистить зубы~Brush teeth thoroughly every morning and evening.~Тщательно чисти зубы каждое утро и вечер.~phrase
bath~принимать ванну; ванна~Take a relaxing herbal bath on Friday evening.~Прими расслабляющую травяную ванну в пятницу вечером.~noun
nap~короткий дневной сон~A twenty-minute afternoon nap boosts energy.~Двадцатиминутный дневной сон придаёт сил.~noun
routine~распорядок; рутина~A consistent morning routine reduces stress.~Постоянный утренний распорядок снижает стресс.~noun
habit~привычка~Drinking water early is a healthy habit.~Пить воду рано утром — полезная привычка.~noun
errand~поручение; дело~I need to run a quick errand at the post.~Мне нужно сбегать по быстрому делу на почту.~noun
yawn~зевать; зевота~He stifled a wide yawn during class.~Он сдержал широкий зевок во время урока.~verb
sleepy~сонный~Warm herbal tea makes you comfortably sleepy.~Тёплый травяной чай приятно клонит в сон.~adjective`);
  add('topics','Food and groceries','noun',`
grain~зерно; крупа~Whole grain cereals provide sustained energy.~Цельнозерновые крупы дают продолжительную энергию.~noun
butter~сливочное масло~Spread creamy butter on fresh toast.~Намажь сливочное масло на свежий тост.~noun
olive oil~оливковое масло~Drizzle extra virgin olive oil over salad.~Сбрызни салат оливковым маслом первого отжима.~noun
honey~пчелиный мед~Raw mountain honey is naturally sweet.~Сырой горный мёд натурально сладок.~noun
black pepper~чёрный перец~Grind fresh black pepper over the steak.~Посыпь стейк свежемолотым чёрным перцем.~noun
spices~пряности; специи~Exotic spices give the curry rich aroma.~Экзотические пряности придают карри богатый аромат.~noun
noodle~лапша~Egg noodles cook in five minutes.~Яичная лапша варится пять минут.~noun
cereal~хлопья; сухой завтрак~Oatmeal cereal is a nutritious breakfast.~Овсяные хлопья — это питательный завтрак.~noun
jam~варенье; джем~Strawberry jam tastes wonderful with pancakes.~Клубничный джем замечателен с блинами.~noun
vinegar~уксус~Apple cider vinegar is used in dressings.~Яблочный уксус используется в заправках для салатов.~noun
mustard~горчица~Spicy Dijon mustard complements sausages.~Острая дижонская горчица дополняет колбаски.~noun
garlic~чеснок~Crushed garlic gives intense aroma.~Измельчённый чеснок даёт насыщенный аромат.~noun
onion~репчатый лук~Saute chopped yellow onion until golden.~Обжаривай нарезанный репчатый лук до золотистого цвета.~noun
sauce~соус; подливка~A rich tomato sauce simmered on the stove.~Насыщенный томатный соус томился на плите.~noun
snack~перекус; легкая закуска~Fresh walnuts make a healthy afternoon snack.~Свежие грецкие орехи — полезный дневной перекус.~noun`);
  add('topics','Drinks','noun',`
mineral water~минеральная вода~Sparkling mineral water quenches thirst.~Газированная минеральная вода утоляет жажду.~noun
milkshake~молочный коктейль~Chocolate milkshake topped with whipped cream.~Шоколадный молочный коктейль со взбитыми сливками.~noun
smoothie~смузи~Berry and banana smoothie makes a quick breakfast.~Ягодно-банановый смузи служит быстрым завтраком.~noun
cocoa~какао~Hot cocoa warms you up in winter.~Горячее какао согревает зимой.~noun
syrup~сироп~Add a dash of vanilla syrup to latte.~Добавь капельку ванильного сиропа в латте.~noun
beverage~напиток~Hot beverages are served in ceramic cups.~Горячие напитки подаются в керамических чашках.~noun
espresso~эспрессо~A double espresso gives quick energy.~Двойной эспрессо быстро прибавляет бодрости.~noun
cappuccino~капучино~A dusting of cinnamon over creamy cappuccino.~Щепотка корицы поверх сливочного капучино.~noun
iced tea~холодный чай со льдом~Peach iced tea is served with lemon slices.~Персиковый чай со льдом подаётся с дольками лимона.~noun
cider~сидр~Warm spiced apple cider smells of cinnamon.~Тёплый пряный яблочный сидр пахнет корицей.~noun
broth~бульон; отвар~Clear chicken broth restores hydration.~Прозрачный куриный бульон восстанавливает водный баланс.~noun
soda~газированная вода; газировка~Plain club soda is zero calorie.~Обычная клубная содовая не содержит калорий.~noun
hydration~увлажнение; поддержание водного баланса~Adequate daily hydration keeps skin clear.~Достаточный водный баланс сохраняет кожу чистой.~noun
thirst~жажда~Cold mountain spring water slakes thirst.~Холодная вода из горного источника утоляет жажду.~noun
latte~кофе латте~A frothy vanilla latte was poured into a glass.~Пышный ванильный латте был налит в стеклянный стакан.~noun
kombucha~чайный гриб; комбуча~Fermented ginger kombucha supports digestion.~Ферментированная имбирная комбуча поддерживает пищеварение.~noun
compote~компот из сухофруктов~Grandmother cooked a sweet fruit compote.~Бабушка сварила сладкий компот из фруктов.~noun
infusion~настой трав~Peppermint infusion soothes stomach cramps.~Настой перечной мяты успокаивает спазмы в желудке.~noun
tap water~водопроводная питьевая вода~Filtered tap water is safe and clean.~Фильтрованная водопроводная вода безопасна и чиста.~noun`);
  add('topics','Cooking','verb',`
simmer~томить на медленном огне~Simmer the tomato sauce for an hour.~Томи томатный соус на медленном огне час.~verb
whisk~взбивать венчиком~Whisk the egg whites into stiff peaks.~Взбей яичные белки венчиком до устойчивой пены.~verb
marinate~мариновать~Marinate chicken in lemon and garlic.~Замаринуй курицу в лимоне и чесноке.~verb
season~приправлять специями~Season the soup with sea salt and black pepper.~Приправь суп морской солью и чёрным перцем.~verb
recipe~кулинарный рецепт~Follow the traditional family recipe carefully.~Внимательно следуй традиционному семейному рецепту.~noun
ingredient~ингредиент; составная часть~Fresh ingredients make all the difference.~Свежие ингредиенты меняют всё дело.~noun
flavour~вкус; аромат~Cardamom adds exotic warmth and flavour.~Кардамон добавляет экзотическое тепло и аромат.~noun
sift~просеивать муку~Sift the dry flour into a clean bowl.~Просейте сухую муку в чистую миску.~verb
brown~подрумянивать~Brown the minced beef evenly in a hot pan.~Равномерно подрумянь говяжий фарш на горячей сковороде.~verb
caramelize~карамелизовать~Slowly caramelize the sweet red onions.~Медленно карамелизуй сладкий красный лук.~verb
dice~нарезать кубиками~Dice the peeled carrots into small cubes.~Нарежь очищенную морковь мелкими кубиками.~verb
mince~измельчать; рубить фарш~Mince two cloves of garlic finely.~Мелко измельчи два зубчика чеснока.~verb
drain~сливать воду через дуршлаг~Drain the boiled macaroni in a colander.~Слей воду с отваренных макарон через дуршлаг.~verb
garnish~украшать готовое блюдо; гарнир~Garnish the salmon with fresh dill sprigs.~Укрась лосось веточками свежего укропа.~verb
preheat~предварительно разогревать духовку~Preheat the convection oven to two hundred degrees.~Разогрей духовку до двухсот градусов.~verb
crush~раздавливать; толочь~Crush black peppercorns in a stone mortar.~Истолки горошины чёрного перца в каменной ступке.~verb
blend~смешивать в блендере~Blend the ripe strawberries with yogurt.~Смешай спелую клубнику с йогуртом в блендере.~verb
frosting~глазурь для торта~Spread chocolate frosting over the cooled cake.~Нанеси шоколадную глазурь на остывший торт.~noun`);
  add('topics','Cafes and restaurants','noun',`
appetizer~закуска перед основным блюдом~Crispy bruschetta is our favorite appetizer.~Хрустящая брускетта — наша любимая закуска.~noun
course~блюдо (часть обеда)~A light vegetable salad was our first course.~Лёгкий овощной салат был нашей первой переменой блюд.~noun
takeaway~еда навынос~Order a hot noodle takeaway on the way home.~Закажи горячую лапшу навынос по дороге домой.~noun
outdoor seating~места на открытом воздухе; терраса~We preferred pleasant outdoor seating in summer.~Летом мы предпочли приятные места на террасе.~noun
barista~бариста (мастер кофе)~The barista painted a leaf pattern on the foam.~Бариста нарисовал листочек на молочной пенке.~noun
cutlery~столовые приборы~Polished silverware cutlery was set on the table.~Полированные столовые приборы были расставлены на столе.~noun
chef~шеф-повар~The executive chef trained in culinary arts.~Шеф-повар обучался кулинарному искусству.~noun
napkin~салфетка~Wipe your fingers with a paper napkin.~Вытри пальцы бумажной салфеткой.~noun
specialty~фирменное блюдо~Fresh seafood pasta is the chef specialty.~Паста со свежими морепродуктами — фирменное блюдо шефа.~noun
beverage list~карта напитков~Inspect the seasonal beverage list carefully.~Внимательно изучите сезонную карту напитков.~noun
bistrot~бистро; небольшое кафе~We stopped at a cozy French bistrot.~Мы остановились в уютном французском бистро.~noun
refill~повторное наполнение напитка~Ask the counter staff for a free water refill.~Попроси сотрудников у стойки бесплатно долить воды.~noun
tray~поднос для блюд~Carry the hot soup bowl carefully on a tray.~Неси тарелку с горячим супом осторожно на подносе.~noun
patio~внутренний дворик ресторана~Dine on the quiet leafy garden patio.~Поужинайте в тихом зелёном дворике.~noun
counter service~обслуживание у стойки~Quick counter service saved us plenty of time.~Быстрое обслуживание у стойки сэкономило нам много времени.~noun`);
  add('topics','Clothes and shoes','noun',`
cardigan~кардиган на пуговицах~She buttoned up her knitted beige cardigan.~Она застегнула свой вязаный бежевый кардиган.~noun
sneakers~кроссовки для спорта~Running sneakers cushion your knees.~Беговые кроссовки амортизируют колени.~noun
belt~ремень; пояс~Fasten the leather belt firmly.~Туго застегни кожаный ремень.~noun
zipper~застёжка-молния~Pull up the coat zipper against the chilly wind.~Застегни молнию пальто от промозглого ветра.~noun
button~пуговица~Sew a loose horn button back onto the jacket.~Пришей болтающуюся роговую пуговицу обратно к куртке.~noun
pocket~карман~Put your travel ticket in the inner pocket.~Положи проездной билет во внутренний карман.~noun
sleeve~рукав~Roll up your shirt sleeves before painting.~Закатай рукава рубашки перед покраской.~noun
collar~воротник~Press the stiff cotton collar with an iron.~Прогладь жёсткий хлопковый воротник утюгом.~noun
raincoat~дождевик; непромокаемый плащ~A bright yellow raincoat kept him dry in the storm.~Ярко-жёлтый дождевик защитил его от промокания в грозу.~noun
slippers~домашние тапочки~Slip into soft woollen slippers after work.~Надень мягкие шерстяные тапочки после работы.~noun
vest~жилет; безрукавка~A padded down vest keeps your core warm.~Утеплённый пуховый жилет согревает тело.~noun
hoodie~толстовка с капюшоном~Pull up the hood of your fleece hoodie.~Накинь капюшон своей флисовой толстовки.~noun
shoelace~шнурок для обуви~Tie your shoelaces firmly before running.~Туго завяжи шнурки перед пробежкой.~noun
lining~подкладка одежды~The winter parka has a quilted silk lining.~У зимней парки стеганая шёлковая подкладка.~noun
fabric~ткань; материя~Natural breathable linen is an ideal summer fabric.~Натуральный дышащий лён — идеальная летняя ткань.~noun`);
  add('topics','Shopping','noun',`
cart~тележка для покупок~Push the metal shopping cart down the aisle.~Кати металлическую тележку по ряду магазина.~noun
cashier~кассир~The cashier scanned each item quickly.~Кассир быстро отсканировал каждый товар.~noun
aisle~проход между рядами~Look down the cereal aisle for rolled oats.~Посмотри в ряду с крупами овсяные хлопья.~noun
shelf~полка с товарами~Tinned goods are neatly stacked on the shelf.~Консервированные товары аккуратно расставлены на полке.~noun
sale~распродажа~Winter clothes are on sale this week.~Зимняя одежда на этой неделе на распродаже.~noun
bargain~выгодная покупка; сделка~Finding this wool coat for fifty was a bargain.~Найти это шерстяное пальто за пятьдесят было удачной сделкой.~noun
fitting room~примерочная кабина~Try on the trousers in the fitting room.~Примерь брюки в примерочной кабине.~noun
counter~прилавок; стойка~Pay for your purchases at the checkout counter.~Оплатите свои покупки на кассовой стойке.~noun
barcode~штрихкод товара~The laser scanner read the product barcode.~Лазерный сканер считал штрихкод товара.~noun
customer~покупатель; клиент~A satisfied customer returned to the boutique.~Довольный покупатель вернулся в бутик.~noun
goods~товары; изделия~Fresh baked goods arrive early every morning.~Свежие выпеченные товары поступают рано каждое утро.~noun
label~этикетка; ярлык~Check the washing instructions on the clothing label.~Проверь инструкции по стирке на ярлыке одежды.~noun
warranty~гарантия на товар~The electric appliance comes with a two-year warranty.~На электроприбор действует двухлетняя гарантия.~noun
brand~торговая марка; бренд~Choose a reliable brand known for durability.~Выбирай надёжный бренд, известный долговечностью.~noun
loyalty card~дисконтная карта; карта постоянного покупателя~Scan your store loyalty card for bonus points.~Отсканируйте карту постоянного покупателя для бонусов.~noun`);
  add('topics','Money and payments','noun',`
credit card~кредитная карта~Pay contactless with your credit card.~Оплачивай бесконтактно своей кредитной картой.~noun
loan~банковский кредит; заём~Apply for a low-interest bank loan.~Подай заявку на банковский кредит с низкой процентной ставкой.~noun
afford~позволить себе финансово~We cannot afford a luxury holiday right now.~Мы не можем позволить себе роскошный отпуск прямо сейчас.~verb
interest~проценты по вкладу или кредиту~The high-yield savings account earns four percent interest.~Высокодоходный сберегательный счёт приносит четыре процента прибыли.~noun
mortgage~ипотечный кредит на жилье~They took out a twenty-year mortgage on the house.~Они взяли двадцатилетнюю ипотеку на дом.~noun
bankruptcy~банкротство; неплатёжеспособность~The struggling airline declared legal bankruptcy.~Терпящая бедствие авиакомпания объявила о банкротстве.~noun
investment~инвестиции; вложение капитала~Education is the best long-term investment.~Образование — лучшая долгосрочная инвестиция.~noun
receipt book~квитанционная книжка~The landlord issued a signed receipt book stub.~Арендодатель выдал корешок из квитанционной книжки.~noun
inflation~инфляция; обесценивание денег~Central banks monitor consumer inflation closely.~Центральные банки внимательно следят за инфляцией.~noun
tax~государственный налог~Income tax is deducted automatically from pay.~Подоходный налог вычитается из зарплаты автоматически.~noun
pension~трудовая пенсия~He retired on a comfortable monthly pension.~Он вышел на пенсию с комфортным ежемесячным пособием.~noun
cheque~банковский чек~Pay the deposit with a crossed banker cheque.~Оплатите депозит именным банковским чеком.~noun
atm~банкомат~Withdraw emergency local notes from the corner ATM.~Сними немного наличных в угловом банкомате.~noun
balance~остаток на банковском счете~Check your current account balance online.~Проверь текущий баланс счёта через интернет.~noun
installment~очередной взнос в рассрочку~Pay for the smartphone in twelve monthly installments.~Оплачивай смартфон двенадцатью ежемесячными взносами.~noun
overdraft~банковский овердрафт~Avoid high charges by never exceeding your overdraft limit.~Избегай высоких комиссий, не превышая лимит овердрафта.~noun`);
  add('topics','Work and professions','noun',`
journalist~журналист; репортёр~An investigative journalist wrote the article.~Журналист-расследователь написал эту статью.~noun
programmer~программист; разработчик~A backend programmer optimized the database.~Бэкенд-программист оптимизировал базу данных.~noun
designer~дизайнер~A graphic designer created the new logo.~Графический дизайнер создал новый логотип.~noun
carpenter~плотник; столяр~The skilled carpenter built oak dining chairs.~Умелый плотник сделал дубовые обеденные стулья.~noun
mechanic~автомеханик; механик~The auto mechanic replaced the car brakes.~Автомеханик заменил тормоза в автомобиле.~noun
pharmacist~провизор; фармацевт~The hospital pharmacist dispensed the medicine.~Больничный фармацевт выдал лекарство.~noun
veterinarian~ветеринар~The veterinarian treated the injured puppy.~Ветеринар оказал помощь травмированному щенку.~noun
pilot~пилот; лётчик~The commercial airline pilot landed smoothly.~Пилот коммерческой авиалинии плавно посадил самолёт.~noun
firefighter~пожарный~Brave firefighters extinguished the blaze quickly.~Храбрые пожарные быстро потушили пламя.~noun
paramedic~фельдшер скорой помощи~Paramedics arrived at the scene within minutes.~Фельдшеры скорой помощи прибыли на место за считанные минуты.~noun
photographer~профессиональный фотограф~The wedding photographer captured wonderful portraits.~Свадебный фотограф запечатлел прекрасные портреты.~noun
welder~сварщик~The certified industrial welder joined steel pipes.~Дипломированный сварщик соединял стальные трубы.~noun
librarian~библиотекарь~Ask the helpful reference librarian for assistance.~Попроси библиотекаря справочного отдела о помощи.~noun
receptionist~секретарь на стойке регистрации~The receptionist booked our appointments politely.~Секретарь вежливо записал нас на приём.~noun
surgeon~хирург высшей категории~The neurosurgeon operated with great precision.~Нейрохирург оперировал с высочайшей точностью.~noun
interpreter~устный переводчик~A court interpreter assisted the foreign witness.~Судебный устный переводчик помогал иностранному свидетелю.~noun`);
  add('topics','Communication at work','noun',`
briefing~брифинг; короткое совещание~The team attended an early morning briefing.~Команда присутствовала на раннем утреннем брифинге.~noun
negotiation~переговоры~Both parties entered tough trade negotiations.~Обе стороны вступили в непростые торговые переговоры.~noun
delegate~делегировать полномочия~A good leader knows how to delegate tasks.~Хороший лидер знает, как делегировать задачи.~verb
brainstorm~проводить мозговой штурм~Let us brainstorm fresh marketing concepts.~Давайте проведём мозговой штурм новых маркетинговых концепций.~verb
coordinate~координировать; согласовывать~Coordinate project schedules across departments.~Координируйте графики проектов между отделами.~verb
collaborate~сотрудничать; работать сообща~Two universities collaborate on climate research.~Два университета сотрудничают в исследовании климата.~verb
workplace~рабочее место~Maintain an ergonomic and tidy workplace.~Поддерживай эргономичное и чистое рабочее место.~noun
coworker~коллега по работе~Help a new coworker settle into the office.~Помоги новому коллеге освоиться в офисе.~noun
client~клиент; заказчик~Greet the corporate client with professional courtesy.~Встретьте корпоративного клиента с профессиональной вежливостью.~noun
supervisor~непосредственный руководитель~Discuss career development with your supervisor.~Обсуди карьерное развитие со своим руководителем.~noun
contract~трудовой или коммерческий договор~Sign the official employment contract in duplicate.~Подпишите официальный трудовой договор в двух экземплярах.~noun
colleague~сослуживец; коллега~Consult with a senior colleague on legal matters.~Посоветуйся со старшим коллегой по правовым вопросам.~noun
teleconference~телеконференция; видеосовещание~Join the remote international teleconference at three.~Подключись к удалённой видеоконференции в три часа.~noun
inquiry~официальный запрос~Respond to the customer email inquiry within one hour.~Ответьте на письменный запрос клиента в течение часа.~noun
workload~рабочая нагрузка~Balance the weekly team workload evenly.~Равномерно распределяй недельную нагрузку команды.~noun
milestone~этап проекта; веха~Completing the prototype was an essential project milestone.~Завершение прототипа стало важной вехой проекта.~noun
objective~цель; задача компании~Achieve every annual business objective on schedule.~Достигай каждой годовой цели компании по графику.~noun
appraisal~оценка работы сотрудника~Managers hold performance appraisal reviews yearly.~Руководители ежегодно проводят аттестацию сотрудников.~noun
follow-up~последующее письмо или звонок~Send a polite follow-up email after the interview.~Отправь вежливое повторное письмо после собеседования.~noun`);
  add('topics','School and education','noun',`
pupil~ученик начальной или средней школы~The primary school pupils wore blue uniforms.~Ученики начальной школы носили синюю форму.~noun
blackboard~школьная доска~The teacher wrote maths equations on the blackboard.~Учитель написал математические уравнения на доске.~noun
chalk~мел~Colored chalk broke into pieces on the tray.~Цветной мел сломался на кусочки в лотке.~noun
eraser~ластик для стирания~Erase pencil marks with a soft eraser.~Сотри карандашные пометки мягким ластиком.~noun
ruler~линейка для черчения~Draw straight lines with a wooden ruler.~Проводи прямые линии деревянной линейкой.~noun
examination~экзамен; испытание~The final examination lasted three intense hours.~Выпускной экзамен длился три напряжённых часа.~noun
term~учебная четверть; семестр~The autumn term concludes in late December.~Осенний семестр заканчивается в конце декабря.~noun
campus~студенческий городок; кампус~The university campus has modern sports facilities.~Университетский кампус имеет современные спортивные сооружения.~noun
lecture~университетская лекция~The biology lecture started promptly at ten.~Лекция по биологии началась ровно в десять.~noun
recess~школьная перемена~Children played tag in the yard during recess.~Дети играли в салки во дворе во время перемены.~noun
tutor~репетитор; наставник~A maths tutor helped him master calculus.~Репетитор по математике помог ему освоить анализ.~noun
graduate~выпускник; оканчивать вуз~She will graduate with honors next summer.~Она окончит университет с отличием следующим летом.~verb
faculty~факультет; профессорско-преподавательский состав~The engineering faculty published ground-breaking research.~Инженерный факультет опубликовал передовое исследование.~noun
diploma~диплом об окончании учебного заведения~He proudly framed his university diploma.~Он с гордостью вставил в рамку свой университетский диплом.~noun
seminar~учебный семинар~Students actively participated in the literature seminar.~Студенты активно участвовали в семинаре по литературе.~noun
assignment~учебное задание~Submit the written history assignment via portal.~Сдай письменное задание по истории через портал.~noun
headmaster~директор школы~The headmaster welcomed new pupils at assembly.~Директор школы поприветствовал новых учеников на линейке.~noun
dormitory~студенческое общежитие~Freshmen live on campus in the university dormitory.~Первокурсники живут на кампусе в университетском общежитии.~noun
syllabus~план курса; программа предмета~Read the semester course syllabus thoroughly.~Внимательно прочитай программу учебного курса.~noun`);
  add('topics','Learning languages','noun',`
comprehension~понимание на слух или при чтении~Listening exercises test audio comprehension.~Упражнения на аудирование проверяют понимание речи на слух.~noun
idiom~идиома; устойчивое выражение~English has many idioms connected with animals.~В английском языке много идиом, связанных с животными.~noun
synonym~синоним~Find a suitable synonym for the word joyful.~Найди подходящий синоним к слову радостный.~noun
antonym~антоним~Hot is the direct antonym of cold.~Горячий — это прямой антоним холодного.~noun
phrase~фраза; речевой оборот~Memorise useful conversational phrases.~Запоминай полезные разговорные фразы.~noun
bilingual~двуязычный; билингв~Bilingual children switch easily between languages.~Двуязычные дети легко переключаются между языками.~adjective
memorise~заучивать наизусть~Memorise five new irregular verbs every morning.~Учи наизусть пять новых неправильных глаголов каждое утро.~verb
subtitle~субтитры в фильме~Watch foreign movies with original audio subtitles.~Смотри иностранные фильмы с субтитрами на языке оригинала.~noun
dictionary~толковый или переводной словарь~Look up unknown words in an online dictionary.~Ищи незнакомые слова в онлайн-словаре.~noun
intonation~интонация в предложении~English question intonation often rises at the end.~Английская вопросительная интонация часто повышается в конце.~noun
phonetics~фонетика языка~Studying English phonetics clarifies vowel length.~Изучение английской фонетики проясняет долготу гласных.~noun
syntax~синтаксис; правила построения предложений~Complex sentence syntax requires careful study.~Сложный синтаксис предложений требует внимательного изучения.~noun
dialogue~разговор; диалог~Practice real-life conversational dialogues with partners.~Практикуй жизненные диалоги с партнёрами по учёбе.~noun
monologue~монолог; устное высказывание~Deliver a structured two-minute monologue on culture.~Произнеси связный двухминутный монолог о культуре.~noun
native speaker~носитель языка~Chat with a native speaker to gain natural phrasing.~Общайся с носителем языка, чтобы усвоить естественные обороты.~noun`);
  add('topics','City and public places','noun',`
pedestrian~пешеход~Drivers must yield to pedestrians at zebra crossings.~Водители должны уступать пешеходам на пешеходных переходах.~noun
skyscraper~небоскрёб~The glass skyscraper towers over the financial hub.~Стеклянный небоскрёб возвышается над финансовым центром.~noun
subway~метрополитен; подземный переход~Take the underground subway to reach city hall.~Садись на метро, чтобы добраться до мэрии.~noun
crossroad~перекрёсток улиц~A traffic police officer directed cars at the crossroad.~Сотрудник дорожной полиции направлял машины на перекрёстке.~noun
alley~узкий переулок; аллея~The cobblestone alley led to an old bakery.~Мощёный переулок вёл к старой пекарне.~noun
bench~скамейка для отдыха~Rest on a wooden bench beneath shady oak trees.~Отдохни на деревянной скамейке под тенистыми дубами.~noun
lamppost~уличный фонарный столб~An ornate cast iron lamppost illuminated the street.~Изящный чугунный фонарный столб освещал улицу.~noun
kiosk~киоск; газетный ларек~Buy a morning newspaper at the corner kiosk.~Купи утреннюю газету в угловом киоске.~noun
billboard~рекламный щит; билборд~A colorful billboard announced a theatre premiere.~Красочный рекламный щит возвещал о театральной премьере.~noun
canal~городской водный канал~Tourists took gentle boat rides down the canal.~Туристы катались на лодках по каналу.~noun
downtown~деловой центр города~Downtown shops stay open late into the evening.~Магазины в центре города открыты допоздна.~noun
suburb~спальный пригород~They moved from downtown to a quiet leafy suburb.~Они переехали из центра в тихий зелёный пригород.~noun
boulevard~широкий бульвар~Trees line the wide historic city boulevard.~Деревья обрамляют широкий исторический городской бульвар.~noun
avenue~проспект~Fifth Avenue is renowned for shopping and museums.~Пятая авеню известна магазинами и музеями.~noun
embankment~городская набережная~Couples strolled along the river embankment at sunset.~Пары прогуливались по набережной реки на закате.~noun
plaza~торговая площадь; плаза~Outdoor cafes set up umbrellas across the sunlit plaza.~Уличные кафе расставили зонтики на залитой солнцем плазе.~noun
courthouse~здание суда~The grand neoclassical courthouse stands on the hill.~Величественное неоклассическое здание суда стоит на холме.~noun
pedestrian zone~пешеходная зона~Motor vehicles are prohibited in the historic pedestrian zone.~Автомобили запрещены в исторической пешеходной зоне.~noun
crosswalk~пешеходный переход; зебра~Always check both ways before stepping onto the crosswalk.~Всегда смотри в обе стороны перед выходом на пешеходный переход.~noun`);
  add('topics','Directions','adverb',`
straight ahead~прямо вперёд~Walk straight ahead for two hundred meters.~Иди прямо вперёд двести метров.~adverb
junction~развязка; соединение дорог~Slow down approaching the busy motorway junction.~Сбавь скорость при приближении к оживлённой дорожной развязке.~noun
landmark~ориентир; приметное место~The ancient clock tower is an unmistakable landmark.~Древняя башня с часами — безошибочный ориентир.~noun
nearby~поблизости; рядом~A grocery convenience store is situated nearby.~Продуктовый магазин шаговой доступности расположен поблизости.~adverb
distance~расстояние~The walking distance to the station is five minutes.~Пешее расстояние до станции составляет пять минут.~noun
route~маршрут движения~Plan the scenic coastal walking route on the map.~Спланируй живописный прибрежный пеший маршрут по карте.~noun
shortcut~кратчайший путь; срезка~Taking a pathway through the park is a quick shortcut.~Тропинка через парк — это быстрый способ срезать путь.~noun
lost~заблудившийся; потерявшийся~Ask a police officer for guidance if you get lost.~Спроси дорогу у полицейского, если заблудишься.~adjective
navigate~ориентироваться; прокладывать путь~Use the mobile digital map to navigate the old town.~Используй цифровую карту в телефоне, чтобы ориентироваться в старом городе.~verb
u-turn~разворот на дороге~Make a safe U-turn at the designated road opening.~Соверши безопасный разворот в отведённом месте дороги.~noun
intersection~перекрёсток проезжих частей~Traffic lights control the dangerous four-way intersection.~Светофоры регулируют опасный четырёхсторонний перекрёсток.~noun
cul-de-sac~тупик улицы~Children play safely in the quiet cul-de-sac.~Дети безопасно играют в тихом тупике улицы.~noun
overpass~эстакада; путепровод над дорогой~Drive across the concrete highway overpass.~Езжай по бетонной эстакаде над шоссе.~noun
underpass~подземный переход или тоннель~Pedestrians walk through the brightly lit underpass.~Пешеходы идут через ярко освещённый подземный переход.~noun
compass~магнитный компас~Check your direction with a handheld magnetic compass.~Сверь своё направление по ручному магнитному компасу.~noun
heading~курс движения; направление~The yacht maintained a steady southerly heading.~Яхта держала устойчивый южный курс.~noun`);
  add('topics','Transport','noun',`
motorcycle~мотоцикл~Always wear a protective certified helmet on a motorcycle.~Всегда надевай сертифицированный шлем на мотоцикле.~noun
van~фургон; микроавтобус~The courier delivered parcel packages in a white van.~Курьер доставил посылки в белом фургоне.~noun
lorry~грузовой автомобиль; фура~Heavy freight lorries carry goods between industrial cities.~Тяжёлые грузовые фуры перевозят товары между городами.~noun
yacht~яхта~A sleek sailing yacht drifted along the sunny coast.~Элегантная парусная яхта дрейфовала вдоль солнечного берега.~noun
helicopter~вертолёт~The rescue helicopter hovered over the steep mountain.~Спасательный вертолёт завис над крутой горой.~noun
scooter~самокат; скутер~Rent a shared electric scooter to travel short blocks.~Возьми в аренду электросамокат, чтобы проехать пару кварталов.~noun
passenger~пассажир~Passengers boarded the high-speed electric train.~Пассажиры сели в скоростной электропоезд.~noun
driver~водитель~The experienced bus driver navigated narrow roads safely.~Опытный водитель автобуса безопасно вёл машину по узким дорогам.~noun
fare~стоимость проезда; тариф~Pay the standard bus fare with a transit smart card.~Оплати стандартный проезд транспортной картой.~noun
carriage~вагон поезда~Walk through the train carriage to find a window seat.~Пройди по вагону поезда, чтобы найти место у окна.~noun
seatbelt~ремень безопасности~Fasten your seatbelt whenever travelling in a car.~Пристёгивай ремень безопасности при поездке в машине.~noun
fuel~топливо; горючее~Hybrid engines consume less liquid fuel.~Гибридные двигатели потребляют меньше жидкого топлива.~noun
traffic~дорожное движение~Morning motorway traffic slowed due to heavy fog.~Утреннее движение на трассе замедлилось из-за густого тумана.~noun
commuter~пассажир пригородного транспорта~Thousands of daily commuters travel into London.~Тысячи пассажиров ежедневно ездят на работу в Лондон.~noun
locomotive~локомотив; тепловоз~The powerful diesel locomotive pulled twenty freight cars.~Мощный тепловоз тянул двадцать грузовых вагонов.~noun
tugboat~буксир в порту~A small harbor tugboat guided the ocean liner.~Маленький портовый буксир направлял океанский лайнер.~noun
monorail~монорельсовая дорога~The automated monorail connects all airport terminals.~Автоматический монорельс соединяет все терминалы аэропорта.~noun
cable car~канатная дорога; фуникулер~Take the alpine cable car up to the snowy peak.~Поднимись на канатной дороге на заснеженную вершину.~noun
pedicab~велорикша~Tourists hired a colorful pedicab to tour the park.~Туристы наняли велорикшу, чтобы осмотреть парк.~noun
steamer~пароход; теплоход~A vintage paddle steamer cruised along the river.~Винтажный колёсный пароход курсировал по реке.~noun`);
  add('topics','Travel','noun',`
voyage~морское или космическое путешествие~Ancient sailors set out on a perilous ocean voyage.~Древние моряки отправились в опасное морское плавание.~noun
guidebook~путеводитель для туристов~Read the pocket guidebook for local historic tips.~Читай карманный путеводитель ради полезных советов.~noun
sightseeing~осмотр достопримечательностей~Go on an open-top bus sightseeing tour of the city.~Отправься на экскурсию по достопримечательностям на открытом автобусе.~noun
backpack~туристический рюкзак~Pack essentials into a lightweight waterproof backpack.~Сложи необходимое в лёгкий непромокаемый рюкзак.~noun
excursion~организованная экскурсия~Join a guided walking excursion through the gorge.~Присоединяйся к пешей экскурсии с гидом по ущелью.~noun
currency exchange~пункт обмена валюты~Locate an authorized currency exchange at the airport.~Найди авторизованный пункт обмена валюты в аэропорту.~noun
embassy~посольство иностранного государства~Contact the national embassy if your passport is lost.~Свяжись с посольством, если твой паспорт утерян.~noun
customs~таможенный контроль~Declare dutiable purchases at the airport customs.~Декларируй подлежащие пошлине покупки на таможне.~noun
border~государственная граница~Present your valid passport when crossing the border.~Предъявите действующий паспорт при пересечении границы.~noun
explore~исследовать новые места~Wander narrow lanes to explore hidden urban cafes.~Броди по узким улочкам, исследуя скрытые городские кафе.~verb
adventure~захватывающее приключение~Hiking up an active volcano was an incredible adventure.~Подъём на действующий вулкан был невероятным приключением.~noun
tourist~турист; путешественник~Tourists admired the stained-glass cathedral windows.~Туристы восхищались витражными окнами собора.~noun
expedition~научная или исследовательская экспедиция~Scientists embarked on an Arctic wildlife expedition.~Учёные отправились в арктическую экспедицию по дикой природе.~noun
wander~бродить; бродить без цели~We spent the afternoon wandering along the canal.~Мы провели день, прогуливаясь вдоль водного канала.~verb
trekking~пеший поход по пересеченной местности~Mountain trekking requires sturdy waterproof boots.~Горный трекинг требует прочных непромокаемых ботинок.~noun
getaway~короткий отпуск; побег от рутины~Enjoy a peaceful weekend getaway in the countryside.~Насладись спокойной поездкой на выходные за город.~noun
globetrotter~заядлый путешественник~The seasoned globetrotter has visited eighty countries.~Опытный путешественник посетил восемьдесят стран.~noun
stopover~остановка в пути; промежуточная стоянка~Make a twenty-four-hour stopover in Doha.~Сделай суточную остановку в Дохе.~noun
host~принимающая сторона; хозяин~Our local hosts prepared a delightful welcoming feast.~Наши местные хозяева приготовили замечательное приветственное застолье.~noun
resort~курортное место; курорт~The seaside resort features heated saltwater pools.~Морской курорт оснащён бассейнами с подогреваемой морской водой.~noun`);
  add('topics','Airports and flights','noun',`
terminal~пассажирский терминал аэропорта~International flights depart from terminal three.~Международные рейсы отправляются из третьего терминала.~noun
takeoff~взлёт самолёта~Fasten all seatbelts securely before takeoff.~Надёжно пристегните все ремни безопасности перед взлётом.~noun
landing~посадка самолёта~The captain executed a smooth landing in the rain.~Командир выполнил мягкую посадку в условиях дождя.~noun
flight attendant~бортпроводник; стюардесса~The flight attendant demonstrated emergency safety gear.~Бортпроводник продемонстрировал аварийно-спасательное снаряжение.~noun
cockpit~кабина пилотов~Pilots monitor navigation instruments in the cockpit.~Пилоты следят за навигационными приборами в кабине.~noun
overhead locker~багажная полка над сиденьем~Stow your carry-on bag in the overhead locker.~Уберите ручную кладь на багажную полку над сиденьем.~noun
carry-on~ручная кладь~Ensure your carry-on luggage meets size regulations.~Убедитесь, что ваша ручная кладь соответствует габаритам.~noun
duty-free~магазин беспошлинной торговли~Buy perfume and local sweets in the duty-free shop.~Купи духи и местные сладости в магазине дьюти-фри.~noun
baggage claim~зона выдачи багажа~Wait beside carousel four at the baggage claim.~Ждите возле четвёртой ленты в зоне выдачи багажа.~noun
delay~задержка рейса; задерживать~A thunderstorm caused a two-hour flight delay.~Гроза вызвала двухчасовую задержку авиарейса.~noun
cancellation~отмена авиарейса~Passengers were rebooked after the sudden cancellation.~Пассажиров перерегистрировали после внезапной отмены рейса.~noun
turbulence~турбулентность в полете~Remain seated with seatbelts fastened during turbulence.~Оставайтесь на местах пристёгнутыми во время турбулентности.~noun
aisle seat~место у прохода в самолёте~He preferred an aisle seat for easy movement.~Он предпочёл место у прохода ради удобства передвижения.~noun
window seat~место у иллюминатора в самолёте~Children love looking at clouds from the window seat.~Дети любят смотреть на облака с места у иллюминатора.~noun
passport control~паспортный контроль на границе~Join the queue for international passport control.~Встаньте в очередь на международный паспортный контроль.~noun
security check~досмотр службы безопасности~Remove liquids and laptops before the security check.~Достаньте жидкости и ноутбуки перед досмотром безопасности.~noun
airsickness~воздушная болезнь; укачивание~Chewing ginger sweets helps prevent airsickness.~Жевательные имбирные конфеты помогают предотвратить укачивание.~noun
jet lag~синдром смены часовых поясов~Drink water and sleep well to minimize jet lag.~Пейте воду и хорошо спите, чтобы минимизировать смену поясов.~noun
tarmac~гудронное покрытие лётного поля~Passengers walked across the dry airport tarmac to the steps.~Пассажиры прошли по сухому полю аэродрома к трапу.~noun
air traffic control~авиадиспетчерская служба~Air traffic control authorized the airliner to land.~Авиадиспетчерская служба разрешила лайнеру посадку.~noun`);
  add('topics','Hotels and accommodation','noun',`
concierge~консьерж отеля~The helpful concierge booked opera tickets for us.~Предупредительный консьерж забронировал для нас билеты в оперу.~noun
housekeeping~служба уборки номеров~Housekeeping provided fresh white cotton towels.~Служба уборки предоставила свежие белые хлопковые полотенца.~noun
suite~номер-люкс из нескольких комнат~The executive corner suite overlooked the sea.~Угловой люкс выходил окнами на море.~noun
single room~одноместный гостиничный номер~Book a quiet single room facing the inner courtyard.~Забронируй тихий одноместный номер окнами во внутренний двор.~noun
double room~двухместный номер с большой кроватью~They requested a spacious double room with balcony.~Они попросили просторный двухместный номер с балконом.~noun
twin room~двухместный номер с двумя раздельными кроватями~The twin room had two comfortable beds.~В двухместном номере были две удобные кровати.~noun
room service~обслуживание номеров; доставка еды~Order hot breakfast porridge via room service.~Закажи горячую кашу на завтрак через доставку в номер.~noun
minibar~мини-бар в гостиничном номере~Chilled water bottles are stocked in the minibar.~Бутылки с охлаждённой водой есть в мини-баре.~noun
guesthouse~гостевой дом~A family-run alpine guesthouse served homemade bread.~В семейном альпийском гостевом доме подавали домашний хлеб.~noun
vacancy~свободный номер в гостинице~The illuminated neon hotel sign announced no vacancy.~Светящаяся неоновая вывеска отеля сообщала, что свободных мест нет.~noun
amenities~удобства и услуги в отеле~Complimentary spa access was among the top amenities.~Бесплатный спа-комплекс входил в число главных удобств.~noun
bellhop~коридорный; носильщик багажа~The polite bellhop carried the suitcases up.~Вежливый коридорный поднял чемоданы наверх.~noun
wake-up call~утренний звонок-будильник от портье~Request a wake-up call for six in the morning.~Закажи утренний звонок-будильник на шесть утра.~noun
cancellation policy~правила и условия отмены брони~Read the hotel cancellation policy prior to booking.~Ознакомьтесь с правилами отмены отеля перед бронированием.~noun
front desk~стойка администратора~Leave inquiries with the clerk at the front desk.~Оставьте вопросы дежурному администратору на стойке.~noun
motel~придорожный мотель для автотуристов~We pulled into a convenient roadside motel at dusk.~В сумерках мы заехали в удобный придорожный мотель.~noun
chalet~альпийское шале~The wooden ski chalet stood at the base of the mountain.~Деревянное лыжное шале стояло у подножия горы.~noun
inn~постоялый двор; деревенская гостиница~An ancient coaching inn offered home-cooked dinners.~Старинная деревенская гостиница предлагала домашние ужины.~noun
keycard~электронная карта-ключ от номера~Tap your RFID keycard on the door sensor.~Приложите электронную карту-ключ к дверному датчику.~noun`);
  add('topics','Nature and the environment','noun',`
wilderness~дикая природа~Hikers ventured deep into the mountain wilderness.~Туристы отправились вглубь горной дикой природы.~noun
biosphere~биосфера~The biosphere encompasses all living organisms on Earth.~Биосфера охватывает все живые организмы на Земле.~noun
wetland~водно-болотное угодье~Migratory birds feed in the protected wetland.~Перелётные птицы кормятся на охраняемых водно-болотных угодьях.~noun
canopy~полог леса; кроны деревьев~Sunlight filtered through the dense rainforest canopy.~Солнечный свет пробивался сквозь плотный полог тропического леса.~noun
tundra~тундра~Reindeer roam across the vast subarctic tundra.~Северные олени бродят по бескрайней субарктической тундре.~noun
savanna~саванна~Acacia trees dot the dry African savanna.~Акации усеивают сухую африканскую саванну.~noun
undergrowth~подлесок; густой кустарник~A rabbit darted into the thick undergrowth.~Кролик юркнул в густой подлесок.~noun
stream~ручей; поток~Clear cool water bubbled in the rocky stream.~Чистая прохладная вода журчала в каменистом ручье.~noun
meadow~луг; поляна~Wild poppies blossomed across the alpine meadow.~Дикие маки цвели на альпийском лугу.~noun
marsh~болото; топь~Reeds swayed gently in the coastal marsh.~Камыши мягко колыхались на прибрежном болоте.~noun
erosion~эрозия почвы~Tree planting prevents wind and water soil erosion.~Посадка деревьев предотвращает ветровую и водную эрозию почвы.~noun
reforestation~лесовосстановление~Volunteers joined a nationwide reforestation campaign.~Волонтёры присоединились к общенациональной кампании по лесовосстановлению.~noun
sustainability~экологическая устойчивость~Solar panels contribute to urban sustainability.~Солнечные батареи способствуют экологической устойчивости городов.~noun
compost~органический компост~Turn garden scraps into rich soil compost.~Превращай садовые отходы в плодородный компост.~noun
renewable~возобновляемый (источник энергии)~Wind and solar are clean renewable energy sources.~Ветер и солнце — чистые возобновляемые источники энергии.~adjective
wildlife~дикая природа; животный мир~National parks safeguard indigenous wildlife species.~Национальные парки защищают коренные виды дикой природы.~noun
carbon footprint~углеродный след~Riding a bicycle reduces your personal carbon footprint.~Езда на велосипеде уменьшает твой личный углеродный след.~noun
recycle~перерабатывать отходы~Recycle glass and aluminium cans diligently.~Тщательно сдавай на переработку стеклянные и алюминиевые банки.~verb`);
  add('topics','Weather and climate','noun',`
breeze~лёгкий ветерок; бриз~A gentle sea breeze cooled the afternoon heat.~Нежный морской бриз охладил полуденный зной.~noun
gale~штормовой ветер; буря~A fierce northern gale tore branches from trees.~Свирепый северный штормовой ветер срывал ветки с деревьев.~noun
blizzard~метель; снежная буря~Drivers sheltered during the whiteout blizzard.~Водители укрылись во время снежной бури.~noun
hail~град~Large hail battered the greenhouse glass panels.~Крупный град барабанил по стеклянным панелям теплицы.~noun
frost~мороз; иней~Delicate white frost coated the winter windowpanes.~Тонкий белый иней покрыл зимние оконные стёкла.~noun
drizzle~моросящий дождь~A chilly autumn drizzle fell without stopping.~Холодный осенний моросящий дождь шёл без остановки.~noun
sleet~дождь со снегом~Cold sleet made the stone pavements treacherous.~Холодный дождь со снегом сделал каменные тротуары скользкими.~noun
dew~утренняя роса~Glistening morning dew covered the spiderwebs.~Блестящая утренняя роса покрывала паутину.~noun
overcast~пасмурный; затянутый тучами~The grey overcast sky threatened afternoon showers.~Серое пасмурное небо предвещало дневные ливни.~adjective
humid~влажный (о воздухе)~Tropical rainforests have a hot and humid climate.~В тропических дождевых лесах жаркий и влажный климат.~adjective
forecast~прогноз погоды~Check the meteorological weather forecast before sailing.~Сверься с метеорологическим прогнозом погоды перед выходом в море.~noun
barometer~барометр~The falling barometer indicates an approaching depression.~Падающий барометр указывает на приближение циклона.~noun
tempest~буря; буйство стихии~The old oak stood resilient against the fierce tempest.~Старый дуб стойко держался против свирепой бури.~noun
monsoon~муссон; сезон дождей~Seasonal monsoon rains replenished the reservoirs.~Сезонные муссонные дожди наполнили водохранилища.~noun
heatwave~период аномальной жары~Stay indoors and hydrate during the summer heatwave.~Оставайтесь дома и пейте воду во время летней жары.~noun
chill~прохлада; озноб~A sharp evening chill swept across the desert.~Резкая вечерняя прохлада пронеслась по пустыне.~noun`);
  add('topics','Animals','noun',`
wolf~волк~The grey wolf howled at the full moon.~Серый волк завыл на полную луну.~noun
bear~медведь~The brown bear fished for salmon in the river.~Бурый медведь ловил лосося в реке.~noun
lion~лев~The male lion rested proudly in the shade.~Лев-самец гордо отдыхал в тени.~noun
tiger~тигр~The striped Bengal tiger moved silently through grass.~Полосатый бенгальский тигр бесшумно двигался по траве.~noun
elephant~слон~The matriarch elephant led the herd to water.~Слониха-вожак вела стадо к водопою.~noun
giraffe~жираф~A tall giraffe reached the top acacia leaves.~Высокий жираф достал до верхних листьев акации.~noun
zebra~зебра~Black and white zebras grazed beside antelopes.~Чёрно-белые зебры паслись рядом с антилопами.~noun
monkey~обезьяна~The agile monkey swung effortlessly between jungle vines.~Ловкая обезьяна легко раскачивалась на лианах джунглей.~noun
rabbit~кролик~A white rabbit nibbled on fresh dandelion leaves.~Белый кролик грыз свежие листья одуванчика.~noun
squirrel~белка~The red squirrel hid acorns under the roots.~Рыжая белка прятала жёлуди под корнями.~noun
badger~барсук~The nocturnal badger dug an extensive underground sett.~Ночной барсук вырыл просторную подземную нору.~noun
beaver~бобр~The industrious beaver constructed a sturdy river dam.~Трудолюбивый бобр построил прочную речную плотину.~noun
raccoon~енот~A curious raccoon explored the campsite at dusk.~Любопытный енот исследовал палаточный лагерь в сумерках.~noun
kangaroo~кенгуру~The mother kangaroo carried a joey in her pouch.~Мама-кенгуру несла детёныша в своей сумке.~noun
koala~коала~A drowsy koala munched fragrant eucalyptus leaves.~Сонная коала жевала ароматные листья эвкалипта.~noun
camel~верблюд~The desert camel stored reserves inside its humps.~Пустынный верблюд хранил запасы внутри своих горбов.~noun
llama~лама~Andean farmers domesticated the woolly white llama.~Андские фермеры одомашнили пушистую белую ламу.~noun
panda~панда~The giant panda chewed on tender green bamboo shoots.~Большая панда жевала нежные зелёные побеги бамбука.~noun`);
  add('topics','Plants','noun',`
bud~почка растения; бутон~Spring buds swelled on the fruit tree branches.~Весенние почки набухли на ветках плодовых деревьев.~noun
bark~кора дерева~Birch trees have papery silver-white bark.~У берёз берестяная серебристо-белая кора.~noun
branch~ветка; сук~A robin perched singing on the highest branch.~Малиновка сидела и пела на самой высокой ветке.~noun
thorn~шип; колючка~Wild roses protect their blossoms with sharp thorns.~Дикие розы защищают цветы острыми шипами.~noun
petal~лепесток цветка~Velvet rose petals drifted gently in the breeze.~Бархатные лепестки роз плавно кружились на ветру.~noun
pollen~пыльца растений~Bees collect golden flower pollen to nourish larvae.~Пчёлы собирают золотистую цветочную пыльцу для питания личинок.~noun
twig~тонкая веточка; прутик~Birds gather small dried twigs to weave nests.~Птицы собирают маленькие сухие прутики, чтобы вить гнёзда.~noun
sap~древесный сок~Sweet maple sap flows abundantly in early spring.~Сладкий кленовый сок обильно течёт ранней весной.~noun
trunk~ствол дерева~The ancient cedar has a massive hollow trunk.~У древнего кедра массивный дуплистый ствол.~noun
foliage~листва; зелень~Autumn transforms mountain foliage into brilliant amber.~Осень окрашивает горную листву в яркий янтарный цвет.~noun
nectar~цветочный нектар~Hummingbirds sip sweet nectar from tropical blooms.~Колибри пьют сладкий нектар из тропических цветов.~noun
ivy~плющ (вьющееся растение)~Dark green ivy climbed up the old stone abbey.~Тёмно-зелёный плющ карабкался по старому каменному аббатству.~noun
reed~тростник; камыш~Tall river reeds shielded the nesting water birds.~Высокий речной тростник укрывал гнездящихся водоплавающих птиц.~noun
shrub~кустарник; куст~Prune the flowering garden shrubs in late autumn.~Подрезай цветущие садовые кустарники поздней осенью.~noun
herbaceous~травянистый~Perennial herbaceous plants die back in winter.~Многолетние травянистые растения отмирают на зиму.~adjective
clover~клевер~Search the lawn for a rare four-leaf clover.~Ищи на газоне редкий четырёхлистный клевер.~noun
lichen~лишайник~Hardy grey lichen covers the exposed granite rock.~Выносливый серый лишайник покрывает обнажённую гранитную скалу.~noun
photosynthesis~фотосинтез~Green chlorophyll drives the vital process of photosynthesis.~Зелёный хлорофилл запускает жизненный процесс фотосинтеза.~noun
seedpod~семенная коробочка; стручок~The dry seedpod burst open to scatter seeds.~Сухой стручок лопнул, чтобы рассеять семена.~noun`);
  add('topics','Sport and exercise','noun',`
football~футбол~Children kicked a leather football in the park.~Дети пинали кожаный футбольный мяч в парке.~noun
basketball~баскетбол~He sank a three-pointer in the final basketball match.~Он забросил трёхочковый в финальном баскетбольном матче.~noun
tennis~большой теннис~Play doubles tennis on the outdoor red clay court.~Сыграйте в парный теннис на открытом грунтовом корте.~noun
volleyball~волейбол~Beach volleyball is played barefoot on sandy courts.~В пляжный волейбол играют босиком на песчаных площадках.~noun
skiing~лыжный спорт; катание на лыжах~Cross-country skiing builds incredible cardiovascular stamina.~Беговые лыжи развивают невероятную выносливость сердца.~noun
skating~катание на коньках; скейтбординг~Figure skating combines athletic jumps with musical artistry.~Фигурное катание сочетает прыжки с музыкальным артистизмом.~noun
boxing~бокс~The fighter trained in the boxing gym every morning.~Боец тренировался в боксёрском зале каждое утро.~noun
judo~дзюдо~Martial artists practice defensive throws in judo.~Мастера боевых искусств отрабатывают защитные броски в дзюдо.~noun
gymnastics~спортивная гимнастика~The gymnast performed a flawless balance beam routine.~Гимнастка выполнила безупречное упражнение на бревне.~noun
athletics~лёгкая атлетика~Track and field athletics events drew large crowds.~Легкоатлетические соревнования привлекли множество зрителей.~noun
marathon~марафонский забег~Thousands of runners completed the annual city marathon.~Тысячи бегунов завершили ежегодный городской марафон.~noun
champion~чемпион~The defending champion hoisted the gold trophy.~Действующий чемпион поднял золотой кубок.~noun
trophy~кубок; победный приз~The engraved silver trophy was presented at banquet.~Гравированный серебряный кубок был вручён на банкете.~noun
medal~спортивная медаль~She earned a bronze medal in the hurdle sprint.~Она завоевала бронзовую медаль в беге с барьерами.~noun
stadium~спортивный стадион~Sixty thousand cheering spectators filled the grand stadium.~Шестьдесят тысяч ликующих зрителей заполнили большой стадион.~noun
coach~спортивный тренер~The head coach devised a brilliant tactical plan.~Главный тренер разработал блестящий тактический план.~noun
goalkeeper~вратарь; голкипер~The agile goalkeeper blocked the penalty kick diving.~Ловкий вратарь в прыжке парировал пенальти.~noun`);
  add('topics','Hobbies and free time','noun',`
painting~живопись; рисование красками~Watercolour landscape painting is a calming creative hobby.~Пейзажная живопись акварелью — успокаивающее хобби.~noun
drawing~рисование карандашом; графика~He practices charcoal drawing in his sketchbook daily.~Он ежедневно практикует рисунок углём в скетчбуке.~noun
photography~фотография; фотоискусство~Macro nature photography reveals tiny insect details.~Макрофотография дикой природы раскрывает крошечные детали насекомых.~noun
baking~домашняя выпечка~Sourdough bread baking requires patience and skill.~Выпечка хлеба на закваске требует терпения и навыка.~noun
camping~кемпинг; отдых в палатках~Summer weekend camping under the stars refreshes minds.~Летний кемпинг под звёздами освежает разум.~noun
birdwatching~наблюдение за птицами~Equip yourself with binoculars for riverside birdwatching.~Вооружись биноклем для наблюдения за птицами у реки.~noun
astronomy~любительская астрономия~Amateur astronomy involves observing planetary moons.~Любительская астрономия включает наблюдение за спутниками планет.~noun
board game~настольная игра с друзьями~Playing a strategy board game kept us entertained.~Игра в стратегическую настолку развлекала нас весь вечер.~noun
sewing~шитьё; кройка~Sewing customized linen garments is deeply rewarding.~Пошив льняной одежды своими руками приносит большое удовлетворение.~noun
quilting~лоскутное шитьё; квилтинг~She assembled a geometric patchwork quilting blanket.~Она собрала лоскутное одеяло с геометрическим узором.~noun
embroidery~ручная вышивка~Intricate silk embroidery adorned the velvet cushion.~Замысловатая вышивка шёлком украшала бархатную подушку.~noun
collecting~коллекционирование предметов~Numismatic coin collecting teaches fascinating world history.~Коллекционирование монет знакомит с увлекательной историей мира.~noun
calligraphy~искусство каллиграфии~Practicing Japanese brush calligraphy hones steady focus.~Занятия японской каллиграфией кистью оттачивают концентрацию.~noun
juggling~жонглирование предметами~Learning three-ball juggling improves motor coordination.~Обучение жонглированию тремя мячами развивает координацию.~noun
model building~стендовый моделизм; сборка моделей~Model building of historic wooden ships takes months.~Сборка деревянных моделей исторических кораблей занимает месяцы.~noun`);
  add('topics','Music, films and books','noun',`
melody~мелодия; напев~A haunting flute melody echoed through the hall.~Завораживающая мелодия флейты разносилась по залу.~noun
harmony~гармония в музыке~Choral singers blended voices in four-part harmony.~Хоровые певцы объединили голоса в четырёхголосной гармонии.~noun
rhythm~ритм произведения~Afro-Cuban percussion rhythm drives the festive dance.~Афро-кубинский ритм ударных ведёт праздничный танец.~noun
tempo~темп исполнения~The classical conductor increased the symphonic tempo.~Классический дирижёр ускорил симфонический темп.~noun
orchestra~симфонический оркестр~Eighty musicians perform together in the philharmonic orchestra.~Восемьдесят музыкантов выступают вместе в филармоническом оркестре.~noun
performer~исполнитель; артист~The solo cello performer received a standing ovation.~Сольный виолончелист удостоился аплодисментов стоя.~noun
screenplay~сценарий кинофильма~The acclaimed screenplay won an international academy award.~Признанный сценарий получил международную кинопремию.~noun
scene~сцена; эпизод фильма~The dramatic climax scene was filmed on location.~Драматическая сцена кульминации снималась на натуре.~noun
actor~киноактёр; исполнитель роли~The versatile lead actor portrayed three distinct roles.~Разносторонний главный актёр сыграл три разные роли.~noun
actress~киноактриса~The talented actress won critical acclaim for her debut.~Талантливая актриса получила признание критиков за свой дебют.~noun
genre~жанр искусства~Historical fiction is my favorite literary genre.~Историческая беллетристика — мой любимый литературный жанр.~noun
narrative~повествование; сюжетная линия~The gripping suspense narrative held readers spellbound.~Захватывающее повествование держало читателей в напряжении.~noun
prose~художественная проза~Poetic descriptive prose paints vivid emotional pictures.~Поэтичная описательная проза рисует яркие эмоциональные картины.~noun
stanza~строфа стихотворения~The four-line rhymed stanza concluded the elegy.~Четырёхстрочная рифмованная строфа завершила элегию.~noun
manuscript~авторская рукопись~Scholars deciphered an ancient parchment illuminated manuscript.~Учёные расшифровали древнюю иллюминированную рукопись.~noun
bestseller~книжный бестселлер~The paperback mystery became an instant international bestseller.~Детектив в мягкой обложке мгновенно стал мировым бестселлером.~noun`);
  add('topics','Celebrations and events','noun',`
ceremony~торжественная церемония~The university graduation ceremony began with fanfares.~Церемония вручения университетских дипломов началась с фанфар.~noun
toast~застольный тост~The best man proposed a heartfelt toast.~Шафер произнёс искренний застольный тост.~noun
feast~праздничное застолье; пир~Families gathered around a lavish harvest feast.~Семьи собрались вокруг обильного праздничного застолья.~noun
banquet~официальный банкет~A diplomatic formal banquet took place in the palace.~Дипломатический официальный банкет состоялся во дворце.~noun
decoration~праздничное украшение~Hang glittering paper decorations across the dining room.~Развесь сверкающие бумажные украшения по столовой.~noun
balloon~воздушный шарик~Bright helium balloons floated toward the ceiling.~Яркие гелиевые шары взмыли к потолку.~noun
confetti~праздничное конфетти~Showers of metallic confetti poured over the champions.~Каскады металлического конфетти осыпали чемпионов.~noun
gift~подарок; презент~Wrap the thoughtful birthday gift in colorful paper.~Заверни памятный подарок на день рождения в цветную бумагу.~noun
ribbon~подарочная лента~Tie a satin crimson ribbon around the package.~Повяжи атласную алую ленту вокруг посылки.~noun
host~хозяин праздника~The gracious dinner host greeted everyone warmly.~Приветливый хозяин ужина тепло встретил каждого гостя.~noun
hostess~хозяйка праздника~The smiling party hostess introduced the guest speakers.~Улыбчивая хозяйка вечера представила приглашённых гостей.~noun
carnival~красочный карнавал~Dancers in feathered costumes paraded at the carnival.~Танцоры в костюмах из перьев шествовали на карнавале.~noun
masquerade~костюмированный бал-маскарад~Guests concealed their identities at the grand masquerade.~Гости скрывали свои лица на грандиозном маскараде.~noun
jubilee~золотой или серебряный юбилей~The historic school marked its golden founding jubilee.~Историческая школа отметила свой золотой юбилей основания.~noun
gathering~дружеская встреча; сходка~An informal evening gathering brought neighbours together.~Неформальная вечерняя встреча объединила соседей.~noun
party~вечеринка; приём~Throw a surprise housewarming party for new arrivals.~Устрой вечеринку-сюрприз в честь новоселья для новосёлов.~noun
candle~свеча на праздничном торте~Blow out all scented candles with one wish.~Задуй все ароматические свечи с одним желанием.~noun
present~подарок к празднику~Children opened their wrapped holiday presents excitedly.~Дети с волнением распаковывали праздничные подарки.~noun
costume party~костюмированная вечеринка~Dress up as historic detectives for the costume party.~Оденьтесь историческими детективами на костюмированную вечеринку.~noun
congratulate~поздравлять с достижением~Colleagues gathered to congratulate him on promotion.~Коллеги собрались поздравить его с повышением.~verb`);
  add('topics','Phones, internet and technology','noun',`
smartphone~смартфон~Modern smartphones feature high-resolution dual cameras.~Современные смартфоны оснащены двойными камерами высокого разрешения.~noun
tablet~планшетный компьютер~Artists sketch digital illustrations on a graphic tablet.~Художники рисуют цифровые иллюстрации на планшете.~noun
laptop~портативный ноутбук~Work remotely from cafes using a lightweight laptop.~Работай удалённо из кафе с помощью лёгкого ноутбука.~noun
headphones~наушники~Noise-cancelling wireless headphones block office background chatter.~Беспроводные наушники с шумоподавлением заглушают офисный шум.~noun
earphones~вкладыши; наушники-вкладыши~Compact in-ear earphones fit comfortably into pockets.~Компактные наушники-вкладыши легко помещаются в кармане.~noun
router~вай-фай роутер; маршрутизатор~Reboot the wireless broadband router to restore speed.~Перезагрузи беспроводной роутер, чтобы восстановить скорость.~noun
cable~соединительный кабель; провод~Connect the external monitor via an HDMI cable.~Подключи внешний монитор через кабель HDMI.~noun
plug~электрическая вилка; штекер~Insert the three-pin electrical plug into the socket.~Вставь трёхконтактную электрическую вилку в розетку.~noun
socket~электрическая розетка~Keep the wall power socket clean and dry.~Держи настенную розетку чистой и сухой.~noun
website~интернет-сайт; веб-ресурс~Bookmark the educational grammar reference website.~Добавь в закладки образовательный сайт по грамматике.~noun
download~скачивать файл из сети~Download the PDF instruction manual onto your laptop.~Скачай инструкцию в формате PDF на свой ноутбук.~verb
upload~загружать файл в сеть~Upload high-resolution photography to cloud folders.~Загружай фотографии высокого разрешения в облачные папки.~verb
application~компьютерное приложение; программа~Install the language learning mobile application.~Установи мобильное приложение для изучения языков.~noun
device~электронное устройство; гаджет~Sync data seamlessly across every registered mobile device.~Синхронизируй данные без задержек на всех устройствах.~noun
update~обновление системы; обновлять~Install the latest operating system security update.~Установи последнее обновление безопасности операционной системы.~noun
software~программное обеспечение; софт~Open-source software empowers collaborative engineering projects.~Свободное программное обеспечение помогает инженерным проектам.~noun
hardware~аппаратная часть; железо~Upgrade computer hardware with additional solid-state storage.~Модернизируй аппаратную часть компьютера быстрым накопителем.~noun
wireless~беспроводной~Wireless charging pads eliminate tangled desk cords.~Беспроводные зарядные панели избавляют от спутанных проводов.~adjective`);
  add('topics','Messages and social media','noun',`
chat~онлайн-чат; переписка~Create a group chat to coordinate weekend hikes.~Создай групповой чат для координации походов на выходных.~noun
text message~текстовое сообщение~Send a brief text message confirming the arrival.~Отправь короткое текстовое сообщение с подтверждением приезда.~noun
post~публикация в соцсети; пост~Share an insightful blog post about language tips.~Поделись полезной публикацией о советах по изучению языков.~noun
share~делиться ссылкой или записью~Share memorable vacation photographs with family members.~Делись памятными фотографиями из отпуска с членами семьи.~verb
tag~отмечать пользователя в публикации~Tag your travel companions in the group portrait.~Отметь своих спутников по поездке на групповом портрете.~verb
status~статус профиля в сети~Update your availability status to away during lunch.~Поменяй статус доступности на отошёл во время обеда.~noun
feed~новостная лента в соцсетях~Scroll through your social media feed for updates.~Пролистай новостную ленту в соцсетях ради свежих обновлений.~noun
trending~популярный; находящийся в тренде~Read the trending topics in modern science journalism.~Читай популярные темы в современной научной журналистике.~adjective
hashtag~хэштег для поиска тем~Add relevant keywords with a descriptive hashtag.~Добавь подходящие ключевые слова с описательным хэштегом.~noun
subscriber~подписчик канала или рассылки~The weekly newsletter reached fifty thousand subscribers.~Еженедельный вестник набрал пятьдесят тысяч подписчиков.~noun
channel~информационный канал~Subscribe to the educational video streaming channel.~Подпишись на образовательный канал с видеоматериалами.~noun
block~блокировать нежелательный контакт~Block spam accounts to keep your inbox organized.~Блокируй спам-аккаунты, чтобы держать почту в порядке.~verb
mute~отключать уведомления контакта~Mute noisy group conversations while studying quietly.~Отключай уведомления шумных групп во время спокойной учёбы.~verb
emoji~эмодзи; смайлик в сообщении~Add a friendly smiling emoji to soften critique.~Добавь дружелюбный смайлик, чтобы смягчить критику.~noun
avatar~аватар; фотография пользователя~Upload a professional clear headshot as your avatar.~Загрузи чёткий профессиональный снимок в качестве аватара.~noun
stream~прямой эфир; онлайн-трансляция~Join the interactive live stream to ask questions.~Подключись к прямому эфиру, чтобы задавать вопросы.~noun
bio~краткая биография в профиле~Write a concise professional bio highlighting key skills.~Напиши краткое описание в профиле с перечислением навыков.~noun`);
  add('topics','News and information','noun',`
bulletin~информационный бюллетень; сводка~Listen to the evening radio news bulletin.~Послушай вечернюю сводку новостей по радио.~noun
article~публицистическая статья~Read a thoughtful analytical article on renewable power.~Прочитай аналитическую статью о возобновляемой энергии.~noun
column~авторская колонка в газете~The economist writes a weekly financial column.~Экономист ведёт еженедельную финансовую колонку.~noun
editorial~редакционная статья~The newspaper editorial addressed pressing urban transport.~Редакционная статья газеты затронула тему городского транспорта.~noun
correspondent~специальный корреспондент~The foreign correspondent reported live from Brussels.~Специальный корреспондент вёл прямой репортаж из Брюсселя.~noun
press~печать; средства массовой информации~Diplomats held a formal conference for international press.~Дипломаты провели официальную конференцию для международной прессы.~noun
coverage~освещение событий в СМИ~Media coverage of the solar eclipse was extensive.~Освещение солнечного затмения в СМИ было обширным.~noun
reportage~репортаж с места событий~The photojournalist produced moving visual reportage.~Фотожурналист подготовил трогательный визуальный репортаж.~noun
bulletin board~доска объявлений~Community notices are pinned to the public bulletin board.~Объявления сообщества прикреплены к доске объявлений.~noun
chronicle~хроника событий~A local historical chronicle documented centuries of heritage.~Местная историческая хроника задокументировала века наследия.~noun
gazette~официальная газета; вестник~Appointments were published in the government gazette.~Назначения были опубликованы в правительственном вестнике.~noun
anchor~ведущий телевизионных новостей~The seasoned news anchor delivered breaking evening updates.~Опытный телеведущий передал экстренные вечерние новости.~noun
investigation~журналистское расследование~An investigative piece revealed environmental violations.~Журналистское расследование вскрыло экологические нарушения.~noun
misinformation~дезинформация; ложные сведения~Fact-checking tools combat online digital misinformation.~Инструменты проверки фактов борются с цифровой дезинформацией.~noun
current affairs~текущие общественно-политические события~Listen to weekly podcasts discussing global current affairs.~Слушай еженедельные подкасты, обсуждающие текущие мировые события.~noun
scoop~сенсационная новость; сенсация~The young reporter landed a nationwide investigative scoop.~Молодой репортёр добыл общенациональную сенсацию.~noun
circulate~распространять; циркулировать~Reliable vetted reports circulate quickly among scholars.~Проверенные отчёты быстро распространяются среди учёных.~verb`);
  add('topics','Politeness and everyday communication','interjection',`
pardon~прошу прощения; помилование~Pardon me, did you drop this glove?~Прошу прощения, это вы уронили перчатку?~interjection
gratitude~искренняя благодарность~We express heartfelt gratitude for your generous support.~Мы выражаем искреннюю благодарность за вашу поддержку.~noun
compliment~комплимент; похвала~Pay a gracious compliment to acknowledge good effort.~Сделай приятный комплимент, чтобы отметить старание.~noun
courtesy~вежливость; любезность~Treat every customer with genuine dignity and courtesy.~Относись к каждому клиенту с уважением и вежливостью.~noun
apologize~приносить извинения~He stepped forward to apologize sincerely for delay.~Он вышел вперёд, чтобы искренне извиниться за задержку.~verb
regret~сожалеть; раскаиваться~I deeply regret the misunderstanding between colleagues.~Я глубоко сожалею о возникшем недопонимании между коллегами.~verb
cheers~ваше здоровье; спасибо в разговорной речи~Cheers for helping me carry the heavy box.~Спасибо за то, что помог мне донести тяжёлую коробку.~interjection
farewell~прощание; напутствие~They exchanged fond farewells before boarding the train.~Они тепло попрощались перед посадкой в поезд.~noun
kind regards~с наилучшими пожеланиями~End your professional correspondence with kind regards.~Завершайте деловую переписку фразой с наилучшими пожеланиями.~phrase
my pleasure~не за что; мне было только в радость~It was my pleasure to show you around.~Мне было только в радость показать вам город.~phrase
respectful~почтительный; уважительный~Listen to elder speakers in a quiet respectful manner.~Слушай старших собеседников с уважением и вниманием.~adjective
diplomatic~дипломатичный; тактичный~Choose diplomatic words when negotiating complex terms.~Выбирай тактичные слова при согласовании сложных условий.~adjective
cordial~сердечный; радушный~Guests received a cordial welcome upon arrival.~Гости встретили радушный приём по прибытии.~adjective
tactful~тактичный; деликатный~A tactful reminder avoids causing personal offense.~Тактичное напоминание помогает избежать обид.~adjective
amenable~покладистый; сговорчивый~Both neighbors were amenable to a fair compromise.~Оба соседа были открыты к справедливому компромиссу.~adjective
gentle~мягкий; деликатный~A gentle tone calms upset frightened children.~Мягкий тон успокаивает расстроенных напуганных детей.~adjective`);
  add('topics','Requests, offers and invitations','verb',`
wonder~интересоваться; размышлять~I wonder if you could review my draft.~Мне интересно, не могли бы вы взглянуть на мой черновик.~verb
favour~одолжение; услуга~Could you do me a small personal favour?~Не могли бы вы оказать мне небольшую услугу?~noun
assistance~помощь; содействие~We gladly offer assistance to elderly passengers.~Мы с радостью предлагаем помощь пожилым пассажирам.~noun
participate~участвовать; принимать участие~We warmly invite you to participate in dialogue.~Мы тепло приглашаем вас принять участие в диалоге.~verb
attend~посещать мероприятие; присутствовать~Please confirm whether you can attend the banquet.~Пожалуйста, подтвердите, сможете ли вы присутствовать на банкете.~verb
propose~предлагать идею или план~I propose that we schedule an online session.~Я предлагаю запланировать онлайн-сессию.~verb
suggest~предлагать; советовать~Can you suggest an authentic local seafood bistro?~Можете посоветовать настоящее местное рыбное бистро?~verb
recommend~рекомендовать; советовать~Librarians recommend reading historical accounts.~Библиотекари рекомендуют читать исторические хроники.~verb
decline~вежливо отклонять приглашение~He had to decline the dinner due to work.~Ему пришлось вежливо отклонить ужин из-за работы.~verb
accept~принимать предложение~We gratefully accept your generous hospitality.~Мы с благодарностью принимаем ваше щедрое гостеприимство.~verb
pleasure~удовольствие; честь~It would be our pleasure to host your family.~Для нас было бы честью принять вашу семью в гостях.~noun
mind~возражать; иметь что-то против~Would you mind opening the side window slightly?~Вы не возражаете, если я слегка приоткрою окно?~verb
available~свободный; доступный по времени~Are you available for coffee tomorrow afternoon?~Вы свободны для кофе завтра во второй половине дня?~adjective
convenient~удобный; подходящий по времени~Choose whatever meeting hour is convenient for you.~Выбирайте любое время встречи, которое вам удобно.~adjective
hospitality~гостеприимство; радушие~Thank you for your warmth and superb hospitality.~Спасибо за вашу сердечность и великолепное гостеприимство.~noun
rsvp~просьба ответить на приглашение~Please RSVP before next Friday for catering.~Пожалуйста, ответьте на приглашение до пятницы.~verb`);
  add('topics','Opinions, agreement and disagreement','verb',`
believe~полагать; верить~I firmly believe that education transforms society.~Я твёрдо верю, что образование меняет общество.~verb
consider~считать; рассматривать~Many critics consider this novel a masterpiece.~Многие критики считают этот роман шедевром.~verb
viewpoint~точка зрения; взгляд~Explain the historical debate from another viewpoint.~Объясни исторический спор с другой точки зрения.~noun
perspective~перспектива; угол зрения~Traveling abroad broadens your cultural perspective.~Путешествия за границу расширяют твой кругозор.~noun
standpoint~позиция; точка зрения~From a scientific standpoint, the data is valid.~С научной точки зрения эти данные достоверны.~noun
concur~соглашаться; сходиться во мнениях~All board members concur with the proposed budget.~Все члены правления согласны с предложенным бюджетом.~verb
dispute~оспаривать; вести спор~Scholars dispute the exact dating of the tablet.~Учёные оспаривают точную датировку этой таблички.~verb
convince~убеждать в правоте~Solid empirical evidence convinced the committee.~Надёжные эмпирические доказательства убедили комитет.~verb
persuade~склонять к мнению; уговаривать~He managed to persuade colleagues to change course.~Ему удалось убедить коллег изменить курс.~verb
doubt~сомнение; сомневаться~I have serious doubts about the project feasibility.~У меня серьёзные сомнения в осуществимости проекта.~noun
object~возражать против чего-либо~Residents object to building a highway nearby.~Жители возражают против строительства трассы рядом.~verb
support~поддерживать аргумент или позицию~The statistical chart supports our central thesis.~Статистический график подтверждает наш главный тезис.~verb
oppose~выступать против; противиться~Environmental groups oppose offshore oil drilling.~Экологические группы выступают против бурения на шельфе.~verb
valid~веский; обоснованный (довод)~You make a very valid and thoughtful point.~Ты приводишь очень веский и продуманный довод.~adjective
flawed~ошибочный; имеющий изъяны~The calculation is fundamentally flawed from step one.~Расчёт изначально ошибочен с первого же шага.~adjective
unbiased~беспристрастный; объективный~Judges must deliver an unbiased and fair verdict.~Судьи должны выносить беспристрастный и честный вердикт.~adjective
consensus~общее согласие; консенсус~The committee finally reached a unanimous consensus.~Комитет наконец пришёл к единогласному согласию.~noun`);
  add('topics','Wishes, plans and decisions','verb',`
aim~стремиться к цели; цель~We aim to finish building the library by autumn.~Мы стремимся завершить строительство библиотеки к осени.~verb
target~целевой показатель; мишень~Set a realistic target for daily vocabulary study.~Поставь реалистичную цель для ежедневной учёбы.~noun
goal~жизненная цель; ориентир~Becoming fluent in English is my foremost goal.~Свободно заговорить по-английски — моя главная цель.~noun
ambition~честолюбивое стремление; амбиция~His lifelong ambition was conducting an orchestra.~Его давней мечтой было дирижировать оркестром.~noun
determination~решимость; целеустремленность~Patience and determination overcome every hardship.~Терпение и решимость преодолевают любые трудности.~noun
resolve~твердо решать; твердое намерение~She resolved to wake up early and exercise.~Она твёрдо решила просыпаться рано и тренироваться.~verb
aspire~стремиться к высокому~Young scientists aspire to make discoveries.~Молодые учёные стремятся делать открытия.~verb
dream~мечтать; заветная мечта~Children dream of exploring deep starry space.~Дети мечтают исследовать далёкий звёздный космос.~verb
prioritize~расставлять приоритеты~Prioritize urgent tasks over minor errands.~Отдавай приоритет срочным задачам перед мелкими делами.~verb
scheme~продуманная схема; план действий~Engineers designed a novel water recycling scheme.~Инженеры разработали новую схему очистки воды.~noun
strategy~стратегия; общий план~Formulate a coherent long-term business strategy.~Сформулируй последовательную долгосрочную стратегию.~noun
opt~делать выбор в пользу чего-либо~Consumers often opt for energy-efficient appliances.~Покупатели часто выбирают энергоэффективную технику.~verb
commit~брать на себя обязательство~Commit to daily reading for thirty minutes.~Возьми обязательство читать по тридцать минут каждый день.~verb
intention~намерение; замысел~It was never our intention to cause disruption.~У нас никогда не было намерения создавать помехи.~noun
destiny~судьба; предназначение~He felt that teaching children was his destiny.~Он чувствовал, что учить детей — его предназначение.~noun`);
  add('topics','Problems and solutions','noun',`
dilemma~дилемма; затруднительный выбор~The board faced a difficult financial dilemma.~Совет столкнулся с трудной финансовой дилеммой.~noun
crisis~острый кризис~Effective leadership calms panic during a crisis.~Эффективное руководство успокаивает панику в кризис.~noun
trouble~неприятность; затруднение~Call for roadside service if your car gives trouble.~Звони в автопомощь, если машина доставляет неприятности.~noun
setback~неудача; задержка в развитии~Treat a temporary setback as a learning opportunity.~Относись к временной неудаче как к возможности для учёбы.~noun
hazard~источник опасности; угроза~Icy pavements pose a serious hazard to walkers.~Обледеневшие тротуары представляют опасность для пешеходов.~noun
remedy~средство решения проблемы~Proper sleep is the best remedy for exhaustion.~Полноценный сон — лучшее средство от переутомления.~noun
resolve~разрешать спор или проблему~Diplomats met to resolve the border dispute peacefully.~Дипломаты встретились, чтобы разрешить пограничный спор мирно.~verb
fix~исправлять поломку или ошибку~A software engineer will fix the login glitch.~Программист исправит сбой входа в систему.~verb
overcome~преодолевать препятствия~Work together to overcome difficult challenges.~Работайте вместе, чтобы преодолевать трудные испытания.~verb
prevent~предотвращать нежелательное~Proper maintenance will prevent costly repairs.~Правильное обслуживание предотвратит дорогостоящий ремонт.~verb
repair~чинить; ремонтировать~Repair the leaking roof before winter sets in.~Почини протекающую крышу до наступления зимы.~verb
tackle~энергично браться за решение~City authorities must tackle urban air pollution.~Городские власти должны энергично взяться за очистку воздуха.~verb
coping~совладание со стрессом~Mindfulness meditation is an effective coping technique.~Медитация — эффективная техника совладания со стрессом.~noun
breakthrough~научный или практический прорыв~Physicists achieved a major fusion breakthrough.~Физики совершили крупный прорыв в термоядерном синтезе.~noun
countermeasure~ответная мера противодействия~Implement strict cybersecurity countermeasures.~Внедряйте строгие меры противодействия киберугрозам.~noun`);
  add('topics','Safety and emergencies','noun',`
hazard~опасный фактор~Wet slippery steps present a tripping hazard.~Мокрые скользкие ступени представляют опасность падения.~noun
rescue~спасение; спасательная операция~Mountain volunteers mounted an alpine night rescue.~Горные волонтёры организовали ночную спасательную операцию.~noun
drill~учебная тренировка по безопасности~The entire school participated in a fire drill.~Вся школа участвовала в противопожарной тренировке.~noun
fire extinguisher~огнетушитель~Every floor has a certified red fire extinguisher.~На каждом этаже есть сертифицированный красный огнетушитель.~noun
alarm~сигнал тревоги; сирена~The smoke alarm sounded throughout the hallway.~Детектор дыма подал сигнал тревоги на весь коридор.~noun
detector~детектор; датчик утечки~Install a carbon monoxide detector in the basement.~Установи датчик угарного газа в подвале.~noun
caution~осторожность; предостережение~Exercise extreme caution when crossing the icy creek.~Проявляй предельную осторожность при переходе ручья.~noun
precaution~мера предосторожности~Wearing heavy boots is a sensible safety precaution.~Носить прочные ботинки — разумная мера предосторожности.~noun
siren~сирена спецслужб~An emergency siren echoed through empty streets.~Сирена экстренных служб разнеслась по пустым улицам.~noun
lifeguard~спасатель на воде~The certified lifeguard watched swimmers attentively.~Дипломированный спасатель внимательно наблюдал за пловцами.~noun
evacuate~эвакуировать людей~Evacuate the flooded river valley without delay.~Эвакуируйте затопленную долину реки без промедления.~verb
extinguish~тушить пламя~Firefighters used water foam to extinguish the fire.~Пожарные использовали пену, чтобы потушить огонь.~verb
flashlight~карманный фонарик~Keep a rechargeable flashlight in the nightstand.~Держи аккумуляторный фонарик в прикроватной тумбочке.~noun
whistle~сигнальный свисток~Blow the emergency plastic whistle to attract attention.~Подуй в сигнальный свисток, чтобы привлечь внимание.~noun
defibrillator~автоматический дефибриллятор~Public stations have automated external defibrillators.~На вокзалах есть автоматические наружные дефибрилляторы.~noun
survival~выживание в суровых условиях~Water purification tablets are key for wilderness survival.~Таблетки для обеззараживания воды важны для выживания.~noun
safety belt~пояс безопасности; страховка~Climbers secure themselves with a safety belt.~Альпинисты закрепляют себя страховочным поясом.~noun
first responder~сотрудник экстренной службы~First responders administered oxygen to survivors.~Сотрудники экстренных служб подали кислород пострадавшим.~noun`);
  add('topics','Services and everyday errands','noun',`
courier~курьер по доставке~The bicycle courier delivered urgent legal deeds.~Велокурьер доставил срочные юридические документы.~noun
dry cleaner~химчистка одежды~Take the tailored wool suit to the dry cleaner.~Отнеси шерстяный костюм в химчистку.~noun
barbershop~парикмахерская для мужчин; барбершоп~He gets his beard trimmed at the local barbershop.~Он подравнивает бороду в местном барбершопе.~noun
hairdresser~парикмахер-стилист~The skilled hairdresser washed and styled her hair.~Умелый парикмахер вымыл и уложил её волосы.~noun
shoemaker~сапожник; мастер по ремонту обуви~A skilled shoemaker replaced worn leather soles.~Умелый сапожник заменил изношенные кожаные подошвы.~noun
locksmith~слесарь по замкам; замочный мастер~Call an emergency locksmith if keys are locked inside.~Вызывай слесаря, если ключи захлопнулись внутри.~noun
tailor~портной по пошиву и подгонке~The master tailor altered the jacket sleeves.~Мастер-портной укоротил рукава пиджака.~noun
notary~государственный нотариус~The notary public certified copies of the contracts.~Нотариус заверил копии контрактов.~noun
optician~оптик; специалист по зрению~The optician checked my vision and fitted glasses.~Оптик проверил моё зрение и подобрал очки.~noun
mechanic~автомеханик сервиса~The licensed garage mechanic inspected car steering.~Автомеханик сервиса проверил рулевое управление машины.~noun
clerk~делопроизводитель; клерк~The polite postal clerk weighed the parcels.~Вежливый почтовый служащий взвесил посылки.~noun
errand~хозяйственное поручение~Running morning errands took two brisk hours.~Выполнение утренних поручений заняло два часа.~noun
inquiry~справочный запрос~Direct your billing inquiry to customer service.~Направь запрос по счетам в отдел обслуживания клиентов.~noun
tracking number~трек-номер отправления~Track delivery progress with the assigned tracking number.~Отслеживай доставку по присвоенному трек-номеру.~noun
postcode~почтовый индекс~Write the recipient postcode clearly on the parcel.~Чётко напиши почтовый индекс получателя на посылке.~noun`);
  add('topics','Fruits and berries','noun',`
boysenberry~бойсенова ягода (гибрид)~Boysenberry jam is tart and delightfully sweet.~Джем из бойсеновой ягоды терпкий и сладостный.~noun
cloudberry~северная ягода морошка~Golden cloudberry grows in subarctic peat moss.~Золотистая морошка растёт в торфяном субарктическом мху.~noun
lingonberry~дикорастущая брусника~Swedish meatballs are served with lingonberry sauce.~Шведские фрикадельки подаются с брусничным соусом.~noun
elderberry~чёрная бузина~Warm elderberry syrup supports respiratory health.~Тёплый сироп из ягод бузины поддерживает дыхание.~noun
bilberry~черника европейская~Wild bilberries stain fingers deep violet.~Дикая черника окрашивает пальцы в тёмно-фиолетовый цвет.~noun
redcurrant~красная смородина~Clusters of translucent redcurrant decorated tarts.~Грозди прозрачной красной смородины украшали тарталетки.~noun
blackcurrant~чёрная смородина~Blackcurrant is rich in natural ascorbic acid.~Чёрная смородина богата природной аскорбиновой кислотой.~noun
kumquat~цитрусовый кумкват~Eat sweet miniature kumquats whole with their skin.~Ешь сладкие миниатюрные кумкваты целиком с кожурой.~noun
cantaloupe~мускатная дыня канталупа~Sweet orange cantaloupe slices cool hot days.~Сладкие оранжевые ломтики канталупы освежают в жару.~noun
honeydew~медовая зелёная дыня~Chilled honeydew melon makes a refreshing starter.~Охлаждённая медовая дыня служит освежающей закуской.~noun
watermelon~арбуз полосатый~A crisp ripe watermelon quench afternoon thirst.~Хрустящий спелый арбуз утоляет дневную жажду.~noun
tangerine~мандарин сочный~Peel a fragrant winter tangerine by the fire.~Очисти ароматный зимний мандарин у камина.~noun
clementine~клементин без косточек~Sweet seedless clementines are easy to peel.~Сладкие клементины без косточек легко чистить.~noun
nectarine~нектарин гладкий~Juicy yellow nectarines ripen in late July.~Сочные жёлтые нектарины созревают в конце июля.~noun
plantain~овощной банан плантайн~Fried savory plantains accompany Caribbean dishes.~Жареные бананы-плантайны дополняют карибские блюда.~noun
prune~чернослив сушеный~Stewed tender prunes add rich sweetness to oats.~Вяленый мягкий чернослив придаёт овсянке сладость.~noun
raisin~изюм сушеный~Sprinkle golden raisins over cinnamon porridge.~Посыпь золотистый изюм на кашу с корицей.~noun`);
  add('topics','Vegetables','noun',`
zucchini~кабачок цукини~Saute sliced green zucchini with minced garlic.~Обжаривай нарезанный кабачок цукини с измельчённым чесноком.~noun
shallot~лук-шалот~French vinaigrettes call for finely minced shallots.~Во французские винегреты добавляют мелко нарезанный шалот.~noun
scallion~зелёный перьевой лук~Chop crisp scallions to garnish steaming ramen.~Нарежь перьевой зелёный лук для украшения горячего рамэна.~noun
radicchio~цикорный салат радиккио~Bitter red radicchio balances sweet balsamic glazes.~Горьковатый красный радиккио балансирует бальзамический соус.~noun
arugula~пряная рукола~Peppery baby arugula pairs wonderfully with parmesan.~Пряная молодая рукола прекрасно сочетается с пармезаном.~noun
endive~салатный цикорий эндивий~Fill crunchy endive leaves with goat cheese dip.~Наполни хрустящие листья эндивия соусом из козьего сыра.~noun
romaine~салат ромэн~Crisp romaine lettuce forms the core of Caesar salads.~Хрустящий салат ромэн составляет основу салата Цезарь.~noun
butternut squash~тыква баттернат~Roast sweet butternut squash with nutmeg.~Запекай сладкую мускатную тыкву с мускатным орехом.~noun
acorn squash~желудевая тыква~Bake halved acorn squash filled with wild rice.~Выпекай половинки тыквы, фаршированные диким рисом.~noun
rutabaga~брюква корнеплодная~Mashed rutabaga complements traditional roast dinners.~Пюре из брюквы дополняет традиционные мясные ужины.~noun
horseradish~корень хрена~Grate pungent horseradish root into sour cream.~Натри ядрёный корень хрена в сметану.~noun
ginger root~корень имбиря свежий~Grate zesty ginger root into warming herbal tea.~Натри свежий корень имбиря в согревающий травяной чай.~noun
bamboo shoot~побег бамбука съедобный~Crispy bamboo shoots absorb broths in stir-fry dishes.~Хрустящие побеги бамбука впитывают бульоны в рагу.~noun
water chestnut~водяной орех овощной~Sliced water chestnuts add crunch to vegetable platters.~Нарезанный водяной орех добавляет хруст овощным блюдам.~noun
pea~зелёный горошек~Sweet tender green peas simmer in buttered broth.~Сладкий нежный зелёный горошек томится в бульоне с маслом.~noun
snap pea~стручковый сахарный горох~Snack on raw crunchy sugar snap peas with hummus.~Перекусывай сырым сахарным стручковым горошком с хумусом.~noun
chilli~острый перец чили~A diced red chilli adds fiery warmth to stews.~Нарезанный красный перец чили добавляет жгучую остроту рагу.~noun`);
  add('topics','Herbs and spices','noun',`
tarragon~эстрагон; тархун~Fresh aromatic tarragon is key to béarnaise sauce.~Свежий ароматный эстрагон — основа соуса бернез.~noun
oregano~душица; орегано~Dried Mediterranean oregano flavours wood-fired pizza.~Сушёный орегано придаёт аромат пицце из дровяной печи.~noun
sage~лекарственный шалфей~Crispy fried sage leaves garnish brown butter pasta.~Хрустящие листья шалфея украшают пасту со сливочным маслом.~noun
chives~шнитт-лук измельченный~Snip fresh green chives over scrambled eggs.~Порежь свежий шнитт-лук на яичницу-болтунью.~noun
lemongrass~лимонная трава; лемонграсс~Bruised lemongrass stalks infuse Thai Tom Yum soup.~Стебли лемонграсса наполняют ароматом тайский суп том-ям.~noun
bay leaf~лавровый лист~Simmer a fragrant dried bay leaf in meat stews.~Положи ароматный сушёный лавровый лист в мясное рагу.~noun
marjoram~садовый майоран~Sweet marjoram complements roasted potato casseroles.~Сладкий майоран дополняет запеканку из картофеля.~noun
dill weed~зелень свежего укропа~Garnish creamy cucumber salads with chopped dill weed.~Укрась огуречный салат мелко нарезанной зеленью укропа.~noun
fennel seed~семена фенхеля~Crushed fennel seeds season homemade sausages.~Измельчённые семена фенхеля приправляют домашние колбаски.~noun
aniseed~семена аниса~Aniseed lends a sweet liquorice note to baking.~Семена аниса придают выпечке сладкую лакричную ноту.~noun
allspice~душистый перец горошком~Ground Jamaican allspice perfumes holiday gingerbread.~Молотый душистый перец наполняет ароматом пряники.~noun
paprika~сладкая сушёная паприка~Smoked Spanish paprika gives goulash a rich color.~Копчёная паприка даёт гуляшу насыщенный рубиновый цвет.~noun
cayenne~острый кайенский перец~Add a pinch of cayenne pepper for subtle heat.~Добавь щепотку кайенского перца для лёгкой остроты.~noun
fenugreek~пряный пажитник; шамбала~Toasted fenugreek seeds impart maple aroma to curry.~Обжаренные семена пажитника дают аромат карри.~noun
sumac~пряность сумах~Sprinkle tangy purple sumac over grilled kebabs.~Посыпь терпкий пурпурный сумах на шашлык с гриля.~noun
caraway~семена тмина~Knead fragrant caraway seeds into dense rye dough.~Замеси ароматные семена тмина в ржаное тесто.~noun
lavender bud~сушёный бутон лаванды~Infuse honey with aromatic culinary lavender buds.~Настаивай мёд на кулинарных бутонах лаванды.~noun
vanilla bean~стручок натуральной ванили~Scrape tiny seeds from a fragrant vanilla bean.~Выскреби крошечные семена из стручка ванили.~noun
wasabi~японский хрен васаби~Spicy green wasabi paste accompanies fresh sushi.~Острая паста васаби подаётся к свежим суши.~noun`);
  add('topics','Nuts, seeds and legumes','noun',`
pecan~орех пекан~Southern bakers make rich caramelized pecan pies.~Южные пекари пекут карамелизированные пироги с пеканом.~noun
macadamia~австралийский орех макадамия~Buttery roasted macadamia nuts are coated in chocolate.~Маслянистые орехи макадамия покрыты тёплым шоколадом.~noun
brazil nut~бразильский орех~Crunchy Brazil nuts are an exceptional source of selenium.~Хрустящий бразильский орех — отличный источник селена.~noun
chestnut~съедобный каштан~Warm chestnuts roast over glowing winter braziers.~Тёплые каштаны жарятся на зимних углях жаровен.~noun
pine nut~кедровый орешек~Toast delicate pine nuts for traditional basil pesto.~Обжарь нежные кедровые орешки для соуса песто.~noun
chia seed~семена растения чиа~Soak nutritious chia seeds in almond milk overnight.~Замочи питательные семена чиа в миндальном молоке на ночь.~noun
flaxseed~льняное семя~Ground flaxseed provides rich plant-based omega fatty acids.~Молотое льняное семя снабжает организм омега-кислотами.~noun
poppy seed~семена кулинарного мака~Bake lemon muffins sprinkled with crunchy poppy seeds.~Испеки лимонные кексы, посыпанные маковыми зёрнами.~noun
pumpkin seed~тыквенные семечки~Roast salted pumpkin seeds for an autumn snack.~Обжарь солёные тыквенные семечки для осеннего перекуса.~noun
black bean~чёрная фасоль~Cuban black beans simmer with cumin and bell peppers.~Кубинская чёрная фасоль томится с тмином и перцем.~noun
pinto bean~фасоль пинто~Mash cooked pinto beans into creamy refried beans.~Разомни фасоль пинто в нежную начинку для буррито.~noun
fava bean~садовые бобы; фава~Tender young fava beans are tossed with fresh mint.~Нежные молодые садовые бобы перемешивают с мятой.~noun
soybean~соевые бобы; соя~Ferment whole soybeans into nutritious protein tempeh.~Сферментируй цельные соевые бобы в питательный темпе.~noun
edamame~молодые соевые бобы в стручках~Steam fresh green edamame pods with sea salt.~Приготовь зелёные стручки эдамаме на пару с солью.~noun
mung bean~бобы мунг; зелёный маш~Sprout tiny mung beans for crunchy salad greens.~Прорасти мелкий маш для хрустящей зелени в салат.~noun
split pea~колотый горох для супа~Yellow split pea soup warms cold winter afternoons.~Суп из колотого гороха согревает в зимний день.~noun
peanut~земляной орех арахис~Spread smooth roasted peanut butter over warm toast.~Намажь арахисовую пасту на тёплый поджаренный тост.~noun`);
  add('topics','Grains and baking','noun',`
millet~просо; пшено~Golden millet porridge is naturally gluten-free.~Золотистая пшённая каша не содержит глютена.~noun
spelt~древняя пшеница спельта~Ancient spelt flour produces loaves with nutty crust.~Древняя мука из спельты даёт хлеб с ореховой корочкой.~noun
cornmeal~кукурузная мука; крупа~Bake golden Southern skillet cornbread with cornmeal.~Испеки кукурузный хлеб на чугунной сковороде.~noun
semolina~пшеничная манная крупа~Coarse durum wheat semolina shapes Italian pasta.~Крупная манная крупа формирует текстуру пасты.~noun
couscous~пшеничная крупа кускус~Steam fluffy couscous over aromatic vegetable broth.~Приготовь рассыпчатый кускус над овощным бульоном.~noun
bulgur~дроблёная пшеница булгур~Soak cracked bulgur wheat for a fresh parsley tabbouleh.~Замочи булгур для свежего ливанского салата табуле.~noun
farro~цельное зерно полбы~Toss nutty cooked farro with roasted winter squash.~Смешай отварную полбу с запечённой зимней тыквой.~noun
amaranth~зерно амаранта~Pop tiny amaranth grains into crispy breakfast puffs.~Обжарь семена амаранта в воздушные хлопья на завтрак.~noun
bran~пищевые отруби~Wheat bran provides beneficial dietary fiber to cereals.~Пшеничные отруби добавляют полезную клетчатку в каши.~noun
baking powder~разрыхлитель теста~Whisk baking powder into dry flour for fluffy cakes.~Взбей разрыхлитель с мукой для пышных кексов.~noun
baking soda~пищевая сода~Baking soda reacts with buttermilk to lift pancakes.~Сода вступает в реакцию с пахтой, поднимая оладьи.~noun
shortcrust~песочное тесто для пирогов~Roll out chilled buttery shortcrust for tart bases.~Раскатай охлаждённое песочное тесто для основы тарта.~noun
puff pastry~слоёное тесто~Golden buttery puff pastry rises into delicate layers.~Слоёное тесто поднимается нежными хрустящими слоями.~noun
crust~хрустящая корочка хлеба~Crack the golden caramelized crust of artisan sourdough.~Разломи хрустящую корочку ремесленного хлеба на закваске.~noun
loaf~буханка свежего хлеба~Slice a warm seeded bread loaf on a wooden board.~Нарежь буханку свежего хлеба на деревянной доске.~noun`);
  add('topics','Meat, fish and seafood','noun',`
veal~нежная телятина~Tender pan-fried veal cutlets are served with lemon.~Нежные телячьи котлеты подаются с долькой лимона.~noun
venison~дичь; оленина~Lean roasted venison pairs with juniper and berries.~Нежирная жареная оленина сочетается с можжевельником.~noun
duck~утиное мясо; утка~Crispy roast duck breast is glazed with orange honey.~Утиная грудка запекается под медово-апельсиновой глазурью.~noun
turkey~мясо индейки; индейка~Carve succulent roasted turkey breast for holiday dinner.~Нарежь сочную запечённую индейку для праздничного стола.~noun
goose~мясо гуся; гусь~Traditional roasted goose stuffed with spiced apples.~Традиционный запечённый гусь, фаршированный яблоками.~noun
cod~морская рыба треска~Bake flaky Atlantic cod fillets with herb butter.~Запеки филе атлантической трески с пряным маслом.~noun
haddock~северная рыба пикша~Smoked haddock poaches gently in milk for chowder.~Копчёная пикша варится в молоке для сытного супа.~noun
halibut~белокорый палтус~Sear firm white halibut steaks on a cast-iron pan.~Обжарь стейк из палтуса на чугунной сковороде.~noun
mackerel~жирная скумбрия~Grilled whole mackerel is rich in omega-3 fish oils.~Скумбрия на гриле богата полезными рыбьими жирами.~noun
sardine~мелкая сардина~Grill fresh Mediterranean sardines over open charcoal.~Пожарь сардины на открытых древесных углях.~noun
anchovy~солёный анчоус~Salted anchovy fillets melt into Caesar salad dressings.~Филе солёного анчоуса растворяется в заправке Цезарь.~noun
herring~сельдь балтийская~Pickled silver herring is served with boiled potatoes.~Маринованная сельдь подаётся с отварным картофелем.~noun
lobster~морской омар; лобстер~Steam fresh ocean lobster and dip meat in melted butter.~Свари омара на пару и макай мясо в растопленное масло.~noun
crab~морской краб~Sweet blue crab meat fills delicate seaside cakes.~Сладкое крабовое мясо наполняет нежные котлетки.~noun
clam~двустворчатый моллюск клэм~Steam briny fresh clams in garlic and white broth.~Отвари свежих моллюсков в чесночно-белом бульоне.~noun
octopus tentacle~щупальце осьминога~Charred octopus tentacle is tenderized with olive oil.~Щупальце осьминога на гриле размягчено оливковым маслом.~noun
fillet~рыбное или мясное филе~Pan-sear the skin-on sea bass fillet until crispy.~Обжарь филе сибаса на коже до хрустящей корочки.~noun
sirloin~говяжий стейк сирлойн~Grill juicy sirloin steak to medium-rare perfection.~Жарь стейк сирлойн до идеальной средней прожарки.~noun
bacon~копчёный свиной бекон~Crispy sizzling smoked bacon accompanies fried eggs.~Шкворчащий копчёный бекон подаётся с яичницей.~noun
sausage~колбаса; сосиска~Grill herb pork sausages until golden on all sides.~Жарь колбаски со специями до золотистой корочки.~noun`);
  add('topics','Dairy, eggs and desserts','noun',`
buttermilk~кисломолочная пахта~Whisk chilled cultured buttermilk into pancake batter.~Взбей охлаждённую пахту в тесто для оладий.~noun
sour cream~густая сметана~Garnish steaming borscht with a dollop of sour cream.~Укрась горячий борщ ложкой густой сметаны.~noun
mascarpone~сливочный сыр маскарпоне~Whip rich Italian mascarpone cheese for tiramisu.~Взбей нежный сыр маскарпоне для десерта тирамису.~noun
ricotta~сывороточный сыр рикотта~Fill delicate pasta ravioli with spinach and ricotta.~Наполни равиоли шпинатом и свежей рикоттой.~noun
parmesan~твёрдый сыр пармезан~Grate aged parmesan cheese finely over hot pasta.~Мелко натри выдержанный пармезан поверх горячей пасты.~noun
cheddar~выдержанный сыр чеддер~Sharp mature cheddar cheese melts smoothly in sauces.~Острый выдержанный чеддер плавно плавится в соусах.~noun
mozzarella~молодой сыр моцарелла~Tear creamy buffalo mozzarella over sliced ripe tomatoes.~Нарви сливочную моцареллу на спелые помидоры.~noun
whipped cream~взбитые сливки~Top warm hot cocoa mugs with sweetened whipped cream.~Укрась кружки горячего какао сладкими взбитыми сливками.~noun
mousse~воздушный десертный мусс~Dark chocolate mousse melts delightfully on the tongue.~Мусс из тёмного шоколада тает на языке.~noun
pudding~десертный пудинг~Steamed date pudding is served with warm toffee sauce.~Паровой финиковый пудинг подаётся с карамельным соусом.~noun
parfait~многослойный десерт парфе~Layer fruit and yogurt into a breakfast granola parfait.~Выложи слоями фрукты и йогурт в полезное парфе.~noun
gelato~итальянское мороженое джелато~Artisan pistachio gelato is dense and delightfully creamy.~Фисташковое джелато плотное и восхитительно сливочное.~noun
tiramisu~кофейный десерт тирамису~Dust bitter cocoa powder over classic coffee tiramisu.~Посыпь какао на классический кофейный десерт тирамису.~noun
cheesecake~творожный пирог чизкейк~Baked New York cheesecake has a buttery biscuit base.~Нью-йоркский чизкейк имеет рассыпчатую основу из печенья.~noun
eclair~заварное пирожное эклер~Crisp choux pastry eclairs are filled with vanilla cream.~Заварные эклеры наполнены нежным ванильным кремом.~noun
tart~открытый сладкий пирог тарт~Fresh berry tarts showcase glossy raspberries on cream.~Свежие ягодные тарты украшены малиной на заварном креме.~noun
waffle~бельгийская вафля~Drizzle maple syrup over crisp Belgian grid waffles.~Полей кленовым сиропом хрустящие бельгийские вафли.~noun
brownie~шоколадное пирожное брауни~Fudgy walnut brownies have crackly paper-thin tops.~Шоколадные брауни с орехами имеют тонкую корочку.~noun`);
  add('topics','Birds and insects','noun',`
robin~птица малиновка; зарянка~A cheerful red-breasted robin sang on the gatepost.~Жизнерадостная малиновка с красной грудкой пела на заборе.~noun
pigeon~городской голубь~Flocks of grey pigeons pecked breadcrumbs in the square.~Стаи серых голубей клевали крошки на площади.~noun
seagull~морская чайка~Screaming white seagulls soared over coastal fishing boats.~Чайки парили над прибрежными рыбацкими лодками.~noun
swan~благородный лебедь~A graceful white swan glided across the misty lake.~Грациозный белый лебедь скользил по туманному озеру.~noun
duck~дикая или домашняя утка~Mallard ducks paddled through reed beds at dawn.~Дикие утки кряквы плавали в зарослях камыша на рассвете.~noun
heron~серая болотная цапля~A tall grey heron stood motionless waiting for fish.~Серая цапля неподвижно стояла в воде в ожидании рыбы.~noun
hummingbird~крошечная птица колибри~A jewel-toned hummingbird hovered beside scarlet flowers.~Яркая колибри зависла в воздухе возле алых цветов.~noun
falcon~хищная птица сокол~The peregrine falcon dives at breath-taking velocity.~Сокол-сапсан пикирует на захватывающей скорости.~noun
hawk~лесной ястреб~A sharp-eyed hawk scanned open fields from a dead tree.~Зоркий ястреб высматривал добычу на открытых полях.~noun
bee~медоносная пчела~Worker bees gather nectar to build golden honeycombs.~Рабочие пчёлы собирают нектар для постройки сот.~noun
wasp~полосатая оса~A yellow-jacket wasp flew around the ripe plums.~Полосатая оса кружила вокруг спелых слив.~noun
ant~трудолюбивый муравей~Tiny black ants carried seeds in an organized line.~Крошечные чёрные муравьи несли семена организованной цепочкой.~noun
caterpillar~гусеница бабочки~A striped green caterpillar munched on fennel leaves.~Полосатая зелёная гусеница жевала листья фенхеля.~noun
moth~ночная бабочка; моль~A pale nocturnal moth fluttered against the porch lamp.~Бледный ночной мотылёк бился о лампу на крыльце.~noun
ladybird~божья коровка~A spotted red ladybird crawled up the garden rose stem.~Пятнистая божья коровка ползла по стеблю садовой розы.~noun
firefly~светлячок ночной~Flashing yellow fireflies illuminated summer meadows.~Мерцающие жёлтые светлячки освещали летние луга.~noun
cricket~полевой сверчок~Singing night crickets chirped outside the open window.~Поющие ночные сверчки стрекотали за открытым окном.~noun
cicada~древесная цикада~Buzzing cicadas echoed throughout warm Mediterranean pine groves.~Стрекочущие цикады эхом разносились по сосновым рощам.~noun
mosquito~комар кровососущий~A buzzing mosquito hovered near the outdoor lantern.~Жужжащий комар кружил возле уличного фонаря.~noun`);
  add('topics','Sea animals','noun',`
shark~морская акула~The sleek reef shark glided silently over coral.~Морская акула бесшумно скользила над кораллами.~noun
turtle~морская черепаха~A giant green sea turtle swam toward the reef.~Гигантская зелёная черепаха поплыла к рифу.~noun
walrus~арктический морж~A heavy tusker walrus hauled out onto floating ice.~Клыкастый морж выбрался на плавучую льдину.~noun
lobster~морской рак омар~The blue American lobster hid inside a dark crevice.~Американский синий омар спрятался в тёмной расщелине.~noun
starfish~морская звезда~A five-armed orange starfish clung to wet granite.~Пятилучевая морская звезда прикрепилась к граниту.~noun
coral~морской коралл~Delicate stony coral formations build vibrant reefs.~Коралловые структуры образуют живые морские рифы.~noun
sponge~морская губка~Filtering sea sponges thrive in clear marine depths.~Морские губки фильтруют воду на глубине океана.~noun
anemone~морская актиния~Clownfish shelter safely within stinging sea anemone tentacles.~Рыбы-клоуны укрываются в щупальцах актинии.~noun
eel~морской угорь; мурена~A spotted moray eel poked its head from the cave.~Пятнистая мурена высунула голову из подводной пещеры.~noun
plankton~океанический планктон~Microscopic glowing plankton creates bioluminescent tides.~Микроскопический планктон создаёт свечение океана.~noun
barracuda~хищная рыба барракуда~A solitary silver barracuda patrolled the clear lagoon.~Одинокая серебристая барракуда патрулировала лагуну.~noun
manta ray~гигантский морской скат манта~A massive manta ray somersaulted gracefully in blue water.~Гигантский скат манта грациозно кувыркался в синей воде.~noun
hermit crab~рак-отшельник~A tiny hermit crab scuttled with its borrowed shell.~Рак-отшельник бежал с позаимствованной раковиной.~noun
swordfish~рыба-меч~The fast oceanic swordfish sliced through surface currents.~Быстрая рыба-меч рассекала поверхностные течения.~noun
squid tentacle~щупальце кальмара~Suction cups line the muscular giant squid tentacle.~Присоски покрывают мускулистое щупальце кальмара.~noun`);
  add('topics','Trees, flowers and gardening','noun',`
ash~дерево ясень~Tall ash trees produce winged seed keys in autumn.~Высокие ясени дают крылатые семена осенью.~noun
elm~дерево вяз; ильм~Stately Dutch elm trees once shaded country lanes.~Величественные вязы когда-то затеняли сельские дороги.~noun
beech~лесное дерево бук~Smooth silver bark distinguishes the European beech tree.~Гладкая серебристая кора отличает европейский бук.~noun
poplar~стройный тополь~Rustling silver poplars lined the riverside walkway.~Шелестящие серебристые тополя обрамляли дорожку у реки.~noun
cedar~хвойное дерево кедр~Aromatic fragrant cedar wood naturally resists damp decay.~Ароматная кедровая древесина естественно противостоит гниению.~noun
cypress~вечнозелёный кипарис~Slender dark cypress spires stand on Tuscan hills.~Стройные тёмные кипарисы стоят на холмах Тосканы.~noun
daisy~полевая ромашка~Children picked white yellow-centered daisies in the meadow.~Дети собирали белые полевые ромашки на лугу.~noun
tulip~весенний тюльпан~Vibrant Dutch striped tulips bloomed in spring borders.~Яркие тюльпаны зацвели на весенних клумбах.~noun
daffodil~жёлтый нарцисс~Golden nodding daffodils herald the arrival of spring.~Золотистые нарциссы возвещают о приходе весны.~noun
sunflower~солнечный подсолнух~Giant yellow sunflowers turned their heads to follow the sun.~Гигантские подсолнухи поворачивали головки за солнцем.~noun
poppy~алый мак~Crimson field poppies danced in the warm afternoon wind.~Алые полевые маки танцевали на тёплом ветру.~noun
carnation~гвоздика садовая~Frilly pink carnation stems emitted a spicy clove scent.~Розовые гвоздики источали пряный гвоздичный аромат.~noun
trowel~садовый совок; лопатка~Dig planting holes in borders with a metal trowel.~Выкапывай посадочные ямки металлическим совком.~noun
rake~садовые грабли~Rake fallen dry autumn leaves into tidy mulch piles.~Сгребай сухие осенние листья в аккуратные кучи.~noun
pruners~садовый секатор~Snip dead rose stems cleanly with sharp bypass pruners.~Срезай отмершие стебли роз острым секатором.~noun
wheelbarrow~садовая тачка~Haul bags of rich potting soil in a wheelbarrow.~Перевози мешки с плодородным грунтом в тачке.~noun
watering can~лейка для полива~Sprinkle potted seedlings gently with an iron watering can.~Полей рассаду в горшках из садовой лейки.~noun
greenhouse~теплица; оранжерея~Tomato vines flourish inside the sunny glass greenhouse.~Томаты прекрасно растут в солнечной стеклянной теплице.~noun`);
  add('topics','Landscapes and natural disasters','noun',`
canyon~глубокий каньон; ущелье~The river carved a dramatic red sandstone canyon.~Река прорезала живописный каньон в красном песчанике.~noun
gorge~горная теснина; ущелье~A wooden rope bridge suspended over the deep rocky gorge.~Веревочный мост был подвешен над скалистым ущельем.~noun
peninsula~полуостров~The rugged coastal peninsula jutted far into the ocean.~Скалистый полуостров далеко выступал в океан.~noun
plateau~высокое горное плато~The high windswept plateau offered panoramic mountain views.~Высокое продуваемое плато открывало панорамные виды.~noun
dune~песчаная дюна; бархан~Golden desert sand dunes shifted with the desert wind.~Золотистые песчаные дюны перемещались под ветром.~noun
crater~вулканический кратер~A turquoise mineral lake formed inside the volcanic crater.~Бирюзовое минеральное озеро образовалось в кратере.~noun
tsunami~цунами; гигантская волна~An undersea seismic tremor triggered a devastating ocean tsunami.~Подводное землетрясение вызвало разрушительное цунами.~noun
tornado~смерч; торнадо~The violent funnel-shaped tornado tore across open farmland.~Свирепый смерч пронёсся по открытым сельскохозяйственным землям.~noun
cyclone~тропический циклон; ураган~Coastal villages prepared sturdy storm shutters against the cyclone.~Прибрежные деревни закрыли ставни перед циклоном.~noun
hurricane~ураган разрушительной силы~High category hurricane winds battered the coastal barrier islands.~Ураганные ветры обрушились на барьерные острова.~noun
aftershock~повторный подземный толчок~Engineers inspected bridges following the minor morning aftershock.~Инженеры осмотрели мосты после утреннего толчка.~noun
lava~вулканическая лава~Molten glowing red lava poured slowly down the slope.~Раскалённая лава медленно стекала по склону вулкана.~noun
epicenter~эпицентр землетрясения~Seismologists mapped the shallow epicenter of the earthquake.~Сейсмологи определили неглубокий эпицентр толчков.~noun
tremor~подземный толчок; сотрясение~A subtle earth tremor rattled drinking glasses in cabinets.~Лёгкий толчок заставил стаканы звенеть в шкафу.~noun
sinkhole~провал грунта; карстовая воронка~Sudden limestone sinkholes opened up beneath the old road.~Карстовая воронка неожиданно образовалась под дорогой.~noun`);
  add('topics','Holidays and traditions','noun',`
thanksgiving~День благодарения~Families gather to celebrate gratitude at Thanksgiving.~Семьи собираются выразить благодарность в День благодарения.~noun
christmas eve~Рождественский сочельник~Children leave cookies for Santa on Christmas Eve.~Дети оставляют печенье для Санты в канун Рождества.~noun
carnival~традиционный карнавал~Vibrant brass bands played joyful rhythms during carnival.~Духовые оркестры играли весёлые ритмы на карнавале.~noun
carol~рождественский гимн; колядка~Choirs sang festive four-part carols in the village square.~Хоры пели рождественские гимны на деревенской площади.~noun
pageant~историческое костюмированное шествие~Children performed in the annual holiday nativity pageant.~Дети участвовали в ежегодном праздничном шествии.~noun
wreath~праздничный рождественский венок~Hang a green pinecone wreath on the front wooden door.~Повесь венок из сосновых шишек на входную дверь.~noun
folklore~народное творчество; фольклор~Oral folklore passes ancient wisdom down across generations.~Устный фольклор передаёт мудрость из поколения в поколение.~noun
heritage~культурное наследие предков~Protecting tangible historical heritage preserves civic memory.~Защита исторического наследия сохраняет память народа.~noun
festivity~празднество; веселье~Village festivities continued late under strings of lanterns.~Деревенские празднества продолжались допоздна.~noun
fair~праздничная ярмарка; базар~Buy handmade wooden toys at the open-air winter fair.~Купи деревянные игрушки на зимней ярмарке под открытым небом.~noun
bonfire~праздничный костёр на площади~Townspeople gathered around the glowing November bonfire.~Горожане собрались вокруг праздничного костра.~noun
ceremonial~церемониальный; обрядовый~Priests wore ceremonial embroidered vestments for the feast.~Священники надели церемониальные облачения к празднику.~adjective
customary~привычный; общепринятый по обычаю~It is customary to bring bread and salt to housewarmings.~Принято приносить хлеб и соль на новоселье.~adjective
observance~соблюдение религиозного обряда~Religious observance brings reflective quiet to holy days.~Соблюдение обрядов приносит тишину в священные дни.~noun
pilgrimage~паломничество к святыням~Thousands of pilgrims completed the annual mountain pilgrimage.~Тысячи паломников совершили ежегодное паломничество.~noun
heirloom~семейная реликвия~The antique silver pocket watch was a prized family heirloom.~Антикварные серебряные часы были семейной реликвией.~noun
folktale~народная сказка; притча~Elders recounted legendary folktales beside the hearth.~Старейшины рассказывали народные сказки у очага.~noun
ancestral~родовой; унаследованный от предков~They restored the ancestral stone stone estate in the valley.~Они восстановили родовое каменное поместье в долине.~adjective
reunion~воссоединение семьи; съезд родни~A large family reunion welcomed five generations together.~Большое воссоединение семьи собрало пять поколений вместе.~noun`);
  add('topics','Documents and postal services','noun',`
passport~заграничный паспорт~Present a valid biometric passport at border control.~Предъявите биометрический паспорт на пограничном контроле.~noun
visa~въездная виза~The consulate issued a single-entry tourist visa.~Консульство выдало однократную туристическую визу.~noun
contract~официальный договор; контракт~Read every clause of the legal contract carefully.~Внимательно прочитай каждый пункт юридического договора.~noun
invoice~счёт-фактура на оплату~The supplier emailed a detailed invoice for goods.~Поставщик прислал подробный счёт-фактуру за товары.~noun
parcel~почтовая посылка~Collect the registered international parcel at counter.~Получи заказную международную посылку у стойки.~noun
registered mail~заказная почтовая корреспонденция~Send the deed via trackable registered mail.~Отправь документ отслеживаемой заказной почтой.~noun
courier~курьерская служба; курьер~The express courier delivered the document by noon.~Экспресс-курьер доставил документ к полудню.~noun
identity card~удостоверение личности~Keep your national identity card in your wallet.~Держи национальное удостоверение личности в кошельке.~noun
affidavit~письменное показание под присягой~Sign the sworn legal affidavit before a notary.~Подпиши письменное показание под присягой перед нотариусом.~noun
seal~гербовая печать; оттиск~An embossed gold seal authenticated the diploma.~Тиснёная золотая печать подтвердила подлинность диплома.~noun
diploma~диплом об образовании~The academy awarded a postgraduate research diploma.~Академия вручила диплом аспирантского исследования.~noun
notary public~государственный нотариус~A certified notary public witnessed the document signing.~Сертифицированный нотариус заверил подписание документа.~noun
postbox~уличный почтовый ящик~Drop the stamped letter into the red postbox.~Опусти письмо с маркой в красный почтовый ящик.~noun
mailbox~индивидуальный почтовый ящик~Check the home mailbox for morning deliveries.~Проверь домашний почтовый ящик на наличие утренней почты.~noun
customs declaration~таможенная декларация~Complete the green customs declaration form truthfully.~Правдиво заполни зелёный бланк таможенной декларации.~noun
certified copy~заверенная копия документа~Submit a certified copy of your birth record.~Предоставь заверенную копию свидетельства о рождении.~noun
docket~сопроводительный реестр; ярлык~Attach the delivery docket to the shipping crate.~Прикрепи товарный ярлык к упаковочному ящику.~noun`);
  add('topics','Renting, moving and repairs','noun',`
flatmate~сосед по квартире~Split the monthly heating bills with your flatmate.~Раздели ежемесячные счета за отопление с соседом.~noun
landlady~домовладелица; хозяйка жилья~The landlady visited to inspect the radiator repair.~Хозяйка жилья пришла проверить ремонт батареи.~noun
sublet~сдавать в субаренду~Tenants are not permitted to sublet without consent.~Жильцам не разрешается сдавать в субаренду без согласия.~verb
deposit~гарантийный залог за жилье~Pay a one-month damage deposit before moving in.~Оплати залог за один месяц перед вселением.~noun
inventory~опись имущества в квартире~Check off each piece of furniture on the inventory.~Отметь каждый предмет мебели в описи имущества.~noun
relocate~переезжать на новое место~The company helped staff relocate to the new headquarters.~Компания помогла сотрудникам переехать в новый офис.~verb
packing box~коробка для переезда~Label each cardboard packing box with room names.~Подпиши каждую картонную коробку названиями комнат.~noun
bubble wrap~пузырчатая упаковочная пленка~Wrap fragile glass ornaments in thick bubble wrap.~Заверни хрупкие стеклянные украшения в пузырчатую плёнку.~noun
plumber~квалифицированный сантехник~Call an emergency plumber to seal the pipe burst.~Вызови дежурного сантехника заделать прорыв трубы.~noun
hammer~слесарный молоток~Tap the picture nail gently with a small hammer.~Осторожно забей гвоздь для картины маленьким молотком.~noun
screwdriver~отвёртка для винтов~Tighten the loose cabinet hinge with a screwdriver.~Затяни ослабленную петлю шкафа отвёрткой.~noun
pliers~пассатижи; плоскогубцы~Hold the stiff metal wire firmly with pliers.~Крепко держи жёсткую проволоку пассатижами.~noun
drill~электрическая дрель~Drill a pilot hole into the brick wall carefully.~Аккуратно просверли направляющее отверстие в кирпиче.~noun
fuse box~электрический щиток с предохранителями~Check the main fuse box if the power trips.~Проверь распределительный щиток, если выбило свет.~noun
renovation~ремонт и обновление помещения~The historic apartment underwent a tasteful renovation.~В исторической квартире сделали со вкусом ремонт.~noun
tile~керамическая плитка~Replace the cracked bathroom floor tile with mortar.~Замени треснувшую плитку в ванной на растворе.~noun
grout~затирка для швов плитки~Seal the shower wall joints with waterproof grout.~Заделай швы в душевой водостойкой затиркой.~noun
caulk~герметик строительный~Apply silicone caulk around the kitchen sink rim.~Нанеси силиконовый герметик по краю кухонной мойки.~noun
insulation~теплоизоляция стен~Thick mineral wool insulation keeps winter rooms warm.~Плотная минераловатная изоляция сохраняет тепло зимой.~noun
tap washer~прокладка в водопроводном кране~Replace the worn rubber tap washer to stop dripping.~Замени изношенную резиновую прокладку крана, чтобы не капало.~noun`);
  add('topics','Accessibility and disability','adjective',`
inclusive~инклюзивный; доступный для всех~Build an inclusive public playground for all children.~Построй инклюзивную детскую площадку для всех детей.~adjective
braille~рельефно-точечный шрифт Брайля~Elevator buttons feature embossed Braille numerals.~Кнопки лифта снабжены рельефными цифрами Брайля.~noun
guide dog~собака-поводырь~Trained guide dogs assist visually impaired pedestrians.~Обученные собаки-поводыри помогают незрячим пешеходам.~noun
crutch~ортопедический костыль~He walked steadily with the aid of forearm crutches.~Он уверенно шёл с помощью локтевых костылей.~noun
cane~трость для ходьбы~An elderly gentleman leaned on an engraved cane.~Пожилой джентльмен опирался на гравированную трость.~noun
prosthesis~протез конечности~Modern carbon-fiber prostheses restore mobility.~Современные углепластиковые протезы возвращают подвижность.~noun
tactile~тактильный; осязательный~Bright yellow tactile paving guides commuters.~Ярко-жёлтая тактильная плитка направляет пассажиров.~adjective
impairment~нарушение функции; ослабление~Adaptive headsets support learners with hearing impairment.~Адаптивные наушники помогают учащимся с нарушением слуха.~noun
carer~опекун; сиделка~The dedicated family carer provided daily assistance.~Преданный семейный опекун оказывал ежедневную помощь.~noun
neurodiversity~нейроразнообразие~Workplaces embrace neurodiversity to foster innovation.~Компании поддерживают нейроразнообразие ради инноваций.~noun
audio description~тифлокомментирование; аудиоописание~Museums offer audio description tracks for exhibitions.~Музеи предлагают аудиодорожки с тифлокомментированием.~noun
low-floor~низкопольный (о транспорте)~Modern low-floor buses ease boarding for strollers.~Современные низкопольные автобусы облегчают посадку с колясками.~adjective
handrail~опорный поручень; перила~Grip the sturdy metal handrail when climbing stairs.~Держись за прочный металлический поручень на лестнице.~noun
braille display~брайлевский дисплей компьютера~The refreshable braille display connects via Bluetooth.~Брайлевский дисплей подключается по беспроводной связи.~noun
caption~скрытые субтитры; подпись~Turn on closed captions when watching foreign streams.~Включай скрытые субтитры при просмотре зарубежных видео.~noun
magnifier~увеличительное стекло; лупа~Use an illuminated electronic magnifier to read small print.~Используй электронную лупу с подсветкой для чтения шрифта.~noun
accessible route~доступный безбарьерный маршрут~Follow the marked accessible route to avoid steep stairs.~Следуй по безбарьерному маршруту, чтобы обойти лестницы.~noun
assisted living~проживание с уходом~The community center promotes independent assisted living.~Центр содействует самостоятельному проживанию с уходом.~noun
mobility scooter~электрическая инвалидная коляска-скутер~Charge the battery of the outdoor mobility scooter.~Заряди аккумулятор уличного электроскутера для мобильности.~noun`);
  add('topics','Computers and internet safety','noun',`
password manager~менеджер паролей~Store complex unique credentials in a password manager.~Храни сложные уникальные данные в менеджере паролей.~noun
two-factor~двухфакторный (о защите)~Enable two-factor authentication on every email account.~Включи двухфакторную аутентификацию на всех почтовых ящиках.~adjective
antivirus~антивирусная программа~The background antivirus software detected suspicious downloads.~Антивирусная программа обнаружила подозрительные файлы.~noun
spyware~программа-шпион; шпионское ПО~Security tools scan for malicious tracking spyware.~Инструменты безопасности сканируют систему на шпионское ПО.~noun
ransomware~вирус-вымогатель; шифровальщик~Regular offline backups mitigate damage from ransomware.~Регулярные офлайн-копии снижают ущерб от вирусов-вымогателей.~noun
breach~утечка конфиденциальных данных~The company promptly disclosed the customer data breach.~Компания оперативно сообщила об утечке данных клиентов.~noun
vulnerability~уязвимость в программном коде~Developers patched the zero-day software vulnerability.~Разработчики закрыли уязвимость нулевого дня в софте.~noun
patch~исправление уязвимости; патч~Apply the vendor operating system security patch.~Установи исправление безопасности от поставщика операционной системы.~noun
vpn~виртуальная частная сеть (VPN)~Connect through a secure VPN when using public Wi-Fi.~Подключайся через защищённый VPN в общественном Wi-Fi.~noun
trojan~вредоносная программа-троянец~Do not open email attachments concealing hidden trojans.~Не открывай вложения в письмах, скрывающие троянцев.~noun
credential~учётные данные пользователя~Never disclose your secret login credentials to callers.~Никогда не сообщай свои секретные учётные данные звонящим.~noun
cyberattack~кибератака на инфраструктуру~Emergency teams repelled a massive distributed cyberattack.~Экстренные службы отразили массированную кибератаку.~noun
firmware~встроенное микропрограммное обеспечение~Update the broadband router firmware to prevent exploits.~Обнови прошивку роутера для предотвращения атак.~noun
hacker~компьютерный взломщик; хакер~White-hat ethical hackers uncover security gaps.~Этические белые хакеры находят бреши в защите.~noun
botnet~сеть зараженных устройств; ботнет~The criminal botnet was dismantled by international police.~Ботнет был ликвидирован международной полицией.~noun
token~токен безопасности; электронный ключ~Insert the hardware security token to approve transfers.~Вставь аппаратный токен безопасности для подтверждения перевода.~noun
sandbox~изолированная программная среда~Run untrusted executable files inside an isolated sandbox.~Запускай непроверенные файлы в изолированной песочнице.~noun`);
  add('topics','Scientific disciplines','noun',`
astrophysics~астрофизика~Astrophysics investigates stellar nucleosynthesis and black holes.~Астрофизика исследует звёздный нуклеосинтез и чёрные дыры.~noun
biotechnology~биотехнология~Agricultural biotechnology produces drought-resistant crops.~Сельскохозяйственная биотехнология выводит засухоустойчивые культуры.~noun
climatology~климатология~Climatology reconstructs past global temperature patterns.~Климатология реконструирует глобальные климатические паттерны прошлого.~noun
crystallography~кристаллография~X-ray crystallography determined the structure of DNA.~Рентгеновская кристаллография определила структуру ДНК.~noun
cybernetics~кибернетика~Cybernetics explores regulatory feedback systems in machines.~Кибернетика исследует системы обратной связи в машинах.~noun
demography~демография~Demography analyzes population growth and migration trends.~Демография анализирует рост населения и тенденции миграции.~noun
embryology~эмбриология~Comparative embryology reveals evolutionary relationships.~Сравнительная эмбриология раскрывает эволюционные связи.~noun
endocrinology~эндокринология~Endocrinology treats complex human hormonal disorders.~Эндокринология лечит сложные гормональные нарушения человека.~noun
epidemiology~эпидемиология~Field epidemiology traced the outbreak to contaminated water.~Полевая эпидемиология выявила источник вспышки в воде.~noun
geophysics~геофизика~Geophysics measures Earth gravitational and magnetic fields.~Геофизика измеряет гравитационное и магнитное поля Земли.~noun
histology~гистология; наука о тканях~Pathologists use histology to examine tissue biopsies.~Патологи используют гистологию для анализа биопсий тканей.~noun
immunology~иммунология~Modern immunology develops targeted therapeutic antibodies.~Современная иммунология разрабатывает адресные антитела.~noun
microbiology~микробиология~Microbiology studies beneficial gut bacteria populations.~Микробиология изучает популяции полезных бактерий кишечника.~noun
mycology~микология; наука о грибах~Forest mycology surveys subterranean fungal mycorrhizae.~Лесная микология исследует подземные грибные микоризы.~noun
nanotechnology~нанотехнология~Nanotechnology engineers materials at the atomic scale.~Нанотехнология конструирует материалы на атомном уровне.~noun
ornithology~орнитология; наука о птицах~Amateur ornithology logs annual migratory flyways.~Любительская орнитология фиксирует миграционные пути птиц.~noun
pharmacology~фармакология~Clinical pharmacology tests drug efficacy and safety.~Клиническая фармакология проверяет действенность лекарств.~noun
toxicology~токсикология~Environmental toxicology assesses industrial chemical spills.~Экологическая токсикология оценивает химические разливы.~noun
virology~вирусология~Molecular virology sequences mutating viral genomes rapidly.~Молекулярная вирусология быстро секвенирует геномы вирусов.~noun`);
  add('topics','Research and scientific method','noun',`
methodology~методология исследования~The thesis explains the chosen quantitative methodology.~Диссертация объясняет выбранную количественную методологию.~noun
control group~контрольная группа в эксперименте~Placebo pills were given to the trial control group.~Таблетки плацебо выдавались контрольной группе исследования.~noun
correlation~статистическая корреляция~Correlation between variables does not prove causation.~Корреляция между переменными не доказывает причинность.~noun
causation~причинно-следственная связь~Scientists established direct biological causation.~Учёные установили прямую биологическую причинность.~noun
empirical~эмпирический; основанный на опыте~Gather rigorous empirical data through field trials.~Собирай надёжные эмпирические данные в полевых испытаниях.~adjective
qualitative~качественный (о методе)~Ethnographic interviews provide rich qualitative insight.~Этнографические интервью дают глубокие качественные выводы.~adjective
quantitative~количественный (о данных)~Statistical tests validate the quantitative findings.~Статистические тесты подтверждают количественные результаты.~adjective
protocol~протокол проведения эксперимента~Follow the established laboratory safety protocol.~Следуй установленному лабораторному протоколу безопасности.~noun
benchmark~контрольный ориентир; эталон~The algorithm outperformed the international benchmark.~Алгоритм превзошёл международный эталонный показатель.~noun
artifact~искажение в данных; артефакт~Electronic noise produced a measurement artifact.~Электронный шум создал артефакт в измерениях.~noun
validation~научная валидация; проверка~Independent experimental validation confirmed the model.~Независимая экспериментальная проверка подтвердила модель.~noun
deduction~дедуктивный вывод~Logical deduction led to an inevitable conclusion.~Логическая дедукция привела к неизбежному выводу.~noun
induction~индуктивное обобщение~Induction formulates hypotheses from observed patterns.~Индукция формулирует гипотезы на основе наблюдений.~noun
reproducible~воспроизводимый в опытах~Only reproducible results are accepted into journals.~Только воспроизводимые результаты принимаются в журналы.~adjective
peer-reviewed~рецензируемый специалистами~Publish findings in a high-impact peer-reviewed journal.~Публикуй результаты в высокорейтинговом рецензируемом журнале.~adjective
discrepancy~несоответствие; расхождение~Investigate any numerical discrepancy between trials.~Расследуйте любое числовое расхождение между опытами.~noun`);
  add('topics','Mathematics and logic','noun',`
axiom~математическая аксиома~Geometric proofs build upon Euclid fundamental axioms.~Геометрические доказательства строятся на аксиомах Евклида.~noun
corollary~следствие из теоремы~The mathematical corollary follows directly from theorem.~Математическое следствие вытекает напрямую из теоремы.~noun
lemma~вспомогательная лемма~The mathematician proved a technical lemma first.~Математик сначала доказал вспомогательную лемму.~noun
vector~вектор величины и направления~Calculate the magnitude and direction of the velocity vector.~Вычисли модуль и направление вектора скорости.~noun
matrix~числовая матрица~Multiply the three-by-three square matrix by column.~Умножь квадратную матрицу три на три на столбец.~noun
fraction~арифметическая дробь~Simplify the complex algebraic fraction to lowest terms.~Упрости сложную алгебраическую дробь до несократимой.~noun
numerator~числитель дроби~The top number of a simple fraction is its numerator.~Верхнее число простой дроби — это её числитель.~noun
denominator~знаменатель дроби~Never divide by zero in the algebraic denominator.~Никогда не дели на ноль в алгебраическом знаменателе.~noun
exponent~показатель степени~The exponential equation has an integer exponent.~Показательное уравнение имеет целый показатель степени.~noun
logarithm~математический логарифм~Take the natural logarithm of both sides to solve.~Возьми натуральный логарифм от обеих частей для решения.~noun
parabola~геометрическая парабола~The trajectory of the thrown projectile is a parabola.~Траектория брошенного снаряда представляет собой параболу.~noun
ellipse~геометрический эллипс~Planets orbit the central sun along an ellipse.~Планеты обращаются вокруг центрального солнца по эллипсу.~noun
hyperbola~кривая гипербола~The graph of an inverse proportion forms a hyperbola.~График обратной пропорциональности образует гиперболу.~noun
quadrilateral~четырёхугольник~A trapezoid is an irregular four-sided quadrilateral.~Трапеция — это неправильный четырёхугольник.~noun
polygon~многоугольник~Calculate the perimeter of the regular polygon.~Вычисли периметр правильного многоугольника.~noun
tangent~касательная прямая; тангенс~Draw a straight tangent line touching the circle once.~Проведи прямую касательную, касающуюся окружности один раз.~noun
cosine~тригонометрический косинус~Apply the law of cosines to find the third triangle side.~Примени теорему косинусов для нахождения третьей стороны.~noun
sine~тригонометрический синус~The oscillating wave follows a periodic sine curve.~Колеблющаяся волна повторяет периодическую синусоиду.~noun
infinity~математическая бесконечность~The infinite series converges toward mathematical infinity.~Бесконечный ряд расходится к математической бесконечности.~noun
tautology~логическая тавтология~A proposition true in every interpretation is a tautology.~Утверждение, истинное при любой интерпретации — тавтология.~noun`);
  add('topics','Physics and energy','noun',`
quantum~квант энергии~Photons represent the fundamental quantum of light.~Фотоны представляют собой фундаментальный квант света.~noun
photon~фотон; частица света~A photon carries electromagnetic radiant energy.~Фотон несёт электромагнитную лучистую энергию.~noun
electron~отрицательный электрон~Electrons orbit the dense positively charged atomic nucleus.~Электроны обращаются вокруг положительного ядра атома.~noun
proton~положительный протон~Protons and neutrons reside inside the atomic nucleus.~Протоны и нейтроны находятся внутри атомного ядра.~noun
neutron~нейтральный нейтрон~Fission releases high-velocity energetic neutrons.~Деление ядер высвобождает высокоэнергетические нейтроны.~noun
inertia~инерция покоя или движения~Inertia keeps the heavy flywheel spinning smoothly.~Инерция поддерживает плавное вращение маховика.~noun
momentum~импульс; количество движения~Conservation of momentum governs elastic collisions.~Закон сохранения импульса управляет упругими соударениями.~noun
kinetic~кинетический (об энергии)~A rolling bowling ball possesses kinetic energy.~Катящийся шар для боулинга обладает кинетической энергией.~adjective
potential~потенциальная энергия~Water behind the hydroelectric dam stores potential energy.~Вода за плотиной гидроэлектростанции запасает энергию.~adjective
thermodynamics~термодинамика~The second law of thermodynamics governs heat transfer.~Второй закон термодинамики управляет теплопередачей.~noun
conduction~теплопроводность материалов~Metal pots transfer heat efficiently by thermal conduction.~Металлические кастрюли эффективно передают тепло теплопроводностью.~noun
convection~тепловая конвекция газов и жидкостей~Warm air rises toward the ceiling through thermal convection.~Тёплый воздух поднимается к потолку благодаря конвекции.~noun
radiation~тепловое или ионизирующее излучение~The radiant sun warms the Earth through solar radiation.~Солнце согревает Землю посредством солнечного излучения.~noun
watt~ватт (единица мощности)~A sixty-watt LED bulb illuminates the study room.~Светодиодная лампа в шестьдесят ватт освещает кабинет.~noun
joule~джоуль (единица энергии)~Work is measured internationally in units of joules.~Работа измеряется в международной системе в джоулях.~noun`);
  add('topics','Chemistry and materials','noun',`
solvent~жидкий растворитель~Water is considered the universal polar solvent in chemistry.~Вода считается универсальным полярным растворителем в химии.~noun
solute~растворённое вещество~Salt crystals act as the dissolved solute in brine.~Кристаллы соли выступают растворённым веществом в рассоле.~noun
precipitate~химический осадок в реакции~A milky white precipitate settled at the test tube bottom.~Белый осадок осел на дно пробирки.~noun
distillation~перегонка; дистилляция~Fractional distillation separates crude oil components.~Фракционная перегонка разделяет компоненты сырой нефти.~noun
filtration~фильтрация через мембрану~Paper filtration traps insoluble solid particles cleanly.~Бумажная фильтрация надёжно улавливает твёрдые частицы.~noun
isotope~изотоп химического элемента~Carbon-14 is an unstable radioactive isotope.~Углерод-14 — это нестабильный радиоактивный изотоп.~noun
valence~валентность атома~Carbon typically exhibits a chemical valence of four.~Углерод обычно проявляет химическую валентность четыре.~noun
oxidation~реакция окисления~Rusting iron is a familiar example of slow oxidation.~Ржавление железа — привычный пример медленного окисления.~noun
reduction~реакция восстановления~Reduction involves the gain of electrons by an atom.~Восстановление включает присоединение электронов атомом.~noun
titration~аналитическое титрование~Perform acid-base titration using a graduated glass burette.~Проведи кислотно-основное титрование с помощью бюретки.~noun
ceramic~керамический материал~Heat-resistant ceramic tiles shield spacecraft reentry.~Термостойкие керамические плитки защищают космический аппарат.~noun
composite~композитный материал~Carbon-fiber composite forms the aircraft fuselage.~Углепластиковый композит образует фюзеляж самолёта.~noun
viscosity~вязкость жидкости~Warm honey flows easily due to decreased fluid viscosity.~Тёплый мёд течёт легко благодаря снижению вязкости.~noun
corrosion~коррозия металлов~Galvanizing steel with zinc prevents galvanic corrosion.~Оцинковка стали цинком предотвращает коррозию.~noun
amorphous~аморфный (о структуре)~Window glass is an amorphous non-crystalline solid.~Оконное стекло — аморфное некристаллическое твёрдое тело.~adjective`);
  add('topics','Biology and genetics','noun',`
mitosis~клеточное деление митоз~Somatic cells replicate faithfully through mitosis.~Соматические клетки точно воспроизводятся через митоз.~noun
meiosis~редукционное деление мейоз~Meiosis generates genetically diverse haploid gametes.~Мейоз производит генетически разнообразные гаметы.~noun
allele~аллель гена~Recessive alleles express traits only when paired.~Рецессивные аллели проявляют признаки только в паре.~noun
phenotype~внешний фенотип организма~Environmental factors interact to shape physical phenotype.~Факторы среды взаимодействуют, формируя фенотип.~noun
genotype~генетический генотип~DNA sequencing determines the underlying organism genotype.~Секвенирование ДНК определяет исходный генотип организма.~noun
nucleotide~нуклеотид цепи ДНК~Adenine pairs with thymine in the DNA nucleotide sequence.~Аденин соединяется с тимином в нуклеотидной цепи ДНК.~noun
ribosome~клеточная рибосома~Ribosomes synthesize cellular proteins by translating mRNA.~Рибосомы синтезируют клеточные белки, транслируя мРНК.~noun
mitochondria~митохондрии (энергетические станции клетки)~Mitochondria generate cellular energy in the form of ATP.~Митохондрии вырабатывают клеточную энергию в виде АТФ.~noun
chloroplast~хлоропласт растительной клетки~Chloroplasts absorb sunlight to fuel photosynthesis.~Хлоропласты поглощают солнечный свет для фотосинтеза.~noun
membrane~биологическая мембрана~The lipid bilayer plasma membrane regulates molecule entry.~Липидная плазматическая мембрана регулирует вход молекул.~noun
cytoplasm~цитоплазма клетки~Organelles float suspended within the gelatinous cytoplasm.~Органеллы плавают во взвешенном состоянии в цитоплазме.~noun
pathogen~болезнетворный патоген~Vaccines stimulate immunity to neutralize bacterial pathogens.~Вакцины стимулируют иммунитет для борьбы с патогенами.~noun
antibody~защитное антитело~Plasma cells secrete specific antibodies to bind antigens.~Плазматические клетки выделяют антитела для связывания антигенов.~noun
homeostasis~гомеостаз; постоянство среды~Sweating helps maintain physiological temperature homeostasis.~Потоотделение помогает поддерживать температурный гомеостаз.~noun
symbiosis~биологический симбиоз~Mycorrhizal fungi live in mutually beneficial plant symbiosis.~Микоризные грибы живут во взаимовыгодном симбиозе с растениями.~noun
metabolism~обмен веществ; метаболизм~Thyroid hormones regulate the baseline basal metabolism.~Гормоны щитовидной железы регулируют базовый метаболизм.~noun
hormone~биологический гормон~Insulin is an essential metabolic regulating peptide hormone.~Инсулин — жизненно важный пептидный гормон регуляции.~noun
parasite~биологический паразит~Fleas and ticks are external blood-feeding parasites.~Блохи и клещи — наружные кровососущие паразиты.~noun
heredity~биологическая наследственность~Mendel discovered the foundational laws of plant heredity.~Мендель открыл фундаментальные законы наследственности.~noun
ecosystem~экосистема биоценоза~Trophic energy cascades cascade through the complex ecosystem.~Пищевые энергетические цепочки проходят через сложную экосистему.~noun`);
  add('topics','Earth science and geology','noun',`
basalt~вулканический базальт~Solidified oceanic crust consists of dense dark basalt.~Затвердевшая океаническая кора состоит из плотного базальта.~noun
granite~магматический гранит~The mountain summit is sculpted from pale crystalline granite.~Вершина горы сложена из светлого кристаллического гранита.~noun
sandstone~осадочный песчаник~Desert winds sculpted ancient arches out of porous sandstone.~Пустынные ветры выточили древние арки из песчаника.~noun
limestone~осадочный известняк~Rainwater slowly carves deep cave caverns into limestone.~Дождевая вода медленно вытачивает пещеры в известняке.~noun
geode~минеральная жеода~Cracking open the hollow stone revealed a sparkling amethyst geode.~Раскалывание камня открыло сверкающую аметистовую жеоду.~noun
moraine~ледниковая морена~Retreating glaciers deposited ridges of rocky moraine.~Отступающие ледники отложили гряды каменистой морены.~noun
stalactite~пещерный сталактит~Limestone mineral waters formed a hanging calcite stalactite.~Минеральные воды сформировали свисающий сталактит.~noun
stalagmite~пещерный сталагмит~Mineral drops dripping onto cave floors build a stalagmite.~Капли, падающие на пол пещеры, образуют сталагмит.~noun
aquifer~водоносный горизонт~Wells tap into deep subterranean limestone water aquifers.~Колодцы черпают воду из глубоких известняковых водоносных пластов.~noun
subduction~тектоническая субдукция плит~Oceanic plate subduction triggers deep coastal earthquakes.~Погружение океанической плиты вызывает землетрясения.~noun
rift~тектонический рифт; разлом~A massive continental rift slowly pulls the tectonic valley apart.~Континентальный разлом медленно расширяет долину.~noun
geyser~термальный гейзер~Boiling water erupted from the Yellowstone volcanic geyser.~Кипящая вода вырвалась из вулканического гейзера.~noun
sedimentary~осадочный (о породе)~Shale and chalk are common stratified sedimentary rocks.~Сланец и мел — распространённые осадочные породы.~adjective
igneous~магматический (о породе)~Obsidian and pumice are glassy volcanic igneous formations.~Обсидиан и пемза — вулканические магматические породы.~adjective
metamorphic~метаморфический (о породе)~Intense underground heat bakes shale into metamorphic slate.~Подземный жар превращает сланец в метаморфический сланец.~adjective
fossilization~окаменение остатков организмов~Rapid burial in river mud promoted delicate shell fossilization.~Быстрое погребение в иле способствовало окаменению раковин.~noun`);
  add('topics','Space and astronomy','noun',`
telescope~астрономический телескоп~The space observatory telescope captures distant infrared nebulae.~Космический телескоп улавливает далёкие туманности.~noun
satellite~искусственный или естественный спутник~Communication satellites orbit Earth in geostationary paths.~Спутники связи обращаются по геостационарным орбитам.~noun
cosmonaut~космонавт; исследователь космоса~The veteran cosmonaut completed a six-hour spacewalk.~Опытный космонавт совершил шестичасовой выход в открытый космос.~noun
astronaut~астронавт космической программы~Astronauts conduct biological microgravity experiments aboard the station.~Астронавты проводят эксперименты в невесомости.~noun
meteor~падающий метеор; болид~A glowing green meteor streaked across the dark night sky.~Светящийся зелёный метеор прочертил тёмное ночное небо.~noun
meteorite~упавший метеорит~Scientists analyzed metallic iron inclusions inside the recovered meteorite.~Учёные проанализировали вкрапления в найденном метеорите.~noun
eclipse~солнечное или лунное затмение~Spectators wore protective filtered glasses to view the solar eclipse.~Зрители надели защитные очки для наблюдения затмения.~noun
pulsar~нейтронная звезда пульсар~A rapidly rotating pulsar emits rhythmic beams of radio waves.~Пульсар испускает ритмичные пучки радиоволн.~noun
quasar~квазар; активное ядро галактики~The brilliant energetic quasar outshines a thousand normal galaxies.~Энергичный квазар затмевает тысячу обычных галактик.~noun
light-year~световой год~Proxima Centauri lies four light-years away from our solar system.~Проксима Центавра находится в четырёх световых годах от нас.~noun
exoplanet~экзопланета у далекой звезды~Astronomers discovered a rocky habitable-zone exoplanet.~Астрономы открыли скалистую экзопланету в обитаемой зоне.~noun
zenith~астрономический зенит~The midday sun reached its highest point at the celestial zenith.~Полуденное солнце достигло наивысшей точки в зените.~noun
solstice~летнее или зимнее солнцестояние~Summer solstice marks the longest daytime daylight of the year.~Летнее солнцестояние знаменует самый длинный день в году.~noun
equinox~весеннее или осеннее равноденствие~Day and night have equal length across the globe on the equinox.~День и ночь имеют равную длину в день равноденствия.~noun
crater~метеоритный кратер на Луне~Impact craters pockmark the airless surface of the Moon.~Ударные кратеры покрывают безвоздушную поверхность Луны.~noun
aurora~полярное сияние~Green curtains of aurora borealis rippled above northern fjords.~Зелёные занавеси полярного сияния колыхались над фьордами.~noun
observatory~астрономическая обсерватория~The mountaintop dome observatory houses a giant optical mirror.~Горная обсерватория вмещает гигантское оптическое зеркало.~noun`);
  add('topics','Psychology and neuroscience','noun',`
subconscious~подсознание; подсознательный~Dream symbolism often reflects subconscious emotional anxieties.~Символика снов часто отражает подсознательные тревоги.~noun
instinct~природный инстинкт~Migrating swallows navigate vast continents by innate instinct.~Перелётные ласточки ориентируются благодаря врождённому инстинкту.~noun
reflex~безусловный или условный рефлекс~Tapping the patellar tendon elicits a sudden knee-jerk reflex.~Удар по сухожилию вызывает коленный рефлекс.~noun
cortex~кора головного мозга~The cerebral prefrontal cortex governs executive planning decisions.~Префронтальная кора мозга управляет планированием решений.~noun
dopamine~нейромедиатор дофамин~Rewarding accomplishment triggers a pleasurable release of dopamine.~Успешное достижение цели вызывает выброс дофамина.~noun
serotonin~нейромедиатор серотонин~Sunlight exposure elevates brain levels of stabilizing serotonin.~Пребывание на солнце повышает уровень серотонина в мозге.~noun
neuroplasticity~нейропластичность мозга~Adult brains form novel neural connections through neuroplasticity.~Мозг взрослого образует новые связи благодаря нейропластичности.~noun
amnesia~потеря памяти; амнезия~Concussion caused temporary retrograde amnesia in the injured player.~Сотрясение вызвало временную амнезию у травмированного игрока.~noun
empathy~эмпатия; сопереживание~Empathetic counselors listen with deep compassion and understanding.~Чуткие консультанты слушают с глубоким сопереживанием.~noun
introvert~интроверт (психотип)~An introvert recharges mental energy through quiet solitary reading.~Интроверт восстанавливает душевные силы за тихим чтением.~noun
extrovert~экстраверт (психотип)~Extroverts thrive in dynamic collaborative team environments.~Экстраверты расцветают в динамичной командной среде.~noun
phobia~иррациональный страх; фобия~Gradual exposure therapy helps patients overcome a severe phobia.~Терапия помогает пациентам преодолеть сильную фобию.~noun
trauma~психологическая травма~Supportive group counseling aids recovery from emotional trauma.~Групповые занятия помогают оправиться от душевной травмы.~noun
resilience~психологическая стойкость~Developing psychological resilience equips people for hardship.~Развитие психологической стойкости готовит людей к трудностям.~noun
cognitive~когнитивный; познавательный~Puzzles stimulate cognitive mental flexibility in older adults.~Головоломки стимулируют когнитивную гибкость у пожилых.~adjective`);
  add('topics','Society, economics and politics','noun',`
democracy~демократия; народовластие~Transparent voting procedures underpin a healthy representative democracy.~Прозрачные выборы лежат в основе представительской демократии.~noun
republic~республиканский строй; республика~Citizens elected a head of state in the parliamentary republic.~Граждане избрали главу государства в парламентской республике.~noun
monarchy~конституционная монархия~The royal sovereign acts as a symbol in the constitutional monarchy.~Монарх выступает символом в конституционной монархии.~noun
legislation~законодательство; законы~Parliament passed landmark environmental protection legislation.~Парламент принял важные законы об охране окружающей среды.~noun
referendum~общенародный референдум~Voters approved the regional constitutional amendment via referendum.~Избиратели одобрили поправку к конституции на референдуме.~noun
diplomacy~международная дипломатия~Trained envoys resolved the trade impasse through quiet diplomacy.~Опытные послы разрешили тупик с помощью дипломатии.~noun
treaty~международный договор; пакт~Twelve nations signed the historic nuclear non-proliferation treaty.~Двенадцать стран подписали исторический договор о нераспространении.~noun
welfare~социальное благосостояние~Universal public healthcare is a pillar of national social welfare.~Общедоступное здравоохранение — опора благосостояния.~noun
subsidy~государственная субсидия~Government renewable subsidies lowered home solar panel costs.~Государственные субсидии снизили стоимость солнечных панелей.~noun
tariff~таможенный тариф; пошлина~The ministry imposed retaliatory tariffs on imported steel bars.~Министерство ввело ответные пошлины на импортную сталь.~noun
monopoly~коммерческая монополия~Antitrust regulators investigated the corporate telecommunications monopoly.~Антимонопольные органы расследовали монополию в связи.~noun
deficit~бюджетный дефицит~Cutting wasteful municipal spending curtailed the public deficit.~Сокращение растрат сократило дефицит бюджета.~noun
surplus~профицит; излишек бюджета~The export economy generated an impressive multi-billion trade surplus.~Экспортная экономика показала внушительный торговый профицит.~noun
gdp~валовой внутренний продукт (ВВП)~Real GDP grew at an annual rate of three percent.~Реальный ВВП вырос на три процента за год.~noun
civil rights~гражданские права и свободы~Generations of activists marched to secure equal civil rights.~Поколения активистов боролись за равные гражданские права.~noun
sovereignty~государственный суверенитет~Treaties respect the territorial integrity and national sovereignty.~Договоры уважают целостность и государственный суверенитет.~noun`);
  add('topics','History and archaeology','noun',`
prehistory~доисторическая эпоха~Cave paintings provide glimpses into Stone Age human prehistory.~Наскальные рисунки дают представление о доисторической эпохе.~noun
antiquity~классическая античность~Philosophers of classical Greco-Roman antiquity debated ethics.~Философы классической античности обсуждали этику.~noun
medieval~средневековый~Sturdy stone ramparts protected the medieval walled city.~Прочные каменные валы защищали средневековый город.~adjective
renaissance~эпоха Возрождения; Ренессанс~The Italian Renaissance witnessed an explosion of fine art.~Итальянский Ренессанс ознаменовался расцветом изящных искусств.~noun
pyramid~монументальная гробница пирамида~The monumental stone pyramid was built during the Old Kingdom.~Монументальная пирамида была возведена в эпоху Древнего царства.~noun
sarcophagus~каменный саркофаг~Archaeologists opened an unlooted carved limestone sarcophagus.~Археологи открыли неразграбленный резной саркофаг.~noun
hieroglyph~древнеегипетский иероглиф~Scholars deciphered ancient Egyptian hieroglyphs on the tablet.~Учёные расшифровали древнеегипетские иероглифы на табличке.~noun
tomb~усыпальница; склеп~Golden treasures were discovered within the royal pharaoh tomb.~Золотые сокровища были найдены в гробнице фараона.~noun
ruins~древние руины; развалины~Wild olive trees grow amid the crumbling temple ruins.~Дикие оливы растут среди развалин древнего храма.~noun
citadel~городская цитадель; крепость~The hilltop stone citadel withstood numerous historic sieges.~Горная каменная цитадель выдержала многочисленные осады.~noun
amphora~глиняная античная амфора~Divers recovered an intact Roman amphora filled with wine.~Водолазы подняли целую римскую амфору со следами вина.~noun
chronology~историческая хронология~Carbon dating established an exact archaeological site chronology.~Радиоуглеродный анализ установил точную хронологию стоянки.~noun
conquest~военное завоевание территорий~The Norman conquest of England reshaped law and language.~Нормандское завоевание Англии изменило законы и язык.~noun
treaty~исторический мирный договор~The peace treaty of Westphalia established sovereign borders.~Вестфальский мирный договор установил суверенные границы.~noun
palaeolithic~палеолитический; древнекаменный~Flint hand axes were typical tools of the Palaeolithic era.~Кремнёвые рубила были типичными орудиями эпохи палеолита.~adjective`);
  add('topics','Engineering and inventions','noun',`
blueprint~инженерный чертёж; проект~Examine the structural engineering blueprint before building.~Изучи инженерный чертёж конструкции перед постройкой.~noun
generator~электрогенератор; динамо-машина~The backup diesel generator supplies electricity to hospitals.~Резервный генератор подаёт электричество в больницы.~noun
motor~электрический двигатель; мотор~A brushless electric motor drives the wheel rotation.~Бесщёточный электродвигатель приводит во вращение колёса.~noun
valve~регулирующий клапан; вентиль~Turn the brass pressure relief valve counterclockwise.~Поверни латунный предохранительный клапан против стрелки.~noun
piston~поршень цилиндра двигателя~The combustion expanding gas pushes the alloy piston down.~Газ толкает поршень цилиндра вниз при сгорании.~noun
bearing~шарикоподшипник; подшипник~Lubricate the steel ball bearing to eliminate mechanical friction.~Смажь подшипник, чтобы устранить трение.~noun
conveyor~заводской ленточный конвейер~Assembled electronic boards travel along the conveyor belt.~Собранные платы движутся по ленточному конвейеру.~noun
automation~промышленная автоматизация~Factory robotic automation boosts precision manufacturing.~Заводская автоматизация повышает точность производства.~noun
semiconductor~кремниевый полупроводник~Silicon semiconductors power microprocessors in computers.~Кремниевые полупроводники лежат в основе процессоров.~noun
microchip~электронный микрочип~Billions of transistors are etched onto a single microchip.~Миллиарды транзисторов вытравлены на одном микрочипе.~noun
chassis~несущее шасси автомобиля~The reinforced aluminium chassis reduces overall vehicle weight.~Алюминиевое шасси снижает общий вес автомобиля.~noun
hydraulics~гидравлическая силовая система~Excavators rely on fluid hydraulics to lift heavy boulders.~Экскаваторы используют гидравлику для подъёма валунов.~noun
pneumatics~пневматическая система привода~Pneumatics uses compressed air to operate factory robotic arms.~Пневматика использует сжатый воздух для роботов-манипуляторов.~noun
welding~сварка металлических конструкций~Automated laser welding joins automotive sheet metal seams.~Лазерная сварка соединяет швы листового металла.~noun
tolerance~допуск размеров при обработке~Aerospace parts require machining tolerance within microns.~Авиационные детали требуют допусков в пределах микронов.~noun
efficiency~коэффициент полезного действия~Solar panel conversion efficiency increased to twenty-four percent.~КПД преобразования солнечных панелей вырос до 24%.~noun
cad~система автоматизированного проектирования (САПР)~Mechanical drafters design three-dimensional parts in CAD.~Конструкторы проектируют трёхмерные детали в САПР.~noun
telemetry~дистанционная телеметрия датчиков~Rocket engineers analyzed live orbital engine telemetry.~Инженеры ракеты анализировали телеметрию двигателей в полёте.~noun`);
  add('topics','Statistics and data','noun',`
mode~статистическая мода величин~The mode represents the most frequently occurring value.~Мода представляет собой наиболее часто встречающееся значение.~noun
standard deviation~стандартное квадратичное отклонение~A low standard deviation shows data clustered around mean.~Низкое отклонение показывает кучность данных вокруг среднего.~noun
percentile~процентиль распределения~Scoring in the ninety-fifth percentile is an outstanding score.~Результат в 95-м процентиле — выдающийся балл.~noun
histogram~статистическая гистограмма~Plot the frequency distribution table as a bar histogram.~Построй распределение частот в виде гистограммы.~noun
scatterplot~диаграмма рассеяния точек~The scatterplot revealed a strong positive linear correlation.~Диаграмма рассеяния выявила линейную корреляцию.~noun
regression~регрессионный математический анализ~Linear regression models predict sales trends based on history.~Линейная регрессия прогнозирует продажи по истории.~noun
hypothesis testing~проверка статистических гипотез~Conduct rigorous hypothesis testing to rule out chance.~Проведи проверку гипотез, чтобы исключить случайность.~noun
null hypothesis~нулевая гипотеза об отсутствии эффекта~Researchers rejected the null hypothesis at significance level.~Исследователи отвергли нулевую гипотезу на уровне значимости.~noun
p-value~статистическое значение p-value~A small p-value indicates statistically significant findings.~Малое значение p-value указывает на статистическую значимость.~noun
covariance~ковариация двух случайных величин~Calculate the sample covariance between height and weight.~Вычисли выборочную ковариацию между ростом и весом.~noun
aggregate~агрегировать числовые показатели~Aggregate individual survey responses into quarterly summaries.~Агрегируй ответы опроса в квартальные сводки.~verb
inference~статистический логический вывод~Statistical inference draws conclusions about populations.~Статистический вывод делает заключения о генеральной совокупности.~noun
skewness~асимметрия кривой распределения~Income distribution curves exhibit pronounced rightward skewness.~Кривые доходов демонстрируют выраженную асимметрию вправо.~noun
normal distribution~нормальное распределение Гаусса~Test scores in large cohorts conform to a normal distribution.~Баллы тестов соответствуют нормальному распределению.~noun
raw data~необработанные первичные данные~Clean the spreadsheet of missing entries in raw data.~Очисти таблицу от пропусков в первичных данных.~noun
analytics~аналитика больших данных~Predictive business analytics informs smart inventory decisions.~Предиктивная аналитика помогает решениям по складским запасам.~noun
trendline~линия тренда на графике~Add a polynomial trendline to visualize temperature shifts.~Добавь линию тренда, чтобы наглядно показать динамику.~noun`);
  add('topics','Philosophy and ethics','noun',`
metaphysics~философская метафизика~Metaphysics explores the fundamental nature of reality and being.~Метафизика исследует природу реальности и бытия.~noun
epistemology~теория познания; гносеология~Epistemology questions how human knowledge is acquired.~Теория познания исследует, как приобретается знание.~noun
ontology~онтология; учение о бытии~Ontology classifies entities into categories of existence.~Онтология классифицирует сущности по категориям существования.~noun
utilitarianism~утилитаризм в этике~Utilitarianism advocates actions that maximize greatest happiness.~Утилитаризм поощряет действия во благо большинства.~noun
deontology~деонтологическая этика долга~Kantian deontology bases moral action on categorical duties.~Кантовская деонтология основывает мораль на категорическом долге.~noun
virtue~моральная добродетель; достоинство~Courage and honesty are foundational classical virtues.~Мужество и честность — основополагающие добродетели.~noun
morality~нравственность; мораль общества~Universal human morality respects bodily autonomy.~Общечеловеческая мораль уважает автономию личности.~noun
altruism~бескорыстный альтруизм~Genuine altruism inspires people to help strangers in need.~Искренний альтруизм побуждает помогать незнакомцам.~noun
determinism~философский детерминизм~Hard determinism argues every event is caused by antecedents.~Жёсткий детерминизм утверждает обусловленность всех событий.~noun
existentialism~философский экзистенциализм~Existentialism emphasizes individual freedom and responsibility.~Экзистенциализм подчёркивает свободу и ответственность.~noun
rationalism~философский рационализм~Rationalism regards reason as the primary source of truth.~Рационализм считает разум главным источником истины.~noun
empiricism~философский эмпиризм~Empiricism asserts that sensory experience generates knowledge.~Эмпиризм утверждает, что опыт порождает знание.~noun
dialectic~философская диалектика~Hegelian dialectic moves through thesis, antithesis, and synthesis.~Гегелевская диалектика идёт через тезис, антитезис и синтез.~noun
nihilism~философский нигилизм~Nihilism rejects inherent universal meaning or moral values.~Нигилизм отвергает изначальный смысл или ценности.~noun
stoicism~философия стоицизма~Stoicism teaches tranquility by accepting events outside control.~Стоицизм учит спокойствию через принятие происходящего.~noun
paradox~логический парадокс~The ship of Theseus is an enduring identity paradox.~Корабль Тесея — давний парадокс идентичности.~noun
syllogism~логический силлогизм~All humans are mortal is the major premise of the syllogism.~Все люди смертны — главная посылка силлогизма.~noun
fallacy~логическая ошибка в рассуждениях~Attacking the person rather than the argument is an ad hominem fallacy.~Атака на человека вместо аргумента — логическая ошибка.~noun`);
  add('topics','Visual arts and painting','noun',`
easel~художественный мольберт~The painter secured the stretched linen canvas onto the wooden easel.~Художник закрепил холст на деревянном мольберте.~noun
palette~палитра для красок~Mix glowing oil colours on a flat wooden artist palette.~Смешивай масляные краски на плоской деревянной палитре.~noun
acrylic~акриловая художественная краска~Fast-drying water-based acrylic paint cleans up with water.~Быстросохнущая акриловая краска легко смывается водой.~noun
tempera~яичная темпера~Renaissance masters painted icon panels in egg tempera.~Мастера Возрождения писали иконы яичной темперой.~noun
sketch~набросок карандашом; эскиз~Make a preliminary pencil sketch before applying oil paint.~Сделай предварительный набросок перед нанесением масла.~noun
mural~настенная роспись; мурал~The vibrant community street mural covers the community wall.~Яркий мурал украшает стену общественного центра.~noun
mosaic~смальтовая мозаика~Gilded Byzantine smalt mosaic tiles decorated church domes.~Византийская мозаика из золотой смальты украшала купола.~noun
engraving~гравюра на меди или дереве~Dürer mastered detailed black-and-white copper engraving.~Дюрер мастерски владел чёрно-белой гравюрой на меди.~noun
etching~офорт; травленая гравюра~Rembrandt produced expressive master etchings on paper.~Рембрандт создавал выразительные офорты на бумаге.~noun
lithography~литография; плоская печать~Artists draw on polished limestone blocks in lithography.~Художники рисуют на полированном известняке в литографии.~noun
collage~художественный коллаж~Assemble torn paper clippings into a surrealist photo collage.~Собери обрывки бумаги в сюрреалистический коллаж.~noun
brushstroke~мазок художественной кисти~Bold expressive brushstrokes convey raw physical emotion.~Смелые мазки кисти передают яркую эмоциональность.~noun
monochrome~одноцветный; монохромный~The stark monochrome black-and-white painting emphasizes geometry.~Монохромная картина подчёркивает геометрию.~adjective
tint~светлый цветовой оттенок~Add white titanium pigment to create a pastel color tint.~Добавь белила, чтобы получить пастельный оттенок цвета.~noun
shade~тёмный оттенок цвета; тень~Deep umber adds a rich brown shade to shadows.~Тёмная умбра добавляет глубокий коричневый оттенок теням.~noun
highlight~блик света на предмете~Apply a touch of pure white to form the specular highlight.~Нанеси каплю белил, чтобы сформировать блик света.~noun
gallery~картинная галерея; выставочный зал~The national art gallery purchased an impressionist canvas.~Национальная галерея приобрела импрессионистский холст.~noun
varnish~защитный лак для картин~Apply clear dammar varnish over the fully cured oil painting.~Нанеси защитный лак поверх высохшей картины.~noun
glaze~лессировка прозрачной краской~Translucent glazes of amber paint produce luminous depth.~Прозрачные лессировки янтарной краски дают глубину.~noun
composition~композиция произведения искусства~Dynamic triangular balance organizes the classical composition.~Треугольный баланс организует классическую композицию.~noun`);
  add('topics','Sculpture and ceramics','noun',`
chisel~скульптурное долото; резец~Carve fine stone details with a tempered steel chisel.~Высекай мелкие детали камня закалённым стальным долотом.~noun
mallet~деревянная или резиновая киянка~Strike the stone carving chisel firmly with a round wooden mallet.~Ударяй по резцу деревянной киянкой.~noun
terracotta~обожжённая глина терракота~Ancient warriors were sculpted from unglazed red terracotta.~Древние воины были вылеплены из обожжённой терракоты.~noun
porcelain~тонкий белый фарфор~Delicate translucent porcelain cups ring like bells.~Тонкие полупрозрачные фарфоровые чашки звенят как колокольчики.~noun
stoneware~каменная керамика высокой прочности~Durable stoneware bowls withstand oven baking temperatures.~Посуда из каменной керамики выдерживает жар духовки.~noun
pottery wheel~гончарный гончарный круг~Center a lump of damp grey clay on the spinning pottery wheel.~Отцентруй кусок глины на вращающемся гончарном круге.~noun
armature~внутренний проволочный каркас скульптуры~Build a sturdy metal wire armature to support clay modeling.~Сделай проволочный каркас для лепки из глины.~noun
casting~отливка скульптуры в металле~Bronze foundry casting requires molten liquid metal.~Отливка бронзы в литейной требует жидкого металла.~noun
mold~литьевая форма; матрица~Pour liquid plaster into the silicone elastomer mold.~Залей жидкий гипс в силиконовую литьевую форму.~noun
statue~монументальная статуя~A marble statue of Athena stands outside the academy.~Мраморная статуя Афины стоит у здания академии.~noun
figurine~небольшая декоративная статуэтка~An ivory figurine was discovered in the royal burial mound.~Статуэтка из кости была найдена в царском кургане.~noun
pedestal~постамент памятника; пьедестал~Erect the heavy bronze monument upon a polished granite pedestal.~Установи бронзовый монумент на гранитный пьедестал.~noun
enamel~керамическая декоративная эмаль~Melted vitreous enamel produces jewel-toned surface colors.~Стекловидная эмаль даёт яркие цвета драгоценных камней.~noun
bisque~бисквит; обожжённая неглазурованная глина~Fire greenware clay pieces once to create durable bisque.~Об обожги глину один раз, чтобы получить бисквитный черепок.~noun
slab~глиняный пласт для лепки~Roll out an even clay slab with a rolling pin.~Раскатай ровный пласт глины скалкой.~noun
pinch pot~лепная чаша, сформированная пальцами~Beginners shape a small pinch pot from a ball of clay.~Новички лепят чашу пальцами из шарика глины.~noun
patina~благородная патина на бронзе~Centuries of weathering imparted an emerald green patina.~Века на открытом воздухе придали бронзе изумрудную патину.~noun`);
  add('topics','Architecture and design','noun',`
buttress~подпорная каменная стена; контрфорс~Flying stone buttresses support towering Gothic cathedral roofs.~Аркбутаны поддерживают крыши готических соборов.~noun
spire~остроконечный шпиль башни~The needle-thin cathedral spire pierced the morning mist.~Тонкий шпиль собора пронзал утренний туман.~noun
colonnade~архитектурная колоннада~A grand marble colonnade encircles the public temple plaza.~Мраморная колоннада окружает площадь храма.~noun
corbel~опорный кронштейн; консоль~Carved limestone corbels project out to bear the gallery weight.~Резные кронштейны выступают для поддержки галереи.~noun
pediment~треугольный фронтон здания~Classical carved mythological relief sculpture decorates the pediment.~Рельефные скульптуры украшают фронтон здания.~noun
frieze~декоративный скульптурный фриз~The Parthenon sculpted marble frieze depicts horsemen.~Мраморный фриз Парфенона изображает всадников.~noun
cornice~венчающий карниз здания~Rainwater runs off the projecting terracotta roof cornice.~Дождевая вода стекает с выступающего карниза крыши.~noun
cupola~небольшой декоративный купол; бельведер~Climb up to the rooftop cupola for panoramic city views.~Поднимись в купол на крыше ради панорамных видов.~noun
cantilever~консольная выступающая балка~A dramatic reinforced concrete cantilever balcony juts out.~Железобетонный консольный балкон выступает наружу.~noun
truss~несущая стропильная ферма~Exposed timber roof trusses add rustic warmth to the barn.~Деревянные фермы крыши добавляют тепла помещению.~noun
facade~главный фасад здания~The symmetrical stone facade overlooks the garden terrace.~Симметричный каменный фасад выходит на террасу сада.~noun
atrium~центральный атриум со стеклянной крышей~Sunlight floods down through the glass-roofed central atrium.~Солнечный свет заливает центральный атриум со стеклянной крышей.~noun
skylight~зенитный фонарь в крыше~Install a double-glazed roof skylight to illuminate the studio.~Установи мансардное окно, чтобы осветить мастерскую.~noun
fenestration~расположение окон на фасаде~Rhythmic orderly fenestration creates harmonious exterior proportions.~Ритмичное расположение окон создаёт гармонию фасада.~noun
arcade~арочная галерея; аркада~Shoppers strolled beneath the sheltered outdoor stone arcade.~Покупатели прогуливались под каменной аркадой.~noun
rotunda~круглое купольное здание; ротонда~The state library rotunda boasts concentric reading desks.~Ротонда государственной библиотеки имеет концентрические столы.~noun`);
  add('topics','Music and instruments','noun',`
trumpet~медная духовая труба~A shining brass trumpet heralded the commencement of fanfare.~Медная труба возвестила о начале торжественных фанфар.~noun
trombone~духовой инструмент тромбон~The jazz musician moved the slide of the brass trombone.~Джазовый музыкант двигал кулису медного тромбона.~noun
clarinet~деревянный духовой кларнет~The wooden black clarinet played a warm lyrical solo.~Кларнет исполнил тёплое лирическое соло.~noun
saxophone~джазовый саксофон~A golden curved alto saxophone poured sultry melodies.~Саксофон наполнил клуб чувственными мелодиями.~noun
bassoon~басовый духовой инструмент фагот~The double-reed bassoon provided deep comical staccato notes.~Фагот обеспечил глубокие отрывистые басовые ноты.~noun
guitar~акустическая или электрогитара~Strum gentle nylon chords on the classical Spanish guitar.~Перебирай нейлоновые струны на классической гитаре.~noun
harp~концертная струнная арфа~The harpist plucked cascading arpeggios on the pedal harp.~Арфистка извлекала каскады арпеджио на педальной арфе.~noun
drum~ударный барабан~A snare drum beat kept the marching band in step.~Дробь малого барабана держала шаг оркестра.~noun
cymbals~металлические оркестровые тарелки~Crash the brass cymbals together at the musical climax.~Ударь медными тарелками друг о друга в кульминации.~noun
tambourine~бубен; тамбурин~Shake the jingling tambourine in time with the dancer steps.~Встряхивай бубен в такт шагам танцора.~noun
xylophone~деревянный ксилофон~Wooden mallets struck tuned wooden bars of the xylophone.~Деревянные палочки ударяли по пластинам ксилофона.~noun
organ~духовой клавишный орган~Pipe organ chords vibrated through the cathedral stone nave.~Аккорды органа вибрировали в каменном нефе собора.~noun
accordion~кнопочный или клавишный аккордеон~Bellows pumped air as he played a Parisian accordion waltz.~Меха качали воздух, пока он играл парижский вальс.~noun
harmonica~губная гармоника; гармошка~Blues melodies wailed from the handheld metal harmonica.~Блюзовые мелодии звучали из карманной гармоники.~noun
lute~старинная щипковая лютня~Troubadours accompanied ballads on the pear-shaped wooden lute.~Трубадуры аккомпанировали балладам на старинной лютне.~noun
mandolin~итальянская мандолина~Rapid tremolo picking resonated from the teardrop mandolin.~Быстрое тремоло звучало из мандолины.~noun
triangle~оркестровый металлический треугольник~A single strike of the steel triangle pierced the silence.~Один удар по стальному треугольнику пронзил тишину.~noun`);
  add('topics','Theatre, dance and performance','noun',`
curtain call~выход артистов на поклон~Actors took three bows during an enthusiastic curtain call.~Актёры трижды поклонились на восторженном вызове на поклон.~noun
proscenium~просцениум; авансцена~The gilded decorative proscenium framed the theater stage.~Позолоченный просцениум обрамлял сцену театра.~noun
backstage~кулисы; закулисье театра~Stagehands adjusted scenery rapidly backstage in dim light.~Рабочие сцены быстро меняли декорации за кулисами.~noun
costume~театральный сценический костюм~Elaborate historical Elizabethan costumes were made of velvet.~Исторические костюмы были сшиты из бархата.~noun
make-up~грим артиста; сценический макияж~Heavy theatrical stage make-up is visible under footlights.~Яркий театральный грим хорошо виден при рампе.~noun
scenery~театральные декорации~Painted rolling scenery transported the audience to Venice.~Расписные декорации перенесли публику в Венецию.~noun
prop~театральный реквизит; бутафория~Check that all stage props are arranged on the table.~Проверь, чтобы весь театральный реквизит лежал на столе.~noun
spotlight~театральный прожектор; софит~A brilliant white spotlight followed the ballerina across stage.~Яркий белый софит следовал за балериной по сцене.~noun
troupe~театральная труппа; коллектив~A touring international acrobatics troupe performed in town.~Гастролирующая труппа акробатов выступила в городе.~noun
playwright~драматург; автор пьес~The contemporary playwright tackled pressing societal dilemmas.~Современный драматург поднял острые вопросы общества.~noun
understudy~дублёр актёра; дублирующий состав~The talented understudy stepped in flawlessly on short notice.~Талантливый дублёр безупречно заменил актёра без подготовки.~noun
soliloquy~монолог персонажа наедине с собой~Hamlet contemplative soliloquy debates action and inaction.~Монолог Гамлета рассуждает о действии и бездействии.~noun
farce~театральный фарс; комедия положений~The uproarious bedroom farce kept the auditorium laughing.~Уморительный фарс заставлял зрительный зал смеяться.~noun
tragedy~классическая драматическая трагедия~Greek classical tragedy evokes profound emotional catharsis.~Классическая греческая трагедия вызывает катарсис.~noun
operetta~музыкальная комедия; оперетта~Strauss cheerful operettas sparkle with catchy waltz melodies.~Оперетты Штрауса искрятся запоминающимися вальсами.~noun
cabaret~кабаре; эстрадное представление~Satirical songs were performed in the smoky cellar cabaret.~Сатирические песни исполнялись в подвальном кабаре.~noun
stagehand~монтировщик сцены; рабочий театра~Stagehands dismantled the revolving platform overnight.~Монтировщики сцены разобрали платформу за ночь.~noun`);
  add('topics','Cinema and photography','noun',`
tripod~устойчивый штатив-тренога~Mount the digital camera firmly upon a carbon tripod.~Установи камеру на карбоновый штатив-треногу.~noun
focal length~фокусное расстояние объектива~A fifty-millimeter focal length mimics human visual eye perspective.~Фокусное расстояние 50 мм имитирует перспективу глаза.~noun
viewfinder~оптический видоискатель камеры~Look through the optical viewfinder to compose the portrait.~Смотри в оптический видоискатель для построения кадра.~noun
flash~фотовспышка импульсная~Bounce the diffused external flash off the white ceiling.~Направь рассеянную вспышку в белый потолок.~noun
polarizer~поляризационный светофильтр~A circular polarizer deepens blue skies and cuts reflections.~Поляризационный фильтр делает небо синее и убирает блики.~noun
cinematographer~кинооператор-постановщик~The chief cinematographer framed stunning panoramic vistas.~Главный кинооператор снял потрясающие панорамы.~noun
storyboard~раскадровка сцен фильма~Illustrators drew every action frame on the movie storyboard.~Художники нарисовали каждый кадр на раскадровке.~noun
montage~кинематографический монтаж~A fast-paced training montage compressed months into minutes.~Динамичный монтаж сжал месяцы тренировок в минуты.~noun
soundstage~звуковой павильон киностудии~Historical interior sets were erected inside the soundstage.~Исторические декорации были возведены в павильоне.~noun
voiceover~закадровый дикторский голос~An authoritative narrator voiceover explained the archival reel.~Закадровый голос диктора объяснял архивную хронику.~noun
clapperboard~кинохлопушка для синхронизации~The assistant snapped the wooden clapperboard to mark take one.~Ассистент щёлкнул хлопушкой, отмечая первый дубль.~noun
premiere~премьерный показ кинофильма~Celebrities walked the red carpet for the gala premiere.~Знаменитости прошли по красной дорожке на премьере.~noun
soundtrack~музыкальное сопровождение; саундтрек~An orchestral film soundtrack heightened the emotional suspense.~Оркестровый саундтрек усилил эмоциональное напряжение.~noun
subtitle~переводные титры кинокартины~Foreign language cinema is shown with original language subtitles.~Иностранные фильмы демонстрируются с субтитрами.~noun
cameo~эпизодическая роль знаменитости; камео~The famous director made a witty ten-second cameo.~Знаменитый режиссёр появился в забавном камео на десять секунд.~noun
post-production~постпроизводство; монтажный период~Color grading and sound mixing occur during post-production.~Цветокоррекция и сведение звука происходят на постпродакшене.~noun`);
  add('topics','Literature and storytelling','noun',`
protagonist~главный герой повествования~The flawed heroic protagonist struggled against injustice.~Главный герой боролся против несправедливости.~noun
antagonist~главный противник; антагонист~A ruthless villain served as the formidable antagonist.~Безжалостный злодей выступал главным антагонистом.~noun
climax~кульминация драматического сюжета~Tension reached its peak at the story thrilling climax.~Напряжение достигло пика в захватывающей кульминации.~noun
epilogue~заключительный эпилог книги~The reflective novel epilogue revealed characters future.~Эпилог романа раскрыл дальнейшую судьбу героев.~noun
prologue~вступительный пролог произведения~A mystical poetic prologue established the ancient legend.~Поэтический пролог познакомил читателя с легендой.~noun
chronicle~летопись; историческая хроника~The medieval monastery chronicle recounted royal reigns.~Хроника средневекового монастыря описала правление королей.~noun
parable~поучительная притча~Elders shared a moral parable about truth and greed.~Старейшины поделились притчей об истине и жадности.~noun
fable~басня с моралью~Aesop humorous animal fables conclude with practical morals.~Басни Эзопа о животных завершаются практической моралью.~noun
novella~короткий роман; повесть~The atmospheric seaside novella took two hours to read.~Атмосферная приморская повесть читалась за два часа.~noun
anthology~литературная антология произведений~Browse an anthology of contemporary lyric poetry.~Полистай антологию современной лирической поэзии.~noun
irony~литературная ирония~Dramatic literary irony occurs when the audience knows secrets.~Драматическая ирония возникает, когда зрители знают тайну.~noun
satire~острая социальная сатира~The author uses biting satire to ridicule political pomp.~Автор использует едкую сатиру, высмеивая спесь политиков.~noun
motif~сквозной художественный мотив~Light versus shadow is a recurring symbolic motif.~Свет против тени — повторяющийся символический мотив.~noun
dialogue~литературный диалог персонажей~Witty philosophical dialogue sparkles throughout the play.~Остроумный диалог искрится на протяжении всей пьесы.~noun
rhyme~поэтическая рифма~Ballad stanzas follow a simple musical four-line rhyme.~Строфы баллады следуют простой музыкальной рифме.~noun
meter~стихотворный ритмический размер~Shakespeare wrote plays predominantly in iambic meter.~Шекспир писал пьесы преимущественно ямбическим размером.~noun
ode~хвалебная лирическая ода~Keats composed a celebrated philosophical ode to a Grecian urn.~Китс сочинил знаменитую оду греческой урне.~noun
sonnet~классический сонет из 14 строк~A fourteen-line Petrarchan sonnet resolves its argument.~Четырнадцатистрочный сонет Петрарки разрешает спор.~noun
epic~героическая эпическая поэма~Homer composed the immortal Greek bronze age epic.~Гомер сочинил бессмертный древнегреческий эпос.~noun
manuscript~оригинальная рукопись автора~The handwritten draft manuscript contained marginal notes.~Рукопись черновика содержала авторские пометки на полях.~noun`);
  add('topics','Crafts, textiles and jewellery','noun',`
needle~швейная стальная игла~Thread a fine steel sewing needle with spun cotton.~Вдень швейную нитку в тонкую стальную иглу.~noun
thimble~металлический напёрсток~Wear a brass tailor thimble to protect your finger.~Надень напёрсток, чтобы защитить палец при шитье.~noun
scissors~портновские ножницы~Cut silk fabrics cleanly with sharp dressmaking scissors.~Режь шёлк острыми портновскими ножницами.~noun
spool~катушка ниток~Wind colorful embroidery thread onto a wooden spool.~Намотай нитки для вышивания на деревянную катушку.~noun
bobbin~шпуля швейной машины~Insert the lower wound thread bobbin into the machine.~Вставь намотанную шпульку в швейную машину.~noun
crochet~вязание крючком; крючок~She learned to crochet lace doilies from grandmother.~Она научилась вязать кружевные салфетки крючком у бабушки.~verb
knitting needle~спица для ручного вязания~Bamboo knitting needles glide smoothly through wool.~Бамбуковые спицы легко скользят по шерсти.~noun
gemstone~драгоценный камень; самоцвет~A brilliant cut emerald gemstone sparkled in the ring.~Огранённый изумруд сверкал в кольце.~noun
brooch~декоративная брошь~Pin an antique pearl brooch onto the wool jacket.~Приколи антикварную жемчужную брошь к жакету.~noun
bracelet~браслет на руку~A woven silver link bracelet adorned her right wrist.~Браслет из серебряных звеньев украшал её запястье.~noun
necklace~ожерелье; колье~Strands of natural river pearls formed the necklace.~Нити речного жемчуга составляли ожерелье.~noun
earring~серьга в ухо~Gold hoop earrings swung gently as she walked.~Золотые серьги-кольца покачивались при ходьбе.~noun
silversmith~мастер серебряных дел; ювелир~A skilled silversmith chased intricate scrollwork.~Мастер по серебру выбивал замысловатый узор.~noun
goldsmith~мастер золотых дел; ювелир~The master goldsmith set diamonds in platinum prongs.~Ювелир закрепил бриллианты в платиновых лапках.~noun
tapestry~тканый настенный гобелен~A medieval unicorn tapestry hung on the stone wall.~Средневековый гобелен с единорогом висел на стене.~noun
patchwork~лоскутное шитьё; пэчворк~Assemble geometric scraps of printed cotton in patchwork.~Собери лоскутки хлопка в технике пэчворк.~noun
origami~искусство оригами из бумаги~Fold a delicate paper crane using square origami sheets.~Сложи бумажного журавлика из листа для оригами.~noun`);
  add('topics','Culture, identity and customs','noun',`
tradition~вековая культурная традиция~Oral traditions keep communal ancestral memory alive.~Устные традиции сохраняют память предков.~noun
heritage~богатое культурное наследие~Preserving archaeological architectural heritage honors ancestors.~Сохранение архитектурного наследия чтит предков.~noun
ceremony~торжественный культурный обряд~The tea ceremony exemplifies mindfulness and hospitality.~Чайная церемония воплощает осознанность и гостеприимство.~noun
ritual~священный обряд; ритуал~Annual harvest rituals celebrate fertility and gratitude.~Обряды сбора урожая празднуют плодородие и благодарность.~noun
values~нравственные ценности народа~Honesty and familial devotion are core cultural values.~Честность и преданность семье — ключевые ценности.~noun
lineage~родословная; происхождение~He takes great pride in his family lineage.~Он очень гордится своей родословной.~noun
solidarity~взаимная солидарность; сплоченность~Communities expressed heartfelt solidarity during the crisis.~Сообщества проявили искреннюю солидарность в кризис.~noun
belief~духовное верование; убеждение~Traditional spiritual beliefs connect communities to nature.~Духовные верования связывают сообщества с природой.~noun
patrimony~родовое достояние; наследие отцов~Ancient monuments are part of national cultural patrimony.~Древние памятники — часть культурного достояния.~noun
multicultural~многокультурный; плюралистичный~Metropolitan cities thrive on multicultural vibrancy.~Крупные города процветают благодаря многообразию культур.~adjective
cohesion~социальная сплочённость коллектива~Strong social cohesion strengthens small neighborhood communities.~Крепкая сплочённость усиливает соседские сообщества.~noun
ancestor~предок рода; прародитель~Carved ancestor wooden totems stood guarding the entrance.~Деревянные тотемы предков охраняли вход в селение.~noun
kinship~кровное родство; узы родства~Extended kinship networks support young parents in villages.~Сети родственных связей поддерживают молодых родителей.~noun
folklore~устное народное творчество~Scholars collected regional folklore songs and riddles.~Учёные собрали народные песни и загадки региона.~noun
costume~традиционный национальный наряд~Dancers wore embroidered regional folk costumes.~Танцоры надели вышитые национальные костюмы.~noun
feast~праздничное торжественное застолье~The entire settlement rejoiced at the midsummer feast.~Всё селение праздновало за столом праздника летнего солнцестояния.~noun
symbol~национальный символ; эмблема~The pomegranate is a revered national symbol of fertility.~Гранат — почитаемый символ плодородия.~noun
greeting~традиционное приветствие~A respectful bow is a customary Japanese greeting.~Уважительный поклон — традиционное японское приветствие.~noun
courtesy~вежливость; соблюдение приличий~Observing local social courtesy avoids unintended friction.~Соблюдение вежливости помогает избежать недопонимания.~noun
fellowship~братство; дух товарищества~Members gathered around the table in warm fellowship.~Участники собрались за столом в духе товарищества.~noun`);
  add('topics','Folklore, mythology and belief','noun',`
fable~нравоучительная басня; притча~Aesop moral fables impart lessons through animal tales.~Басни Эзопа преподают уроки через истории о животных.~noun
parable~духовная притча с глубоким смыслом~The parable of the good Samaritan teaches boundless charity.~Притча о добром самаритянине учит милосердию.~noun
prophecy~пророчество; предсказание судьбы~Ancient Greek oracles uttered enigmatic cryptic prophecies.~Древнегреческие оракулы изрекали загадочные пророчества.~noun
deity~божество; верховный бог~Ancient pantheons honored patron deities of sea and sky.~Древние пантеоны почитали божеств моря и неба.~noun
goddess~богиня пантеона~Athena was revered as the Greek goddess of wisdom.~Афина почиталась как богиня мудрости.~noun
hero~мифический герой; богатырь~Heracles performed twelve labours as a legendary hero.~Геракл совершил двенадцать подвигов как герой.~noun
monster~мифическое чудовище; монстр~Brave Perseus vanquished the snake-haired Gorgon monster.~Храбрый Персей победил чудовище Горгону.~noun
dragon~огнедышащий мифический дракон~In Western lore, the winged dragon hoards stolen gold.~В преданиях крылатый дракон сторожит золото.~noun
spirit~дух природы; призрак~Woodland spirits were said to inhabit sacred groves.~Считалось, что лесные духи обитают в священных рощах.~noun
fairy~волшебная фея; сказочное существо~A benevolent fairy granted three wishes to the woodcutter.~Добрая фея исполнила три желания дровосека.~noun
sanctuary~священное убежище; святилище~The ancient temple served as an inviolable sanctuary.~Древний храм служил неприкосновенным святилищем.~noun
altar~жертвенный алтарь храма~Priests placed fresh flowers upon the marble altar.~Жрецы возложили свежие цветы на мраморный алтарь.~noun
omen~предзнаменование; вещий знак~Ancient soothsayers regarded a solar eclipse as an omen.~Древние прорицатели считали затмение знаком свыше.~noun
amulet~защитный амулет; оберег~Wear a silver protective amulet to ward off misfortune.~Носи серебряный оберег для защиты от невзгод.~noun
curse~заклятие; магическое проклятие~In fairy tales, true love kiss breaks the ancient curse.~В сказках поцелуй истинной любви снимает проклятие.~noun
spell~магическое заклинание~The sorceress whispered a protective incantation spell.~Колдунья прошептала защитное заклинание.~noun
enchantment~магическое очарование; волшебство~A mystical enchantment fell over the sleeping castle.~Магическое очарование опустилось на спящий замок.~noun
oracle~храмовый прорицатель; оракул~Rulers consulted the Delphic oracle prior to wars.~Правители обращались к дельфийскому оракулу перед войной.~noun
underworld~подземное царство мёртвых~Hades ruled the shadowy mythical underworld of souls.~Аид правил подземным царством душ.~noun
immortality~вечная жизнь; бессмертие~Alchemy sought the elixir yielding physical immortality.~Алхимия искала эликсир, дарующий бессмертие.~noun`);
  add('topics','Museums and cultural heritage','noun',`
gallery~выставочный зал музея~Tourists admired Renaissance masterpieces in gallery four.~Туристы любовались шедеврами в четвёртом зале.~noun
relic~историческая реликвия; святыня~The gold-encrusted holy relic was displayed under glass.~Реликвия в золотом окладе была выставлена под стеклом.~noun
display~музейная экспозиция; витрина~An interactive mineral display captivated visiting schoolchildren.~Интерактивная витрина минералов увлекла школьников.~noun
antiquarian~знаток древностей; антиквар~The learned antiquarian examined seventeenth-century coins.~Учёный-антиквар исследовал монеты XVII века.~noun
masterpiece~шедевр мирового искусства~The gallery acquired an authentic impressionist masterpiece.~Галерея приобрела шедевр импрессионизма.~noun
excavation~археологические раскопки~Artifacts from the Roman excavation entered the collection.~Находки с раскопок римского поселения вошли в собрание.~noun
conservation~научная консервация памятников~Careful paper conservation stabilized the brittle map.~Консервация спасла хрупкую старинную карту.~noun
repository~хранилище раритетов; репозиторий~Rare fragile manuscripts rest in the underground repository.~Редкие рукописи хранятся в подземном репозитории.~noun
manuscript~пергаментная рукопись~An illuminated gospel manuscript glowed with gold leaf.~Иллюминированная рукопись сияла сусальным золотом.~noun
audio guide~электронный аудиогид по залам~Pick up a multi-language audio guide at reception.~Возьми аудиогид на своём языке на стойке администратора.~noun
admission~плата за вход в музей~University students receive free admission on Thursdays.~Студенты получают бесплатный вход по четвергам.~noun
cloakroom~гардероб для верхней одежды~Leave heavy winter coats and umbrella at the cloakroom.~Оставь зимнее пальто и зонт в гардеробе.~noun
docent~музейный гид-экскурсовод~A knowledgeable docent led the architecture tour.~Знающий экскурсовод провёл тур по архитектуре.~noun
plaque~мемориальная памятная доска~A bronze historical plaque marks the author residence.~Бронзовая памятная доска отмечает дом писателя.~noun
heritage site~объект всемирного наследия~The stone citadel is designated a protected heritage site.~Каменная цитадель признана охраняемым объектом наследия.~noun
diorama~наглядная музейная диорама~A lifelike wildlife diorama portrayed glacial tundra.~Диорама дикой природы изображала ледниковую тундру.~noun
antiquity~древность; античный раритет~Museum conservators cleaned prized Classical antiquities.~Реставраторы очистили ценные античные раритеты.~noun
souvenir shop~музейный сувенирный киоск~Buy art print postcards in the museum souvenir shop.~Купи открытки с репродукциями в сувенирном магазине.~noun
showcase~стеклянная музейная витрина~Ancient gold coins are safely locked inside the showcase.~Древние золотые монеты заперты в стеклянной витрине.~noun
patron~меценат; покровитель искусств~A generous patron donated a private impressionist collection.~Щедрый меценат передал в дар частную коллекцию.~noun`);
  add('topics','Games and recreation','noun',`
checkers~игра в шашки~Grandfather taught children how to play checkers.~Дедушка научил детей играть в шашки.~noun
backgammon~восточные нарды~Roll pairs of dice to move backgammon checkers.~Бросай кости, чтобы двигать шашки в нардах.~noun
card game~карточная настольная игра~We enjoyed an entertaining four-player card game.~Мы с удовольствием сыграли в карточную игру на четверых.~noun
dominoes~игра в домино~Match numbered white dots in the classic game of dominoes.~Совмещай точки на костяшках в игре в домино.~noun
jigsaw puzzle~мозаика; пазл из фрагментов~Assemble the thousand-piece landscape jigsaw puzzle.~Собери пазл с пейзажем из тысячи кусочков.~noun
crossword~печатный кроссворд~Solve the challenging Sunday morning newspaper crossword.~Разгадай сложный воскресный кроссворд в газете.~noun
billiards~игра на бильярде~Strike the cue ball with precision in billiards.~Точно ударь кием по шару в бильярде.~noun
darts~метание дротиков; дартс~He scored a triple twenty on the cork darts board.~Он выбил шестьдесят очков на пробковой мишени дартса.~noun
bowling~боулинг; сбивание кеглей~Rolling the heavy ball knocked down all ten bowling pins.~Бросок тяжёлого шара сбил все десять кеглей в боулинге.~noun
table tennis~настольный теннис; пинг-понг~Fast-paced table tennis rallies demand lightning reflexes.~Быстрые розыгрыши в пинг-понге требуют молниеносной реакции.~noun
badminton~бадминтон с воланом~Hit the feathered shuttlecock over the badminton net.~Отбивай перьевой воланчик через сетку для бадминтона.~noun
arcade~зал игровых автоматов; аркада~Vintage coin-operated video arcades entertain gamers.~Залы игровых автоматов развлекают любителей игр.~noun
videogame~компьютерная видеоигра~Cooperative multiplayer videogames foster teamwork.~Совместные видеоигры развивают командную работу.~noun
board~игровое поле; доска~Place pawns onto the wooden chequered game board.~Расставь пешки на деревянную игровую доску.~noun
rulebook~свод правил игры~Consult the official game rulebook to clarify turns.~Сверься со сводом правил игры, чтобы уточнить очерёдность.~noun`);
}
