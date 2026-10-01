from app.morphology import verb_forms

COPULA = ["am", "is", "are", "was", "were", "be", "been", "being"]

# Each record is one learnable expression, not a bare string.
# verb + tail builds every listed inflection. senses pick a meaning from the sentence.

PHRASAL_VERBS = [
    {"expression": "give up", "verb": "give", "particle": "up", "separable": True, "meaning": "to stop trying or stop doing something", "frequency": 0.95},
    {"expression": "find out", "verb": "find", "particle": "out", "separable": True, "meaning": "to discover a fact", "frequency": 0.9},
    {"expression": "look after", "verb": "look", "particle": "after", "meaning": "to take care of someone or something", "frequency": 0.88},
    {"expression": "carry on", "verb": "carry", "particle": "on", "meaning": "to continue", "frequency": 0.8},
    {"expression": "check out", "verb": "check", "particle": "out", "separable": True, "meaning": "to look at something, or to leave a hotel", "frequency": 0.75},
    {"expression": "come back", "verb": "come", "particle": "back", "meaning": "to return", "frequency": 0.8},
    {"expression": "wake up", "verb": "wake", "particle": "up", "separable": True, "meaning": "to stop sleeping", "frequency": 0.86},
    {"expression": "work out", "verb": "work", "particle": "out", "separable": True, "meaning": "to exercise, or to find an answer", "frequency": 0.84},
    {"expression": "show up", "verb": "show", "particle": "up", "meaning": "to arrive", "frequency": 0.8},
    {"expression": "end up", "verb": "end", "particle": "up", "slot": "ing", "slotOptional": True, "meaning": "to reach a situation after a series of events", "frequency": 0.86},
    {"expression": "figure out", "verb": "figure", "particle": "out", "separable": True, "meaning": "to understand or solve something", "frequency": 0.88},
    {"expression": "point out", "verb": "point", "particle": "out", "separable": True, "meaning": "to draw attention to a fact", "frequency": 0.8},
    {"expression": "set up", "verb": "set", "particle": "up", "separable": True, "meaning": "to arrange or start something", "frequency": 0.82},
    {"expression": "turn off", "verb": "turn", "particle": "off", "separable": True, "meaning": "to stop a machine or a supply", "frequency": 0.8},
    {"expression": "get over", "verb": "get", "particle": "over", "meaning": "to recover from something", "frequency": 0.78},
    {"expression": "come up with", "verb": "come", "tail": ["up", "with"], "meaning": "to think of an idea", "frequency": 0.86},
    {
        "expression": "take off",
        "verb": "take",
        "particle": "off",
        "separable": True,
        "meaning": "to leave the ground, or to remove something",
        "frequency": 0.9,
        "senses": [
            {"cues": ["plane", "flight", "airport", "runway", "pilot"], "meaning": "to leave the ground"},
            {"cues": ["jacket", "coat", "shirt", "hat", "shoes", "clothes", "glasses", "boots", "sweater"], "meaning": "to remove a piece of clothing"},
            {"cues": ["sales", "business", "career", "popular"], "meaning": "to suddenly become successful"},
        ],
    },
    {
        "expression": "pick up",
        "verb": "pick",
        "particle": "up",
        "separable": True,
        "meaning": "to lift something, or to collect someone",
        "frequency": 0.9,
        "senses": [
            {"cues": ["phone", "call", "receiver"], "meaning": "to answer the phone"},
            {"cues": ["spanish", "english", "french", "language", "accent", "skill", "habit"], "meaning": "to learn something informally"},
            {"cues": ["friend", "kids", "station", "airport", "passenger", "son", "daughter"], "meaning": "to collect someone"},
        ],
    },
    {
        "expression": "run into",
        "verb": "run",
        "particle": "into",
        "meaning": "to meet someone by chance",
        "frequency": 0.88,
        "senses": [
            {"cues": ["problem", "trouble", "difficulty", "issue", "debt"], "meaning": "to encounter a problem"},
            {"cues": ["friend", "teacher", "neighbour", "neighbor", "someone", "him", "her"], "meaning": "to meet someone by chance"},
            {"cues": ["wall", "tree", "car", "truck"], "meaning": "to hit something while moving"},
        ],
    },
    {
        "expression": "break down",
        "verb": "break",
        "particle": "down",
        "separable": True,
        "meaning": "to stop working",
        "frequency": 0.88,
        "senses": [
            {"cues": ["car", "bus", "engine", "van", "computer", "machine", "truck"], "meaning": "to stop working"},
            {"cues": ["tears", "crying"], "meaning": "to lose control and start crying"},
            {"cues": ["figures", "costs", "cost", "numbers", "data", "expenses"], "meaning": "to divide something into parts"},
            {"cues": ["talks", "negotiations", "deal", "marriage"], "meaning": "to fail"},
        ],
    },
    {
        "expression": "turn up",
        "verb": "turn",
        "particle": "up",
        "separable": True,
        "meaning": "to arrive, or to increase the level of something",
        "frequency": 0.84,
        "senses": [
            {"cues": ["volume", "music", "heat", "radio", "tv", "oven"], "meaning": "to increase the level of something"},
            {"cues": ["party", "meeting", "office", "late"], "meaning": "to arrive"},
            {"cues": ["keys", "wallet", "missing", "lost"], "meaning": "to be found"},
        ],
    },
    {
        "expression": "turn out",
        "verb": "turn",
        "particle": "out",
        "separable": True,
        "meaning": "to happen in a particular way",
        "frequency": 0.9,
        "senses": [
            {"after": ["that", "well"], "meaning": "to happen with a particular result"},
            {"cues": ["light", "lights", "lamp"], "meaning": "to switch a light off"},
            {"cues": ["crowd", "fans", "voters"], "meaning": "to come to an event"},
        ],
    },
]

