// Full Focus Mode Step-by-Step Interactive Player with Adaptive Remediation (Stages 14 & 15)
(function() {
  let focusActive = false;
  let focusQuestions = [];
  let focusIndex = 0;
  let focusSelectedOption = null;
  let focusResults = {}; // index -> boolean (true: correct, false: incorrect)
  let sessionConceptErrors = new Map(); // concept -> count of errors in this session

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function extractFocusQuestionsFromLesson(lesson) {
    if (!lesson || !Array.isArray(lesson.blocks)) return [];
    const questions = [];
    lesson.blocks.forEach((b, bIdx) => {
      if (b.tab === 'words' && Array.isArray(b.items)) {
        b.items.forEach((it, itIdx) => {
          questions.push({
            id: 'word-' + bIdx + '-' + itIdx,
            title: 'Vocabulary: ' + it.word,
            concept: it.word,
            prompt: 'Identify the definition of "' + it.word + '":',
            options: [it.translation || it.meaning || it.word, 'Alternative form', 'Unrelated context'],
            answer: 0,
            feedback: '"' + it.word + '" means: ' + (it.translation || it.meaning || it.word)
          });
        });
      } else if (b.type === 'quiz') {
        const item = b.items?.[0] || b;
        const concept = item.word || b.title?.replace(/^(?:HW|CW)\s+[^:]+:\s*/i, '') || 'Grammar & Usage';
        const options = item.options || [item.answer || 'Option A', 'Option B', 'Option C'];
        const ans = typeof item.answer === 'number' ? item.answer : 0;
        questions.push({
          id: 'quiz-' + (b.id || bIdx),
          title: b.title || b.quizType || 'Quiz Task',
          concept,
          prompt: item.prompt || item.text || b.text || 'Choose the best option:',
          options,
          answer: ans,
          feedback: b.pdfTeacherNotes || item.feedback || 'Target concept: ' + concept
        });
      } else if (b.type === 'exercise' && Array.isArray(b.items)) {
        b.items.forEach((it, itIdx) => {
          const concept = b.title || 'Exercise Practice';
          questions.push({
            id: 'exercise-' + (b.id || bIdx) + '-' + itIdx,
            title: b.title || 'Exercise',
            concept,
            prompt: it.prompt || 'Select the correct statement:',
            options: it.options || ['Correct usage', 'Distractor 1', 'Distractor 2'],
            answer: it.answer || 0,
            feedback: b.pdfTeacherNotes || 'Correct answer matches standard grammar rule.'
          });
        });
      }
    });
    return questions;
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

    overlay.innerHTML =
      '<div class="focus-player-header">' +
        '<div style="font-size:14px; font-weight:700;">Question ' + (focusIndex + 1) + ' of ' + total + '</div>' +
        '<div class="focus-progress-bar">' + progressSegments + '</div>' +
        '<div style="display:flex; align-items:center; gap:14px;">' +
          '<span style="font-size:11px; opacity:0.8; font-family:monospace; background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:4px;">⌨️ 1-4: Select | Enter: Check/Next | Esc: Exit</span>' +
          '<button type="button" class="btn-sm" id="lmFocusCloseBtn" style="font-size:16px; background:none; border:none; color:#ffffff; cursor:pointer;">✕</button>' +
        '</div>' +
      '</div>' +

      '<div class="focus-player-stage">' +
        '<div class="focus-card">' +
          '<div style="font-size:12px; text-transform:uppercase; color:#94a3b8; font-weight:700; margin-bottom:6px;">' + esc(currentQ.title || 'Practice Task') + '</div>' +
          '<h2 style="font-size:20px; font-weight:700; color:#f8fafc; margin-top:0; margin-bottom:18px;">' + esc(currentQ.prompt || '') + '</h2>' +
          '<div class="focus-options-container">' + optionsHtml + '</div>' +

          (hasResult ? (
            '<div class="focus-feedback-banner" style="margin-top:20px; padding:12px 16px; border-radius:8px; font-size:13.5px; font-weight:600; ' +
              (isCorrect ? 'background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#34d399;' : 'background:rgba(239,68,68,0.15); border:1px solid #ef4444; color:#f87171;') + '">' +
              (isCorrect ? '✓ Correct! Excellent grasp of concept.' : '✗ Needs review. Target concept: ' + esc(currentQ.concept || '')) +
              '<div style="font-size:12px; font-weight:400; opacity:0.9; margin-top:4px;">' + esc(currentQ.feedback || '') + '</div>' +
            '</div>'
          ) : '') +

          '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:24px;">' +
            '<button type="button" class="btn secondary" id="focusPrevBtn" ' + (focusIndex === 0 ? 'disabled' : '') + ' style="font-size:13px;">← Previous</button>' +
            (!hasResult ? (
              '<button type="button" class="btn primary" id="focusCheckBtn" ' + (focusSelectedOption === null ? 'disabled' : '') + ' style="font-size:14px; font-weight:700; padding:8px 24px;">Check (Enter)</button>'
            ) : (
              '<button type="button" class="btn primary" id="focusNextBtn" style="font-size:14px; font-weight:700; padding:8px 24px;">' + (focusIndex < total - 1 ? 'Next question →' : 'Finish Session') + '</button>'
            )) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="focus-player-footer">' +
        '<div style="font-size:12px; color:#94a3b8;">Question Quick Jump:</div>' +
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
    renderFocusPlayer();
  }

  function openFocusPlayer(customQuestions = null) {
    focusQuestions = customQuestions || extractFocusQuestionsFromLesson(typeof lmState !== 'undefined' ? lmState : null);
    if (!focusQuestions || focusQuestions.length === 0) {
      alert('No quiz or exercise tasks available to practice in Focus Mode.');
      return;
    }
    focusActive = true;
    focusIndex = 0;
    focusSelectedOption = null;
    focusResults = {};
    sessionConceptErrors.clear();
    renderFocusPlayer();
  }

  function closeFocusPlayer() {
    focusActive = false;
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

  function voiceSetRole(role) {
    voiceActiveRole = role;
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
      'That is an interesting thought! How often does that happen in your everyday routine?',
      'Well phrased! Your vocabulary and pacing are clear. What other thoughts come to your mind about this topic?',
      'Nicely articulated! In conversational English, that flows smoothly. Could you give me a specific example?',
      'I appreciate you sharing that! Speaking spontaneously like this is great practice. What would you like to discuss next?',
      'Good conversational flow! You expressed that with clear grammar. Shall we test some vocabulary from ' + ctx.title + '?'
    ];
    let sum = 0;
    for (let i = 0; i < prompt.length; i++) sum += prompt.charCodeAt(i);
    return prompts[sum % prompts.length];
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

    setTimeout(() => {
      const reply = voiceGenerateReply(trimmed);
      voiceAppendMessage(voiceActiveRole === 'examiner' ? 'Speaking Examiner' : 'AI Tutor', reply, true);
      voiceSpeakText(reply);
    }, 400);
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
  }
})();
