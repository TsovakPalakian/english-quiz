  function enterInput(event) {
    if (
      prefs.enter === false ||
      shifted ||
      composing ||
      event.isComposing ||
      !event.cancelable ||
      !['insertParagraph', 'insertLineBreak'].includes(event.inputType)
    )
      return;
    event.preventDefault();
    send();
  }
  composer.addEventListener('beforeinput', enterInput);
  composer.parentElement.querySelector('.text-color-rich')?.addEventListener('beforeinput', enterInput);
  const emojiSets = {
    smileys: [
      [0x1f600, 'Smile'],
      [0x1f603, 'Grinning'],
      [0x1f604, 'Happy'],
      [0x1f601, 'Beaming'],
      [0x1f606, 'Laughing'],
      [0x1f605, 'Relieved'],
      [0x1f602, 'Laugh'],
      [0x1f923, 'Rolling laugh'],
      [0x1f642, 'Slight smile'],
      [0x1f643, 'Upside down'],
      [0x1f609, 'Wink'],
      [0x1f60a, 'Blushing'],
      [0x1f607, 'Angel'],
      [0x1f60d, 'Heart eyes'],
      [0x1f970, 'Loved'],
      [0x1f618, 'Kiss'],
      [0x1f60b, 'Delicious'],
      [0x1f61b, 'Tongue'],
      [0x1f60e, 'Cool'],
      [0x1f973, 'Party face'],
      [0x1f929, 'Star eyes'],
      [0x1f914, 'Thinking'],
      [0x1f917, 'Hug'],
      [0x1f92d, 'Surprised smile'],
      [0x1f92b, 'Quiet'],
      [0x1f910, 'Zipped mouth'],
      [0x1f610, 'Neutral'],
      [0x1f644, 'Eye roll'],
      [0x1f62c, 'Grimace'],
      [0x1f634, 'Sleeping'],
      [0x1f60c, 'Peaceful'],
      [0x1f614, 'Pensive'],
      [0x1f622, 'Sad'],
      [0x1f62d, 'Crying'],
      [0x1f631, 'Shocked'],
      [0x1f620, 'Angry'],
      [0x1f624, 'Determined'],
      [0x1f92f, 'Mind blown'],
      [0x1f913, 'Nerd'],
      [0x1f9d0, 'Monocle'],
    ],
    hands: [
      [0x1f44d, 'Thumbs up'],
      [0x1f44e, 'Thumbs down'],
      [0x1f44b, 'Wave'],
      [0x1f44f, 'Applause'],
      [0x1f64f, 'Thanks'],
      [0x1f64c, 'Celebrate'],
      [0x1f91d, 'Handshake'],
      [0x1f44c, 'OK'],
      [0x270c, 'Victory'],
      [0x1f4aa, 'Strength'],
      [0x1f44a, 'Fist'],
      [0x1f91e, 'Crossed fingers'],
      [0x1f91f, 'Love gesture'],
      [0x1f446, 'Up'],
      [0x1f447, 'Down'],
      [0x1f448, 'Left'],
      [0x1f449, 'Right'],
      [0x1f590, 'Hand'],
    ],
    symbols: [
      [0x2764, 'Heart'],
      [0x1f49a, 'Green heart'],
      [0x1f499, 'Blue heart'],
      [0x1f49b, 'Yellow heart'],
      [0x1f90d, 'White heart'],
      [0x1f4af, 'Hundred'],
      [0x2705, 'Done'],
      [0x274c, 'No'],
      [0x2757, 'Important'],
      [0x2753, 'Question'],
      [0x1f4a1, 'Idea'],
      [0x1f525, 'Fire'],
      [0x2728, 'Sparkles'],
      [0x2b50, 'Star'],
      [0x1f389, 'Celebrate'],
      [0x1f3c6, 'Trophy'],
      [0x1f3af, 'Target'],
      [0x1f514, 'Bell'],
    ],
    objects: [
      [0x1f4da, 'Books'],
      [0x1f4d6, 'Book'],
      [0x1f4dd, 'Notes'],
      [0x270f, 'Pencil'],
      [0x1f393, 'Graduation'],
      [0x1f4bb, 'Laptop'],
      [0x1f4f1, 'Phone'],
      [0x1f3a7, 'Headphones'],
      [0x1f3b5, 'Music'],
      [0x1f4f7, 'Camera'],
      [0x1f50d, 'Search'],
      [0x1f4c5, 'Calendar'],
      [0x23f0, 'Clock'],
      [0x1f4ce, 'Attachment'],
      [0x1f4e9, 'Envelope'],
      [0x1f511, 'Key'],
      [0x1f680, 'Rocket'],
      [0x1f30d, 'World'],
    ],
    nature: [
      [0x1f338, 'Blossom'],
      [0x1f33b, 'Sunflower'],
      [0x1f337, 'Tulip'],
      [0x1f333, 'Tree'],
      [0x1f331, 'Seedling'],
      [0x1f340, 'Clover'],
      [0x2600, 'Sun'],
      [0x1f319, 'Moon'],
      [0x1f308, 'Rainbow'],
      [0x1f3d6, 'Beach'],
      [0x1f34e, 'Apple'],
      [0x1f353, 'Strawberry'],
      [0x1f349, 'Watermelon'],
      [0x2615, 'Coffee'],
      [0x1f370, 'Cake'],
      [0x1f355, 'Pizza'],
      [0x1f3c0, 'Basketball'],
      [0x26bd, 'Football'],
    ],
  };
  emojiSets.smileys.push(
    ...[
      [0x1f972, 'Happy tears'],
      [0x1f979, 'Holding back tears'],
      [0x1f971, 'Yawning'],
      [0x1f92a, 'Zany'],
      [0x1f92e, 'Sick'],
      [0x1f922, 'Nauseous'],
      [0x1f927, 'Sneezing'],
      [0x1f912, 'Thermometer'],
      [0x1f915, 'Bandaged'],
      [0x1f637, 'Mask'],
      [0x1f975, 'Hot'],
      [0x1f976, 'Cold'],
      [0x1f974, 'Woozy'],
      [0x1f635, 'Dizzy'],
      [0x1f62e, 'Open mouth'],
      [0x1f62f, 'Hushed'],
      [0x1f632, 'Astonished'],
      [0x1f633, 'Flushed'],
      [0x1f626, 'Frowning'],
      [0x1f627, 'Anguished'],
      [0x1f628, 'Fearful'],
      [0x1f630, 'Anxious'],
      [0x1f625, 'Disappointed'],
      [0x1f613, 'Sweating'],
      [0x1f616, 'Confounded'],
      [0x1f623, 'Persevering'],
      [0x1f61e, 'Disappointed face'],
      [0x1f61f, 'Worried'],
      [0x1f629, 'Weary'],
      [0x1f62b, 'Tired'],
      [0x1f621, 'Pouting'],
      [0x1f92c, 'Swearing'],
      [0x1f608, 'Mischievous'],
      [0x1f47b, 'Ghost'],
      [0x1f47d, 'Alien'],
      [0x1f916, 'Robot'],
      [0x1f63a, 'Happy cat'],
      [0x1f638, 'Grinning cat'],
      [0x1f639, 'Laughing cat'],
      [0x1f63b, 'Heart eyes cat'],
      [0x1f63c, 'Smirking cat'],
      [0x1f63d, 'Kissing cat'],
      [0x1f640, 'Surprised cat'],
      [0x1f63f, 'Crying cat'],
      [0x1f63e, 'Pouting cat'],
      [0x1fae0, 'Melting'],
      [0x1fae1, 'Saluting'],
      [0x1fae2, 'Hand over mouth'],
      [0x1fae3, 'Peeking'],
      [0x1fae4, 'Diagonal mouth'],
      [0x1fae5, 'Dotted face'],
      [0x1fae8, 'Shaking face'],
    ],
  );
  emojiSets.hands.push(
    ...[
      [0x1f91b, 'Left fist'],
      [0x1f91c, 'Right fist'],
      [0x1f91a, 'Raised back hand'],
      [0x270b, 'Raised hand'],
      [0x1f596, 'Vulcan salute'],
      [0x1f918, 'Rock on'],
      [0x1f919, 'Call me'],
      [0x1f90c, 'Pinched fingers'],
      [0x1f90f, 'Pinching hand'],
      [0x1f932, 'Open palms'],
      [0x1f450, 'Open hands'],
      [0x1faf0, 'Finger heart'],
      [0x1faf1, 'Rightwards hand'],
      [0x1faf2, 'Leftwards hand'],
      [0x1faf3, 'Palm down'],
      [0x1faf4, 'Palm up'],
      [0x1faf5, 'Pointing at you'],
      [0x1faf6, 'Heart hands'],
    ],
  );
  const modifiers = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff];
  for (const [code, label] of emojiSets.hands.filter(([code]) => code !== 0x1f91d))
    for (let i = 0; i < modifiers.length; i++)
      emojiSets.hands.push([[code, modifiers[i]], label + ' - skin tone ' + (i + 1)]);
  emojiSets.symbols.push(
    ...[
      [0x1f9e1, 'Orange heart'],
      [0x1f49c, 'Purple heart'],
      [0x1f90e, 'Brown heart'],
      [0x1f5a4, 'Black heart'],
      [0x1f494, 'Broken heart'],
      [0x1f495, 'Two hearts'],
      [0x1f496, 'Sparkling heart'],
      [0x1f497, 'Growing heart'],
      [0x1f498, 'Gift heart'],
      [0x1f49d, 'Ribbon heart'],
      [0x1f49f, 'Heart decoration'],
      [0x1f4a5, 'Boom'],
      [0x1f4a4, 'Sleep'],
      [0x1f4ac, 'Speech'],
      [0x1f4ad, 'Thought'],
      [0x1f4a8, 'Speed'],
      [0x26a1, 'Lightning'],
      [0x26a0, 'Warning'],
      [0x1f6ab, 'Forbidden'],
      [0x267b, 'Recycle'],
      [0x267e, 'Infinity'],
      [0x2714, 'Check'],
      [0x2795, 'Plus'],
      [0x2796, 'Minus'],
      [0x1f195, 'New'],
      [0x1f197, 'OK sign'],
      [0x1f198, 'SOS'],
      [0x1f199, 'Up sign'],
      [0x1f51d, 'Top'],
      [0x1f519, 'Back'],
      [0x1f512, 'Locked'],
      [0x1f513, 'Unlocked'],
    ],
  );
  emojiSets.objects.push(
    ...[
      [0x1f4d2, 'Notebook'],
      [0x1f4d3, 'Journal'],
      [0x1f4d4, 'Decorated notebook'],
      [0x1f4d5, 'Red book'],
      [0x1f4d7, 'Green book'],
      [0x1f4d8, 'Blue book'],
      [0x1f4d9, 'Orange book'],
      [0x1f4c3, 'Page'],
      [0x1f4c4, 'Document'],
      [0x1f4cb, 'Clipboard'],
      [0x1f4cc, 'Pin'],
      [0x1f58a, 'Pen'],
      [0x1f58d, 'Crayon'],
      [0x1f58c, 'Brush'],
      [0x1f4cf, 'Ruler'],
      [0x1f4c1, 'Folder'],
      [0x1f5c2, 'Index cards'],
      [0x1f4e7, 'Email'],
      [0x1f4e6, 'Package'],
      [0x1f381, 'Gift'],
      [0x1f3a8, 'Art'],
      [0x1f3ad, 'Theatre'],
      [0x1f3ac, 'Cinema'],
      [0x1f3b8, 'Guitar'],
      [0x1f3b9, 'Piano'],
      [0x1f3ba, 'Trumpet'],
      [0x1f941, 'Drum'],
      [0x1f3a4, 'Microphone'],
      [0x1f50b, 'Battery'],
      [0x1f50c, 'Plug'],
      [0x1f4fa, 'TV'],
      [0x1f4a1, 'Light bulb'],
      [0x1f9ed, 'Compass'],
      [0x1f9f0, 'Toolbox'],
      [0x1f9ea, 'Test tube'],
      [0x1f52c, 'Microscope'],
      [0x1f52d, 'Telescope'],
    ],
  );
  emojiSets.nature.push(
    ...[
      [0x1f335, 'Cactus'],
      [0x1f334, 'Palm tree'],
      [0x1f332, 'Evergreen'],
      [0x1f33f, 'Herb'],
      [0x1f342, 'Leaf'],
      [0x1f343, 'Leaves'],
      [0x1f339, 'Rose'],
      [0x1f33a, 'Hibiscus'],
      [0x1f33c, 'Flower'],
      [0x1f490, 'Bouquet'],
      [0x1f30a, 'Wave'],
      [0x1f30b, 'Volcano'],
      [0x1f30c, 'Milky way'],
      [0x1f320, 'Shooting star'],
      [0x1f31f, 'Glowing star'],
      [0x1f31e, 'Sun face'],
      [0x1f31d, 'Moon face'],
      [0x1f327, 'Rain'],
      [0x1f328, 'Snow'],
      [0x1f329, 'Storm'],
      [0x1f32a, 'Tornado'],
      [0x2601, 'Cloud'],
      [0x2744, 'Snowflake'],
      [0x26c4, 'Snowman'],
    ],
  );
  emojiSets.animals = [
    [0x1f436, 'Dog'],
    [0x1f431, 'Cat'],
    [0x1f42d, 'Mouse'],
    [0x1f439, 'Hamster'],
    [0x1f430, 'Rabbit'],
    [0x1f98a, 'Fox'],
    [0x1f43b, 'Bear'],
    [0x1f43c, 'Panda'],
    [0x1f428, 'Koala'],
    [0x1f42f, 'Tiger'],
    [0x1f981, 'Lion'],
    [0x1f42e, 'Cow'],
    [0x1f437, 'Pig'],
    [0x1f438, 'Frog'],
    [0x1f435, 'Monkey'],
    [0x1f986, 'Duck'],
    [0x1f985, 'Eagle'],
    [0x1f989, 'Owl'],
    [0x1f987, 'Bat'],
    [0x1f43a, 'Wolf'],
    [0x1f417, 'Boar'],
    [0x1f434, 'Horse'],
    [0x1f984, 'Unicorn'],
    [0x1f41d, 'Bee'],
    [0x1f98b, 'Butterfly'],
    [0x1f41e, 'Ladybug'],
    [0x1f40c, 'Snail'],
    [0x1f422, 'Turtle'],
    [0x1f40d, 'Snake'],
    [0x1f438, 'Frog'],
    [0x1f419, 'Octopus'],
    [0x1f420, 'Fish'],
    [0x1f42c, 'Dolphin'],
    [0x1f433, 'Whale'],
    [0x1f988, 'Shark'],
    [0x1f980, 'Crab'],
    [0x1f99c, 'Parrot'],
    [0x1f9a2, 'Swan'],
    [0x1f99a, 'Peacock'],
    [0x1f9a5, 'Sloth'],
  ];
  emojiSets.food = [
    [0x1f34f, 'Green apple'],
    [0x1f350, 'Pear'],
    [0x1f34a, 'Tangerine'],
    [0x1f34b, 'Lemon'],
    [0x1f34c, 'Banana'],
    [0x1f347, 'Grapes'],
    [0x1f348, 'Melon'],
    [0x1f352, 'Cherries'],
    [0x1f351, 'Peach'],
    [0x1f34d, 'Pineapple'],
    [0x1f95d, 'Kiwi'],
    [0x1f951, 'Avocado'],
    [0x1f966, 'Broccoli'],
    [0x1f955, 'Carrot'],
    [0x1f33d, 'Corn'],
    [0x1f952, 'Cucumber'],
    [0x1f954, 'Potato'],
    [0x1f35e, 'Bread'],
    [0x1f950, 'Croissant'],
    [0x1f9c0, 'Cheese'],
    [0x1f95a, 'Egg'],
    [0x1f373, 'Cooking'],
    [0x1f953, 'Bacon'],
    [0x1f354, 'Burger'],
    [0x1f35f, 'Fries'],
    [0x1f32d, 'Hot dog'],
    [0x1f32e, 'Taco'],
    [0x1f32f, 'Burrito'],
    [0x1f96a, 'Sandwich'],
    [0x1f35d, 'Pasta'],
    [0x1f35c, 'Noodles'],
    [0x1f35b, 'Curry'],
    [0x1f363, 'Sushi'],
    [0x1f361, 'Dango'],
    [0x1f368, 'Ice cream'],
    [0x1f369, 'Doughnut'],
    [0x1f36a, 'Cookie'],
    [0x1f382, 'Birthday cake'],
    [0x1f36b, 'Chocolate'],
    [0x1f36c, 'Candy'],
    [0x1f36d, 'Lollipop'],
    [0x1f36f, 'Honey'],
    [0x1f375, 'Tea'],
    [0x1f95b, 'Milk'],
    [0x1f964, 'Drink'],
    [0x1f37f, 'Popcorn'],
  ];
  emojiSets.travel = [
    [0x1f697, 'Car'],
    [0x1f695, 'Taxi'],
    [0x1f68c, 'Bus'],
    [0x1f68e, 'Trolleybus'],
    [0x1f693, 'Police car'],
    [0x1f691, 'Ambulance'],
    [0x1f692, 'Fire engine'],
    [0x1f69a, 'Truck'],
    [0x1f6b2, 'Bicycle'],
    [0x1f6f4, 'Scooter'],
    [0x1f3cd, 'Motorbike'],
    [0x1f682, 'Train'],
    [0x1f687, 'Metro'],
    [0x1f68a, 'Tram'],
    [0x2708, 'Airplane'],
    [0x1f681, 'Helicopter'],
    [0x1f6f3, 'Ship'],
    [0x26f5, 'Sailboat'],
    [0x1f6f6, 'Canoe'],
    [0x1f3e0, 'Home'],
    [0x1f3eb, 'School'],
    [0x1f3e5, 'Hospital'],
    [0x1f3e6, 'Bank'],
    [0x1f3e8, 'Hotel'],
    [0x1f3f0, 'Castle'],
    [0x1f5fc, 'Tokyo tower'],
    [0x1f5fd, 'Statue of Liberty'],
    [0x1f3d4, 'Mountain'],
    [0x1f3dd, 'Island'],
    [0x1f3d5, 'Camping'],
    [0x26fa, 'Tent'],
    [0x1f3a1, 'Ferris wheel'],
    [0x1f3a2, 'Roller coaster'],
    [0x1f3a0, 'Carousel'],
    [0x1f3aa, 'Circus'],
  ];
  emojiSets.sports = [
    [0x1f3be, 'Tennis'],
    [0x1f3d0, 'Volleyball'],
    [0x1f3c8, 'American football'],
    [0x26be, 'Baseball'],
    [0x1f3c9, 'Rugby'],
    [0x1f3b1, 'Billiards'],
    [0x1f3d3, 'Table tennis'],
    [0x1f3f8, 'Badminton'],
    [0x1f94a, 'Boxing'],
    [0x1f94b, 'Martial arts'],
    [0x1f3bf, 'Skis'],
    [0x26f8, 'Skates'],
    [0x1f6f9, 'Skateboard'],
    [0x1f3c4, 'Surfing'],
    [0x1f3ca, 'Swimming'],
    [0x1f6b4, 'Cycling'],
    [0x1f3c3, 'Running'],
    [0x1f3cb, 'Weightlifting'],
    [0x1f9d8, 'Meditation'],
    [0x1f3c5, 'Medal'],
    [0x1f947, 'Gold'],
    [0x1f948, 'Silver'],
    [0x1f949, 'Bronze'],
    [0x1f3ae, 'Video game'],
    [0x1f3b2, 'Dice'],
    [0x1f9e9, 'Puzzle'],
    [0x265f, 'Chess'],
    [0x1f3b3, 'Bowling'],
    [0x1f3a3, 'Fishing'],
  ];
  const emojiIcons = {
    hands: 'hand',
    symbols: 'heart',
    objects: 'book-open',
    nature: 'flower-2',
    animals: 'paw-print',
    food: 'apple',
    travel: 'plane',
    sports: 'trophy',
  };
  const emojiValue = (code) =>
    String.fromCodePoint(...(Array.isArray(code) ? code : code < 0x1f000 ? [code, 0xfe0f] : [code]));
  function closeEmoji() {
    el('msgEmojiPicker').hidden = true;
    emojiMode = '';
    el('msgEmoji').setAttribute('aria-expanded', 'false');
    el('msgStickers').setAttribute('aria-expanded', 'false');
  }
  function paintEmoji(category) {
    const mode = emojiMode,
      node = el('msgEmojiPicker'),
      sets = mode === 'smileys' ? ['smileys'] : Object.keys(emojiIcons);
    node.innerHTML =
      (mode === 'emoji'
        ? '<div class="chat-emoji-tabs">' +
          sets
            .map(
              (c) =>
                '<button type="button" data-emoji-category="' +
                c +
                '" class="' +
                (c === category ? 'on' : '') +
                '" aria-label="' +
                c +
                '" title="' +
                c +
                '">' +
                icon(emojiIcons[c]) +
                '</button>',
            )
            .join('') +
          '</div>'
        : '') +
      '<label class="chat-emoji-search"><input type="search" placeholder="Search emoji" aria-label="Search emoji"></label><div class="chat-emoji-grid">' +
      emojiSets[category]
        .map(
          ([code, label]) =>
            '<button type="button" data-emoji="' +
            emojiValue(code) +
            '" data-emoji-name="' +
            label.toLocaleLowerCase() +
            '" aria-label="' +
            label +
            '" title="' +
            label +
            '">' +
            emojiValue(code) +
            '</button>',
        )
        .join('') +
      '</div>';
    node.querySelector('input').oninput = (event) => {
      const q = event.target.value.trim().toLocaleLowerCase();
      node
        .querySelectorAll('[data-emoji-name]')
        .forEach((button) => (button.hidden = !button.dataset.emojiName.includes(q)));
    };
    icons();
  }
  function emojiPicker(mode) {
    if (emojiMode === mode && !el('msgEmojiPicker').hidden) {
      closeEmoji();
      return;
    }
    emojiMode = mode;
    el('msgEmojiPicker').hidden = false;
    paintEmoji(mode === 'smileys' ? 'smileys' : 'hands');
    el('msgEmoji').setAttribute('aria-expanded', String(mode === 'smileys'));
    el('msgStickers').setAttribute('aria-expanded', String(mode === 'emoji'));
  }
  el('msgEmoji').onclick = () => emojiPicker('smileys');
  el('msgStickers').onclick = () => emojiPicker('emoji');
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#msgEmojiPicker,#msgEmoji,#msgStickers')) closeEmoji();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeEmoji();
  });