IDIOMS = [
    {"expression": "break the ice", "verb": "break", "tail": ["the", "ice"], "meaning": "to make people feel more comfortable", "frequency": 0.9},
    {"expression": "hit the road", "verb": "hit", "tail": ["the", "road"], "meaning": "to start a journey", "frequency": 0.82},
    {"expression": "a piece of cake", "tokens": ["a", "piece", "of", "cake"], "optional": [0], "meaning": "something very easy", "frequency": 0.9},
    {"expression": "once in a blue moon", "tokens": ["once", "in", "a", "blue", "moon"], "meaning": "almost never", "frequency": 0.86},
    {"expression": "under the weather", "tokens": ["under", "the", "weather"], "meaning": "feeling slightly ill", "frequency": 0.8},
    {"expression": "call it a day", "verb": "call", "tail": ["it", "a", "day"], "meaning": "to stop working for the day", "frequency": 0.78},
    {"expression": "get the ball rolling", "verb": "get", "tail": ["the", "ball", "rolling"], "meaning": "to start something", "frequency": 0.76},
    {"expression": "up in the air", "tokens": ["up", "in", "the", "air"], "meaning": "not decided yet", "frequency": 0.74},
]

FIXED_EXPRESSIONS = [
    {"expression": "at the end of the day", "tokens": ["at", "the", "end", "of", "the", "day"], "meaning": "when everything is considered", "frequency": 0.93},
    {"expression": "by the way", "tokens": ["by", "the", "way"], "meaning": "used to add a related remark", "frequency": 0.9},
    {"expression": "as far as I know", "tokens": ["as", "far", "as", ["i", "we", "you", "they"], "know"], "canonicalForm": "as far as I know", "meaning": "based on what I know", "frequency": 0.9},
    {"expression": "in the long run", "tokens": ["in", "the", "long", "run"], "meaning": "over a long period", "frequency": 0.88},
    {"expression": "on the other hand", "tokens": ["on", "the", "other", "hand"], "meaning": "used to introduce a contrasting idea", "frequency": 0.92},
    {"expression": "of course", "tokens": ["of", "course"], "meaning": "yes, certainly", "frequency": 0.7},
    {"expression": "right away", "tokens": ["right", "away"], "meaning": "immediately", "frequency": 0.78},
    {"expression": "in the middle of the night", "tokens": ["in", "the", "middle", "of", "the", "night"], "meaning": "during the night, not in the evening or morning", "frequency": 0.8},
    {"expression": "for the time being", "tokens": ["for", "the", "time", "being"], "meaning": "for now, until later", "frequency": 0.76},
    {"expression": "as a matter of fact", "tokens": ["as", "a", "matter", "of", "fact"], "meaning": "used to add a true and often surprising detail", "frequency": 0.8},
    {"expression": "in other words", "tokens": ["in", "other", "words"], "meaning": "used to say the same thing more clearly", "frequency": 0.82},
    {"expression": "take care", "verb": "take", "tail": ["care"], "meaning": "be careful, often said when leaving", "frequency": 0.7},
    {"expression": "go ahead", "tokens": ["go", "ahead"], "meaning": "to start or to continue", "frequency": 0.72},
]

