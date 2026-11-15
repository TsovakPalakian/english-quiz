import os
import json
import zipfile
import xml.etree.ElementTree as ET

root_a1 = "/Users/tsovakpalakian/Education/English/Speakout 3rd Edition (2022)/Speakout 3rd Edition A1"
wordlist_path = os.path.join(root_a1, "Speakout 3rd A1 Wordlist.xlsx")

# 1. Parse Excel Vocabulary for 1A, 1B, 1C, 1D, 2A, 2B
vocab_1a = []
vocab_1b = []
vocab_1c = []
vocab_1d = []
vocab_2a = []
vocab_2b = []

if os.path.exists(wordlist_path):
    with zipfile.ZipFile(wordlist_path) as z:
        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for elem in tree.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                shared_strings.append("".join(elem.itertext()))
        
        # Unit 1 Sheet (sheet2.xml)
        sheet = ET.fromstring(z.read("xl/worksheets/sheet2.xml"))
        for row in sheet.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")[1:]:
            r_vals = []
            for c in row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                t = c.get("t")
                v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                val = v.text if v is not None else ""
                if t == "s" and val.isdigit() and int(val) < len(shared_strings):
                    val = shared_strings[int(val)]
                r_vals.append(val)
            
            if not r_vals or not r_vals[0]:
                continue
            
            word = r_vals[0].strip()
            row_str = " | ".join(r_vals).lower()
            
            # Check 1A
            is_greetings = any("hello and goodbye" in str(x).lower() or x == "1A" for x in r_vals)
            is_countries = any("countries and nationalities" in str(x).lower() or "125" in str(x) or "1A VB" in str(x) for x in r_vals)
            
            if is_greetings or is_countries:
                pos = r_vals[1] if len(r_vals) > 1 else ""
                ipa = r_vals[2] if len(r_vals) > 2 else ""
                topic = "Greetings & Goodbyes" if is_greetings else "Countries & Nationalities"
                defn = ""
                ex = ""
                for cell in r_vals[3:]:
                    if len(cell) > 15 and not defn and not cell.startswith("http"):
                        defn = cell
                    elif len(cell) > 10 and defn and not ex:
                        ex = cell
                vocab_1a.append({
                    "word": word,
                    "pos": pos,
                    "ipa": ipa,
                    "topic": topic,
                    "definition": defn,
                    "example": ex
                })

            # Check 1B (Jobs)
            is_jobs = any("1b" in str(x).lower() or "126" in str(x) for x in r_vals) and not any(k in row_str for k in ["common objects", "umbrella", "mobile phone", "bag", "banana"])
            if is_jobs:
                pos = r_vals[1] if len(r_vals) > 1 else ""
                ipa = r_vals[2] if len(r_vals) > 2 else ""
                defn = r_vals[3] if len(r_vals) > 3 else ""
                ex = r_vals[4] if len(r_vals) > 4 else ""
                vocab_1b.append({
                    "word": word,
                    "pos": pos,
                    "ipa": ipa,
                    "topic": "Jobs",
                    "definition": defn,
                    "example": ex
                })

            # Check 1C (Alphabet & Checking in)
            is_1c = any("1c" in str(x).lower() for x in r_vals) or any(k in row_str for k in ["surname", "first name", "phone number", "spell", "repeat"])
            if is_1c:
                pos = r_vals[1] if len(r_vals) > 1 else ""
                ipa = r_vals[2] if len(r_vals) > 2 else ""
                defn = r_vals[3] if len(r_vals) > 3 else ""
                ex = r_vals[4] if len(r_vals) > 4 else ""
                vocab_1c.append({
                    "word": word,
                    "pos": pos,
                    "ipa": ipa,
                    "topic": "The Alphabet & Checking in",
                    "definition": defn,
                    "example": ex
                })

            # Check 1D (Common objects)
            is_common_objects = any("common objects" in str(x).lower() or "1d" in str(x).lower() or "127" in str(x) for x in r_vals)
            if is_common_objects:
                pos = r_vals[1] if len(r_vals) > 1 else ""
                ipa = r_vals[2] if len(r_vals) > 2 else ""
                defn = r_vals[3] if len(r_vals) > 3 else ""
                ex = r_vals[4] if len(r_vals) > 4 else ""
                vocab_1d.append({
                    "word": word,
                    "pos": pos,
                    "ipa": ipa,
                    "topic": "Common Objects",
                    "definition": defn,
                    "example": ex
                })

        # Unit 2 Sheet (sheet3.xml) for Lesson 2A
        if "xl/worksheets/sheet3.xml" in z.namelist():
            sheet3 = ET.fromstring(z.read("xl/worksheets/sheet3.xml"))
            for row in sheet3.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row")[1:]:
                r_vals = []
                for c in row.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                    t = c.get("t")
                    v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                    val = v.text if v is not None else ""
                    if t == "s" and val.isdigit() and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    r_vals.append(val)
                
                if not r_vals or not r_vals[0]:
                    continue
                
                word = r_vals[0].strip()
                row_str = " | ".join(r_vals)
                if "2A" in row_str or "2A VB" in row_str:
                    pos = r_vals[1] if len(r_vals) > 1 else ""
                    ipa = r_vals[2] if len(r_vals) > 2 else ""
                    topic = "Numbers 11-100" if pos == "number" else "Common Adjectives"
                    defn = ""
                    ex = ""
                    if len(r_vals) > 4 and len(r_vals[4]) > 5:
                        defn = r_vals[4]
                    elif len(r_vals) > 3 and len(r_vals[3]) > 5:
                        defn = r_vals[3]
                    if len(r_vals) > 5 and len(r_vals[5]) > 5:
                        ex = r_vals[5]
                    
                    vocab_2a.append({
                        "word": word,
                        "pos": pos,
                        "ipa": ipa,
                        "topic": topic,
                        "definition": defn or f"{pos} {word}",
                        "example": ex
                    })

                if "2B" in row_str or "2B VB" in row_str:
                    pos = r_vals[1] if len(r_vals) > 1 else ""
                    ipa = r_vals[2] if len(r_vals) > 2 else ""
                    topic = "Family" if word in ["brother", "children", "daughter", "father", "husband", "mother", "parents", "sister", "son", "wife"] else "People & Friends"
                    defn = ""
                    ex = ""
                    if len(r_vals) > 4 and len(r_vals[4]) > 5:
                        defn = r_vals[4]
                    elif len(r_vals) > 3 and len(r_vals[3]) > 5:
                        defn = r_vals[3]
                    if len(r_vals) > 5 and len(r_vals[5]) > 5:
                        ex = r_vals[5]
                    
                    vocab_2b.append({
                        "word": word,
                        "pos": pos,
                        "ipa": ipa,
                        "topic": topic,
                        "definition": defn or f"{pos} {word}",
                        "example": ex
                    })

# 2. Base paths
class_audio_dir = os.path.join(root_a1, "Speakout 3rd Edition A1 Class Audio")
wb_audio_dir = os.path.join(root_a1, "Speakout 3rd Edition A1 Workbook Audio")
videos_dir = os.path.join(root_a1, "Speakout 3rd Edition A1 Videos")

# 3. Lesson 1A Audio
class_audio_1a = [
    {
        "id": "1.01",
        "title": "Lesson 1A Exercise 1A & 1B",
        "filename": "009_SO3_A1_SB_1A_Audio_1_01.mp3",
        "path": os.path.join(class_audio_dir, "009_SO3_A1_SB_1A_Audio_1_01.mp3")
    },
    {
        "id": "1.02",
        "title": "Lesson 1A Exercise 2A",
        "filename": "010_SO3_A1_SB_1A_Audio_1_02.mp3",
        "path": os.path.join(class_audio_dir, "010_SO3_A1_SB_1A_Audio_1_02.mp3")
    },
    {
        "id": "1.03",
        "title": "Lesson 1A Exercise 2C",
        "filename": "011_SO3_A1_SB_1A_Audio_1_03.mp3",
        "path": os.path.join(class_audio_dir, "011_SO3_A1_SB_1A_Audio_1_03.mp3")
    },
    {
        "id": "VB1.01",
        "title": "Vocabulary Bank 1A Countries and Nationalities",
        "filename": "018_SO3_A1_SB_1A_Audio_VB1_01.mp3",
        "path": os.path.join(class_audio_dir, "018_SO3_A1_SB_1A_Audio_VB1_01.mp3")
    }
]

wb_audio_1a = [
    {
        "id": "WB1.01",
        "title": "Workbook 1A Exercise 1",
        "filename": "SO3_A1_WB_1A_Audio_1_01.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1A_Audio_1_01.mp3")
    },
    {
        "id": "WB1.02",
        "title": "Workbook 1A Exercise 2",
        "filename": "SO3_A1_WB_1A_Audio_1_02.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1A_Audio_1_02.mp3")
    },
    {
        "id": "WB1.03",
        "title": "Workbook 1A Exercise 3",
        "filename": "SO3_A1_WB_1A_Audio_1_03.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1A_Audio_1_03.mp3")
    },
    {
        "id": "WB1.04",
        "title": "Workbook 1A Exercise 4",
        "filename": "SO3_A1_WB_1A_Audio_1_04.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1A_Audio_1_04.mp3")
    }
]

