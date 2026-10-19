    let screenAssetGeneration = 0;
    function deferScreenAssets(id) {
      const generation = ++screenAssetGeneration;
      if (!['material', 'days', 'exam', 'exams', 'examblocks', 'setup', 'speak', 'speaklesson', 'lyricadd', 'textedit'].includes(id)) return false;
      const jobs = [];
      if (!window.MaterialQuiz && window.ensureMaterialQuiz) jobs.push(window.ensureMaterialQuiz());
      if (!window.ColorPicker && window.ensureColorPicker) jobs.push(window.ensureColorPicker());
      if (!jobs.length) return false;
      Promise.all(jobs).then(() => {
        if (generation !== screenAssetGeneration) return;
        if (!window.MaterialQuiz || !window.ColorPicker) throw new Error('Unable to load editor controls. Please retry.');
        show(id);
      }).catch(error => {
        if (generation === screenAssetGeneration) window.LearningMain?.notice?.(error.message, true);
      });
      return true;
    }
    document.addEventListener('click', event => {
      if (!authUser || window.MessagesReady || !window.ensureMessages) return;
      const target = event.target.closest('.brand-account,[data-jump="account"],[data-jump="profile"],[data-jump="stats"],[data-jump="guide"],[data-jump="themes"]');
      if (!target || target.closest('.user-settings')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.ensureMessages().then(() => {
        if (authUser && target.isConnected) target.click();
      }).catch(error => window.LearningMain?.notice?.(error.message, true));
    }, true);