COLLOCATIONS = [
    {"expression": "stop for the night", "verb": "stop", "tail": ["for", "the", "night"], "meaning": "to stop travelling and stay somewhere until morning", "frequency": 0.8},
    {"expression": "make a decision", "verb": "make", "tail": [["a", "the"], "decision"], "meaning": "to decide", "frequency": 0.84},
    {"expression": "take a break", "verb": "take", "tail": ["a", "break"], "meaning": "to rest for a short time", "frequency": 0.8},
    {"expression": "pay attention", "verb": "pay", "tail": ["attention"], "meaning": "to listen or watch carefully", "frequency": 0.86},
    {"expression": "make sense", "verb": "make", "tail": ["sense"], "meaning": "to be logical or understandable", "frequency": 0.84},
    {"expression": "take place", "verb": "take", "tail": ["place"], "meaning": "to happen", "frequency": 0.8},
]

PATTERNS = [
    {
        "expression": "feel like",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "feel like + V-ing",
        "verb": "feel",
        "tail": ["like"],
        "slot": "ing",
        "meaning": "to want to do something",
        "frequency": 0.97,
    },
    {
        "expression": "look forward to",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "look forward to + noun/V-ing",
        "verb": "look",
        "tail": ["forward", "to"],
        "slot": "ing-or-noun",
        "meaning": "to be excited about something that will happen",
        "frequency": 0.97,
    },
    {
        "expression": "be interested in",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "be interested in + noun/V-ing",
        "tokens": [COPULA, "interested", "in"],
        "optional": [0],
        "slot": "ing-or-noun",
        "keepCopula": True,
        "meaning": "to want to know more about something or to enjoy it",
        "frequency": 0.95,
    },
    {
        "expression": "be used to",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "be used to + noun/V-ing",
        "tokens": [COPULA, "used", "to"],
        "slot": "ing-or-noun",
        "meaning": "to be familiar with something so it seems normal",
        "frequency": 0.95,
    },
    {
        "expression": "get used to",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "be used to + noun/V-ing",
        "verb": "get",
        "tail": ["used", "to"],
        "slot": "ing-or-noun",
        "meaning": "to become familiar with something",
        "frequency": 0.9,
    },
    {
        "expression": "there is no point in",
        "type": "SENTENCE_FRAME",
        "canonicalForm": "there is no point in + V-ing",
        "tokens": ["there", ["is", "was"], "no", "point", "in"],
        "slot": "ing",
        "meaning": "it is useless to do something",
        "frequency": 0.94,
    },
    {
        "expression": "can't help",
        "type": "SENTENCE_FRAME",
        "canonicalForm": "can't help + V-ing",
        "tokens": [["can", "could"], "not", "help"],
        "slot": "ing",
        "meaning": "to be unable to stop yourself doing something",
        "frequency": 0.94,
    },
    {
        "expression": "be good at",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "be good at + noun/V-ing",
        "tokens": [COPULA, "good", "at"],
        "optional": [0],
        "slot": "ing-or-noun",
        "keepCopula": True,
        "meaning": "to do something well",
        "frequency": 0.9,
    },
    {
        "expression": "be tired of",
        "type": "GRAMMATICAL_PATTERN",
        "canonicalForm": "be tired of + noun/V-ing",
        "tokens": [COPULA, "tired", "of"],
        "optional": [0],
        "slot": "ing-or-noun",
        "keepCopula": True,
        "meaning": "to be bored or annoyed by something",
        "frequency": 0.86,
    },
    {
        "expression": "take care of",
        "type": "PHRASAL_VERB",
        "canonicalForm": "take care of",
        "verb": "take",
        "tail": ["care", "of"],
        "slot": "noun",
        "meaning": "to look after someone or something",
        "frequency": 0.93,
    },
    {
        "expression": "it turns out that",
        "type": "LEXICAL_CHUNK",
        "canonicalForm": "it turns out that",
        "verb": "turn",
        "tail": ["out", "that"],
        "prefix": ["it"],
        "meaning": "the unexpected result is",
        "frequency": 0.9,
    },
    {
        "expression": "it's worth",
        "type": "SENTENCE_FRAME",
        "canonicalForm": "it's worth + V-ing",
        "tokens": ["it", ["is", "was"], "worth"],
        "slot": "ing",
        "meaning": "there is a good reason to do something",
        "frequency": 0.88,
    },
]