# 4. Lesson 1B Audio and Data
class_audio_1b = [
    {
        "id": "1.04",
        "title": "Lesson 1B Pronunciation: Word stress in jobs",
        "filename": "012_SO3_A1_SB_1B_Audio_1_04.mp3",
        "path": os.path.join(class_audio_dir, "012_SO3_A1_SB_1B_Audio_1_04.mp3")
    },
    {
        "id": "1.0X",
        "title": "Lesson 1B Grammar: be (he, she, it)",
        "filename": "013_SO3_A1_SB_1B_Audio_1_0X.mp3",
        "path": os.path.join(class_audio_dir, "013_SO3_A1_SB_1B_Audio_1_0X.mp3")
    },
    {
        "id": "VB1.02",
        "title": "Vocabulary Bank 1B Jobs Part 1",
        "filename": "019_SO3_A1_SB_1B_Audio_VB1_02.mp3",
        "path": os.path.join(class_audio_dir, "019_SO3_A1_SB_1B_Audio_VB1_02.mp3")
    },
    {
        "id": "VB1.03",
        "title": "Vocabulary Bank 1B Jobs Part 2",
        "filename": "020_SO3_A1_SB_1B_Audio_VB1_03.mp3",
        "path": os.path.join(class_audio_dir, "020_SO3_A1_SB_1B_Audio_VB1_03.mp3")
    }
]

wb_audio_1b = [
    {
        "id": "WB1.05",
        "title": "Workbook 1B Listening: Two Jobs",
        "filename": "SO3_A1_WB_1B_Audio_1_05.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1B_Audio_1_05.mp3")
    }
]

reading_1b = [
    {
        "name": "Carol Harris",
        "jobWeek": "doctor",
        "jobWeekend": "singer",
        "happy": "yes",
        "text": "Carol Harris is a doctor from London. In the week, she works at a hospital. At the weekend, she is a singer in a band. Is she happy? Yes, she is!"
    },
    {
        "name": "Silvio Rossi",
        "jobWeek": "taxi driver",
        "jobWeekend": "waiter",
        "happy": "yes",
        "text": "Silvio Rossi is from Rome. In the week, he is a taxi driver in the city. At the weekend, he is a waiter in an Italian restaurant. He loves food and people. Is he happy? Yes, he is!"
    }
]

exercises_1b = [
    {
        "id": "ex1b_jobs_articles",
        "section": "Vocabulary: Jobs & Articles a/an",
        "type": "matching",
        "instruction": "Select the correct article (a / an) for each job.",
        "pairs": [
            {"job": "doctor", "article": "a"},
            {"job": "actor", "article": "an"},
            {"job": "artist", "article": "an"},
            {"job": "nurse", "article": "a"},
            {"job": "office worker", "article": "an"},
            {"job": "police officer", "article": "a"}
        ]
    },
    {
        "id": "ex1b_reading_profiles",
        "section": "Reading: Two Jobs Profiles",
        "type": "fill_in_blank",
        "instruction": "Read the profiles of Carol and Silvio and complete their jobs.",
        "questions": [
            {"id": "rp1", "prompt": "Carol Harris (in the week):", "answer": "doctor"},
            {"id": "rp2", "prompt": "Carol Harris (at the weekend):", "answer": "singer"},
            {"id": "rp3", "prompt": "Silvio Rossi (in the week):", "answer": "taxi driver"},
            {"id": "rp4", "prompt": "Silvio Rossi (at the weekend):", "answer": "waiter"}
        ]
    },
    {
        "id": "ex1b_grammar_be",
        "section": "Grammar Focus: Verb be (he, she, it)",
        "type": "fill_in_blank",
        "instruction": "Complete the sentences with is, isn't, or Is.",
        "questions": [
            {"id": "g1", "text": "1. Carol _____ a doctor from London.", "answer": "is"},
            {"id": "g2", "text": "2. She _____ a teacher in the week.", "answer": "isn't"},
            {"id": "g3", "text": "3. _____ Silvio from Rome? Yes, he is.", "answer": "Is"},
            {"id": "g4", "text": "4. He _____ a waiter at the weekend.", "answer": "is"},
            {"id": "g5", "text": "5. _____ it an Italian restaurant? Yes, it is.", "answer": "Is"}
        ]
    }
]

answer_keys_1b = {
    "studentBook": {
        "vocab1B": "1 A, 2 E, 3 D, 4 C, 5 B. ('teacher' is not in the photos.)",
        "stress": "1 a doctor, 2 a teacher, 3 a waiter, 4 a taxi driver, 5 a singer",
        "reading4B": "Carol: doctor, singer, yes. Silvio: taxi driver, waiter, yes.",
        "grammar5A": "2 is, 3 isn't, is, 4 is, 5 Is",
        "grammarBank1": "2 It's, 3 He's, 4 isn't, 5 Is she, 6 Yes, she is."
    },
    "workbook": {
        "ex1A": "1 actor, 2 nurse, 3 police officer, 4 shop assistant, 5 office worker, 6 digital designer",
        "ex2A": "1 is, 2 isn't, 3 Is, 4 is, 5 isn't"
    }
}

# 5. Lesson 1C Audio and Data
class_audio_1c = [
    {
        "id": "1.05",
        "title": "Lesson 1C Initialisms (BBC, EU, OK, UK, USA, www)",
        "filename": "014_SO3_A1_SB_1C_Audio_1_05.mp3",
        "path": os.path.join(class_audio_dir, "014_SO3_A1_SB_1C_Audio_1_05.mp3")
    },
    {
        "id": "1.06",
        "title": "Lesson 1C Alphabet Phonemic Sound Groups",
        "filename": "015_SO3_A1_SB_1C_Audio_1_06.mp3",
        "path": os.path.join(class_audio_dir, "015_SO3_A1_SB_1C_Audio_1_06.mp3")
    },
    {
        "id": "1.07",
        "title": "Lesson 1C Hotel Registration Conversations 1–3",
        "filename": "016_SO3_A1_SB_1C_Audio_1_07.mp3",
        "path": os.path.join(class_audio_dir, "016_SO3_A1_SB_1C_Audio_1_07.mp3")
    },
    {
        "id": "1.08",
        "title": "Lesson 1C How to ask and answer simple questions",
        "filename": "017_SO3_A1_SB_1C_Audio_1_08.mp3",
        "path": os.path.join(class_audio_dir, "017_SO3_A1_SB_1C_Audio_1_08.mp3")
    }
]

wb_audio_1c = [
    {
        "id": f"WB1.{i:02d}",
        "title": f"Workbook 1C Audio 1.{i:02d}",
        "filename": f"SO3_A1_WB_1C_Audio_1_{i:02d}.mp3",
        "path": os.path.join(wb_audio_dir, f"SO3_A1_WB_1C_Audio_1_{i:02d}.mp3")
    }
    for i in range(6, 12)
]

alphabet_sound_groups_1c = [
    {"sound": "/eɪ/", "anchor": "name", "letters": ["A", "H", "J", "K"]},
    {"sound": "/iː/", "anchor": "three", "letters": ["B", "C", "D", "E", "G", "P", "T", "V"]},
    {"sound": "/e/", "anchor": "ten", "letters": ["F", "L", "M", "N", "S", "X", "Z"]},
    {"sound": "/aɪ/", "anchor": "nine", "letters": ["I", "Y"]},
    {"sound": "/əʊ/", "anchor": "no", "letters": ["O"]},
    {"sound": "/uː/", "anchor": "you", "letters": ["Q", "U", "W"]},
    {"sound": "/ɑː/", "anchor": "car", "letters": ["R"]}
]

initialisms_1c = [
    {"code": "BBC", "full": "British Broadcasting Corporation"},
    {"code": "EU", "full": "European Union"},
    {"code": "OK", "full": "All Correct"},
    {"code": "UK", "full": "United Kingdom"},
    {"code": "USA", "full": "United States of America"},
    {"code": "www", "full": "World Wide Web"}
]

hotel_guests_1c = [
    {"guest": "Guest 1", "firstName": "Imogen", "surname": "Clarke", "room": "204"},
    {"guest": "Guest 2", "firstName": "Amelia", "surname": "Menzie", "phone": "913 845 660"},
    {"guest": "Guest 3", "firstName": "Eduardo", "surname": "Lopez", "address": "7 River Road"}
]

