IRREGULAR = {
    "be": {"s": "is", "past": "was", "pp": "been", "ing": "being"},
    "begin": {"past": "began", "pp": "begun"},
    "build": {"past": "built", "pp": "built"},
    "catch": {"past": "caught", "pp": "caught"},
    "cost": {"past": "cost", "pp": "cost"},
    "cut": {"past": "cut", "pp": "cut"},
    "deal": {"past": "dealt", "pp": "dealt"},
    "draw": {"past": "drew", "pp": "drawn"},
    "drink": {"past": "drank", "pp": "drunk"},
    "drive": {"past": "drove", "pp": "driven"},
    "eat": {"past": "ate", "pp": "eaten"},
    "feed": {"past": "fed", "pp": "fed"},
    "fight": {"past": "fought", "pp": "fought"},
    "grow": {"past": "grew", "pp": "grown"},
    "hang": {"past": "hung", "pp": "hung"},
    "hear": {"past": "heard", "pp": "heard"},
    "know": {"past": "knew", "pp": "known"},
    "lead": {"past": "led", "pp": "led"},
    "let": {"past": "let", "pp": "let"},
    "lie": {"past": "lay", "pp": "lain"},
    "lose": {"past": "lost", "pp": "lost"},
    "meet": {"past": "met", "pp": "met"},
    "read": {"past": "read", "pp": "read"},
    "rise": {"past": "rose", "pp": "risen"},
    "sell": {"past": "sold", "pp": "sold"},
    "send": {"past": "sent", "pp": "sent"},
    "shoot": {"past": "shot", "pp": "shot"},
    "shut": {"past": "shut", "pp": "shut"},
    "sing": {"past": "sang", "pp": "sung"},
    "sit": {"past": "sat", "pp": "sat", "ing": "sitting"},
    "sleep": {"past": "slept", "pp": "slept"},
    "speak": {"past": "spoke", "pp": "spoken"},
    "stand": {"past": "stood", "pp": "stood"},
    "stick": {"past": "stuck", "pp": "stuck"},
    "teach": {"past": "taught", "pp": "taught"},
    "throw": {"past": "threw", "pp": "thrown"},
    "understand": {"past": "understood", "pp": "understood"},
    "wear": {"past": "wore", "pp": "worn"},
    "win": {"past": "won", "pp": "won"},
    "break": {"past": "broke", "pp": "broken"},
    "bring": {"past": "brought", "pp": "brought"},
    "buy": {"past": "bought", "pp": "bought"},
    "come": {"past": "came", "pp": "come"},
    "do": {"s": "does", "past": "did", "pp": "done"},
    "fall": {"past": "fell", "pp": "fallen"},
    "feel": {"past": "felt", "pp": "felt"},
    "find": {"past": "found", "pp": "found"},
    "get": {"past": "got", "pp": "gotten"},
    "give": {"past": "gave", "pp": "given"},
    "go": {"s": "goes", "past": "went", "pp": "gone"},
    "have": {"s": "has", "past": "had", "pp": "had"},
    "hold": {"past": "held", "pp": "held"},
    "keep": {"past": "kept", "pp": "kept"},
    "leave": {"past": "left", "pp": "left"},
    "make": {"past": "made", "pp": "made"},
    "mean": {"past": "meant", "pp": "meant"},
    "pay": {"past": "paid", "pp": "paid"},
    "put": {"past": "put", "pp": "put"},
    "run": {"past": "ran", "pp": "run"},
    "say": {"s": "says", "past": "said", "pp": "said"},
    "see": {"past": "saw", "pp": "seen"},
    "set": {"past": "set", "pp": "set"},
    "show": {"pp": "shown"},
    "spend": {"past": "spent", "pp": "spent"},
    "take": {"past": "took", "pp": "taken"},
    "tell": {"past": "told", "pp": "told"},
    "think": {"past": "thought", "pp": "thought"},
    "wake": {"past": "woke", "pp": "woken"},
    "write": {"past": "wrote", "pp": "written"},
}


def _double(lemma):
    if len(lemma) < 3:
        return False
    return lemma[-1] not in "aeiouwxy" and lemma[-2] in "aeiou" and lemma[-3] not in "aeiou"


def ing_form(lemma):
    extra = IRREGULAR.get(lemma, {})
    if extra.get("ing"):
        return extra["ing"]
    if lemma.endswith("ie"):
        return lemma[:-2] + "ying"
    if lemma.endswith("e") and not lemma.endswith("ee"):
        return lemma[:-1] + "ing"
    if _double(lemma):
        return lemma + lemma[-1] + "ing"
    return lemma + "ing"


def ed_form(lemma):
    extra = IRREGULAR.get(lemma, {})
    if extra.get("past"):
        return extra["past"]
    if lemma.endswith("e"):
        return lemma + "d"
    if lemma.endswith("y") and lemma[-2] not in "aeiou":
        return lemma[:-1] + "ied"
    if _double(lemma):
        return lemma + lemma[-1] + "ed"
    return lemma + "ed"


def s_form(lemma):
    extra = IRREGULAR.get(lemma, {})
    if extra.get("s"):
        return extra["s"]
    if lemma.endswith(("s", "x", "z", "ch", "sh", "o")):
        return lemma + "es"
    if lemma.endswith("y") and lemma[-2] not in "aeiou":
        return lemma[:-1] + "ies"
    return lemma + "s"


def pp_form(lemma):
    extra = IRREGULAR.get(lemma, {})
    if extra.get("pp"):
        return extra["pp"]
    return ed_form(lemma)


def verb_forms(lemma):
    forms = {lemma, s_form(lemma), ed_form(lemma), pp_form(lemma), ing_form(lemma)}
    extra = IRREGULAR.get(lemma, {})
    if lemma == "get":
        forms.add("got")
    if extra.get("past"):
        forms.add(extra["past"])
    return forms