def _phrasal(verb, particle, meaning, separable=False):
    row = {
        "expression": verb + " " + particle,
        "verb": verb,
        "particle": particle,
        "meaning": meaning,
        "frequency": 0.82,
    }
    if separable:
        row["separable"] = True
    return row


def _idiom(verb, tail, meaning):
    return {
        "expression": verb + " " + " ".join(part if isinstance(part, str) else part[0] for part in tail),
        "verb": verb,
        "tail": tail,
        "meaning": meaning,
        "frequency": 0.8,
    }


def _fixed(expression, meaning):
    return {"expression": expression, "tokens": expression.split(), "meaning": meaning, "frequency": 0.8}


EXTRA_PHRASALS = [
    _phrasal("get", "along", "to have a friendly relationship"),
    _phrasal("get", "away", "to leave or escape"),
    _phrasal("get", "back", "to return"),
    _phrasal("get", "by", "to manage with what you have"),
    _phrasal("get", "in", "to arrive or enter"),
    _phrasal("get", "on", "to board, or to have a good relationship"),
    _phrasal("get", "out", "to leave a place", True),
    _phrasal("get", "together", "to meet"),
    _phrasal("get", "up", "to rise from bed"),
    _phrasal("go", "away", "to leave"),
    _phrasal("go", "back", "to return"),
    _phrasal("go", "on", "to continue"),
    _phrasal("go", "out", "to leave home for a social activity"),
    _phrasal("go", "over", "to review something"),
    _phrasal("go", "through", "to experience something difficult, or to examine something"),
    _phrasal("come", "across", "to find something by chance"),
    _phrasal("come", "along", "to accompany someone, or to progress"),
    _phrasal("come", "in", "to enter"),
    _phrasal("come", "on", "used to urge someone"),
    _phrasal("come", "out", "to become known, or to leave a place"),
    _phrasal("come", "over", "to visit"),
    _phrasal("come", "up", "to arise or be mentioned"),
    _phrasal("look", "for", "to try to find something"),
    _phrasal("look", "into", "to investigate"),
    _phrasal("look", "out", "to be careful"),
    _phrasal("look", "up", "to search for information", True),
    _phrasal("put", "away", "to store something in its place", True),
    _phrasal("put", "down", "to place something on a surface, or to criticize", True),
    _phrasal("put", "off", "to postpone", True),
    _phrasal("put", "on", "to dress in something", True),
    _phrasal("put", "out", "to extinguish, or to publish", True),
    _phrasal("put", "up", "to accommodate someone, or to raise something", True),
    _phrasal("take", "after", "to resemble a relative"),
    _phrasal("take", "back", "to return something, or to withdraw a statement", True),
    _phrasal("take", "on", "to accept work or responsibility"),
    _phrasal("take", "out", "to remove something, or to go somewhere with someone", True),
    _phrasal("take", "over", "to assume control"),
    _phrasal("take", "up", "to start a hobby or to occupy space"),
    _phrasal("make", "up", "to invent, or to become friends again", True),
    _phrasal("make", "out", "to manage to see or understand", True),
    _phrasal("turn", "around", "to face the other way, or to improve a bad situation"),
    _phrasal("turn", "down", "to refuse, or to lower the level", True),
    _phrasal("turn", "on", "to start a machine", True),
    _phrasal("turn", "back", "to return the way you came"),
    _phrasal("bring", "back", "to return something", True),
    _phrasal("bring", "up", "to mention a subject, or to raise a child", True),
    _phrasal("carry", "out", "to do a plan or an order"),
    _phrasal("catch", "up", "to reach someone ahead"),
    _phrasal("catch", "on", "to understand"),
    _phrasal("cut", "down", "to reduce"),
    _phrasal("cut", "off", "to stop a supply or interrupt", True),
    _phrasal("drop", "off", "to deliver someone or something", True),
    _phrasal("drop", "by", "to visit briefly"),
    _phrasal("drop", "out", "to quit a course or activity"),
    _phrasal("fall", "apart", "to break into pieces, or to stop coping"),
    _phrasal("fall", "behind", "to fail to keep up"),
    _phrasal("fall", "out", "to quarrel"),
    _phrasal("fill", "in", "to complete a form, or to substitute", True),
    _phrasal("fill", "out", "to complete a form", True),
    _phrasal("hand", "in", "to submit work", True),
    _phrasal("hand", "out", "to distribute", True),
    _phrasal("hand", "over", "to give control or an object to someone"),
    _phrasal("hold", "on", "to wait"),
    _phrasal("hold", "back", "to hesitate or restrain something", True),
    _phrasal("hold", "up", "to delay, or to rob"),
    _phrasal("keep", "on", "to continue"),
    _phrasal("keep", "up", "to continue at the same level"),
    _phrasal("let", "down", "to disappoint", True),
    _phrasal("let", "in", "to allow someone to enter", True),
    _phrasal("pass", "away", "to die"),
    _phrasal("pass", "out", "to faint"),
    _phrasal("pay", "back", "to repay money", True),
    _phrasal("pay", "off", "to finish paying a debt, or to succeed"),
    _phrasal("run", "away", "to escape"),
    _phrasal("run", "out", "to have none left"),
    _phrasal("run", "over", "to hit someone with a vehicle"),
    _phrasal("set", "off", "to start a journey, or to cause something to start"),
    _phrasal("set", "out", "to start a journey or a task"),
    _phrasal("show", "off", "to boast"),
    _phrasal("slow", "down", "to go more slowly"),
    _phrasal("sort", "out", "to organize or solve", True),
    _phrasal("stand", "up", "to rise to your feet"),
    _phrasal("stand", "out", "to be noticeable"),
    _phrasal("stand", "for", "to represent, or to tolerate"),
    _phrasal("stick", "to", "to continue with a choice"),
    _phrasal("throw", "away", "to discard", True),
    _phrasal("throw", "up", "to vomit"),
    _phrasal("try", "on", "to put on clothes to see if they fit", True),
    _phrasal("try", "out", "to test something", True),
    _phrasal("write", "down", "to record in writing", True),
    _phrasal("calm", "down", "to become less angry or excited"),
    _phrasal("cheer", "up", "to become happier"),
    _phrasal("clean", "up", "to make a place tidy", True),
    _phrasal("dress", "up", "to wear special clothes"),
    _phrasal("grow", "up", "to become an adult"),
    _phrasal("hang", "up", "to end a phone call", True),
    _phrasal("hang", "on", "to wait"),
    _phrasal("hang", "out", "to spend time relaxing"),
    _phrasal("hurry", "up", "to go faster"),
    _phrasal("lie", "down", "to rest flat"),
    _phrasal("move", "on", "to start doing something new"),
    _phrasal("move", "in", "to start living in a place"),
    _phrasal("move", "out", "to stop living in a place"),
    _phrasal("settle", "down", "to become calmer, or to start a quiet life"),
    _phrasal("shut", "up", "to stop talking"),
    _phrasal("sit", "down", "to take a seat"),
    _phrasal("speak", "up", "to talk louder"),
    _phrasal("stay", "up", "to not go to bed"),
    _phrasal("stay", "in", "to remain at home"),
    _phrasal("stay", "out", "to remain away from home"),
    _phrasal("think", "over", "to consider carefully", True),
    _phrasal("walk", "away", "to leave a situation"),
    _phrasal("walk", "out", "to leave angrily"),
    _phrasal("wear", "out", "to become damaged from use, or to exhaust someone"),
    _phrasal("call", "off", "to cancel", True),
    _phrasal("call", "back", "to phone again", True),
    _phrasal("give", "back", "to return something", True),
    _phrasal("give", "away", "to give something for free, or to reveal a secret", True),
    _phrasal("give", "in", "to stop resisting"),
    _phrasal("work", "on", "to spend time trying to improve or finish something"),
    _phrasal("ask", "for", "to request"),
    _phrasal("deal", "with", "to handle a problem or a person"),
    _phrasal("rely", "on", "to depend on someone or something"),
    _phrasal("wait", "for", "to stay until something happens"),
    _phrasal("hear", "from", "to receive news from someone"),
    _phrasal("hear", "of", "to know that someone or something exists"),
    _phrasal("listen", "to", "to pay attention to a sound or a person"),
    _phrasal("look", "around", "to examine a place"),
]


