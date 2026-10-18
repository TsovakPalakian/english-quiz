    const SONG_KEY = "enquiz-songs";
    let songCache = null;
    function loadSongs() {
      if (songCache) return songCache;
      try { songCache = JSON.parse(localStorage.getItem(SONG_KEY) || "[]"); }
      catch (e) { songCache = []; }
      return songCache;
    }
    function freeStorageRoom() {
      try { localStorage.removeItem("enquiz-anon-backup"); } catch (e) {}
      if (viewAccount || viewSwitching) return;
      const raw = localStorage.getItem(ADDED_KEY);
      if (!raw) return;
      try { idbPutAdded(JSON.parse(raw)); } catch (e) {}
      try { localStorage.removeItem(ADDED_KEY); } catch (e) {}
    }
    function writeSongs(list) {
      songCache = list;
      const raw = JSON.stringify(list);
      try {
        localStorage.setItem(SONG_KEY, raw);
        return;
      } catch (e) {}
      freeStorageRoom();
      try {
        localStorage.setItem(SONG_KEY, raw);
      } catch (e) {}
      if (!viewAccount) idbPutSongs(list);
    }
    function saveSongs(list, song, cards) {
      writeSongs(list);
      // Song metadata belongs to the viewed student only when Open pages shows songs (developer).
      if (viewAccount && hideStudentSongs()) return;
      if (song && song.id) {
        const copy = Object.assign({}, song);
        delete copy.blob;
        const change = { op: "put-song", song: copy };
        if (cards && cards.length) change.cards = cards.map((card) => {
          const next = Object.assign({}, card);
          delete next.blob;
          return next;
        });
        syncChange(change);
      }
    }
    function storeLyricSong(song, cards) {
      const list = loadSongs();
      const index = list.findIndex((item) => item && item.id === song.id);
      if (index >= 0) list[index] = song;
      else list.push(song);
      saveSongs(list, song, cards);
      return index < 0;
    }
    function visibleSongs() {
      return loadSongs().filter((song) => !song.archived);
    }
    function cardIndex() {
      const map = new Map();
      words.forEach((item) => { if (cardVisible(item)) map.set(item.en.toLowerCase(), { kind: "lesson", en: item.en }); });
      extraWords.forEach((item) => { if (cardVisible(item)) map.set(item.en.toLowerCase(), { kind: "extra", en: item.en }); });
      Object.keys(songCards).forEach((key) => {
        if (hideStudentSongs() || !cardVisible(songCards[key])) return;
        map.set(songCards[key].en.toLowerCase(), { kind: "song", en: songCards[key].en, key: key });
      });
      phrasalWords.forEach((item) => {
        if (!item || !cardVisible(item)) return;
        const key = String(item.en || "").trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { kind: "phrasal", en: item.en });
      });
      idiomWords.forEach((item) => {
        if (!item || !cardVisible(item)) return;
        const key = String(item.en || "").trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { kind: "idioms", en: item.en });
      });
      loadAdded().forEach((item) => {
        const key = String(item.word || item.en || "").trim().toLowerCase();
        if (!key || map.has(key)) return;
        const place = item.place || "mine";
        const kind = place === "phrasal" || place === "idioms" ? place : "added";
        map.set(key, { kind: kind, en: item.word || item.en });
      });
      (window.IRREGULAR || []).forEach((verb) => {
        if (!cardVisible(verb)) return;
        [verb.base, verb.past, verb.pp].forEach((form) => {
          verbAlts(form).forEach((alt) => {
            const key = String(alt || "").trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, { kind: "verb", en: verb.base });
          });
        });
      });
      return map;
    }
    function cardForLyric(key, map) {
      map = map || cardIndex();
      const raw = String(key || "").trim().toLowerCase();
      if (!raw) return null;
      if (map.has(raw)) return map.get(raw);
      const stems = [raw];
      if(typeof lemmaVerb==='function')stems.push(lemmaVerb(raw));
      if (raw.endsWith("ies") && raw.length > 4) stems.push(raw.slice(0, -3) + "y");
      if (raw.endsWith("es") && raw.length > 3) stems.push(raw.slice(0, -2));
      if (raw.endsWith("s") && raw.length > 3) stems.push(raw.slice(0, -1));
      if (raw.endsWith("ing") && raw.length > 5) {
        stems.push(raw.slice(0, -3));
        stems.push(raw.slice(0, -3) + "e");
        if(/([a-z])\1ing$/.test(raw))stems.push(raw.slice(0,-4));
      }
      if (raw.endsWith("ed") && raw.length > 4) {
        stems.push(raw.slice(0, -2));
        stems.push(raw.slice(0, -1));
      }
      for (let i = 0; i < stems.length; i++) {
        if (map.has(stems[i])) return map.get(stems[i]);
      }
      return null;
    }
    function lyricCard(key) {
      const map = cardIndex();
      function put(en, kind) {
        const id = String(en || "").trim().toLowerCase();
        if (id && !map.has(id)) map.set(id, { kind: kind || "known", en: en });
      }
      [ask07, lines21, phrases09, adverbs14, talk16, likes23].forEach((list) => {
        (list || []).forEach((item) => { if (item && cardVisible(item)) put(item.en, "lesson"); });
      });
      loadAdded().forEach((item) => put(item.word || item.en, "added"));
      return cardForLyric(key, map);
    }
    function lyricShownMark(key, marks) {
      const saved = marks && marks[key];
      if (saved && saved.state !== "miss" && saved.state !== "error") return saved;
      const known = lyricCard(key);
      if (known) return { state: "have", word: known.en || key };
      return saved || null;
    }
