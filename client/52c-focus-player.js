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

  // Stage 18: Voice Mode Controller (AI Tutor & Oral Examiner)
  let voiceRecognition = null;
  const voiceSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;

  function openVoiceMode() {
    const modal = document.getElementById('lmVoiceModeModal');
    if (modal) modal.style.display = 'flex';
    const statusEl = document.getElementById('lmVoiceStatus');
    if (statusEl) statusEl.textContent = 'Ready to listen';
    initVoiceMode();
  }

  function closeVoiceMode() {
    const modal = document.getElementById('lmVoiceModeModal');
    if (modal) modal.style.display = 'none';
    if (voiceRecognition) {
      try { voiceRecognition.stop(); } catch (_) {}
    }
    if (voiceSynthesis && voiceSynthesis.speaking) {
      try { voiceSynthesis.cancel(); } catch (_) {}
    }
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
      voiceSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      const statusEl = document.getElementById('lmVoiceStatus');
      utterance.onstart = () => { if (statusEl) statusEl.textContent = 'AI Speaking...'; };
      utterance.onend = () => { if (statusEl) statusEl.textContent = 'Ready to listen'; };
      utterance.onerror = () => { if (statusEl) statusEl.textContent = 'Ready to listen'; };
      voiceSynthesis.speak(utterance);
    } catch (_) {}
  }

  function voiceGenerateReply(userPrompt) {
    const lessonTitle = (typeof lmState !== 'undefined' && lmState?.title) ? lmState.title : 'English Practice';
    const textLower = (userPrompt || '').toLowerCase();
    let reply = 'Great effort! Speaking naturally in English is the best way to develop fluency.';

    if (textLower.includes('hello') || textLower.includes('hi')) {
      reply = 'Hello! Ready to practice vocabulary and speaking for ' + lessonTitle + '? What topic shall we discuss?';
    } else if (textLower.includes('word') || textLower.includes('vocabulary')) {
      reply = 'Let us practice the key words from ' + lessonTitle + '. Try using one of your new vocabulary words in a full sentence!';
    } else if (textLower.includes('rule') || textLower.includes('grammar')) {
      reply = 'For grammar accuracy, focus on verb forms and subject-verb agreement. What structure would you like to review?';
    } else if (textLower.includes('check') || textLower.includes('correct')) {
      reply = 'Your pronunciation and sentence structure sound intelligible! Keep practicing the intonation of question forms.';
    } else {
      reply = 'I understood your thought: "' + userPrompt + '". In standard conversational English, that is clear and natural. Let us continue!';
    }
    return reply;
  }

  function voiceSubmitUserText(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    voiceAppendMessage('You', trimmed, false);
    const inputEl = document.getElementById('lmVoiceTextInput');
    if (inputEl) inputEl.value = '';
    const statusEl = document.getElementById('lmVoiceStatus');
    if (statusEl) statusEl.textContent = 'AI thinking...';

    setTimeout(() => {
      const reply = voiceGenerateReply(trimmed);
      voiceAppendMessage('AI Tutor', reply, true);
      voiceSpeakText(reply);
    }, 400);
  }

  function initVoiceMode() {
    if (typeof window === 'undefined') return;
    if (voiceRecognition) return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      voiceRecognition = new SpeechRec();
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = false;
      voiceRecognition.lang = 'en-US';

      voiceRecognition.onstart = () => {
        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl) statusEl.textContent = '● Listening to your voice...';
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.add('is-recording');
      };
      voiceRecognition.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript || '';
        if (transcript) {
          voiceSubmitUserText(transcript);
        }
      };
      voiceRecognition.onerror = () => {
        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl) statusEl.textContent = 'Voice recognition error or timeout. Click Speak to retry.';
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.remove('is-recording');
      };
      voiceRecognition.onend = () => {
        const statusEl = document.getElementById('lmVoiceStatus');
        if (statusEl && statusEl.textContent.includes('Listening')) {
          statusEl.textContent = 'Ready to listen';
        }
        const micBtn = document.getElementById('lmVoiceMicBtn');
        if (micBtn) micBtn.classList.remove('is-recording');
      };
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
      if (e.target.closest('#lmVoiceModeBtn')) {
        e.preventDefault();
        openVoiceMode();
        return;
      }
      if (e.target.closest('#lmVoiceCloseBtn')) {
        e.preventDefault();
        closeVoiceMode();
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
        if (voiceRecognition) {
          try {
            voiceRecognition.start();
          } catch (err) {
            voiceRecognition.stop();
          }
        } else {
          const manual = prompt('Speech recognition not supported in this browser. Enter your message:');
          if (manual) voiceSubmitUserText(manual);
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

    // Voice text enter key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'lmVoiceTextInput') {
        e.preventDefault();
        voiceSubmitUserText(e.target.value);
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
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.calculateMasteryScore = calculateMasteryScore;
    globalThis.evaluateTwoFactorSubmission = evaluateTwoFactorSubmission;
    globalThis.renderTwoFactorReviewHtml = renderTwoFactorReviewHtml;
    globalThis.extractFocusQuestionsFromLesson = extractFocusQuestionsFromLesson;
    globalThis.focusApplyAdaptiveRemediation = focusApplyAdaptiveRemediation;
  }
})();