exercises_1c = [
    {
        "id": "ex1c_alphabet_sounds",
        "section": "Pronunciation: Alphabet Sound Groups",
        "type": "matching",
        "instruction": "Assign each letter to its matching vowel sound group.",
        "groups": alphabet_sound_groups_1c
    },
    {
        "id": "ex1c_hotel_registration",
        "section": "Functional Language: Hotel Guest Registration Form",
        "type": "fill_in_blank",
        "instruction": "Listen to Track 1.07 and complete the guest registration details.",
        "fields": [
            {"id": "hf1", "label": "Guest 1 (Correct First Name)", "answer": "Imogen"},
            {"id": "hf2", "label": "Guest 1 (Surname)", "answer": "Clarke"},
            {"id": "hf3", "label": "Guest 2 (Phone Number)", "answer": "913 845 660"},
            {"id": "hf4", "label": "Guest 3 (Street Address)", "answer": "7 River Road"}
        ]
    },
    {
        "id": "ex1c_how_to_dialogue",
        "section": "How to... Ask and Answer Simple Questions",
        "type": "fill_in_blank",
        "instruction": "Complete the questions with spell, repeat, surname, or first name.",
        "items": [
            {"id": "ht1", "text": "1. What's your _____ name? Amelia.", "answer": "first"},
            {"id": "ht2", "text": "2. How do you _____ your surname?", "answer": "spell"},
            {"id": "ht3", "text": "3. What's your _____ number?", "answer": "phone"},
            {"id": "ht4", "text": "4. Can you _____ that, please?", "answer": "repeat"},
            {"id": "ht5", "text": "5. What's your _____? Clarke.", "answer": "surname"}
        ]
    }
]

answer_keys_1c = {
    "studentBook": {
        "initialisms": "BBC: British Broadcasting Corporation, EU: European Union, OK: All correct, UK: United Kingdom, USA: United States of America, www: World Wide Web",
        "alphabetSounds": "1 /eɪ/: A H J K, 2 /iː/: B C D E G P T V, 3 /e/: F L M N S X Z, 4 /aɪ/: I Y, 5 /əʊ/: O, 6 /uː/: Q U W, 7 /ɑː/: R",
        "registration": "Conversation 1: Imogen Clarke, Conversation 2: 913 845 660, Conversation 3: 7 River Road",
        "howTo": "2 spell, 3 phone, repeat, 4 surname, 5 first name"
    },
    "workbook": {
        "ex1A": "2 K, 4 P, 5 F, 6 N, 7 I, 8 O, 9 U, 10 R",
        "ex3B": "1 Isabel Fernandez, 2 Spanish, 3 5 Lennox Street Bristol, 4 713 9205"
    }
}

# 6. Lesson 1D Audio & Video Data
videos_1d = {
    "streetInterviews": {
        "id": "street_interviews",
        "title": "BBC Street Interviews: What's your name? What's in your bag?",
        "filename": "SO3 A1 U1 BBC StreetInt.mp4",
        "path": os.path.join(videos_dir, "SO3 A1 U1 BBC StreetInt.mp4")
    },
    "vlogs": {
        "id": "vlogs",
        "title": "BBC Vlogs: Where are you from?",
        "filename": "SO3 A1 U1 BBC Vlogs.mp4",
        "path": os.path.join(videos_dir, "SO3 A1 U1 BBC Vlogs.mp4")
    }
}

audio_1d = [
    {
        "id": "VB1.04",
        "title": "Vocabulary Bank Common Objects Audio",
        "filename": "021_SO3_A1_SB_1D_Audio_VB1_04.mp3",
        "path": os.path.join(class_audio_dir, "021_SO3_A1_SB_1D_Audio_VB1_04.mp3")
    },
    {
        "id": "WB1.12",
        "title": "Workbook Lesson 1D Audio",
        "filename": "SO3_A1_WB_1D_Audio_1_12.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_1D_Audio_1_12.mp3")
    }
]

videoscripts_1d = {
    "vlogs": [
        {"speaker": "Beatriz", "country": "Portugal", "text": "Hi, I'm Beatriz and I'm from Portugal."},
        {"speaker": "Mo", "country": "China", "text": "Hello, my name is Mo. I come from China."},
        {"speaker": "Anna", "country": "Australia", "text": "Hi, my name's Anna. I'm from Queensland, Australia."},
        {"speaker": "Brian", "country": "United States", "text": "Hi. My name's Brian. I'm from the United States."},
        {"speaker": "Kayo", "country": "Japan", "text": "My name's Kayo. I'm from Japan."},
        {"speaker": "Phil", "country": "England", "text": "Hi, I'm Phil. I'm from England."},
        {"speaker": "Holly", "country": "England", "text": "Hi, I'm Holly and I'm from Nottingham in England."},
        {"speaker": "Daniel", "country": "Poland", "text": "Hi. My name is Daniel. I'm from Poland."},
        {"speaker": "Sonia", "country": "Serbia", "text": "Hello. My name is Sonia and I'm from Serbia."},
        {"speaker": "Lucia", "country": "Spain", "text": "My name's Lucia. I'm from Spain."}
    ],
    "streetInterviews": {
        "spelling": [
            {"speaker": "William", "spelling": "W-I-L-L-I-A-M", "quote": "My name is William and it's spelt W-I-L-L-I-A-M."},
            {"speaker": "Rachael", "spelling": "R-A-C-H-A-E-L", "quote": "My name is Rachael. R-A-C-H-A-E-L."},
            {"speaker": "Chris", "spelling": "C-H-R-I-S", "quote": "My name is Chris. C-H-R-I-S."},
            {"speaker": "Sharron", "spelling": "S-H-A-R-R-O-N", "quote": "Sharron. And that's S-H-A, double-R, O-N."},
            {"speaker": "Ian", "spelling": "I-A-N", "quote": "My name's Ian. That is spelt I-A-N."},
            {"speaker": "Simnit", "spelling": "S-I-M-N-I-T", "quote": "Simnit, and it's spelt S-I-M-N-I-T."},
            {"speaker": "Layan", "spelling": "L-A-Y-A-N", "quote": "So it's Layan, and it's L-A-Y-A-N."},
            {"speaker": "Tom", "spelling": "T-O-M", "quote": "My name is Tom. That's T-O-M."}
        ],
        "bags": [
            {"speaker": "William", "items": ["sandwich"], "quote": "I have a sandwich in my bag."},
            {"speaker": "Rachael", "items": ["bottle of water", "purse", "keys"], "quote": "I have a bottle of water. I have my purse, my keys."},
            {"speaker": "Chris", "items": ["laptop", "notebook"], "quote": "I have a laptop and a notebook."},
            {"speaker": "Sharron", "items": ["bottle of water", "notebook", "banana"], "quote": "I have a bottle of water, a notebook and a banana."},
            {"speaker": "Ian", "items": ["laptop", "mobile"], "quote": "I have a laptop and a mobile."},
            {"speaker": "Simnit", "items": ["umbrella", "mobile phone", "purse"], "quote": "I have an umbrella, my mobile phone and my purse."},
            {"speaker": "Biba", "items": ["mobile phone", "wallet"], "quote": "In my bag I have my phone and my wallet."},
            {"speaker": "Layan", "items": ["wallet", "make-up"], "quote": "So I have my wallet and some make-up."},
            {"speaker": "Tom", "items": ["laptop", "books"], "quote": "I have my laptop and two books."}
        ]
    }
}

exercises_1d = [
    {
        "id": "ex1d_names",
        "section": "View: Spelling Names",
        "type": "fill_in_blank",
        "instruction": "Watch the video and complete the spelling of each person's name.",
        "items": [
            {"speaker": "1. W _ _ _ _ _ M", "answer": "William"},
            {"speaker": "2. R _ _ _ _ _ L", "answer": "Rachael"},
            {"speaker": "3. C _ _ _ S", "answer": "Chris"},
            {"speaker": "4. S _ _ _ _ _ N", "answer": "Sharron"},
            {"speaker": "5. I _ N", "answer": "Ian"},
            {"speaker": "6. S _ _ _ _ T", "answer": "Simnit"},
            {"speaker": "7. L _ _ _ N", "answer": "Layan"},
            {"speaker": "8. T _ M", "answer": "Tom"}
        ]
    },
    {
        "id": "ex1d_bags",
        "section": "View: What's in your bag?",
        "type": "bag_categorization",
        "instruction": "Assign objects to Bag A (Simnit) or Bag B (Tom).",
        "bagA_owner": "Simnit",
        "bagA_items": ["umbrella", "mobile phone", "purse"],
        "bagB_owner": "Tom",
        "bagB_items": ["laptop", "two books"],
        "available_items": [
            "umbrella", "mobile phone", "purse", "laptop", "two books", "banana", "sandwich"
        ]
    },
    {
        "id": "ex1d_grammar",
        "section": "Grammar: a / an & have / has",
        "type": "fill_in_blank",
        "instruction": "Fill in the correct form (a, an, have, has).",
        "questions": [
            {"id": "g1", "text": "1. I have _____ umbrella.", "answer": "an"},
            {"id": "g2", "text": "2. I _____ a bottle of water and _____ banana.", "answer": "have, a", "parts": ["have", "a"]},
            {"id": "g3", "text": "3. She _____ a laptop and two books.", "answer": "has"},
            {"id": "g4", "text": "4. They _____ three notebooks.", "answer": "have"},
            {"id": "g5", "text": "5. He has _____ apple and _____ sandwich.", "answer": "an, a", "parts": ["an", "a"]}
        ]
    }
]

