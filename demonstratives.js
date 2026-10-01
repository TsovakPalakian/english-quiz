(function (root) {
  var KEY = "enquiz-demonstratives";
  var WORDS = ["this", "that", "these", "those"];
  var LINKS = [
    { name: "British Council", url: "https://learnenglish.britishcouncil.org/free-resources/grammar/english-grammar-reference/demonstratives" },
    { name: "Cambridge Dictionary", url: "https://dictionary.cambridge.org/grammar/british-grammar/this-that-these-those" },
    { name: "Oxford Learner's Dictionaries", url: "https://www.oxfordlearnersdictionaries.com/grammar/online-grammar/demonstrative-pronouns-this-that-these-those" }
  ];
  var SG = [
    { en: "phone", ru: "телефон", thisRu: "этот телефон", thatRu: "тот телефон" },
    { en: "book", ru: "книга", thisRu: "эта книга", thatRu: "та книга" },
    { en: "song", ru: "песня", thisRu: "эта песня", thatRu: "та песня" },
    { en: "cup", ru: "чашка", thisRu: "эта чашка", thatRu: "та чашка" },
    { en: "bag", ru: "сумка", thisRu: "эта сумка", thatRu: "та сумка" },
    { en: "key", ru: "ключ", thisRu: "этот ключ", thatRu: "тот ключ" },
    { en: "ticket", ru: "билет", thisRu: "этот билет", thatRu: "тот билет" },
    { en: "car", ru: "машина", thisRu: "эта машина", thatRu: "та машина" },
    { en: "dog", ru: "собака", thisRu: "эта собака", thatRu: "та собака" },
    { en: "house", ru: "дом", thisRu: "этот дом", thatRu: "тот дом" }
  ];
  var PL = [
    { en: "keys", ru: "ключи", theseRu: "эти ключи", thoseRu: "те ключи" },
    { en: "books", ru: "книги", theseRu: "эти книги", thoseRu: "те книги" },
    { en: "shoes", ru: "туфли", theseRu: "эти туфли", thoseRu: "те туфли" },
    { en: "cars", ru: "машины", theseRu: "эти машины", thoseRu: "те машины" },
    { en: "friends", ru: "друзья", theseRu: "эти друзья", thoseRu: "те друзья" },
    { en: "mountains", ru: "горы", theseRu: "эти горы", thoseRu: "те горы" },
    { en: "cups", ru: "чашки", theseRu: "эти чашки", thoseRu: "те чашки" },
    { en: "bags", ru: "сумки", theseRu: "эти сумки", thoseRu: "те сумки" },
    { en: "tickets", ru: "билеты", theseRu: "эти билеты", thoseRu: "те билеты" },
    { en: "photos", ru: "фотографии", theseRu: "эти фотографии", thoseRu: "те фотографии" }
  ];
  var FOUR = ["This", "That", "These", "Those"];
  var bank = [];

  function cap(word) { return word.charAt(0).toUpperCase() + word.slice(1); }
  function add(item) {
    item.id = "demo-" + (bank.length + 1);
    bank.push(item);
  }
  function rule(word) {
    if (word === "this") return "This = one thing near you.";
    if (word === "that") return "That = one thing far from you.";
    if (word === "these") return "These = more than one thing near you.";
    return "Those = more than one thing far from you.";
  }
  function sceneSvg(mode) {
    var far = mode.indexOf("far") === 0;
    var many = mode.slice(-1) === "N";
    var size = far ? 16 : 32;
    var x0 = far ? 148 : 36;
    var n = many ? 3 : 1;
    var fill = far ? "#9bb8d3" : "#0b5cab";
    var rects = "";
    for (var i = 0; i < n; i++) {
      var x = x0 + i * (size + 6);
      rects += '<rect x="' + x + '" y="' + (78 - size) + '" width="' + size + '" height="' + (size + 6) + '" rx="3" fill="' + fill + '"/>';
    }
    return '<svg class="demo-scene" viewBox="0 0 220 96" aria-hidden="true"><circle cx="18" cy="78" r="10" fill="#5c6b7a"/>' + rects + "</svg>";
  }

  SG.forEach(function (noun) {
    add({ word: "this", topic: "near", level: 1, type: "choice", prompt: "The " + noun.en + " is in your hand. ___ is my " + noun.en + ".", options: ["This", "That"], answer: "This", explain: rule("this") + " It is one " + noun.en + ", and it is in your hand." });
    add({ word: "that", topic: "far", level: 1, type: "choice", prompt: "The " + noun.en + " is across the street. ___ is my " + noun.en + ".", options: ["This", "That"], answer: "That", explain: rule("that") + " It is one " + noun.en + ", and it is far from you." });
  });
  PL.forEach(function (noun) {
    add({ word: "these", topic: "near", level: 1, type: "choice", prompt: "The " + noun.en + " are in your hands. ___ are my " + noun.en + ".", options: ["These", "Those"], answer: "These", explain: rule("these") + " There are several " + noun.en + ", and they are with you." });
    add({ word: "those", topic: "far", level: 1, type: "choice", prompt: "The " + noun.en + " are far away. ___ are my " + noun.en + ".", options: ["These", "Those"], answer: "Those", explain: rule("those") + " There are several " + noun.en + ", and they are far away." });
  });
  SG.slice(0, 6).forEach(function (noun) {
    add({ word: "this", topic: "noun", level: 2, type: "choice", prompt: "One " + noun.en + " is next to you. ___ " + noun.en + " is mine.", options: FOUR.slice(), answer: "This", explain: rule("this") + " The word sits in front of the noun: this " + noun.en + "." });
    add({ word: "that", topic: "noun", level: 2, type: "choice", prompt: "One " + noun.en + " is on the other side of the room. ___ " + noun.en + " is not mine.", options: FOUR.slice(), answer: "That", explain: rule("that") + " The word sits in front of the noun: that " + noun.en + "." });
  });
  PL.slice(0, 6).forEach(function (noun) {
    add({ word: "these", topic: "noun", level: 2, type: "choice", prompt: "Several " + noun.en + " are next to you. ___ " + noun.en + " are mine.", options: FOUR.slice(), answer: "These", explain: rule("these") + " The word sits in front of the noun: these " + noun.en + "." });
    add({ word: "those", topic: "noun", level: 2, type: "choice", prompt: "Several " + noun.en + " are far from you. ___ " + noun.en + " are not mine.", options: FOUR.slice(), answer: "Those", explain: rule("those") + " The word sits in front of the noun: those " + noun.en + "." });
  });
  add({ word: "this", topic: "near", level: 2, type: "picture", svg: sceneSvg("near1"), prompt: "___ is a book.", options: FOUR.slice(), answer: "This", explain: rule("this") + " The picture shows one thing next to the person." });
  add({ word: "this", topic: "noun", level: 2, type: "picture", svg: sceneSvg("near1"), prompt: "___ book is mine.", options: FOUR.slice(), answer: "This", explain: rule("this") + " One book, close to you, and the noun follows the word." });
  add({ word: "that", topic: "far", level: 2, type: "picture", svg: sceneSvg("far1"), prompt: "___ is a book.", options: FOUR.slice(), answer: "That", explain: rule("that") + " The picture shows one small thing far from the person." });
  add({ word: "that", topic: "noun", level: 2, type: "picture", svg: sceneSvg("far1"), prompt: "___ book is over there.", options: FOUR.slice(), answer: "That", explain: rule("that") + " One book, far away." });
  add({ word: "these", topic: "near", level: 2, type: "picture", svg: sceneSvg("nearN"), prompt: "___ are books.", options: FOUR.slice(), answer: "These", explain: rule("these") + " The picture shows several things next to the person." });
  add({ word: "these", topic: "noun", level: 2, type: "picture", svg: sceneSvg("nearN"), prompt: "___ books are mine.", options: FOUR.slice(), answer: "These", explain: rule("these") + " Several books, close to you." });
  add({ word: "those", topic: "far", level: 2, type: "picture", svg: sceneSvg("farN"), prompt: "___ are books.", options: FOUR.slice(), answer: "Those", explain: rule("those") + " The picture shows several small things far from the person." });
  add({ word: "those", topic: "noun", level: 2, type: "picture", svg: sceneSvg("farN"), prompt: "___ books are over there.", options: FOUR.slice(), answer: "Those", explain: rule("those") + " Several books, far away." });

  [
    { word: "this", topic: "pronoun", prompt: "The phone is in your hand. You do not put a noun after the word. Which sentence fits?", options: ["This is my phone.", "These is my phone.", "Those is my phone.", "That are my phone."], answer: "This is my phone.", explain: "This can stand alone: This is my phone. These and those are for more than one." },
    { word: "this", topic: "noun", prompt: "You name the phone in your hand. Which sentence is correct?", options: ["This phone is mine.", "These phone is mine.", "Those phone is mine.", "That phones are mine."], answer: "This phone is mine.", explain: "This comes before one noun: this phone. These phone is wrong because these is plural." },
    { word: "this", topic: "pronoun", prompt: "Which sentence is correct?", options: ["This is my book.", "These is my book.", "This are my book.", "Those is my book."], answer: "This is my book.", explain: "One book near you. This takes is, not are." },
    { word: "this", topic: "near", prompt: "You are standing next to one friend. ___ is my friend.", options: FOUR.slice(), answer: "This", explain: rule("this") + " One friend, next to you." },
    { word: "this", topic: "near", prompt: "A song is playing on the phone in your hand. I like ___ song.", options: FOUR.slice(), answer: "This", explain: rule("this") },
    { word: "this", topic: "near", prompt: "You point at one thing in your hand. What is ___?", options: FOUR.slice(), answer: "This", explain: "What is this? — one thing near you. What are these? is for more than one." },
    { word: "this", topic: "noun", prompt: "A book is open in front of you. ___ book is interesting.", options: FOUR.slice(), answer: "This", explain: rule("this") },
    { word: "this", topic: "pronoun", prompt: "Which pair is correct?", options: ["This is my book. / This book is mine.", "This are my book. / These book is mine.", "Those is my book. / That books is mine.", "These is my book. / This books are mine."], answer: "This is my book. / This book is mine.", explain: "Same meaning. This is my book uses this alone. This book is mine puts this before the noun." },
    { word: "that", topic: "pronoun", prompt: "One car is far down the street. You do not put a noun after the word. Which sentence fits?", options: ["That is my car.", "Those is my car.", "These is my car.", "This are my car."], answer: "That is my car.", explain: "That can stand alone: That is my car." },
    { word: "that", topic: "noun", prompt: "You name the tall building you can see far away. Which sentence is correct?", options: ["That building is very tall.", "Those building is very tall.", "These building is very tall.", "This buildings are very tall."], answer: "That building is very tall.", explain: "That comes before one noun that is far: that building." },
    { word: "that", topic: "far", prompt: "You see one dog across the park. Look at ___ dog!", options: FOUR.slice(), answer: "That", explain: rule("that") },
    { word: "that", topic: "far", prompt: "A song is playing in another room. I don't like ___ song.", options: FOUR.slice(), answer: "That", explain: rule("that") },
    { word: "that", topic: "far", prompt: "You point at one thing far away. What is ___?", options: FOUR.slice(), answer: "That", explain: "What is that? — one thing far from you." },
    { word: "that", topic: "pronoun", prompt: "Which sentence is correct?", options: ["That is my car.", "Those is my car.", "That are my car.", "These is my car."], answer: "That is my car.", explain: "One car, far away. That takes is." },
    { word: "that", topic: "noun", prompt: "Which pair is correct?", options: ["That is my car. / That car is fast.", "That are my car. / Those car is fast.", "These is my car. / This cars is fast.", "Those is my car. / That cars are fast."], answer: "That is my car. / That car is fast.", explain: "That is my car uses that alone. That car is fast puts that before the noun." },
    { word: "that", topic: "far", prompt: "One house is on the far hill. ___ house is old.", options: FOUR.slice(), answer: "That", explain: rule("that") },
    { word: "these", topic: "pronoun", prompt: "Your keys are in your hand. You do not put a noun after the word. Which sentence fits?", options: ["These are my keys.", "This are my keys.", "Those is my keys.", "That are my keys."], answer: "These are my keys.", explain: "These can stand alone: These are my keys. These takes are." },
    { word: "these", topic: "noun", prompt: "You name the shoes you are wearing. Which sentence is correct?", options: ["These shoes are mine.", "This shoes are mine.", "Those shoe is mine.", "That shoes are mine."], answer: "These shoes are mine.", explain: "These comes before a plural noun near you: these shoes." },
    { word: "these", topic: "near", prompt: "Several books are on the desk in front of you. ___ books are mine.", options: FOUR.slice(), answer: "These", explain: rule("these") },
    { word: "these", topic: "near", prompt: "You are holding several small objects. What are ___?", options: FOUR.slice(), answer: "These", explain: "What are these? — more than one thing near you." },
    { word: "these", topic: "pronoun", prompt: "Which sentence is correct?", options: ["These are my keys.", "This are my keys.", "These is my keys.", "That are my keys."], answer: "These are my keys.", explain: "More than one, near you. These takes are, not is." },
    { word: "these", topic: "noun", prompt: "I like ___ shoes. You are wearing them now.", options: FOUR.slice(), answer: "These", explain: rule("these") },
    { word: "these", topic: "pronoun", prompt: "Which pair is correct?", options: ["These are my keys. / These keys are mine.", "This are my keys. / These key is mine.", "Those is my keys. / That keys are mine.", "These is my keys. / This keys are mine."], answer: "These are my keys. / These keys are mine.", explain: "These are my keys uses these alone. These keys are mine puts these before the noun." },
    { word: "these", topic: "near", prompt: "Several cups are on your table. ___ cups are full.", options: FOUR.slice(), answer: "These", explain: rule("these") },
    { word: "those", topic: "pronoun", prompt: "You see a group of friends far away. You do not put a noun after the word. Which sentence fits?", options: ["Those are my friends.", "That are my friends.", "This are my friends.", "These is my friends."], answer: "Those are my friends.", explain: "Those can stand alone: Those are my friends. Those takes are." },
    { word: "those", topic: "noun", prompt: "You name the cars in the far car park. Which sentence is correct?", options: ["Those cars are expensive.", "That cars are expensive.", "This cars are expensive.", "Those car is expensive."], answer: "Those cars are expensive.", explain: "Those comes before a plural noun far away: those cars." },
    { word: "those", topic: "far", prompt: "You can see mountains on the horizon. Look at ___ mountains.", options: FOUR.slice(), answer: "Those", explain: rule("those") },
    { word: "those", topic: "far", prompt: "Several lights are far away. What are ___?", options: FOUR.slice(), answer: "Those", explain: "What are those? — more than one thing far from you." },
    { word: "those", topic: "pronoun", prompt: "Which sentence is correct?", options: ["Those are my friends.", "That are my friends.", "Those is my friends.", "This are my friends."], answer: "Those are my friends.", explain: "More than one, far away. Those takes are, not is." },
    { word: "those", topic: "noun", prompt: "___ shoes are expensive. You saw them in a shop window across the street.", options: FOUR.slice(), answer: "Those", explain: rule("those") },
    { word: "those", topic: "pronoun", prompt: "Which pair is correct?", options: ["Those are my shoes. / Those shoes are expensive.", "That are my shoes. / Those shoe is expensive.", "These is my shoes. / This shoes are expensive.", "Those is my shoes. / That shoes are expensive."], answer: "Those are my shoes. / Those shoes are expensive.", explain: "Those are my shoes uses those alone. Those shoes are expensive puts those before the noun." },
    { word: "those", topic: "far", prompt: "Several photos are on the far wall. ___ photos are old.", options: FOUR.slice(), answer: "Those", explain: rule("those") }
  ].forEach(function (item) { item.level = 3; item.type = "situation"; add(item); });

  [
    { word: "this", topic: "time", prompt: "We are in this week, not a past one. ___ week is very busy.", options: ["This", "That", "These", "Those"], answer: "This", explain: "This week means the week happening now. That week would be a different week, already mentioned or gone." },
    { word: "this", topic: "time", prompt: "Earlier today, not on another day. ___ morning I had coffee.", options: ["This", "That", "These", "Those"], answer: "This", explain: "This morning means today. That morning means a morning already in the past." },
    { word: "this", topic: "time", prompt: "The year we are in now. ___ year I am studying English.", options: ["This", "That"], answer: "This", explain: "This year means the current year." },
    { word: "this", topic: "near", prompt: "The work is the thing in front of you now. We can finish ___ today.", options: ["This", "That", "These", "Those"], answer: "This", explain: "This points to the work you are doing now. We can finish this today." },
    { word: "that", topic: "time", prompt: "I don't remember ___ day when we first met.", options: ["This", "That", "These", "Those"], answer: "That", explain: "That day means a day in the past, not the day we are in now." },
    { word: "that", topic: "time", prompt: "A year that is already over. ___ year was the hardest of my life.", options: ["This", "That"], answer: "That", explain: "That year points back to a past year. This year would mean the year happening now." },
    { word: "that", topic: "time", prompt: "A moment that is already over. I was scared at ___ time.", options: ["This", "That", "These", "Those"], answer: "That", explain: "That time means a time already gone." },
    { word: "that", topic: "far", prompt: "You hear a voice in another room. Who's ___?", options: ["This", "That", "These", "Those"], answer: "That", explain: "Who's that? — one person who is not next to you." },
    { word: "these", topic: "time", prompt: "The shoes you have on now. ___ shoes I'm wearing are comfortable.", options: FOUR.slice(), answer: "These", explain: rule("these") + " They are on you now, so they are near." },
    { word: "these", topic: "near", prompt: "You bought several books today and they are in your bag. I bought ___ books today.", options: FOUR.slice(), answer: "These", explain: rule("these") },
    { word: "these", topic: "near", prompt: "You are holding several small objects. What are ___?", options: ["This", "That", "These", "Those"], answer: "These", explain: "What are these? Several things in your hands." },
    { word: "these", topic: "time", prompt: "The days we are living through now. ___ days are colder than last week.", options: ["This", "That", "These", "Those"], answer: "These", explain: "These days means now. Those days means a time already gone. Days is plural, so not this." },
    { word: "those", topic: "time", prompt: "Shoes someone wore last year, not the ones on now. I don't like ___ shoes you wore last year.", options: FOUR.slice(), answer: "Those", explain: "Those points to things away from now. Shoes is plural, so not that." },
    { word: "those", topic: "time", prompt: "A happier time in the past. ___ days were happier.", options: ["This", "That", "These", "Those"], answer: "Those", explain: "Those days means a past time. Days is plural, so those, not that." },
    { word: "those", topic: "far", prompt: "Mountains on the horizon, not next to you. Look at ___ mountains.", options: FOUR.slice(), answer: "Those", explain: rule("those") },
    { word: "those", topic: "far", prompt: "Several lights far down the road. What are ___?", options: ["This", "That", "These", "Those"], answer: "Those", explain: "What are those? Several things far away." }
  ].forEach(function (item) { item.level = 4; item.type = "gap"; add(item); });

  var MISTAKES = [
    ["This books are new.", "These books are new.", "these", "This is for one thing. Books is more than one, so use these."],
    ["These book is new.", "This book is new.", "this", "These is for more than one. Book is one thing, so use this."],
    ["That are my friends.", "Those are my friends.", "those", "That is for one person or thing and takes is. Friends is more than one, so use those are."],
    ["Those is my car.", "That is my car.", "that", "Those is for more than one and takes are. A car is one, so use that is."],
    ["This dogs are loud.", "These dogs are loud.", "these", "This cannot come before a plural noun. Dogs needs these."],
    ["These phone is mine.", "This phone is mine.", "this", "These needs a plural noun. Phone is one, so use this."],
    ["That cars are fast.", "Those cars are fast.", "those", "That is singular. Cars is plural, so use those."],
    ["Those book is old.", "That book is old.", "that", "Those needs a plural noun and the verb are. One book uses that."],
    ["This shoes are dirty.", "These shoes are dirty.", "these", "Shoes is plural. This shoes is wrong. Say these shoes."],
    ["These key is mine.", "This key is mine.", "this", "Key is one thing. These key is wrong. Say this key."],
    ["That mountains are high.", "Those mountains are high.", "those", "Mountains is plural and they are far in the sentence. Use those, not that."],
    ["Those cup is hot.", "That cup is hot.", "that", "Cup is one thing. Those cup is wrong. Say that cup."],
    ["This bags are heavy.", "These bags are heavy.", "these", "Bags is plural. This bags is wrong. Say these bags."],
    ["These ticket is mine.", "This ticket is mine.", "this", "Ticket is one thing. These ticket is wrong. Say this ticket."],
    ["That photos are old.", "Those photos are old.", "those", "Photos is plural. That photos is wrong. Say those photos."],
    ["Those house is big.", "That house is big.", "that", "House is one thing. Those house is wrong. Say that house."],
    ["This friends are here.", "These friends are here.", "these", "Friends is plural. This friends is wrong. Say these friends."],
    ["These song is good.", "This song is good.", "this", "Song is one thing. These song is wrong. Say this song."],
    ["That keys are yours.", "Those keys are yours.", "those", "Keys is plural. That keys is wrong. Say those keys."],
    ["Those dog is big.", "That dog is big.", "that", "Dog is one animal. Those dog is wrong. Say that dog."],
    ["This cups are full.", "These cups are full.", "these", "Cups is plural. This cups is wrong. Say these cups."],
    ["These car is red.", "This car is red.", "this", "Car is one thing. These car is wrong. Say this car."],
    ["That shoes are expensive.", "Those shoes are expensive.", "those", "Shoes is plural. That shoes is wrong. Say those shoes."],
    ["Those phone is new.", "That phone is new.", "that", "Phone is one thing. Those phone is wrong. Say that phone."],
    ["This tickets are here.", "These tickets are here.", "these", "Tickets is plural. This tickets is wrong. Say these tickets."],
    ["These bag is heavy.", "This bag is heavy.", "this", "Bag is one thing. These bag is wrong. Say this bag."],
    ["That books are mine.", "Those books are mine.", "those", "Books is plural. That books is wrong. Say those books."],
    ["Those key is lost.", "That key is lost.", "that", "Key is one thing. Those key is wrong. Say that key."],
    ["This photos are new.", "These photos are new.", "these", "Photos is plural. This photos is wrong. Say these photos."],
    ["These house is old.", "This house is old.", "this", "House is one thing. These house is wrong. Say this house."]
  ];
  MISTAKES.forEach(function (row) {
    var correct = row[1];
    var options = [correct, row[0], correct.replace(/These/g, "Those").replace(/This/g, "That").replace(/Those/g, "These").replace(/That/g, "This")];
    if (options[2] === correct || options[2] === row[0]) options[2] = "They are here.";
    var third = options[2];
    var fourth = "It is here.";
    var unique = [];
    [correct, row[0], third, fourth].forEach(function (line) { if (unique.indexOf(line) < 0) unique.push(line); });
    while (unique.length < 3) unique.push("It is here now.");
    add({ word: row[2], topic: "mistake", level: 2, type: "fix", prompt: "Which sentence is correct?\n" + row[0], options: unique.slice(0, 4), answer: correct, explain: row[3] });
  });

  var RU = [
    ["Эта книга интересная.", "This book is interesting.", "This books is interesting.", "That books are interesting.", "Those book is interesting.", "this", "This book: one book near you. Эта книга = this book."],
    ["Этот телефон мой.", "This phone is mine.", "These phone is mine.", "Those phone is mine.", "That phones are mine.", "this", "Этот телефон = this phone. One thing near you."],
    ["Та машина моя.", "That car is mine.", "This cars is mine.", "Those car is mine.", "These car are mine.", "that", "Та машина = that car. One car, not the one in your hand."],
    ["Тот дом старый.", "That house is old.", "Those house is old.", "These house are old.", "This houses is old.", "that", "Тот дом = that house."],
    ["Эта песня мне нравится.", "I like this song.", "I like these song.", "I like those song.", "I like that songs.", "this", "Эта песня = this song."],
    ["Тот билет мой.", "That ticket is mine.", "Those ticket is mine.", "These ticket are mine.", "This tickets is mine.", "that", "Тот билет = that ticket."],
    ["Эта собака большая.", "This dog is big.", "Those dog is big.", "These dog are big.", "That dogs is big.", "this", "Эта собака = this dog. One dog near you."],
    ["Этот ключ мой.", "This key is mine.", "These key is mine.", "Those key is mine.", "That keys is mine.", "this", "Этот ключ = this key."],
    ["Та чашка горячая.", "That cup is hot.", "Those cup is hot.", "These cup are hot.", "This cups is hot.", "that", "Та чашка = that cup."],
    ["Эта сумка тяжелая.", "This bag is heavy.", "These bag is heavy.", "Those bag is heavy.", "That bags is heavy.", "this", "Эта сумка = this bag."],
    ["Эти ключи мои.", "These keys are mine.", "This keys are mine.", "Those key is mine.", "That keys is mine.", "these", "Эти ключи = these keys. More than one, near you."],
    ["Эти книги мои.", "These books are mine.", "This books are mine.", "That book are mine.", "Those book is mine.", "these", "Эти книги = these books."],
    ["Те машины дорогие.", "Those cars are expensive.", "That cars are expensive.", "This cars are expensive.", "Those car is expensive.", "those", "Те машины = those cars. More than one, farther away."],
    ["Те горы высокие.", "Those mountains are high.", "That mountains are high.", "These mountain is high.", "This mountains are high.", "those", "Те горы = those mountains."],
    ["Эти туфли мои.", "These shoes are mine.", "This shoes are mine.", "Those shoe is mine.", "That shoes is mine.", "these", "Эти туфли = these shoes."],
    ["This is my phone.", "Это мой телефон.", "Эти мой телефон.", "Те мои телефоны.", "Та мои телефон.", "this", "This is my phone = Это мой телефон. This stands alone."],
    ["That is my car.", "Это та машина. / Вон та машина моя.", "Эти моя машина.", "Те мои машина.", "Этот мои машина.", "that", "That is my car points to one car farther away."],
    ["These are my keys.", "Это мои ключи. Они здесь.", "Этот мой ключ.", "Те моя ключи.", "Та мои ключи далеко.", "these", "These are my keys = several keys near you."],
    ["Those are my friends.", "Вон те — мои друзья.", "Этот мой друг.", "Эта моя друзья.", "Эти мой друг.", "those", "Those are my friends = several people farther away."],
    ["This book is mine.", "Эта книга моя.", "Эти книга моя.", "Те книги моя.", "Тот книга моя.", "this", "This book puts this before the noun."],
    ["That car is fast.", "Та машина быстрая.", "Те машина быстрая.", "Эти машина быстрая.", "Этот машины быстрая.", "that", "That car = one far car."],
    ["These shoes are comfortable.", "Эти туфли удобные.", "Этот туфли удобные.", "Та туфля удобные.", "Те туфля удобная.", "these", "These shoes = the ones near you, more than one."],
    ["Those mountains are high.", "Те горы высокие.", "Эта горы высокие.", "Этот гора высокие.", "Эти гора высокая.", "those", "Those mountains = several, far away."],
    ["What is this?", "Что это? (оно рядом)", "Что это там далеко?", "Какие это?", "Кто эти?", "this", "What is this? asks about one thing near you."],
    ["What is that?", "Что это там?", "Что это у меня в руке?", "Какие те?", "Кто этот рядом?", "that", "What is that? asks about one thing farther away."],
    ["What are these?", "Что это? (их несколько, они рядом)", "Что это? (один предмет)", "Кто тот?", "Что то одно?", "these", "What are these? asks about several things near you."],
    ["What are those?", "Что это там? (их несколько)", "Что это у меня в руке, одно?", "Кто этот?", "Какая эта?", "those", "What are those? asks about several things far away."],
    ["This week is busy.", "На этой неделе много дел.", "На той неделе много дел.", "Эти недели заняты.", "Те неделя занята.", "this", "This week means the week happening now."],
    ["That day was special.", "Тот день был особенным.", "Этот день сейчас особенный.", "Эти день был особенным.", "Те дни был особенным.", "that", "That day means a day already in the past."],
    ["Those days were happier.", "Те дни были счастливее.", "Этот дни были счастливее.", "Эта день была счастливее.", "Эти день были счастливее.", "those", "Those days means a past time. Days is plural."]
  ];
  RU.forEach(function (row, index) {
    add({
      word: row[5],
      topic: "translation",
      level: index < 15 ? 3 : 4,
      type: index < 15 ? "ru-en" : "en-ru",
      prompt: index < 15 ? row[0] : row[0],
      options: [row[1], row[2], row[3], row[4]],
      answer: row[1],
      explain: row[6]
    });
  });
  // The first 15 RU rows are Russian prompts with an English answer.
  // Rows 15+ are English prompts with a Russian answer. The loop above used row[0] as the prompt for all.
  // Fix prompts: for en-ru, the English sentence is row[0] only when I stored English first.
  // I stored Russian first for 0-14 and English first for 15-29. The loop already uses row[0] as prompt and row[1] as answer. Good.

  var SITUATIONS = [
    ["You are holding a phone. What do you say?", "This is my phone.", "That is my phone.", "These is my phone.", "Those is my phone.", "this", "One phone in your hand is this."],
    ["You see one car far down the road. What do you say?", "That is my car.", "This is my car.", "Those is my car.", "These are my car.", "that", "One car far away is that."],
    ["Your keys are in your hand. What do you say?", "These are my keys.", "This are my keys.", "Those is my keys.", "That are my keys.", "these", "Several keys in your hand: these are."],
    ["You see two cars far away. What do you say?", "Those cars.", "This cars.", "That car, for both.", "These cars, though they are far.", "those", "More than one car, far away: those cars."],
    ["A friend is standing next to you. What do you say?", "This is my friend.", "Those is my friend.", "These is my friend.", "That are my friend.", "this", "One person next to you: this."],
    ["A dog is on the other side of the park. What do you say?", "Look at that dog!", "Look at these dog!", "Look at those dog!", "Look at this dogs!", "that", "One dog far away: that dog."],
    ["You are wearing shoes now. What do you say?", "I like these shoes.", "I like this shoes.", "I like that shoe, for both.", "I like those shoe.", "these", "The shoes on your feet are near you: these shoes."],
    ["Mountains are on the horizon. What do you say?", "Look at those mountains.", "Look at this mountains.", "Look at that mountains.", "Look at these mountain.", "those", "Several mountains far away: those mountains."],
    ["One book is open in front of you. What do you say?", "This book is interesting.", "These book is interesting.", "Those book is interesting.", "That books is interesting.", "this", "One book near you: this book."],
    ["One building is far across the city. What do you say?", "That building is very tall.", "Those building is very tall.", "These building is very tall.", "This buildings is very tall.", "that", "One building far away: that building."],
    ["Several books are in your bag. What do you say?", "These books are mine.", "This books are mine.", "That book are mine.", "Those book is mine.", "these", "Several books with you: these books."],
    ["Several photos hang on the far wall. What do you say?", "Those photos are old.", "That photos are old.", "This photos are old.", "These photo is old.", "those", "Several photos far away: those photos."],
    ["Someone hands you one cup. What do you ask?", "What is this?", "What are these?", "What is those?", "What are that?", "this", "One thing put in your hand: What is this?"],
    ["You point to one light in the distance. What do you ask?", "What is that?", "What is this?", "What are those?", "What are these?", "that", "One thing far away: What is that?"],
    ["You hold up several tickets. What do you ask?", "What are these?", "What is this?", "What is those?", "What are that?", "these", "Several tickets in your hand: What are these?"],
    ["You point at several birds far away. What do you ask?", "What are those?", "What is that?", "What are these?", "What is this?", "those", "Several birds far away: What are those?"],
    ["You introduce the person beside you.", "This is my friend.", "Those are my friend.", "That are my friend.", "These is my friend.", "this", "One person next to you: This is my friend."],
    ["You introduce people standing far from you.", "Those are my friends.", "That are my friends.", "This are my friends.", "These is my friends.", "those", "Several people far away: Those are my friends."],
    ["The song on your phone is playing. What do you say?", "I like this song.", "I like these song.", "I like those song.", "I like that songs.", "this", "The song playing for you now is this song."],
    ["A song is playing in another room. What do you say?", "I don't like that song.", "I don't like these song.", "I don't like this songs.", "I don't like those song.", "that", "A song away from you is that song."],
    ["It is Monday of the current week. What do you say?", "This week is busy.", "That week is busy, about today.", "These week is busy.", "Those week is busy.", "this", "This week means the week we are in now."],
    ["You talk about the day you first met, years ago. What do you say?", "I don't remember that day.", "I don't remember this day, about years ago.", "I don't remember these day.", "I don't remember those day.", "that", "That day points to a past day, not today."],
    ["You talk about life right now. What do you say?", "These days are cold.", "This days are cold.", "That days are cold.", "Those day is cold.", "these", "These days means now. Days is plural."],
    ["You talk about childhood. What do you say?", "Those days were happier.", "This days were happier.", "That days were happier.", "These day was happier.", "those", "Those days means a time already gone."],
    ["One house is next to yours. What do you say?", "This house is new.", "These house is new.", "Those house is new.", "That houses is new.", "this", "One house near you: this house."],
    ["One house is on a far hill. What do you say?", "That house is old.", "Those house is old.", "These house is old.", "This houses is old.", "that", "One house far away: that house."],
    ["You are carrying several bags. What do you say?", "These bags are heavy.", "This bags are heavy.", "That bag are heavy.", "Those bag is heavy.", "these", "Several bags you are carrying: these bags."],
    ["Several bags are still in the car across the street. What do you say?", "Those bags are heavy.", "That bags are heavy.", "This bags are heavy.", "These bag is heavy.", "those", "Several bags far from you: those bags."],
    ["You hear one voice in the next room. What do you ask?", "Who's that?", "Who's these?", "Who are this?", "Who is those?", "that", "One person not next to you: Who's that?"],
    ["Two friends walk toward you and stop beside you. What do you say?", "These are my friends.", "Those is my friends.", "That are my friends.", "This are my friends.", "these", "They are beside you now, and there are two: these are."]
  ];
  SITUATIONS.forEach(function (row) {
    add({ word: row[5], topic: "situation", level: 3, type: "situation", prompt: row[0], options: [row[1], row[2], row[3], row[4]], answer: row[1], explain: row[6] });
  });

  SG.forEach(function (noun, index) {
    add({ word: "this", topic: "near", level: 2 + (index % 3 === 2 ? 2 : index % 3), type: "choice", prompt: "Count: one. Place: in your hand. The word comes before the noun. ___ " + noun.en + " is here.", options: FOUR.slice(), answer: "This", explain: rule("this") });
    add({ word: "that", topic: "far", level: 2 + (index % 3), type: "choice", prompt: "Count: one. Place: far from you. The word comes before the noun. ___ " + noun.en + " is over there.", options: FOUR.slice(), answer: "That", explain: rule("that") });
  });
  PL.forEach(function (noun, index) {
    add({ word: "these", topic: "number", level: 2 + (index % 3), type: "choice", prompt: "Count: more than one. Place: next to you. ___ " + noun.en + " are here.", options: FOUR.slice(), answer: "These", explain: rule("these") });
    add({ word: "those", topic: "number", level: 2 + (index % 3 === 0 ? 2 : index % 3), type: "choice", prompt: "Count: more than one. Place: far away. ___ " + noun.en + " are over there.", options: FOUR.slice(), answer: "Those", explain: rule("those") });
  });
  add({ word: "this", topic: "pronoun", level: 3, type: "sentence", prompt: "Which sentence is correct?", options: ["This is my phone.", "These is my phone.", "Those is my phone.", "That are my phone."], answer: "This is my phone.", explain: "This is my phone. This stands alone for one thing near you." });
  add({ word: "that", topic: "pronoun", level: 3, type: "sentence", prompt: "Which sentence is correct about one far car?", options: ["That is my car.", "Those is my car.", "These are my car.", "This are my car."], answer: "That is my car.", explain: "That is my car. One car, far away." });
  add({ word: "these", topic: "number", level: 3, type: "sentence", prompt: "Which sentence is correct?", options: ["These books are interesting.", "This books are interesting.", "These book are interesting.", "That books is interesting."], answer: "These books are interesting.", explain: "Books is plural, so these, and the verb is are." });
  add({ word: "those", topic: "number", level: 3, type: "sentence", prompt: "Which sentence is correct?", options: ["Those are my friends.", "That are my friends.", "Those is my friends.", "This are my friends."], answer: "Those are my friends.", explain: "Friends is plural and not beside you. Those are, not that are." });
  add({ word: "this", topic: "time", level: 4, type: "gap", prompt: "Not a past week. ___ week we have a test.", options: ["This", "That", "These", "Those"], answer: "This", explain: "This week is the current week. Week is one, so not these." });
  add({ word: "that", topic: "time", level: 4, type: "gap", prompt: "A night long ago. I still remember ___ night.", options: ["That", "This", "Those", "These"], answer: "That", explain: "That night points to a night already gone." });
  add({ word: "these", topic: "near", level: 4, type: "gap", prompt: "The tickets are in your pocket now. Keep ___ tickets.", options: FOUR.slice(), answer: "These", explain: rule("these") });
  add({ word: "those", topic: "far", level: 4, type: "gap", prompt: "The lights are on the far bridge. Can you see ___ lights?", options: FOUR.slice(), answer: "Those", explain: rule("those") });
  add({ word: "this", topic: "noun", level: 2, type: "gap", prompt: "___ phone is expensive. It is the one in your hand.", options: FOUR.slice(), answer: "This", explain: rule("this") + " This phone names the noun." });
  add({ word: "these", topic: "noun", level: 2, type: "gap", prompt: "___ shoes are very comfortable. You are wearing them.", options: FOUR.slice(), answer: "These", explain: rule("these") });
  add({ word: "that", topic: "mistake", level: 3, type: "fix", prompt: "Fix the sentence: Those is my car.", options: ["That is my car.", "Those is my car.", "Those are my car.", "These is my car."], answer: "That is my car.", explain: "A car is one thing. Those is plural. Say that is my car." });
  add({ word: "these", topic: "mistake", level: 3, type: "fix", prompt: "Fix the sentence: This books are interesting.", options: ["These books are interesting.", "This books are interesting.", "This book are interesting.", "Those book is interesting."], answer: "These books are interesting.", explain: "Books is plural, so these books, not this books." });
  add({ word: "those", topic: "situation", level: 3, type: "situation", prompt: "You see a row of expensive cars far away. What do you say?", options: ["Those cars are expensive.", "This cars are expensive.", "That cars are expensive.", "These car is expensive."], answer: "Those cars are expensive.", explain: rule("those") });
  add({ word: "this", topic: "situation", level: 3, type: "situation", prompt: "You hold up one letter. What do you say?", options: ["This is my letter.", "These is my letter.", "Those are my letter.", "That are my letter."], answer: "This is my letter.", explain: rule("this") });

  var seen = {};
  bank = bank.filter(function (item) {
    var key = item.prompt + "|" + item.answer;
    if (seen[key]) return false;
    seen[key] = 1;
    if (item.options.indexOf(item.answer) < 0) item.options = item.options.concat([item.answer]);
    return true;
  });
  bank.forEach(function (item, index) { item.id = "demo-" + (index + 1); });

  function emptyBucket() { return { right: 0, wrong: 0 }; }
  function freshStats() {
    var byWord = {};
    var topics = {};
    WORDS.forEach(function (word) { byWord[word] = emptyBucket(); });
    ["near", "far", "number", "pronoun", "noun", "time", "translation", "situation", "mistake"].forEach(function (topic) { topics[topic] = emptyBucket(); });
    return { answered: 0, correct: 0, streak: 0, bestStreak: 0, review: false, byWord: byWord, topics: topics, wrongIds: [] };
  }
  function loadStats() {
    var base = freshStats();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved) return base;
      base.answered = saved.answered || 0;
      base.correct = saved.correct || 0;
      base.streak = saved.streak || 0;
      base.bestStreak = saved.bestStreak || 0;
      base.review = !!saved.review;
      base.wrongIds = Array.isArray(saved.wrongIds) ? saved.wrongIds : [];
      WORDS.forEach(function (word) {
        if (saved.byWord && saved.byWord[word]) base.byWord[word] = { right: saved.byWord[word].right || 0, wrong: saved.byWord[word].wrong || 0 };
      });
      Object.keys(base.topics).forEach(function (topic) {
        if (saved.topics && saved.topics[topic]) base.topics[topic] = { right: saved.topics[topic].right || 0, wrong: saved.topics[topic].wrong || 0 };
      });
    } catch (e) {}
    return base;
  }
  function saveStats(stats) {
    try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch (e) {}
    if (root.syncDemoProgress) root.syncDemoProgress();
  }
  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
  function weight(item, stats) {
    var word = stats.byWord[item.word] || emptyBucket();
    var topic = stats.topics[item.topic] || emptyBucket();
    var score = 1 + word.wrong * 3 + topic.wrong * 2;
    if (stats.wrongIds.indexOf(item.id) >= 0) score += 5;
    return score;
  }
  function pickRun(pool, count, stats) {
    var ranked = pool.slice().sort(function (a, b) { return (Math.random() / weight(a, stats)) - (Math.random() / weight(b, stats)); });
    return ranked.slice(0, Math.min(count, ranked.length));
  }
  function mistakePool(stats) {
    var weak = {};
    WORDS.forEach(function (word) {
      var row = stats.byWord[word];
      if (row.wrong > row.right) weak[word] = 1;
    });
    var ids = {};
    stats.wrongIds.forEach(function (id) { ids[id] = 1; });
    return bank.filter(function (item) {
      var topic = stats.topics[item.topic] || emptyBucket();
      return ids[item.id] || weak[item.word] || topic.wrong > topic.right;
    });
  }
  function esc(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function weakest(stats) {
    var name = "";
    var score = 2;
    WORDS.forEach(function (word) {
      var row = stats.byWord[word];
      var total = row.right + row.wrong;
      if (!total) return;
      var acc = row.right / total;
      if (acc < score) { score = acc; name = word; }
    });
    return name;
  }

  var run = null;
  function showLesson() {
    var lesson = document.getElementById("demoLesson");
    var quiz = document.getElementById("demoQuiz");
    var result = document.getElementById("demoResult");
    if (lesson) lesson.hidden = false;
    if (quiz) quiz.hidden = true;
    if (result) result.hidden = true;
    paint();
  }
  function paint() {
    var stats = loadStats();
    var box = document.getElementById("demoProgress");
    var note = document.getElementById("demoReviewNote");
    var label = document.getElementById("demoLibLabel");
    var bar = document.getElementById("demoLibBar");
    var pct = stats.answered ? Math.round(stats.correct * 100 / stats.answered) : 0;
    if (label) label.textContent = stats.review ? "review waiting" : "this, that, these, those";
    if (bar) bar.style.width = pct + "%";
    if (note) note.hidden = !stats.review;
    if (!box) return;
    var weak = weakest(stats);
    var bits = WORDS.map(function (word) {
      var row = stats.byWord[word];
      var total = row.right + row.wrong;
      var width = total ? Math.round(row.right * 100 / total) : 0;
      return "<p><b>" + cap(word) + "</b> " + width + "% <span class=\"mini\"><i style=\"width:" + width + "%\"></i></span></p>";
    }).join("");
    box.innerHTML = "<p><b>Progress: " + pct + "%</b></p>" +
      "<p>Questions answered: " + stats.answered + "</p>" +
      "<p>Correct answers: " + stats.correct + "</p>" +
      "<p>Accuracy: " + pct + "%</p>" +
      "<p>Weakest word: " + (weak ? cap(weak) : "Not enough answers yet.") + "</p>" +
      "<p>" + (stats.streak ? stats.streak + " correct answers in a row" : "No streak yet") + "</p>" + bits;
    var links = document.getElementById("demoLinks");
    if (links && !links.dataset.ready) {
      links.dataset.ready = "1";
      links.innerHTML = LINKS.map(function (link) {
        return '<a href="' + esc(link.url) + '" target="_blank" rel="noreferrer">' + esc(link.name) + "</a>";
      }).join(" · ");
    }
    var scenes = document.getElementById("demoScenes");
    if (scenes && !scenes.dataset.ready) {
      scenes.dataset.ready = "1";
      scenes.innerHTML = [
        ["near1", "This book", "one · near"],
        ["far1", "That book", "one · far"],
        ["nearN", "These books", "several · near"],
        ["farN", "Those books", "several · far"]
      ].map(function (row) {
        return '<div class="demo-card">' + sceneSvg(row[0]) + "<b>" + row[1] + "</b><span>" + row[2] + "</span></div>";
      }).join("");
    }
  }
  function start(mode, level) {
    var stats = loadStats();
    var pool = bank.slice();
    var count = mode === "quick" ? 5 : 20;
    var title = mode === "quick" ? "Quick Quiz" : (mode === "mistakes" ? "Practice my mistakes" : (level ? "Level " + level : "Practice"));
    if (level) pool = pool.filter(function (item) { return item.level === level; });
    if (mode === "mistakes") {
      pool = mistakePool(stats);
      if (!pool.length) {
        var body = document.getElementById("demoQuizBody");
        document.getElementById("demoLesson").hidden = true;
        document.getElementById("demoResult").hidden = true;
        document.getElementById("demoQuiz").hidden = false;
        document.getElementById("demoQuizMeta").textContent = "Practice my mistakes";
        body.innerHTML = '<p>No mistakes yet. Start with Practice.</p><div class="row"><button class="btn" type="button" data-demo="lesson">Back to the lesson</button></div>';
        return;
      }
    }
    var weakWords = [];
    if (mode === "mistakes") {
      pool.forEach(function (item) {
        if (weakWords.indexOf(item.word) < 0) weakWords.push(item.word);
      });
    }
    var note = "";
    if (weakWords.length === 1) note = "You often miss " + weakWords[0] + ". Let's practice it.";
    if (weakWords.length > 1) note = "You often confuse " + weakWords.join(" and ") + ". Let's practice them.";
    run = { mode: mode, title: title, items: pickRun(pool, count, stats), at: 0, wrong: [], locked: false, note: note };
    document.getElementById("demoLesson").hidden = true;
    document.getElementById("demoResult").hidden = true;
    document.getElementById("demoQuiz").hidden = false;
    renderQuestion();
  }
  function renderQuestion() {
    var item = run.items[run.at];
    run.locked = false;
    run.options = shuffle(item.options.slice());
    document.getElementById("demoQuizMeta").textContent = run.title + " · " + (run.at + 1) + " / " + run.items.length;
    var options = run.options.map(function (option) {
      return '<button class="opt" type="button" data-demo-pick="' + esc(option) + '"><span>' + esc(option).replace(/\n/g, "<br>") + "</span></button>";
    }).join("");
    document.getElementById("demoQuizBody").innerHTML =
      (run.note ? '<p class="hint">' + esc(run.note) + "</p>" : "") +
      (item.svg || "") +
      '<p class="q" style="font-size:22px">' + esc(item.prompt).replace(/\n/g, "<br>") + "</p>" +
      '<div class="opts">' + options + "</div>" +
      '<div id="demoFb"></div>';
  }
  function answer(value, button) {
    if (!run || run.locked) return;
    var item = run.items[run.at];
    run.locked = true;
    var ok = String(value) === String(item.answer);
    var stats = loadStats();
    stats.answered += 1;
    var word = stats.byWord[item.word] || emptyBucket();
    var topic = stats.topics[item.topic] || emptyBucket();
    if (ok) {
      stats.correct += 1;
      stats.streak += 1;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
      word.right += 1;
      topic.right += 1;
      stats.wrongIds = stats.wrongIds.filter(function (id) { return id !== item.id; });
    } else {
      stats.streak = 0;
      word.wrong += 1;
      topic.wrong += 1;
      if (stats.wrongIds.indexOf(item.id) < 0) stats.wrongIds.push(item.id);
      if (stats.wrongIds.length > 80) stats.wrongIds = stats.wrongIds.slice(-80);
      run.wrong.push(item);
    }
    stats.byWord[item.word] = word;
    stats.topics[item.topic] = topic;
    saveStats(stats);
    document.querySelectorAll("#demoQuiz [data-demo-pick]").forEach(function (opt) {
      var picked = opt.getAttribute("data-demo-pick") === item.answer;
      if (picked) opt.classList.add("ok");
      if (opt === button && !ok) opt.classList.add("bad");
    });
    var fb = document.getElementById("demoFb");
    fb.innerHTML = '<div class="feedback ' + (ok ? "ok" : "bad") + '">' + (ok ? "Correct" : "Incorrect") + "</div>" +
      (ok ? "" : "<p>Right answer: " + esc(item.answer) + "</p>") +
      "<p>" + esc(item.explain) + "</p>" +
      '<div class="row"><button class="btn primary" type="button" data-demo="next">' + (run.at + 1 >= run.items.length ? "See the result" : "Next") + "</button></div>";
  }
  function finish() {
    var total = run.items.length;
    var correct = total - run.wrong.length;
    var pct = total ? Math.round(correct * 100 / total) : 0;
    var stats = loadStats();
    var title = run.mode === "quick" ? (correct + " / " + total + (pct >= 80 ? " — Good job!" : "")) : "Your result";
    var lines = run.wrong.map(function (item) {
      return "<p><b>" + esc(item.prompt).replace(/\n/g, " ") + "</b><br>Right answer: " + esc(item.answer) + "</p>";
    }).join("");
    var weak = {};
    run.wrong.forEach(function (item) { weak[item.word] = (weak[item.word] || 0) + 1; });
    var weakLine = Object.keys(weak).sort(function (a, b) { return weak[b] - weak[a]; }).map(cap).join(", ");
    document.getElementById("demoQuiz").hidden = true;
    document.getElementById("demoResult").hidden = false;
    document.getElementById("demoResultBody").innerHTML =
      "<h2>" + esc(title) + "</h2>" +
      "<p class=\"score\" style=\"color:var(--ink)\">" + correct + " / " + total + "</p>" +
      "<p>" + pct + "%</p>" +
      "<p>Correct answers: " + correct + "</p>" +
      "<p>Incorrect answers: " + run.wrong.length + "</p>" +
      "<p>Needs work: " + (weakLine || "Nothing in this round.") + "</p>" +
      "<p>Streak now: " + stats.streak + "</p>" +
      (lines ? "<h2>Incorrect answers</h2>" + lines : "") +
      '<div class="row"><button class="btn primary" type="button" data-demo="practice">Practice</button>' +
      (run.wrong.length ? '<button class="btn" type="button" data-demo="mistakes">Practice my mistakes</button>' : "") +
      '<button class="btn" type="button" data-demo="lesson">Back to the lesson</button></div>';
    run = null;
  }
  function onClick(event) {
    var pick = event.target.closest("[data-demo-pick]");
    if (pick && document.getElementById("demonstratives").classList.contains("on")) {
      event.preventDefault();
      event.stopPropagation();
      answer(pick.getAttribute("data-demo-pick"), pick);
      return;
    }
    var button = event.target.closest("[data-demo]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    var action = button.getAttribute("data-demo");
    if (action === "lesson") { showLesson(); return; }
    if (action === "next") {
      if (!run) return;
      run.at += 1;
      if (run.at >= run.items.length) finish();
      else renderQuestion();
      return;
    }
    if (action === "review") {
      var stats = loadStats();
      stats.review = true;
      saveStats(stats);
      paint();
      return;
    }
    if (action === "practice") start("practice", 0);
    else if (action === "quick") start("quick", 0);
    else if (action === "mistakes") start("mistakes", 0);
    else if (action === "level") start("level", Number(button.getAttribute("data-demo-level")) || 1);
  }

  root.DEMONSTRATIVES = { links: LINKS, questions: bank };
  root.paintDemonstratives = paint;
  if (typeof document !== "undefined") {
    document.addEventListener("click", onClick);
    if (document.getElementById("demoLesson")) paint();
  }
})(typeof window !== "undefined" ? window : globalThis);
