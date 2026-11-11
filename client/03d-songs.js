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
    function parseLrcTimestamp(tag) {
      const match = String(tag || "").match(/(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?/);
      if (!match) return null;
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? (match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10)) : 0;
      return mins * 60 + secs + ms / 1000;
    }
    function formatLrcTimestamp(seconds) {
      const s = Math.max(0, Number(seconds) || 0);
      const mins = Math.floor(s / 60);
      const remSecs = (s % 60).toFixed(2);
      const padMins = String(mins).padStart(2, "0");
      const padSecs = String(remSecs).padStart(5, "0");
      return "[" + padMins + ":" + padSecs + "]";
    }
    function interpolateWordTimings(lineText, start, end) {
      const words = String(lineText || "").split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const totalChars = words.reduce((acc, w) => acc + w.length, 0);
      const totalDuration = Math.max(0.2, (end - start));
      const res = [];
      let cursor = start;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const share = totalChars > 0 ? (w.length / totalChars) : (1 / words.length);
        const dur = Math.max(0.05, totalDuration * share);
        const wEnd = (i === words.length - 1) ? end : cursor + dur;
        res.push({ word: w, start: cursor, end: wEnd });
        cursor = wEnd;
      }
      return res;
    }
    function parseLrc(lrcText) {
      const text = String(lrcText || "");
      const lines = text.split(/\r?\n/);
      const metadata = {};
      const parsedLines = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const metaMatch = trimmed.match(/^\[(ti|ar|al|by|offset|length):([^\]]*)\]/i);
        if (metaMatch) {
          metadata[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
          return;
        }

        const timeMatch = trimmed.match(/^\[(\d{1,2}:\d{2}(?:\.\d{2,3})?)\](.*)$/);
        if (timeMatch) {
          const lineStart = parseLrcTimestamp(timeMatch[1]);
          const rest = timeMatch[2].trim();
          if (lineStart === null) return;

          const wordMatches = [...rest.matchAll(/<(\d{1,2}:\d{2}(?:\.\d{2,3})?)>([^<]*)/g)];
          const words = [];
          if (wordMatches.length > 0) {
            for (let i = 0; i < wordMatches.length; i++) {
              const wStart = parseLrcTimestamp(wordMatches[i][1]);
              const rawWord = wordMatches[i][2].trim();
              const wEnd = (i + 1 < wordMatches.length)
                ? parseLrcTimestamp(wordMatches[i + 1][1])
                : wStart + Math.max(0.3, rawWord.length * 0.08);
              if (rawWord) {
                words.push({ word: rawWord, start: wStart, end: wEnd });
              }
            }
          }

          const cleanText = rest.replace(/<[^>]+>/g, "").trim();
          parsedLines.push({
            start: lineStart,
            end: null,
            text: cleanText,
            words: words
          });
        }
      });

      parsedLines.sort((a, b) => a.start - b.start);

      for (let i = 0; i < parsedLines.length; i++) {
        const cur = parsedLines[i];
        const next = parsedLines[i + 1];
        if (next && next.start > cur.start) {
          cur.end = next.start;
        } else {
          cur.end = cur.start + Math.max(2.0, cur.text.length * 0.07);
        }

        if (cur.words.length === 0 && cur.text) {
          cur.words = interpolateWordTimings(cur.text, cur.start, cur.end);
        }
      }

      return { metadata: metadata, lines: parsedLines };
    }
    function formatLrc(timings) {
      if (!timings || !Array.isArray(timings.lines)) return "";
      let out = "";
      if (timings.metadata) {
        Object.entries(timings.metadata).forEach(([k, v]) => {
          if (v) out += "[" + k + ":" + v + "]\n";
        });
      }
      timings.lines.forEach((l) => {
        const lineTag = formatLrcTimestamp(l.start);
        if (l.words && l.words.length > 0 && l.words.some((w) => w.start != null)) {
          let wordStr = "";
          l.words.forEach((w) => {
            const wTag = "<" + formatLrcTimestamp(w.start).slice(1, -1) + ">";
            wordStr += wTag + w.word + " ";
          });
          out += lineTag + wordStr.trimEnd() + "\n";
        } else {
          out += lineTag + (l.text || "") + "\n";
        }
      });
      return out.trim();
    }
    function findActiveTiming(timings, currentTime) {
      if (!timings || !Array.isArray(timings.lines) || timings.lines.length === 0) return null;
      const t = Number(currentTime) || 0;
      const lines = timings.lines;
      let activeLineIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (t >= lines[i].start && (lines[i].end == null || t < lines[i].end)) {
          activeLineIndex = i;
          break;
        }
      }

      if (activeLineIndex < 0) {
        if (t < lines[0].start) activeLineIndex = 0;
        else activeLineIndex = lines.length - 1;
      }

      const activeLine = lines[activeLineIndex];
      let activeWordIndex = -1;
      let wordProgress = 0;

      if (activeLine && activeLine.words && activeLine.words.length > 0) {
        for (let j = 0; j < activeLine.words.length; j++) {
          const w = activeLine.words[j];
          if (t >= w.start && t <= w.end) {
            activeWordIndex = j;
            const span = w.end - w.start;
            wordProgress = span > 0 ? Math.max(0, Math.min(1, (t - w.start) / span)) : 1;
            break;
          }
        }
      }

      return {
        lineIndex: activeLineIndex,
        line: activeLine,
        wordIndex: activeWordIndex,
        word: (activeLine && activeLine.words && activeWordIndex >= 0) ? activeLine.words[activeWordIndex] : null,
        wordProgress: wordProgress
      };
    }
    function stripTimestamps(text) {
      if (!text) return "";
      return String(text)
        .replace(/^\[(ti|ar|al|by|offset|length):[^\]]*\]\r?\n?/gmi, "")
        .replace(/(?:\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]|<\d{1,2}:\d{2}(?:\.\d{2,3})?>)/g, "")
        .replace(/^[ \t]+/gm, "");
    }
    function generateAutoTimings(lyricsText, totalDuration = 180) {
      const clean = stripTimestamps(lyricsText);
      const rawLines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (rawLines.length === 0) return { metadata: {}, lines: [] };
      const duration = Math.max(30, Number(totalDuration) || 180);
      const introPad = 5.0;
      const availableDuration = Math.max(10, duration - introPad - 5.0);
      const totalChars = rawLines.reduce((acc, l) => acc + Math.max(5, l.length), 0);
      let cursor = introPad;
      const lines = [];

      for (let i = 0; i < rawLines.length; i++) {
        const lineText = rawLines[i];
        const lineShare = Math.max(5, lineText.length) / totalChars;
        const lineDur = Math.max(1.8, availableDuration * lineShare);
        const lineStart = cursor;
        const lineEnd = lineStart + lineDur;
        const words = interpolateWordTimings(lineText, lineStart, lineEnd);
        lines.push({
          start: lineStart,
          end: lineEnd,
          text: lineText,
          words: words
        });
        cursor = lineEnd + 0.3;
      }
      return { metadata: {}, lines: lines };
    }
    function getSongTimingsForSource(song, source = "audio") {
      if (!song) return null;
      let timings = null;
      if (song.timings && typeof song.timings === "object") {
        if (Array.isArray(song.timings.lines)) {
          timings = song.timings;
        } else if (song.timings[source] && Array.isArray(song.timings[source].lines)) {
          timings = song.timings[source];
        } else if (song.timings.audio && Array.isArray(song.timings.audio.lines)) {
          timings = song.timings.audio;
        }
      }
      if (!timings && typeof parseLrc === "function" && song.lyrics) {
        const parsed = parseLrc(song.lyrics);
        if (parsed && Array.isArray(parsed.lines) && parsed.lines.length > 0 && parsed.lines[0].start != null) {
          timings = parsed;
        }
      }
      if (!timings && song.lyrics && typeof generateAutoTimings === "function") {
        timings = generateAutoTimings(song.lyrics, 180);
      }
      if (timings && song.timingOffsets && song.timingOffsets[source] != null) {
        const offset = Number(song.timingOffsets[source]) || 0;
        if (offset !== 0) {
          return {
            metadata: Object.assign({}, timings.metadata || {}, { offset: String(offset) }),
            lines: (timings.lines || []).map((l) => ({
              start: Math.max(0, l.start + offset),
              end: l.end != null ? Math.max(0, l.end + offset) : null,
              text: l.text,
              words: (l.words || []).map((w) => ({
                word: w.word,
                start: Math.max(0, w.start + offset),
                end: Math.max(0, w.end + offset)
              }))
            }))
          };
        }
      }
      return timings;
    }
