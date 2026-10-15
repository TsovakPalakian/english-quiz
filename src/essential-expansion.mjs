import {grammarDetails} from './grammar-content.mjs';

export function expandEssential(groups){
  const add=(groupId,title,pos,rows,extra={})=>{
    const group=groups.find(group=>group.id===groupId);
    let topic=group.topics.find(topic=>topic.title===title);
    if(!topic){topic={id:extra.id||'topic-'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-'),title,entries:[]};group.topics.push(topic);}
    for(const line of rows.trim().split('\n')){
      const [en,ru,example,exampleRu,rowPos]=line.split('~');
      if(!en||!ru||!example||!exampleRu)throw new Error('Incomplete Essential entry: '+line);
      if(!topic.entries.some(entry=>entry.en.toLowerCase()===en.toLowerCase()))topic.entries.push({en,ru,example,exampleRu,pos:rowPos||pos,...(extra.source?{source:extra.source}:{})});
    }
  };
  add('speech','Reflexive pronouns','pronoun',`
myself~себя; сам~I taught myself.~Я научился сам.
yourself~себя; сам~Help yourself.~Угощайся.
himself~себя; сам~He hurt himself.~Он ушибся.
herself~себя; сама~She introduced herself.~Она представилась.
itself~себя; само~The door closed itself.~Дверь закрылась сама.
ourselves~себя; сами~We enjoyed ourselves.~Мы хорошо провели время.
yourselves~себя; сами~Make yourselves comfortable.~Устраивайтесь поудобнее.
themselves~себя; сами~They organised it themselves.~Они организовали это сами.`);
  add('speech','Indefinite pronouns','pronoun',`
someone~кто-то~Someone is outside.~Снаружи кто-то есть.
anyone~кто-нибудь; любой~Can anyone help?~Кто-нибудь может помочь?
everyone~все; каждый~Everyone is ready.~Все готовы.
no one~никто~No one answered.~Никто не ответил.
something~что-то~Something moved.~Что-то пошевелилось.
anything~что-нибудь; что угодно~Do you need anything?~Тебе что-нибудь нужно?
everything~всё~Everything is fine.~Всё хорошо.
nothing~ничего~Nothing happened.~Ничего не произошло.
somewhere~где-то; куда-то~Let us go somewhere.~Давай куда-нибудь пойдём.~adverb
anywhere~где-нибудь; куда угодно~Sit anywhere.~Садись где угодно.~adverb
everywhere~везде~I looked everywhere.~Я искал везде.~adverb
nowhere~нигде; некуда~There is nowhere to sit.~Негде сесть.~adverb`);
  add('speech','Question words','adverb',`
who~кто~Who called?~Кто звонил?~pronoun
what~что; какой~What happened?~Что случилось?~pronoun
where~где; куда~Where are we?~Где мы?
when~когда~When do we leave?~Когда мы уходим?
why~почему~Why are you laughing?~Почему ты смеёшься?
how~как~How does it work?~Как это работает?
which~который; какой из~Which route is shorter?~Какой маршрут короче?~determiner
whose~чей~Whose bag is this?~Чья это сумка?~determiner
how much~сколько~How much does it cost?~Сколько это стоит?
how many~сколько~How many chairs are there?~Сколько здесь стульев?
how often~как часто~How often do you swim?~Как часто ты плаваешь?
how long~как долго~How long will it take?~Сколько времени это займёт?`);
  add('speech','Articles','determiner',`
a~неопределённый артикль перед согласным звуком~I saw a dog.~Я увидел собаку.
an~неопределённый артикль перед гласным звуком~She ate an apple.~Она съела яблоко.
the~определённый артикль~Close the window.~Закрой окно.`);
  add('speech','Prepositions of place and direction','preposition',`
in~в; внутри~The keys are in my bag.~Ключи в моей сумке.
on~на~The book is on the desk.~Книга на столе.
under~под~The cat is under the bed.~Кошка под кроватью.
above~над; выше~A lamp hangs above us.~Над нами висит лампа.
below~ниже; под~The village is below us.~Деревня ниже нас.
behind~за; позади~Wait behind the door.~Подожди за дверью.
between~между~Sit between us.~Садись между нами.
beside~рядом с~She stood beside me.~Она стояла рядом со мной.
through~через; сквозь~We walked through the tunnel.~Мы прошли через туннель.
across~через; поперёк~Walk across the bridge.~Пройди через мост.
towards~по направлению к~They ran towards the river.~Они побежали к реке.
into~в; внутрь~Come into the room.~Войди в комнату.
out of~из; наружу~Get out of the car.~Выйди из машины.
along~вдоль~We walked along the coast.~Мы шли вдоль побережья.`);
  add('speech','Prepositions of time','preposition',`
at~в определённое время~Meet me at six.~Встреть меня в шесть.
on~в определённый день~I work on Monday.~Я работаю в понедельник.
in~в месяце; году; периоде~It snows in winter.~Зимой идёт снег.
before~до; перед~Call before lunch.~Позвони до обеда.
after~после~We met after work.~Мы встретились после работы.
during~во время~Do not talk during the film.~Не разговаривай во время фильма.
until~до определённого момента~Wait until Friday.~Подожди до пятницы.
since~с определённого момента~I have lived here since May.~Я живу здесь с мая.
for~в течение~We waited for an hour.~Мы ждали час.
by~не позднее; к~Finish it by Friday.~Закончи это к пятнице.
within~в пределах периода~Reply within two days.~Ответьте в течение двух дней.
throughout~на протяжении~It rained throughout the night.~Дождь шёл всю ночь.`);
  add('speech','Conjunctions and connectors','conjunction',`
and~и~We bought bread and milk.~Мы купили хлеб и молоко.
but~но~It is small but useful.~Это маленькое, но полезное.
or~или~Tea or coffee?~Чай или кофе?
because~потому что~I stayed because it rained.~Я остался, потому что шёл дождь.
although~хотя~Although tired, she smiled.~Хотя она устала, она улыбнулась.
if~если~Call if you need help.~Позвони, если нужна помощь.
unless~если не~Wait unless I call.~Подожди, если я не позвоню.
while~пока; в то время как~I read while you cooked.~Я читал, пока ты готовил.
however~однако~It is costly. However, it lasts.~Это дорого. Однако это надолго.
therefore~поэтому; следовательно~It froze; therefore, we stayed.~Всё замёрзло, поэтому мы остались.
otherwise~иначе~Hurry; otherwise, we will be late.~Поторопись, иначе мы опоздаем.
moreover~более того~It is cheap; moreover, it is safe.~Это дёшево, более того, безопасно.`);
  add('speech','Quantity words','determiner',`
some~немного; несколько~We need some water.~Нам нужно немного воды.
any~какой-либо; сколько-нибудь~Do you have any questions?~У тебя есть вопросы?
many~много; с исчисляемыми~Many people agreed.~Многие согласились.
much~много; с неисчисляемыми~We do not have much time.~У нас мало времени.
few~мало; с исчисляемыми~Few people came.~Пришло мало людей.
a few~несколько~I have a few ideas.~У меня есть несколько идей.
little~мало; с неисчисляемыми~There is little hope.~Надежды мало.
a little~немного~Add a little salt.~Добавь немного соли.
enough~достаточно~We have enough chairs.~У нас достаточно стульев.
each~каждый по отдельности~Each room has a window.~В каждой комнате есть окно.
every~каждый; все в совокупности~Every student passed.~Все студенты сдали.
several~несколько~Several trains were cancelled.~Несколько поездов отменили.`);
  add('speech','Frequency','adverb',`
always~всегда~I always carry water.~Я всегда ношу воду.
usually~обычно~We usually walk.~Мы обычно ходим пешком.
often~часто~She often visits.~Она часто приходит.
sometimes~иногда~I sometimes cook.~Я иногда готовлю.
occasionally~изредка~We occasionally travel.~Мы изредка путешествуем.
rarely~редко~He rarely complains.~Он редко жалуется.
seldom~редко~It seldom snows here.~Здесь редко идёт снег.
hardly ever~почти никогда~I hardly ever drive.~Я почти никогда не вожу.
never~никогда~She never smokes.~Она никогда не курит.
daily~ежедневно~Water it daily.~Поливай это ежедневно.
weekly~еженедельно~We meet weekly.~Мы встречаемся еженедельно.
annually~ежегодно~The festival happens annually.~Фестиваль проходит ежегодно.`);
  add('speech','Degree and intensity','adverb',`
very~очень~It is very cold.~Очень холодно.
quite~довольно~The room is quite large.~Комната довольно большая.
rather~довольно; несколько~It is rather expensive.~Это довольно дорого.
extremely~чрезвычайно~She was extremely careful.~Она была чрезвычайно осторожна.
too~слишком~This bag is too heavy.~Эта сумка слишком тяжёлая.
enough~достаточно~It is warm enough.~Достаточно тепло.
almost~почти~We are almost ready.~Мы почти готовы.
nearly~почти~It is nearly midnight.~Почти полночь.
completely~полностью~I completely agree.~Я полностью согласен.
slightly~слегка~The door is slightly open.~Дверь слегка приоткрыта.
fairly~довольно~The test was fairly easy.~Тест был довольно лёгким.
absolutely~совершенно~You are absolutely right.~Ты совершенно прав.`);
  add('speech','Essential verbs','verb',`
be~быть~Be kind.~Будь добрым.
have~иметь~I have a question.~У меня есть вопрос.
do~делать~Do your best.~Сделай всё возможное.
make~делать; создавать~We make furniture.~Мы делаем мебель.
go~идти; ехать~I go by bus.~Я езжу на автобусе.
come~приходить~Come tomorrow.~Приходи завтра.
get~получать~Did you get my letter?~Ты получил моё письмо?
give~давать~Give me a minute.~Дай мне минуту.
take~брать~Take an umbrella.~Возьми зонт.
know~знать~I know the answer.~Я знаю ответ.
think~думать~Think before you answer.~Подумай, прежде чем ответить.
want~хотеть~I want to learn.~Я хочу учиться.
need~нуждаться~We need help.~Нам нужна помощь.
use~использовать~Use this key.~Используй этот ключ.
find~находить~I cannot find my phone.~Я не могу найти телефон.
keep~хранить; сохранять~Keep the receipt.~Сохрани чек.
leave~уходить; оставлять~We leave at noon.~Мы уходим в полдень.
try~пытаться~Try again.~Попробуй снова.
ask~спрашивать; просить~Ask the teacher.~Спроси учителя.
feel~чувствовать~I feel better.~Я чувствую себя лучше.`);
  add('speech','Modal verbs','verb',`
can~мочь; уметь~I can swim.~Я умею плавать.
could~мог; мог бы~Could you help?~Не могли бы вы помочь?
may~мочь; разрешено~You may leave.~Вы можете уйти.
might~возможно~It might rain.~Возможно, пойдёт дождь.
must~должен~You must stop.~Ты должен остановиться.
should~следует~You should rest.~Тебе следует отдохнуть.
will~вспомогательный глагол будущего; готовность~I will call.~Я позвоню.
would~бы; вежливая просьба~Would you wait?~Не могли бы вы подождать?
shall~предложение; обязательство в формальном стиле~Shall we begin?~Начнём?
ought to~следует~You ought to apologise.~Тебе следует извиниться.`);
  add('speech','Common contractions','contraction',`
I'm~I am; я есть~I'm ready.~Я готов.
you're~you are; ты; вы~You're right.~Ты прав.
he's~he is; he has; он~He's sleeping.~Он спит.
she's~she is; she has; она~She's arrived.~Она приехала.
it's~it is; it has; это~It's cold.~Холодно.
we're~we are; мы~We're here.~Мы здесь.
they're~they are; они~They're waiting.~Они ждут.
don't~do not; не~I don't smoke.~Я не курю.
doesn't~does not; не~She doesn't drive.~Она не водит.
didn't~did not; не в прошедшем времени~We didn't hear.~Мы не слышали.
can't~cannot; не мочь~I can't swim.~Я не умею плавать.
won't~will not; не в будущем; отказ~It won't open.~Это не открывается.
I've~I have; я с формой have~I've finished.~Я закончил.
I'd~I would; I had; я бы; я с формой had~I'd like some tea.~Я бы хотел чаю.
we'll~we will; мы в будущем~We'll see.~Посмотрим.
let's~let us; давайте~Let's go.~Пойдём.`);
  add('speech','Negation','adverb',`
not~не~I am not angry.~Я не сержусь.
no~нет; никакой~There is no milk.~Молока нет.~determiner
neither~ни тот ни другой~Neither answer is correct.~Ни один из двух ответов не верен.~determiner
nor~и не; ни~He neither called nor wrote.~Он не позвонил и не написал.~conjunction
without~без~I left without breakfast.~Я ушёл без завтрака.~preposition
hardly~едва~I can hardly hear.~Я едва слышу.
no longer~больше не~She no longer works here.~Она здесь больше не работает.
not yet~ещё не~We are not yet ready.~Мы ещё не готовы.`);
  add('speech','Sequence and comparison','adverb',`
first~сначала~First, wash your hands.~Сначала вымой руки.
next~затем~Next, add the flour.~Затем добавь муку.
then~потом~Then mix everything.~Потом всё перемешай.
finally~наконец~Finally, serve it hot.~Наконец, подавай горячим.
both~оба~Both answers are correct.~Оба ответа верны.~determiner
either~любой из двух~Either road is fine.~Подойдёт любая из двух дорог.~determiner
instead~вместо этого~Let us walk instead.~Давай вместо этого пойдём пешком.
similarly~аналогично~These plants grow similarly.~Эти растения растут похожим образом.`);

  add('basics','Parts of the day','noun',`
dawn~рассвет~We left at dawn.~Мы ушли на рассвете.
morning~утро~The morning was cold.~Утро было холодным.
noon~полдень~We eat at noon.~Мы едим в полдень.
afternoon~время после полудня~See you this afternoon.~Увидимся сегодня после обеда.
evening~вечер~Have a nice evening.~Хорошего вечера.
dusk~сумерки~Birds return at dusk.~Птицы возвращаются в сумерках.
night~ночь~The night was quiet.~Ночь была тихой.
midnight~полночь~It is almost midnight.~Сейчас почти полночь.`);
  add('basics','Time and time units','noun',`
second~секунда~Wait a second.~Подожди секунду.
minute~минута~I need a minute.~Мне нужна минута.
hour~час~The trip takes an hour.~Поездка занимает час.
day~день~Have a good day.~Хорошего дня.
week~неделя~We leave next week.~Мы уезжаем на следующей неделе.
fortnight~две недели~I stayed for a fortnight.~Я остался на две недели.
month~месяц~A month has passed.~Прошёл месяц.
year~год~Happy New Year!~С Новым годом!
decade~десятилетие~They lived here for a decade.~Они жили здесь десять лет.
century~век~The bridge is a century old.~Мосту сто лет.`);
  add('basics','Dates and years','noun',`
today~сегодня~Today is Monday.~Сегодня понедельник.
yesterday~вчера~I called yesterday.~Я звонил вчера.
tomorrow~завтра~Come tomorrow.~Приходи завтра.
date~дата~What is the date?~Какое сегодня число?
calendar~календарь~Check the calendar.~Посмотри календарь.
weekend~выходные~Have a good weekend.~Хороших выходных.
weekday~будний день~We open every weekday.~Мы открыты каждый будний день.
leap year~високосный год~A leap year has 366 days.~В високосном году 366 дней.`);
  const numbers=[['zero','ноль'],['one','один'],['two','два'],['three','три'],['four','четыре'],['five','пять'],['six','шесть'],['seven','семь'],['eight','восемь'],['nine','девять'],['ten','десять'],['eleven','одиннадцать'],['twelve','двенадцать'],['thirteen','тринадцать'],['fourteen','четырнадцать'],['fifteen','пятнадцать'],['sixteen','шестнадцать'],['seventeen','семнадцать'],['eighteen','восемнадцать'],['nineteen','девятнадцать'],['twenty','двадцать'],['thirty','тридцать'],['forty','сорок'],['fifty','пятьдесят'],['sixty','шестьдесят'],['seventy','семьдесят'],['eighty','восемьдесят'],['ninety','девяносто'],['one hundred','сто'],['one thousand','тысяча'],['one million','миллион']];
  add('basics','Cardinal numbers','numeral',numbers.map(([en,ru])=>[en,ru,'The answer is '+en+'.','Ответ: '+ru+'.'].join('~')).join('\n'));
  const ordinals=[['first','первый'],['second','второй'],['third','третий'],['fourth','четвёртый'],['fifth','пятый'],['sixth','шестой'],['seventh','седьмой'],['eighth','восьмой'],['ninth','девятый'],['tenth','десятый'],['eleventh','одиннадцатый'],['twelfth','двенадцатый'],['thirteenth','тринадцатый'],['fourteenth','четырнадцатый'],['fifteenth','пятнадцатый'],['sixteenth','шестнадцатый'],['seventeenth','семнадцатый'],['eighteenth','восемнадцатый'],['nineteenth','девятнадцатый'],['twentieth','двадцатый'],['twenty-first','двадцать первый'],['thirtieth','тридцатый'],['hundredth','сотый']];
  add('basics','Ordinal numbers','numeral',ordinals.map(([en,ru])=>[en,ru,'This is the '+en+' example.','Это '+ru+' пример.'].join('~')).join('\n'));
  add('basics','Fractions and percentages','noun',`
half~половина~Half the cake is left.~Осталась половина торта.
quarter~четверть~Add a quarter of a cup.~Добавь четверть чашки.
third~треть~A third of the class agreed.~Треть класса согласилась.
fraction~дробь; доля~Write it as a fraction.~Запиши это дробью.
percent~процент~Ten percent is enough.~Десяти процентов достаточно.
percentage~процентное соотношение~What percentage agreed?~Какой процент согласился?
decimal~десятичная дробь~Write it as a decimal.~Запиши это десятичной дробью.
ratio~соотношение~Keep the same ratio.~Сохрани то же соотношение.`);
  add('basics','Units of measurement','noun',`
millimetre~миллиметр~It is one millimetre thick.~Это толщиной один миллиметр.
centimetre~сантиметр~Add one centimetre.~Добавь один сантиметр.
metre~метр~The shelf is a metre long.~Полка длиной один метр.
kilometre~километр~We walked a kilometre.~Мы прошли километр.
gram~грамм~It weighs one gram.~Это весит один грамм.
kilogram~килограмм~Buy a kilogram of rice.~Купи килограмм риса.
litre~литр~We need a litre of milk.~Нам нужен литр молока.
millilitre~миллилитр~Add ten millilitres.~Добавь десять миллилитров.
degree~градус~The temperature rose one degree.~Температура выросла на один градус.
inch~дюйм~Move it one inch.~Передвинь это на один дюйм.
foot~фут~The board is a foot wide.~Доска шириной один фут.
mile~миля~The station is a mile away.~До станции одна миля.`);
  add('basics','Colours and shades','adjective',`
red~красный~The door is red.~Дверь красная.
blue~синий; голубой~The sky is blue.~Небо голубое.
green~зелёный~The leaves are green.~Листья зелёные.
yellow~жёлтый~The flower is yellow.~Цветок жёлтый.
black~чёрный~My coat is black.~Моё пальто чёрное.
white~белый~The walls are white.~Стены белые.
grey~серый~The clouds are grey.~Облака серые.
brown~коричневый~The bag is brown.~Сумка коричневая.
pink~розовый~Her scarf is pink.~Её шарф розовый.
purple~фиолетовый~The curtain is purple.~Штора фиолетовая.
turquoise~бирюзовый~The water looks turquoise.~Вода кажется бирюзовой.
crimson~малиновый; багряный~The velvet is crimson.~Бархат багряный.
navy~тёмно-синий~He wore a navy suit.~Он был в тёмно-синем костюме.
beige~бежевый~The sofa is beige.~Диван бежевый.
maroon~тёмно-бордовый~She chose maroon fabric.~Она выбрала тёмно-бордовую ткань.
ivory~цвет слоновой кости~The paper is ivory.~Бумага цвета слоновой кости.`);
  add('basics','Shapes','noun',`
circle~круг~Draw a circle.~Нарисуй круг.
square~квадрат~Cut out a square.~Вырежи квадрат.
triangle~треугольник~The sign is a triangle.~Знак имеет форму треугольника.
rectangle~прямоугольник~Fold the rectangle.~Сложи прямоугольник.
oval~овал~The mirror is an oval.~Зеркало имеет форму овала.
cube~куб~This box is a cube.~Эта коробка — куб.
sphere~сфера; шар~The planet is almost a sphere.~Планета почти шар.
cylinder~цилиндр~The container is a cylinder.~Контейнер имеет форму цилиндра.
cone~конус~Make a paper cone.~Сделай бумажный конус.
spiral~спираль~Draw a spiral.~Нарисуй спираль.`);
  add('basics','Countries and nationalities','noun',`
Armenia~Армения~I live in Armenia.~Я живу в Армении.
Armenian~армянский~She is Armenian.~Она армянка.~adjective
Britain~Британия~They moved to Britain.~Они переехали в Британию.
British~британский~He is British.~Он британец.~adjective
France~Франция~We visited France.~Мы посетили Францию.
French~французский~She is French.~Она француженка.~adjective
Germany~Германия~He works in Germany.~Он работает в Германии.
German~немецкий~Our neighbour is German.~Наш сосед немец.~adjective
Japan~Япония~I want to visit Japan.~Я хочу посетить Японию.
Japanese~японский~The artist is Japanese.~Художник — японец.~adjective
Brazil~Бразилия~She returned to Brazil.~Она вернулась в Бразилию.
Brazilian~бразильский~My teacher is Brazilian.~Мой учитель — бразилец.~adjective`);
  add('basics','Languages','noun',`
English~английский язык~We speak English.~Мы говорим по-английски.
Russian~русский язык~She reads Russian.~Она читает по-русски.
Armenian~армянский язык~I am learning Armenian.~Я учу армянский.
Spanish~испанский язык~He speaks Spanish.~Он говорит по-испански.
French~французский язык~They study French.~Они изучают французский.
German~немецкий язык~I understand German.~Я понимаю немецкий.
Italian~итальянский язык~She teaches Italian.~Она преподаёт итальянский.
Portuguese~португальский язык~We are learning Portuguese.~Мы учим португальский.
Arabic~арабский язык~He reads Arabic.~Он читает по-арабски.
Mandarin~мандаринский китайский~She studies Mandarin.~Она изучает мандаринский китайский.
Japanese~японский язык~I enjoy learning Japanese.~Мне нравится учить японский.
Korean~корейский язык~They speak Korean.~Они говорят по-корейски.`);
  add('basics','Compass directions','noun',`
north~север~The road leads north.~Дорога ведёт на север.
south~юг~We travelled south.~Мы поехали на юг.
east~восток~The sun rises in the east.~Солнце встаёт на востоке.
west~запад~The town is west of here.~Город к западу отсюда.
northeast~северо-восток~The wind comes from the northeast.~Ветер дует с северо-востока.
northwest~северо-запад~Drive northwest.~Поезжай на северо-запад.
southeast~юго-восток~The coast lies southeast.~Побережье находится на юго-востоке.
southwest~юго-запад~We headed southwest.~Мы направились на юго-запад.`);
  add('basics','Basic adjectives and opposites','adjective',`
big~большой~It is a big house.~Это большой дом.
small~маленький~We have a small garden.~У нас маленький сад.
hot~горячий; жаркий~The tea is hot.~Чай горячий.
cold~холодный~The water is cold.~Вода холодная.
old~старый~This bridge is old.~Этот мост старый.
new~новый~My phone is new.~Мой телефон новый.
easy~лёгкий; несложный~The task is easy.~Задание лёгкое.
difficult~трудный~The question is difficult.~Вопрос трудный.
cheap~дешёвый~The ticket was cheap.~Билет был дешёвым.
expensive~дорогой~The hotel is expensive.~Отель дорогой.
wide~широкий~The river is wide.~Река широкая.
narrow~узкий~The path is narrow.~Тропинка узкая.
clean~чистый~The kitchen is clean.~Кухня чистая.
dirty~грязный~My shoes are dirty.~Моя обувь грязная.
full~полный~The bottle is full.~Бутылка полная.
empty~пустой~The room is empty.~Комната пустая.`);

  add('topics','Appearance','adjective',`
tall~высокий~My brother is tall.~Мой брат высокий.
short~невысокий; короткий~Her hair is short.~У неё короткие волосы.
slim~стройный~He is tall and slim.~Он высокий и стройный.
curly~кудрявый~She has curly hair.~У неё кудрявые волосы.
straight~прямой~His hair is straight.~У него прямые волосы.
blond~светловолосый~Their son is blond.~Их сын светловолосый.
bearded~бородатый~A bearded man waved.~Бородатый мужчина помахал.
freckled~веснушчатый~Her face is freckled.~У неё лицо в веснушках.`);
  add('topics','Personality','adjective',`
kind~добрый~She is always kind.~Она всегда добра.
honest~честный~Please be honest.~Пожалуйста, будь честным.
shy~застенчивый~The child is shy.~Ребёнок застенчивый.
confident~уверенный в себе~He sounds confident.~Он говорит уверенно.
patient~терпеливый~Our teacher is patient.~Наш учитель терпеливый.
generous~щедрый~That was generous of you.~Это было щедро с твоей стороны.
stubborn~упрямый~She can be stubborn.~Она бывает упрямой.
reliable~надёжный~He is a reliable friend.~Он надёжный друг.`);
  add('topics','Feelings and emotions','adjective',`
happy~счастливый~I am happy to help.~Я рад помочь.
sad~грустный~She feels sad today.~Ей сегодня грустно.
angry~сердитый~Why are you angry?~Почему ты сердишься?
worried~обеспокоенный~We were worried about you.~Мы беспокоились о тебе.
excited~взволнованный от радости~The children are excited.~Дети радостно взволнованы.
disappointed~разочарованный~He looked disappointed.~Он выглядел разочарованным.
relieved~испытывающий облегчение~I was relieved to hear it.~Я испытал облегчение, услышав это.
grateful~благодарный~We are grateful for your help.~Мы благодарны за вашу помощь.`);
  add('topics','The human body','noun',`
head~голова~My head hurts.~У меня болит голова.
shoulder~плечо~He hurt his shoulder.~Он повредил плечо.
arm~рука от плеча до кисти~Raise your arm.~Подними руку.
hand~кисть руки~Wash your hands.~Вымой руки.
finger~палец руки~I cut my finger.~Я порезал палец.
knee~колено~Bend your knee.~Согни колено.
ankle~щиколотка~She twisted her ankle.~Она подвернула ногу в щиколотке.
heart~сердце~The heart pumps blood.~Сердце перекачивает кровь.
lung~лёгкое~The lungs need clean air.~Лёгким нужен чистый воздух.
skin~кожа~Protect your skin.~Защищай кожу.
bone~кость~He broke a bone.~Он сломал кость.
muscle~мышца~This exercise strengthens muscles.~Это упражнение укрепляет мышцы.`);
  add('topics','Health and wellbeing','noun',`
health~здоровье~Health matters.~Здоровье важно.
sleep~сон~I need more sleep.~Мне нужно больше сна.
rest~отдых~Take a short rest.~Немного отдохни.
pain~боль~The pain has stopped.~Боль прошла.
fever~повышенная температура~She has a fever.~У неё температура.
cough~кашель~His cough is better.~Его кашель ослаб.
stress~стресс~Exercise can reduce stress.~Движение может уменьшить стресс.
recovery~восстановление~Recovery takes time.~Восстановление требует времени.`);
  add('topics','Doctors and pharmacies','noun',`
doctor~врач~Call a doctor.~Вызови врача.
nurse~медсестра; медбрат~The nurse checked my temperature.~Медсестра измерила мне температуру.
appointment~запись на приём~I have an appointment.~Я записан на приём.
prescription~рецепт врача~You need a prescription.~Нужен рецепт врача.
pharmacy~аптека~The pharmacy is open.~Аптека открыта.
medicine~лекарство~Keep the medicine safely.~Храни лекарство в безопасном месте.
symptom~симптом~Describe your symptoms.~Опишите ваши симптомы.
allergy~аллергия~Tell the doctor about your allergy.~Сообщите врачу о вашей аллергии.`);
  add('topics','Home and housing','noun',`
house~дом~Our house has a garden.~У нашего дома есть сад.
flat~квартира~We rent a flat.~Мы снимаем квартиру.
bedroom~спальня~The bedroom is upstairs.~Спальня наверху.
kitchen~кухня~She is in the kitchen.~Она на кухне.
bathroom~ванная комната~The bathroom is small.~Ванная комната маленькая.
balcony~балкон~Flowers grow on the balcony.~На балконе растут цветы.
ceiling~потолок~The ceiling is high.~Потолок высокий.
basement~подвал~The boxes are in the basement.~Коробки в подвале.`);
  add('topics','Furniture and household objects','noun',`
table~стол~Set the table.~Накрой стол.
chair~стул~Pull up a chair.~Пододвинь стул.
sofa~диван~Sit on the sofa.~Садись на диван.
wardrobe~шкаф для одежды~My coat is in the wardrobe.~Моё пальто в шкафу.
shelf~полка~Put it on the shelf.~Положи это на полку.
curtain~штора~Close the curtains.~Задёрни шторы.
mirror~зеркало~Look in the mirror.~Посмотри в зеркало.
blanket~одеяло~Take a warm blanket.~Возьми тёплое одеяло.`);
  add('topics','Housework','verb',`
clean~убирать; чистить~Clean the kitchen.~Убери кухню.
wash~мыть; стирать~Wash the dishes.~Помой посуду.
dry~сушить~Dry your hands.~Вытри руки.
vacuum~пылесосить~Vacuum the carpet.~Пропылесось ковёр.
sweep~подметать~Sweep the floor.~Подмети пол.
iron~гладить~Iron this shirt.~Погладь эту рубашку.
tidy~приводить в порядок~Tidy your room.~Прибери свою комнату.
recycle~отправлять на переработку~Recycle these bottles.~Сдай эти бутылки на переработку.`);
  add('topics','Daily routines','verb',`
wake~просыпаться; будить~I wake at seven.~Я просыпаюсь в семь.
shower~принимать душ~I shower before breakfast.~Я принимаю душ перед завтраком.
dress~одеваться~The children dress themselves.~Дети одеваются сами.
commute~ездить на работу~I commute by train.~Я езжу на работу поездом.
work~работать~We work until five.~Мы работаем до пяти.
study~учиться~She studies every evening.~Она учится каждый вечер.
relax~расслабляться~Relax after work.~Отдохни после работы.
sleep~спать~I sleep well.~Я хорошо сплю.`);
  add('topics','Food and groceries','noun',`
bread~хлеб~We need fresh bread.~Нам нужен свежий хлеб.
rice~рис~Cook the rice.~Свари рис.
flour~мука~Add some flour.~Добавь немного муки.
sugar~сахар~I do not take sugar.~Я пью без сахара.
salt~соль~Pass the salt.~Передай соль.
oil~масло растительное~Heat the oil.~Разогрей масло.
egg~яйцо~Crack an egg.~Разбей яйцо.
cheese~сыр~Slice the cheese.~Нарежь сыр.`);
  add('topics','Drinks','noun',`
water~вода~Drink some water.~Выпей воды.
tea~чай~Would you like tea?~Хочешь чаю?
coffee~кофе~I drink coffee in the morning.~Я пью кофе утром.
juice~сок~The juice is fresh.~Сок свежий.
milk~молоко~Keep the milk cold.~Храни молоко в холоде.
lemonade~лимонад~We made lemonade.~Мы приготовили лимонад.
sparkling water~газированная вода~I ordered sparkling water.~Я заказал газированную воду.
herbal tea~травяной чай~She prefers herbal tea.~Она предпочитает травяной чай.`);
  add('topics','Cooking','verb',`
boil~кипятить; варить~Boil the water.~Вскипяти воду.
fry~жарить~Fry the onions.~Обжарь лук.
bake~выпекать~Bake the bread.~Испеки хлеб.
roast~запекать; жарить в духовке~Roast the vegetables.~Запеки овощи.
steam~готовить на пару~Steam the broccoli.~Приготовь брокколи на пару.
chop~нарезать~Chop the carrots.~Нарежь морковь.
stir~перемешивать~Stir the soup.~Перемешай суп.
peel~чистить кожуру~Peel the potatoes.~Почисти картофель.
grate~натирать на тёрке~Grate the cheese.~Натри сыр.
knead~месить~Knead the dough.~Замеси тесто.`);
  add('topics','Cafes and restaurants','noun',`
menu~меню~May I see the menu?~Можно меню?
waiter~официант~Ask the waiter.~Спроси официанта.
bill~счёт~Could we have the bill?~Можно счёт?
tip~чаевые~We left a tip.~Мы оставили чаевые.
starter~закуска перед основным блюдом~I ordered a starter.~Я заказал закуску.
main course~основное блюдо~The main course was delicious.~Основное блюдо было вкусным.
dessert~десерт~Would you like dessert?~Хочешь десерт?
reservation~бронирование~We have a reservation.~У нас забронирован столик.`);
  add('topics','Clothes and shoes','noun',`
shirt~рубашка~Your shirt is clean.~Твоя рубашка чистая.
trousers~брюки~These trousers fit.~Эти брюки подходят.
dress~платье~She wore a blue dress.~Она была в синем платье.
coat~пальто~Put on your coat.~Надень пальто.
sweater~свитер~This sweater is warm.~Этот свитер тёплый.
scarf~шарф~Take a scarf.~Возьми шарф.
boots~сапоги; ботинки~My boots are wet.~Мои ботинки мокрые.
trainers~кроссовки~I need new trainers.~Мне нужны новые кроссовки.
sandals~сандалии~She packed sandals.~Она положила в чемодан сандалии.
gloves~перчатки~Wear gloves.~Надень перчатки.`);
  add('topics','Shopping','noun',`
shop~магазин~The shop closes at six.~Магазин закрывается в шесть.
price~цена~What is the price?~Какова цена?
discount~скидка~Can I get a discount?~Можно скидку?
receipt~чек~Keep your receipt.~Сохрани чек.
basket~корзина~Take a basket.~Возьми корзину.
checkout~касса~Pay at the checkout.~Оплати на кассе.
refund~возврат денег~I asked for a refund.~Я попросил вернуть деньги.
size~размер~Do you have my size?~У вас есть мой размер?`);
  add('topics','Money and payments','noun',`
cash~наличные~I paid in cash.~Я заплатил наличными.
coin~монета~I found a coin.~Я нашёл монету.
banknote~банкнота~This banknote is torn.~Эта банкнота порвана.
change~сдача~Keep the change.~Оставьте сдачу.
salary~зарплата~Her salary increased.~Её зарплата выросла.
budget~бюджет~We have a small budget.~У нас небольшой бюджет.
debt~долг~He paid the debt.~Он выплатил долг.
transfer~перевод денег~The transfer arrived.~Перевод пришёл.
currency~валюта~Which currency do you need?~Какая валюта тебе нужна?
fee~плата; сбор~There is a small fee.~Есть небольшой сбор.`);
  add('topics','Work and professions','noun',`
teacher~учитель~My sister is a teacher.~Моя сестра — учитель.
engineer~инженер~The engineer checked the bridge.~Инженер проверил мост.
lawyer~юрист~Ask a lawyer.~Спроси юриста.
accountant~бухгалтер~Our accountant is away.~Наш бухгалтер в отъезде.
plumber~сантехник~Call a plumber.~Вызови сантехника.
electrician~электрик~The electrician repaired the light.~Электрик починил светильник.
chef~шеф-повар~The chef prepared lunch.~Шеф-повар приготовил обед.
scientist~учёный~The scientist published a paper.~Учёный опубликовал статью.
translator~переводчик~We need a translator.~Нам нужен переводчик.
architect~архитектор~The architect drew the plan.~Архитектор начертил план.`);
  add('topics','Communication at work','noun',`
meeting~встреча; совещание~The meeting starts now.~Совещание начинается сейчас.
deadline~крайний срок~We met the deadline.~Мы уложились в срок.
report~отчёт~Read the report.~Прочитай отчёт.
feedback~обратная связь~Thank you for your feedback.~Спасибо за обратную связь.
proposal~предложение; проект~Consider this proposal.~Рассмотрите это предложение.
agenda~повестка дня~Send me the agenda.~Отправь мне повестку.
task~задача~This task is urgent.~Эта задача срочная.
update~новая информация~Give us an update.~Сообщи нам последние новости.`);
  add('topics','School and education','noun',`
school~школа~The school is nearby.~Школа поблизости.
university~университет~She studies at university.~Она учится в университете.
lesson~урок~The lesson was useful.~Урок был полезным.
homework~домашняя работа~I finished my homework.~Я закончил домашнюю работу.
exam~экзамен~The exam is tomorrow.~Экзамен завтра.
degree~учёная степень; диплом~He has a degree in physics.~У него диплом по физике.
scholarship~стипендия на обучение~She won a scholarship.~Она получила стипендию.
curriculum~учебная программа~The curriculum has changed.~Учебная программа изменилась.`);
  add('topics','Learning languages','noun',`
language~язык~I am learning a language.~Я учу язык.
vocabulary~словарный запас~Reading improves vocabulary.~Чтение расширяет словарный запас.
pronunciation~произношение~Practise your pronunciation.~Практикуй произношение.
translation~перевод~Check the translation.~Проверь перевод.
accent~акцент~Her accent is clear.~Её акцент понятен.
fluency~беглость речи~Fluency takes practice.~Для беглости нужна практика.
spelling~правописание~Check your spelling.~Проверь правописание.
meaning~значение~What is the meaning?~Каково значение?`);
  add('topics','City and public places','noun',`
street~улица~Our street is quiet.~Наша улица тихая.
square~площадь~Meet in the square.~Встретимся на площади.
library~библиотека~The library is open.~Библиотека открыта.
museum~музей~We visited a museum.~Мы посетили музей.
station~станция; вокзал~The station is nearby.~Вокзал рядом.
bridge~мост~Cross the bridge.~Перейди мост.
town hall~ратуша; мэрия~The town hall is old.~Здание мэрии старое.
playground~детская площадка~The playground is safe.~Детская площадка безопасна.`);
  add('topics','Directions','noun',`
left~левая сторона~Take the first left.~Поверни в первый поворот налево.
right~правая сторона~The bank is on your right.~Банк справа от вас.
corner~угол~Wait at the corner.~Подожди на углу.
crossroads~перекрёсток~Stop at the crossroads.~Остановись на перекрёстке.
roundabout~круговая развязка~Turn left at the roundabout.~Поверни налево на круговой развязке.
entrance~вход~Use the main entrance.~Используй главный вход.
exit~выход~Where is the exit?~Где выход?
signpost~дорожный указатель~Follow the signpost.~Следуй дорожному указателю.`);
  add('topics','Transport','noun',`
bus~автобус~Take the bus.~Поезжай на автобусе.
train~поезд~The train is late.~Поезд опаздывает.
tram~трамвай~A tram is coming.~Подъезжает трамвай.
bicycle~велосипед~I ride a bicycle.~Я езжу на велосипеде.
ferry~паром~We crossed by ferry.~Мы переправились на пароме.
taxi~такси~Call a taxi.~Вызови такси.
platform~платформа~Go to platform three.~Иди на третью платформу.
timetable~расписание~Check the timetable.~Проверь расписание.`);
  add('topics','Travel','noun',`
journey~поездка; путь~Have a safe journey.~Счастливого пути.
trip~поездка~Our trip was short.~Наша поездка была короткой.
passport~паспорт~Show your passport.~Покажите паспорт.
visa~виза~Do you need a visa?~Вам нужна виза?
luggage~багаж~Keep your luggage nearby.~Держите багаж рядом.
destination~пункт назначения~What is your destination?~Куда вы направляетесь?
itinerary~маршрут поездки~We changed our itinerary.~Мы изменили маршрут поездки.
souvenir~сувенир~I bought a souvenir.~Я купил сувенир.`);
  add('topics','Airports and flights','noun',`
airport~аэропорт~The airport is busy.~В аэропорту многолюдно.
flight~рейс; полёт~Our flight was delayed.~Наш рейс задержали.
departure~отправление; вылет~Check the departure time.~Проверь время вылета.
arrival~прибытие~Our arrival was late.~Мы прибыли поздно.
boarding pass~посадочный талон~Show your boarding pass.~Покажите посадочный талон.
gate~выход на посадку~Go to gate twelve.~Идите к двенадцатому выходу.
runway~взлётно-посадочная полоса~The runway is clear.~Взлётная полоса свободна.
layover~пересадка с ожиданием~We have a short layover.~У нас короткая пересадка.`);
  add('topics','Hotels and accommodation','noun',`
hotel~отель~The hotel is comfortable.~Отель удобный.
hostel~хостел~We stayed in a hostel.~Мы остановились в хостеле.
reception~стойка регистрации~Ask at reception.~Спросите на стойке регистрации.
room~комната; номер~Our room has a balcony.~В нашем номере есть балкон.
key card~ключ-карта~I lost my key card.~Я потерял ключ-карту.
deposit~залог~We paid a deposit.~Мы внесли залог.
check-in~регистрация при заселении~Check-in starts at three.~Заселение начинается в три.
check-out~выезд из гостиницы~Check-out is at noon.~Выезд в полдень.`);
  add('topics','Nature and the environment','noun',`
forest~лес~The forest is peaceful.~В лесу спокойно.
river~река~The river is deep.~Река глубокая.
coast~побережье~We walked along the coast.~Мы шли вдоль побережья.
pollution~загрязнение~Pollution harms wildlife.~Загрязнение вредит дикой природе.
habitat~среда обитания~Protect this habitat.~Защищайте эту среду обитания.
ecosystem~экосистема~The ecosystem is fragile.~Экосистема хрупкая.
conservation~охрана природы~Conservation takes cooperation.~Охрана природы требует сотрудничества.
biodiversity~биоразнообразие~Biodiversity is declining.~Биоразнообразие сокращается.`);
  add('topics','Weather and climate','noun',`
rain~дождь~The rain stopped.~Дождь закончился.
snow~снег~The snow is melting.~Снег тает.
wind~ветер~The wind is strong.~Ветер сильный.
fog~туман~The fog is thick.~Туман густой.
thunder~гром~We heard thunder.~Мы услышали гром.
lightning~молния~Lightning lit the sky.~Молния осветила небо.
drought~засуха~The drought lasted months.~Засуха длилась месяцы.
humidity~влажность~The humidity is high.~Влажность высокая.`);
  add('topics','Animals','noun',`
dog~собака~The dog is friendly.~Собака дружелюбная.
cat~кошка~The cat is asleep.~Кошка спит.
horse~лошадь~The horse is running.~Лошадь бежит.
fox~лиса~A fox crossed the path.~Лиса перебежала тропу.
deer~олень~We saw a deer.~Мы увидели оленя.
hedgehog~ёж~A hedgehog hid in the leaves.~Ёж спрятался в листьях.
otter~выдра~An otter swam past.~Мимо проплыла выдра.
platypus~утконос~The platypus lays eggs.~Утконос откладывает яйца.
capybara~капибара~The capybara is a large rodent.~Капибара — крупный грызун.
axolotl~аксолотль~The axolotl has external gills.~У аксолотля наружные жабры.`);
  add('topics','Plants','noun',`
tree~дерево~Plant a tree.~Посади дерево.
flower~цветок~The flower opened.~Цветок раскрылся.
root~корень~The root is deep.~Корень глубокий.
stem~стебель~Do not break the stem.~Не сломай стебель.
leaf~лист растения~A leaf fell.~Упал лист.
seed~семя~The seed has sprouted.~Семя проросло.
fern~папоротник~Ferns grow in the shade.~Папоротники растут в тени.
moss~мох~Moss covers the stone.~Мох покрывает камень.`);
  add('topics','Sport and exercise','noun',`
exercise~физическое упражнение~Exercise helps me relax.~Движение помогает мне расслабиться.
training~тренировка~Training starts at six.~Тренировка начинается в шесть.
swimming~плавание~I enjoy swimming.~Мне нравится плавание.
cycling~велоспорт~Cycling keeps me fit.~Велосипед помогает мне быть в форме.
running~бег~Running is my hobby.~Бег — моё увлечение.
stretching~растяжка~Gentle stretching feels good.~Лёгкая растяжка приятна.
referee~судья в спорте~The referee stopped the game.~Судья остановил игру.
tournament~турнир~The tournament begins tomorrow.~Турнир начинается завтра.`);
  add('topics','Hobbies and free time','noun',`
hobby~увлечение~What is your hobby?~Какое у тебя увлечение?
gardening~садоводство~Gardening helps me relax.~Садоводство помогает мне расслабиться.
knitting~вязание~She enjoys knitting.~Ей нравится вязание.
hiking~пеший туризм~We went hiking.~Мы пошли в поход.
fishing~рыбалка~He loves fishing.~Он любит рыбалку.
pottery~гончарное дело~I am learning pottery.~Я учусь гончарному делу.
woodworking~работа по дереву~Woodworking requires patience.~Работа по дереву требует терпения.
origami~оригами~The children tried origami.~Дети попробовали оригами.`);
  add('topics','Music, films and books','noun',`
novel~роман~She wrote a novel.~Она написала роман.
poem~стихотворение~Read this poem.~Прочитай это стихотворение.
chapter~глава книги~I finished the chapter.~Я закончил главу.
plot~сюжет~The plot is surprising.~Сюжет неожиданный.
soundtrack~саундтрек~I love the soundtrack.~Мне нравится саундтрек.
director~кинорежиссёр~The director answered questions.~Режиссёр ответил на вопросы.
lyrics~текст песни~Read the lyrics.~Прочитай текст песни.
chorus~припев~Everyone sang the chorus.~Все спели припев.`);
  add('topics','Celebrations and events','noun',`
birthday~день рождения~Happy birthday!~С днём рождения!
wedding~свадьба~We attended a wedding.~Мы были на свадьбе.
anniversary~годовщина~It is our anniversary.~Сегодня наша годовщина.
festival~фестиваль~The festival lasts a week.~Фестиваль длится неделю.
parade~парад~The parade starts soon.~Парад скоро начнётся.
invitation~приглашение~Thank you for the invitation.~Спасибо за приглашение.
guest~гость~Our guests have arrived.~Наши гости приехали.
fireworks~фейерверк~We watched the fireworks.~Мы смотрели фейерверк.`);
  add('topics','Phones, internet and technology','noun',`
screen~экран~The screen is cracked.~Экран треснул.
battery~аккумулятор~The battery is low.~Аккумулятор разряжен.
charger~зарядное устройство~I forgot my charger.~Я забыл зарядное устройство.
keyboard~клавиатура~The keyboard is wireless.~Клавиатура беспроводная.
browser~браузер~Open your browser.~Открой браузер.
password~пароль~Choose a strong password.~Выбери надёжный пароль.
connection~соединение~The connection is slow.~Соединение медленное.
storage~хранилище данных~We need more storage.~Нам нужно больше места для данных.`);
  add('topics','Messages and social media','noun',`
message~сообщение~Send me a message.~Отправь мне сообщение.
attachment~вложение~Open the attachment.~Открой вложение.
notification~уведомление~I received a notification.~Я получил уведомление.
reply~ответ~Thank you for your reply.~Спасибо за ответ.
comment~комментарий~Leave a comment.~Оставь комментарий.
profile~профиль~Update your profile.~Обнови свой профиль.
follower~подписчик~She gained new followers.~У неё появились новые подписчики.
privacy~конфиденциальность~Check your privacy settings.~Проверь настройки конфиденциальности.`);
  add('topics','News and information','noun',`
news~новости~Have you heard the news?~Ты слышал новости?
headline~заголовок новости~Read the headline.~Прочитай заголовок.
source~источник~Check the source.~Проверь источник.
evidence~доказательства~We need more evidence.~Нам нужно больше доказательств.
fact~факт~That is a fact.~Это факт.
rumour~слух~The rumour was false.~Слух оказался ложным.
interview~интервью~She gave an interview.~Она дала интервью.
broadcast~трансляция~The broadcast begins now.~Трансляция начинается сейчас.`);
  add('topics','Politeness and everyday communication','expression',`
please~пожалуйста~Please come in.~Пожалуйста, входите.
thank you~спасибо~Thank you for waiting.~Спасибо, что подождали.
excuse me~извините; обращение~Excuse me, is this free?~Извините, здесь свободно?
sorry~извини; извините~Sorry I am late.~Извините за опоздание.
you are welcome~пожалуйста; ответ на благодарность~Thanks! You are welcome.~Спасибо! Пожалуйста.
no problem~без проблем~I can help. No problem.~Я могу помочь. Без проблем.
nice to meet you~приятно познакомиться~Nice to meet you, Anna.~Приятно познакомиться, Анна.
take care~береги себя~Goodbye, take care.~До свидания, береги себя.`);
  add('topics','Requests, offers and invitations','expression',`
could you~не могли бы вы~Could you open the window?~Не могли бы вы открыть окно?
would you like~не хотите ли вы~Would you like some tea?~Не хотите ли чаю?
shall we~не сделать ли нам~Shall we go outside?~Не выйти ли нам на улицу?
may I~можно мне~May I sit here?~Можно мне здесь сесть?
let me~позволь мне~Let me help you.~Позволь мне помочь.
feel free~не стесняйся~Feel free to ask.~Не стесняйся спрашивать.
join us~присоединяйся к нам~Please join us for dinner.~Присоединяйся к нам за ужином.
help yourself~угощайся~Help yourself to bread.~Угощайся хлебом.`);
  add('topics','Opinions, agreement and disagreement','expression',`
I think~я думаю~I think it will work.~Думаю, это сработает.
in my opinion~по моему мнению~In my opinion, it is useful.~По моему мнению, это полезно.
I agree~я согласен~I agree with you.~Я с тобой согласен.
I disagree~я не согласен~I disagree with that idea.~Я не согласен с этой идеей.
perhaps~возможно~Perhaps we should wait.~Возможно, нам следует подождать.
exactly~именно~Exactly! That is my point.~Именно! Я об этом и говорю.
not necessarily~не обязательно~Is it better? Not necessarily.~Это лучше? Не обязательно.
on the other hand~с другой стороны~On the other hand, it costs more.~С другой стороны, это дороже.`);
  add('topics','Wishes, plans and decisions','verb',`
hope~надеяться~I hope you feel better.~Надеюсь, тебе лучше.
wish~желать~We wish you luck.~Мы желаем тебе удачи.
plan~планировать~We plan to travel.~Мы планируем путешествовать.
decide~решать~Decide before Friday.~Реши до пятницы.
choose~выбирать~Choose a colour.~Выбери цвет.
intend~намереваться~I intend to stay.~Я намерен остаться.
expect~ожидать~We expect a reply.~Мы ожидаем ответ.
prefer~предпочитать~I prefer walking.~Я предпочитаю ходить пешком.`);
  add('topics','Problems and solutions','noun',`
problem~проблема~We have a problem.~У нас проблема.
solution~решение проблемы~Find a solution.~Найди решение.
mistake~ошибка~Everyone makes mistakes.~Все ошибаются.
cause~причина~What is the cause?~В чём причина?
result~результат~Check the result.~Проверь результат.
obstacle~препятствие~We faced an obstacle.~Мы столкнулись с препятствием.
alternative~альтернатива~There is an alternative.~Есть альтернатива.
compromise~компромисс~We reached a compromise.~Мы достигли компромисса.`);
  add('topics','Safety and emergencies','noun',`
emergency~чрезвычайная ситуация~Call in an emergency.~Звоните в экстренном случае.
ambulance~скорая помощь~Call an ambulance.~Вызовите скорую помощь.
fire~пожар; огонь~There is a fire.~Здесь пожар.
exit~выход~Find the nearest exit.~Найдите ближайший выход.
warning~предупреждение~Read the warning.~Прочитайте предупреждение.
shelter~укрытие~Find safe shelter.~Найдите безопасное укрытие.
first aid~первая помощь~She knows first aid.~Она умеет оказывать первую помощь.
evacuation~эвакуация~The evacuation was orderly.~Эвакуация прошла организованно.`);
  add('topics','Services and everyday errands','noun',`
post office~почтовое отделение~The post office is closed.~Почта закрыта.
parcel~посылка~I sent a parcel.~Я отправил посылку.
laundry~прачечная; стирка~Take this to the laundry.~Отнеси это в прачечную.
repair~ремонт~The repair took an hour.~Ремонт занял час.
delivery~доставка~The delivery arrived.~Доставка прибыла.
appointment~назначенная встреча~Book an appointment.~Запишитесь на приём.
queue~очередь~Join the queue.~Встаньте в очередь.
form~бланк; форма~Fill in this form.~Заполните этот бланк.`);

  const fruit=`apple~яблоко~яблоко
pear~груша~грушу
peach~персик~персик
apricot~абрикос~абрикос
plum~слива~сливу
cherry~вишня~вишню
grape~виноград; виноградина~виноградину
orange~апельсин~апельсин
mandarin~мандарин~мандарин
lemon~лимон~лимон
lime~лайм~лайм
grapefruit~грейпфрут~грейпфрут
banana~банан~банан
pineapple~ананас~ананас
mango~манго~манго
papaya~папайя~папайю
avocado~авокадо~авокадо
kiwi~киви~киви
fig~инжир~инжир
date~финик~финик
persimmon~хурма~хурму
pomegranate~гранат~гранат
coconut~кокос~кокос
passion fruit~маракуйя~маракуйю
dragon fruit~питахайя~питахайю
lychee~личи~личи
rambutan~рамбутан~рамбутан
mangosteen~мангустин~мангустин
durian~дуриан~дуриан
jackfruit~джекфрут~джекфрут
guava~гуава~гуаву
star fruit~карамбола~карамболу
quince~айва~айву
mulberry~шелковица~шелковицу
gooseberry~крыжовник~ягоду крыжовника
strawberry~клубника~клубнику
raspberry~малина~малину
blueberry~голубика~голубику
blackberry~ежевика~ежевику
cranberry~клюква~клюкву`;
  add('topics','Fruits and berries','noun',fruit.split('\n').map(line=>{const [en,ru,acc]=line.split('~');return [en,ru,'Try this '+en+'.','Попробуй '+acc+'.'].join('~');}).join('\n'));
  const vegetables=`carrot~морковь~carrots~моркови
potato~картофель~potatoes~картофеля
tomato~помидор~tomatoes~помидоров
cucumber~огурец~cucumbers~огурцов
onion~репчатый лук~onions~лука
garlic~чеснок~garlic~чеснока
cabbage~капуста~cabbage~капусты
cauliflower~цветная капуста~cauliflower~цветной капусты
broccoli~брокколи~broccoli~брокколи
spinach~шпинат~spinach~шпината
lettuce~листовой салат~lettuce~салата
beetroot~свёкла~beetroot~свёклы
radish~редис~radishes~редиса
turnip~репа~turnips~репы
parsnip~пастернак~parsnips~пастернака
aubergine~баклажан~aubergines~баклажанов
courgette~кабачок~courgettes~кабачков
pumpkin~тыква~pumpkin~тыквы
sweet potato~батат~sweet potatoes~батата
celery~сельдерей~celery~сельдерея
leek~лук-порей~leeks~лука-порея
asparagus~спаржа~asparagus~спаржи
artichoke~артишок~artichokes~артишоков
okra~бамия~okra~бамии
kohlrabi~кольраби~kohlrabi~кольраби
fennel~фенхель~fennel~фенхеля
chard~мангольд~chard~мангольда
kale~листовая капуста~kale~листовой капусты
watercress~водяной кресс~watercress~водяного кресса
bell pepper~сладкий перец~bell peppers~сладкого перца`;
  add('topics','Vegetables','noun',vegetables.split('\n').map(line=>{const [en,ru,use,gen]=line.split('~');return [en,ru,'Add some '+use+'.','Добавь немного '+gen+'.'].join('~');}).join('\n'));
  add('topics','Herbs and spices','noun',`
basil~базилик~Add fresh basil.~Добавь свежий базилик.
parsley~петрушка~Chop the parsley.~Нарежь петрушку.
dill~укроп~Dill goes well with fish.~Укроп хорошо подходит к рыбе.
mint~мята~This tea contains mint.~В этом чае есть мята.
rosemary~розмарин~Roast it with rosemary.~Запеки это с розмарином.
thyme~тимьян~Use a sprig of thyme.~Используй веточку тимьяна.
coriander~кориандр; кинза~Add coriander leaves.~Добавь листья кинзы.
cinnamon~корица~The cake smells of cinnamon.~Пирог пахнет корицей.
ginger~имбирь~Grate the ginger.~Натри имбирь.
turmeric~куркума~Turmeric makes the rice yellow.~Куркума делает рис жёлтым.
cumin~кумин; зира~Toast the cumin seeds.~Обжарь семена зиры.
saffron~шафран~Saffron is expensive.~Шафран дорогой.
cardamom~кардамон~Add a little cardamom.~Добавь немного кардамона.
clove~гвоздика пряность~A clove adds a strong flavour.~Гвоздика придаёт сильный аромат.
nutmeg~мускатный орех~Grate some nutmeg.~Натри немного мускатного ореха.
star anise~бадьян~Star anise flavours the broth.~Бадьян придаёт аромат бульону.`);
  add('topics','Nuts, seeds and legumes','noun',`
almond~миндаль~These biscuits contain almonds.~В этом печенье есть миндаль.
walnut~грецкий орех~Crack a walnut.~Расколи грецкий орех.
hazelnut~фундук~The chocolate contains hazelnuts.~В шоколаде есть фундук.
pistachio~фисташка~I like pistachio ice cream.~Мне нравится фисташковое мороженое.
cashew~кешью~We bought roasted cashews.~Мы купили жареные кешью.
sesame~кунжут~Sprinkle sesame on top.~Посыпь сверху кунжутом.
lentil~чечевица~Lentils cook quickly.~Чечевица быстро варится.
chickpea~нут~Chickpeas are used in hummus.~Нут используют в хумусе.
kidney bean~красная фасоль~Cook the kidney beans thoroughly.~Тщательно свари красную фасоль.
sunflower seed~семечко подсолнечника~Birds eat sunflower seeds.~Птицы едят семена подсолнечника.`);
  add('topics','Grains and baking','noun',`
wheat~пшеница~Wheat is used for flour.~Из пшеницы делают муку.
oats~овёс; овсяные хлопья~I eat oats for breakfast.~Я ем овсянку на завтрак.
barley~ячмень~Add barley to the soup.~Добавь ячмень в суп.
rye~рожь~This bread contains rye.~В этом хлебе есть рожь.
buckwheat~гречка~Buckwheat is ready.~Гречка готова.
quinoa~киноа~Rinse the quinoa.~Промой киноа.
dough~тесто~Let the dough rise.~Дай тесту подняться.
yeast~дрожжи~The recipe uses yeast.~В рецепте используются дрожжи.
sourdough~хлебная закваска; хлеб на ней~I baked sourdough bread.~Я испёк хлеб на закваске.
pastry~выпечка; сдобное тесто~The pastry is crisp.~Выпечка хрустящая.`);
  add('topics','Meat, fish and seafood','noun',`
beef~говядина~The stew contains beef.~В рагу есть говядина.
pork~свинина~He does not eat pork.~Он не ест свинину.
lamb~баранина~We roasted lamb.~Мы запекли баранину.
chicken~курятина~The chicken is cooked.~Курятина готова.
salmon~лосось~I ordered grilled salmon.~Я заказал лосося на гриле.
trout~форель~The river has trout.~В реке водится форель.
tuna~тунец~We made a tuna salad.~Мы приготовили салат с тунцом.
prawn~креветка~Peel the prawns.~Очисти креветки.
mussel~мидия~The mussels are fresh.~Мидии свежие.
oyster~устрица~She tried an oyster.~Она попробовала устрицу.
squid~кальмар~The squid was tender.~Кальмар был нежным.
scallop~морской гребешок~The chef seared the scallops.~Повар быстро обжарил гребешки.`);
  add('topics','Dairy, eggs and desserts','noun',`
yoghurt~йогурт~Add plain yoghurt.~Добавь йогурт без добавок.
cream~сливки~Whip the cream.~Взбей сливки.
butter~сливочное масло~Melt the butter.~Растопи масло.
cottage cheese~творог~I bought cottage cheese.~Я купил творог.
egg white~яичный белок~Beat the egg whites.~Взбей яичные белки.
egg yolk~яичный желток~Separate the egg yolk.~Отдели желток.
custard~заварной крем~Serve it with custard.~Подавай это с заварным кремом.
meringue~безе~The meringue is crisp.~Безе хрустящее.
sorbet~сорбет~Try the lemon sorbet.~Попробуй лимонный сорбет.
caramel~карамель~The caramel is hot.~Карамель горячая.`);
  add('topics','Birds and insects','noun',`
sparrow~воробей~A sparrow landed nearby.~Рядом сел воробей.
swallow~ласточка~Swallows flew over the field.~Ласточки летали над полем.
owl~сова~We heard an owl.~Мы услышали сову.
eagle~орёл~An eagle circled above us.~Над нами кружил орёл.
kingfisher~зимородок~A kingfisher caught a fish.~Зимородок поймал рыбу.
woodpecker~дятел~A woodpecker tapped the tree.~Дятел стучал по дереву.
butterfly~бабочка~A butterfly landed on a flower.~Бабочка села на цветок.
dragonfly~стрекоза~Dragonflies hover over the pond.~Стрекозы зависают над прудом.
beetle~жук~A beetle crawled past.~Мимо прополз жук.
grasshopper~кузнечик~The grasshopper jumped.~Кузнечик прыгнул.`);
  add('topics','Sea animals','noun',`
whale~кит~A whale surfaced.~Кит всплыл.
dolphin~дельфин~Dolphins followed the boat.~Дельфины следовали за лодкой.
seal~тюлень~The seal rested on a rock.~Тюлень отдыхал на камне.
octopus~осьминог~The octopus changed colour.~Осьминог изменил цвет.
jellyfish~медуза~Do not touch the jellyfish.~Не трогай медузу.
seahorse~морской конёк~The seahorse hid in the plants.~Морской конёк спрятался в растениях.
stingray~скат-хвостокол~A stingray glided past.~Мимо проплыл скат.
narwhal~нарвал~The narwhal has a long tusk.~У нарвала длинный бивень.
cuttlefish~каракатица~The cuttlefish released ink.~Каракатица выпустила чернила.
sea urchin~морской ёж~Avoid stepping on sea urchins.~Не наступайте на морских ежей.`);
  add('topics','Trees, flowers and gardening','noun',`
oak~дуб~An oak grows here.~Здесь растёт дуб.
birch~берёза~The birch has white bark.~У берёзы белая кора.
willow~ива~A willow grows by the river.~У реки растёт ива.
maple~клён~Maple leaves turn red.~Листья клёна краснеют.
pine~сосна~The pine stays green.~Сосна остаётся зелёной.
lavender~лаванда~Lavender smells lovely.~Лаванда приятно пахнет.
orchid~орхидея~The orchid is flowering.~Орхидея цветёт.
peony~пион~The peonies are pink.~Пионы розовые.
compost~компост~Add compost to the soil.~Добавь компост в почву.
seedling~сеянец; рассада~Water the seedlings.~Полей рассаду.`);
  add('topics','Landscapes and natural disasters','noun',`
valley~долина~Fog filled the valley.~Туман заполнил долину.
cliff~утёс; обрыв~Stay away from the cliff.~Держись подальше от обрыва.
waterfall~водопад~We heard the waterfall.~Мы услышали водопад.
glacier~ледник~The glacier is retreating.~Ледник отступает.
volcano~вулкан~The volcano is active.~Вулкан действующий.
earthquake~землетрясение~The earthquake damaged roads.~Землетрясение повредило дороги.
flood~наводнение~The flood closed the bridge.~Из-за наводнения закрыли мост.
avalanche~лавина~An avalanche blocked the pass.~Лавина перекрыла перевал.
landslide~оползень~The landslide covered the road.~Оползень засыпал дорогу.
wildfire~природный пожар~The wildfire spread quickly.~Природный пожар быстро распространился.`);
  add('topics','Holidays and traditions','noun',`
New Year~Новый год~We celebrate New Year together.~Мы вместе отмечаем Новый год.
Christmas~Рождество~They decorate the house for Christmas.~Они украшают дом к Рождеству.
Easter~Пасха~We paint eggs at Easter.~На Пасху мы красим яйца.
Halloween~Хэллоуин~The children wore costumes for Halloween.~На Хэллоуин дети надели костюмы.
Diwali~Дивали~Lamps shine during Diwali.~Во время Дивали горят лампы.
Hanukkah~Ханука~They lit candles for Hanukkah.~Они зажгли свечи на Хануку.
Eid al-Fitr~Ураза-байрам~The family gathered for Eid al-Fitr.~Семья собралась на Ураза-байрам.
Lunar New Year~лунный Новый год~They celebrate Lunar New Year.~Они отмечают лунный Новый год.
Nowruz~Навруз~Nowruz welcomes spring.~Навруз встречает весну.
Vardavar~Вардавар~People splash water during Vardavar.~Во время Вардавара люди обливаются водой.
tradition~традиция~This tradition is old.~Эта традиция старая.
ritual~ритуал~The ritual marks a new beginning.~Ритуал знаменует новое начало.
costume~костюм~She made her own costume.~Она сама сделала костюм.
procession~шествие~A procession crossed the square.~Шествие прошло через площадь.`);
  add('topics','Documents and postal services','noun',`
certificate~свидетельство; сертификат~Bring the original certificate.~Принесите оригинал свидетельства.
signature~подпись~Your signature is required.~Нужна ваша подпись.
envelope~конверт~Put it in an envelope.~Положи это в конверт.
stamp~почтовая марка~Buy a stamp.~Купи марку.
postcode~почтовый индекс~Write the postcode.~Напишите почтовый индекс.
tracking number~номер отслеживания~Keep the tracking number.~Сохраните номер отслеживания.
application~заявление~Submit your application.~Подайте заявление.
photocopy~ксерокопия~I need a photocopy.~Мне нужна ксерокопия.`);
  add('topics','Renting, moving and repairs','noun',`
landlord~арендодатель~Contact the landlord.~Свяжись с арендодателем.
tenant~арендатор~The tenant pays monthly.~Арендатор платит ежемесячно.
lease~договор аренды~Read the lease carefully.~Внимательно прочитайте договор аренды.
rent~арендная плата~The rent includes heating.~Арендная плата включает отопление.
removal van~фургон для переезда~The removal van has arrived.~Приехал фургон для переезда.
leak~протечка~There is a leak upstairs.~Наверху протечка.
socket~электрическая розетка~This socket is broken.~Эта розетка сломана.
wrench~гаечный ключ~Pass me the wrench.~Передай мне гаечный ключ.`);
  add('topics','Accessibility and disability','noun',`
accessibility~доступность среды~Accessibility benefits everyone.~Доступность полезна всем.
wheelchair~инвалидная коляска~The entrance has space for a wheelchair.~Во входе достаточно места для коляски.
ramp~пандус~Use the ramp.~Воспользуйтесь пандусом.
lift~лифт~The lift is working.~Лифт работает.
hearing aid~слуховой аппарат~He uses a hearing aid.~Он пользуется слуховым аппаратом.
subtitles~субтитры~Turn on the subtitles.~Включи субтитры.
sign language~жестовый язык~She is learning sign language.~Она учит жестовый язык.
screen reader~программа экранного доступа~The website supports screen readers.~Сайт поддерживает программы экранного доступа.`);
  add('topics','Computers and internet safety','noun',`
software~программное обеспечение~Update the software.~Обнови программное обеспечение.
hardware~компьютерное оборудование~The hardware is new.~Оборудование новое.
backup~резервная копия~Make a backup.~Сделай резервную копию.
encryption~шифрование~Encryption protects the data.~Шифрование защищает данные.
phishing~фишинг~This email may be phishing.~Это письмо может быть фишингом.
malware~вредоносное ПО~The scan found malware.~Проверка обнаружила вредоносное ПО.
firewall~межсетевой экран~Enable the firewall.~Включи межсетевой экран.
authentication~проверка подлинности~Use two-factor authentication.~Используй двухфакторную аутентификацию.`);

  const disciplines=`mathematics~математика~математику
physics~физика~физику
chemistry~химия~химию
biology~биология~биологию
geology~геология~геологию
astronomy~астрономия~астрономию
geography~география~географию
ecology~экология~экологию
botany~ботаника~ботанику
zoology~зоология~зоологию
genetics~генетика~генетику
neuroscience~нейронаука~нейронауку
psychology~психология~психологию
sociology~социология~социологию
anthropology~антропология~антропологию
archaeology~археология~археологию
linguistics~лингвистика~лингвистику
economics~экономика~экономику
political science~политология~политологию
philosophy~философия~философию
logic~логика~логику
statistics~статистика~статистику
computer science~информатика~информатику
engineering~инженерное дело~инженерное дело
medicine~медицина~медицину
meteorology~метеорология~метеорологию
oceanography~океанография~океанографию
palaeontology~палеонтология~палеонтологию
seismology~сейсмология~сейсмологию
biochemistry~биохимия~биохимию`;
  add('topics','Scientific disciplines','noun',disciplines.split('\n').map(line=>{const [en,ru,acc]=line.split('~');return [en,ru,'She studies '+en+'.','Она изучает '+acc+'.'].join('~');}).join('\n'));
  add('topics','Research and scientific method','noun',`
research~исследование~Research takes time.~Исследование требует времени.
hypothesis~гипотеза~We tested the hypothesis.~Мы проверили гипотезу.
experiment~эксперимент~Repeat the experiment.~Повтори эксперимент.
observation~наблюдение~Record your observations.~Запишите ваши наблюдения.
measurement~измерение~The measurement was accurate.~Измерение было точным.
sample~образец; выборка~We collected a sample.~Мы взяли образец.
variable~переменная~Change only one variable.~Измените только одну переменную.
peer review~научное рецензирование~The paper underwent peer review.~Статья прошла научное рецензирование.
replication~воспроизведение исследования~Replication strengthens the evidence.~Воспроизведение укрепляет доказательства.
uncertainty~неопределённость~Report the uncertainty.~Укажите неопределённость.`);
  add('topics','Mathematics and logic','noun',`
equation~уравнение~Solve the equation.~Реши уравнение.
proof~доказательство~The proof is complete.~Доказательство завершено.
theorem~теорема~State the theorem.~Сформулируй теорему.
angle~угол~Measure the angle.~Измерь угол.
probability~вероятность~The probability is low.~Вероятность низкая.
set~множество~This set has three elements.~В этом множестве три элемента.
function~функция~Plot the function.~Построй график функции.
derivative~производная~Find the derivative.~Найди производную.
integral~интеграл~Calculate the integral.~Вычисли интеграл.
premise~посылка рассуждения~Check the premise.~Проверь посылку рассуждения.`);
  add('topics','Physics and energy','noun',`
force~сила~A force changes motion.~Сила изменяет движение.
mass~масса~Measure the mass.~Измерь массу.
velocity~скорость с направлением~The velocity changed.~Скорость изменилась.
acceleration~ускорение~The acceleration is constant.~Ускорение постоянно.
gravity~гравитация~Gravity attracts objects.~Гравитация притягивает объекты.
friction~трение~Friction produces heat.~Трение выделяет тепло.
wavelength~длина волны~Measure the wavelength.~Измерь длину волны.
electric current~электрический ток~The wire carries electric current.~По проводу течёт электрический ток.
voltage~напряжение~Check the voltage.~Проверь напряжение.
entropy~энтропия~The lecture explained entropy.~На лекции объясняли энтропию.`);
  add('topics','Chemistry and materials','noun',`
atom~атом~An atom contains a nucleus.~Атом содержит ядро.
molecule~молекула~This molecule contains oxygen.~Эта молекула содержит кислород.
element~химический элемент~Oxygen is an element.~Кислород — химический элемент.
compound~химическое соединение~Water is a compound.~Вода — химическое соединение.
reaction~реакция~The reaction released heat.~Реакция выделила тепло.
catalyst~катализатор~A catalyst speeds the reaction.~Катализатор ускоряет реакцию.
solution~раствор~Stir the solution.~Перемешай раствор.
acid~кислота~Handle the acid carefully.~Обращайтесь с кислотой осторожно.
alkali~щёлочь~This solution contains an alkali.~Этот раствор содержит щёлочь.
polymer~полимер~The material is a polymer.~Этот материал — полимер.`);
  add('topics','Biology and genetics','noun',`
cell~клетка~A cell is dividing.~Клетка делится.
tissue~ткань организма~The sample contains muscle tissue.~Образец содержит мышечную ткань.
organ~орган~The heart is an organ.~Сердце — орган.
gene~ген~A gene can affect a trait.~Ген может влиять на признак.
chromosome~хромосома~The diagram shows a chromosome.~На схеме изображена хромосома.
mutation~мутация~The researchers detected a mutation.~Исследователи обнаружили мутацию.
evolution~эволюция~We studied evolution.~Мы изучали эволюцию.
species~вид организмов~This species is rare.~Этот вид редкий.
enzyme~фермент~An enzyme helps the reaction.~Фермент помогает реакции.
photosynthesis~фотосинтез~Plants use photosynthesis.~Растения используют фотосинтез.`);
  add('topics','Earth science and geology','noun',`
mineral~минерал~Quartz is a mineral.~Кварц — минерал.
rock~горная порода~We examined the rock.~Мы исследовали породу.
sediment~осадок; отложения~Sediment settled on the bottom.~Осадок осел на дне.
fossil~окаменелость~They discovered a fossil.~Они обнаружили окаменелость.
tectonic plate~тектоническая плита~The tectonic plates move slowly.~Тектонические плиты движутся медленно.
fault~геологический разлом~The map shows a fault.~На карте показан разлом.
erosion~эрозия~Erosion changes the coast.~Эрозия меняет побережье.
stratum~геологический слой~This stratum contains fossils.~В этом слое есть окаменелости.
magma~магма~Magma rose beneath the volcano.~Магма поднялась под вулканом.
mantle~мантия Земли~The mantle lies below the crust.~Мантия находится под корой.`);
  add('topics','Space and astronomy','noun',`
planet~планета~The planet has two moons.~У планеты две луны.
star~звезда~That star is bright.~Та звезда яркая.
galaxy~галактика~Our galaxy contains many stars.~Наша галактика содержит много звёзд.
orbit~орбита~The satellite entered orbit.~Спутник вышел на орбиту.
comet~комета~A comet crossed the sky.~Комета пересекла небо.
asteroid~астероид~The telescope tracked an asteroid.~Телескоп отслеживал астероид.
nebula~туманность~The image shows a nebula.~На снимке туманность.
supernova~сверхновая~Astronomers observed a supernova.~Астрономы наблюдали сверхновую.
black hole~чёрная дыра~Matter fell towards the black hole.~Вещество падало к чёрной дыре.
constellation~созвездие~Can you recognise this constellation?~Ты узнаёшь это созвездие?`);
  add('topics','Psychology and neuroscience','noun',`
memory~память~Sleep supports memory.~Сон помогает памяти.
attention~внимание~The task requires attention.~Задача требует внимания.
perception~восприятие~Context affects perception.~Контекст влияет на восприятие.
behaviour~поведение~We observed their behaviour.~Мы наблюдали их поведение.
emotion~эмоция~Fear is an emotion.~Страх — эмоция.
cognition~познание~The course explores cognition.~Курс посвящён познанию.
neuron~нейрон~A neuron transmits signals.~Нейрон передаёт сигналы.
synapse~синапс~Signals cross the synapse.~Сигналы проходят через синапс.
stimulus~стимул~The animal responded to the stimulus.~Животное отреагировало на стимул.
bias~предвзятость; систематическое смещение~We checked for bias.~Мы проверили наличие систематического смещения.`);
  add('topics','Society, economics and politics','noun',`
society~общество~Society is changing.~Общество меняется.
community~сообщество~The community supports the school.~Сообщество поддерживает школу.
inequality~неравенство~The report examines inequality.~В отчёте рассматривается неравенство.
inflation~инфляция~Inflation affects prices.~Инфляция влияет на цены.
supply~предложение на рынке~Supply has increased.~Предложение выросло.
demand~спрос~Demand for housing is high.~Спрос на жильё высок.
election~выборы~The election is next month.~Выборы в следующем месяце.
parliament~парламент~Parliament debated the law.~Парламент обсуждал закон.
constitution~конституция~Read the constitution.~Прочитайте конституцию.
citizenship~гражданство~She applied for citizenship.~Она подала заявление на гражданство.`);
  add('topics','History and archaeology','noun',`
century~век~The castle dates from that century.~Замок относится к тому веку.
dynasty~династия~The dynasty ruled for centuries.~Династия правила веками.
empire~империя~The empire expanded.~Империя расширилась.
settlement~поселение~They found an ancient settlement.~Они нашли древнее поселение.
excavation~раскопки~The excavation began in May.~Раскопки начались в мае.
artefact~артефакт~The artefact is made of bronze.~Артефакт сделан из бронзы.
inscription~надпись~They translated the inscription.~Они перевели надпись.
manuscript~рукопись~The manuscript is fragile.~Рукопись хрупкая.
chronicle~летопись~The chronicle records the event.~Летопись описывает событие.
heritage~наследие~We must preserve this heritage.~Мы должны сохранить это наследие.`);
  add('topics','Engineering and inventions','noun',`
design~проект; конструкция~The design is efficient.~Конструкция эффективна.
prototype~прототип~They tested a prototype.~Они испытали прототип.
mechanism~механизм~The mechanism is simple.~Механизм простой.
sensor~датчик~The sensor measures pressure.~Датчик измеряет давление.
circuit~электрическая цепь~The circuit is complete.~Цепь замкнута.
turbine~турбина~Wind turns the turbine.~Ветер вращает турбину.
gear~шестерня~Replace the damaged gear.~Замените повреждённую шестерню.
alloy~сплав~The part is made of an alloy.~Деталь сделана из сплава.
patent~патент~She applied for a patent.~Она подала заявку на патент.
innovation~нововведение~Innovation can reduce waste.~Нововведения могут уменьшить отходы.`);
  add('topics','Statistics and data','noun',`
dataset~набор данных~Clean the dataset.~Очистите набор данных.
mean~среднее арифметическое~Calculate the mean.~Вычисли среднее арифметическое.
median~медиана~The median is ten.~Медиана равна десяти.
variance~дисперсия~The variance is small.~Дисперсия мала.
correlation~корреляция~Correlation is not causation.~Корреляция не означает причинность.
distribution~распределение~Plot the distribution.~Постройте график распределения.
outlier~выброс данных~Check this outlier.~Проверьте этот выброс.
confidence interval~доверительный интервал~Report the confidence interval.~Укажите доверительный интервал.
sample size~размер выборки~The sample size was small.~Размер выборки был мал.
visualisation~визуализация~The visualisation shows a trend.~Визуализация показывает тенденцию.`);
  add('topics','Philosophy and ethics','noun',`
ethics~этика~Ethics examines moral questions.~Этика изучает моральные вопросы.
argument~аргумент; рассуждение~The argument is convincing.~Аргумент убедителен.
reasoning~рассуждение~Explain your reasoning.~Объясни своё рассуждение.
knowledge~знание~Experience can provide knowledge.~Опыт может давать знания.
belief~убеждение~She questioned her belief.~Она поставила под сомнение своё убеждение.
consciousness~сознание~The book explores consciousness.~Книга исследует сознание.
free will~свобода воли~They debated free will.~Они обсуждали свободу воли.
justice~справедливость~Everyone deserves justice.~Каждый заслуживает справедливости.
dignity~достоинство~Respect human dignity.~Уважайте человеческое достоинство.
responsibility~ответственность~We share responsibility.~Мы разделяем ответственность.`);
  add('topics','Visual arts and painting','noun',`
painting~картина; живопись~The painting hangs in the gallery.~Картина висит в галерее.
canvas~холст~The artist prepared the canvas.~Художник подготовил холст.
brush~кисть~Clean the brush.~Вымой кисть.
pigment~пигмент~The pigment is bright.~Пигмент яркий.
watercolour~акварель~She works in watercolour.~Она работает акварелью.
fresco~фреска~The fresco covers the wall.~Фреска покрывает стену.
still life~натюрморт~He painted a still life.~Он написал натюрморт.
portrait~портрет~The portrait looks lifelike.~Портрет выглядит как живой.
perspective~перспектива~Perspective creates depth.~Перспектива создаёт глубину.
chiaroscuro~светотень~The painting uses chiaroscuro.~В картине используется светотень.`);
  add('topics','Sculpture and ceramics','noun',`
sculpture~скульптура~The sculpture stands outside.~Скульптура стоит снаружи.
clay~глина~Shape the clay.~Придай глине форму.
marble~мрамор~The statue is marble.~Статуя из мрамора.
bronze~бронза~The figure was cast in bronze.~Фигуру отлили из бронзы.
kiln~печь для обжига~The pots are in the kiln.~Горшки в печи для обжига.
glaze~глазурь~Apply the glaze carefully.~Нанеси глазурь аккуратно.
relief~рельеф~The relief shows a battle.~Рельеф изображает битву.
bust~бюст~The bust depicts a poet.~Бюст изображает поэта.
installation~художественная инсталляция~The installation fills the hall.~Инсталляция занимает зал.
maquette~скульптурный макет~The artist made a maquette.~Художник сделал скульптурный макет.`);
  add('topics','Architecture and design','noun',`
arch~арка~We walked under an arch.~Мы прошли под аркой.
column~колонна~The columns support the roof.~Колонны поддерживают крышу.
dome~купол~The dome is visible from afar.~Купол виден издалека.
façade~фасад~They restored the façade.~Они восстановили фасад.
vault~свод~The stone vault is high.~Каменный свод высокий.
blueprint~чертёж~Study the blueprint.~Изучи чертёж.
floor plan~план этажа~The floor plan shows three rooms.~На плане этажа три комнаты.
interior~интерьер~The interior is bright.~Интерьер светлый.
typography~типографика~Typography affects readability.~Типографика влияет на читаемость.
ergonomics~эргономика~The design improves ergonomics.~Дизайн улучшает эргономику.`);
  add('topics','Music and instruments','noun',`
melody~мелодия~I recognise this melody.~Я узнаю эту мелодию.
rhythm~ритм~Follow the rhythm.~Следуй ритму.
harmony~гармония~The harmony is unusual.~Гармония необычная.
tempo~темп~The tempo gets faster.~Темп ускоряется.
violin~скрипка~She plays the violin.~Она играет на скрипке.
cello~виолончель~The cello has a warm sound.~У виолончели тёплый звук.
flute~флейта~He plays the flute.~Он играет на флейте.
oboe~гобой~The oboe begins the solo.~Гобой начинает соло.
duduk~дудук~The duduk has a distinctive sound.~У дудука характерное звучание.
harpsichord~клавесин~The piece uses a harpsichord.~В произведении звучит клавесин.`);
  add('topics','Theatre, dance and performance','noun',`
stage~сцена~The actors are on stage.~Актёры на сцене.
rehearsal~репетиция~Rehearsal starts at ten.~Репетиция начинается в десять.
script~сценарий; текст пьесы~Read the script.~Прочитай текст пьесы.
audition~прослушивание~She attended an audition.~Она пришла на прослушивание.
choreography~хореография~The choreography is demanding.~Хореография сложная.
ballet~балет~We watched a ballet.~Мы посмотрели балет.
improvisation~импровизация~The scene was an improvisation.~Сцена была импровизацией.
monologue~монолог~He performed a monologue.~Он исполнил монолог.
ovation~овация~The audience gave an ovation.~Публика устроила овацию.
puppetry~кукольный театр~The festival includes puppetry.~На фестивале есть кукольный театр.`);
  add('topics','Cinema and photography','noun',`
lens~объектив~Change the lens.~Смени объектив.
aperture~диафрагма~Adjust the aperture.~Настрой диафрагму.
exposure~экспозиция~The exposure is correct.~Экспозиция правильная.
shutter~затвор~The shutter clicked.~Щёлкнул затвор.
close-up~крупный план~The scene ends with a close-up.~Сцена заканчивается крупным планом.
screenplay~киносценарий~She wrote the screenplay.~Она написала киносценарий.
editing~монтаж~Editing changes the pace.~Монтаж меняет темп.
documentary~документальный фильм~We watched a documentary.~Мы посмотрели документальный фильм.
animation~анимация~The film combines animation and live action.~Фильм сочетает анимацию и живую съёмку.
cinematography~операторское искусство~The cinematography is striking.~Операторская работа впечатляет.`);
  add('topics','Literature and storytelling','noun',`
author~автор~The author answered questions.~Автор ответил на вопросы.
narrator~рассказчик~The narrator is unreliable.~Рассказчик ненадёжен.
character~персонаж~The main character changes.~Главный персонаж меняется.
metaphor~метафора~This metaphor is powerful.~Эта метафора сильная.
imagery~образность~The poem has vivid imagery.~В стихотворении яркая образность.
stanza~строфа~Read the first stanza.~Прочитай первую строфу.
alliteration~аллитерация~Alliteration repeats consonant sounds.~Аллитерация повторяет согласные звуки.
foreshadowing~предвосхищение в повествовании~The scene contains foreshadowing.~Сцена содержит намёк на будущие события.
allegory~аллегория~The story is an allegory.~Этот рассказ — аллегория.
denouement~развязка~The denouement surprised me.~Развязка меня удивила.`);
  add('topics','Crafts, textiles and jewellery','noun',`
embroidery~вышивка~The embroidery is handmade.~Вышивка сделана вручную.
weaving~ткачество~Weaving requires a loom.~Для ткачества нужен станок.
loom~ткацкий станок~The loom is wooden.~Станок деревянный.
yarn~пряжа~Choose soft yarn.~Выбери мягкую пряжу.
felt~войлок~The hat is made of felt.~Шляпа сделана из войлока.
bead~бусина~Thread the beads.~Нанижи бусины.
pendant~кулон~She wore a silver pendant.~Она носила серебряный кулон.
enamel~эмаль~The brooch has blue enamel.~На броши синяя эмаль.
filigree~филигрань~The bracelet has delicate filigree.~На браслете тонкая филигрань.
calligraphy~каллиграфия~He practises calligraphy.~Он занимается каллиграфией.`);
  add('topics','Culture, identity and customs','noun',`
culture~культура~Culture changes over time.~Культура меняется со временем.
custom~обычай~This custom welcomes guests.~Этот обычай приветствует гостей.
identity~идентичность~Language can shape identity.~Язык может формировать идентичность.
community~сообщество~The community preserves its stories.~Сообщество хранит свои истории.
hospitality~гостеприимство~We appreciated their hospitality.~Мы оценили их гостеприимство.
etiquette~этикет~Learn the local etiquette.~Изучи местный этикет.
taboo~табу~The topic is a taboo.~Эта тема — табу.
worldview~мировоззрение~Travel can broaden a worldview.~Путешествия могут расширять мировоззрение.
multilingualism~многоязычие~Multilingualism is common here.~Многоязычие здесь распространено.
diaspora~диаспора~The diaspora maintains cultural ties.~Диаспора сохраняет культурные связи.`);
  add('topics','Folklore, mythology and belief','noun',`
folklore~фольклор~Folklore preserves old stories.~Фольклор сохраняет старые истории.
myth~миф~We read a Greek myth.~Мы прочитали греческий миф.
legend~легенда~The legend describes a hero.~Легенда рассказывает о герое.
fairy tale~сказка~She told a fairy tale.~Она рассказала сказку.
proverb~пословица~This proverb offers advice.~Эта пословица даёт совет.
oral tradition~устная традиция~The story survives through oral tradition.~История сохраняется в устной традиции.
pilgrimage~паломничество~They went on a pilgrimage.~Они отправились в паломничество.
shrine~святилище~Visitors approached the shrine.~Посетители приблизились к святилищу.
symbol~символ~The symbol has several meanings.~У символа несколько значений.
superstition~суеверие~It is an old superstition.~Это старое суеверие.`);
  add('topics','Museums and cultural heritage','noun',`
exhibition~выставка~The exhibition opens tomorrow.~Выставка открывается завтра.
curator~куратор музея~The curator explained the display.~Куратор объяснил экспозицию.
collection~коллекция~The collection includes rare books.~В коллекции есть редкие книги.
restoration~реставрация~Restoration took two years.~Реставрация заняла два года.
preservation~сохранение~Preservation protects fragile objects.~Сохранение защищает хрупкие предметы.
provenance~происхождение предмета~The painting has a clear provenance.~Происхождение картины известно.
replica~копия экспоната~This is a replica.~Это копия экспоната.
archive~архив~The archive is open to researchers.~Архив открыт для исследователей.
monument~памятник~They restored the monument.~Они восстановили памятник.
mosaic~мозаика~The floor has a mosaic.~На полу мозаика.`);
  add('topics','Games and recreation','noun',`
chess~шахматы~We played chess.~Мы играли в шахматы.
board game~настольная игра~Choose a board game.~Выбери настольную игру.
dice~игральные кости~Roll the dice.~Брось кости.
deck~колода~Shuffle the deck.~Перемешай колоду.
turn~ход~It is your turn.~Твой ход.
opponent~соперник~My opponent played well.~Мой соперник хорошо играл.
strategy~стратегия~We need a strategy.~Нам нужна стратегия.
puzzle~головоломка~Solve the puzzle.~Реши головоломку.`);
  add('topics','Grammar and language','noun',Object.entries(grammarDetails).map(([en,detail])=>[en.toLowerCase(),detail.ru,detail.en,detail.definition].join('~')).join('\n'),{id:'topic-grammar',source:'Grammatical Categories'});
}
