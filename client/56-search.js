    function installListSearch(id, label, selector, scopeKey) {
      const list = document.getElementById(id);
      if (!list) return;
      const control = document.createElement('div');
      control.className = 'list-search';
      const input = document.createElement('input');
      input.type = 'search'; input.id = id + 'Search';
      input.placeholder = label; input.setAttribute('aria-label', label);
      const status = document.createElement('p');
      status.className = 'hint'; status.setAttribute('role', 'status'); status.hidden = true;
      control.append(input, status); list.before(control);
      const originalHidden = new WeakMap(), originalOpen = new WeakMap();
      let scope;
      const apply = () => {
        if (scopeKey) {
          const next = scopeKey();
          if (scope !== next) { input.value = ''; scope = next; }
        }
        const query = input.value.trim().toLocaleLowerCase();
        if(id==='examList')control.hidden=!examViewLevel||examViewGroup===null;
        const rows = [...list.querySelectorAll(selector)].filter(row => !row.parentElement.closest(selector) || !list.contains(row.parentElement.closest(selector)));
        if (id === 'adminBody') {
          control.hidden = adminTab === 'accounts' || adminTab === 'groups';
          if (adminTab === 'groups') input.value = '';
          input.placeholder = adminTab === 'groups' ? 'Search groups' : adminTab === 'requests' ? 'Search approval requests' : 'Search registration history';
          input.setAttribute('aria-label', input.placeholder);
        }
        let matches = 0;
        rows.forEach(row => {
          if (!originalHidden.has(row)) originalHidden.set(row, row.hidden);
          row.hidden = originalHidden.get(row) || !!query && !row.textContent.toLocaleLowerCase().includes(query);
          if (!row.hidden) matches++;
        });
        list.querySelectorAll('.accounts-fold, .archive-group').forEach(group => {
          const children = rows.filter(row => group.contains(row));
          if (!children.length) return;
          group.hidden = !!query && children.every(row => row.hidden);
          if (group.tagName === 'DETAILS') {
            if (query && !originalOpen.has(group)) originalOpen.set(group, group.open);
            if (query && !group.hidden) group.open = true;
            if (!query && originalOpen.has(group)) { group.open = originalOpen.get(group); originalOpen.delete(group); }
          }
        });
        list.querySelectorAll(':scope > .lib-h').forEach(heading => {
          let row = heading.nextElementSibling, visible = false;
          while (row && !row.matches('.lib-h')) { if (rows.includes(row) && !row.hidden) visible = true; row = row.nextElementSibling; }
          heading.hidden = !!query && !visible;
        });
        status.hidden = !query;
        status.textContent = matches ? matches + ' results' : 'No matches.';
      };
      input.addEventListener('input', apply);
      new MutationObserver(apply).observe(list, {childList: true, subtree: true, characterData: true});
      apply();
    }
    for (const [id, label, selector, scope] of [
      ['lmDayList', 'Search lessons', '.day-row', () => classGroupId],
      ['examList', 'Search exams', '.day-row', () => [examViewLevel,examViewGroup,examSection].join(':')],
      ['examBlocks', 'Search examination blocks', '.day-row', () => examCurrentId],
      ['textList', 'Search texts', '[data-text-open]'],
      ['textExpressions', 'Search expressions', '.expression-card', () => openTextId],
      ['speakoutList', 'Search Speakout', '.file-card, .tense', () => [speakView,speakLevel,speakUnit,speakLesson].join(':')],
      ['archiveList', 'Search archive', '.day-row'],
      ['bugList', 'Search bugs', '.bug-item'],
      ['adminBody', 'Search groups', '[data-admin-group-fold], [data-list-row]', () => adminTab],
      ['adminGroupDetail', 'Search students, lessons or exams', '.day-row, .path', () => adminGroupId]
    ]) installListSearch(id, label, selector, scope);
    const textSearch = document.createElement('input');
    textSearch.type = 'search'; textSearch.id = 'textBodySearch'; textSearch.className = 'text-body-search';
    textSearch.placeholder = 'Search in this text'; textSearch.setAttribute('aria-label', 'Search in this text');
    const textBody = document.getElementById('textReadBody');
    const textSearchBar = document.createElement('div'); textSearchBar.className = 'text-search-bar';
    textBody.before(textSearchBar); textSearchBar.append(textSearch);
    const textSearchNav = document.createElement('div'); textSearchNav.className = 'text-search-nav'; textSearchNav.hidden = true;
    const textMatchNumber = document.createElement('span'); textMatchNumber.className = 'text-match-number'; textMatchNumber.setAttribute('role', 'status');
    function textIconButton(label, path) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn icon';
      button.title = label; button.setAttribute('aria-label', label);
      button.innerHTML = '<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
      return button;
    }
    const textPrevious = textIconButton('Previous match', 'm18 15-6-6-6 6');
    const textNext = textIconButton('Next match', 'm6 9 6 6 6-6');
    textSearchNav.append(textPrevious, textMatchNumber, textNext); textSearchBar.append(textSearchNav);
    const textCollapse = textIconButton('Collapse text', 'm7 11 5-5 5 5 M7 18l5-5 5 5');
    textCollapse.id = 'textCollapse'; textCollapse.hidden = true;
    document.getElementById('textread').append(textCollapse);
    const textSearchStatus = document.createElement('p'); textSearchStatus.className = 'hint'; textSearchStatus.hidden = true;
    textSearchStatus.setAttribute('role', 'status'); textSearchBar.after(textSearchStatus);
    let textWasCollapsed = false, textMatches = [], textMatchIndex = -1;
    function goToTextMatch(index, focus = true) {
      if (!textMatches.length) return;
      textMatches[textMatchIndex]?.classList.remove('is-current');
      textMatchIndex = (index + textMatches.length) % textMatches.length;
      const match = textMatches[textMatchIndex]; match.classList.add('is-current'); match.tabIndex = -1;
      textBody.classList.remove('collapsed'); document.getElementById('textReadMore').hidden = true;
      textMatchNumber.textContent = (textMatchIndex + 1) + ' / ' + textMatches.length;
      if (focus) match.focus({preventScroll: true});
      match.scrollIntoView({block: 'center', behavior: 'auto'});
    }
    textPrevious.addEventListener('click', () => goToTextMatch(textMatchIndex - 1));
    textNext.addEventListener('click', () => goToTextMatch(textMatchIndex + 1));
    textSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); goToTextMatch(textMatchIndex + (event.shiftKey ? -1 : 1), false); }
    });
    textCollapse.addEventListener('click', () => {
      textWasCollapsed = true; textBody.classList.add('collapsed');
      const more = document.getElementById('textReadMore'); more.hidden = false; more.textContent = 'Show the rest';
      textSearchBar.scrollIntoView({block: 'start'}); textSearch.focus({preventScroll: true});
    });
    new MutationObserver(() => { textCollapse.hidden = textBody.classList.contains('collapsed') || !textBody.textContent.trim(); })
      .observe(textBody, {attributes: true, attributeFilter: ['class'], childList: true});
    function findInText() {
      const query = textSearch.value.trim().toLocaleLowerCase();
      const raw = textBody.textContent;
      const fragment = document.createDocumentFragment();
      let start = 0, count = 0;
      const pattern = query && new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
      for (const match of pattern ? raw.matchAll(pattern) : []) {
        count++;
        if (count > 1000) continue;
        fragment.append(document.createTextNode(raw.slice(start, match.index)));
        const mark = document.createElement('mark'); mark.textContent = match[0]; fragment.append(mark);
        start = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(raw.slice(start))); textBody.replaceChildren(fragment);
      textMatches = [...textBody.querySelectorAll('mark')]; textMatchIndex = -1;
      textSearchNav.hidden = !textMatches.length;
      if (query) {
        if (!textSearch.dataset.searching) textWasCollapsed = textBody.classList.contains('collapsed');
        textSearch.dataset.searching = '1'; textBody.classList.remove('collapsed');
        document.getElementById('textReadMore').hidden = true;
      } else if (textSearch.dataset.searching) {
        delete textSearch.dataset.searching; textBody.classList.toggle('collapsed', textWasCollapsed); fitTextBody();
      }
      textSearchStatus.hidden = !query; textSearchStatus.textContent = count ? count + ' matches' + (count > 1000 ? ' · First 1000 highlighted' : '') : 'No matches.';
      if (textMatches.length) goToTextMatch(0, false);
    }
    let textSearchTimer;
    textSearch.addEventListener('input', () => { clearTimeout(textSearchTimer); textSearchTimer = setTimeout(findInText, 120); });
    new MutationObserver(() => {
      clearTimeout(textSearchTimer); textSearch.value = ''; delete textSearch.dataset.searching;
      textSearchStatus.hidden = true; textSearchNav.hidden = true; textMatches = []; textMatchIndex = -1;
    }).observe(document.getElementById('textReadTitle'), {childList: true});