answer_keys_1d = {
    "preview": {
        "bagA": "an umbrella, a mobile phone, a purse",
        "bagB": "a laptop, two books"
    },
    "view2A": ["1 H", "2 A", "3 B", "4 E", "5 I", "6 D", "7 G", "8 C", "9 F"],
    "view2B": {
        "2": "Rachael",
        "4": "Sharron",
        "7": "Biba",
        "8": "Layan"
    },
    "view3A": {
        "Bag A": "Speaker D (Simnit)",
        "Bag B": "Speaker F (Tom)"
    },
    "view3C": {
        "1": "G (Biba)",
        "2": "A (Rachael)",
        "3": "F (Tom)",
        "4": "D (Simnit)",
        "5": "E (Sharron)",
        "6": "H (William)"
    },
    "grammar4A": [
        "1 an",
        "2 have, a, a",
        "3 have, a",
        "4 have",
        "5 has"
    ],
    "grammarBank1": [
        "1 a", "2 a", "3 an", "4 a", "5 a", "6 an", "7 a", "8 an", "9 a", "10 a"
    ],
    "workbook1D": {
        "ex1B": [
            "1 purses", "2 wallets", "3 umbrellas", "4 laptops",
            "5 apples", "6 American passports", "7 mobile phones", "8 countries"
        ]
    }
}

# 6.5 Unit 1 Review & Sound/Spelling & Unit 1 Test Data
test_audio_dir = os.path.join(root_a1, "Speakout 3rd Edition A1 Tests", "Speakout_A1_Tests Audio")
ut1_audio_path = os.path.join(test_audio_dir, "SO3_A1_Tests_UT_1_Audio_UT1_01.mp3")

unit1_review = {
    "id": "unit1_review",
    "title": "Unit 1 Review & Check",
    "subTitle": "Review of Grammar, Vocabulary, Phonics & Sound and Spelling",
    "pages": {
        "studentBook": [16, 17],
        "workbook": [8, 9]
    },
    "phonicsLab": {
        "schwa": {
            "sound": "/ə/",
            "title": "The Weak Vowel: Schwa",
            "description": "In unstressed syllables, vowels often reduce to the short, neutral sound /ə/.",
            "examples": [
                {"word": "Japan", "ipa": "/dʒəˈpæn/", "detail": "The first syllable 'Ja-' is unstressed: /dʒə/."},
                {"word": "doctor", "ipa": "/ˈdɒktə/", "detail": "The second syllable '-tor' is unstressed: /tə/."},
                {"word": "number", "ipa": "/ˈnʌmbə/", "detail": "The second syllable '-ber' is unstressed: /bə/."}
            ]
        },
        "pluralEndings": [
            {"sound": "/s/", "title": "Unvoiced Plural /s/", "rule": "After unvoiced consonants: /p/, /t/, /k/, /f/, /θ/.", "example": "ticket -> tickets (/ˈtɪkɪts/)"},
            {"sound": "/z/", "title": "Voiced Plural /z/", "rule": "After voiced consonants & vowel sounds: /b/, /d/, /g/, /v/, /l/, /m/, /n/, vowels.", "example": "bag -> bags (/bæɡz/)"},
            {"sound": "/ɪz/", "title": "Sibilant Plural /ɪz/", "rule": "After sibilant sounds: /s/, /z/, /ʃ/, /tʃ/, /dʒ/.", "example": "bus -> buses (/ˈbʌsɪz/)"}
        ]
    },
    "exercises": [
        {
            "id": "ex_rev_countries",
            "title": "Review 1A: Countries vs Nationalities",
            "instruction": "Choose the correct word (country or nationality) to complete each sentence.",
            "items": [
                {"id": "rc1", "sentence": "1. She is from _____.", "options": ["Mexico", "Mexican"], "answer": "Mexico"},
                {"id": "rc2", "sentence": "2. Paulo is _____.", "options": ["Argentina", "Argentinian"], "answer": "Argentinian"},
                {"id": "rc3", "sentence": "3. They live in _____.", "options": ["the UK", "British"], "answer": "the UK"},
                {"id": "rc4", "sentence": "4. We are _____.", "options": ["the USA", "American"], "answer": "American"},
                {"id": "rc5", "sentence": "5. Rome is a city in _____.", "options": ["Italy", "Italian"], "answer": "Italy"}
            ]
        },
        {
            "id": "ex_rev_be",
            "title": "Review 2A: Present Simple be",
            "instruction": "Complete the questions and short answers with the correct form of be.",
            "items": [
                {"id": "rb1", "text": "A: _____ you a student? (Are / Am)", "answer": "Are"},
                {"id": "rb2", "text": "B: Yes, I _____.", "answer": "am"},
                {"id": "rb3", "text": "A: _____ you from France?", "answer": "Are"},
                {"id": "rb4", "text": "B: No, I _____ not.", "answer": "'m"}
            ]
        },
        {
            "id": "ex_rev_jobs",
            "title": "Review 4A: Jobs & Articles a/an",
            "instruction": "Write the job with the correct article a or an.",
            "items": [
                {"id": "rj1", "prompt": "Australia / bus driver", "answer": "an Australian bus driver"},
                {"id": "rj2", "prompt": "UK / waiter", "answer": "a British waiter"},
                {"id": "rj3", "prompt": "Poland / singer", "answer": "a Polish singer"}
            ]
        },
        {
            "id": "ex_rev_greetings",
            "title": "Review 5A & 5B: Chronological Greetings",
            "instruction": "Order the daily greetings from earliest in the morning to night (1 to 4).",
            "items": [
                {"id": "rg1", "greeting": "Good morning", "order": 1, "time": "Early morning"},
                {"id": "rg2", "greeting": "Good afternoon", "order": 2, "time": "12:00 – 18:00"},
                {"id": "rg3", "greeting": "Good evening", "order": 3, "time": "18:00 – 22:00"},
                {"id": "rg4", "greeting": "Good night", "order": 4, "time": "Bedtime"}
            ]
        },
        {
            "id": "ex_rev_check",
            "title": "Review 7B: Language Consolidation",
            "instruction": "Complete each sentence with one word from Unit 1.",
            "items": [
                {"id": "rk1", "sentence": "1. What _____ your name?", "answer": "is"},
                {"id": "rk2", "sentence": "2. How many _____ are in the bag?", "answer": "words"},
                {"id": "rk3", "sentence": "3. He _____ an umbrella.", "answer": "has"},
                {"id": "rk4", "sentence": "4. She is from Warsaw, so she is _____.", "answer": "Polish"},
                {"id": "rk5", "sentence": "5. Maria _____ a bus ticket.", "answer": "has"},
                {"id": "rk6", "sentence": "6. Where are you _____?", "answer": "from"},
                {"id": "rk7", "sentence": "7. What are their phone _____?", "answer": "numbers"},
                {"id": "rk8", "sentence": "8. He _____ here today.", "answer": "isn't"}
            ]
        }
    ],
    "answerKeys": {
        "grammar1A": "2 Mexico, 3 Argentinian, 4 the UK, 5 American, 6 Italy",
        "grammar2A": "1 Are, 2 am, 3 Are, 4 'm",
        "vocab4A": "2 an Australian bus driver, 3 a British waiter, 4 a Polish singer",
        "vocab5B": "1 Good morning, 2 Good afternoon, 3 Good evening, 4 Good night",
        "phonics6A": "Schwa /ə/ in Japan, doctor, number. Plural endings: /ɪz/ in buses, /z/ in bags, /s/ in tickets.",
        "check7B": "1 is, 2 words, 3 has, 4 Polish, 5 has, 6 from, 7 numbers, 8 isn't"
    }
}

