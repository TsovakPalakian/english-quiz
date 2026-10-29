    let fsrsQueue = [];
    let fsrsCurrentIndex = 0;
    let fsrsCardShownAt = 0;
    let fsrsFlipped = false;
    let fsrsSubmitting = false;

    function formatFsrsInterval(days) {
      const d = Number(days) || 0;
      if (d <= 0) return '<10m';
      if (d === 1) return '1d';
      if (d < 30) return d + 'd';
      if (d < 365) return (d / 30).toFixed(1).replace(/\.0$/, '') + 'mo';
      return (d / 365).toFixed(1).replace(/\.0$/, '') + 'y';
    }

    async function openFsrsQuiz(customItems) {
      if (Array.isArray(customItems) && customItems.length) {
        fsrsQueue = customItems;
        fsrsCurrentIndex = 0;
        visit('fsrsquiz');
        renderFsrsCard();
        return;
      }
      try {
        const res = await accountFetch('/api/error-bank?action=queue&mode=fsrs_retrievability&limit=30');
        fsrsQueue = Array.isArray(res) ? res : (res?.queue || []);
        fsrsCurrentIndex = 0;
        visit('fsrsquiz');
        renderFsrsCard();
      } catch (err) {
        console.error('Failed to load FSRS queue:', err);
        fsrsQueue = [];
        fsrsCurrentIndex = 0;
        visit('fsrsquiz');
        renderFsrsCard();
      }
    }

    function renderFsrsCard() {
      const scene = document.getElementById('fsrsScene');
      const container = document.querySelector('#fsrsquiz .fsrs-card-container');
      if (!container) return;

      const item = fsrsQueue[fsrsCurrentIndex];
      const counter = document.getElementById('fsrsCounter');
      const frontPrompt = document.getElementById('fsrsFrontPrompt');
      const hint = document.getElementById('fsrsHint');
      const expected = document.getElementById('fsrsExpected');
      const note = document.getElementById('fsrsDiagnosticNote');
      const flipBar = document.getElementById('fsrsFlipBar');
      const ratingBar = document.getElementById('fsrsRatingBar');
      const feedback = document.getElementById('fsrsFeedback');

      if (!item) {
        container.innerHTML = '<div class="home-warmup-empty" style="text-align:center; padding:48px 20px;">' +
          '<p style="font-size:1.4rem; font-weight:800; margin-bottom:8px;">All caught up! 🎉</p>' +
          '<p class="sub" style="color:var(--saas-text-muted); margin-bottom:20px;">No memory flashcards due for review right now.</p>' +
          '<button class="btn primary saas-btn saas-btn-primary" type="button" data-jump="home">Back to Home</button>' +
          '</div>';
        const homeBtn = container.querySelector('[data-jump="home"]');
        if (homeBtn) homeBtn.onclick = () => visit('home');
        return;
      }

      if (counter) counter.textContent = (fsrsCurrentIndex + 1) + ' of ' + fsrsQueue.length;
      if (frontPrompt) frontPrompt.textContent = item.prompt || 'Recall the correct target form';
      if (hint) {
        const hintText = item.hint || (item.cuedHint ? 'Hint: ' + item.cuedHint : '');
        hint.textContent = hintText;
        hint.hidden = !hintText;
      }
      if (expected) expected.textContent = item.expectedAnswer || item.expected_answer || item.expected || '';
      if (note) {
        const noteText = item.diagnosticNote || item.diagnostic_note || '';
        note.textContent = noteText;
        note.hidden = !noteText;
      }

      const previews = item.previewIntervals || {};
      const badgeAgain = document.getElementById('fsrsBadgeAgain');
      const badgeHard = document.getElementById('fsrsBadgeHard');
      const badgeGood = document.getElementById('fsrsBadgeGood');
      const badgeEasy = document.getElementById('fsrsBadgeEasy');

      if (badgeAgain) badgeAgain.textContent = '<10m';
      if (badgeHard) badgeHard.textContent = formatFsrsInterval(previews[2] || 1);
      if (badgeGood) badgeGood.textContent = formatFsrsInterval(previews[3] || 3);
      if (badgeEasy) badgeEasy.textContent = formatFsrsInterval(previews[4] || 7);

      fsrsFlipped = false;
      fsrsSubmitting = false;
      if (scene) scene.classList.remove('is-flipped');
      if (flipBar) flipBar.hidden = false;
      if (ratingBar) {
        ratingBar.hidden = true;
        ratingBar.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
      }
      if (feedback) feedback.hidden = true;

      fsrsCardShownAt = Date.now();
    }

    function flipFsrsCard(open = true) {
      fsrsFlipped = !!open;
      const scene = document.getElementById('fsrsScene');
      const flipBar = document.getElementById('fsrsFlipBar');
      const ratingBar = document.getElementById('fsrsRatingBar');

      if (scene) scene.classList.toggle('is-flipped', fsrsFlipped);
      if (flipBar) flipBar.hidden = fsrsFlipped;
      if (ratingBar) ratingBar.hidden = !fsrsFlipped;
    }

    async function submitFsrsGrade(grade) {
      if (fsrsSubmitting) return;
      const item = fsrsQueue[fsrsCurrentIndex];
      if (!item) return;

      fsrsSubmitting = true;
      const ratingBar = document.getElementById('fsrsRatingBar');
      if (ratingBar) ratingBar.querySelectorAll('button').forEach(btn => { btn.disabled = true; });

      const latencyMs = Math.max(1, Date.now() - fsrsCardShownAt);
      const feedback = document.getElementById('fsrsFeedback');

      try {
        const result = await accountFetch('/api/error-bank', {
          method: 'POST',
          body: JSON.stringify({
            itemId: item.id,
            grade: Number(grade) || 3,
            latencyMs
          })
        });

        if (feedback) {
          feedback.hidden = false;
          const nextInterval = result?.intervalDays || 1;
          const intervalText = formatFsrsInterval(nextInterval);
          if (grade === 1) {
            feedback.className = 'fsrs-feedback is-incorrect';
            feedback.style.background = 'var(--saas-danger-subtle, #fee2e2)';
            feedback.style.color = 'var(--saas-danger, #b91c1c)';
            feedback.textContent = 'Marked for repeating soon (<10m).';
          } else {
            feedback.className = 'fsrs-feedback is-correct';
            feedback.style.background = 'var(--saas-success-subtle, #dcfce7)';
            feedback.style.color = 'var(--saas-success, #15803d)';
            feedback.textContent = 'Scheduled for review in ' + intervalText + '.';
          }
        }

        setTimeout(() => {
          fsrsCurrentIndex++;
          renderFsrsCard();
        }, 650);
      } catch (err) {
        console.error('Failed to submit FSRS rating:', err);
        fsrsSubmitting = false;
        if (ratingBar) ratingBar.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
      }
    }

    function bindFsrsEvents() {
      const flipBtn = document.getElementById('fsrsFlipBtn');
      if (flipBtn) flipBtn.onclick = () => flipFsrsCard(true);

      const scene = document.getElementById('fsrsScene');
      if (scene) {
        scene.onclick = () => { if (!fsrsFlipped) flipFsrsCard(true); };
        scene.onkeydown = (e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !fsrsFlipped) {
            e.preventDefault();
            flipFsrsCard(true);
          }
        };
      }

      document.querySelectorAll('#fsrsRatingBar [data-fsrs-grade]').forEach(btn => {
        btn.onclick = () => {
          const g = Number(btn.dataset.fsrsGrade);
          submitFsrsGrade(g);
        };
      });

      const startFsrsBtn = document.getElementById('startFsrsBtn');
      if (startFsrsBtn) {
        startFsrsBtn.onclick = () => openFsrsQuiz();
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindFsrsEvents);
    } else {
      bindFsrsEvents();
    }

    document.addEventListener('keydown', (e) => {
      const activeSection = document.querySelector('section.on');
      if (activeSection?.id !== 'fsrsquiz') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (!fsrsFlipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          flipFsrsCard(true);
        }
      } else {
        if (e.key === '1') { e.preventDefault(); submitFsrsGrade(1); }
        else if (e.key === '2') { e.preventDefault(); submitFsrsGrade(2); }
        else if (e.key === '3') { e.preventDefault(); submitFsrsGrade(3); }
        else if (e.key === '4') { e.preventDefault(); submitFsrsGrade(4); }
      }
    });

    function deriveFsrsGrade(ok, item = {}) {
      if (Number.isInteger(item.grade) && item.grade >= 1 && item.grade <= 4) return item.grade;
      if (!ok) return 1;
      const latency = Number(item.telemetry?.effectiveLatencyMs || item.latencyMs) || 0;
      if (item.hintUsed || latency > 8000 || item.telemetry?.speedCategory === 'struggling') return 2;
      if (latency > 0 && latency < 3000 && !item.telemetry?.isRapidGuess) return 4;
      return 3;
    }

    function broadcastQuizFsrs(item, ok) {
      if (!item || typeof accountFetch !== 'function') return;
      if (!authUser || viewAccount) return;

      const grade = deriveFsrsGrade(ok, item);
      const latencyMs = Number(item?.latencyMs) || 0;
      const word = item?.card?.en || item?.line || item?.word || '';
      const expectedAnswer = item?.expected || item?.card?.en || item?.card?.ru || item?.right || '';
      const answer = item?.given != null ? String(item.given) : (ok ? expectedAnswer : '');

      accountFetch('/api/error-bank', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item?.itemId || item?.id || null,
          word,
          expectedAnswer,
          answer,
          grade,
          latencyMs,
          kind: 'quiz-' + String(item?.type || 'quiz').toLowerCase(),
          prompt: item?.prompt || item?.line || word
        })
      }).catch(() => {});
    }

    window.openFsrsQuiz = openFsrsQuiz;
    window.flipFsrsCard = flipFsrsCard;
    window.formatFsrsInterval = formatFsrsInterval;
    window.deriveFsrsGrade = deriveFsrsGrade;
    window.broadcastQuizFsrs = broadcastQuizFsrs;
