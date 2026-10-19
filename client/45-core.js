    function cardByEn(en) {
      const key = String(en || "").trim().toLowerCase();
      if (!key) return null;
      const banks = [words, extraWords, phrases09, adverbs14, talk16, likes23, ask07, lines21, phrasalWords, idiomWords];
      for (let i = 0; i < banks.length; i++) {
        const found = banks[i].find((item) => String(item.en || "").toLowerCase() === key || item.origin === key);
        if (found) return found;
      }
      return null;
    }
    let placeBoot = false;
    function resumePlace() {
      if (!accountChecked) return;
      if (workFromLocation()) return;
      let place = null;
      try { place = JSON.parse(sessionStorage.getItem("enquiz-place") || "null"); }
      catch (e) { place = null; }
      if (!place || !place.id || place.id === "home" || !document.getElementById(place.id)) return;
      if(place.id==='exams'){examSection=place.examSection||'active';examViewLevel=place.examViewLevel||'';examViewGroup=place.examViewGroup??null;}
      if (place.id === 'speakouteditor' && typeof stageResumeSpeakEditor === 'function') { stageResumeSpeakEditor(place); return; }
      if (place.id === "bugs" && !placeBoot) return;
      if (place.dayQuizPlace) dayQuizPlace = place.dayQuizPlace;
      if (place.dayReturn) dayReturn = place.dayReturn;
      const quiz = { dayq: 1, daychoice: 1, dayflip: 1, dayjudge: 1, choice: 1, flip: 1, type: 1, gap: 1, build: 1, judge: 1, tap: 1, multi: 1, pairs: 1, exam: 1, errors: 1 };
      if (quiz[place.id]) place.id = place.studyScreen || "setup";
      if (place.id === "song") {
        if (place.songId === "sample") { showSampleSong(); show("song"); return; }
        const song = loadSongs().find((item) => item.id === place.songId);
        if (song && !song.archived) { renderUserSong(song); show("song"); return; }
        if (place.songId && !placeBoot) return;
        show("music");
        return;
      }
      if (place.id === "musicword" && place.songKey && songCards[place.songKey]) {
        renderSong(place.songKey);
        show("musicword");
        return;
      }
      if (place.id === "word" && place.wordEn) {
        const card = cardByEn(place.wordEn);
        if (card) { current = card; renderWord(card); show("word"); return; }
      }
      if (place.id === "made" && place.madeWord) {
        const item = loadAdded().find((row) => String(row.word || "").toLowerCase() === String(place.madeWord).toLowerCase());
        if (item) { renderMade(item); show("made"); return; }
        if (!placeBoot) return;
        show("add");
        return;
      }
      if (place.id === "daywork" && place.workDay) { openDayWork(place.workDay, place.workKind, true); return; }
      if (place.id === "daywords" && place.lessonPlace) { openLessonWords(place.lessonPlace, true); return; }
      if (place.id === "rules" && place.lessonPlace) { openLessonRules(place.lessonPlace, true); return; }
      if (place.id === "daysetup") {
        if (place.dayReturn === "material") { lmOpenDayQuiz(); return; }
        openDayQuiz(place.dayQuizPlace || dayQuizPlace);
        return;
      }
      if (place.id === "setup") { openGlobalStudy(); return; }
      if ((place.id === "material" || place.id === "examblocks") && place.examId) {
        if (place.id === "material" && lmState?.examOwned && lmState.examId === place.examId && lmState.blockId === place.examBlockId) return;
        if (!examReady) { examPull().then(() => { if (examReady) resumePlace(); }); return; }
        examCurrentId = place.examId;
        const restoredExam=examFind(place.examId);
        examSection=place.examSection||({active:'assigned',ready:'ready',completed:'completed'})[restoredExam?.instanceStatus]||'active';
        examViewGroup=place.examViewGroup??restoredExam?.groupId??null;
        examViewLevel=place.examViewLevel||'';
        if(restoredExam?.studentId&&authUser?.role!=='USER'&&!viewAccount&&typeof materialReviewStudent!=='undefined'){
          materialReviewStudent={id:restoredExam.studentId,name:restoredExam.studentName,email:restoredExam.studentEmail};examResetWork();
        }
        if (place.id === "material") {
          examOpenBlock(place.examBlockId);
          if (lmState?.examOwned && lmState.examId === place.examId && lmState.blockId === place.examBlockId) show("material");
        }
        else show("examblocks");
        return;
      }
      if (place.id === "material") {
        lmEnsure();
        const found = place.materialId && lmLibrary && lmLibrary.materials.find((row) => row.id === place.materialId);
        if (found && lmLessonVisibleToViewer(found)) {
          lmState = found;
          lmLibrary.activeId = found.id;
          if (place.materialTab) found.tab = place.materialTab;
          found.mode = canEditLessons() && !found.published ? "edit" : "preview";
          show("material");
          return;
        }
        if (place.materialId && !placeBoot) return;
        show("days");
        return;
      }
      restore(place);
    }
    function finishPlace() {
      placeBoot = true;
      resumePlace();
      if(document.querySelector('section.on')?.id==='home'&&roleHome()!=='home')show('home');
    }
    function cardIdentity(item) {
      const word = String(item && item.word || "").trim().toLowerCase();
      if (!word) return "";
      return (item.place || "mine") + "|" + word;
    }
    function samePersonStudy() {
      const login = authUser && authUser.login;
      return login === "TsovakDev" || login === "Tsovak";
    }
    function applySharedStudy(state) {
      if (!samePersonStudy() || !state) return false;
      const localAdded = loadAdded();
      const added = Array.isArray(state.added) ? state.added.slice() : [];
      const seenCard = {};
      added.forEach((item) => {
        const key = cardIdentity(item);
        if (key) seenCard[key] = 1;
      });
      localAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (!key || seenCard[key]) return;
        added.push(item);
        seenCard[key] = 1;
      });
      const localSongs = loadSongs();
      const songs = Array.isArray(state.songs) ? state.songs.slice() : [];
      const seenSong = {};
      songs.forEach((song) => { if (song && song.id) seenSong[song.id] = 1; });
      localSongs.forEach((song) => {
        if (!song || !song.id || seenSong[song.id]) return;
        songs.push(song);
        seenSong[song.id] = 1;
      });
      const variants = state.variants && typeof state.variants === "object" && !Array.isArray(state.variants) ? state.variants : {};
      const edits = state.stats && state.stats.cardEdits && typeof state.stats.cardEdits === "object" && !Array.isArray(state.stats.cardEdits) ? state.stats.cardEdits : {};
      const learned = Array.isArray(state.learned) ? state.learned : [];
      const mistakeMap = {};
      const savedMistakes = state.stats && Array.isArray(state.stats.mistakes) ? state.stats.mistakes : [];
      savedMistakes.forEach((row) => {
        if (row && row.en && row.type && row.misses > 0) mistakeMap[String(row.en).toLowerCase() + "|" + row.type] = row;
      });
      let before = "";
      try {
        before = JSON.stringify([
          loadAdded(),
          loadSongs(),
          JSON.parse(localStorage.getItem(VARIANT_KEY) || "{}"),
          JSON.parse(localStorage.getItem(EDIT_KEY) || "{}"),
          JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]"),
          loadMistakeMap()
        ]);
      } catch (e) { before = ""; }
      rememberAdded(added);
      writeSongs(songs);
      try { localStorage.setItem(VARIANT_KEY, JSON.stringify(variants)); } catch (e) {}
      try { localStorage.setItem(LEARNED_KEY, JSON.stringify(learned)); } catch (e) {}
      try { localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeMap)); } catch (e) {}
      if (Object.keys(edits).length) {
        try { localStorage.setItem(EDIT_KEY, JSON.stringify(edits)); } catch (e) {}
      } else localStorage.removeItem(EDIT_KEY);
      let after = "";
      try { after = JSON.stringify([added, songs, variants, edits, learned, mistakeMap]); } catch (e) { after = "changed"; }
      if (before === after) return false;
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      return true;
    }
    function takeNewCards(state) {
      const serverAdded = state && Array.isArray(state.added) ? state.added : [];
      if (!serverAdded.length) return false;
      const localAdded = loadAdded();
      const seen = {};
      localAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (key) seen[key] = 1;
      });
      const next = localAdded.slice();
      let changed = false;
      serverAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (!key || seen[key]) return;
        next.push(item);
        seen[key] = 1;
        changed = true;
      });
      if (changed) rememberAdded(next);
      return changed;
    }
