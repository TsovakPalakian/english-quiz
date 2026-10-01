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
        unit("welcome!", "Hello", "Two jobs", "Checking in", "What's your name?"),
        unit("people", "Where are they?", "Family and friends", "Small talk", "Best Home Cook"),
        unit("things", "Favourites", "What's on your desk?", "How much is it?", "Shopping"),
        unit("every day", "Time for lunch!", "A day in the life", "Can I have …?", "Earth From Space"),
        unit("action", "Good colleagues", "Yes, I can!", "Can you help me?", "Birthday!"),
        unit("where?", "Lost", "A great place to live", "Where are you?", "The Travel Show"),
        unit("healthy lives", "The little things", "Heroes", "What's wrong?", "Focus on fitness"),
        unit("time out", "Weekend break", "Going out, staying in", "A ticket to …?", "Kodo drummers")
      ]
    },
    {
      level: "A2",
      units: [
        unit("me and you", "Hi!", "Same but different", "Let's meet.", "Family and friends"),
        unit("lifestyle", "Can't live without it", "Your lifestyle and you", "Eating out", "The Indian Relay"),
        unit("home", "Come in.", "Too much stuff", "What can I bring?", "Your neighbourhood"),
        unit("this world", "What a decade!", "Life in numbers", "Where can I get ...?", "Sakura time"),
        unit("the past", "Then and now", "What went wrong?", "Sorry I'm late.", "My weekend was ..."),
        unit("out and about", "Meet me in town.", "My way", "Getting around", "Cities: nature's new wild"),
        unit("work", "Odd jobs", "An extra day", "I'm calling to check …", "Would you like to ...?"),
        unit("travellers", "Trip advice", "Surprise travel", "At a hotel", "Arctic Academy")
      ]
    },
    {
      level: "A2+",
      units: [
        unit("my life", "Something in common", "Nice job", "You can do it!", "I love cooking!"),
        unit("help", "To the rescue!", "Oops!", "How can I help?", "Difficult situations"),
        unit("learn", "A helping hand", "I saw it on TV", "Life hacks", "School rules"),
        unit("try this", "I've never …", "World record", "The perfect gift", "A taste of the Bayous"),
        unit("things", "Lucky find", "The world of 'slow'", "It's the best!", "Can you lend me your …?"),
        unit("fit and well", "Sport for all", "Stressed!", "How do you feel?", "Driven: The Billy Monger Story"),
        unit("downtime", "Where shall we go?", "Takeaway", "At the exhibition", "Nice picture!"),
        unit("tomorrow", "Blue-sky thinking", "Hopes and dreams", "Go green", "Tomorrow's Food")
      ]
    },
    {
      level: "B1",
      units: [
        unit("people", "Who are you?", "Good people", "Let's talk!", "Lifestyle"),
        unit("tale tellers", "What happened?", "Storytelling", "A likely story", "The story of a place"),
        unit("questions", "Facts and figures", "Decisions", "Can I ask you …?", "What matters most?"),
        unit("winners", "Success", "First!", "Taking part", "Top Gear: Nepal"),
        unit("news", "Fake news", "Newsmakers", "Good news", "The future of news"),
        unit("creators", "The two Pablos", "Be creative", "Why do you think that?", "An artist at work"),
        unit("travel", "Good tourists", "Globetrotters", "You must see …!", "Go solo?"),
        unit("know-how", "Doers and dreamers", "Video everywhere", "Help!", "A gifted learner")
      ]
    },
    {
      level: "B1+",
      units: [
        unit("me & mine", "The story of me", "Less is more?", "Don't forget to …", "Your gadgets"),
        unit("behaviour", "Change of habit", "People pleaser", "That's annoying!", "Planet Earth II: Jungles"),
        unit("working life", "Working from home", "Gig work", "Good question", "This or that?"),
        unit("fact or fiction?", "Hoax!", "Documentary", "News", "Fake friends"),
        unit("consumer", "The customer is always right?", "Too good to be true", "Which should I buy?", "I do it myself"),
        unit("places", "In the city", "Great journeys", "City transport", "A city of tomorrow"),
        unit("connect", "Mix-up", "Oversharing", "Conversation savers", "A good communicator"),
        unit("wisdom", "Wise words", "Life lessons", "One thing I know …", "Dragons' Den")
      ]
    },
    {
      level: "B2",
      units: [
        unit("identity", "My ID", "Memory", "I'd much rather …", "Personality"),
        unit("different worlds", "Real or virtual?", "Closer to nature", "Amazing lives", "The time traveller"),
        unit("showtime", "Festival", "Performers", "Binge-watch", "Music lover?"),
        unit("lifestyle", "Making changes", "Sleep", "Keep moving", "Ancient traditions"),
        unit("work", "First day!", "Change of plan", "You're on mute!", "Are you a team player?"),
        unit("psychology", "Pay attention!", "Quiet", "Here's my advice", "Would I lie to you?"),
        unit("talent", "An unexpected passion", "I wish!", "Let me explain", "Hard work or talent?"),
        unit("community", "A new way of living", "If the world …", "Online communities", "Second shot")
      ]
    },
    {
      level: "B2+",
      units: [
        unit("connections", "New friends", "Places", "Things we love", "Comfort food"),
        unit("competition", "Getting away with it", "Friend or foe?", "In the workplace", "Challenge"),
        unit("inspiration", "Fanfiction", "Street chatter", "Carrot or stick?", "Role models"),
        unit("image", "'Selfie-expression'", "Creating a brand", "Presenting yourself", "Branding and behaviour"),
        unit("change", "Life-changing decisions", "Conservational change", "Effecting change", "Habits"),
        unit("oops!", "Algorithm", "Online blunders", "In dispute", "Tech fail"),
        unit("trends", "The word on the street", "Food fads", "Pre-loved", "Past and present"),
        unit("the future", "Dystopias and utopias", "The science we need", "Spend or save?", "Science fiction")
      ]
    },
    {
      level: "C1-C2",
      units: [
        unit("learning", "Is that a fact?", "Tomorrow's learning", "Creativity", "Learning experiences"),
        unit("culture", "Cities", "Lost in translation", "The way we do it", "Flavours"),
        unit("working life", "Get that job!", "Going remote", "Tackling the real issues", "Company culture"),
        unit("humanity", "Pioneers", "Community", "Economies", "Extinction"),
        unit("influence", "First impressions", "The truth about rumour", "Try it out", "Role models"),
        unit("classics", "Hidden gems", "Words and music", "Classic journeys", "Design classics"),
        unit("choice", "Decisions, decisions!", "Online or offline?", "Urban animals", "Too much choice?"),
        unit("body and mind", "No limits?", "Bridging the senses", "Feeling good", "Effects and illusions")
      ]
    }
  ];
})();
