(function () {
    const words = [
      { en: "humid", pos: "adjective", uk: "/ˈhjuː.mɪd/", us: "/ˈhjuː.mɪd/", level: "B1", ru: "влажный, душный", gloss: "The air has a lot of water in it, so it feels wet.", ex: "It's humid.", url: "https://dictionary.cambridge.org/dictionary/english/humid" },
      { en: "damp", pos: "adjective", uk: "/dæmp/", us: "/dæmp/", level: "", ru: "сырой, влажный и холодный", gloss: "A little wet, often in a cold and unpleasant way.", ex: "It's damp.", url: "https://dictionary.cambridge.org/dictionary/english/damp" },
      { en: "wet", pos: "adjective", uk: "/wet/", us: "/wet/", level: "", ru: "мокрый", gloss: "The ground and things are covered with water.", ex: "It's wet.", url: "https://dictionary.cambridge.org/dictionary/english/wet" },
      { en: "dry", pos: "adjective", uk: "/draɪ/", us: "/draɪ/", level: "", ru: "сухой", gloss: "There's no water.", ex: "It's sunny and dry.", url: "https://dictionary.cambridge.org/dictionary/english/dry" },
      { en: "windy", pos: "adjective", uk: "/ˈwɪn.di/", us: "/ˈwɪn.di/", level: "", ru: "ветреный", gloss: "There is a lot of wind.", ex: "It's windy and cloudy.", url: "https://dictionary.cambridge.org/dictionary/english/windy" },
      { en: "chilly", pos: "adjective", uk: "/ˈtʃɪl.i/", us: "/ˈtʃɪl.i/", level: "C1", ru: "прохладный", gloss: "A little cold.", ex: "It's chilly.", url: "https://dictionary.cambridge.org/dictionary/english/chilly" },
      { en: "boiling", pos: "adjective", uk: "/ˈbɔɪ.lɪŋ/", us: "/ˈbɔɪ.lɪŋ/", level: "", ru: "очень жаркий", gloss: "Very hot.", ex: "It's boiling.", url: "https://dictionary.cambridge.org/dictionary/english/boiling" },
      { en: "freezing", pos: "adjective", uk: "/ˈfriː.zɪŋ/", us: "/ˈfriː.zɪŋ/", level: "", ru: "морозный", gloss: "Very cold.", ex: "It's freezing.", url: "https://dictionary.cambridge.org/dictionary/english/freezing" },
      { en: "mild", pos: "adjective", uk: "/maɪld/", us: "/maɪld/", level: "", ru: "мягкий", gloss: "Not too hot and not too cold.", ex: "It's mild.", url: "https://dictionary.cambridge.org/dictionary/english/mild" },
      { en: "drizzle", pos: "noun", uk: "/ˈdrɪz.əl/", us: "/ˈdrɪz.əl/", level: "", ru: "морось", gloss: "Very light rain.", ex: "There's drizzle.", url: "https://dictionary.cambridge.org/dictionary/english/drizzle" },
      { en: "shower", pos: "noun", uk: "/ʃaʊər/", us: "/ˈʃaʊ.ɚ/", level: "", ru: "короткий сильный дождь", gloss: "A short period of heavy rain.", ex: "There is a shower.", url: "https://dictionary.cambridge.org/dictionary/english/shower" },
      { en: "thunderstorm", pos: "noun", uk: "/ˈθʌn.də.stɔːm/", us: "/ˈθʌn.dɚ.stɔːrm/", level: "A2", ru: "гроза", gloss: "Thunder, lightning and usually heavy rain.", ex: "There's a thunderstorm.", url: "https://dictionary.cambridge.org/dictionary/english/thunderstorm" },
      { en: "heavy rain", pos: "noun", uk: "/ˌhev.i ˈreɪn/", us: "/ˌhev.i ˈreɪn/", level: "", ru: "сильный дождь", gloss: "A lot of rain.", ex: "There's heavy rain.", url: "https://dictionary.cambridge.org/dictionary/english/heavy-rain" },
      { en: "sunny", pos: "adjective", uk: "/ˈsʌn.i/", us: "/ˈsʌn.i/", level: "", ru: "солнечный", gloss: "Bright because of light from the sun.", ex: "It's sunny.", url: "https://dictionary.cambridge.org/dictionary/english/sunny" },
      { en: "cloudy", pos: "adjective", uk: "/ˈklaʊ.di/", us: "/ˈklaʊ.di/", level: "", ru: "облачный", gloss: "The sky is full of clouds.", ex: "It's cloudy.", url: "https://dictionary.cambridge.org/dictionary/english/cloudy" },
      { en: "rainy", pos: "adjective", uk: "/ˈreɪ.ni/", us: "/ˈreɪ.ni/", level: "", ru: "дождливый", gloss: "There is a lot of rain.", ex: "It's rainy.", url: "https://dictionary.cambridge.org/dictionary/english/rainy" },
      { en: "snowy", pos: "adjective", uk: "/ˈsnəʊ.i/", us: "/ˈsnoʊ.i/", level: "", ru: "снежный", gloss: "There is a lot of snow.", ex: "It's snowy.", url: "https://dictionary.cambridge.org/dictionary/english/snowy" },
      { en: "pleasant", pos: "adjective", uk: "/ˈplez.ənt/", us: "/ˈplez.ənt/", level: "", ru: "приятный", gloss: "Enjoyable, and not too hot.", ex: "It's pleasant.", url: "https://dictionary.cambridge.org/dictionary/english/pleasant" },
      { en: "warm", pos: "adjective", uk: "/wɔːm/", us: "/wɔːrm/", level: "", ru: "теплый", gloss: "A comfortably high temperature, but not hot.", ex: "It's warm.", url: "https://dictionary.cambridge.org/dictionary/english/warm" },
      { en: "cold", pos: "adjective", uk: "/kəʊld/", us: "/koʊld/", level: "", ru: "холодный", gloss: "At a low temperature.", ex: "It's cold.", url: "https://dictionary.cambridge.org/dictionary/english/cold" },
      { en: "hot", pos: "adjective", uk: "/hɒt/", us: "/hɑːt/", level: "", ru: "жаркий", gloss: "At a high temperature.", ex: "It's hot.", url: "https://dictionary.cambridge.org/dictionary/english/hot" }
    ];
    const lines21 = [
      { en: "Do you mind if I take this chair?", pos: "phrase", ru: "Вы не против, если я возьму этот стул?", gloss: "", ex: "", quiz: "lesson-21", url: "https://dictionary.cambridge.org/dictionary/english/mind" },
      { en: "Do you know if there is an ATM near here?", pos: "phrase", ru: "Вы не знаете, есть ли банкомат поблизости?", gloss: "", ex: "", quiz: "lesson-21", url: "https://dictionary.cambridge.org/dictionary/english/atm" }
    ];
    const ask07 = [
      { en: "So, tell me about …", pos: "phrase", ru: "Расскажи мне о …", gloss: "", ex: "", quiz: "lesson-07", clip: "tell me about", url: "https://dictionary.cambridge.org/dictionary/english/tell" },
      { en: "I'd like to know about …", pos: "phrase", ru: "Мне бы хотелось узнать о …", gloss: "", ex: "", quiz: "lesson-07", clip: "I'd like to know", url: "https://dictionary.cambridge.org/dictionary/english/know" },
      { en: "Can you tell me a little about …?", pos: "phrase", ru: "Можешь немного рассказать о …?", gloss: "", ex: "", quiz: "lesson-07", clip: "Can you tell me", url: "https://dictionary.cambridge.org/dictionary/english/tell" },
      { en: "I agree. That's true.", pos: "phrase", ru: "Согласен. Это правда.", gloss: "", ex: "Most people never read books.", quiz: "lesson-07", clip: "That's true", url: "https://dictionary.cambridge.org/dictionary/english/agree" },
      { en: "I disagree.", pos: "phrase", ru: "Не согласен.", gloss: "", ex: "", quiz: "lesson-07", clip: "I disagree", url: "https://dictionary.cambridge.org/dictionary/english/disagree" }
    ];
    const phrases09 = [
      { en: "make future plans", pos: "collocation", ru: "строить планы на будущее", gloss: "", ex: "He makes future plans for the next month.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/make-future-plans" },
      { en: "make a to-do list", pos: "collocation", ru: "составить список дел", gloss: "", ex: "He makes a to-do list every morning.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/to-do-list" },
      { en: "plan things in advance", pos: "collocation", ru: "планировать заранее", gloss: "", ex: "He plans things in advance to be productive.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/in-advance" },
      { en: "do some work", pos: "collocation", ru: "сделать немного работы", gloss: "", ex: "He does some work on his projects.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/do-some-work" },
      { en: "keep fit", pos: "collocation", ru: "поддерживать форму", gloss: "do exercise, do sport, care about your health", ex: "He keeps fit with a short run before breakfast.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/keep-fit" },
      { en: "stay in", pos: "collocation", ru: "остаться дома", gloss: "", ex: "He stays in in the morning.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/stay-in" },
      { en: "go out", pos: "collocation", ru: "выйти из дома", gloss: "", ex: "He goes out for business meetings in the afternoon.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/go-out" },
      { en: "go on a trip to Pinsk", pos: "collocation", ru: "поехать в поездку в Пинск", gloss: "", ex: "He also goes on a trip to another city for a conference.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/go-on-a-trip" },
      { en: "have a lie-in", pos: "collocation", ru: "поваляться в кровати", gloss: "Stay in bed for some time after waking up", ex: "He wakes up late and has a lie-in.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/lie-in" },
      { en: "have an early night", pos: "collocation", ru: "лечь спать раньше обычного", gloss: "go to bed earlier that you usually go", ex: "He has an early night after a nice dinner.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/early-night" },
      { en: "have a nap", pos: "collocation", ru: "вздремнуть днем", gloss: "sleep for 30 min during the day", ex: "He has a nap in the afternoon.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/nap" },
      { en: "have a meal at home", pos: "collocation", ru: "поесть дома", gloss: "", ex: "He has a meal at home quickly in the evening.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/meal" },
      { en: "have a good time", pos: "collocation", ru: "хорошо провести время", gloss: "", ex: "He has a good time because he finishes all his tasks.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/have-a-good-time" },
      { en: "come late for appointments", pos: "collocation", ru: "опаздывать на встречи", gloss: "", ex: "He sometimes comes late for appointments because he is too busy.", quiz: "lesson-09", url: "https://dictionary.cambridge.org/dictionary/english/appointment" }
    ];
    const adverbs14 = [
      { en: "always", pos: "adverb", ru: "всегда", gloss: "", ex: "Are you always so happy?", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/always" },
      { en: "usually", pos: "adverb", ru: "обычно", gloss: "", ex: "She is usually at home in the evening.", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/usually" },
      { en: "often", pos: "adverb", ru: "часто", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/often" },
      { en: "occasionally", pos: "adverb", ru: "время от времени", gloss: "", ex: "He is occasionally tired after work.", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/occasionally" },
      { en: "rarely", pos: "adverb", ru: "редко", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/rarely" },
      { en: "hardly ever", pos: "adverb", ru: "почти никогда", gloss: "", ex: "He hardly ever has a nap.", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/hardly-ever" },
      { en: "never", pos: "adverb", ru: "никогда", gloss: "", ex: "I am never late for appointments.", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/never" },
      { en: "most days", pos: "adverb", ru: "в большинство дней", gloss: "", ex: "Are you busy most days?", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/most" },
      { en: "once in a while", pos: "adverb", ru: "изредка", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/once-in-a-while" },
      { en: "once a week", pos: "adverb", ru: "раз в неделю", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/once" },
      { en: "twice a week", pos: "adverb", ru: "два раза в неделю", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/twice" },
      { en: "3 times a year", pos: "adverb", ru: "три раза в год", gloss: "", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/time" },
      { en: "3 times a week", pos: "adverb", ru: "три раза в неделю", gloss: "", ex: "Does she keep fit 3 times a week?", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/time" },
      { en: "achieve a goal", pos: "collocation", ru: "достичь цели", gloss: "reach, come to", ex: "", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/achieve" },
      { en: "beat others", pos: "collocation", ru: "победить других", gloss: "win in the game", ex: "He beat me at chess.", quiz: "lesson-14", url: "https://dictionary.cambridge.org/dictionary/english/beat" }
    ];
    const talk16 = [
      { en: "Do you know if there’s a cafe near here?", pos: "phrase", ru: "Вы не знаете, есть ли рядом кафе?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/cafe" },
      { en: "And you?", pos: "phrase", ru: "А ты? / А вы?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/you" },
      { en: "See you later.", pos: "phrase", ru: "Увидимся позже.", gloss: "", ex: "Nice talking to you. See you later \\ never!", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/later" },
      { en: "Help yourself.", pos: "phrase", ru: "Угощайтесь. / Берите.", gloss: "", ex: "Sure! Help yourself.", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/help-yourself" },
      { en: "That’s my bus.", pos: "phrase", ru: "Это мой автобус.", gloss: "", ex: "That’s my bus. I’ve got to go.", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/bus" },
      { en: "I’ve got to go.", pos: "phrase", ru: "Мне пора идти.", gloss: "", ex: "That’s my bus. I’ve got to go.", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/go" },
      { en: "What/How about you?", pos: "phrase", ru: "А ты? / А как ты?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/about" },
      { en: "I’m George, by the way", pos: "phrase", ru: "Я Джордж, кстати.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/by-the-way" },
      { en: "Is this your first time here?", pos: "phrase", ru: "Вы здесь первый раз?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/first" },
      { en: "Do you mind if I charge my phone here?", pos: "phrase", ru: "Вы не против, если я заряжу здесь телефон?", gloss: "", ex: "Do you mind if I charge my phone here?", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/mind" },
      { en: "How long have you worked here?", pos: "phrase", ru: "Как долго вы здесь работаете?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/long" },
      { en: "Have a good time.", pos: "phrase", ru: "Хорошо провести время.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/have-a-good-time" },
      { en: "It’s a lovely day, isn’t it?", pos: "phrase", ru: "Прекрасный день, правда?", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/lovely" },
      { en: "Is anyone sitting here?", pos: "phrase", ru: "Здесь кто-нибудь сидит?", gloss: "", ex: "Excuse me, is anyone sitting here?", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/sit" },
      { en: "Go ahead.", pos: "phrase", ru: "Пожалуйста, садитесь / делайте.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/go-ahead" },
      { en: "Not at all.", pos: "phrase", ru: "Нисколько. / Совсем не против.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/not-at-all" },
      { en: "Be my guest.", pos: "phrase", ru: "Пожалуйста, будьте как дома.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/be-my-guest" },
      { en: "Ok, nice to meet you.", pos: "phrase", ru: "Хорошо, приятно познакомиться.", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/meet" },
      { en: "Nice talking to you", pos: "phrase", ru: "Было приятно поговорить.", gloss: "", ex: "Nice talking to you. See you later \\ never!", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/talk" },
      { en: "stranger", pos: "noun", ru: "незнакомец", gloss: "A person you do not know.", ex: "starting up a conversation with a stranger", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/stranger" },
      { en: "once a month", pos: "adverb", ru: "раз в месяц", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/once" },
      { en: "twice a month", pos: "adverb", ru: "два раза в месяц", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/twice" },
      { en: "5 times a year", pos: "adverb", ru: "пять раз в год", gloss: "", ex: "", quiz: "lesson-16", url: "https://dictionary.cambridge.org/dictionary/english/time" }
    ];
    const likes23 = [
      { en: "They really love …", pos: "phrase", ru: "Им очень нравится …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/love" },
      { en: "They prefer …", pos: "phrase", ru: "Они предпочитают …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/prefer" },
      { en: "They can’t stand …", pos: "phrase", ru: "Они терпеть не могут …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/stand" },
      { en: "They don’t mind when …", pos: "phrase", ru: "Они не против, когда …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/mind" },
      { en: "They quite like …", pos: "phrase", ru: "Им довольно нравится …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/like" },
      { en: "I really love (when) …", pos: "phrase", ru: "Мне очень нравится (когда) …", gloss: "", ex: "I really love cycling", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/love" },
      { en: "I quite like …", pos: "phrase", ru: "Мне довольно нравится …", gloss: "", ex: "I quite like camping.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/like" },
      { en: "I prefer … to …", pos: "phrase", ru: "Я предпочитаю … чему-то …", gloss: "", ex: "I prefer tennis to volleyball.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/prefer" },
      { en: "I can’t stand (when)…", pos: "phrase", ru: "Я терпеть не могу (когда)…", gloss: "", ex: "I can’t stand long winters.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/stand" },
      { en: "I don’t mind (when) …", pos: "phrase", ru: "Я не против (когда) …", gloss: "", ex: "I don’t mind doing housework.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/mind" },
      { en: "I’m keen on", pos: "phrase", ru: "Мне очень нравится / я увлекаюсь", gloss: "", ex: "I’m keen on cycling", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/keen" },
      { en: "I enjoy …", pos: "phrase", ru: "Мне нравится заниматься …", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/enjoy" },
      { en: "I’m really interested in …", pos: "phrase", ru: "Мне правда интересно …", gloss: "", ex: "I am interested in classical music.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/interested" },
      { en: "I’m into …", pos: "phrase", ru: "Я увлекаюсь …", gloss: "", ex: "I am into (doing) yoga.", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/into" },
      { en: "flip flops", pos: "noun", ru: "шлепанцы", gloss: "Open shoes with a strap between the toes.", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/flip-flops" },
      { en: "street food", pos: "noun", ru: "уличная еда", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/street-food" },
      { en: "gardening", pos: "noun", ru: "садоводство", gloss: "", ex: "", quiz: "lesson-23", url: "https://dictionary.cambridge.org/dictionary/english/gardening" }
    ];
    const extraWords = [
      { en: "tell", pos: "verb", uk: "/tel/", us: "/tel/", ru: "сказать, говорить, рассказывать, сообщать, указывать, отличать, сказываться", gloss: "Additional word from 7 Sep", ex: "So, tell me about …", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/tell" },
      { en: "i'd", pos: "noun", uk: "/aɪd/", us: "/aɪd/", ru: "я бы", gloss: "Additional word from 7 Sep", ex: "I'd like to know about …", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/id" },
      { en: "little", pos: "adjective", uk: "/ˈlɪt.əl/", us: "/ˈlɪt̬.əl/", ru: "маленький, малый, небольшой, немного, мало, кое-что, немногое", gloss: "Additional word from 7 Sep", ex: "Can you tell me a little about …?", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/little" },
      { en: "agree", pos: "verb", uk: "/əˈɡriː/", us: "/əˈɡriː/", ru: "соглашаться, согласоваться, договариваться, согласовываться, соответствовать", gloss: "Additional word from 7 Sep", ex: "I agree. That's true.", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/agree" },
      { en: "true", pos: "adjective", uk: "/truː/", us: "/truː/", ru: "истинный, верный, истина, точно, правдиво, выверять, пригонять", gloss: "Additional word from 7 Sep", ex: "I agree. That's true.", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/true" },
      { en: "disagree", pos: "verb", uk: "/ˌdɪs.əˈɡriː/", us: "/ˌdɪs.əˈɡriː/", ru: "не соглашаться, противоречить, расходиться во мнениях, не совпадать, ссориться", gloss: "Additional word from 7 Sep", ex: "I disagree.", lesson: "7 Sep", url: "https://dictionary.cambridge.org/dictionary/english/disagree" },
      { en: "make", pos: "verb", uk: "/meɪk/", us: "/meɪk/", ru: "марка, изготовление, производство, модель, делаться, делать, производить, совершать", gloss: "Additional word from 9 Sep", ex: "make future plans", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/make" },
      { en: "future", pos: "noun", uk: "/ˈfjuː.tʃər/", us: "/ˈfjuː.tʃɚ/", ru: "будущий, грядущий, будущее, грядущее, будущность", gloss: "Additional word from 9 Sep", ex: "make future plans", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/future" },
      { en: "list", pos: "noun", uk: "/lɪst/", us: "/lɪst/", ru: "список, перечень, реестр, перечислять, крениться, сделанный из каймы", gloss: "Additional word from 9 Sep", ex: "make a to-do list", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/list" },
      { en: "plan", pos: "noun", uk: "/plæn/", us: "/plæn/", ru: "план, намерение, проект, замысел, схема, планировать, строить планы", gloss: "Additional word from 9 Sep", ex: "plan things in advance", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/plan" },
      { en: "advance", pos: "verb", uk: "/ədˈvɑːns/", us: "/ədˈvæns/", ru: "предварительный, продвижение, наступление, продвигать, продвигаться", gloss: "Additional word from 9 Sep", ex: "plan things in advance", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/advance" },
      { en: "work", pos: "noun", uk: "/wɜːk/", us: "/wɝːk/", ru: "работа, труд, произведение, дело, дела, работать, трудиться, действовать", gloss: "Additional word from 9 Sep", ex: "do some work", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/work" },
      { en: "keep", pos: "verb", uk: "/kiːp/", us: "/kiːp/", ru: "держаться, держать, сохранять, содержание, прокорм, главная башня, пища", gloss: "Additional word from 9 Sep", ex: "keep fit", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/keep" },
      { en: "fit", pos: "verb", uk: "/fɪt/", us: "/fɪt/", ru: "подходить, соответствующий, пригонка, посадка, впору", gloss: "Additional word from 9 Sep", ex: "keep fit", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/fit" },
      { en: "stay", pos: "verb", uk: "/steɪ/", us: "/steɪ/", ru: "пребывание, опора, остановка, оставаться, остановиться", gloss: "Additional word from 9 Sep", ex: "stay in", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/stay" },
      { en: "go", pos: "verb", uk: "/ɡəʊ/", us: "/ɡoʊ/", ru: "идти, ехать, ходить, переходить, ездить, ход, движение, попытка, ходьба", gloss: "Additional word from 9 Sep", ex: "go out", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/go" },
      { en: "trip", pos: "noun", uk: "/trɪp/", us: "/trɪp/", ru: "поездка, путешествие, экскурсия, рейс, спотыкаться, опрокидывать", gloss: "Additional word from 9 Sep", ex: "go on a trip to Pinsk", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/trip" },
      { en: "lie-in", pos: "phrasal verb", uk: "/ˈlaɪ.ɪn/", us: "/ˈlaɪ.ɪn/", ru: "валяние в постели", gloss: "Additional word from 9 Sep", ex: "have a lie-in", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/lie-in" },
      { en: "early", pos: "adjective", uk: "/ˈɜː.li/", us: "/ˈɝː.li/", ru: "ранний, предыдущий, преждевременный, рано, преждевременно, заблаговременно", gloss: "Additional word from 9 Sep", ex: "have an early night", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/early" },
      { en: "nap", pos: "noun", uk: "/næp/", us: "/næp/", ru: "дремота, ворс, короткий сон, пушок, пух, ворсить, вздремнуть, дремать", gloss: "Additional word from 9 Sep", ex: "have a nap", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/nap" },
      { en: "meal", pos: "noun", uk: "/mɪəl/", us: "/miːl/", ru: "еда, принятие пищи, мука, обваливать в муке, перемалывать", gloss: "Additional word from 9 Sep", ex: "have a meal at home", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/meal" },
      { en: "home", pos: "noun", uk: "/həʊm/", us: "/hoʊm/", ru: "дома, домой, в цель, дом, жилище, родина, домашний, родной, жить", gloss: "Additional word from 9 Sep", ex: "have a meal at home", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/home" },
      { en: "good", pos: "adjective", uk: "/ɡʊd/", us: "/ɡʊd/", ru: "хороший, добрый, благой, хорошо, добро, благо, польза", gloss: "Additional word from 9 Sep", ex: "have a good time", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/good" },
      { en: "time", pos: "noun", uk: "/taɪm/", us: "/taɪm/", ru: "время, времена, раз, период, приурочить, повременный", gloss: "Additional word from 9 Sep", ex: "have a good time", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/time" },
      { en: "late", pos: "adjective", uk: "/leɪt/", us: "/leɪt/", ru: "поздний, последний, покойный, поздно, недавно, за последнее время", gloss: "Additional word from 9 Sep", ex: "come late for appointments", lesson: "9 Sep", url: "https://dictionary.cambridge.org/dictionary/english/late" },
      { en: "hardly", pos: "adverb", uk: "/ˈhɑːd.li/", us: "/ˈhɑːrd.li/", ru: "вряд ли, едва, едва ли, чуть, с трудом, еле, насилу, резко, сурово, несправедливо", gloss: "Additional word from 14 Sep", ex: "hardly ever", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/hardly" },
      { en: "days", pos: "phrase", uk: "/deɪz/", us: "/deɪz/", ru: "днем, эпоха", gloss: "Additional word from 14 Sep", ex: "most days", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/days" },
      { en: "once", pos: "adverb", uk: "/wʌns/", us: "/wʌns/", ru: "раз, один раз, один раз, как только, прежний, тогдашний", gloss: "Additional word from 14 Sep", ex: "once in a while", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/once" },
      { en: "while", pos: "conjunction", uk: "/waɪl/", us: "/waɪl/", ru: "в то время как, до тех пор пока, проводить время", gloss: "Additional word from 14 Sep", ex: "once in a while", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/while" },
      { en: "week", pos: "noun", uk: "/wiːk/", us: "/wiːk/", ru: "неделя, шесть рабочих дней недели, целая вечность", gloss: "Additional word from 14 Sep", ex: "once a week", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/week" },
      { en: "twice", pos: "predeterminer", uk: "/twaɪs/", us: "/twaɪs/", ru: "дважды, вдвое", gloss: "Additional word from 14 Sep", ex: "twice a week", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/twice" },
      { en: "year", pos: "noun", uk: "/jɪər/", us: "/jɪr/", ru: "год, годы, возраст", gloss: "Additional word from 14 Sep", ex: "3 times a year", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/year" },
      { en: "achieve", pos: "verb", uk: "/əˈtʃiːv/", us: "/əˈtʃiːv/", ru: "достигать, добиваться, выполнять, успешно выполнять, доводить до конца", gloss: "Additional word from 14 Sep", ex: "achieve a goal", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/achieve" },
      { en: "goal", pos: "noun", uk: "/ɡəʊl/", us: "/ɡoʊl/", ru: "цель, ворота, гол, задача, финиш, мета, место назначения", gloss: "Additional word from 14 Sep", ex: "achieve a goal", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/goal" },
      { en: "beat", pos: "verb", uk: "/biːt/", us: "/biːt/", ru: "бить, биться, отбивать, удар, ритм, биение, бой, такт, усталый, измотавшийся", gloss: "Additional word from 14 Sep", ex: "beat others", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/beat" },
      { en: "others", pos: "phrase", uk: "/ˈʌð.əz/", us: "/ˈʌð.ɚz/", ru: "другие", gloss: "Additional word from 14 Sep", ex: "beat others", lesson: "14 Sep", url: "https://dictionary.cambridge.org/dictionary/english/others" },
      { en: "cafe", pos: "noun", uk: "/ˈkæf.eɪ/", us: "/kæfˈeɪ/", ru: "кафе, кофейня, бар", gloss: "Additional word from 16 Sep", ex: "Do you know if there’s a cafe near here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/cafe" },
      { en: "later", pos: "adverb", uk: "/ˈleɪ.tər/", us: "/ˈleɪ.t̬ɚ/", ru: "позже, поздно, позднее, недавно, поздний, более поздний, последний, бывший", gloss: "Additional word from 16 Sep", ex: "See you later.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/later" },
      { en: "help", pos: "verb", uk: "/help/", us: "/help/", ru: "помощь, помощник, подсказка, подмога, помогать, способствовать", gloss: "Additional word from 16 Sep", ex: "Help yourself.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/help" },
      { en: "yourself", pos: "pronoun", uk: "/jɔːˈself/", us: "/jʊrˈself/", ru: "себя, себе, сам, сами, собой", gloss: "Additional word from 16 Sep", ex: "Help yourself.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/yourself" },
      { en: "bus", pos: "noun", uk: "/bʌs/", us: "/bʌs/", ru: "автобус, шина, шины, омнибус, автобусный, ошиновывать", gloss: "Additional word from 16 Sep", ex: "That’s my bus.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/bus" },
      { en: "got", pos: "", uk: "/ɡɒt/", us: "/ɡɑːt/", ru: "получать, попасть, добираться, становиться, иметь, сесть, приобретать, доставать", gloss: "Additional word from 16 Sep", ex: "I’ve got to go.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/got" },
      { en: "first", pos: "ordinal number", uk: "/ˈfɜːst/", us: "/ˈfɝːst/", ru: "первый, ранний, первый, сначала, впервые, начало", gloss: "Additional word from 16 Sep", ex: "Is this your first time here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/first" },
      { en: "mind", pos: "noun", uk: "/maɪnd/", us: "/maɪnd/", ru: "разум, ум, внимание, взгляд, возражать, помнить, мягкий, слабый", gloss: "Additional word from 16 Sep", ex: "Do you mind if I charge my phone here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/mind" },
      { en: "charge", pos: "verb", uk: "/tʃɑːdʒ/", us: "/tʃɑːrdʒ/", ru: "заряд, обязанности, обвинение, заряжать, обвинять, поручать, атаковать", gloss: "Additional word from 16 Sep", ex: "Do you mind if I charge my phone here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/charge" },
      { en: "phone", pos: "noun", uk: "/fəʊn/", us: "/foʊn/", ru: "телефон, фона, звонить по телефону", gloss: "Additional word from 16 Sep", ex: "Do you mind if I charge my phone here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/phone" },
      { en: "worked", pos: "verb", uk: "/wɜːk/", us: "/wɝːk/", ru: "обработанный, отделанный", gloss: "Additional word from 16 Sep", ex: "How long have you worked here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/worked" },
      { en: "lovely", pos: "adjective", uk: "/ˈlʌv.li/", us: "/ˈlʌv.li/", ru: "прекрасный, милый, красивый, красотка", gloss: "Additional word from 16 Sep", ex: "It’s a lovely day, isn’t it?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/lovely" },
      { en: "anyone", pos: "pronoun", uk: "/ˈen.i.wʌn/", us: "/ˈen.i.wʌn/", ru: "любой, кто-нибудь, кто-либо, никто, всякий", gloss: "Additional word from 16 Sep", ex: "Is anyone sitting here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/anyone" },
      { en: "sitting", pos: "noun", uk: "/ˈsɪt.ɪŋ/", us: "/ˈsɪt̬.ɪŋ/", ru: "заседание, сидение, сеанс, сидящий, сидячий, нынешний, являющийся", gloss: "Additional word from 16 Sep", ex: "Is anyone sitting here?", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/sitting" },
      { en: "ahead", pos: "adverb", uk: "/əˈhed/", us: "/əˈhed/", ru: "вперед, впереди, напролом, предстоящий", gloss: "Additional word from 16 Sep", ex: "Go ahead.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/ahead" },
      { en: "guest", pos: "noun", uk: "/ɡest/", us: "/ɡest/", ru: "гость, постоялец, паразит, гостить, гостевой", gloss: "Additional word from 16 Sep", ex: "Be my guest.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/guest" },
      { en: "ok", pos: "exclamation", uk: "/ˌəʊˈkeɪ/", us: "/ˌoʊˈkeɪ/", ru: "хорошо, окей, все в порядке, правильно, все правильно", gloss: "Additional word from 16 Sep", ex: "Ok, nice to meet you.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/ok" },
      { en: "nice", pos: "adjective", uk: "/naɪs/", us: "/naɪs/", ru: "хороший, приятный, милый, красивый, славный, добрый, любезный, вкусный, элегантный", gloss: "Additional word from 16 Sep", ex: "Ok, nice to meet you.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/nice" },
      { en: "meet", pos: "verb", uk: "/miːt/", us: "/miːt/", ru: "встречаться, встречать, встреча, соревнование, сбор, подобающий", gloss: "Additional word from 16 Sep", ex: "Ok, nice to meet you.", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/meet" },
      { en: "talking", pos: "verb", uk: "/tɔːk/", us: "/tɑːk/", ru: "говорящий, разговорчивый, болтливый, выразительный", gloss: "Additional word from 16 Sep", ex: "Nice talking to you", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/talking" },
      { en: "month", pos: "noun", uk: "/mʌnθ/", us: "/mʌnθ/", ru: "месяц", gloss: "Additional word from 16 Sep", ex: "once a month", lesson: "16 Sep", url: "https://dictionary.cambridge.org/dictionary/english/month" },
      { en: "heavy", pos: "adjective", uk: "/ˈhev.i/", us: "/ˈhev.i/", ru: "тяжелый, сильный, густой, тяжело, сильно, тягостно, тяжеловес, тяжелое орудие", gloss: "Additional word from 21 Sep", ex: "heavy rain", lesson: "21 Sep", url: "https://dictionary.cambridge.org/dictionary/english/heavy" },
      { en: "rain", pos: "noun", uk: "/reɪn/", us: "/reɪn/", ru: "дождь, град, поток, потоки, дождевой, литься, лить, сыпаться", gloss: "Additional word from 21 Sep", ex: "heavy rain", lesson: "21 Sep", url: "https://dictionary.cambridge.org/dictionary/english/rain" },
      { en: "take", pos: "verb", uk: "/teɪk/", us: "/teɪk/", ru: "взятие, дубль, захват, сбор, выручка, улов, принимать, брать, считать, занимать", gloss: "Additional word from 21 Sep", ex: "Do you mind if I take this chair?", lesson: "21 Sep", url: "https://dictionary.cambridge.org/dictionary/english/take" },
      { en: "chair", pos: "noun", uk: "/tʃeər/", us: "/tʃer/", ru: "председатель, стул, кресло, кафедра, председательствовать, возглавлять", gloss: "Additional word from 21 Sep", ex: "Do you mind if I take this chair?", lesson: "21 Sep", url: "https://dictionary.cambridge.org/dictionary/english/chair" },
      { en: "really", pos: "adverb", uk: "/ˈrɪə.li/", us: "/ˈriː.ə.li/", ru: "действительно, на самом деле, уж, в самом деле, впрямь, разве", gloss: "Additional word from 23 Sep", ex: "They really love …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/really" },
      { en: "prefer", pos: "verb", uk: "/prɪˈfɜːr/", us: "/prɪˈfɝː/", ru: "предпочитать, выдвигать, представлять, предпочтительный", gloss: "Additional word from 23 Sep", ex: "They prefer …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/prefer" },
      { en: "stand", pos: "verb", uk: "/stænd/", us: "/stænd/", ru: "стенд, подставка, стойка, киоск, позиция, стоять, постоять, терпеть, устоять", gloss: "Additional word from 23 Sep", ex: "They can’t stand …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/stand" },
      { en: "don't", pos: "", uk: "/dəʊnt/", us: "/doʊnt/", ru: "запрет, не, не надо, перестань, перестаньте, полно", gloss: "Additional word from 23 Sep", ex: "They don’t mind when …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/dont" },
      { en: "keen", pos: "adjective", uk: "/kiːn/", us: "/kiːn/", ru: "острый, сильный, голосить, причитать, плач по покойнику", gloss: "Additional word from 23 Sep", ex: "I’m keen on", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/keen" },
      { en: "interested", pos: "adjective", uk: "/ˈɪn.tres.tɪd/", us: "/ˈɪn.trɪ.stɪd/", ru: "заинтересованный, корыстный, пристрастный, предубежденный", gloss: "Additional word from 23 Sep", ex: "I’m really interested in …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/interested" },
      { en: "into", pos: "preposition", uk: "/ˈɪn.tuː/", us: "/ˈɪn.tuː/", ru: "в, на, к", gloss: "Additional word from 23 Sep", ex: "I’m into …", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/into" },
      { en: "flip", pos: "verb", uk: "/flɪp/", us: "/flɪp/", ru: "флип, сальто, щелчок, щелкать, подбросить, легкомысленный, ветреный", gloss: "Additional word from 23 Sep", ex: "flip flops", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/flip" },
      { en: "street", pos: "noun", uk: "/striːt/", us: "/striːt/", ru: "улица, деловой или финансовый центр, уличный", gloss: "Additional word from 23 Sep", ex: "street food", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/street" },
      { en: "food", pos: "noun", uk: "/fuːd/", us: "/fuːd/", ru: "еда, питание, пища, продовольствие, корм, съестные припасы, провизия", gloss: "Additional word from 23 Sep", ex: "street food", lesson: "23 Sep", url: "https://dictionary.cambridge.org/dictionary/english/food" },
    ];
    const rules = [
      {
        title: { ru: "Как описать погоду", en: "How to describe the weather" },
        body: {
          ru: "It's плюс прилагательное: It's humid, It's chilly. There's плюс существительное: There's drizzle, There's a thunderstorm. It's hot and rainy значит humid.",
          en: "It's plus an adjective: It's humid, It's chilly. There's plus a noun: There's drizzle, There's a thunderstorm. It's hot and rainy means humid."
        },
        links: [["Cambridge · humid", "https://dictionary.cambridge.org/dictionary/english/humid"], ["Wooordhunt · humid", "https://wooordhunt.ru/word/humid"], ["Cambridge · drizzle", "https://dictionary.cambridge.org/dictionary/english/drizzle"], ["Wooordhunt · drizzle", "https://wooordhunt.ru/word/drizzle"]]
      },
      {
        title: { ru: "Present continuous: погода идет сейчас", en: "Present continuous: weather happening now" },
        body: {
          ru: "am / is / are плюс глагол с -ing. На занятии: We are having a thunderstorm. We are having a few showers. Так говорят о погоде в момент речи.",
          en: "am / is / are plus the -ing form. From the lesson: We are having a thunderstorm. We are having a few showers. This is weather at the moment of speaking."
        },
        links: [["Cambridge Grammar · Present continuous", "https://dictionary.cambridge.org/grammar/british-grammar/present-continuous-i-am-working"]]
      },
      {
        title: { ru: "Present perfect: How long have you…?", en: "Present perfect: How long have you…?" },
        body: {
          ru: "Фраза со слайда: How long have you worked here? have/has плюс третья форма. Период начался в прошлом и длится до сейчас.",
          en: "Line from the slides: How long have you worked here? have/has plus the past participle. The period started in the past and continues until now."
        },
        links: [["Cambridge Grammar · Present perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-perfect-simple-i-have-worked"]]
      },
      {
        title: { ru: "Likes and dislikes", en: "Likes and dislikes" },
        body: {
          ru: "I'm keen on / I'm into / I'm interested in плюс существительное или -ing. I prefer dancing to doing sport. I don't mind и I can't stand плюс -ing. Для he/she: is keen on, doesn't mind, can't stand. После keen on нельзя инфинитив без -ing.",
          en: "I'm keen on / I'm into / I'm interested in plus a noun or -ing. I prefer dancing to doing sport. I don't mind and I can't stand plus -ing. For he/she: is keen on, doesn't mind, can't stand. After keen on, do not use a bare infinitive."
        },
        links: [["Cambridge Grammar · like, love, prefer", "https://dictionary.cambridge.org/grammar/british-grammar/hate-like-love-and-prefer"], ["Cambridge · keen", "https://dictionary.cambridge.org/dictionary/english/keen"], ["Wooordhunt · keen", "https://wooordhunt.ru/word/keen"]]
      }
    ];
    const lessonRules = {
      "lesson-21": rules,
      "lesson-07": [
        {
          title: { ru: "Начать вопрос и вернуть его", en: "Start a question and hand it back" },
          body: {
            ru: "So, tell me about … начинает вопрос о другом человеке. Потом он отвечает и спрашивает вас: What about you? And you?",
            en: "So, tell me about … opens a question about the other person. They answer, then ask you back: What about you? And you?"
          },
          links: [["Cambridge · tell", "https://dictionary.cambridge.org/dictionary/english/tell"]]
        },
        {
          title: { ru: "Present Simple и be going to", en: "Present Simple and be going to" },
          body: {
            ru: "Привычки: Do you…? / What do you…? План после занятия: I'm going to…",
            en: "Habits: Do you…? / What do you…? A plan after the lesson: I'm going to…"
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"], ["Cambridge Grammar · be going to", "https://dictionary.cambridge.org/grammar/british-grammar/be-going-to"]]
        }
      ],
      "lesson-09": [
        {
          title: { ru: "Present Simple с be", en: "Present Simple with be" },
          body: {
            ru: "I am. We / you / they are. He / she / it is. Отрицание: am not / aren't / isn't. Вопросы: Am / Are / Is.",
            en: "I am. We / you / they are. He / she / it is. Negative: am not / aren't / isn't. Questions: Am / Are / Is."
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"]]
        },
        {
          title: { ru: "Present Simple с другими глаголами", en: "Present Simple with other verbs" },
          body: {
            ru: "I / we / you / they + глагол. He / she / it + глагол с -s. Отрицание: don't / doesn't + глагол. Вопросы: Do / Does + глагол. После does глагол без -s.",
            en: "I / we / you / they + verb. He / she / it + verb-s. Negative: don't / doesn't + verb. Questions: Do / Does + verb. After does the verb has no -s."
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"]]
        }
      ],
      "lesson-14": [
        {
          title: { ru: "How often и Present Simple", en: "How often and the Present Simple" },
          body: {
            ru: "How often спрашивает о привычке. Действие: How often do you…? Состояние с be: How often are you…?",
            en: "How often asks about a habit. An action: How often do you…? A state with be: How often are you…?"
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"]]
        },
        {
          title: { ru: "Наречия и сколько раз", en: "Adverbs and how many times" },
          body: {
            ru: "always, usually, often, occasionally, rarely, hardly ever, never говорят, насколько привычка регулярна. once a week, twice a week, 3 times a week называют число раз. На слайде написано once in while. На карточке полная форма once in a while.",
            en: "always, usually, often, occasionally, rarely, hardly ever, never say how regular a habit feels. once a week, twice a week, 3 times a week say a number of times. The slide writes once in while. The card uses once in a while."
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"]]
        }
      ],
      "lesson-16": [
        {
          title: { ru: "Do you mind if I…?", en: "Do you mind if I…?" },
          body: {
            ru: "Do you mind if I + глагол. Вы не против, если я…? No, not at all и Go ahead значат, что можно. Yes здесь может звучать как «да, я против».",
            en: "Do you mind if I + verb. No, not at all and Go ahead mean yes, you may. Yes here can sound like a refusal."
          },
          links: [["Cambridge · mind", "https://dictionary.cambridge.org/dictionary/english/mind"]]
        },
        {
          title: { ru: "How long have you…?", en: "How long have you…?" },
          body: {
            ru: "How long + have/has + подлежащее + причастие. How long have you worked here? Период начался в прошлом и длится до сейчас.",
            en: "How long + have/has + subject + past participle. How long have you worked here? The period started in the past and continues until now."
          },
          links: [["Cambridge Grammar · Present perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-perfect-simple-i-have-worked"]]
        },
        {
          title: { ru: "How often do you / are you", en: "How often do you / are you" },
          body: {
            ru: "Действие берет do: How often do you sit on benches? Состояние с be берет are: How often are you tired of walking?",
            en: "An action takes do: How often do you sit on benches? A state with be takes are: How often are you tired of walking?"
          },
          links: [["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"]]
        }
      ],
      "lesson-23": [
        {
          title: { ru: "Нравится и не нравится", en: "Likes and dislikes" },
          body: {
            ru: "После keen on, into, enjoy, mind и can't stand стоит существительное или -ing. I'm keen on cycle неверно, верно I'm keen on cycling. I prefer tennis to volleyball.",
            en: "After keen on, into, enjoy, mind and can't stand, use a noun or -ing. I'm keen on cycle is wrong. I'm keen on cycling is the lesson form. I prefer tennis to volleyball."
          },
          links: [["Cambridge Grammar · like, love, prefer", "https://dictionary.cambridge.org/grammar/british-grammar/hate-like-love-and-prefer"]]
        },
        {
          title: { ru: "Past Simple и was / were", en: "Past Simple and was / were" },
          body: {
            ru: "Утверждение: V2 или глагол с -ed. Отрицание и вопрос: didn't / Did + начальная форма. I / he / she / it was. You / we / they were. На слайде: last week, yesterday, in 1991, 3 months ago.",
            en: "Affirmative: V2 or verb-ed. Negative and question: didn't / Did + base form. I / he / she / it was. You / we / they were. Markers on the slide: last week, yesterday, in 1991, 3 months ago."
          },
          links: [["Cambridge Grammar · Past simple", "https://dictionary.cambridge.org/grammar/british-grammar/past-simple-i-worked"]]
        },
        {
          title: { ru: "What would you do if…?", en: "What would you do if…?" },
          body: {
            ru: "What would you do if you couldn’t find your phone? Это вопрос второго условного: would и прошедшая форма в if.",
            en: "What would you do if you couldn’t find your phone? A second-conditional question: would, and a past form in the if-clause."
          },
          links: [["Cambridge Grammar · Conditionals", "https://dictionary.cambridge.org/grammar/british-grammar/conditionals-if"]]
        }
      ]
    };
    const phrasalWords = [
      { en: "look up", pos: "phrasal verb", uk: "/lʊk ˈʌp/", us: "/lʊk ˈʌp/", ru: "искать в словаре", gloss: "to try to find a piece of information", ex: "Look up the word.", deck: "phrasal", url: "https://dictionary.cambridge.org/dictionary/english/look-up" },
      { en: "look after", pos: "phrasal verb", uk: "/lʊk ˈɑːftə/", us: "/lʊk ˈæftɚ/", ru: "присматривать", gloss: "to take care of someone or something", ex: "Look after the cat.", deck: "phrasal", url: "https://dictionary.cambridge.org/dictionary/english/look-after" },
      { en: "give up", pos: "phrasal verb", uk: "/ɡɪv ˈʌp/", us: "/ɡɪv ˈʌp/", ru: "сдаваться, бросать", gloss: "to stop doing or having something", ex: "I won't give up.", deck: "phrasal", url: "https://dictionary.cambridge.org/dictionary/english/give-up" }
    ];
    const idiomWords = [
      { en: "break the ice", pos: "idiom", ru: "начать разговор", gloss: "to make people feel more comfortable", ex: "Break the ice with a question.", deck: "idioms", url: "https://dictionary.cambridge.org/dictionary/english/break-the-ice" },
      { en: "once in a blue moon", pos: "idiom", ru: "крайне редко", gloss: "almost never", ex: "I see them once in a blue moon.", deck: "idioms", url: "https://dictionary.cambridge.org/dictionary/english/once-in-a-blue-moon" },
      { en: "a piece of cake", pos: "idiom", ru: "проще простого", gloss: "very easy", ex: "The test was a piece of cake.", deck: "idioms", url: "https://dictionary.cambridge.org/dictionary/english/a-piece-of-cake" }
    ];
    const songCards = {
      moonlight: {
        en: "moonlight", pos: "noun", uk: "/ˈmuːn.laɪt/", us: "/ˈmuːn.laɪt/", level: "B2",
        ru: "лунный свет", ex: "in the moonlight",
        url: "https://dictionary.cambridge.org/dictionary/english/moonlight",
        hunt: "https://wooordhunt.ru/word/moonlight"
      },
      wont: {
        en: "won't", pos: "contraction", uk: "/wəʊnt/", us: "/woʊnt/", level: "",
        ru: "не будет, сокращение will not", ex: "I won't give up",
        url: "https://dictionary.cambridge.org/dictionary/english/won-t",
        hunt: "https://wooordhunt.ru/word/will"
      }
    };

window.LESSON_DATA = {
  words: words,
  lines21: lines21,
  ask07: ask07,
  phrases09: phrases09,
  adverbs14: adverbs14,
  talk16: talk16,
  likes23: likes23,
  extraWords: extraWords,
  rules: rules,
  lessonRules: lessonRules,
  phrasalWords: phrasalWords,
  idiomWords: idiomWords,
  songCards: songCards
};
})();
