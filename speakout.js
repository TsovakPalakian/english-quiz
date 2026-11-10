(function () {
  function unit(title, a, b, c, d) {
    return {
      title: title,
      lessons: [
        { letter: "A", title: a },
        { letter: "B", title: b },
        { letter: "C", title: c },
        { letter: "D", title: d }
      ]
    };
  }
  window.SPEAKOUT = [
    {
      level: "A1",
      units: [
        unit("Welcome!", "Hello", "Two jobs", "Checking in", "What's your name?"),
        unit("People", "Where are they?", "Family and friends", "Small talk", "Best Home Cook"),
        unit("Things", "Favourites", "What's on your desk?", "How much is it?", "Shopping"),
        unit("Every day", "Time for lunch!", "A day in the life", "Can I have …?", "Earth From Space"),
        unit("Action", "Good colleagues", "Yes, I can!", "Can you help me?", "Birthday!"),
        unit("Where?", "Lost", "A great place to live", "Where are you?", "The Travel Show"),
        unit("Healthy lives", "The little things", "Heroes", "What's wrong?", "Focus on fitness"),
        unit("Time out", "Weekend break", "Going out, staying in", "A ticket to …?", "Kodo drummers")
      ]
    },
    {
      level: "A2",
      units: [
        unit("Me and you", "Hi!", "Same but different", "Let's meet.", "Family and friends"),
        unit("Lifestyle", "Can't live without it", "Your lifestyle and you", "Eating out", "The Indian Relay"),
        unit("Home", "Come in.", "Too much stuff", "What can I bring?", "Your neighbourhood"),
        unit("This world", "What a decade!", "Life in numbers", "Where can I get ...?", "Sakura time"),
        unit("The past", "Then and now", "What went wrong?", "Sorry I'm late.", "My weekend was ..."),
        unit("Out and about", "Meet me in town.", "My way", "Getting around", "Cities: nature's new wild"),
        unit("Work", "Odd jobs", "An extra day", "I'm calling to check …", "Would you like to ...?"),
        unit("Travellers", "Trip advice", "Surprise travel", "At a hotel", "Arctic Academy")
      ]
    },
    {
      level: "A2+",
      units: [
        unit("My life", "Something in common", "Nice job", "You can do it!", "I love cooking!"),
        unit("Help", "To the rescue!", "Oops!", "How can I help?", "Difficult situations"),
        unit("Learn", "A helping hand", "I saw it on TV", "Life hacks", "School rules"),
        unit("Try this", "I've never …", "World record", "The perfect gift", "A taste of the Bayous"),
        unit("Things", "Lucky find", "The world of 'slow'", "It's the best!", "Can you lend me your …?"),
        unit("Fit and well", "Sport for all", "Stressed!", "How do you feel?", "Driven: The Billy Monger Story"),
        unit("Downtime", "Where shall we go?", "Takeaway", "At the exhibition", "Nice picture!"),
        unit("Tomorrow", "Blue-sky thinking", "Hopes and dreams", "Go green", "Tomorrow's Food")
      ]
    },
    {
      level: "B1",
      units: [
        unit("People", "Who are you?", "Good people", "Let's talk!", "Lifestyle"),
        unit("Tale tellers", "What happened?", "Storytelling", "A likely story", "The story of a place"),
        unit("Questions", "Facts and figures", "Decisions", "Can I ask you …?", "What matters most?"),
        unit("Winners", "Success", "First!", "Taking part", "Top Gear: Nepal"),
        unit("News", "Fake news", "Newsmakers", "Good news", "The future of news"),
        unit("Creators", "The two Pablos", "Be creative", "Why do you think that?", "An artist at work"),
        unit("Travel", "Good tourists", "Globetrotters", "You must see …!", "Go solo?"),
        unit("Know-how", "Doers and dreamers", "Video everywhere", "Help!", "A gifted learner")
      ]
    },
    {
      level: "B1+",
      units: [
        unit("Me & mine", "The story of me", "Less is more?", "Don't forget to …", "Your gadgets"),
        unit("Behaviour", "Change of habit", "People pleaser", "That's annoying!", "Planet Earth II: Jungles"),
        unit("Working life", "Working from home", "Gig work", "Good question", "This or that?"),
        unit("Fact or fiction?", "Hoax!", "Documentary", "News", "Fake friends"),
        unit("Consumer", "The customer is always right?", "Too good to be true", "Which should I buy?", "I do it myself"),
        unit("Places", "In the city", "Great journeys", "City transport", "A city of tomorrow"),
        unit("Connect", "Mix-up", "Oversharing", "Conversation savers", "A good communicator"),
        unit("Wisdom", "Wise words", "Life lessons", "One thing I know …", "Dragons' Den")
      ]
    },
    {
      level: "B2",
      units: [
        unit("Identity", "My ID", "Memory", "I'd much rather …", "Personality"),
        unit("Different worlds", "Real or virtual?", "Closer to nature", "Amazing lives", "The time traveller"),
        unit("Showtime", "Festival", "Performers", "Binge-watch", "Music lover?"),
        unit("Lifestyle", "Making changes", "Sleep", "Keep moving", "Ancient traditions"),
        unit("Work", "First day!", "Change of plan", "You're on mute!", "Are you a team player?"),
        unit("Psychology", "Pay attention!", "Quiet", "Here's my advice", "Would I lie to you?"),
        unit("Talent", "An unexpected passion", "I wish!", "Let me explain", "Hard work or talent?"),
        unit("Community", "A new way of living", "If the world …", "Online communities", "Second shot")
      ]
    },
    {
      level: "B2+",
      units: [
        unit("Connections", "New friends", "Places", "Things we love", "Comfort food"),
        unit("Competition", "Getting away with it", "Friend or foe?", "In the workplace", "Challenge"),
        unit("Inspiration", "Fanfiction", "Street chatter", "Carrot or stick?", "Role models"),
        unit("Image", "'Selfie-expression'", "Creating a brand", "Presenting yourself", "Branding and behaviour"),
        unit("Change", "Life-changing decisions", "Conservational change", "Effecting change", "Habits"),
        unit("Oops!", "Algorithm", "Online blunders", "In dispute", "Tech fail"),
        unit("Trends", "The word on the street", "Food fads", "Pre-loved", "Past and present"),
        unit("The future", "Dystopias and utopias", "The science we need", "Spend or save?", "Science fiction")
      ]
    },
    {
      level: "C1-C2",
      units: [
        unit("Learning", "Is that a fact?", "Tomorrow's learning", "Creativity", "Learning experiences"),
        unit("Culture", "Cities", "Lost in translation", "The way we do it", "Flavours"),
        unit("Working life", "Get that job!", "Going remote", "Tackling the real issues", "Company culture"),
        unit("Humanity", "Pioneers", "Community", "Economies", "Extinction"),
        unit("Influence", "First impressions", "The truth about rumour", "Try it out", "Role models"),
        unit("Classics", "Hidden gems", "Words and music", "Classic journeys", "Design classics"),
        unit("Choice", "Decisions, decisions!", "Online or offline?", "Urban animals", "Too much choice?"),
        unit("Body and mind", "No limits?", "Bridging the senses", "Feeling good", "Effects and illusions")
      ]
    }
  ];
})();