unit1_test = {
    "testId": "unit1_test_a",
    "title": "Speakout 3rd Edition A1 Unit 1 Test (Version A)",
    "totalMarks": 50,
    "passMark": 30,
    "meritMark": 38,
    "distinctionMark": 45,
    "audio": {
        "id": "UT1.01",
        "title": "Unit 1 Test Listening Track (UT1.01)",
        "filename": "SO3_A1_Tests_UT_1_Audio_UT1_01.mp3",
        "path": ut1_audio_path
    },
    "sections": {
        "grammar": {
            "title": "Grammar (20 marks)",
            "part1": {
                "instruction": "Choose the correct words to complete the conversations.",
                "marks": 8,
                "items": [
                    {"id": "g1_1", "text": "1 A: I (1) 'm / 're Petros.", "options": ["'m", "'re"], "answer": "'m"},
                    {"id": "g1_2", "text": "1 B: Hi Petros! I (2) 'm / are Hana.", "options": ["'m", "are"], "answer": "'m"},
                    {"id": "g1_3", "text": "2 A: (3) Am / Are you a student?", "options": ["Am", "Are"], "answer": "Are"},
                    {"id": "g1_4", "text": "2 B: No, I (4) 'm / 're not.", "options": ["'m", "'re"], "answer": "'m"},
                    {"id": "g1_5", "text": "3 A: (5) Am / Are you from Germany?", "options": ["Am", "Are"], "answer": "Are"},
                    {"id": "g1_6", "text": "3 B: Yes, I (6) 'm / am.", "options": ["'m", "am"], "answer": "am"},
                    {"id": "g1_7", "text": "4 A: I (7) 'm / are from Beijing.", "options": ["'m", "are"], "answer": "'m"},
                    {"id": "g1_8", "text": "4 B: (8) Am / Are you Chinese?", "options": ["Am", "Are"], "answer": "Are"}
                ]
            },
            "part2": {
                "instruction": "Complete the sentences with is or isn't.",
                "marks": 7,
                "items": [
                    {"id": "g2_1", "text": "1 My sister _____ a student. (+)", "answer": "is"},
                    {"id": "g2_2", "text": "2 Paris _____ in India. (-)", "answer": "isn't"},
                    {"id": "g2_3", "text": "3 Yun _____ from Korea. (+)", "answer": "is"},
                    {"id": "g2_4", "text": "4 Where _____ the airport?", "answer": "is"},
                    {"id": "g2_5", "text": "5 _____ Melbourne in Australia?", "answer": "Is"},
                    {"id": "g2_6", "text": "6 She _____ in my class. (-)", "answer": "isn't"},
                    {"id": "g2_7", "text": "7 What _____ your name?", "answer": "is"}
                ]
            },
            "part3": {
                "instruction": "Correct the error in each sentence.",
                "marks": 5,
                "items": [
                    {"id": "g3_1", "sentence": "1 I have [a] email.", "wrong": "a", "answer": "an"},
                    {"id": "g3_2", "sentence": "2 She [have] a new phone.", "wrong": "have", "answer": "has"},
                    {"id": "g3_3", "sentence": "3 I have [glass].", "wrong": "glass", "answer": "glasses"},
                    {"id": "g3_4", "sentence": "4 You [has] a sandwich.", "wrong": "has", "answer": "have"},
                    {"id": "g3_5", "sentence": "5 New York is [a] American city.", "wrong": "a", "answer": "an"}
                ]
            }
        },
        "vocabulary": {
            "title": "Vocabulary (20 marks)",
            "part4": {
                "instruction": "Complete the nationalities by adding the missing letters.",
                "marks": 8,
                "items": [
                    {"id": "v4_1", "country": "Germany", "prompt": "Germ _ _", "answer": "an", "full": "German"},
                    {"id": "v4_2", "country": "Colombia", "prompt": "Colomb _ _ _", "answer": "ian", "full": "Colombian"},
                    {"id": "v4_3", "country": "Turkey", "prompt": "Turk _ _ _", "answer": "ish", "full": "Turkish"},
                    {"id": "v4_4", "country": "China", "prompt": "Chin _ _ _", "answer": "ese", "full": "Chinese"},
                    {"id": "v4_5", "country": "Mexico", "prompt": "Mexic _ _", "answer": "an", "full": "Mexican"},
                    {"id": "v4_6", "country": "Spain", "prompt": "Span _ _ _", "answer": "ish", "full": "Spanish"},
                    {"id": "v4_7", "country": "Japan", "prompt": "Japan _ _ _", "answer": "ese", "full": "Japanese"},
                    {"id": "v4_8", "country": "Brazil", "prompt": "Brazil _ _ _", "answer": "ian", "full": "Brazilian"}
                ]
            },
            "part5": {
                "instruction": "Unscramble the letters to make jobs.",
                "marks": 7,
                "items": [
                    {"id": "v5_1", "scramble": "c t o a r", "answer": "actor"},
                    {"id": "v5_2", "scramble": "r n s u e", "answer": "nurse"},
                    {"id": "v5_3", "scramble": "p o s h   s s a s t i n a t", "answer": "shop assistant"},
                    {"id": "v5_4", "scramble": "b s u   i r r v e d", "answer": "bus driver"},
                    {"id": "v5_5", "scramble": "s a r i t t", "answer": "artist"},
                    {"id": "v5_6", "scramble": "l l f o o a b t   p l y a r e", "answer": "football player"},
                    {"id": "v5_7", "scramble": "s o s w s b e n u m i a n", "answer": "businesswoman"}
                ]
            },
            "part6": {
                "instruction": "Match the word halves to make everyday objects.",
                "marks": 5,
                "items": [
                    {"id": "v6_1", "partA": "1 lap", "partB": "C top", "answer": "laptop"},
                    {"id": "v6_2", "partA": "2 umb", "partB": "D rella", "answer": "umbrella"},
                    {"id": "v6_3", "partA": "3 wal", "partB": "A let", "answer": "wallet"},
                    {"id": "v6_4", "partA": "4 note", "partB": "E book", "answer": "notebook"},
                    {"id": "v6_5", "partA": "5 sand", "partB": "B wich", "answer": "sandwich"}
                ]
            }
        },
        "howTo": {
            "title": "How to... & Functional Language (10 marks)",
            "part7": {
                "instruction": "Match the questions (1–5) with the answers (A–E).",
                "marks": 5,
                "items": [
                    {"id": "h7_1", "question": "1 What's your name?", "answer": "C", "answerText": "Daniel Peterson."},
                    {"id": "h7_2", "question": "2 What's your address?", "answer": "E", "answerText": "15 Prince Street, Boston."},
                    {"id": "h7_3", "question": "3 What's your phone number?", "answer": "B", "answerText": "It's 0-7-8-8-2-9-0-2-1-0-1."},
                    {"id": "h7_4", "question": "4 How do you spell your first name?", "answer": "D", "answerText": "It's D-A-N-I-E-L."},
                    {"id": "h7_5", "question": "5 How do you spell your surname?", "answer": "A", "answerText": "P-E-T-E-R-S-O-N."}
                ]
            },
            "part8": {
                "instruction": "Choose the correct words to complete the functional sentences.",
                "marks": 5,
                "items": [
                    {"id": "h8_1", "text": "1 (Thank / Thanks) you.", "options": ["Thank", "Thanks"], "answer": "Thank"},
                    {"id": "h8_2", "text": "2 That's (right / minute).", "options": ["right", "minute"], "answer": "right"},
                    {"id": "h8_3", "text": "3 Just a (moment / wait).", "options": ["moment", "wait"], "answer": "moment"},
                    {"id": "h8_4", "text": "4 Can you (minute / repeat) that, please?", "options": ["minute", "repeat"], "answer": "repeat"},
                    {"id": "h8_5", "text": "5 No, that's (name / wrong).", "options": ["name", "wrong"], "answer": "wrong"}
                ]
            }
        }
    },
    "answerKeys": {
        "grammar": {
            "part1": "1 'm, 2 'm, 3 Are, 4 'm, 5 Are, 6 am, 7 'm, 8 Are",
            "part2": "1 is, 2 isn't, 3 is, 4 is, 5 Is, 6 isn't, 7 is",
            "part3": "1 an, 2 has, 3 glasses, 4 have, 5 an"
        },
        "vocabulary": {
            "part4": "1 an, 2 ian, 3 ish, 4 ese, 5 an, 6 ish, 7 ese, 8 ian",
            "part5": "1 actor, 2 nurse, 3 shop assistant, 4 bus driver, 5 artist, 6 football player, 7 businesswoman",
            "part6": "1 C, 2 D, 3 A, 4 E, 5 B"
        },
        "howTo": {
            "part7": "1 C, 2 E, 3 B, 4 D, 5 A",
            "part8": "1 Thank, 2 right, 3 moment, 4 repeat, 5 wrong"
        }
    }
}

# 6.6 Lesson 2A: Where are they?
class_audio_2a = [
    {
        "id": "2.01",
        "title": "Numbers 11-100 Pronunciation",
        "filename": "028_SO3_A1_SB_2A_Audio_2_01.mp3",
        "path": os.path.join(class_audio_dir, "028_SO3_A1_SB_2A_Audio_2_01.mp3")
    },
    {
        "id": "2.02",
        "title": "Word Stress in Numbers (-teen vs -ty)",
        "filename": "029_SO3_A1_SB_2A_Audio_2_02.mp3",
        "path": os.path.join(class_audio_dir, "029_SO3_A1_SB_2A_Audio_2_02.mp3")
    },
    {
        "id": "2.03",
        "title": "Compound Numbers Listening",
        "filename": "030_SO3_A1_SB_2A_Audio_2_03.mp3",
        "path": os.path.join(class_audio_dir, "030_SO3_A1_SB_2A_Audio_2_03.mp3")
    },
    {
        "id": "2.0X",
        "title": "Grammar be (plural) Drill",
        "filename": "031_SO3_A1_SB_2A_Audio_2_0X.mp3",
        "path": os.path.join(class_audio_dir, "031_SO3_A1_SB_2A_Audio_2_0X.mp3")
    },
    {
        "id": "VB2.01",
        "title": "Vocabulary Bank Common Adjectives Audio",
        "filename": "038_SO3_A1_SB_2A_Audio_VB2_01.mp3",
        "path": os.path.join(class_audio_dir, "038_SO3_A1_SB_2A_Audio_VB2_01.mp3")
    }
]