EXTRA_IDIOMS = [
    _idiom("bite", ["the", "bullet"], "to face something unpleasant with courage"),
    _idiom("cost", ["an", "arm", "and", "a", "leg"], "to be very expensive"),
    _idiom("hit", ["the", "nail", "on", "the", "head"], "to describe something exactly"),
    _idiom("let", ["the", "cat", "out", "of", "the", "bag"], "to reveal a secret"),
    _idiom("spill", ["the", "beans"], "to reveal a secret"),
    _idiom("see", ["eye", "to", "eye"], "to agree"),
    _idiom("get", ["out", "of", "hand"], "to become impossible to control"),
    _idiom("cut", ["to", "the", "chase"], "to get to the important point"),
    _idiom("beat", ["around", "the", "bush"], "to avoid saying something directly"),
    _idiom("speak", ["of", "the", "devil"], "said when the person you were discussing appears"),
    _idiom("make", ["a", "long", "story", "short"], "to tell only the main point"),
    _idiom("play", ["it", "by", "ear"], "to decide as you go, without a fixed plan"),
    _idiom("break", ["a", "leg"], "used to wish someone luck"),
    _idiom("burn", ["the", "midnight", "oil"], "to work late into the night"),
    _fixed("easier said than done", "sounds simple but is hard to do"),
    _fixed("once in a lifetime", "extremely rare"),
    _fixed("the last straw", "the final problem that makes you lose patience"),
    _fixed("down to earth", "practical and unpretentious"),
    _fixed("every now and then", "occasionally"),
    _fixed("on thin ice", "in a risky situation"),
    _fixed("through thick and thin", "in good times and bad times"),
    _fixed("the best of both worlds", "the advantages of two different things"),
    _fixed("when pigs fly", "never"),
    _fixed("better late than never", "late is still better than not at all"),
    _fixed("a blessing in disguise", "a problem that turns out to be useful"),
    _fixed("back to square one", "back to the start"),
    _fixed("out of the blue", "unexpectedly"),
    _fixed("rule of thumb", "a practical rough guide"),
    _fixed("actions speak louder than words", "what people do matters more than what they say"),
    _fixed("curiosity killed the cat", "being too curious can cause trouble"),
]


