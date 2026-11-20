// Full Focus Mode Step-by-Step Interactive Player with Adaptive Remediation (Stages 14 & 15)
(function() {
  let focusActive = false;
  let focusQuestions = [];
  let focusIndex = 0;
  let focusSelectedOption = null;
  let focusResults = {}; // index -> boolean (true: correct, false: incorrect)
  let sessionConceptErrors = new Map(); // concept -> count of errors in this session
  let focusAllQuestions = [];
  let focusActiveScope = 'all'; // 'words_phrases' | 'classwork_homework' | 'single' | 'all'
  let focusActiveSubCategory = 'words'; // 'words' | 'phrases' | 'classwork' | 'homework'
  let focusScopeMenuOpen = false;
  let modalSelectedScope = 'all';
  let modalSelectedSubCat = 'words';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function extractFocusQuestionsFromLesson(lesson) {
    if (!lesson || !Array.isArray(lesson.blocks)) return [];
    const questions = [];
    lesson.blocks.forEach((b, bIdx) => {
      if ((b.tab === 'words' || b.type === 'wordcard' || b.type === 'word') && (Array.isArray(b.items) || b.word)) {
        const items = Array.isArray(b.items) && b.items.length ? b.items : [{ word: b.word, translation: b.translation || b.meaning || b.ru }];
        items.forEach((it, itIdx) => {
          const w = String(it.word || it.en || b.word || 'Vocabulary').trim();
          if (!w) return;
          const meaning = String(it.translation || it.meaning || it.ru || w).trim();
          questions.push({
            id: 'word-' + bIdx + '-' + itIdx,
            category: 'words',
            title: 'Vocabulary: ' + w,
            concept: w,
            prompt: 'Identify the definition of "' + w + '":',
            options: [meaning, 'Alternative form', 'Unrelated context'],
            answer: 0,
            feedback: '"' + w + '" means: ' + meaning
          });
        });
      } else if (b.type === 'phrase' || b.tab === 'phrases') {
        const items = Array.isArray(b.items) && b.items.length ? b.items : [{
          phrase: b.title || b.word || 'Phrase',
          meaning: b.meaning || b.translation || b.ru || 'Expression',
          example: b.example || ''
        }];
        const allMeanings = items.map(it => String(it.translation || it.meaning || it.ru || '').trim()).filter(Boolean);
        items.forEach((it, itIdx) => {
          const phraseText = String(it.phrase || it.word || it.en || b.title || 'Phrase').trim();
          if (!phraseText) return;
          const meaning = String(it.translation || it.meaning || it.ru || phraseText).trim();
          const example = String(it.example || ('Usage: "' + phraseText + '" in everyday English.')).trim();
          const distractors = allMeanings.filter(m => m !== meaning);
          const opt1 = distractors[0] || 'Alternative colloquial usage';
          const opt2 = distractors[1] || 'Opposite contextual meaning';
          questions.push({
            id: 'phrase-' + (b.id || bIdx) + '-' + itIdx,
            category: 'phrases',
            title: 'Phrase: ' + phraseText,
            concept: phraseText,
            prompt: 'Select the correct meaning for the phrase "' + phraseText + '":',
            options: [meaning, opt1, opt2],
            answer: 0,
            feedback: '"' + phraseText + '": ' + meaning + (example ? ' (' + example + ')' : '')
          });
        });
      } else if (b.type === 'quiz') {
        const isHw = b.tab === 'homework' || b.homework === true || b.isHomework === true || /^(?:HW|Homework)\b/i.test(b.title || '');
        const item = b.items?.[0] || b;
        const concept = item.word || b.title?.replace(/^(?:HW|CW)\s+[^:]+:\s*/i, '') || 'Grammar & Usage';
        const options = item.options || [item.answer || 'Option A', 'Option B', 'Option C'];
        const ans = typeof item.answer === 'number' ? item.answer : 0;
        questions.push({
          id: 'quiz-' + (b.id || bIdx),
          category: isHw ? 'homework' : 'classwork',
          title: b.title || b.quizType || 'Quiz Task',
          concept,
          prompt: item.prompt || item.text || b.text || 'Choose the best option:',
          options,
          answer: ans,
          feedback: b.pdfTeacherNotes || item.feedback || 'Target concept: ' + concept
        });
      } else if (b.type === 'exercise' && Array.isArray(b.items)) {
        const isHw = b.tab === 'homework' || b.homework === true || b.isHomework === true || /^(?:HW|Homework)\b/i.test(b.title || '');
        b.items.forEach((it, itIdx) => {
          const concept = b.title || 'Exercise Practice';
          let title = b.title || '';
          let prompt = it.prompt || 'Select the correct statement:';
          if (!title && prompt.includes('\n')) {
            const parts = prompt.split(/\n+/).map(p => p.trim()).filter(Boolean);
            if (parts.length > 1) {
              title = parts[0];
              prompt = parts.slice(1).join(' ');
            }
          }
          questions.push({
            id: 'exercise-' + (b.id || bIdx) + '-' + itIdx,
            category: isHw ? 'homework' : 'classwork',
            title: title || 'Exercise',
            concept,
            prompt,
            options: it.options || ['Correct usage', 'Distractor 1', 'Distractor 2'],
            answer: it.answer || 0,
            feedback: b.pdfTeacherNotes || 'Correct answer matches standard grammar rule.'
          });
        });
      }
    });
    return questions;
  }

  function filterFocusQuestionsByScope(questions, scope, subCat) {
    if (!Array.isArray(questions)) return [];
    if (!scope || scope === 'all') return questions.slice();
    if (scope === 'words_phrases') {
      return questions.filter(q => q.category === 'words' || q.category === 'phrases');
    }
    if (scope === 'classwork_homework') {
      return questions.filter(q => q.category === 'classwork' || q.category === 'homework');
    }
    if (scope === 'single') {
      const target = subCat || 'words';
      return questions.filter(q => q.category === target);
    }
    return questions.slice();
  }

  function getFocusScopeCounts(allQuestions) {
    const counts = {
      words: 0,
      phrases: 0,
      classwork: 0,
      homework: 0,
      words_phrases: 0,
      classwork_homework: 0,
      all: 0
    };
    if (!Array.isArray(allQuestions)) return counts;
    allQuestions.forEach(q => {
      const cat = q.category || 'classwork';
      if (counts[cat] !== undefined) counts[cat]++;
    });
    counts.words_phrases = counts.words + counts.phrases;
    counts.classwork_homework = counts.classwork + counts.homework;
    counts.all = allQuestions.length;
    return counts;
  }

  function createScopeModalDom() {
    let overlay = document.getElementById('lmFocusScopeOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lmFocusScopeOverlay';
      overlay.className = 'focus-scope-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function renderFocusScopeModal() {
    const overlay = createScopeModalDom();
    const counts = getFocusScopeCounts(focusAllQuestions);

    let selectedCount = 0;
    if (modalSelectedScope === 'words_phrases') selectedCount = counts.words_phrases;
    else if (modalSelectedScope === 'classwork_homework') selectedCount = counts.classwork_homework;
    else if (modalSelectedScope === 'single') selectedCount = counts[modalSelectedSubCat] || 0;
    else selectedCount = counts.all;

    overlay.innerHTML =
      '<div class="focus-scope-modal" id="lmFocusScopeModal">' +
        '<div class="focus-scope-header">' +
          '<div>' +
            '<h2>Focus Mode Practice Scope</h2>' +
            '<div class="focus-scope-subtitle">Choose the practice scope for this session</div>' +
          '</div>' +
          '<button type="button" class="focus-close-btn" id="focusScopeCloseBtn">✕</button>' +
        '</div>' +
        '<div class="focus-scope-grid">' +
          '<div class="focus-scope-card ' + (modalSelectedScope === 'words_phrases' ? 'is-active' : '') + '" data-scope="words_phrases">' +
            '<div class="focus-scope-row">' +
              '<div class="focus-scope-title-wrap">' +
                '<span class="focus-scope-icon">📚</span>' +
                '<span class="focus-scope-title">Words &amp; Phrases</span>' +
              '</div>' +
              '<span class="focus-scope-badge">' + counts.words_phrases + ' items</span>' +
            '</div>' +
            '<div class="focus-scope-desc">Vocabulary cards, definitions and collocations</div>' +
          '</div>' +

          '<div class="focus-scope-card ' + (modalSelectedScope === 'classwork_homework' ? 'is-active' : '') + '" data-scope="classwork_homework">' +
            '<div class="focus-scope-row">' +
              '<div class="focus-scope-title-wrap">' +
                '<span class="focus-scope-icon">📝</span>' +
                '<span class="focus-scope-title">Classwork &amp; Homework</span>' +
              '</div>' +
              '<span class="focus-scope-badge">' + counts.classwork_homework + ' items</span>' +
            '</div>' +
            '<div class="focus-scope-desc">Interactive exercises, grammar tasks and assignments</div>' +
          '</div>' +

          '<div class="focus-scope-card ' + (modalSelectedScope === 'single' ? 'is-active' : '') + '" data-scope="single">' +
            '<div class="focus-scope-row">' +
              '<div class="focus-scope-title-wrap">' +
                '<span class="focus-scope-icon">🎯</span>' +
                '<span class="focus-scope-title">Single Category</span>' +
              '</div>' +
              '<span class="focus-scope-badge">' + (counts[modalSelectedSubCat] || 0) + ' items</span>' +
            '</div>' +
            '<div class="focus-scope-desc">Focus strictly on one specific material type</div>' +
            '<div class="focus-sub-pills">' +
              '<button type="button" class="focus-sub-pill ' + (modalSelectedSubCat === 'words' ? 'is-selected' : '') + '" data-subcat="words">Words (' + counts.words + ')</button>' +
              '<button type="button" class="focus-sub-pill ' + (modalSelectedSubCat === 'phrases' ? 'is-selected' : '') + '" data-subcat="phrases">Phrases (' + counts.phrases + ')</button>' +
              '<button type="button" class="focus-sub-pill ' + (modalSelectedSubCat === 'classwork' ? 'is-selected' : '') + '" data-subcat="classwork">Classwork (' + counts.classwork + ')</button>' +
              '<button type="button" class="focus-sub-pill ' + (modalSelectedSubCat === 'homework' ? 'is-selected' : '') + '" data-subcat="homework">Homework (' + counts.homework + ')</button>' +
            '</div>' +
          '</div>' +

          '<div class="focus-scope-card ' + (modalSelectedScope === 'all' ? 'is-active' : '') + '" data-scope="all">' +
            '<div class="focus-scope-row">' +
              '<div class="focus-scope-title-wrap">' +
                '<span class="focus-scope-icon">⚡</span>' +
                '<span class="focus-scope-title">All Together</span>' +
              '</div>' +
              '<span class="focus-scope-badge">' + counts.all + ' items</span>' +
            '</div>' +
            '<div class="focus-scope-desc">Comprehensive session covering all available lesson materials</div>' +
          '</div>' +
        '</div>' +
        '<div class="focus-scope-actions">' +
          '<button type="button" class="btn secondary" id="focusScopeCancelBtn">Cancel</button>' +
          '<button type="button" class="btn primary" id="focusScopeStartBtn" ' + (selectedCount === 0 ? 'disabled' : '') + '>Start Focus Mode (' + selectedCount + ') →</button>' +
        '</div>' +
      '</div>';
  }

  function openFocusScopeModal() {
    modalSelectedScope = focusActiveScope || 'all';
    modalSelectedSubCat = focusActiveSubCategory || 'words';
    const overlay = createScopeModalDom();
    renderFocusScopeModal();
    overlay.style.display = 'flex';
  }

  function closeFocusScopeModal() {
    const overlay = document.getElementById('lmFocusScopeOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function startFocusSessionWithScope(scope, subCat) {
    focusActiveScope = scope || 'all';
    focusActiveSubCategory = subCat || 'words';
    focusQuestions = filterFocusQuestionsByScope(focusAllQuestions, focusActiveScope, focusActiveSubCategory);
    if (!focusQuestions || focusQuestions.length === 0) {
      alert('No questions found for the selected practice scope.');
      return;
    }
    closeFocusScopeModal();
    focusActive = true;
    focusIndex = 0;
    focusSelectedOption = null;
    focusResults = {};
    sessionConceptErrors.clear();
    focusScopeMenuOpen = false;
    renderFocusPlayer();
  }

  function switchFocusScope(newScope, newSubCat) {
    focusActiveScope = newScope || 'all';
    if (newSubCat) focusActiveSubCategory = newSubCat;
    focusScopeMenuOpen = false;
    const filtered = filterFocusQuestionsByScope(focusAllQuestions, focusActiveScope, focusActiveSubCategory);
    if (!filtered || filtered.length === 0) {
      alert('No questions found for this category in the current lesson.');
      renderFocusPlayer();
      return;
    }
    focusQuestions = filtered;
    focusIndex = 0;
    focusSelectedOption = null;
    focusResults = {};
    sessionConceptErrors.clear();
    renderFocusPlayer();
  }

  function createPlayerDom() {
    let overlay = document.getElementById('lmFocusPlayerOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lmFocusPlayerOverlay';
      overlay.className = 'focus-player-overlay';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function renderFocusPlayer() {
    const overlay = createPlayerDom();
    if (!focusActive || focusQuestions.length === 0) {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'flex';
    const total = focusQuestions.length;
    const currentQ = focusQuestions[focusIndex] || {};
    const hasResult = focusResults[focusIndex] !== undefined;
    const isCorrect = focusResults[focusIndex] === true;

    // Segmented progress bar
    const progressSegments = focusQuestions.map((q, idx) => {
      let statusClass = 'is-unvisited';
      if (idx === focusIndex) statusClass = 'is-current';
      else if (focusResults[idx] === true) statusClass = 'is-correct';
      else if (focusResults[idx] === false) statusClass = 'is-incorrect';
      return '<div class="focus-segment ' + statusClass + '" data-focus-jump="' + idx + '" title="Question ' + (idx + 1) + '"></div>';
    }).join('');

    // Bottom strip chips
    const stripChips = focusQuestions.map((q, idx) => {
      let statusClass = '';
      if (idx === focusIndex) statusClass = 'is-current';
      else if (focusResults[idx] === true) statusClass = 'is-correct';
      else if (focusResults[idx] === false) statusClass = 'is-incorrect';
      return '<button type="button" class="focus-strip-chip ' + statusClass + '" data-focus-jump="' + idx + '">' + (idx + 1) + '</button>';
    }).join('');

    const optionsHtml = (currentQ.options || []).map((opt, i) => {
      const isSelected = focusSelectedOption === i;
      let optClass = 'focus-option-btn';
      if (isSelected) optClass += ' is-selected';
      if (hasResult) {
        if (i === currentQ.answer) optClass += ' is-correct-opt';
        else if (isSelected && !isCorrect) optClass += ' is-incorrect-opt';
      }
      return '<button type="button" class="' + optClass + '" data-focus-option="' + i + '" ' + (hasResult ? 'disabled' : '') + '>' +
        '<span class="focus-option-key">' + (i + 1) + '</span>' +
        '<span>' + esc(opt) + '</span>' +
      '</button>';
    }).join('');

    // Title & prompt separation and formatting
    let kicker = 'Practice Task';
    let exerciseTitle = '';
    let promptRaw = String(currentQ.prompt || '');

    if (currentQ.category === 'phrases') {
      kicker = 'Phrase & Collocation';
      exerciseTitle = currentQ.title || '';
    } else if (currentQ.category === 'words') {
      kicker = 'Vocabulary';
      exerciseTitle = currentQ.title || '';
    } else if (currentQ.category === 'homework') {
      kicker = 'Homework';
      exerciseTitle = currentQ.title || '';
    } else if (currentQ.category === 'classwork') {
      kicker = 'Classwork';
      exerciseTitle = currentQ.title || '';
    } else if (currentQ.title) {
      if (/^exercise$/i.test(currentQ.title)) {
        kicker = 'Exercise';
      } else {
        kicker = 'Exercise';
        exerciseTitle = currentQ.title;
      }
    }

    if (promptRaw.includes('\n')) {
      const lines = promptRaw.split(/\n+/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        if (!exerciseTitle) {
          exerciseTitle = lines[0];
          promptRaw = lines.slice(1).join(' ');
        }
      }
    }

    // Format prompt text: escape HTML, then highlight single-quoted and double-quoted target words
    const formattedPrompt = esc(promptRaw).replace(/(?:'([^']+)'|&quot;([^&]+)&quot;)/g, (match) => {
      return '<strong>' + match + '</strong>';
    });

    let scopeLabel = 'Scope: All';
    if (focusActiveScope === 'words_phrases') {
      scopeLabel = 'Scope: Words & Phrases';
    } else if (focusActiveScope === 'classwork_homework') {
      scopeLabel = 'Scope: CW & HW';
    } else if (focusActiveScope === 'single') {
      if (focusActiveSubCategory === 'words') scopeLabel = 'Scope: Only Words';
      else if (focusActiveSubCategory === 'phrases') scopeLabel = 'Scope: Only Phrases';
      else if (focusActiveSubCategory === 'classwork') scopeLabel = 'Scope: Only CW';
      else if (focusActiveSubCategory === 'homework') scopeLabel = 'Scope: Only HW';
      else scopeLabel = 'Scope: Single Category';
    }

    const counts = getFocusScopeCounts(focusAllQuestions.length ? focusAllQuestions : focusQuestions);

    const scopeMenuHtml = focusScopeMenuOpen ? (
      '<div class="focus-scope-menu" id="focusScopeMenu">' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'words_phrases' ? 'is-active' : '') + '" data-switch-scope="words_phrases"><span>📚 Words &amp; Phrases</span><span>' + counts.words_phrases + '</span></button>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'classwork_homework' ? 'is-active' : '') + '" data-switch-scope="classwork_homework"><span>📝 Classwork &amp; Homework</span><span>' + counts.classwork_homework + '</span></button>' +
        '<div class="focus-menu-divider"></div>' +
        '<div class="focus-menu-label">Single Category</div>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'single' && focusActiveSubCategory === 'words' ? 'is-active' : '') + '" data-switch-scope="single" data-switch-subcat="words"><span>Words</span><span>' + counts.words + '</span></button>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'single' && focusActiveSubCategory === 'phrases' ? 'is-active' : '') + '" data-switch-scope="single" data-switch-subcat="phrases"><span>Phrases</span><span>' + counts.phrases + '</span></button>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'single' && focusActiveSubCategory === 'classwork' ? 'is-active' : '') + '" data-switch-scope="single" data-switch-subcat="classwork"><span>Classwork</span><span>' + counts.classwork + '</span></button>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'single' && focusActiveSubCategory === 'homework' ? 'is-active' : '') + '" data-switch-scope="single" data-switch-subcat="homework"><span>Homework</span><span>' + counts.homework + '</span></button>' +
        '<div class="focus-menu-divider"></div>' +
        '<button type="button" class="focus-menu-item ' + (focusActiveScope === 'all' ? 'is-active' : '') + '" data-switch-scope="all"><span>⚡ All Together</span><span>' + counts.all + '</span></button>' +
      '</div>'
    ) : '';

    const scopeSelectorHtml =
      '<div class="focus-scope-selector-wrap">' +
        '<button type="button" class="focus-scope-selector-btn" id="focusHeaderScopeBtn">' +
          '<span>🎯</span>' +
          '<span>' + esc(scopeLabel) + '</span>' +
          '<span>▾</span>' +
        '</button>' +
        scopeMenuHtml +
      '</div>';

    overlay.innerHTML =
      '<div class="focus-player-header">' +
        '<div class="focus-q-count">Question ' + (focusIndex + 1) + ' of ' + total + '</div>' +
        '<div class="focus-progress-bar">' + progressSegments + '</div>' +
        '<div class="focus-header-tools">' +
          scopeSelectorHtml +
          '<span class="focus-hotkeys">⌨️ 1-4: Select | Enter: Next | Esc: Exit</span>' +
          '<button type="button" class="focus-close" id="lmFocusCloseBtn">✕</button>' +
        '</div>' +
      '</div>' +

      '<div class="focus-player-stage">' +
        '<div class="focus-card">' +
          '<div class="focus-kicker">' + esc(kicker) + '</div>' +
          (exerciseTitle ? '<div class="focus-exercise-title">' + esc(exerciseTitle) + '</div>' : '') +
          '<h2 class="focus-prompt">' + formattedPrompt + '</h2>' +
          '<div class="focus-options-container">' + optionsHtml + '</div>' +

          (hasResult ? (
            '<div class="focus-feedback ' + (isCorrect ? 'is-correct' : 'is-incorrect') + '">' +
              (isCorrect ? '✓ Correct! Excellent grasp of concept.' : '✗ Needs review. Target concept: ' + esc(currentQ.concept || '')) +
              '<div class="focus-feedback-detail">' + esc(currentQ.feedback || '') + '</div>' +
            '</div>'
          ) : '') +

          '<div class="focus-actions">' +
            '<button type="button" class="btn secondary" id="focusPrevBtn" ' + (focusIndex === 0 ? 'disabled' : '') + '>← Previous</button>' +
            (hasResult ? (
              '<button type="button" class="btn primary" id="focusNextBtn">' + (focusIndex < total - 1 ? 'Next question →' : 'Finish Session') + '</button>'
            ) : '') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="focus-player-footer">' +
        '<div class="focus-jump-label">Question Quick Jump:</div>' +
        '<div class="focus-strip">' + stripChips + '</div>' +
      '</div>';
  }

  function focusApplyAdaptiveRemediation(targetConcept) {
    const errorCount = (sessionConceptErrors.get(targetConcept) || 0) + 1;
    sessionConceptErrors.set(targetConcept, errorCount);

    const newTasks = [];
    if (errorCount === 1) {
      // Rule 1: First error on concept -> +2 targeted tasks in fresh contexts
      newTasks.push({
        id: 'adaptive-' + Date.now() + '-1',
        title: 'Adaptive Remediation: ' + targetConcept,
        concept: targetConcept,
        prompt: 'Fill in the blank with the appropriate word: "The team analyzed the ___ in depth."',
        options: [targetConcept, 'Variant form', 'Opposite concept'],
        answer: 0,
        feedback: 'Remediation task 1 of 2: reinforce "' + targetConcept + '" in a professional context.'
      });
      newTasks.push({
        id: 'adaptive-' + Date.now() + '-2',
        title: 'Adaptive Listening & Context: ' + targetConcept,
        concept: targetConcept,
        prompt: 'Select the statement that correctly represents: "' + targetConcept + '":',
        options: ['Accurate contextual definition of ' + targetConcept, 'Unrelated formal distractor', 'Opposite usage'],
        answer: 0,
        feedback: 'Remediation task 2 of 2: conceptual clarity in communication.'
      });
    } else {
      // Rule 2: Repeat error on same concept -> +1 reinforcement task
      newTasks.push({
        id: 'adaptive-' + Date.now() + '-repeat',
        title: 'Reinforcement Task: ' + targetConcept,
        concept: targetConcept,
        prompt: 'Evaluate: "' + targetConcept + '" is properly used in this context.',
        options: ['True: valid application of ' + targetConcept, 'False: incorrect form'],
        answer: 0,
        feedback: 'Reinforcement task: master the concept before finishing.'
      });
    }

    focusQuestions.push(...newTasks);
    return newTasks.length;
  }

  function focusCheckAnswer() {
    if (focusSelectedOption === null || focusResults[focusIndex] !== undefined) return;
    const currentQ = focusQuestions[focusIndex];
    if (!currentQ) return;

    const isCorrect = focusSelectedOption === currentQ.answer;
    focusResults[focusIndex] = isCorrect;

    if (!isCorrect) {
      const concept = currentQ.concept || currentQ.word || 'Target Concept';
      focusApplyAdaptiveRemediation(concept);
    }

    renderFocusPlayer();
  }

  function focusNextQuestion() {
    if (focusIndex < focusQuestions.length - 1) {
      focusIndex += 1;
      focusSelectedOption = null;
      renderFocusPlayer();
    } else {
      // Completed all questions - enforce strict 90% threshold (Stage 16)
      const correctCount = Object.values(focusResults).filter(Boolean).length;
      const totalCount = focusQuestions.length;
      const pct = Math.round((correctCount / totalCount) * 100);
      const passed = pct >= 90;
      const statusText = passed ? 'Passed (≥ 90%)' : 'Needs work (< 90%)';
      alert('Focus Mode Completed!\nScore: ' + correctCount + ' / ' + totalCount + ' (' + pct + '%)\nStatus: ' + statusText);
      closeFocusPlayer();
    }
  }

  function focusPrevQuestion() {
    if (focusIndex > 0) {
      focusIndex -= 1;
      focusSelectedOption = null;
      renderFocusPlayer();
    }
  }

  function focusSelectOption(optIdx) {
    if (focusResults[focusIndex] !== undefined) return;
    focusSelectedOption = optIdx;
    focusCheckAnswer();
  }

  function openFocusPlayer(customQuestions = null, scope = null, subCat = null) {
    if (customQuestions && Array.isArray(customQuestions)) {
      focusAllQuestions = customQuestions.slice();
      if (scope) {
        focusActiveScope = scope;
        focusActiveSubCategory = subCat || 'words';
        focusQuestions = filterFocusQuestionsByScope(focusAllQuestions, scope, subCat);
      } else {
        focusActiveScope = 'all';
        focusActiveSubCategory = 'words';
        focusQuestions = customQuestions.slice();
      }
      if (!focusQuestions || focusQuestions.length === 0) {
        alert('No quiz or exercise tasks available to practice in Focus Mode.');
        return;
      }
      focusActive = true;
      focusIndex = 0;
      focusSelectedOption = null;
      focusResults = {};
      sessionConceptErrors.clear();
      focusScopeMenuOpen = false;
      renderFocusPlayer();
      return;
    }

    const currentLesson = (typeof lmState !== 'undefined' && lmState) ? lmState : (typeof window !== 'undefined' && window.lmState ? window.lmState : null);
    focusAllQuestions = extractFocusQuestionsFromLesson(currentLesson);
    if (!focusAllQuestions || focusAllQuestions.length === 0) {
      alert('No quiz or exercise tasks available to practice in Focus Mode.');
      return;
    }

    if (scope) {
      startFocusSessionWithScope(scope, subCat);
    } else {
      openFocusScopeModal();
    }
  }

  function closeFocusPlayer() {
    focusActive = false;
    focusScopeMenuOpen = false;
    const overlay = document.getElementById('lmFocusPlayerOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  // Stage 17: Cumulative Topic Mastery Score (40% CW + 40% HW + 20% DQ)
  function calculateMasteryScore(params = {}) {
    const cw = typeof params.cwScore === 'number' ? params.cwScore : (Number(params.cwScore) || 0);
    const hw = typeof params.hwScore === 'number' ? params.hwScore : (Number(params.hwScore) || 0);
    const dq = typeof params.dqScore === 'number' ? params.dqScore : (Number(params.dqScore) || 0);
    const cwWeight = 0.40;
    const hwWeight = 0.40;
    const dqWeight = 0.20;
    const weightedScore = Math.round(cw * cwWeight + hw * hwWeight + dq * dqWeight);
    const passed = weightedScore >= 90;
    const status = passed ? 'Passed' : 'Needs work';
    return {
      cwScore: cw,
      hwScore: hw,
      dqScore: dq,
      cwWeight,
      hwWeight,
      dqWeight,
      score: weightedScore,
      passed,
      status,
      summary: 'Cumulative Topic Mastery: ' + weightedScore + '% (CW 40% [' + cw + '%] + HW 40% [' + hw + '%] + DQ 20% [' + dq + '%]) · Status: ' + status
    };
  }

  // Stage 16: Two-Factor Verification (Gemini AI Preliminary + Teacher Final Word)
  function evaluateTwoFactorSubmission(params = {}) {
    const aiScore = typeof params.aiScore === 'number' ? params.aiScore : (Number(params.aiScore) || 0);
    const aiFeedback = params.aiFeedback || 'Evaluation based on grammatical correctness and relevance.';
    const isApproved = !!params.approved;
    const teacherScore = params.teacherScore !== undefined && params.teacherScore !== null
      ? (typeof params.teacherScore === 'number' ? params.teacherScore : Number(params.teacherScore))
      : undefined;
    const teacherComment = params.teacherComment || '';

    const finalScore = isApproved
      ? (teacherScore !== undefined ? teacherScore : aiScore)
      : null;
    const passed = finalScore !== null ? finalScore >= 90 : false;
    const status = isApproved ? (passed ? 'Passed' : 'Needs work') : 'Pending Teacher Review';

    return {
      aiScore,
      aiFeedback,
      teacherScore,
      teacherComment,
      teacherVerified: isApproved,
      finalScore,
      passed,
      status,
      lastWord: 'Teacher'
    };
  }

  function renderTwoFactorReviewHtml(submission = {}) {
    const aiScore = submission.aiScore ?? 0;
    const aiFeedback = submission.aiFeedback || 'Automated linguistic evaluation.';
    const teacherScore = submission.teacherScore ?? aiScore;
    const teacherComment = submission.teacherComment || '';
    const isApproved = !!submission.teacherVerified;

    return '<div class="two-factor-review-card" data-two-factor-submission>' +
      '<div class="two-factor-header">' +
        '<strong style="font-size:13.5px; color:#1e293b;">Two-Factor Verification (Gemini AI + Teacher Final Word)</strong>' +
        (isApproved ? '<span class="lm-verified-badge">✓ Teacher Verified</span>' : '<span style="font-size:11.5px; color:#92400e; background:#fef3c7; padding:2px 8px; border-radius:4px; font-weight:700;">Pending Verification</span>') +
      '</div>' +
      '<div class="two-factor-scores">' +
        '<div class="two-factor-score-box">' +
          '<div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">1. Preliminary AI Evaluation</div>' +
          '<div style="font-size:18px; font-weight:800; color:#2563eb; margin:4px 0;">' + aiScore + '%</div>' +
          '<div style="font-size:12px; color:#475569;">' + esc(aiFeedback) + '</div>' +
        '</div>' +
        '<div class="two-factor-score-box">' +
          '<div style="font-size:11px; font-weight:700; color:#047857; text-transform:uppercase;">2. Teacher Final Score (Override)</div>' +
          '<div style="margin:6px 0; display:flex; align-items:center; gap:8px;">' +
            '<input type="number" min="0" max="100" class="saas-input" style="width:70px; font-size:16px; font-weight:800; padding:4px 8px;" data-teacher-override-score value="' + esc(String(teacherScore)) + '" />' +
            '<span style="font-size:14px; font-weight:700;">%</span>' +
          '</div>' +
          '<textarea class="saas-textarea" style="width:100%; box-sizing:border-box; font-size:12px; height:50px; padding:6px 8px; margin-top:4px;" placeholder="Teacher feedback or comment..." data-teacher-comment>' + esc(teacherComment) + '</textarea>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex; justify-content:flex-end; gap:8px; align-items:center; margin-top:8px;">' +
        '<button type="button" class="btn secondary saas-btn" style="font-size:12px; font-weight:700;" data-teacher-confirm-ai>Confirm AI Score (' + aiScore + '%)</button>' +
        '<button type="button" class="btn primary saas-btn" style="font-size:12px; font-weight:700; background:#059669; border-color:#059669;" data-teacher-approve>Approve Final Grade</button>' +
      '</div>' +
    '</div>';
  }

  // Stage 18: Voice Mode Controller (AI Tutor & Speaking Examiner)
  let voiceRecognition = null;
  const voiceSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let activeUtterance = null; // Keeps V8 GC from collecting utterance before onend
  let voiceWatchdogTimer = null;
  let voiceTimerInterval = null;
  let voiceSecondsElapsed = 0;
  let voiceActiveRole = 'tutor'; // 'tutor' | 'examiner'
  let oralExamStep = 0;
  let lastSubmittedTranscript = '';
  let lastSubmittedTimestamp = 0;
  let recognitionDebounceTimer = null;

  function voiceFormatTimer(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function voiceStartTimer() {
    voiceStopTimer();
    voiceSecondsElapsed = 0;
    const timerEl = document.getElementById('lmVoiceTimer');
    if (timerEl) {
      timerEl.style.display = 'inline-block';
      timerEl.textContent = '00:00';
    }
    voiceTimerInterval = setInterval(() => {
      voiceSecondsElapsed += 1;
      const el = document.getElementById('lmVoiceTimer');
      if (el) el.textContent = voiceFormatTimer(voiceSecondsElapsed);
    }, 1000);
  }

  function voiceStopTimer() {
    if (voiceTimerInterval) {
      clearInterval(voiceTimerInterval);
      voiceTimerInterval = null;
    }
  }

  function voiceGetLessonContext() {
    const title = (typeof lmState !== 'undefined' && lmState?.title) ? lmState.title : 'English Practice';
    const words = [];
    const rules = [];
    if (typeof lmState !== 'undefined' && Array.isArray(lmState?.blocks)) {
      lmState.blocks.forEach(b => {
        if ((b.type === 'wordcard' || b.type === 'vocab') && b.word) {
          words.push(b.word);
        } else if (b.type === 'rule' && (b.topic || b.title)) {
          rules.push(b.title || b.topic);
        } else if (b.type === 'phrase' && (b.phrase || b.text)) {
          words.push(b.phrase || b.text);
        }
      });
    }
    return { title, words, rules };
  }

  let voiceHistory = [];

  function voiceSetRole(role) {
    voiceActiveRole = role;
    voiceHistory = [];
    const tutorBtn = document.getElementById('lmVoiceRoleTutorBtn');
    const examBtn = document.getElementById('lmVoiceRoleExaminerBtn');
    if (tutorBtn) {
      tutorBtn.classList.toggle('on', role === 'tutor');
      tutorBtn.style.background = role === 'tutor' ? 'var(--acc, #2563eb)' : '#f1f5f9';
      tutorBtn.style.color = role === 'tutor' ? '#ffffff' : '#475569';
    }
    if (examBtn) {
      examBtn.classList.toggle('on', role === 'examiner');
      examBtn.style.background = role === 'examiner' ? '#d97706' : '#f1f5f9';
      examBtn.style.color = role === 'examiner' ? '#ffffff' : '#475569';
    }
    const history = document.getElementById('lmVoiceDialogueHistory');
    if (history) history.innerHTML = '';
    const ctx = voiceGetLessonContext();
    if (role === 'examiner') {
      oralExamStep = 0;
      const firstTargetWord = ctx.words[0] || 'challenge';
      const promptText = 'Speaking Examination started for ' + ctx.title + '. Question 1: Please explain the meaning of "' + firstTargetWord + '" and use it in a full sentence.';
      voiceAppendMessage('Speaking Examiner', promptText, true);
      voiceSpeakText(promptText);
    } else {
      const welcomeText = 'Hello! I am your AI language tutor for ' + ctx.title + '. You can speak or ask any questions about vocabulary and grammar.';
      voiceAppendMessage('AI Tutor', welcomeText, true);
      voiceSpeakText(welcomeText);
    }
  }

  function openVoiceMode() {
    const modal = document.getElementById('lmVoiceModeModal');
    if (modal) modal.style.display = 'flex';
    const statusEl = document.getElementById('lmVoiceStatus');
    if (statusEl) statusEl.textContent = 'Ready to listen';
    voiceStartTimer();
    voiceSetRole('tutor');
  }

  function closeVoiceMode() {
    const modal = document.getElementById('lmVoiceModeModal');
    if (modal) modal.style.display = 'none';
    voiceStopTimer();
    if (voiceWatchdogTimer) {
      clearTimeout(voiceWatchdogTimer);
      voiceWatchdogTimer = null;
    }
    if (voiceRecognition) {
      try { voiceRecognition.abort(); } catch (_) {}
      voiceRecognition = null;
    }
    if (voiceSynthesis) {
      try { voiceSynthesis.cancel(); } catch (_) {}
    }
    activeUtterance = null;
    const micBtn = document.getElementById('lmVoiceMicBtn');
    if (micBtn) micBtn.classList.remove('is-recording');
  }

  function voiceAppendMessage(sender, text, isAi = false) {
    const history = document.getElementById('lmVoiceDialogueHistory');
    if (!history) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'voice-msg ' + (isAi ? 'ai' : 'user');
    msgDiv.style.cssText = isAi
      ? 'background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; align-self:flex-start; max-width:85%;'
      : 'background:#2563eb; color:#ffffff; border-radius:8px; padding:8px 12px; align-self:flex-end; max-width:85%;';
    msgDiv.innerHTML = '<strong style="' + (isAi ? 'color:#2563eb;' : 'color:#ffffff;') + '">' + esc(sender) + ':</strong> ' + esc(text);
    history.appendChild(msgDiv);
    history.scrollTop = history.scrollHeight;
  }

  function voiceSpeakText(text) {
    if (!voiceSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      if (voiceSynthesis.speaking || voiceSynthesis.pending) {
        voiceSynthesis.cancel();
      }
      if (voiceWatchdogTimer) clearTimeout(voiceWatchdogTimer);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      activeUtterance = utterance; // Prevent V8 garbage collection
      const statusEl = document.getElementById('lmVoiceStatus');
      utterance.onstart = () => { if (statusEl) statusEl.textContent = 'AI Speaking...'; };
      utterance.onend = () => {
        activeUtterance = null;
        if (voiceWatchdogTimer) clearTimeout(voiceWatchdogTimer);
        if (statusEl) statusEl.textContent = 'Ready to listen';
      };
      utterance.onerror = () => {
        activeUtterance = null;
        if (voiceWatchdogTimer) clearTimeout(voiceWatchdogTimer);
        if (statusEl) statusEl.textContent = 'Ready to listen';
      };
      const durationMs = Math.max(1200, Math.min(8000, (text.length / 14) * 1000));
      voiceWatchdogTimer = setTimeout(() => {
        if (activeUtterance === utterance) {
          activeUtterance = null;
          if (statusEl && statusEl.textContent === 'AI Speaking...') {
            statusEl.textContent = 'Ready to listen';
          }
        }
      }, durationMs);
      voiceSynthesis.speak(utterance);
    } catch (_) {
      activeUtterance = null;
      const statusEl = document.getElementById('lmVoiceStatus');
      if (statusEl) statusEl.textContent = 'Ready to listen';
    }
  }

  function voiceGenerateReply(userPrompt) {
    const ctx = voiceGetLessonContext();
    const prompt = (userPrompt || '').trim();
    const textLower = prompt.toLowerCase();

    // 1. Speaking Examiner flow
    if (voiceActiveRole === 'examiner') {
      oralExamStep += 1;
      if (oralExamStep === 1) {
        const nextWord = ctx.words[1] || (ctx.rules[0] ? 'rule: ' + ctx.rules[0] : 'fluent expression');
        return 'Good answer! Pronunciation and phrasing are intelligible. Question 2: How would you describe your daily routine or a real situation using "' + nextWord + '"?';
      }
      if (oralExamStep === 2) {
        return 'Well articulated! Grammar and sentence structure meet standard conversational criteria. Question 3: What is the main contrast or rule to keep in mind when using ' + (ctx.rules[0] || 'verb tenses') + '?';
      }
      return 'Speaking Examination complete for ' + ctx.title + '! Evaluation: 92% Proficiency (B2 Standard). Good intonation and vocabulary retention. Teacher maintains final review authority.';
    }

    // 2. AI Tutor: Natural greetings & small talk
    if (textLower.includes('how are you') || textLower.includes("how're you") || textLower.includes('how do you do') || textLower.includes("how's it going")) {
      return "I am doing well, thank you! I am ready to practice English with you for " + ctx.title + ". How has your day been so far?";
    }
    if (textLower.includes('hello') || textLower.includes('hi') || textLower.includes('hey') || textLower.includes('good morning') || textLower.includes('good afternoon') || textLower.includes('good evening')) {
      return 'Hello! Wonderful to speak with you today. Would you like to practice vocabulary from ' + ctx.title + ', or shall we talk about your day?';
    }
    if (textLower.includes('thank') || textLower.includes('thanks')) {
      return "You are very welcome! You are doing a fantastic job speaking English. Would you like to try another question or practice a new word?";
    }
    if (textLower.includes('bye') || textLower.includes('goodbye') || textLower.includes('see you')) {
      return 'Goodbye! Excellent effort practicing today. Keep speaking regularly to build natural fluency. See you next lesson!';
    }

    // 3. Questions asked by learner
    if (textLower.startsWith('what is') || textLower.startsWith('what does') || textLower.includes('mean')) {
      const targetWord = ctx.words.find(w => textLower.includes(w.toLowerCase())) || ctx.words[0] || 'term';
      return 'That is a great question! In standard English, "' + targetWord + '" refers to an important concept in this lesson. Try forming a sentence where you use it!';
    }
    if (textLower.includes('can you help') || textLower.includes('how to say') || textLower.includes('how do you say')) {
      return 'Of course, I am here to help! A natural way to express that is by keeping your word order Subject-Verb-Object. Try saying it step by step!';
    }

    // 4. Personal expressions (I like, I think, I want, I am)
    if (textLower.includes('i like') || textLower.includes('i love') || textLower.includes('my favorite')) {
      return 'That sounds enjoyable! What makes you like that so much? Tell me more details about your experience in English.';
    }
    if (textLower.includes('i think') || textLower.includes('in my opinion') || textLower.includes('i believe')) {
      return 'That is a clear and well-reasoned thought. Expressing your personal opinion with confidence is essential for B2 fluency!';
    }
    if (textLower.includes('i want to') || textLower.includes('i would like to') || textLower.includes('i hope to')) {
      return 'A great ambition! What steps are you planning to take to accomplish that? You can describe them in English.';
    }

    // 5. Grammar & Vocabulary prompts
    if (textLower.includes('word') || textLower.includes('vocabulary')) {
      const sampleWord = ctx.words[0] || 'opportunity';
      return 'Let us practice the key vocabulary from ' + ctx.title + '. Try using the word "' + sampleWord + '" in a full sentence!';
    }
    if (textLower.includes('rule') || textLower.includes('grammar') || textLower.includes('tense')) {
      const sampleRule = ctx.rules[0] || 'subject-verb agreement';
      return 'For grammar accuracy in ' + ctx.title + ', focus on ' + sampleRule + '. What sentence structure would you like to review?';
    }
    if (textLower.includes('check') || textLower.includes('correct')) {
      return 'Your pronunciation and sentence structure sound intelligible! Keep practicing the intonation of question forms.';
    }

    // 6. Conversational rotation for general sentences (avoids repeating identical phrasing)
    const prompts = [
      'That is a fascinating perspective! How often does that happen in your everyday routine?',
      'Well phrased! Your vocabulary and pacing are clear. What other thoughts come to your mind about this topic?',
      'Nicely articulated! In conversational English, that flows smoothly. Could you give me a specific example?',
      'I appreciate you sharing that! Speaking spontaneously like this is great practice. What would you like to discuss next?',
      'Good conversational flow! You expressed that with clear grammar. Shall we test some vocabulary from ' + ctx.title + '?'
    ];
    let sum = 0;
    for (let i = 0; i < prompt.length; i++) sum += prompt.charCodeAt(i);
    return prompts[sum % prompts.length];
  }

  async function voiceRequestReply(userText) {
    const ctx = voiceGetLessonContext();
    const statusEl = document.getElementById('lmVoiceStatus');
    if (statusEl) statusEl.textContent = 'AI thinking...';
    const sender = voiceActiveRole === 'examiner' ? 'Speaking Examiner' : 'AI Tutor';

    let reply = '';
    if (typeof accountFetch === 'function') {
      try {
        const data = await accountFetch('/api/lessons/voice-reply', {
          method: 'POST',
          body: JSON.stringify({
            role: voiceActiveRole,
            title: ctx.title,
            words: ctx.words,
            rules: ctx.rules,
            history: voiceHistory,
            text: userText
          })
        });
        reply = String(data?.reply || '').trim();
      } catch (_) {}
    }
    if (!reply && typeof voiceGenerateReply === 'function') {
      reply = voiceGenerateReply(userText);
    }
    if (!reply) {
      reply = 'Dialogue is unavailable. Select a Conversation provider.';
    }
    if (userText) voiceHistory.push({ role: 'student', text: userText });
    voiceHistory.push({ role: 'tutor', text: reply });
    voiceAppendMessage(sender, reply, true);
    voiceSpeakText(reply);
  }

  function voiceSubmitUserText(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const now = Date.now();
    if (trimmed.toLowerCase() === lastSubmittedTranscript.toLowerCase() && now - lastSubmittedTimestamp < 2000) {
      return;
    }
    lastSubmittedTranscript = trimmed;
    lastSubmittedTimestamp = now;

    voiceAppendMessage('You', trimmed, false);
    const inputEl = document.getElementById('lmVoiceTextInput');
    if (inputEl) inputEl.value = '';
    const statusEl = document.getElementById('lmVoiceStatus');
    if (statusEl) statusEl.textContent = 'AI thinking...';

    voiceRequestReply(trimmed);
  }

  function createVoiceRecognition() {
    if (typeof window === 'undefined') return null;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return null;
    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl) statusEl.textContent = '● Listening to your voice...';
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.add('is-recording');
      };
      rec.onresult = (e) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const chunk = res[0]?.transcript || '';
          if (res.isFinal) {
            finalChunk += ' ' + chunk;
          } else {
            interimChunk += ' ' + chunk;
          }
        }
        const text = (finalChunk || interimChunk || e.results[0]?.[0]?.transcript || '').trim();
        if (!text) return;

        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl) statusEl.textContent = '● Heard: "' + (text.length > 35 ? text.slice(0, 35) + '...' : text) + '"';

        if (recognitionDebounceTimer) {
          clearTimeout(recognitionDebounceTimer);
          recognitionDebounceTimer = null;
        }

        recognitionDebounceTimer = setTimeout(() => {
          recognitionDebounceTimer = null;
          if (voiceRecognition) {
            try { voiceRecognition.stop(); } catch (_) {}
          }
          voiceSubmitUserText(text);
        }, finalChunk ? 300 : 650);
      };
      rec.onerror = (e) => {
        const statusEl = document.getElementById('lmVoiceStatus');
        const isDenied = e && (e.error === 'not-allowed' || e.error === 'service-not-allowed');
        if (statusEl) {
          statusEl.textContent = isDenied
            ? 'Microphone permission denied. Type your message below.'
            : 'Voice recognition error or timeout. Click Speak to retry.';
        }
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.remove('is-recording');
      };
      rec.onend = () => {
        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl && statusEl.textContent.includes('Listening')) {
          statusEl.textContent = 'Ready to listen';
        }
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.remove('is-recording');
      };
      return rec;
    } catch (_) {
      return null;
    }
  }

  function initVoiceMode() {
    if (typeof window === 'undefined') return;
    if (!voiceRecognition) {
      voiceRecognition = createVoiceRecognition();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      // Focus Mode Scope Modal triggers
      if (e.target.closest('#focusScopeCloseBtn') || e.target.closest('#focusScopeCancelBtn')) {
        e.preventDefault();
        closeFocusScopeModal();
        return;
      }
      const subPill = e.target.closest('.focus-sub-pill');
      if (subPill) {
        e.preventDefault();
        modalSelectedScope = 'single';
        modalSelectedSubCat = subPill.dataset.subcat || 'words';
        renderFocusScopeModal();
        return;
      }
      const scopeCard = e.target.closest('.focus-scope-card');
      if (scopeCard) {
        e.preventDefault();
        modalSelectedScope = scopeCard.dataset.scope || 'all';
        renderFocusScopeModal();
        return;
      }
      if (e.target.closest('#focusScopeStartBtn')) {
        e.preventDefault();
        startFocusSessionWithScope(modalSelectedScope, modalSelectedSubCat);
        return;
      }

      // Focus Mode Player triggers
      if (e.target.closest('#focusHeaderScopeBtn')) {
        e.preventDefault();
        focusScopeMenuOpen = !focusScopeMenuOpen;
        renderFocusPlayer();
        return;
      }
      const menuItem = e.target.closest('[data-switch-scope]');
      if (menuItem) {
        e.preventDefault();
        const newScope = menuItem.dataset.switchScope;
        const newSubCat = menuItem.dataset.switchSubcat;
        switchFocusScope(newScope, newSubCat);
        return;
      }
      if (focusScopeMenuOpen && !e.target.closest('#focusScopeMenu') && !e.target.closest('#focusHeaderScopeBtn')) {
        focusScopeMenuOpen = false;
        renderFocusPlayer();
      }

      if (e.target.closest('#lmFocusPlayerBtn')) {
        e.preventDefault();
        openFocusPlayer();
        return;
      }
      if (e.target.closest('#lmFocusCloseBtn')) {
        e.preventDefault();
        closeFocusPlayer();
        return;
      }
      // Voice Mode Triggers
      if (e.target.closest('#lmVoiceModeBtn') || e.target.closest('#lmVoiceModeBar')) {
        e.preventDefault();
        openVoiceMode();
        return;
      }
      if (e.target.closest('#lmVoiceCloseBtn')) {
        e.preventDefault();
        closeVoiceMode();
        return;
      }
      if (e.target.closest('#lmVoiceRoleTutorBtn')) {
        e.preventDefault();
        voiceSetRole('tutor');
        return;
      }
      if (e.target.closest('#lmVoiceRoleExaminerBtn')) {
        e.preventDefault();
        voiceSetRole('examiner');
        return;
      }
      if (e.target.closest('#lmVoiceSendBtn')) {
        e.preventDefault();
        const inputEl = document.getElementById('lmVoiceTextInput');
        if (inputEl) voiceSubmitUserText(inputEl.value);
        return;
      }
      if (e.target.closest('#lmVoiceMicBtn')) {
        e.preventDefault();
        const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
        if (!SpeechRec) {
          const statusEl = document.getElementById('lmVoiceStatus');
          if (statusEl) statusEl.textContent = 'Speech recognition is not supported in this browser. Please use text input.';
          const inputEl = document.getElementById('lmVoiceTextInput');
          if (inputEl) inputEl.focus();
          return;
        }
        if (voiceRecognition) {
          try { voiceRecognition.abort(); } catch (_) {}
        }
        voiceRecognition = createVoiceRecognition();
        if (voiceRecognition) {
          try {
            voiceRecognition.start();
          } catch (err) {
            const statusEl = document.getElementById('lmVoiceStatus');
            if (statusEl) statusEl.textContent = 'Could not start voice recognition. Please try typing.';
          }
        }
        return;
      }

      // Two-Factor Teacher Verification Actions
      const confirmAiBtn = e.target.closest('[data-teacher-confirm-ai]');
      if (confirmAiBtn) {
        e.preventDefault();
        const card = confirmAiBtn.closest('[data-two-factor-submission]');
        if (card) {
          const aiScoreText = card.querySelector('.two-factor-score-box div[style*="font-size:18px"]')?.textContent || '0';
          const aiScoreNum = parseInt(aiScoreText.replace(/\D/g, ''), 10) || 0;
          const overrideInput = card.querySelector('[data-teacher-override-score]');
          if (overrideInput) overrideInput.value = String(aiScoreNum);
        }
        return;
      }
      const approveGradeBtn = e.target.closest('[data-teacher-approve]');
      if (approveGradeBtn) {
        e.preventDefault();
        const card = approveGradeBtn.closest('[data-two-factor-submission]');
        if (card) {
          const overrideInput = card.querySelector('[data-teacher-override-score]');
          const commentInput = card.querySelector('[data-teacher-comment]');
          const score = overrideInput ? parseInt(overrideInput.value, 10) : 100;
          const comment = commentInput ? commentInput.value : '';
          const result = evaluateTwoFactorSubmission({
            aiScore: score,
            teacherScore: score,
            teacherComment: comment,
            approved: true
          });
          card.innerHTML = '<div style="padding:14px; background:#ecfdf5; border:1px solid #10b981; border-radius:8px; color:#065f46; font-weight:700;">' +
            '✓ Grade Approved by Teacher: ' + result.finalScore + '% (' + result.status + ')' +
            (comment ? '<div style="font-size:12px; font-weight:400; margin-top:4px;">Comment: ' + esc(comment) + '</div>' : '') +
          '</div>';
        }
        return;
      }

      const optBtn = e.target.closest('[data-focus-option]');
      if (optBtn) {
        e.preventDefault();
        const optIdx = parseInt(optBtn.dataset.focusOption, 10);
        focusSelectOption(optIdx);
        return;
      }
      if (e.target.closest('#focusCheckBtn')) {
        e.preventDefault();
        focusCheckAnswer();
        return;
      }
      if (e.target.closest('#focusNextBtn')) {
        e.preventDefault();
        focusNextQuestion();
        return;
      }
      if (e.target.closest('#focusPrevBtn')) {
        e.preventDefault();
        focusPrevQuestion();
        return;
      }
      const jumpChip = e.target.closest('[data-focus-jump]');
      if (jumpChip) {
        e.preventDefault();
        focusIndex = parseInt(jumpChip.dataset.focusJump, 10);
        focusSelectedOption = null;
        renderFocusPlayer();
        return;
      }
    });

    // Voice text enter key and bar accessibility
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'lmVoiceTextInput') {
        e.preventDefault();
        voiceSubmitUserText(e.target.value);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.id === 'lmVoiceModeBar') {
        e.preventDefault();
        openVoiceMode();
        return;
      }
    });

    // Hotkeys handler
    window.addEventListener('keydown', (e) => {
      if (!focusActive) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeFocusPlayer();
        return;
      }

      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        focusSelectOption(parseInt(e.key, 10) - 1);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (focusResults[focusIndex] === undefined) {
          focusCheckAnswer();
        } else {
          focusNextQuestion();
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusNextQuestion();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusPrevQuestion();
        return;
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.openFocusPlayer = openFocusPlayer;
    window.closeFocusPlayer = closeFocusPlayer;
    window.openFocusScopeModal = openFocusScopeModal;
    window.closeFocusScopeModal = closeFocusScopeModal;
    window.startFocusSessionWithScope = startFocusSessionWithScope;
    window.switchFocusScope = switchFocusScope;
    window.filterFocusQuestionsByScope = filterFocusQuestionsByScope;
    window.getFocusScopeCounts = getFocusScopeCounts;
    window.focusNextQuestion = focusNextQuestion;
    window.focusPrevQuestion = focusPrevQuestion;
    window.focusSelectOption = focusSelectOption;
    window.focusCheckAnswer = focusCheckAnswer;
    window.focusApplyAdaptiveRemediation = focusApplyAdaptiveRemediation;
    window.extractFocusQuestionsFromLesson = extractFocusQuestionsFromLesson;
    window.calculateMasteryScore = calculateMasteryScore;
    window.evaluateTwoFactorSubmission = evaluateTwoFactorSubmission;
    window.renderTwoFactorReviewHtml = renderTwoFactorReviewHtml;
    window.openVoiceMode = openVoiceMode;
    window.closeVoiceMode = closeVoiceMode;
    window.initVoiceMode = initVoiceMode;
    window.voiceSubmitUserText = voiceSubmitUserText;
    window.voiceSetRole = voiceSetRole;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.calculateMasteryScore = calculateMasteryScore;
    globalThis.evaluateTwoFactorSubmission = evaluateTwoFactorSubmission;
    globalThis.renderTwoFactorReviewHtml = renderTwoFactorReviewHtml;
    globalThis.extractFocusQuestionsFromLesson = extractFocusQuestionsFromLesson;
    globalThis.focusApplyAdaptiveRemediation = focusApplyAdaptiveRemediation;
    globalThis.filterFocusQuestionsByScope = filterFocusQuestionsByScope;
    globalThis.getFocusScopeCounts = getFocusScopeCounts;
    globalThis.openFocusPlayer = openFocusPlayer;
    globalThis.startFocusSessionWithScope = startFocusSessionWithScope;
    globalThis.switchFocusScope = switchFocusScope;
  }
})();