wb_audio_2a = [
    {
        "id": "WB2.01",
        "title": "Workbook Lesson 2A Numbers Audio",
        "filename": "SO3_A1_WB_2A_Audio_2_01.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2A_Audio_2_01.mp3")
    },
    {
        "id": "WB2.02",
        "title": "Workbook Lesson 2A Adjectives Audio",
        "filename": "SO3_A1_WB_2A_Audio_2_02.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2A_Audio_2_02.mp3")
    },
    {
        "id": "WB2.03",
        "title": "Workbook Lesson 2A Grammar be Audio",
        "filename": "SO3_A1_WB_2A_Audio_2_03.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2A_Audio_2_03.mp3")
    }
]

photocopiables_2a = [
    {
        "id": "2A_Grammar",
        "title": "Grammar: Present Simple be (we, you, they)",
        "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_2A_Grammar.pdf")
    },
    {
        "id": "2A_Vocab",
        "title": "Vocabulary: Numbers & Common Adjectives",
        "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_2A_Vocab.pdf")
    }
]

reading_2a = [
    {
        "location": "Photo A (England)",
        "country": "England",
        "description": "Cold weather, beautiful mountains, very old buildings.",
        "adjectives": ["cold", "beautiful", "old"]
    },
    {
        "location": "Photo B (England)",
        "country": "England",
        "description": "Small town, friendly local people, good cafés.",
        "adjectives": ["small", "friendly", "good"]
    },
    {
        "location": "Photo C (Wales)",
        "country": "Wales",
        "description": "Long walk in the national park, tired tourists, hot sunny day, happy group.",
        "adjectives": ["tired", "hot", "happy"]
    }
]

exercises_2a = [
    {
        "id": "ex2a_word_stress",
        "title": "Pronunciation: Word Stress in Numbers (-teen vs -ty)",
        "type": "stress_comparator",
        "instruction": "Listen to Track 2.02. Notice that -teen numbers are stressed on the second syllable, while -ty numbers are stressed on the first syllable.",
        "pairs": [
            {"teen": "thirteen", "teenIpa": "/ˌθɜːˈtiːn/", "teenStress": "thir-TEEN", "ty": "thirty", "tyIpa": "/ˈθɜːti/", "tyStress": "THIR-ty"},
            {"teen": "fourteen", "teenIpa": "/ˌfɔːˈtiːn/", "teenStress": "four-TEEN", "ty": "forty", "tyIpa": "/ˈfɔːti/", "tyStress": "FOR-ty"},
            {"teen": "fifteen", "teenIpa": "/ˌfɪfˈtiːn/", "teenStress": "fif-TEEN", "ty": "fifty", "tyIpa": "/ˈfɪfti/", "tyStress": "FIF-ty"},
            {"teen": "sixteen", "teenIpa": "/ˌsɪkˈstiːn/", "teenStress": "six-TEEN", "ty": "sixty", "tyIpa": "/ˈsɪksti/", "tyStress": "SIX-ty"},
            {"teen": "seventeen", "teenIpa": "/ˌsevənˈtiːn/", "teenStress": "seven-TEEN", "ty": "seventy", "tyIpa": "/ˈsevənti/", "tyStress": "SEV-en-ty"},
            {"teen": "eighteen", "teenIpa": "/ˌeɪˈtiːn/", "teenStress": "eigh-TEEN", "ty": "eighty", "tyIpa": "/ˈeɪti/", "tyStress": "EIGH-ty"},
            {"teen": "nineteen", "teenIpa": "/ˌnaɪnˈtiːn/", "teenStress": "nine-TEEN", "ty": "ninety", "tyIpa": "/ˈnaɪnti/", "tyStress": "NINE-ty"}
        ]
    },
    {
        "id": "ex2a_compound_numbers",
        "title": "Vocabulary: Compound Numbers 11–100",
        "type": "fill_in_blank",
        "instruction": "Write the compound number in words or digits as indicated.",
        "items": [
            {"id": "cn1", "prompt": "49", "answer": "forty-nine"},
            {"id": "cn2", "prompt": "73", "answer": "seventy-three"},
            {"id": "cn3", "prompt": "56", "answer": "fifty-six"},
            {"id": "cn4", "prompt": "67", "answer": "sixty-seven"},
            {"id": "cn5", "prompt": "34", "answer": "thirty-four"},
            {"id": "cn6", "prompt": "98", "answer": "ninety-eight"},
            {"id": "cn7", "prompt": "52", "answer": "fifty-two"},
            {"id": "cn8", "prompt": "25", "answer": "twenty-five"},
            {"id": "cn9", "prompt": "88", "answer": "eighty-eight"}
        ]
    },
    {
        "id": "ex2a_reading_tf",
        "title": "Reading: Where are they? (England & Wales)",
        "type": "true_false",
        "instruction": "Read the profiles of Photos A, B, and C. Decide if the statements are True (T) or False (F).",
        "items": [
            {"id": "rtf1", "statement": "1. Photo A shows mountains in Wales.", "answer": "F", "correction": "Photo A shows mountains in England."},
            {"id": "rtf2", "statement": "2. The buildings in Photo A are old.", "answer": "T", "correction": ""},
            {"id": "rtf3", "statement": "3. The town in Photo B is big.", "answer": "F", "correction": "The town in Photo B is small."},
            {"id": "rtf4", "statement": "4. The people in Photo B are friendly.", "answer": "T", "correction": ""},
            {"id": "rtf5", "statement": "5. The tourists in Photo C are tired.", "answer": "T", "correction": ""},
            {"id": "rtf6", "statement": "6. The weather in Photo C is cold.", "answer": "F", "correction": "The weather in Photo C is hot."}
        ]
    },
    {
        "id": "ex2a_grammar_be",
        "title": "Grammar: Present Simple be (we, you, they)",
        "type": "fill_in_blank",
        "instruction": "Complete each sentence with the correct form: 're (are) or aren't.",
        "items": [
            {"id": "gb1", "sentence": "1. We _____ in England today.", "answer": "'re", "alt": "are"},
            {"id": "gb2", "sentence": "2. They _____ shop assistants. (+)", "answer": "'re", "alt": "are"},
            {"id": "gb3", "sentence": "3. Are they from Scotland? No, they _____.", "answer": "aren't", "alt": "are not"},
            {"id": "gb4", "sentence": "4. Where _____ you from?", "answer": "are", "alt": "are"},
            {"id": "gb5", "sentence": "5. We _____ tired. We're very energetic! (-)", "answer": "aren't", "alt": "are not"},
            {"id": "gb6", "sentence": "6. They _____ at university in Manchester.", "answer": "'re", "alt": "are"}
        ]
    },
    {
        "id": "ex2a_adjectives_pairs",
        "title": "Vocabulary Bank: Opposite Adjectives",
        "type": "matching",
        "instruction": "Match each adjective with its opposite.",
        "pairs": [
            {"adj": "big", "opposite": "small"},
            {"adj": "hot", "opposite": "cold"},
            {"adj": "young", "opposite": "old"},
            {"adj": "happy", "opposite": "sad"},
            {"adj": "good", "opposite": "bad"},
            {"adj": "easy", "opposite": "difficult"}
        ]
    }
]

answer_keys_2a = {
    "studentBook": {
        "numbers1B": "11 eleven, 12 twelve, 13 thirteen, 14 fourteen, 15 fifteen, 16 sixteen, 17 seventeen, 18 eighteen, 19 nineteen, 20 twenty",
        "numbers1D": "60 sixty, 70 seventy, 80 eighty, 90 ninety, 100 a hundred",
        "wordStress2A": "thir-TEEN vs THIR-ty, four-TEEN vs FOR-ty, fif-TEEN vs FIF-ty, six-TEEN vs SIX-ty, seven-TEEN vs SEV-en-ty, eigh-TEEN vs EIGH-ty, nine-TEEN vs NINE-ty",
        "compound3A": "2 forty-nine, 3 seventy-three, 4 fifty-six",
        "compound3B": "sixty-seven, thirty-four, ninety-eight, fifty-two, twenty-five, eighty-eight",
        "reading5B": "A England, B England, C Wales",
        "reading5C": "2 F, 3 F, 4 T, 5 T, 6 F",
        "adjectives5D": "1 old, 2 cold, 3 tired, 4 friendly, 5 small",
        "grammar6A": "1/2 we, 're, 3 Are, 4 aren't",
        "grammarBank2": "2 We're shop assistants, 3 Are they from Scotland?, 4 They're Mr Vega and Ms Fox, 5 Where are you?, 6 They aren't here, 7 We're at university, 8 Are they here?"
    },
    "workbook": {
        "ex1A": "11 eleven, 12 twelve, 13 thirteen, 14 fourteen, 15 fifteen, 16 sixteen, 17 seventeen, 18 eighteen, 19 nineteen, 20 twenty",
        "ex2A": "1 big, 2 cold, 3 old, 4 happy, 5 bad, 6 difficult",
        "ex3A": "1 We're, 2 Are they, 3 aren't, 4 They're, 5 Are you, 6 're"
    }
}