EXTRA_FIXED = [
    _fixed("as soon as", "immediately after"),
    _fixed("in spite of", "without being stopped by"),
    _fixed("according to", "as stated by"),
    _fixed("instead of", "in place of"),
    _fixed("in order to", "for the purpose of"),
    _fixed("at first", "in the beginning"),
    _fixed("at least", "not less than, or as a minimum comfort"),
    _fixed("at once", "immediately"),
    _fixed("for instance", "as an example"),
    _fixed("for example", "as an example"),
    _fixed("in fact", "used to give the real situation"),
    _fixed("in general", "usually, as a whole"),
    _fixed("on purpose", "deliberately"),
    _fixed("on time", "at the planned time"),
    _fixed("in time", "early enough"),
    _fixed("all of a sudden", "suddenly"),
    _fixed("as a result", "because of that"),
    _fixed("on the one hand", "used to introduce one side of a contrast"),
    _fixed("in the meantime", "until something else happens"),
    _fixed("by accident", "without intending to"),
    _fixed("by mistake", "accidentally and wrongly"),
    _fixed("on the whole", "considering everything"),
    _fixed("from time to time", "occasionally"),
    _fixed("in the nick of time", "just soon enough"),
]


EXTRA_COLLOCATIONS = [
    _idiom("make", ["a", "mistake"], "to do something wrong"),
    _idiom("make", ["progress"], "to improve or move forward"),
    _idiom("make", ["money"], "to earn money"),
    _idiom("make", ["friends"], "to form friendships"),
    _idiom("make", ["an", "effort"], "to try hard"),
    _idiom("take", ["part"], "to participate"),
    _idiom("take", ["a", "chance"], "to risk trying something"),
    _idiom("take", ["advantage"], "to use an opportunity, sometimes unfairly"),
    _idiom("pay", ["a", "visit"], "to visit"),
    _idiom("catch", ["a", "cold"], "to become ill with a cold"),
    _idiom("keep", ["a", "secret"], "to not tell a secret"),
    _idiom("tell", ["the", "truth"], "to say what is true"),
    _idiom("keep", ["in", "mind"], "to remember"),
    _idiom("bear", ["in", "mind"], "to remember"),
    _idiom("make", [["up"], ["your", "his", "her", "my", "their"], "mind"], "to decide"),
]


