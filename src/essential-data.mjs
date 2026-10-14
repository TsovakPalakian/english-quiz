const topics = (names, prefix) => names.split('|').map((title, index) => ({id:prefix+'-'+(index+1),title,entries:[]}));
export const everydayGroups = [
  {id:'basics',title:'Basic sets',topics:topics('Days of the week|Months|Seasons|Parts of the day|Time and time units|Dates and years|Cardinal numbers|Ordinal numbers|Fractions and percentages|Units of measurement|Colours and shades|Shapes|Countries and nationalities|Languages|Compass directions|Personal pronouns|Possessives|Demonstratives|Reflexive pronouns|Indefinite pronouns|Question words|Articles|Prepositions of place and direction|Prepositions of time|Conjunctions and connectors|Quantity words|Frequency|Degree and intensity|Essential verbs|Modal verbs|Basic adjectives and opposites|Common contractions','basic')},
  {id:'topics',title:'Topics',topics:topics('Introductions and personal information|Family and relatives|Friends and relationships|Appearance|Personality|Feelings and emotions|The human body|Health and wellbeing|Doctors and pharmacies|Home and housing|Furniture and household objects|Housework|Daily routines|Food and groceries|Drinks|Cooking|Cafes and restaurants|Clothes and shoes|Shopping|Money and payments|Work and professions|Communication at work|School and education|Learning languages|City and public places|Directions|Transport|Travel|Airports and flights|Hotels and accommodation|Nature and the environment|Weather and climate|Animals|Plants|Sport and exercise|Hobbies and free time|Music, films and books|Celebrations and events|Phones, internet and technology|Messages and social media|News and information|Politeness and everyday communication|Requests, offers and invitations|Opinions, agreement and disagreement|Wishes, plans and decisions|Problems and solutions|Safety and emergencies|Services and everyday errands','topic')}
];
const speechTopics=everydayGroups[0].topics.filter((topic,index)=>index>=15&&index!==30);
everydayGroups[0].topics=everydayGroups[0].topics.filter(topic=>!speechTopics.includes(topic));
everydayGroups.unshift({id:'speech',title:'Speech essentials',topics:speechTopics});
const fill=(group,index,rows)=>{everydayGroups.find(item=>item.id===group).topics[index].entries=rows.map(([en,ru,example,exampleRu,pos='noun'])=>({en,ru,example,exampleRu,pos}));};
fill('speech',0,[
  ['I','я','I am ready.','Я готов.','pronoun'],
  ['you','ты; вы','You are right.','Ты прав.','pronoun'],
  ['he','он','He is my brother.','Он мой брат.','pronoun'],
  ['she','она','She is at home.','Она дома.','pronoun'],
  ['it','оно; это','It is a new book.','Это новая книга.','pronoun'],
  ['we','мы','We live here.','Мы живём здесь.','pronoun'],
  ['they','они','They speak English.','Они говорят по-английски.','pronoun']
]);
fill('speech',1,[
  ['my','мой','This is my bag.','Это моя сумка.','determiner'],
  ['your','твой; ваш','What is your name?','Как тебя зовут?','determiner'],
  ['his','его','His phone is here.','Его телефон здесь.','determiner'],
  ['her','её','Her sister is a doctor.','Её сестра — врач.','determiner'],
  ['its','его; её (о предмете или животном)','The cat is eating its food.','Кошка ест свой корм.','determiner'],
  ['our','наш','Our house is small.','Наш дом маленький.','determiner'],
  ['their','их','Their children are at school.','Их дети в школе.','determiner']
]);
fill('speech',2,[
  ['this','этот; эта; это','This is my friend.','Это мой друг.','pronoun'],
  ['that','тот; та; то','That house is old.','Тот дом старый.','determiner'],
  ['these','эти','These shoes are new.','Эти туфли новые.','determiner'],
  ['those','те','Those people are my neighbours.','Те люди — мои соседи.','determiner']
]);
fill('basics',0,[
  ['Monday','понедельник','See you on Monday.','Увидимся в понедельник.'],
  ['Tuesday','вторник','My class is on Tuesday.','Моё занятие во вторник.'],
  ['Wednesday','среда','We meet on Wednesday.','Мы встречаемся в среду.'],
  ['Thursday','четверг','I work on Thursday.','Я работаю в четверг.'],
  ['Friday','пятница','The shop closes on Friday.','Магазин закрывается в пятницу.'],
  ['Saturday','суббота','I am free on Saturday.','Я свободен в субботу.'],
  ['Sunday','воскресенье','We rest on Sunday.','Мы отдыхаем в воскресенье.']
]);
fill('basics',1,[
  ['January','январь','January is cold here.','Здесь в январе холодно.'],
  ['February','февраль','My birthday is in February.','Мой день рождения в феврале.'],
  ['March','март','Spring starts in March.','Весна начинается в марте.'],
  ['April','апрель','It often rains in April.','В апреле часто идёт дождь.'],
  ['May','май','We travel in May.','Мы путешествуем в мае.'],
  ['June','июнь','School ends in June.','Учебный год заканчивается в июне.'],
  ['July','июль','July is usually hot.','В июле обычно жарко.'],
  ['August','август','We are on holiday in August.','В августе мы в отпуске.'],
  ['September','сентябрь','School starts in September.','Учебный год начинается в сентябре.'],
  ['October','октябрь','The leaves fall in October.','В октябре опадают листья.'],
  ['November','ноябрь','November is often rainy.','В ноябре часто идут дожди.'],
  ['December','декабрь','The year ends in December.','Год заканчивается в декабре.']
]);
fill('basics',2,[
  ['spring','весна','Flowers grow in spring.','Весной растут цветы.'],
  ['summer','лето','We swim in summer.','Летом мы плаваем.'],
  ['autumn','осень','Autumn is my favourite season.','Осень — моё любимое время года.'],
  ['winter','зима','It snows in winter.','Зимой идёт снег.']
]);
fill('topics',0,[
  ['hello','привет','Hello, my name is Anna.','Привет, меня зовут Анна.','interjection'],
  ['name','имя','What is your name?','Как тебя зовут?'],
  ['first name','имя','My first name is Alex.','Меня зовут Алекс.'],
  ['surname','фамилия','What is your surname?','Какая у тебя фамилия?'],
  ['age','возраст','What is your age?','Сколько тебе лет?'],
  ['country','страна','Which country are you from?','Из какой ты страны?'],
  ['city','город','I live in a small city.','Я живу в небольшом городе.'],
  ['address','адрес','What is your address?','Какой у тебя адрес?'],
  ['email','электронная почта','What is your email?','Какая у тебя электронная почта?'],
  ['phone number','номер телефона','This is my phone number.','Это мой номер телефона.'],
  ['meet','знакомиться','Nice to meet you.','Приятно познакомиться.','verb'],
  ['introduce','представлять','Let me introduce my friend.','Позволь мне представить моего друга.','verb']
]);
fill('topics',1,[
  ['family','семья','My family is small.','У меня небольшая семья.'],
  ['mother','мать','My mother is a teacher.','Моя мама — учитель.'],
  ['father','отец','My father works here.','Мой отец работает здесь.'],
  ['parent','родитель','Every parent wants to help.','Каждый родитель хочет помочь.'],
  ['sister','сестра','I have one sister.','У меня одна сестра.'],
  ['brother','брат','My brother is younger.','Мой брат младше.'],
  ['daughter','дочь','Their daughter is five.','Их дочери пять лет.'],
  ['son','сын','Our son is at school.','Наш сын в школе.'],
  ['child','ребёнок','The child is asleep.','Ребёнок спит.'],
  ['husband','муж','Her husband is a doctor.','Её муж — врач.'],
  ['wife','жена','His wife speaks English.','Его жена говорит по-английски.'],
  ['grandmother','бабушка','My grandmother lives nearby.','Моя бабушка живёт поблизости.'],
  ['grandfather','дедушка','My grandfather likes reading.','Мой дедушка любит читать.'],
  ['aunt','тётя','My aunt is visiting us.','Моя тётя гостит у нас.'],
  ['uncle','дядя','My uncle lives in London.','Мой дядя живёт в Лондоне.'],
  ['cousin','двоюродный брат; двоюродная сестра','My cousin is the same age as me.','Мой двоюродный брат одного со мной возраста.']
]);
fill('topics',2,[
  ['friend','друг','She is my best friend.','Она моя лучшая подруга.'],
  ['friendship','дружба','Our friendship is important to me.','Наша дружба важна для меня.'],
  ['neighbour','сосед','Our neighbour is friendly.','Наш сосед дружелюбный.'],
  ['colleague','коллега','I have lunch with a colleague.','Я обедаю с коллегой.'],
  ['partner','партнёр','My partner helps me.','Мой партнёр помогает мне.'],
  ['relationship','отношения','They have a good relationship.','У них хорошие отношения.'],
  ['trust','доверять','I trust my friends.','Я доверяю своим друзьям.','verb'],
  ['help','помогать','Can you help me?','Можешь мне помочь?','verb'],
  ['support','поддерживать','We support each other.','Мы поддерживаем друг друга.','verb'],
  ['share','делиться','We share our ideas.','Мы делимся своими идеями.','verb'],
  ['visit','навещать','I visit my friends on Sunday.','Я навещаю друзей в воскресенье.','verb'],
  ['together','вместе','We study together.','Мы учимся вместе.','adverb']
]);