# 6.7 Lesson 2B: Family and friends
class_audio_2b = [
    {
        "id": "2.04",
        "title": "Family Listening: Five People Profiles",
        "filename": "032_SO3_A1_SB_2B_Audio_2_04.mp3",
        "path": os.path.join(class_audio_dir, "032_SO3_A1_SB_2B_Audio_2_04.mp3")
    },
    {
        "id": "2.05",
        "title": "Pronunciation: Syllables and Sound /ð/",
        "filename": "033_SO3_A1_SB_2B_Audio_2_05.mp3",
        "path": os.path.join(class_audio_dir, "033_SO3_A1_SB_2B_Audio_2_05.mp3")
    },
    {
        "id": "VB2.02",
        "title": "Vocabulary Bank: Family Members Audio",
        "filename": "039_SO3_A1_SB_2B_Audio_VB2_02.mp3",
        "path": os.path.join(class_audio_dir, "039_SO3_A1_SB_2B_Audio_VB2_02.mp3")
    },
    {
        "id": "VB2.03",
        "title": "Vocabulary Bank: People Words Audio",
        "filename": "040_SO3_A1_SB_2B_Audio_VB2_03.mp3",
        "path": os.path.join(class_audio_dir, "040_SO3_A1_SB_2B_Audio_VB2_03.mp3")
    }
]

wb_audio_2b = [
    {
        "id": "WB2.04",
        "title": "Workbook Lesson 2B Audio 1 (Family)",
        "filename": "SO3_A1_WB_2B_Audio_2_04.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2B_Audio_2_04.mp3")
    },
    {
        "id": "WB2.05",
        "title": "Workbook Lesson 2B Audio 2 (Possessive Adjectives)",
        "filename": "SO3_A1_WB_2B_Audio_2_05.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2B_Audio_2_05.mp3")
    },
    {
        "id": "WB2.06",
        "title": "Workbook Lesson 2B Audio 3 (Pronunciation /ð/)",
        "filename": "SO3_A1_WB_2B_Audio_2_06.mp3",
        "path": os.path.join(wb_audio_dir, "SO3_A1_WB_2B_Audio_2_06.mp3")
    }
]

photocopiables_2b = [
    {
        "id": "2B_Grammar",
        "title": "Grammar: Possessive Adjectives and 's",
        "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_2B_Grammar.pdf")
    },
    {
        "id": "2B_Vocab",
        "title": "Vocabulary: Family & Friends",
        "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_2B_Vocab.pdf")
    }
]

profiles_2b = [
    {
        "name": "Mia",
        "age": 8,
        "country": "Italy",
        "jobOrStudies": "student at school",
        "relation": "Mark's daughter"
    },
    {
        "name": "Jessica",
        "age": 45,
        "country": "France",
        "jobOrStudies": "has a restaurant",
        "relation": "Thomas's sister"
    },
    {
        "name": "Justin",
        "age": 21,
        "country": "the UK",
        "jobOrStudies": "writer for a magazine",
        "relation": "Emma's brother"
    },
    {
        "name": "Emma",
        "age": 18,
        "country": "the UK",
        "jobOrStudies": "student at university",
        "relation": "Justin's sister"
    },
    {
        "name": "David",
        "age": 38,
        "country": "Colombia",
        "jobOrStudies": "doctor",
        "relation": "Mariana's husband and father of Matas & Antonella"
    }
]

exercises_2b = [
    {
        "id": "ex2b_family_tree",
        "title": "Vocabulary: Family Tree Roles",
        "type": "matching",
        "instruction": "Identify family members and their relationships.",
        "pairs": [
            {"term": "mother", "relation": "female parent"},
            {"term": "father", "relation": "male parent"},
            {"term": "husband", "relation": "married man"},
            {"term": "wife", "relation": "married woman"},
            {"term": "son", "relation": "male child"},
            {"term": "daughter", "relation": "female child"},
            {"term": "brother", "relation": "male sibling"},
            {"term": "sister", "relation": "female sibling"}
        ]
    },
    {
        "id": "ex2b_possessive_adjectives",
        "title": "Grammar: Possessive Adjectives (my, your, his, her, its, our, their)",
        "type": "fill_in_blank",
        "instruction": "Complete the sentences with the correct possessive adjective.",
        "items": [
            {"id": "pa1", "sentence": "1. I have a brother. _____ name is Mark.", "answer": "His"},
            {"id": "pa2", "sentence": "2. She is from France and _____ husband is from Spain.", "answer": "her"},
            {"id": "pa3", "sentence": "3. We love _____ new English class.", "answer": "our"},
            {"id": "pa4", "sentence": "4. They are doctors and _____ hospital is in London.", "answer": "their"},
            {"id": "pa5", "sentence": "5. This is a big company. What is _____ name?", "answer": "its"},
            {"id": "pa6", "sentence": "6. Are you with _____ sister today?", "answer": "your"}
        ]
    },
    {
        "id": "ex2b_pronunciation_th",
        "title": "Pronunciation: Sound /ð/ & Syllable Counts",
        "type": "categorization",
        "instruction": "Listen to Track 2.05. Identify words with 1 syllable vs 2 syllables.",
        "items": [
            {"word": "wife", "syllables": 1, "hasVoicedTh": False},
            {"word": "son", "syllables": 1, "hasVoicedTh": False},
            {"word": "brother", "syllables": 2, "hasVoicedTh": True},
            {"word": "sister", "syllables": 2, "hasVoicedTh": False},
            {"word": "father", "syllables": 2, "hasVoicedTh": True},
            {"word": "mother", "syllables": 2, "hasVoicedTh": True},
            {"word": "their", "syllables": 1, "hasVoicedTh": True},
            {"word": "this", "syllables": 1, "hasVoicedTh": True}
        ]
    },
    {
        "id": "ex2b_profiles_matching",
        "title": "Listening: My Family Photos (Track 2.04)",
        "type": "matching",
        "instruction": "Match each person from Track 2.04 with their details.",
        "items": [
            {"name": "Mia", "age": "8", "country": "Italy", "job": "student at school"},
            {"name": "Jessica", "age": "45", "country": "France", "job": "has a restaurant"},
            {"name": "Justin", "age": "21", "country": "the UK", "job": "writer for a magazine"},
            {"name": "Emma", "age": "18", "country": "the UK", "job": "student at university"},
            {"name": "David", "age": "38", "country": "Colombia", "job": "doctor"}
        ]
    }
]

answer_keys_2b = {
    "studentBook": {
        "family1": "1 Justin and Emma in B; Matas and Antonella in D. 2 Thomas and Jessica in C; David and Mariana in D. 3 David and Mariana (parents) and Matas and Antonella (children) in D. 4 Mark (father) and Mia (daughter) in A; David (father) and Antonella (daughter) in D. 5 Mariana (mother) and Matas (son) in D.",
        "syllables2B": "One syllable: wife, son. Two syllables: brother, sister, husband, parents, children, father, daughter, mother.",
        "listening4B": "1 Jessica, 2 David, 3 Justin and Emma, 4 Mia",
        "listening4C": "Mia (8, Italy, student at school), Jessica (45, France, has a restaurant), Justin (21, the UK, writer for a magazine), Emma (18, the UK, student at university), David (38, Colombia, doctor)",
        "grammar5A": "2 My, her; 3 Their; 4 its; 5 His; 6 your",
        "grammar5B": "I -> my, you -> your, he -> his, she -> her, it -> its, we -> our, they -> their",
        "grammarBank1": "1 your, 2 my, 3 Our, 4 her, 5 Our, 6 His, 7 he, 8 He's, 9 their, 10 It's",
        "grammarBank2": "1 your, 2 our, their, 3 her, its, 4 your, his"
    },
    "workbook": {
        "ex1": "1 brother, 2 mother, 3 parents, 4 husband, 5 son, 6 children",
        "ex2": "1 his, 2 their, 3 Her, 4 your, 5 Our, 6 my, 7 its",
        "ex3": "1 Mark's, 2 David's, 3 Jessica's, 4 Emma's"
    }
}