EXTRA_PATTERNS = [
    {"expression": "be afraid of", "canonicalForm": "be afraid of + noun/V-ing", "tokens": [COPULA, "afraid", "of"], "optional": [0], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to fear something", "frequency": 0.9},
    {"expression": "be proud of", "canonicalForm": "be proud of + noun/V-ing", "tokens": [COPULA, "proud", "of"], "optional": [0], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to feel pleased about something you did", "frequency": 0.86},
    {"expression": "be aware of", "canonicalForm": "be aware of + noun/V-ing", "tokens": [COPULA, "aware", "of"], "optional": [0], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to know about something", "frequency": 0.86},
    {"expression": "be capable of", "canonicalForm": "be capable of + noun/V-ing", "tokens": [COPULA, "capable", "of"], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to be able to do something", "frequency": 0.84},
    {"expression": "be responsible for", "canonicalForm": "be responsible for + noun/V-ing", "tokens": [COPULA, "responsible", "for"], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to have the duty for something", "frequency": 0.86},
    {"expression": "be famous for", "canonicalForm": "be famous for + noun/V-ing", "tokens": [COPULA, "famous", "for"], "slot": "ing-or-noun", "keepCopula": True, "meaning": "to be well known because of something", "frequency": 0.82},
    {"expression": "be similar to", "canonicalForm": "be similar to + noun", "tokens": [COPULA, "similar", "to"], "slot": "noun", "keepCopula": True, "meaning": "to be almost the same as something", "frequency": 0.82},
    {"expression": "be different from", "canonicalForm": "be different from + noun", "tokens": [COPULA, "different", "from"], "slot": "noun", "keepCopula": True, "meaning": "to be not the same as something", "frequency": 0.82},
    {"expression": "be about to", "canonicalForm": "be about to + verb", "tokens": [COPULA, "about", "to"], "keepCopula": True, "meaning": "to be going to do something very soon", "frequency": 0.88},
    {"expression": "be supposed to", "canonicalForm": "be supposed to + verb", "tokens": [COPULA, "supposed", "to"], "keepCopula": True, "meaning": "to be expected or required to do something", "frequency": 0.9},
    {"expression": "would rather", "canonicalForm": "would rather + verb", "tokens": ["would", "rather"], "meaning": "to prefer one action", "frequency": 0.86},
    {"expression": "had better", "canonicalForm": "had better + verb", "tokens": ["had", "better"], "meaning": "ought to do something", "frequency": 0.84},
    {"expression": "get rid of", "canonicalForm": "get rid of + noun", "verb": "get", "tail": ["rid", "of"], "slot": "noun", "meaning": "to remove something you do not want", "frequency": 0.88},
    {"expression": "depend on", "canonicalForm": "depend on + noun/V-ing", "verb": "depend", "tail": ["on"], "slot": "ing-or-noun", "meaning": "to be affected by something, or to rely on it", "frequency": 0.86},
    {"expression": "insist on", "canonicalForm": "insist on + noun/V-ing", "verb": "insist", "tail": ["on"], "slot": "ing-or-noun", "meaning": "to demand something and refuse to change", "frequency": 0.84},
    {"expression": "succeed in", "canonicalForm": "succeed in + noun/V-ing", "verb": "succeed", "tail": ["in"], "slot": "ing-or-noun", "meaning": "to manage to do something", "frequency": 0.84},
    {"expression": "apologize for", "canonicalForm": "apologize for + noun/V-ing", "verb": "apologize", "tail": ["for"], "slot": "ing-or-noun", "meaning": "to say sorry for something", "frequency": 0.84},
    {"expression": "look up to", "canonicalForm": "look up to + noun", "verb": "look", "tail": ["up", "to"], "slot": "noun", "meaning": "to admire someone", "frequency": 0.84},
]


def _as_set(part, verb=None):
    if part == "" or part is None:
        return {""}
    if isinstance(part, (list, tuple)):
        return {item for item in part}
    if part == "{verb}" and verb:
        return verb_forms(verb)
    return {part}


def _token_sets(entry):
    if entry.get("tokens"):
        return [_as_set(part) for part in entry["tokens"]]
    sets = []
    if entry.get("prefix"):
        sets.extend([{part} for part in entry["prefix"]])
    if entry.get("verb"):
        sets.append(verb_forms(entry["verb"]))
    tail = entry.get("tail")
    if tail is None and entry.get("particle"):
        tail = [entry["particle"]]
    for part in tail or []:
        sets.append(_as_set(part))
    return sets


def compiled():
    groups = (
        ("PHRASAL_VERB", PHRASAL_VERBS + EXTRA_PHRASALS),
        ("IDIOM", IDIOMS + EXTRA_IDIOMS),
        ("FIXED_EXPRESSION", FIXED_EXPRESSIONS + EXTRA_FIXED),
        ("COLLOCATION", COLLOCATIONS + EXTRA_COLLOCATIONS),
        ("GRAMMATICAL_PATTERN", PATTERNS + EXTRA_PATTERNS),
    )
    rows = []
    for default_type, group in groups:
        for entry in group:
            kind = entry.get("type", default_type)
            rows.append({
                "expression": entry["expression"],
                "type": kind,
                "canonicalForm": entry.get("canonicalForm", entry["expression"]),
                "meaning": entry["meaning"],
                "frequency": entry.get("frequency", 0.75),
                "tokens": _token_sets(entry),
                "optional": set(entry.get("optional") or []),
                "slotOptional": bool(entry.get("slotOptional")),
                "separable": bool(entry.get("separable")),
                "particle": entry.get("particle"),
                "slot": entry.get("slot"),
                "keepCopula": bool(entry.get("keepCopula")),
                "senses": entry.get("senses") or [],
                "patterns": entry.get("patterns") or [entry.get("canonicalForm", entry["expression"])],
            })
    return rows