# 7. Build Unified Manifest preserving 1A backwards compatibility
manifest = {
    "course": "Speakout 3rd Edition",
    "level": "A1",
    "unit": 1,
    "unitTitle": "Welcome",
    "lessonId": "1A",
    "lessonTitle": "Hello",
    "subTitle": "Greetings, countries, and verb be (singular)",
    "pages": {
        "studentBook": [8, 9],
        "vocabBank": [125],
        "grammarBank": [96]
    },
    "documents": {
        "studentBook": os.path.join(root_a1, "Speakout 3rd Edition A1 Student's Book.pdf"),
        "teacherResources": os.path.join(root_a1, "Speakout 3rd Edition A1 Teacher Resources/SO3_A1_SB_AK.pdf"),
        "photocopiables": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1A_Grammar.pdf"),
        "videoscripts": os.path.join(videos_dir, "Speakout_A1_SB_Videoscripts.pdf")
    },
    "videoDirectory": videos_dir,
    "audio": {
        "classAudio": class_audio_1a,
        "workbookAudio": wb_audio_1a
    },
    "photocopiables": [
        {
            "id": "1A_Grammar",
            "title": "Grammar: Verb be (singular)",
            "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1A_Grammar.pdf")
        },
        {
            "id": "1A_Vocab",
            "title": "Vocabulary: Countries and nationalities",
            "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1A_Vocab.pdf")
        }
    ],
    "vocabulary": vocab_1a,
    "grammar": {
        "topic": "Verb be: singular (I, you, he/she/it)",
        "affirmative": [
            {"subject": "I", "form": "'m (am)", "example": "I'm from Canada."},
            {"subject": "You", "form": "'re (are)", "example": "You're in room 4."},
            {"subject": "He / She / It", "form": "'s (is)", "example": "He's from Spain. It's in Europe."}
        ],
        "questions": [
            {"question": "Where are you from?", "answer": "I'm from Italy."},
            {"question": "Are you a student?", "answer": "Yes, I am. / No, I'm not."},
            {"question": "Is she a teacher?", "answer": "Yes, she is. / No, she isn't."}
        ]
    },
    "exercises": [
        {
            "id": "ex1",
            "section": "Vocabulary: Hello and Goodbye",
            "type": "categorization",
            "instruction": "Categorize the expressions into Hello or Goodbye.",
            "items": [
                {"phrase": "Good morning", "category": "Hello"},
                {"phrase": "See you later", "category": "Goodbye"},
                {"phrase": "Good afternoon", "category": "Hello"},
                {"phrase": "Good night", "category": "Goodbye"},
                {"phrase": "Hi", "category": "Hello"},
                {"phrase": "Bye", "category": "Goodbye"}
            ]
        },
        {
            "id": "ex2",
            "section": "Grammar: Verb be (singular)",
            "type": "fill_in_blank",
            "instruction": "Complete the sentences with am, is, or are.",
            "questions": [
                {"id": "q1", "text": "1. I _____ from Spain.", "answer": "am", "contracted": "'m"},
                {"id": "q2", "text": "2. Where _____ you from?", "answer": "are"},
                {"id": "q3", "text": "3. She _____ a student.", "answer": "is", "contracted": "'s"},
                {"id": "q4", "text": "4. He _____ from Tokyo.", "answer": "is", "contracted": "'s"},
                {"id": "q5", "text": "5. _____ you from Poland? Yes, I am.", "answer": "Are"}
            ]
        },
        {
            "id": "ex3",
            "section": "Listening & Speaking: Countries & Nationalities",
            "type": "matching",
            "instruction": "Match each country with its nationality.",
            "pairs": [
                {"country": "Australia", "nationality": "Australian"},
                {"country": "Brazil", "nationality": "Brazilian"},
                {"country": "China", "nationality": "Chinese"},
                {"country": "Italy", "nationality": "Italian"},
                {"country": "Spain", "nationality": "Spanish"},
                {"country": "United Kingdom", "nationality": "British"}
            ]
        }
    ],
    "answerKeys": {
        "studentBook": {
            "ex1": "Hello: Good morning, Good afternoon, Hi. Goodbye: See you later, Good night, Bye.",
            "ex2": "1. am ('m), 2. are, 3. is ('s), 4. is ('s), 5. Are",
            "ex3": "Australia -> Australian, Brazil -> Brazilian, China -> Chinese, Italy -> Italian, Spain -> Spanish, United Kingdom -> British"
        },
        "workbook": {
            "ex1": "1 are, 2 'm, 3 's, 4 are, 5 're, 6 isn't",
            "ex2": "1 American, 2 British, 3 Italian, 4 Spanish, 5 Polish"
        }
    },
    # Dedicated 1B Structure
    "lesson1b": {
        "lessonId": "1B",
        "lessonTitle": "Two jobs",
        "subTitle": "Jobs, articles a/an, present simple be: he, she, it",
        "pages": {
            "studentBook": [10, 11],
            "vocabBank": [126],
            "grammarBank": [96]
        },
        "audio": {
            "classAudio": class_audio_1b,
            "workbookAudio": wb_audio_1b
        },
        "photocopiables": [
            {
                "id": "1B_Vocab",
                "title": "Vocabulary: Jobs & a/an",
                "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1B_Vocab.pdf")
            },
            {
                "id": "1B_Grammar",
                "title": "Grammar: Verb be (he, she, it)",
                "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1B_Grammar.pdf")
            }
        ],
        "reading": reading_1b,
        "vocabulary": vocab_1b,
        "exercises": exercises_1b,
        "answerKeys": answer_keys_1b
    },
    # Dedicated 1C Structure
    "lesson1c": {
        "lessonId": "1C",
        "lessonTitle": "Checking in",
        "subTitle": "Functional Language: How to ask and answer simple questions & The Alphabet",
        "pages": {
            "studentBook": [12, 13],
            "vocabBank": [126],
            "grammarBank": [96]
        },
        "audio": {
            "classAudio": class_audio_1c,
            "workbookAudio": wb_audio_1c
        },
        "photocopiables": [
            {
                "id": "1C_Howto",
                "title": "Functional Language: How to ask and answer simple questions",
                "path": os.path.join(root_a1, "Speakout 3rd Edition A1 Photocopiables/SO3_A1_PC_1C_Howto.pdf")
            }
        ],
        "alphabetSoundGroups": alphabet_sound_groups_1c,
        "initialisms": initialisms_1c,
        "hotelGuests": hotel_guests_1c,
        "vocabulary": vocab_1c,
        "exercises": exercises_1c,
        "answerKeys": answer_keys_1c
    },
    # Dedicated 1D Structure
    "lesson1d": {
        "lessonId": "1D",
        "lessonTitle": "BBC Video Lesson: Street Interviews & Vlogs",
        "subTitle": "Personal possessions & What's in your bag?",
        "pages": {
            "studentBook": [14, 15],
            "vocabBank": [127],
            "grammarBank": [96]
        },
        "videos": videos_1d,
        "audio": audio_1d,
        "videoscripts": videoscripts_1d,
        "vocabulary": vocab_1d,
        "exercises": exercises_1d,
        "answerKeys": answer_keys_1d
    },
    # Unit 1 Review & Sound/Spelling
    "unit1Review": unit1_review,
    # Unit 1 Test (Part A: 50 Marks)
    "unit1Test": unit1_test,
    # Dedicated 2A Structure
    "lesson2a": {
        "lessonId": "2A",
        "lessonTitle": "Where are they?",
        "subTitle": "Numbers 11-100, common adjectives, present simple be: we, you, they",
        "pages": {
            "studentBook": [18, 19],
            "vocabBank": [128],
            "grammarBank": [98]
        },
        "audio": {
            "classAudio": class_audio_2a,
            "workbookAudio": wb_audio_2a
        },
        "photocopiables": photocopiables_2a,
        "reading": reading_2a,
        "vocabulary": vocab_2a,
        "exercises": exercises_2a,
        "answerKeys": answer_keys_2a
    },
    # Dedicated 2B Structure
    "lesson2b": {
        "lessonId": "2B",
        "lessonTitle": "Family and friends",
        "subTitle": "Family members, people, possessive 's and possessive adjectives",
        "pages": {
            "studentBook": [20, 21],
            "vocabBank": [128],
            "grammarBank": [98]
        },
        "audio": {
            "classAudio": class_audio_2b,
            "workbookAudio": wb_audio_2b
        },
        "photocopiables": photocopiables_2b,
        "profiles": profiles_2b,
        "vocabulary": vocab_2b,
        "exercises": exercises_2b,
        "answerKeys": answer_keys_2b
    }
}

os.makedirs("speakout/data", exist_ok=True)
manifest_path = "speakout/data/manifest.json"
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"Successfully generated {manifest_path} with 1A ({len(vocab_1a)}), 1B ({len(vocab_1b)}), 1C ({len(vocab_1c)}), 1D ({len(vocab_1d)}), 2A ({len(vocab_2a)}), and 2B ({len(vocab_2b)}) words.")
