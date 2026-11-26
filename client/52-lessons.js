    const LM_KEY = "enquiz-material-demo";
    const lmFiles = {};
    let lmLibrary = null;
    let lmState = null;
    Object.defineProperty(window, "lmState", {
      configurable: true,
      enumerable: true,
      get() {
        return lmState;
      },
      set(value) {
        lmState = value;
      },
    });
    Object.defineProperty(window, "lmLibrary", {
      configurable: true,
      enumerable: true,
      get() {
        return lmLibrary;
      },
      set(value) {
        lmLibrary = value;
      },
    });
    let lmSaveTimer = 0;
    let lmSavedFingerprint = "";
    let lmInsertAnchor = null;
    let lmLastAddedBlockId = null;
    let lmFontRange = null;
    let lmServerReady = false;
    let lmPushTimer = 0;
    let classGroups = [];
    let classGroupsReady = false;
    let classGroupsPulling = false;
    let classGroupId = "";
    let classGroupsDirty = false;
    let classGroupsSaveVersion = 0;
    function groupId() {
      return "group-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    function groupReset() {
      classGroups = [];
      classGroupsReady = false;
      classGroupsPulling = false;
      classGroupId = "";
      classGroupsDirty = false;
      classGroupsSaveVersion = 0;
    }
    function groupNormalize() {
      if (!classGroups.length && !authUser) classGroups = [{ id: "group-default", title: "Group 1", date: lmToday(), hidden: false, lessonIds: [] }];
      if (classGroups.length && !classGroups.some((group) => group.id === classGroupId)) classGroupId = classGroups[0].id;
      const assigned = new Set();
      classGroups.forEach((group) => {
        group.lessonIds = (Array.isArray(group.lessonIds) ? group.lessonIds : []).filter((id) => {
          if (!id || assigned.has(id)) return false;
          assigned.add(id);
          return true;
        });
      });
      if (lmLibrary && classGroups.length && (!authUser || !classGroupsReady)) lmLibrary.materials.forEach((material) => {
        if (material && material.id && !assigned.has(material.id)) {
          classGroups[0].lessonIds.push(material.id);
          assigned.add(material.id);
        }
      });
    }
    let groupPullToken = 0;
    function groupPull(force = false) {
      if (!authUser || (!force && (classGroupsPulling || classGroupsReady)) || typeof accountFetch !== "function") return Promise.resolve();
      const token = ++groupPullToken, actor = authUser.id, generation = viewGen;
      classGroupsPulling = true;
      return accountFetch("/api/groups" + (viewAccount ? "?for=" + encodeURIComponent(viewAccount.id) : "")).then((data) => {
        if (token !== groupPullToken || actor !== authUser?.id || generation !== viewGen) return;
        classGroups = Array.isArray(data && data.groups) ? data.groups.map((group) => ({
          id: group.id,
          title: group.title || "Untitled group",
          date: group.date || lmToday(),
          hidden: !!group.hidden,
          personalHidden: !!group.personalHidden,
          revision: group.revision, studentCount: Number(group.studentCount)||0, examIds: group.examIds || [],
          lessonIds: Array.isArray(group.lessonIds) ? group.lessonIds.slice() : []
        })) : [];
        classGroupsReady = true;
        groupNormalize();
        paintGroups();
        paintLmDays();
        if(document.querySelector('section.on')?.id==='exams')examPaintList();
        if(typeof paintHomeStats==='function'&&document.querySelector('section.on')?.id==='home')paintHomeStats();
        if(typeof paintGroupDetail==='function'&&document.querySelector('section.on')?.id==='groupdetail')paintGroupDetail();
      }).catch((error) => window.LearningMain?.notice(error.message, true)).finally(() => { if (token === groupPullToken) classGroupsPulling = false; });
    }
    function groupSave() {
      classGroupsDirty = true;
      const version = ++classGroupsSaveVersion;
      if (!classGroupsReady || !lmServerReady || !canEditLessons() || viewSwitching || typeof accountFetch !== "function") return Promise.resolve();
      groupNormalize();
      const saved = new Set((lmLibrary && lmLibrary.materials || []).filter((row) => row && row.stageRevision).map((row) => row.id));
      const groups = classGroups.map((group) => ({
        ...(Number.isSafeInteger(group.id) && group.id > 0 ? { id: group.id } : {}),
        title: group.title,
        date: group.date || lmToday(),
        hidden: !!group.hidden,
        lessonIds: group.lessonIds.filter((id) => saved.has(id) && Number.isSafeInteger(id) && id > 0)
      }));
      return accountFetch("/api/groups", { method: "POST", body: JSON.stringify({ groups: groups }) })
        .then((data) => {
          if (data && Array.isArray(data.ids)) data.ids.forEach((id, index) => { if (classGroups[index]) classGroups[index].id = id; });
          if (version === classGroupsSaveVersion) classGroupsDirty = false;
        }).catch((err) => {
          if (err && err.status === 409 && typeof groupPull === "function") groupPull(true);
        });
    }
    let groupViewLevel = '', groupSortOrder = 'date-desc', examViewLevel = '', examViewGroup = null;
    document.addEventListener('input',event=>{if(event.target.id==='groupSearch')paintGroups();});
    document.addEventListener('change',event=>{if(event.target.id==='groupSort'){groupSortOrder=event.target.value;paintGroups();}});
    function groupPluralLabel(singular, plural, count) {
      return Number(count) === 1 ? singular : plural;
    }
    function metricPairs(rows,compact=false){if(!authUser||viewAccount||!['ADMIN','DEVELOPER'].includes(authUser.role))return '';return '<span class="metric-pairs'+(compact?' metric-pairs--compact':'')+'">'+rows.map(([label,value])=>'<span>'+esc(compact?({'groups':'group','assigned works':'assigned','ready for review':'ready'}[label]||label):label)+' · <b>'+esc(String(value))+'</b></span>').join('')+'</span>';}
    function levelMetricPairs(rows){if(!authUser||viewAccount||!['ADMIN','DEVELOPER'].includes(authUser.role))return '';return '<span class="metric-pairs metric-pairs--level">'+rows.map(([label,value])=>'<span><span>'+esc(label)+'</span><b>'+esc(String(value))+'</b></span>').join('')+'</span>';}
    function levelButtons(rows,attribute) {
      const hasUnassigned = (classGroupsReady || !authUser) && rows.some(row=>accountGroupLevel(row)==='unassigned');
      const levels = hasUnassigned ? [...adminLevels,'unassigned'] : adminLevels;
      return '<div class="decks">' + levels.filter(level=>canEditLessons()||rows.some(row=>accountGroupLevel(row)===level)).map(level=>{
        const groups=rows.filter(row=>accountGroupLevel(row)===level);
        const groupCount = groups.length;
        const studentCount = groups.reduce((sum,g)=>{
          const live = (typeof groupLiveStudentCount === 'function' && !isDeveloper()) ? groupLiveStudentCount(g) : undefined;
          return sum + (live !== undefined ? live : (g.studentCount || 0));
        },0);
        const lessonCount = groups.reduce((sum,g)=>sum+(g.lessonIds?.length||0),0);
        const pairs=[
          [groupPluralLabel('Group','Groups',groupCount),groupCount],
          [groupPluralLabel('Student','Students',studentCount),studentCount],
          [groupPluralLabel('Lesson','Lessons',lessonCount),lessonCount]
        ];
        const empty=pairs.every(([,value])=>!value);
        const chevron = '<span class="card-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></span>';
        return '<button class="file-card'+(empty?' is-empty':'')+'" type="button" '+attribute+'="'+level+'"><div class="card-top-row"><b>'+esc(level==='unassigned'?'Unassigned':level)+'</b>'+chevron+'</div><span class="label">'+levelMetricPairs(pairs)+'</span></button>';
      }).join('')+'</div>';
    }
    document.addEventListener('click',event=>{
      const group=event.target.closest('[data-group-level]'), level=event.target.closest('[data-exam-level]'), subgroup=event.target.closest('[data-exam-group-view]');
      if(group){pushHistory();groupViewLevel=group.dataset.groupLevel;const search=document.getElementById('groupSearch');if(search)search.value='';const sort=document.getElementById('groupSort');if(sort)sort.value=groupSortOrder||'date-desc';paintGroups();rememberPlace();}
      if(level){pushHistory();examViewLevel=level.dataset.examLevel;examViewGroup=null;examPaintList();rememberPlace();}
      if(subgroup){pushHistory();examViewGroup=subgroup.dataset.examGroupView;examPaintList();rememberPlace();}
    });
    function teacherOwnsGroup(group) {
      if (viewAccount || sessionIsDeveloper()) return true;
      if (!authUser || authUser.role !== 'ADMIN') return true;
      if (Array.isArray(group?.teacherIds)) return group.teacherIds.map(String).includes(String(authUser.id));
      if (typeof groupDirectoryReady === 'function' && groupDirectoryReady() && groupDirectory?.assignments) {
        const assignment = groupDirectory.assignments.find(row => String(row.groupId) === String(group.id));
        if (assignment) return assignment.teacherIds?.map(String).includes(String(authUser.id));
      }
      if (typeof adminTeacherAssignments !== 'undefined' && adminTeacherAssignments?.length) {
        const assignment = adminTeacherAssignments.find(row => String(row.groupId) === String(group.id));
        if (assignment) return assignment.teacherIds?.map(String).includes(String(authUser.id));
      }
      return false;
    }
    function paintGroups() {
      const box = document.getElementById("groupList");
      const newer = document.getElementById("groupNew");
      if (newer) newer.hidden = !canEditLessons() || !groupViewLevel;
      if (!box) return;
      if (authUser && !classGroupsReady && !classGroupsPulling) groupPull();
      groupNormalize();
      if (isTeacher() && !sessionIsDeveloper() && !viewAccount && typeof loadGroupDirectory === 'function' && !groupDirectoryReady()) {
        loadGroupDirectory().then(() => { if (document.querySelector('section.on')?.id === 'groups') paintGroups(); });
      }
      const visible = new Set((lmLibrary && lmLibrary.materials || []).filter(lmLessonVisibleToViewer).map((row) => row.id));
      document.querySelector('#groups .meta h1').textContent=groupViewLevel?(groupViewLevel==='unassigned'?'Unassigned':groupViewLevel):'Groups';
      paintPagePath('groups');
      syncRoleHomeControls();
      const allRows = classGroups.filter((group) => (canEditLessons() || canTuneStudentLessons() || !group.hidden) && teacherOwnsGroup(group)).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
      const controls=document.getElementById('groupControls');if(controls)controls.hidden=!groupViewLevel;
      const sortEl = document.getElementById('groupSort');
      if (sortEl && groupSortOrder && sortEl.value !== groupSortOrder) {
        sortEl.value = groupSortOrder;
      }
      const levelRows=groupViewLevel?allRows.filter(group=>accountGroupLevel(group)===groupViewLevel):allRows;
      if(!groupViewLevel){box.innerHTML=levelButtons(allRows,'data-group-level');return;}
      const query=document.getElementById('groupSearch')?.value.trim().toLocaleLowerCase()||'';
      const sortOrder=(document.getElementById('groupSort')?.value)||groupSortOrder||'date-desc';
      const rows=levelRows.filter(group=>group.title.toLocaleLowerCase().includes(query));
      rows.sort((a,b)=>{
        if(sortOrder==='date-asc')return (a.date||'').localeCompare(b.date||'')||(Number(a.id)||0)-(Number(b.id)||0);
        if(sortOrder==='name-asc')return (a.title||'').localeCompare(b.title||'')||(b.date||'').localeCompare(a.date||'');
        if(sortOrder==='name-desc')return (b.title||'').localeCompare(a.title||'')||(b.date||'').localeCompare(a.date||'');
        return (b.date||'').localeCompare(a.date||'')||(Number(b.id)||0)-(Number(a.id)||0);
      });
      box.innerHTML = '<h2>Study groups</h2>'+rows.map((group) => {
        const count = group.lessonIds.filter((id) => visible.has(id)).length;
        const hiddenCount = viewAccount ? group.lessonIds.filter(id => { const lesson = lmLibrary?.materials?.find(row => row.id === id); return !lesson || !lesson.published || lmLessonHidden(lesson); }).length : 0;
        const chip = lmDateChip(group.date);
        const hidden = viewAccount ? group.personalHidden : group.hidden;
        const live = (typeof groupLiveStudentCount === 'function' && !isDeveloper()) ? groupLiveStudentCount(group) : undefined;
        const studentCount = live !== undefined ? live : (group.studentCount || 0);
        const empty = studentCount === 0 && count === 0;
        const about = hidden ? (viewAccount ? "Hidden for this student" : "Hidden") : (viewAccount && hiddenCount ? "Hidden " + hiddenCount + " / " + group.lessonIds.length + " lessons" : count + " lessons");
        const eye = hidden
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
        const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
        const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
        const tools = canEditLessons() || canTuneStudentLessons() ? '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-group-hide="' + esc(group.id) + '" aria-label="' + (hidden ? "Show" : "Hide") + '">' + eye + '</button>' + (canEditLessons() ? '<button class="day-edit" type="button" data-group-edit="' + esc(group.id) + '" aria-label="Edit group" title="Edit group">' + pencil + '</button><button class="day-del" type="button" data-group-delete="' + esc(group.id) + '" aria-label="Delete group">' + trash + '</button>' : '') + '</div>' : '';
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + (empty ? " is-empty" : "") + '"><button class="day" type="button" data-group-open="' + esc(group.id) + '"><span class="date"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(group.title) + '</b><span class="label about">' + metricPairs([[groupPluralLabel('Student', 'Students', studentCount), studentCount], [groupPluralLabel('Lesson', 'Lessons', count), count]], true) + (hidden || hiddenCount ? '<span>' + esc(about) + '</span>' : '') + "</span></button>" + tools + "</div>";
      }).join("");
    }
    function groupOpen(id) {
      id = domEntityId(id);
      if (!classGroups.some((group) => group.id === id && (typeof teacherOwnsGroup !== 'function' || teacherOwnsGroup(group)))) return;
      classGroupId = id;
      visit(isTeacher()&&!viewAccount?'groupdetail':'days');
    }
    function groupCreate() {
      if (!canEditLessons()) return;
      openItemEditor(document.getElementById("groupNew"), { title: (adminLevels.includes(groupViewLevel)?groupViewLevel:'A1')+' Group', date: lmToday(), label: "Group name" }, (value) => {
        if(accountGroupLevel({title:value.title})==='unassigned')value.title=(adminLevels.includes(groupViewLevel)?groupViewLevel:'A1')+' '+value.title;
        const actor=authUser?.id,generation=viewGen;
        accountFetch('/api/groups/manage',{method:'POST',body:JSON.stringify({action:'create',title:value.title,date:value.date})}).then(()=>{if(actor===authUser?.id&&generation===viewGen){groupDirectory=null;const search=document.getElementById('groupSearch');if(search)search.value='';return groupPull(true);}}).catch(error=>{if(actor===authUser?.id&&generation===viewGen)window.LearningMain?.notice(error.message,true);});
      });
    }
    function groupEdit(id, button) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      const group = classGroups.find((row) => row.id === id);
      if (!group || !button) return;
      openItemEditor(button, { title: group.title, date: group.date, label: "Group name" }, (value) => {
        if(accountGroupLevel({title:value.title})==='unassigned'){window.LearningMain?.notice('Start the group name with a standard level and a space.',true);return;}
        group.title = value.title;
        groupViewLevel = accountGroupLevel(group);
        group.date = value.date;
        paintGroups();
        groupSave().then(()=>groupPull(true)).then(()=>examPull(true));
      });
    }
    function groupHide(id) {
      id = domEntityId(id);
      const group = classGroups.find((row) => row.id === id);
      if (!group) return;
      if (viewAccount) return toggleManagedVisibility(group, 'group');
      if (!canEditLessons()) return;
      group.hidden = !group.hidden;
      paintGroups();
      groupSave();
    }
    function groupDelete(id) {
      id = domEntityId(id);
      if (!canEditLessons() || classGroups.length < 2) return;
      const group = classGroups.find((row) => row.id === id);
      if (!group || !confirm("Move this group to Archive? Its classes will move to the first group.")) return;
      window.LearningMain.perform(async () => {
        await window.LearningMain.archiveItem("group", id);
        const rest = classGroups.filter((row) => row.id !== id);
        rest[0].lessonIds.push(...group.lessonIds.filter((lessonId) => !rest[0].lessonIds.includes(lessonId)));
        classGroups = rest;if (classGroupId === id) classGroupId = rest[0].id;paintGroups();
      });
    }
    const LM_FONTS = {
      serif: "Georgia, 'Times New Roman', serif",
      sans: "system-ui, sans-serif",
      mono: "'Courier New', monospace",
      georgia: "Georgia, serif",
      verdana: "Verdana, sans-serif",
      palatino: "Palatino, 'Palatino Linotype', serif",
      trebuchet: "'Trebuchet MS', sans-serif",
      courier: "'Courier New', Courier, monospace"
    };
    function lmDateChip(iso) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (!iso) {
        const today = new Date();
        return { day: String(today.getDate()).padStart(2, "0"), month: months[today.getMonth()] };
      }
      let str = String(iso).trim();
      if (/^\d{1,2}$/.test(str)) {
        const today = new Date();
        str = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + str.padStart(2, "0");
      }
      const date = new Date(str.includes("T") ? str : str + "T12:00:00");
      if (Number.isNaN(date.getTime())) {
        const today = new Date();
        return { day: String(today.getDate()).padStart(2, "0"), month: months[today.getMonth()] };
      }
      return { day: String(date.getDate()).padStart(2, "0"), month: months[date.getMonth()] };
    }
    function lmCourseBits(material) {
      const row = material || {};
      return [
        ["Class", row.className],
        ["Unit", row.unit],
        ["Lesson", row.lesson]
      ].filter((pair) => String(pair[1] || "").trim());
    }
    function lmCourseValue(label, value) {
      return String(value || "").trim().replace(new RegExp("^" + label + "\\s+", "i"), "");
    }
    function lmCourseHtml(material) {
      const bits = lmCourseBits(material);
      if (!bits.length) return "";
      return '<p class="lm-read-meta">' + bits.map((pair) => '<span><b>' + esc(pair[0]) + "</b> " + esc(lmCourseValue(pair[0], pair[1])) + "</span>").join("") + "</p>";
    }
    function lmBlockCounts(material) {
      const blocks = material && Array.isArray(material.blocks) ? material.blocks : [];
      if (blocks.length) {
        let words = 0, phrases = 0, rules = 0;
        for (const block of blocks) {
          if (block.type === "wordcard" || block.type === "word") {
            if ((block.tab || "") === "phrases") phrases += 1;
            else if ((block.tab || "") === "words") words += 1;
          } else if (block.type === "phrase") phrases += 1;
          else if (block.type === 'vocab' && block.tab === 'words') words += (block.items || []).filter(item => item.word).length;
          else if (block.type === 'cards' && block.tab === 'words') words += (block.items || []).filter(item => item.front || item.back || item.example).length;
          else if (block.type === "rule" || (block.tab === 'rules' && block.pdfImport?.section === 'rules')) rules += 1;
        }
        return { words, phrases, rules };
      }
      return {
        words: Number(material && material.wordCount) || 0,
        phrases: Number(material && material.phraseCount) || 0,
        rules: Number(material && material.ruleCount) || 0
      };
    }
    function lmLongDate(iso) {
      if (!iso) return "";
      const date = new Date(iso + "T12:00:00");
      if (Number.isNaN(date.getTime())) return "";
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return days[date.getDay()] + ", " + date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
    }
    function lmToday() {
      const date = new Date();
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    }
    function lmIsDemoId(id) {
      return id === "lm-demo" || id === "lm-sep7";
    }
    function lmBlankMaterial() {
      return { id: lmId(), title: "", description: "", className: "", unit: "", lesson: "", date: "", published: false, mode: "edit", blocks: [] };
    }
    function lmLoadLibrary() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(LM_KEY) || "null"); } catch (e) {}
      let materials = [];
      if (raw && Array.isArray(raw.materials)) materials = raw.materials;
      else if (raw && Array.isArray(raw.blocks)) {
        if (!raw.id) raw.id = "lm-local";
        if (!raw.date) raw.date = "";
        materials = lmIsDemoId(raw.id) ? [] : [raw];
      }
      materials = materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      const removed = raw && Array.isArray(raw.removed) ? raw.removed.filter((id) => !lmIsDemoId(id)) : [];
      const activeId = raw && raw.activeId && materials.some((row) => row.id === raw.activeId) ? raw.activeId : (materials[0] ? materials[0].id : "");
      return { materials: materials, activeId: activeId, removed: removed };
    }
    function lmPersist() {
      if (lmState && lmState.examOwned) { examSync(); return; }
      if (!lmLibrary) return;
      if (lmState) {
        const index = lmLibrary.materials.findIndex((row) => row.id === lmState.id);
        if (index >= 0) {
          lmLibrary.materials[index] = lmState;
          lmLibrary.activeId = lmState.id;
        }
      }
      lmLibrary.materials = lmLibrary.materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
      lmSchedulePush();
    }
    function lmSchedulePush() {
      if (!canEditLessons() || viewAccount || viewSwitching || !lmServerReady || !authUser) return;
      clearTimeout(lmPushTimer);
      lmPushTimer = setTimeout(lmPushToServer, 500);
    }
    function lmPushToServer() {
      if (!canEditLessons() || viewAccount || viewSwitching || !authUser || !lmLibrary) return Promise.resolve();
      const materials = lmLibrary.materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      return accountFetch("/api/lessons", {
        method: "PUT",
        body: JSON.stringify({ materials: materials })
      }).catch(() => {});
    }
    function lmMergeRemote(localList, remoteList) {
      const map = new Map();
      (remoteList || []).forEach((row) => {
        if (!row || !row.id || lmIsDemoId(row.id)) return;
        map.set(row.id, row);
      });
      (localList || []).forEach((row) => {
        if (!row || !row.id || lmIsDemoId(row.id)) return;
        const have = map.get(row.id);
        if (!have) {
          map.set(row.id, row);
          return;
        }
        const localBlocks = Array.isArray(row.blocks) ? row.blocks.length : 0;
        const remoteBlocks = Array.isArray(have.blocks) ? have.blocks.length : 0;
        if (localBlocks > remoteBlocks) map.set(row.id, row);
        else if (localBlocks === remoteBlocks && String(row.title || "") && !String(have.title || "")) map.set(row.id, row);
      });
      return Array.from(map.values());
    }
    function lmApplyRemote(materials, opts) {
      lmEnsure();
      const lessonState = lmState && !lmState.examOwned ? lmState : null;
      const next = (materials || []).filter((row) => row && row.id && !row.examOwned && !lmIsDemoId(row.id));
      const byId = new Map();
      lmLibrary.materials.forEach((row) => {
        if (row && row.id && !row.examOwned && !lmIsDemoId(row.id)) byId.set(row.id, row);
      });
      next.forEach((row) => {
        if (!byId.has(row.id)) byId.set(row.id, row);
        else if (!lessonState || lessonState.id !== row.id) byId.set(row.id, row);
      });
      if (lessonState && lessonState.id && !lmIsDemoId(lessonState.id) && !byId.has(lessonState.id)) byId.set(lessonState.id, lessonState);
      const openId = lessonState && lessonState.id;
      lmLibrary.materials = Array.from(byId.values());
      if (openId && byId.has(openId)) {
        lmState = byId.get(openId);
        lmLibrary.activeId = openId;
      } else if (!byId.has(lmLibrary.activeId)) lmLibrary.activeId = lmLibrary.materials[0] ? lmLibrary.materials[0].id : "";
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
      if (opts && opts.push) lmSchedulePush();
      if(typeof paintHomeStats==='function'&&document.querySelector('section.on')?.id==='home')paintHomeStats();
    }
    function lmPullFromServer() {
      if (!authUser || viewSwitching) return Promise.resolve();
      const bootGen = viewGen;
      const viewing = !!(viewAccount && viewAccount.id);
      return accountFetch("/api/lessons").then((data) => {
        if (bootGen !== viewGen || viewSwitching) return;
        const stillViewing = !!(viewAccount && viewAccount.id);
        if (viewing !== stillViewing) return;
        lmServerReady = true;
        const remote = data && Array.isArray(data.materials) ? data.materials : [];
        lmEnsure();
        const local = lmLibrary.materials.slice();
        const canMerge = canEditLessons() && !viewAccount;
        const merged = canMerge ? lmMergeRemote(local, remote) : remote.filter((row) => row && !lmIsDemoId(row.id));
        const richerLocal = canMerge && local.some((row) => {
          if (!row || lmIsDemoId(row.id)) return false;
          const remoteRow = remote.find((item) => item && item.id === row.id);
          const localBlocks = Array.isArray(row.blocks) ? row.blocks.length : 0;
          const remoteBlocks = remoteRow && Array.isArray(remoteRow.blocks) ? remoteRow.blocks.length : 0;
          return localBlocks > remoteBlocks;
        });
        lmApplyRemote(merged, { push: !!richerLocal || (canMerge && !remote.length && local.length) });
        if (classGroupsDirty) groupSave();
      }).catch(() => {
        if (bootGen !== viewGen || viewSwitching) return;
        lmServerReady = !!authUser;
      });
    }
    function lmLessonFingerprint(lesson) {
      if (!lesson) return "";
      return JSON.stringify({
        title: lesson.title || "",
        description: lesson.description || "",
        className: lesson.className || "",
        unit: lesson.unit || "",
        lesson: lesson.lesson || "",
        date: lesson.date || "",
        blocks: lesson.blocks || []
      });
    }
    function lmSyncSaveDraftButton() {
      const button = document.getElementById("lmSave");
      if (!button) return;
      const dirty = !!(lmState && lmLessonFingerprint(lmState) !== lmSavedFingerprint);
      button.disabled = !dirty;
      button.classList.toggle("is-disabled", !dirty);
      button.setAttribute("aria-disabled", dirty ? "false" : "true");
    }
    function lmMarkDraftSaved() {
      lmSavedFingerprint = lmLessonFingerprint(lmState);
      lmSyncSaveDraftButton();
    }
    function lmSchedule() {
      clearTimeout(lmSaveTimer);
      lmSaveTimer = setTimeout(lmPersist, 400);
      lmSyncSaveDraftButton();
    }
    function lmId() { return "lm-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function lmUniqueId() {
      const used = {};
      if (lmLibrary && Array.isArray(lmLibrary.materials)) {
        lmLibrary.materials.forEach((row) => { if (row && row.id) used[row.id] = 1; });
      }
      let id = lmId();
      let n = 2;
      while (used[id]) {
        id = lmId() + "-" + n;
        n += 1;
      }
      return id;
    }
    function lmBlock(id) { return (lmState.blocks || []).find((row) => row.id === domEntityId(id)); }
    function lmPlain(html) {
      const parsed = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
      const box = parsed.body && parsed.body.firstElementChild ? parsed.body.firstElementChild : null;
      return ((box && box.textContent) || "").replace(/\s+/g, " ").trim();
    }
    function lmClean(html) {
      // Parse off-document so <img onerror> etc. cannot run during sanitize.
      const parsed = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
      const box = parsed.body && parsed.body.firstElementChild ? parsed.body.firstElementChild : parsed.createElement("div");
      Array.from(box.querySelectorAll("*")).forEach((node) => {
        if (!node.parentNode) return;
        const tag = node.tagName;
        if (tag === "SPAN") {
          const px = /^(\d+(?:\.\d+)?)px$/.exec(String(node.style.fontSize || ""));
          const familyKey = lmFontKey(node.style.fontFamily);
          const color=node.style.color;
          while (node.attributes.length) node.removeAttribute(node.attributes[0].name);
          if (px) {
            const size = Math.min(96, Math.max(10, Math.round(Number(px[1]))));
            node.style.fontSize = size + "px";
          }
          if (familyKey) node.style.fontFamily = LM_FONTS[familyKey];
          if(color)node.style.color=color;
          if (!node.getAttribute("style")) {
            const parent = node.parentNode;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
          }
          return;
        }
        if (!/^(B|STRONG|I|EM|U|A|UL|OL|LI|P|BR|DIV)$/.test(tag)) {
          const parent = node.parentNode;
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
          return;
        }
        Array.from(node.attributes).forEach((attr) => {
          if (tag === "A" && attr.name === "href") return;
          node.removeAttribute(attr.name);
        });
        if (tag === "A") {
          const href = node.getAttribute("href") || "";
          if (!/^https?:\/\//i.test(href)) node.removeAttribute("href");
          else { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noreferrer"); }
        }
      });
      return box.innerHTML;
    }
    function lmFontFamily(key) {
      return LM_FONTS[key] || "";
    }
    function lmFontKey(value) {
      const clean = String(value || "").replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!clean) return "";
      const keys = Object.keys(LM_FONTS);
      for (let i = 0; i < keys.length; i++) {
        const stack = LM_FONTS[keys[i]].replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        if (stack === clean) return keys[i];
      }
      return "";
    }
    function lmTextStyle(block) {
      const bits = [];
      const size = Math.round(Number(block && block.fontSize));
      if (size >= 10 && size <= 96) bits.push("font-size:" + size + "px");
      const family = lmFontFamily(block && block.fontFamily);
      if(/^#[a-f0-9]{6}$/i.test(block?.textColor||''))bits.push('color:'+block.textColor);
      if (family) bits.push("font-family:" + family);
      return bits.length ? ' style="' + esc(bits.join(";")) + '"' : "";
    }
    function lmTextTools(block) {
      const size = block.fontSize >= 10 && block.fontSize <= 96 ? block.fontSize : 17;
      const fonts = [["", "Font"], ["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"], ["georgia", "Georgia"], ["verdana", "Verdana"], ["palatino", "Palatino"], ["trebuchet", "Trebuchet"], ["courier", "Courier"]];
      const options = fonts.map((pair) => '<option value="' + pair[0] + '"' + (block.fontFamily === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>").join("");
      return '<div class="lm-tools"><select data-font-family="' + block.id + '" aria-label="Font">' + options + '</select><button type="button" data-font="up" aria-label="Larger text">A+</button><button type="button" data-font="down" aria-label="Smaller text">A−</button><input class="lm-font-size" type="number" min="10" max="96" step="1" data-font-size="' + block.id + '" value="' + size + '" aria-label="Font size" /><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList">List</button><button type="button" data-cmd="link">Link</button><input type="color" data-lm-color="' + block.id + '" value="' + esc(block.textColor || '#173832') + '" title="Text color" aria-label="Text color" /></div>';
    }
    function lmActiveFontRange(rich) {
      const sel = window.getSelection();
      let range = null;
      if (sel && sel.rangeCount && rich && rich.contains(sel.anchorNode)) range = sel.getRangeAt(0);
      if ((!range || range.collapsed) && lmFontRange && lmFontRange.startContainer && rich && rich.contains(lmFontRange.startContainer)) range = lmFontRange;
      return range && !range.collapsed ? range : null;
    }
    function lmCurrentTextSize(rich, block) {
      const range = lmActiveFontRange(rich);
      const node = range && range.startContainer;
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (el && rich && rich.contains(el)) {
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px) return Math.round(px);
      }
      const saved = Math.round(Number(block && block.fontSize));
      return saved >= 10 && saved <= 96 ? saved : 17;
    }
    function lmApplyTextFont(rich, block, patch) {
      if (!rich || !block) return;
      const range = lmActiveFontRange(rich);
      if (range) {
        const span = document.createElement("span");
        if (patch.size) span.style.fontSize = patch.size + "px";
        if (patch.family) span.style.fontFamily = lmFontFamily(patch.family);
        try {
          span.appendChild(range.extractContents());
          range.insertNode(span);
          const next = document.createRange();
          next.selectNodeContents(span);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(next);
          lmFontRange = next.cloneRange();
          block.html = rich.innerHTML;
        } catch (e) {
          if (patch.size) block.fontSize = patch.size;
          if (patch.family !== undefined) block.fontFamily = patch.family;
        }
      } else {
        if (patch.size) {
          block.fontSize = patch.size;
          rich.style.fontSize = patch.size + "px";
        }
        if (patch.family !== undefined) {
          block.fontFamily = patch.family;
          rich.style.fontFamily = lmFontFamily(patch.family);
        }
      }
      lmSchedule();
    }
    function lmFileSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    function lmTab() {
      const id = lmState && lmState.tab;
      if(id==='speech'&&!lmState.examOwned&&window.LearningWorkbench?.lessonSpeechButton())return id;
      if (id === "words" || id === "phrases" || id === "rules" || id === "classwork" || id === "homework" || id === "pdf" || id === "evaluation") return id;
      return "overview";
    }
    function lmBlocksFor(tab) {
      const id = tab || lmTab();
      const raw = (lmState && lmState.blocks || []).filter((block) => (block.tab || "overview") === id);
      if (id === "classwork" || id === "homework") {
        const unverified = raw.filter((b) => !b.teacherVerified);
        const verified = raw.filter((b) => !!b.teacherVerified);
        return unverified.concat(verified);
      }
      return raw;
    }
    function lmWordCardHtml(block) {
      const card = { word: block.word, en: block.word, ru: block.ru || "", uk: block.uk || "", us: block.us || "", data: block.data || null };
      if (examStudentRestricted()) return '<details class="lm-study-card"><summary>' + esc(block.word || '') + '</summary><div class="lm-study-card-body">' + ipaHtml(card) + (block.pos ? '<p>' + esc(block.pos) + '</p>' : '') + '</div></details>';
      const suppBadge = block.supplementary ? '<span class="lm-supplementary-tag">Supplementary</span>' : '';
      const typeBadge = block.expressionType === 'PHRASAL_VERB' ? '<span class="lm-expression-type-tag">Phrasal Verb</span>' : (block.expressionType === 'IDIOM' ? '<span class="lm-expression-type-tag">Idiom</span>' : (block.expressionType === 'COLLOCATION' ? '<span class="lm-expression-type-tag">Collocation</span>' : ''));
      const content = '<button class="wcard" type="button" data-lm-word="' + esc(block.id) + '">' + wordPic(block.word) + '<div class="en">' + esc(block.word || "") + suppBadge + typeBadge + '</div>' + (block.pos ? '<div class="pos">' + esc(block.pos) + "</div>" : "") + ipaHtml(card) + (block.pdfVocabulary?.meaning?'<div class="meaning" lang="en">'+esc(block.pdfVocabulary.meaning)+'</div>':'') + '<div class="label" lang="ru">' + esc(block.ru || "") + "</div></button>";
      const kit = window.LearningWorkbench?.lessonButton(block) || '';
      return kit ? '<div class="lm-word-card-wrap">' + content + '<div class="lm-word-kit">' + kit + '</div></div>' : content;
    }
    function lmRuleCardHtml(block, link) {
      if(block.grammarRule)return '<button type="button" class="g-topic" data-grammar-rule="'+esc(block.grammarRule)+'"><b>'+esc(block.grammarRule)+'</b><span class="form">Grammar</span></button>';
      const topic = block.compare ? null : topicById(block.topic);
      const compare = block.compare ? ((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((item) => item.id === block.topic)[0] : null;
      const name = (topic && topic.name) || (compare && compare.title) || block.title || block.name || "Rule";
      const form = (topic && topic.form) || (compare ? "compare" : "open");
      const tone = (topic && topic.tone) || (compare && compare.tone) || "advanced";
      const attr = link ? (block.compare ? ' data-compare="' + esc(block.topic) + '"' : ' data-topic="' + esc(block.topic) + '"') : "";
      const tag = link ? "button" : "div";
      return "<" + tag + ' class="g-topic tone-' + esc(tone) + '"' + attr + (link ? ' type="button"' : "") + "><b>" + esc(name) + '</b><span class="form">' + esc(form) + "</span></" + tag + ">";
    }
    function lmQuizBlankItem(quizType) {
      const kind = quizType || "Choice";
      if (kind === "Flip" || kind === "Reverse") return { front: "", back: "" };
      if (kind === "Smart Flashcard" || kind === "FSRS Flashcard") return { front: "", back: "", example: "" };
      if (kind === "Choice") return { prompt: "", options: ["", "", ""], answer: 0 };
      if (kind === "Video choice") return { prompt: "", options: ["", "", ""], answer: 0, mediaId: "", transcript: "" };
      if (kind === "Type" || kind === "Listen" || kind === "Definition") return { prompt: "", answer: "" };
      if (kind === "Pronounce") return { prompt: "", answer: "", word: "", ipa: "" };
      if (kind === "Gap") return { shown: "", answer: "", hint: "" };
      if (kind === "Build") return { parts: "", answer: "" };
      if (kind === "Match" || kind === "Memory") return { left: "", right: "" };
      if (kind === "True / false") return { prompt: "", answer: "true" };
      if (kind === "Tap") return { text: "", answer: "" };
      if (kind === "Select all") return { prompt: "", options: ["", "", ""], answers: [] };
      if (kind === "Spell" || kind === "Letters" || kind === "Hangman") return { word: "" };
      if (kind === "Odd one out") return { options: ["", "", "", ""], answer: 0 };
      return { prompt: "", options: ["", "", ""], answer: 0 };
    }
    function lmQuizType(block) {
      return (block && block.quizType) || "Choice";
    }
    function lmBlank(type, quizType) {
      const id = lmId();
      const base = { id: id, type: type, collapsed: false, tab: lmTab() };
      if (['quiz','exercise','task'].includes(type)) Object.assign(base,{gradeMode:'assignment',maxPoints:lmState?.examOwned?'':1,assignmentId:'a-' + crypto.randomUUID(),...(lmState?.examOwned?{scoringVersion:2}:{})});
      if (type === "heading") return Object.assign(base, { level: "h2", text: "New heading" });
      if (type === "text" || type === "reading") return Object.assign(base, type === "text" ? { html: "<p></p>" } : { title: "Reading", text: "", marks: [] });
      if (type === "pdf" || type === "image" || type === "audio" || type === "file") return Object.assign(base, { name: "", size: "", caption: "", title: "" });
      if (type === "link") return Object.assign(base, { title: "", url: "", description: "" });
      if (type === "interactive") return Object.assign(base, { title: "", url: "" });
      if (type === "cards") return Object.assign(base, { title: "Vocabulary", items: [{ front: "", back: "", example: "" }] });
      if (type === "video") return Object.assign(base, { source: "link", url: "", title: "", name: "", size: "" });
      if (type === "vocab") return Object.assign(base, { title: "Vocabulary", items: [{ word: "", translation: "", ipa: "", example: "" }] });
      if (type === "exercise") return Object.assign(base, { items: [{ prompt: "", kind: "choice", options: ["", "", ""], answer: 0, write: "" }] });
      if (type === "quiz") {
        const kind = quizType || "Choice";
        const quiz = { title: kind, quizType: kind, items: [lmQuizBlankItem(kind)] };
        if (kind === "Memory") quiz.memorySize = 4;
        return Object.assign(base, quiz);
      }
      if (type === "note") return Object.assign(base, { tone: "tip", text: "" });
      if (type === "dialogue") return Object.assign(base, { title: "Dialogue", lines: [{ speaker: "", text: "" }] });
      if (type === "pronunciation") return Object.assign(base, { word: "", ipa: "", name: "", size: "" });
      if (type === "table") return Object.assign(base, { columns: ["", ""], rows: [["", ""], ["", ""]] });
      if (type === "task") return Object.assign(base, { title: "Task", text: "", response: "" });
      if (type === "divider") return Object.assign(base, { label: "" });
      if (type === "phrase") return Object.assign(base, { items: [{ phrase: "", meaning: "", example: "" }] });
      if (type === "rule") return Object.assign(base, { title: "New rule", name: "New rule", explanation: "", pattern: "", examples: [] });
      return Object.assign(base, { title: "Vocabulary", items: [{ front: "", back: "", example: "" }], type: "cards" });
    }
    function lmNewItem(kind, quizType) {
      if (kind === "vocab") return { word: "", translation: "", ipa: "", example: "" };
      if (kind === "dialogue") return { speaker: "", text: "" };
      if (kind === "phrase") return { phrase: "", meaning: "", example: "" };
      if (kind === "exercise") return { prompt: "", kind: "choice", options: ["", "", ""], answer: 0, write: "" };
      if (kind === "quiz") return lmQuizBlankItem(quizType || "Choice");
      return { front: "", back: "", example: "" };
    }
    function lmSummary(block) {
      if (block.type === "interactive") return block.title || "Interactive";
      if (block.type === "heading") return block.text || "Heading";
      if (block.type === "text" || block.type === "reading") return lmPlain(block.html || block.text) || block.title || "Text";
      if (block.type === "pdf" || block.type === "audio" || block.type === "file" || block.type === "image") return block.title || block.caption || block.name || "No file yet";
      if (block.type === "link" || block.type === "video") return block.title || block.url || block.name || "Link";
      if (block.type === "note") return block.text || "Note";
      if (block.type === "divider") return block.label || "Divider";
      if (block.type === "pronunciation") return [block.word, block.ipa].filter(Boolean).join(" ") || "Pronunciation";
      if (block.type === "task") return block.title || block.text || "Task";
      if (block.type === "table") return (block.columns || []).filter(Boolean).join(" · ") || "Table";
      if (block.type === "dialogue") return (block.lines || []).map((line) => line.speaker).filter(Boolean).join(" · ") || "Dialogue";
      if (block.type === "vocab") return (block.items || []).map((row) => row.word).filter(Boolean).join(" · ") || "Vocabulary";
      if (block.type === "phrase") return (block.items || []).map((row) => row.phrase).filter(Boolean).join(" · ") || "Phrase";
      if (block.type === "wordcard") return block.word || "Word";
      if (block.type === "rule") return block.title || block.name || "Rule";
      if (block.type === "exercise") return (block.items || []).map((row) => row.prompt).filter(Boolean).join(" · ") || "Questions";
      if (block.type === "quiz") {
        const kind = lmQuizType(block);
        const items = block.items || [];
        const bits = items.map((row) => row.prompt || row.front || row.word || row.shown || row.text || row.left || row.definition || "").filter(Boolean);
        return (kind + (bits.length ? " · " + bits.join(" · ") : "")) || block.title || "Quiz";
      }
      return (block.items || []).map((card) => card.front).filter(Boolean).join(" · ") || "Cards";
    }
    function lmEmbed(url) {
      const raw = String(url || "").trim();
      let match = raw.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{6,})/i);
      if (match) return "https://www.youtube-nocookie.com/embed/" + match[1];
      match = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
      if (match) return "https://player.vimeo.com/video/" + match[1];
      match = raw.match(/(?:youtube\.com\/live\/)([\w-]{6,})/i);
      if (match) return "https://www.youtube-nocookie.com/embed/" + match[1];
      return "";
    }
    function lmHostLabel(url) {
      try { return new URL(url).hostname.replace(/^www\./, ""); }
      catch (e) { return ""; }
    }
    function lmUrlKind(url) {
      const href = String(url || "").trim();
      if (!/^https?:\/\//i.test(href)) return { kind: "", href: "" };
      const embed = lmEmbed(href);
      if (embed) return { kind: "video-embed", href: href, src: embed };
      if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(href)) return { kind: "video-file", href: href, src: href };
      if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(href)) return { kind: "audio-file", href: href, src: href };
      return { kind: "page", href: href, src: href };
    }
    function lmVideoFrame(src, title) {
      return (title ? "<h3>" + esc(title) + "</h3>" : "") + '<div class="lm-frame-video"><iframe src="' + esc(src) + '" title="' + esc(title || "Video") + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }
    function lmInteractiveFrame(block) {
      const src = wordwallSource(block.url);
      return src ? (block.title ? '<h3>' + esc(block.title) + '</h3>' : '') + '<div class="lm-frame-interactive saas-card"><iframe src="' + esc(src) + '" title="' + esc(block.title || 'Wordwall activity') + '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="fullscreen" allowfullscreen></iframe></div>' : '';
    }
    function lmLinkCard(block, href) {
      const title = block.title || href || "Link";
      const host = lmHostLabel(href);
      const note = block.description || "";
      return '<a class="lm-link-card" href="' + esc(href || "#") + '" target="_blank" rel="noopener noreferrer" data-link-preview="' + esc(href) + '"' + (note ? ' data-keep-desc="1"' : "") + '>' +
        '<span class="lm-link-card-media" aria-hidden="true"></span>' +
        '<span class="lm-link-card-copy"><b>' + esc(title) + '</b><span class="lm-link-card-desc">' + esc(note) + '</span><small class="lm-link-card-host">' + esc(host) + "</small></span></a>";
    }
    function lmDecodeEntities(text) {
      const value = String(text || "");
      if (!value || value.indexOf("&") < 0) return value;
      const box = document.createElement("textarea");
      box.innerHTML = value;
      return box.value;
    }
    function lmHydrateLinkPreviews(root) {
      const box = root || document.getElementById("lmPreview");
      if (!box || !authUser) return;
      box.querySelectorAll("[data-link-preview]").forEach((card) => {
        const href = card.getAttribute("data-link-preview") || "";
        if (!href || card.dataset.previewLoaded) return;
        card.dataset.previewLoaded = "1";
        accountFetch("/api/link-preview?url=" + encodeURIComponent(href)).then((data) => {
          if (!data || !card.isConnected) return;
          const title = card.querySelector("b");
          const host = card.querySelector(".lm-link-card-host");
          const desc = card.querySelector(".lm-link-card-desc");
          const media = card.querySelector(".lm-link-card-media");
          if (title && data.title && card.getAttribute("data-keep-title") !== "1") title.textContent = lmDecodeEntities(data.title);
          if (host && data.host) host.textContent = data.host;
          if (desc && card.getAttribute("data-keep-desc") !== "1") {
            desc.textContent = lmDecodeEntities(data.description || "") || data.host || "";
          }
          if (media && data.image) {
            let imageUrl = "";
            try {
              const parsed = new URL(String(data.image || "").trim());
              if (parsed.protocol === "http:" || parsed.protocol === "https:") imageUrl = parsed.toString();
            } catch (e) {}
            if (imageUrl) {
              media.style.backgroundImage = "url(\"" + imageUrl.replace(/\\/g, "\\\\").replace(/"/g, "%22") + "\")";
              media.classList.add("has-image");
            }
          }
        }).catch(() => {});
      });
    }
    function lmFileUrl(id) {
      return "/api/lesson-file?id=" + encodeURIComponent(id);
    }
    function lmExternalFile(block) {
      if (block && block.hasFile) return "";
      try {
        const url = new URL(block && block.remoteUrl);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
      } catch (e) { return ""; }
    }
    function lmSrc(block) {
      if (block?.archiveMediaUrl) return block.archiveMediaUrl;
      if (!block || !block.id) return "";
      if (lmFiles[block.id]) return lmFiles[block.id];
      if (lmExternalFile(block)) return lmExternalFile(block);
      if (block.hasFile || (block.hasFile !== false && block.name && !block.sample)) return lmFileUrl(block.id);
      return "";
    }
    function lmUploadFile(id, file) {
      if (!authUser || !canEditLessons() || !id || !file) return Promise.resolve(false);
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", lmFileUrl(id));
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(file);
      });
    }
    function lmDeleteRemoteFile(id) {
      if (!authUser || !canEditLessons() || !id) return Promise.resolve();
      return fetch(lmFileUrl(id), { method: "DELETE", credentials: "include" }).catch(() => {});
    }
    function lmMedia(id, kind) {
      const block = lmBlock(id);
      const url = lmSrc(block) || lmFiles[id];
      if (!url) return "";
      if (kind === "image") return '<img class="lm-shot" alt="" src="' + esc(url) + '" />';
      if (kind === "audio") return '<audio class="lm-player" controls src="' + esc(url) + '"></audio>';
      if (kind === "video") return '<video class="lm-player" controls src="' + esc(url) + '"></video>';
      return "";
    }
    function lmFileBox(block, accept, emptyText, kind) {
      const preview = lmMedia(block.id, kind);
      if (!block.name) return '<label class="lm-drop">' + emptyText + '<small>or click to upload</small><input type="file" accept="' + accept + '" data-file="' + block.id + '" /></label>';
      return preview + '<div class="lm-file"><span aria-hidden="true">📄</span><div class="lm-file-copy"><b>' + esc(block.name) + "</b><small>" + esc(block.size || "") + '</small></div><div class="lm-file-actions"><label class="lm-linkish">Replace<input type="file" accept="' + accept + '" data-file="' + block.id + '" hidden /></label><button class="lm-linkish" type="button" data-file-clear="' + block.id + '">Remove</button></div></div>';
    }
    function lmFileTitle(block) {
      return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" placeholder="Name for learners" /></label>';
    }
    function lmItemTools(blockId, list, index) {
      return '<div class="lm-card-actions"><button class="lm-icon" type="button" data-item-up="' + blockId + ":" + list + ":" + index + '" aria-label="Move up">↑</button><button class="lm-icon" type="button" data-item-down="' + blockId + ":" + list + ":" + index + '" aria-label="Move down">↓</button><button class="lm-icon danger" type="button" data-item-del="' + blockId + ":" + list + ":" + index + '" aria-label="Delete">×</button></div>';
    }
    function lmItemField(block, list, index, key, label, wide) {
      const item = block[list][index] || {};
      return '<label' + (wide ? ' class="lm-span"' : "") + ">" + label + '<input type="text" data-item-field="' + key + '" data-item-list="' + list + '" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(item[key] || "") + '" /></label>';
    }
    function lmItemRows(block, list, fields) {
      return (block[list] || []).map((item, index) => '<div class="lm-card-row"><div class="lm-card-fields">' + fields.map((field) => lmItemField(block, list, index, field[0], field[1], field[2])).join("") + "</div>" + lmItemTools(block.id, list, index) + "</div>").join("");
    }
    function lmChoiceEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="radio" name="ans-' + block.id + "-" + index + '" data-correct="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.answer) === oi ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmSelectAllEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      const answers = Array.isArray(question.answers) ? question.answers.map(Number) : [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="checkbox" data-select-ans="' + block.id + ":" + index + ":" + oi + '"' + (answers.indexOf(oi) >= 0 ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmOddEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="radio" name="odd-' + block.id + "-" + index + '" data-correct="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.answer) === oi ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmQuizItemEditor(block, index) {
      const kind = lmQuizType(block);
      const item = block.items[index];
      if (kind === "Flip" || kind === "Reverse") {
        return lmItemField(block, "items", index, "front", kind === "Reverse" ? "Russian" : "Front", true) +
          lmItemField(block, "items", index, "back", kind === "Reverse" ? "English" : "Back", true);
      }
      if (kind === "Smart Flashcard" || kind === "FSRS Flashcard") {
        return lmItemField(block, "items", index, "front", "Front (Word / Prompt)", true) +
          lmItemField(block, "items", index, "back", "Back (Translation / Meaning)", true) +
          lmItemField(block, "items", index, "example", "Example sentence", true);
      }
      if (kind === "Choice") {
        return lmItemField(block, "items", index, "prompt", "Question", true) + lmChoiceEditor(block, index);
      }
      if (kind === "Video choice") {
        return lmItemField(block, "items", index, "prompt", "Question / Prompt", true) +
          lmItemField(block, "items", index, "mediaId", "Video Media ID / URL", true) +
          lmItemField(block, "items", index, "transcript", "Video transcript / subtitle", true) +
          lmChoiceEditor(block, index);
      }
      if (kind === "Type" || kind === "Listen") {
        return lmItemField(block, "items", index, "prompt", kind === "Listen" ? "Prompt / transcript" : "Prompt", true) +
          lmItemField(block, "items", index, "answer", "Answer", true);
      }
      if (kind === "Pronounce") {
        return lmItemField(block, "items", index, "word", "Word / Phrase to pronounce", true) +
          lmItemField(block, "items", index, "ipa", "IPA transcription (optional)", true) +
          lmItemField(block, "items", index, "prompt", "Context prompt", true);
      }
      if (kind === "Definition") {
        return lmItemField(block, "items", index, "prompt", "Definition", true) +
          lmItemField(block, "items", index, "answer", "Word", true);
      }
      if (kind === "Gap") {
        return lmItemField(block, "items", index, "shown", "Sentence with ___", true) +
          lmItemField(block, "items", index, "answer", "Missing word", true) +
          lmItemField(block, "items", index, "hint", "Hint", true);
      }
      if (kind === "Build") {
        return lmItemField(block, "items", index, "parts", "Parts (space-separated)", true) +
          lmItemField(block, "items", index, "answer", "Correct sentence", true);
      }
      if (kind === "Match" || kind === "Memory") {
        return lmItemField(block, "items", index, "left", "Left", true) +
          lmItemField(block, "items", index, "right", "Right", true);
      }
      if (kind === "True / false") {
        const yes = String(item.answer) !== "false";
        return lmItemField(block, "items", index, "prompt", "Statement", true) +
          '<label>Answer<select data-item-field="answer" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="true"' + (yes ? " selected" : "") + '>True</option><option value="false"' + (yes ? "" : " selected") + ">False</option></select></label>";
      }
      if (kind === "Tap") {
        return lmItemField(block, "items", index, "text", "Sentence", true) +
          lmItemField(block, "items", index, "answer", "Word to tap", true);
      }
      if (kind === "Select all") {
        return lmItemField(block, "items", index, "prompt", "Question", true) + lmSelectAllEditor(block, index);
      }
      if (kind === "Spell" || kind === "Letters" || kind === "Hangman") {
        return lmItemField(block, "items", index, "word", "Word", true);
      }
      if (kind === "Odd one out") {
        return '<p class="lm-note">Mark the odd one out.</p>' + lmOddEditor(block, index);
      }
      return lmItemField(block, "items", index, "prompt", "Question", true) + lmChoiceEditor(block, index);
    }
    function lmQuizItems(block) {
      const kind = lmQuizType(block);
      const addLabel = (kind === "Match" || kind === "Memory") ? "+ Add pair" : (kind === "Spell" || kind === "Letters" || kind === "Hangman") ? "+ Add word" : (kind === "Video choice" || kind === "Choice" || kind === "Select all" || kind === "Odd one out") ? "+ Add question" : "+ Add card";
      const memory = kind === "Memory" ? '<label>Pairs in one set<input type="number" min="2" data-field="memorySize" data-block="' + block.id + '" value="' + esc(String(block.memorySize || 4)) + '" /></label>' : "";
      const rows = (block.items || []).map((item, index) =>
        '<div class="lm-card-row"><div class="lm-card-fields">' + lmQuizItemEditor(block, index) + "</div>" + lmItemTools(block.id, "items", index) + "</div>"
      ).join("");
      return memory + '<div class="lm-card-list">' + rows + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':quiz">'+ addLabel + "</button>";
    }
    function contentCopyButton(type, id, parent, parentId, className) {
      if (!canEditLessons() || !id || (parent && !parentId)) return "";
      const source = [type, id, parent, parentId].filter(value => value !== undefined).join(":");
      return '<button class="' + (className || 'day-edit') + ' content-copy-icon" type="button" data-content-copy="' + esc(source) + '" aria-label="Copy" title="Copy"><span aria-hidden="true">&#10697;</span></button>';
    }
    function lmHead(block, label, isFirst, isLast, isVerifiedSection) {
      const copy = contentCopyButton('material', block.id, lmState.examOwned ? 'exam-block' : 'lesson', lmState.id, 'lm-icon');
      const newBadge = block.id === lmLastAddedBlockId ? '<span class="lm-new-badge">New</span>' : '';
      const verifiedBadge = block.teacherVerified ? '<span class="lm-verified-badge" title="Verified by Teacher">✓ Verified by Teacher</span>' : '';
      const topDisabled = isFirst ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const upDisabled = isFirst ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const downDisabled = isLast ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const bottomDisabled = isLast ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const isShut = isVerifiedSection ? !block.unfolded : Boolean(block.collapsed);
      return '<div class="lm-block-head"><button class="lm-grip" type="button" data-grip="' + block.id + '" aria-label="Move">≡</button><span class="lm-type">' + label + '</span>' + newBadge + verifiedBadge + '<div class="lm-head-actions"><button class="lm-icon" type="button" data-lm-fold="' + block.id + '" aria-label="Collapse">' + (isShut ? "▸" : "▾") + '</button><button class="lm-icon" type="button" data-lm-top="' + block.id + '" aria-label="Move to top" title="Move to top"' + topDisabled + '>⤒</button><button class="lm-icon" type="button" data-lm-up="' + block.id + '" aria-label="Move up"' + upDisabled + '>↑</button><button class="lm-icon" type="button" data-lm-down="' + block.id + '" aria-label="Move down"' + downDisabled + '>↓</button><button class="lm-icon" type="button" data-lm-bottom="' + block.id + '" aria-label="Move to bottom" title="Move to bottom"' + bottomDisabled + '>⤓</button><button class="lm-icon" type="button" data-lm-menu="' + block.id + '" aria-label="More">⋮</button>' + copy + '<button class="lm-icon danger" type="button" data-lm-del="' + block.id + '" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button><div class="lm-pop" data-pop="' + block.id + '" hidden><button type="button" data-lm-edit="' + block.id + '">Edit</button><button type="button" data-lm-insert-above="' + block.id + '">Insert above...</button><button type="button" data-lm-insert-below="' + block.id + '">Insert below...</button></div></div></div><p class="lm-summary">' + esc(lmSummary(block)) + "</p>";
    }
    function parseGapsFromText(text) {
      if (typeof text !== "string") return [];
      const re = /\[(?:(\d+):)?([^\]|]+)(?:\|([^\]]+))?\]/g;
      const gaps = [];
      let m;
      let autoIdx = 1;
      while ((m = re.exec(text)) !== null) {
        const rawIdx = m[1] ? parseInt(m[1], 10) : autoIdx;
        autoIdx++;
        const mainPart = m[2].trim();
        const extraPart = (m[3] || "").trim();
        let target = mainPart;
        let mode = "open";
        let stem = "";
        let hint = "";
        let hints = [];
        let time = "";
        let options = [];
        let alternatives = [];
        if (mainPart.includes("/")) {
          options = mainPart.split("/").map(s => s.trim()).filter(Boolean);
          target = options[0] || "";
        }
        if (extraPart) {
          const parts = extraPart.split("|");
          for (const p of parts) {
            const colonIdx = p.indexOf(":");
            const k = (colonIdx > -1 ? p.slice(0, colonIdx) : p).trim();
            const v = (colonIdx > -1 ? p.slice(colonIdx + 1) : "").trim();
            if (k === "correct" && v) target = v;
            else if (k === "stem" && v) { stem = v; mode = "stem"; }
            else if ((k === "hint" || k === "first") && v) hint = v;
            else if (k === "time" && v) time = v;
            else if ((k === "hint1" || k === "hint2" || k === "hint3") && v) hints.push(v);
            else if (k === "hints" && v) hints.push(...v.split(/[,;/]+/).map(s => s.trim()).filter(Boolean));
            else if (k === "mode" && v) mode = v;
            else if (k === "alt" && v) alternatives.push(...v.split(",").map(s => s.trim()));
          }
        }
        if (options.length > 0 && mode === "open") mode = "dropdown";
        gaps.push({ index: rawIdx, target: target, mode: mode, stem: stem, hint: hint, hints: hints, time: time, options: options, alternatives: alternatives });
      }
      return gaps;
    }
    window.parseGapsFromText = parseGapsFromText;
    function lmRenderTextGapsPreview(block, index, question) {
      const mode = question.mode || "open";
      const gaps = parseGapsFromText(question.text || "");
      const given = question.given || {};
      const marked = Boolean(question.marked);
      const hintsLevel = question.hintsLevel || {};

      let mediaHtml = "";
      const hasAudio = Boolean(question.audioUrl || question.audio || gaps.some(g => g.time));
      const hasVisual = Boolean(question.imageUrl || question.image);

      if (hasAudio || hasVisual) {
        let audioCard = "";
        if (hasAudio) {
          audioCard = '<div class="gap-audio-card">' +
            '<div class="gap-audio-head"><span>Audio Track: Lesson Listening</span><span class="gap-audio-badge">Audio</span></div>' +
            '<div class="gap-audio-controls">' +
              '<button type="button" class="gap-play-btn" data-gap-play="' + block.id + ":" + index + '" title="Play / Pause">▶</button>' +
              '<div class="gap-audio-track"><div class="gap-progress-bar"><div class="gap-progress-fill" style="width:30%;"></div></div>' +
              '<div class="gap-audio-time"><span>00:15</span><span>01:10</span></div></div>' +
              '<div class="gap-audio-tools"><button type="button" class="gap-audio-sub-btn" data-gap-audio-rewind="' + block.id + ":" + index + '" title="Replay 5s">⟲ 5s</button>' +
              '<button type="button" class="gap-audio-sub-btn" data-gap-audio-speed="' + block.id + ":" + index + '" title="Speed">1.0x</button></div>' +
            '</div></div>';
        }
        let visualCard = "";
        if (hasVisual) {
          const imgUrl = question.imageUrl || question.image || "";
          visualCard = '<div class="gap-visual-card">' +
            '<button type="button" class="gap-visual-zoom" data-gap-zoom="' + block.id + ":" + index + '" title="Enlarge image">🔍 Zoom</button>' +
            '<div class="gap-visual-img">' + (imgUrl ? '<img src="' + esc(imgUrl) + '" style="max-width:100%; max-height:90px; object-fit:contain;" />' : '<span>🗺️ Diagram</span>') + '</div>' +
            '<div class="gap-visual-caption">Figure: Reference diagram</div>' +
          '</div>';
        }
        mediaHtml = '<div class="gap-media-grid">' + audioCard + visualCard + '</div>';
      }

      let wordBankHtml = "";
      if (mode === "bank") {
        const allWords = gaps.map(g => g.target).concat((question.distractors || "").split(/[\s,]+/).filter(Boolean));
        const usedCounts = {};
        Object.values(given).forEach(w => {
          const k = String(w || "").trim().toLowerCase();
          if (k) usedCounts[k] = (usedCounts[k] || 0) + 1;
        });
        const currentSeen = {};
        const chips = allWords.map((word) => {
          const k = word.toLowerCase();
          currentSeen[k] = (currentSeen[k] || 0) + 1;
          const isUsed = (usedCounts[k] || 0) >= currentSeen[k];
          return '<span class="word-chip' + (isUsed ? " is-used" : "") + '" draggable="' + (!isUsed) + '" data-gap-word="' + esc(word) + '" data-gap-target="' + block.id + ":" + index + '"><span class="drag-grip-icon">⠿</span>' + esc(word) + "</span>";
        }).join("");
        wordBankHtml = '<div class="word-bank-box"><div class="word-bank-label"><span>Available Words</span><span style="font-size:11px; color:var(--mute);">Drag chips or click to place</span></div><div class="word-bank-chips">' + chips + '</div></div>';
      }

      let passageHtml = esc(question.text || "");
      let slotOrder = 1;
      passageHtml = passageHtml.replace(/\[(?:(\d+):)?([^\]|]+)(?:\|([^\]]+))?\]/g, (_match, p1) => {
        const explicitIndex = p1 ? parseInt(p1, 10) : null;
        const matchIdx = slotOrder - 1;
        const gap = (gaps[matchIdx] && (explicitIndex == null || gaps[matchIdx].index === explicitIndex))
          ? gaps[matchIdx]
          : (explicitIndex != null ? gaps.find(g => g.index === explicitIndex) : gaps.find(g => g.index === slotOrder)) || gaps[matchIdx];
        const sIdx = gap ? gap.index : (explicitIndex || slotOrder);
        slotOrder++;
        if (!gap) return "";
        const val = given[sIdx] || "";
        const targetVal = String(gap.target || "").trim().toLowerCase();
        const firstChar = String(gap.hint || "").trim().toLowerCase();
        const sVal = String(val).trim().toLowerCase();
        const isMatch = sVal === targetVal || (firstChar && (firstChar + sVal) === targetVal) || (Array.isArray(gap.alternatives) && gap.alternatives.some(a => String(a).trim().toLowerCase() === sVal || (firstChar && (firstChar + sVal) === String(a).trim().toLowerCase())));
        const isCorrect = marked && isMatch;
        const isWrong = marked && !isMatch;
        const slotClass = "gap-slot" + (isCorrect ? " is-correct" : (isWrong ? " is-wrong" : ""));
        const stemBadge = gap.stem ? '<span class="gap-stem-tag">' + esc(gap.stem) + "</span>" : "";
        const markHint = isCorrect ? '<span class="gap-correct-hint">✓</span>' : (isWrong ? '<span class="gap-wrong-hint">✕ (' + esc(gap.target) + ")</span>" : "");
        const timeBtn = gap.time ? '<button type="button" class="gap-hint-btn" data-gap-time="' + block.id + ":" + index + ":" + esc(gap.time) + '" title="Play timestamp">▶ ' + esc(gap.time) + "</button>" : "";

        const hLvl = Number(hintsLevel[sIdx] || 0);
        let hintBtn = "";
        let hintPopover = "";
        if (gap.hints && gap.hints.length > 0) {
          hintBtn = '<button type="button" class="gap-hint-btn" data-gap-hint="' + block.id + ":" + index + ":" + sIdx + '" title="Get hint">💡' + (hLvl > 0 ? " " + hLvl : "") + "</button>";
          if (hLvl > 0) {
            const clueText = gap.hints[Math.min(hLvl - 1, gap.hints.length - 1)];
            hintPopover = '<div class="gap-hint-popover">💡 ' + esc(clueText) + ' <span class="gap-hint-penalty">(-' + (hLvl * 25) + '%)</span></div>';
          }
        }

        let control = "";
        if (gap.hint) {
          control = '<span class="gap-first-box"><span class="gap-first-char">' + esc(gap.hint) + '</span><input type="text" class="gap-first-input" data-gap-slot="' + block.id + ":" + index + ":" + sIdx + '" value="' + esc(val) + '" placeholder="____" />' + hintPopover + "</span>";
        } else if (gap.options?.length > 0 || mode === "dropdown") {
          const opts = gap.options?.length > 0 ? gap.options : [gap.target];
          const optionsHtml = '<option value="">Select ▾</option>' + opts.map(opt => '<option value="' + esc(opt) + '"' + (String(val).toLowerCase() === opt.toLowerCase() ? " selected" : "") + ">" + esc(opt) + "</option>").join("");
          control = '<select class="gap-select" data-gap-slot="' + block.id + ":" + index + ":" + sIdx + '">' + optionsHtml + "</select>" + hintPopover;
        } else if (mode === "bank") {
          if (val) {
            control = '<span class="gap-placed-chip" draggable="true" data-gap-chip-move="' + block.id + ":" + index + ":" + sIdx + '"><span class="drag-grip-icon">⠿</span>' + esc(val) + '<span class="gap-placed-clear" data-gap-clear="' + block.id + ":" + index + ":" + sIdx + '" title="Return to bank">✕</span></span>' + hintPopover;
          } else {
            control = '<span class="gap-drop-target" data-gap-drop="' + block.id + ":" + index + ":" + sIdx + '"><span class="gap-drop-hint-text">Drop word here</span></span>' + hintPopover;
          }
        } else {
          control = '<input type="text" class="gap-input" data-gap-slot="' + block.id + ":" + index + ":" + sIdx + '" value="' + esc(val) + '" placeholder="..." />' + hintPopover;
        }
        return '<span class="' + slotClass + '"><span class="gap-num">' + sIdx + "</span>" + control + stemBadge + timeBtn + hintBtn + markHint + "</span>";
      });

      const instructions = question.prompt ? '<p class="gap-task-instructions">' + esc(question.prompt) + "</p>" : "";
      const scoreBadge = marked ? '<div class="gap-score-badge"><span>Results:</span> <span class="gap-score-val">' + esc(question.score || "") + "</span></div>" : "";

      return '<div class="gap-task-card">' +
        '<div class="gap-task-head">' +
          '<div class="gap-task-title-group">' +
            "<h3>" + esc(question.title || (question.prompt ? question.prompt : "Reading with Gaps")) + "</h3>" +
            instructions +
          "</div>" +
          '<div class="gap-mode-pill"><span>' + (mode === "bank" ? "✨ Word Bank Mode" : (mode === "dropdown" ? "▼ Dropdown Mode" : (mode === "stem" ? "🔤 Word Formation" : "✍️ Open Cloze"))) + "</span></div>" +
        "</div>" +
        mediaHtml +
        wordBankHtml +
        '<div class="gap-passage">' + passageHtml.replace(/\n/g, "<br>") + "</div>" +
        '<div class="gap-footer">' +
          scoreBadge +
          '<div class="gap-task-actions">' +
            '<button type="button" class="gap-btn gap-btn-check" data-ex-check="' + block.id + '"><span>✓</span> Check Answers</button>' +
            '<button type="button" class="gap-btn gap-btn-reset" data-gap-reset="' + block.id + '"><span>⟲</span> Reset</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    }
    function lmQuestions(block) {
      return (block.items || []).map((question, index) => {
        const isGaps = block.type === "exercise" && question.kind === "text_gaps";
        const write = block.type === "exercise" && question.kind === "write";
        const kind = block.type === "exercise" ? '<label>Answer type<select data-item-field="kind" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="choice"' + (!write && !isGaps ? " selected" : "") + '>Choices</option><option value="write"' + (write ? " selected" : "") + '>Type the answer</option><option value="text_gaps"' + (isGaps ? " selected" : "") + ">Text with gaps</option></select></label>" : "";
        let body = "";
        if (isGaps) {
          const mode = question.mode || "open";
          const parsed = parseGapsFromText(question.text || "");
          const tableRows = parsed.map(g => "<tr><td><b>(" + g.index + ")</b></td><td><span class=\"code-tag\">" + esc(g.target) + "</span>" + (g.hint ? " <small>(1st: " + esc(g.hint) + ")</small>" : "") + "</td><td>" + (g.stem ? "Stem: <span class=\"code-tag\">" + esc(g.stem) + "</span>" : (g.options?.length ? "Options: <span class=\"code-tag\">" + esc(g.options.join(", ")) + "</span>" : (g.hints?.length ? "Hints: " + esc(g.hints.join(" | ")) : "<span style=\"color:var(--mute); font-size:12.5px;\">Standard gap</span>"))) + "</td></tr>").join("");
          const previewTable = parsed.length ? '<div class="parsed-gaps-box"><div class="parsed-gaps-head"><span class="parsed-title">Parsed Gaps (' + parsed.length + ' detected)</span><span class="parsed-badge">✓ Syntax Valid</span></div><table class="gaps-table"><thead><tr><th>Slot</th><th>Target Answer</th><th>Rule / Options / Cue</th></tr></thead><tbody>' + tableRows + "</tbody></table></div>" : "";
          body = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
              '<span class="parsed-title" style="font-size:12px;">Cloze Configuration</span>' +
              '<button type="button" class="ai-action-btn-secondary" data-open-gaps-ai="' + block.id + ":" + index + '" style="font-size:12px; padding:4px 12px; display:inline-flex; align-items:center; gap:5px;">✨ Open AI Generator</button>' +
            '</div>' +
            '<label>Interaction mode<select data-item-field="mode" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="open"' + (mode === "open" ? " selected" : "") + '>Open Cloze (Free Typing)</option><option value="bank"' + (mode === "bank" ? " selected" : "") + '>Word Bank (Automatic Pool)</option><option value="dropdown"' + (mode === "dropdown" ? " selected" : "") + '>Inline Dropdown per Gap</option><option value="stem"' + (mode === "stem" ? " selected" : "") + '>Word Formation (Stem cues)</option></select></label>' +
            (mode === "bank" ? '<label>Distractor words (space separated)<input type="text" data-item-field="distractors" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.distractors || "") + '" placeholder="e.g. extra1 extra2" /></label>' : "") +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;"><label>Audio URL (optional)<input type="text" data-item-field="audioUrl" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.audioUrl || "") + '" placeholder="https://...mp3" /></label><label>Image URL (optional)<input type="text" data-item-field="imageUrl" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.imageUrl || "") + '" placeholder="https://...jpg" /></label></div>' +
            '<label class="lm-span">Passage text with [1:answer], [1:answer|stem:WORD], [1:answer|hint:first], or [1:answer|hint1:...|hint2:...]<textarea data-item-field="text" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" style="min-height:120px; font-family:monospace;">' + esc(question.text || "") + "</textarea></label>" + previewTable;
        } else if (write) {
          body = '<label class="lm-span">Correct answer<input type="text" data-item-field="write" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.write || "") + '" /></label>';
        } else {
          body = lmChoiceEditor(block, index);
        }
        return '<div class="lm-card-row"><div class="lm-card-fields">' + lmItemField(block, "items", index, "prompt", isGaps ? "Title / Instructions" : "Question", true) + kind + body + "</div>" + lmItemTools(block.id, "items", index) + "</div>";
      }).join("");
    }
    function lmOpenGapsAiModal(blockId, itemIdx) {
      const old = document.getElementById("aiGapsModal");
      if (old) old.remove();

      const block = lmBlock(blockId);
      const question = block && block.items && block.items[itemIdx];
      if (!question) return;

      const modal = document.createElement("div");
      modal.id = "aiGapsModal";
      modal.className = "ai-modal-backdrop";

      const samples = {
        open: "Mount Everest is the highest mountain in the world. It [1:rises|hint:r] to an elevation of 8,848 meters above sea level. Many climbers attempt to [2:reach|hint:r] its summit every year, but extreme weather [3:conditions] make it very dangerous. Survival requires strict [4:discipline] and adequate oxygen supplies.",
        bank: "Renewable energy plays an essential role in [1:reducing] carbon emissions. Wind and solar power are now much more [2:affordable] than fossil fuels. Many nations have committed to [3:transitioning] their grids to clean sources, creating new [4:sustainable] jobs worldwide.",
        stem: "The rapid [1:development|stem:DEVELOP] of renewable energy has transformed the market. Engineers have made significant [2:improvements|stem:IMPROVE] in battery technology. This shift has created an [3:attractive|stem:ATTRACT] environment for new investments.",
        prepositions: "He is interested [1:in] modern architecture. She succeeded [2:in] passing the exam, and they apologized [3:for] arriving late. We must prepare [4:for] the upcoming challenge.",
        phrasal: "The team had to [1:call off] the match due to rain. Don't [2:give up] on your dreams, and remember to [3:turn down] the volume.",
        audio: "Listen to the lecture carefully. The speaker mentions that the company was founded in [1:1998|time:00:15]. Their first major breakthrough occurred when they [2:patented|time:00:42] the new engine."
      };

      let curMode = question.mode || "open";
      let sampleText = samples[curMode] || samples.open;

      modal.innerHTML = '<div class="ai-modal-card">' +
        '<div class="ai-modal-head">' +
          '<h3 class="ai-modal-title"><span>✨ AI Cloze Generator</span><span class="ai-modal-badge">Smart Assist</span></h3>' +
          '<button type="button" class="ai-modal-close" data-ai-close title="Close">✕</button>' +
        '</div>' +
        '<div class="ai-form-grid">' +
          '<div class="ai-form-field">' +
            '<label class="ai-form-label">Topic / Context</label>' +
            '<input type="text" class="ai-form-input" id="aiGapsTopic" value="Renewable Energy & Climate" placeholder="e.g. Science, Travel, Business" />' +
          '</div>' +
          '<div class="ai-form-field">' +
            '<label class="ai-form-label">CEFR Target Level</label>' +
            '<select class="ai-form-select" id="aiGapsCefr">' +
              '<option value="A2">A2 - Elementary</option>' +
              '<option value="B1">B1 - Intermediate</option>' +
              '<option value="B2" selected>B2 - Upper-Intermediate</option>' +
              '<option value="C1">C1 - Advanced</option>' +
            '</select>' +
          '</div>' +
          '<div class="ai-form-field">' +
            '<label class="ai-form-label">Exercise Variant</label>' +
            '<select class="ai-form-select" id="aiGapsVariant">' +
              '<option value="open"' + (curMode === "open" ? " selected" : "") + '>Open Cloze (First letter / context cues)</option>' +
              '<option value="bank"' + (curMode === "bank" ? " selected" : "") + '>Word Bank (With/without distractors)</option>' +
              '<option value="stem"' + (curMode === "stem" ? " selected" : "") + '>Word Formation (Stem cues [1:word|stem:STEM])</option>' +
              '<option value="prepositions">Grammar: Dependent Prepositions</option>' +
              '<option value="phrasal">Vocabulary: Phrasal Verbs</option>' +
              '<option value="audio">Listening: Audio Cloze with Timecodes</option>' +
            '</select>' +
          '</div>' +
          '<div class="ai-form-field">' +
            '<label class="ai-form-label">Gaps Quantity</label>' +
            '<select class="ai-form-select" id="aiGapsCount">' +
              '<option value="3">3 Gaps (Micro drill)</option>' +
              '<option value="4" selected>4 Gaps (Standard)</option>' +
              '<option value="6">6 Gaps (Exam format)</option>' +
              '<option value="8">8 Gaps (Long passage)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ai-form-field" style="margin-top:6px;">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
            '<label class="ai-form-label" style="margin:0;">Generated Passage Preview</label>' +
            '<span style="font-size:11px; color:var(--mute);">Ready for insert</span>' +
          '</div>' +
          '<div class="ai-preview-box" id="aiGapsPreview">' + esc(sampleText) + '</div>' +
        '</div>' +
        '<div class="ai-modal-actions">' +
          '<button type="button" class="ai-action-btn-secondary" id="aiGapsRegen">⟲ Regenerate Sample</button>' +
          '<div style="display:flex; gap:10px;">' +
            '<button type="button" class="ai-action-btn-secondary" data-ai-close>Cancel</button>' +
            '<button type="button" class="ai-action-btn-primary" id="aiGapsInsert">Insert into Lesson</button>' +
          '</div>' +
        '</div>' +
      '</div>';

      document.body.appendChild(modal);

      const variantSelect = modal.querySelector("#aiGapsVariant");
      const previewBox = modal.querySelector("#aiGapsPreview");
      const updatePreview = () => {
        const v = variantSelect.value;
        const txt = samples[v] || samples.open;
        previewBox.textContent = txt;
      };
      variantSelect.addEventListener("change", updatePreview);

      modal.querySelector("#aiGapsRegen").addEventListener("click", updatePreview);

      modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.closest("[data-ai-close]")) {
          modal.remove();
        }
      });

      modal.querySelector("#aiGapsInsert").addEventListener("click", () => {
        const chosenText = previewBox.textContent.trim();
        const v = variantSelect.value;
        question.text = chosenText;
        if (v === "bank") {
          question.mode = "bank";
          question.distractors = "reliable traditional";
        } else if (v === "stem") {
          question.mode = "stem";
        } else if (v === "audio") {
          question.audioUrl = "https://example.com/audio/listening-sample.mp3";
        }
        modal.remove();
        lmRenderEditor();
        lmRenderPreview();
        lmSchedule();
      });
    }
    function lmBody(block) {
      if (block.type === "interactive") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || '') + '"></label><label>Link or embed code<textarea data-interactive-source="' + block.id + '" maxlength="8000">' + esc(block.url || '') + '</textarea></label><p data-interactive-status role="status"></p><div data-interactive-preview>' + lmInteractiveFrame(block) + '</div>';
      if (block.type === "heading") {
        return '<label>Heading<input type="text" data-field="text" data-block="' + block.id + '" value="' + esc(block.text || "") + '" /></label><label>Level<select data-field="level" data-block="' + block.id + '"><option value="h2"' + (block.level !== "h3" ? " selected" : "") + '>H2</option><option value="h3"' + (block.level === "h3" ? " selected" : "") + ">H3</option></select></label>";
      }
      if (block.type === "text") {
        return lmTextTools(block) + '<div class="lm-rich" contenteditable="true" data-rich="' + block.id + '"' + lmTextStyle(block) + ">" + lmClean(block.html) + "</div>";
      }
      if (block.type === "pdf") return lmFileTitle(block) + lmFileBox(block, "application/pdf,.pdf", "Drop PDF here", "");
      if (block.type === "image") return lmFileBox(block, "image/*", "Drop image here", "image") + '<label>Caption<input type="text" data-field="caption" data-block="' + block.id + '" value="' + esc(block.caption || "") + '" /></label>';
      if (block.type === "audio") return lmFileTitle(block) + lmFileBox(block, "audio/*", "Drop audio here", "audio");
      if (block.type === "file") return lmFileTitle(block) + lmFileBox(block, "*/*", "Drop a file here", "");
      if (block.type === "link") {
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Description<input type="text" data-field="description" data-block="' + block.id + '" value="' + esc(block.description || "") + '" /></label><label>URL<input type="text" data-field="url" data-block="' + block.id + '" value="' + esc(block.url || "") + '" placeholder="https://" /></label>';
      }
      if (block.type === "video") {
        const link = block.source !== "file";
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Source<select data-field="source" data-block="' + block.id + '"><option value="link"' + (link ? " selected" : "") + '>Link</option><option value="file"' + (link ? "" : " selected") + ">File</option></select></label>" + (link ? '<label>URL<input type="text" data-field="url" data-block="' + block.id + '" value="' + esc(block.url || "") + '" placeholder="https://www.youtube.com/watch?v=..." /></label>' : lmFileBox(block, "video/*", "Drop video here", "video"));
      }
      if (block.type === "note") {
        return '<label>Kind<select data-field="tone" data-block="' + block.id + '"><option value="note"' + (block.tone === "tip" ? "" : " selected") + '>Note</option><option value="tip"' + (block.tone === "tip" ? " selected" : "") + ">Tip</option></select></label><label>Text<textarea data-field=\"text\" data-block=\"" + block.id + '">' + esc(block.text || "") + "</textarea></label>";
      }
      if (block.type === "divider") return '<label>Label<input type="text" data-field="label" data-block="' + block.id + '" value="' + esc(block.label || "") + '" placeholder="Optional" /></label><div class="lm-divider">' + esc(block.label || "") + "</div>";
      if (block.type === "reading") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Text<textarea data-field="text" data-block="' + block.id + '">' + esc(block.text || "") + "</textarea></label><p class=\"lm-note\">In Preview, click a word to highlight it.</p>";
      if (block.type === "pronunciation") return '<label>Word<input type="text" data-field="word" data-block="' + block.id + '" value="' + esc(block.word || "") + '" /></label><label>Transcription<input type="text" data-field="ipa" data-block="' + block.id + '" value="' + esc(block.ipa || "") + '" /></label>' + lmFileBox(block, "audio/*", "Drop pronunciation audio", "audio");
      if (block.type === "task") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Instructions<textarea data-field="text" data-block="' + block.id + '">' + esc(block.text || "") + "</textarea></label>";
      if (block.type === "table") {
        const cols = block.columns || [];
        const head = "<tr>" + cols.map((col, c) => '<th><input type="text" data-col="' + block.id + ":" + c + '" value="' + esc(col) + '" /></th>').join("") + "<th></th></tr>";
        const rows = (block.rows || []).map((row, r) => "<tr>" + cols.map((col, c) => '<td><input type="text" data-cell="' + block.id + ":" + r + ":" + c + '" value="' + esc(row[c] || "") + '" /></td>').join("") + '<td><button class="lm-icon danger" type="button" data-row-del="' + block.id + ":" + r + '" aria-label="Delete">×</button></td></tr>').join("");
        return '<table class="lm-grid"><thead>' + head + "</thead><tbody>" + rows + '</tbody></table><button class="lm-add-card" type="button" data-col-add="' + block.id + '">+ Column</button><button class="lm-add-card" type="button" data-col-del="' + block.id + '">− Column</button><button class="lm-add-card" type="button" data-row-add="' + block.id + '">+ Row</button>';
      }
      if (block.type === "vocab") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list">' + lmItemRows(block, "items", [["word", "Word"], ["translation", "Translation"], ["ipa", "Transcription", true], ["example", "Example", true]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':vocab">+ Add word</button>';
      if (block.type === "dialogue") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list lm-lines">' + lmItemRows(block, "lines", [["speaker", "Speaker"], ["text", "Line"]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':dialogue">+ Add line</button>';
      if (block.type === "phrase") return '<div class="lm-card-list">' + lmItemRows(block, "items", [["phrase", "Phrase"], ["meaning", "Meaning"], ["example", "Example", true]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':phrase">+ Add phrase</button>';
      if (block.type === "wordcard") return '<div class="words">' + lmWordCardHtml(block) + "</div>";
      if (block.type === "rule") {
        const topicBtn = (block.grammarRule || block.topic) ? ('<div style="margin-bottom:12px;">' + lmRuleCardHtml(block, false) + '</div>') : '';
        const exText = Array.isArray(block.examples) ? block.examples.map(e => Array.isArray(e) ? (e[0] + (e[1] ? ' — ' + e[1] : '')) : String(e)).join('\n') : (block.examples || '');
        return topicBtn +
          '<label>Rule title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || block.name || '') + '" placeholder="Rule title (English)" /></label>' +
          '<label>English explanation<textarea data-field="explanation" data-block="' + block.id + '" placeholder="English explanation / definition">' + esc(block.explanation || '') + '</textarea></label>' +
          '<label>Structure / Pattern (EN)<input type="text" data-field="pattern" data-block="' + block.id + '" value="' + esc(block.pattern || '') + '" placeholder="Grammar pattern" /></label>' +
          '<label>Examples (English — Russian)<textarea data-field="examples" data-block="' + block.id + '" placeholder="Example sentence — Русский перевод">' + esc(exText) + '</textarea></label>';
      }
      if (block.type === "exercise") {
        return '<div class="lm-card-list">' + lmQuestions(block) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':exercise">+ Add question</button>';
      }
      if (block.type === "quiz") {
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || lmQuizType(block)) + '" /></label>' + lmQuizItems(block);
      }
      const rows = (block.items || []).map((card, index) => '<div class="lm-card-row"><div class="lm-card-fields"><label>Front<input type="text" data-card-field="front" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.front || "") + '" /></label><label>Back<input type="text" data-card-field="back" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.back || "") + '" /></label><label>Example<input type="text" data-card-field="example" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.example || "") + '" /></label></div><div class="lm-card-actions"><button class="lm-icon" type="button" data-card-up="' + block.id + ":" + index + '" aria-label="Move up">↑</button><button class="lm-icon" type="button" data-card-down="' + block.id + ":" + index + '" aria-label="Move down">↓</button><button class="lm-icon danger" type="button" data-card-del="' + block.id + ":" + index + '" aria-label="Delete">×</button></div></div>').join("");
      return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list">' + rows + '</div><button class="lm-add-card" type="button" data-card-add="' + block.id + '">+ Add card</button>';
    }
    function lmEditorLesson() {
      const root = document.getElementById("material");
      const id = root && domEntityId(root.dataset.lmBound);
      if (!id) return lmState;
      if (lmState && lmState.id === id) return lmState;
      if (root.dataset.lmKind === "exam") return null;
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (found) return found;
      return null;
    }
    function lmBindEditor() {
      const root = document.getElementById("material");
      if (root && lmState && lmState.id) {
        root.dataset.lmBound = lmState.id;
        root.dataset.lmKind = lmState.examOwned ? "exam" : "lesson";
      }
      paintPagePath("material");
    }
    function lmRenderEditor() {
      const box = document.getElementById("lmBlocks");
      if (!box || !lmState) return;
      lmBindEditor();
      document.getElementById("lmTitle").value = lmState.title || "";
      document.getElementById("lmDescription").value = lmState.description || "";
      if(!lmState.descriptionFormatting)lmState.descriptionFormatting=lmState.blocks?.find(block=>block.documentFormatting)?.documentFormatting?.description;
      if(lmState.descriptionFormatting&&lmState.blocks[0]){lmState.blocks[0].documentFormatting||={};lmState.blocks[0].documentFormatting.description=lmState.descriptionFormatting;}
      const descriptionField=document.getElementById('lmDescription');
      window.TextColors?.mount(descriptionField,{format:lmState.descriptionFormatting,onChange:format=>{lmState.descriptionFormatting=format;if(lmState.blocks[0]){lmState.blocks[0].documentFormatting||={};lmState.blocks[0].documentFormatting.description=format;}lmSchedule();}});
      window.TextColors?.sync(descriptionField,lmState.descriptionFormatting);
      document.getElementById("lmDate").value = lmState.date || "";
      document.getElementById("lmClass").value = lmState.className || "";
      document.getElementById("lmUnit").value = lmState.unit || "";
      document.getElementById("lmLesson").value = lmState.lesson || "";
      const status = document.getElementById("lmStatus");
      if (status) {
        status.textContent = lmState.published ? "Published" : "Draft";
        status.classList.toggle("is-live", !!lmState.published);
      }
      if(lmTab()==='speech'){
        if(!box.querySelector('#lmSpeechPanel'))box.innerHTML='<div id="lmSpeechPanel" role="tabpanel" aria-label="Speech"></div>';
        lmPaintChrome();lmPaintTabTools();window.LearningWorkbench?.mountLessonSpeech();return;
      }
      function lmInsertZoneHtml(blockId, pos) {
        return '<div class="lm-insert-zone"><div class="lm-insert-line"><button class="lm-insert-btn" type="button" data-lm-insert-' + pos + '="' + blockId + '" aria-label="Insert here">+ Insert here</button></div></div>';
      }
      const labels = { heading: "Heading", text: "Text", pdf: "PDF", link: "Link", cards: "Cards", image: "Image", audio: "Audio", video: "Video", vocab: "Vocabulary", exercise: "Exercise", quiz: "Quiz", note: "Note", dialogue: "Dialogue", reading: "Reading", pronunciation: "Pronunciation", table: "Table", task: "Task", file: "File", divider: "Divider", phrase: "Phrase", wordcard: "Word", rule: "Rule" };
      const blocks = lmBlocksFor();
      let currentTabTaskCounter = 0;
      const tabTaskNumbers = new Map();
      for (const b of blocks) {
        if (["quiz", "exercise", "task"].includes(b.type)) {
          currentTabTaskCounter += 1;
          tabTaskNumbers.set(b.id, currentTabTaskCounter);
        }
      }
      function renderSingleBlock(block, index, total, isVerifiedSection) {
        const isFirst = index === 0;
        const isLast = index === total - 1;
        const isNew = block.id === lmLastAddedBlockId;
        const taskNum = tabTaskNumbers.get(block.id);
        const taskPrefix = taskNum ? "Task " + taskNum + " · " : "";
        const baseTypeLabel = block.type === "interactive" ? "Interactive" : block.type === "quiz" ? ("Quiz · " + lmQuizType(block)) : (labels[block.type] || "Block");
        const label = taskPrefix + baseTypeLabel;
        const grading = ["quiz", "exercise", "task"].includes(block.type);
        const assessed = grading && !lmState.examOwned ? '<label><input type="checkbox" data-field="assessed" data-block="' + block.id + '"' + (block.assessed ? ' checked' : '') + '> Assessed task</label>' : '';
        const verified = '<label class="lm-teacher-verify-label" style="font-size:12px; font-weight:700; color:#047857; display:inline-flex; align-items:center; gap:6px; cursor:pointer; margin-left:12px;"><input type="checkbox" data-block-teacher-verified="' + block.id + '"' + (block.teacherVerified ? ' checked' : '') + '> Verified by Teacher</label>';
        const derived=lmState.examOwned&&examScoringChildren(lmState.blocks,block).length>0;
        const maximum = grading ? '<label class="lm-max-score">Maximum points<input type="text" inputmode="decimal" data-field="maxPoints" data-block="' + block.id + '"'+(derived?' readonly':'')+' value="' + esc(String(derived?examScoringMax(lmState.blocks,block):block.maxPoints??(block.scoringVersion===2?'':assessmentUnitMax(block)))) + '"></label>' : '';
        const isShut = isVerifiedSection ? !block.unfolded : Boolean(block.collapsed);
        const head = lmHead(block,label,isFirst,isLast,isVerifiedSection).replace('<div class="lm-head-actions">','<div class="lm-head-actions">' + maximum);
        const source=block.pdfImport ? '<p class="hint">PDF pages: '+esc((block.pdfImport.pages||[]).join(', ')||'overview')+(block.pdfImport.generated?' · Generated practice':'')+'</p>' : '';
        const teacherNotes=block.pdfTeacherNotes ? '<label>Teacher notes / sample answer<textarea data-field="pdfTeacherNotes" data-block="'+block.id+'">'+esc(block.pdfTeacherNotes)+'</textarea></label>' : '';
        const beforeZone = lmInsertZoneHtml(block.id, "before");
        if (block.type === "divider") {
          const rawLabel = block.label || '✨ Supplementary Material';
          const cleanLabel = rawLabel.replace(/\s*·\s*Дополнительные материалы/g, '');
          return beforeZone + '<div class="lm-supplementary-divider"><div class="lm-supplementary-divider-line"></div><div class="lm-supplementary-divider-badge">' + esc(cleanLabel) + '</div><div class="lm-supplementary-divider-line"></div></div>' + (isLast ? lmInsertZoneHtml(block.id, "after") : "");
        }
        const isSupplementary = Boolean(block.supplementary);
        const blockHtml = '<article class="lm-block' + (isShut ? " is-shut" : "") + (isNew ? " is-newly-added" : "") + (isSupplementary ? " is-supplementary" : "") + '" data-block-id="' + block.id + '">' + head + '<div class="lm-body">' + source + '<div style="display:flex; align-items:center; flex-wrap:wrap; margin-bottom:8px;">' + assessed + verified + '</div>' + assessmentGroupEditor(block) + lmBody(block) + teacherNotes + (grading ? '<label>Grading criteria<textarea data-field="criteria" data-block="' + block.id + '" placeholder="Content | 3&#10;Grammar | 2">' + esc(block.criteria || '') + '</textarea></label>' : '') + "</div></article>";
        const afterZone = isLast ? lmInsertZoneHtml(block.id, "after") : "";
        return beforeZone + blockHtml + afterZone;
      }
      let mainHtml = "";
      if (blocks.length === 0) {
        mainHtml = lmTab() === "rules" ? '<p class="hint">Nothing on this page yet. Click a grammar topic above to add it.</p>' : '<p class="hint">Nothing on this page yet.</p>';
      } else {
        const unverified = blocks.filter(b => !b.teacherVerified);
        const verified = blocks.filter(b => !!b.teacherVerified);
        const unverifiedHtml = unverified.map((b, i) => renderSingleBlock(b, i, unverified.length, false)).join("");
        let verifiedAccordionHtml = "";
        if (verified.length > 0) {
          const isOpen = Boolean(lmState.verifiedAccordionOpen);
          const vCount = verified.length;
          const countText = vCount + (vCount === 1 ? " item" : " items");
          let tabVerifiedTitle = "Verified materials & quizzes";
          if (lmTab() === "phrases") {
            tabVerifiedTitle = "Verified phrases";
          } else if (lmTab() === "words") {
            tabVerifiedTitle = "Verified words";
          } else if (lmTab() === "rules") {
            tabVerifiedTitle = "Verified rules";
          }
          const vItemsHtml = verified.map((b, i) => renderSingleBlock(b, i, verified.length, true)).join("");
          verifiedAccordionHtml = '<details class="lm-verified-accordion"' + (isOpen ? ' open' : '') + '>' +
            '<summary class="lm-verified-summary">' +
              '<div class="lm-verified-title-group">' +
                '<span class="lm-verified-icon">✓</span>' +
                '<span class="lm-verified-title-text">' + esc(tabVerifiedTitle) + '</span>' +
                '<span class="lm-verified-count-pill">' + countText + '</span>' +
              '</div>' +
              '<div class="lm-verified-expand-hint">' +
                '<span class="lm-verified-expand-text">' + (isOpen ? 'Click to collapse ' : 'Click to expand ') + countText + '</span>' +
                '<span class="arrow-indicator">▸</span>' +
              '</div>' +
            '</summary>' +
            '<div class="lm-verified-content">' + vItemsHtml + '</div>' +
          '</details>';
        }
        mainHtml = unverifiedHtml + verifiedAccordionHtml;
      }
      box.innerHTML = mainHtml;
      box.querySelectorAll('textarea[data-field],input[type=text][data-field],textarea[data-item-field],input[type=text][data-item-field],input[type=text][data-card-field]').forEach(field=>{
        const name=field.dataset.field||field.dataset.itemField||field.dataset.cardField;if(['criteria','url','remoteUrl','ipa','maxPoints','memorySize','answer','write'].includes(name))return;
        const part=lmBlock(field.dataset.block);if(!part)return;const key=[name,field.dataset.item??field.dataset.card??''].join(':');
        window.TextColors?.mount(field,{format:part.textFormatting?.[key],onChange:format=>{part.textFormatting||={};part.textFormatting[key]=format;lmSchedule();}});
      });
      dressWords(box);
      lmPaintChrome();
      lmPaintTabTools();
      lmSyncGenerateControls();
      lmSyncTeacherVerifySummary();
    }
    function lmPreviewFile(block, label, action, attr) {
      const external = lmExternalFile(block);
      if (external) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><div style="margin-top:8px"><a class="lm-btn lm-btn-primary" href="' + esc(external) + '" target="_blank" rel="noopener noreferrer">' + esc(action) + '</a></div></div>';
      if (block.hasFile === false && !lmSrc(block)) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><p class="hint">No file attached.</p></div>';
      return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + "</b><span>" + esc([block.name && block.title ? block.name : "", block.size || ""].filter(Boolean).join(" · ")) + '</span><div style="margin-top:8px"><button class="lm-btn lm-btn-primary" type="button" ' + attr + '="' + block.id + '">' + action + "</button></div></div>";
    }
    function lmPreviewChoices(block, index, question) {
      const isLocked = Boolean(block.submitted || block.checked || question.submitted);
      return '<div class="lm-opts">' + (question.options || []).map((opt, oi) => {
        const isPicked = Number(question.picked) === oi;
        return '<label class="lm-opt' + (isPicked ? " is-selected" : "") + (isLocked ? " is-locked" : "") + '"><input type="radio" name="pv-' + block.id + "-" + index + '" data-pick="' + block.id + ":" + index + ":" + oi + '"' + (isPicked ? " checked" : "") + (isLocked ? " disabled" : "") + " /> <span>" + esc(opt || "Option") + "</span></label>";
      }).join("") + '</div>';
    }
    function lmPreviewBlock(block) {
      if (block.type === "interactive") return lmInteractiveFrame(block);
      if (block.type === "heading") {
        const tag = block.level === "h3" ? "h3" : "h2";
        return "<" + tag + ">" + esc(block.text || "") + "</" + tag + ">";
      }
      if (block.type === "text") return '<div class="lm-copy"' + lmTextStyle(block) + ">" + lmClean(block.html) + "</div>";
      if (block.type === "link") {
        const media = lmUrlKind(block.url);
        if (media.kind === "video-embed") return lmVideoFrame(media.src, block.title);
        if (media.kind === "video-file") return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame-video"><video controls src="' + esc(media.src) + '"></video></div>';
        if (media.kind === "audio-file") return '<div class="lm-read-pdf"><b>' + esc(block.title || "Audio") + '</b><audio class="lm-player" controls src="' + esc(media.src) + '"></audio></div>';
        if (media.kind === "page") {
          const card = lmLinkCard(block, media.href);
          return block.title ? card.replace('data-link-preview=', 'data-keep-title="1" data-link-preview=') : card;
        }
        return '<a class="lm-read-link" href="#"><b>' + esc(block.title || "Link") + "</b><span>" + esc(block.description || block.url || "") + "</span></a>";
      }
      if (block.type === "pdf") return lmPreviewFile(block, "PDF", "Open PDF", "data-pdf-open");
      if (block.type === "image") {
        const src = lmSrc(block);
        const pic = src ? '<img class="lm-shot" alt="' + esc(block.caption || "") + '" src="' + esc(src) + '" />' : '<div class="lm-shot lm-shot-empty">' + esc(block.name || "Image") + "</div>";
        return '<figure class="lm-figure">' + pic + (block.caption ? "<figcaption>" + esc(block.caption) + "</figcaption>" : "") + "</figure>";
      }
      if (block.type === "audio" || block.type === "pronunciation") {
        const src = lmSrc(block);
        const player = src ? '<audio class="lm-player" controls src="' + esc(src) + '"></audio>' : "<span>" + esc(block.sample ? "Sample clip. Drop a real audio file to play it." : "No audio yet") + "</span>";
        if (block.type === "pronunciation") return '<div class="lm-pron"><b>' + esc(block.word || "Word") + "</b><small>" + esc(block.ipa || "") + "</small>" + player + "</div>";
        return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || "Audio") + "</b>" + player + "</div>";
      }
      if (block.type === "video") {
        if (block.source === "file" && lmSrc(block)) return '<div class="lm-frame-video"><video controls src="' + esc(lmSrc(block)) + '"></video></div>';
        const media = lmUrlKind(block.url);
        if (media.kind === "video-embed") return lmVideoFrame(media.src, block.title);
        if (media.kind === "video-file") return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame-video"><video controls src="' + esc(media.src) + '"></video></div>';
        if (media.kind === "audio-file") return '<div class="lm-read-pdf"><b>' + esc(block.title || "Audio") + '</b><audio class="lm-player" controls src="' + esc(media.src) + '"></audio></div>';
        if (media.kind === "page") return lmLinkCard(block, media.href);
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame lm-shot-empty">' + esc(block.name || "YouTube link or video file") + "</div>";
      }
      if (block.type === "file") return lmPreviewFile(block, "File", "Open file", "data-file-open");
      if (block.type === "note") return '<aside class="lm-callout' + (block.tone === "tip" ? " is-tip" : "") + '"><b>' + (block.tone === "tip" ? "Tip" : "Note") + "</b>" + esc(block.text || "") + "</aside>";
      if (block.type === "divider") {
        const rawLabel = block.label || "✨ Supplementary Material";
        const cleanLabel = rawLabel.replace(/\s*·\s*Дополнительные материалы/g, '');
        return '<div class="lm-supplementary-divider"><div class="lm-supplementary-divider-line"></div><div class="lm-supplementary-divider-badge">' + esc(cleanLabel) + '</div><div class="lm-supplementary-divider-line"></div></div>';
      }
      if (block.type === "reading") {
        let n = 0;
        const marks = new Set(block.marks || []);
        const words = esc(block.text || "").replace(/\S+/g, (word) => {
          const on = marks.has(n) ? " is-on" : "";
          const button = '<button type="button" class="lm-word' + on + '" data-read="' + block.id + ":" + n + '">' + word + "</button>";
          n += 1;
          return button;
        });
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-copy lm-reading">' + words + "</div>";
      }
      if (block.type === "task") {
        const isHwOrCw = (block.tab === 'homework') || (block.tab === 'classwork') || (block.stage === 'homework') || (block.stage === 'classwork');
        const isLocked = Boolean(block.submitted || block.checked || block.teacherVerified);
        const max = Number(block.weight) || Number(block.maxPoints) || 5;
        const currentGrade = block.grade != null ? Number(block.grade) : '';
        const headHtml = '<div class="lm-answer-head">' +
          '<label class="lm-answer-label">Your answer</label>' +
          '<div class="voice-tools-row">' +
            (!isLocked ? '<button type="button" class="voice-mic-btn" data-voice-dictate="' + block.id + '">🎙 Dictate Answer</button>' : '') +
          '</div>' +
        '</div>';

        let voicePanel = '';
        if (block.isRecordingVoice) {
          const dur = block.recordingDuration || 14;
          voicePanel = '<div class="voice-recording-panel">' +
            '<div class="voice-panel-head">' +
              '<div class="voice-indicator-live"><span class="voice-pulse-dot"></span><span>Recording live speech... 0:' + (dur < 10 ? '0' : '') + dur + '</span></div>' +
              '<div class="voice-soundwave">' +
                '<div class="soundwave-bar" style="height:6px;"></div>' +
                '<div class="soundwave-bar" style="height:14px;"></div>' +
                '<div class="soundwave-bar" style="height:18px;"></div>' +
                '<div class="soundwave-bar" style="height:10px;"></div>' +
                '<div class="soundwave-bar" style="height:16px;"></div>' +
                '<div class="soundwave-bar" style="height:8px;"></div>' +
              '</div>' +
              '<div class="voice-actions">' +
                '<button type="button" class="lm-btn lm-btn-primary" data-voice-stop="' + block.id + '" style="padding:5px 12px; font-size:12px;">⏹ Stop & Transcribe</button>' +
                '<button type="button" class="lm-btn" data-voice-cancel="' + block.id + '" style="border:1px solid var(--line); padding:5px 10px; font-size:12px;">✕ Cancel</button>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:12px; color:var(--mute);">Speak clearly into your microphone. Words are transcribed in real time directly into the textarea.</div>' +
          '</div>';
        }

        let metricsHtml = '';
        if (block.speechMetrics) {
          metricsHtml = '<div style="margin-top:10px;"><div class="voice-metrics-badge">✓ Speech Metrics: ' + block.speechMetrics.wpm + ' WPM (Optimal pace) · Pronunciation Fluency: ' + (block.speechMetrics.fluency || 92) + '%</div></div>';
        }

        const textarea = '<textarea data-response="' + block.id + '"' + (isLocked ? ' disabled readonly' : '') + '>' + esc(block.response || "") + '</textarea>';
        const actions = isHwOrCw ? ('<div class="lm-task-actions">' +
          (!isLocked ? '<button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="' + block.id + '">🔒 Submit Answer</button>' : '<span class="lm-locked-badge">✓ Submitted & Locked</span>') +
          '<button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="' + block.id + '">📩 Send to Teacher for Review</button>' +
        '</div>') : '';

        let inlineReviewHtml = '';
        if (Array.isArray(block.inlineCorrections) && block.inlineCorrections.length > 0) {
          const activeCount = block.inlineCorrections.filter(c => !c.accepted).length;
          const countBadge = activeCount > 0 ? (activeCount + ' Corrections Found') : 'All corrections applied ✓';
          let canvasText = esc(block.response || '');
          if (!block.showOriginalView) {
            block.inlineCorrections.forEach(cor => {
              if (cor.accepted) return;
              const popover = '<div class="inline-popover" style="display:' + (cor.isOpen ? 'flex' : 'none') + ';">' +
                '<div class="inline-popover-tag" style="color:' + (cor.category === 'grammar' ? '#b45309' : '#4f46e5') + ';">' + esc(cor.category === 'grammar' ? 'Grammar Correction' : 'Vocabulary Enhancement') + '</div>' +
                '<div class="inline-popover-change"><span class="inline-popover-orig">' + esc(cor.original) + '</span><span>➔</span><span class="inline-popover-repl">' + esc(cor.replacement) + '</span></div>' +
                '<div class="inline-popover-note">' + esc(cor.note || '') + '</div>' +
                '<button type="button" class="lm-btn lm-btn-primary" data-accept-correction="' + block.id + ':' + cor.id + '" style="margin-top:4px; padding:4px 10px; font-size:11.5px;">✓ Accept Correction</button>' +
              '</div>';
              const highlight = '<span class="inline-correction ' + esc(cor.category) + '" data-correction-id="' + block.id + ':' + cor.id + '">' + esc(cor.original) + popover + '</span>';
              canvasText = canvasText.replace(cor.original, highlight);
            });
          }
          inlineReviewHtml = '<div class="inline-review-card">' +
            '<div class="inline-review-head">' +
              '<div><strong style="font-size:14px; color:var(--ink);">Interactive Feedback & Corrections</strong><div style="font-size:12px; color:var(--mute);">Click underlined highlights to view teacher recommendations</div></div>' +
              '<span style="font-size:12px; font-weight:700; color:var(--acc); background:var(--acc-s); padding:4px 10px; border-radius:6px;">' + countBadge + '</span>' +
            '</div>' +
            '<div class="inline-text-canvas">' + canvasText + '</div>' +
            '<div class="inline-review-foot">' +
              '<div>' +
                '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#d97706; margin-right:5px;"></span>Grammar suggestions · ' +
                '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#6366f1; margin:0 5px 0 10px;"></span>Vocabulary enhancements' +
              '</div>' +
              '<button type="button" class="lm-btn" data-toggle-original="' + block.id + '" style="border:1px solid var(--line); font-size:12px; padding:5px 12px;">' + (block.showOriginalView ? 'Show Reviewed Text' : 'Toggle Original Text') + '</button>' +
            '</div>' +
          '</div>';
        }

        let teacherPanel = '';
        let rubricHtml = '';
        if (isHwOrCw) {
          const aiNote = block.aiFeedback ? ('<div class="lm-ai-feedback-note" style="margin-top:8px; font-size:12px; color:var(--mute); background:var(--bg); padding:6px 10px; border-radius:6px; border:1px solid var(--line);">' + esc(block.aiFeedback) + '</div>') : '';
          const teacherApproved = block.teacherVerified ? ('<span class="lm-teacher-approved-tag" style="color:#059669; font-weight:700; font-size:12px; margin-left:8px;">✓ Verified by Teacher (' + currentGrade + ' / ' + max + ' pt)</span>') : '';
          teacherPanel = '<div class="teacher-grading-panel">' +
            '<div class="grading-input-group">' +
              '<span>Teacher Evaluation:</span>' +
              '<input type="number" min="0" max="' + max + '" value="' + esc(currentGrade) + '" data-teacher-grade-input="' + block.id + '" />' +
              '<span>/ ' + max + ' pts</span>' +
              teacherApproved +
            '</div>' +
            '<div class="grading-btns">' +
              '<button type="button" class="lm-btn lm-btn-primary" data-approve-grade="' + block.id + '" style="padding:5px 12px; font-size:12px;">✓ Approve Grade</button>' +
              '<button type="button" class="lm-btn" data-ai-eval="' + block.id + '" style="padding:5px 12px; font-size:12px; border:1px solid var(--line);">🤖 Check with AI</button>' +
            '</div>' +
          '</div>' + aiNote;

          const rc = block.rubricCriteria || { grammar: 2, vocabulary: 1, task: 1 };
          const total = (Number(rc.grammar) || 0) + (Number(rc.vocabulary) || 0) + (Number(rc.task) || 0);
          const pct = Math.round((total / 5) * 100);
          const scaleBtns = (crit, curVal, maxVal) => {
            let btns = '';
            for (let v = 0; v <= maxVal; v++) {
              const active = Number(curVal) === v ? ' is-active' : '';
              const check = Number(curVal) === v ? ' ✓' : '';
              btns += '<button type="button" class="scale-btn' + active + '" data-rubric-criterion="' + crit + '" data-rubric-block="' + block.id + '" data-rubric-score="' + v + '">' + v + check + '</button>';
            }
            return btns;
          };

          rubricHtml = '<div class="rubric-panel">' +
            '<div class="rubric-head">' +
              '<div><strong style="font-size:14px; color:var(--ink);">Evaluation Rubric Breakdown</strong><div style="font-size:12px; color:var(--mute);">Score by individual competency criteria</div></div>' +
              '<button type="button" class="lm-btn" data-ai-rubric-analysis="' + block.id + '" style="border:1px solid var(--line); padding:5px 12px; font-size:12px;">🤖 AI Rubric Analysis</button>' +
            '</div>' +
            '<div class="rubric-criteria-grid">' +
              '<div class="rubric-criterion">' +
                '<div class="criterion-title"><span>Grammar Accuracy</span><span style="color:var(--mute);">max 2 pts</span></div>' +
                '<div class="criterion-scale">' + scaleBtns('grammar', rc.grammar, 2) + '</div>' +
              '</div>' +
              '<div class="rubric-criterion">' +
                '<div class="criterion-title"><span>Vocabulary Range</span><span style="color:var(--mute);">max 2 pts</span></div>' +
                '<div class="criterion-scale">' + scaleBtns('vocabulary', rc.vocabulary, 2) + '</div>' +
              '</div>' +
              '<div class="rubric-criterion">' +
                '<div class="criterion-title"><span>Task Achievement</span><span style="color:var(--mute);">max 1 pt</span></div>' +
                '<div class="criterion-scale">' + scaleBtns('task', rc.task, 1) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="rubric-foot">' +
              '<div style="font-weight:800; font-size:14px; color:var(--ink);">Calculated Total: <span style="color:var(--acc);">' + total + ' / 5 pts (' + pct + '%)</span></div>' +
              '<button type="button" class="lm-btn lm-btn-primary" data-save-rubric-grade="' + block.id + '" style="padding:6px 14px; font-size:12.5px;">✓ Save Criteria Grade</button>' +
            '</div>' +
          '</div>';
        }

        return "<h3>" + esc(block.title || "Task") + '</h3><p>' + esc(block.text || "") + '</p>' + headHtml + voicePanel + textarea + actions + metricsHtml + inlineReviewHtml + teacherPanel + rubricHtml;
      }
      if (block.type === "table") {
        const cols = block.columns || [];
        const head = "<tr>" + cols.map((col) => "<th>" + esc(col) + "</th>").join("") + "</tr>";
        const rows = (block.rows || []).map((row) => "<tr>" + cols.map((col, c) => "<td>" + esc(row[c] || "") + "</td>").join("") + "</tr>").join("");
        return "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
      }
      if (block.type === "vocab") {
        const restricted = authUser?.role === 'USER' && !viewAccount && lmState.examOwned;
        const rows = (block.items || []).map(row => '<details class="lm-study-card"><summary><b>' + esc(row.word || 'Word') + '</b></summary><div>' + (row.ipa ? '<p>' + esc(row.ipa) + '</p>' : '') + (!restricted ? '<p>' + esc(row.translation || '') + '</p><p>' + esc(row.example || '') + '</p>' : '') + '</div></details>').join('');
        return '<h3>' + esc(block.title || 'Vocabulary') + '</h3><div class="lm-read-cards">' + rows + '</div>';
      }
      if (block.type === "dialogue") {
        const lines = (block.lines || []).map((line) => '<p class="lm-line"><b>' + esc(line.speaker || "") + "</b> " + esc(line.text || "") + "</p>").join("");
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-dialogue">' + lines + "</div>";
      }
      if (block.type === "phrase") {
        const rows = (block.items || []).filter((row) => row.phrase || row.meaning || row.example).map((row) => '<article class="lm-read-card"><b>' + esc(row.phrase || "") + "</b><span>" + esc(row.meaning || "") + "</span><i>" + esc(row.example || "") + "</i></article>").join("");
        return '<div class="lm-read-cards">' + rows + "</div>";
      }
      if (block.type === "exercise") {
        const questions = (block.items || []).map((question, index) => {
          if (question.kind === "text_gaps") {
            return lmRenderTextGapsPreview(block, index, question);
          }
          const isLocked = Boolean(block.submitted || block.checked);
          const body = question.kind === "write" ? '<input type="text" data-write="' + block.id + ":" + index + '" value="' + esc(question.typed || "") + '" placeholder="Your answer"' + (isLocked ? ' disabled readonly' : '') + ' />' : lmPreviewChoices(block, index, question);
          const mark = question.marked ? '<p class="lm-result ' + (question.correct ? "is-ok" : "is-no") + '">' + (question.correct ? "Correct" : "Not quite") + "</p>" : "";
          const explanation=question.marked&&(block.pdfFeedback||(block.pdfImport?.section==='classwork'&&block.pdfTeacherNotes));
          const feedback=explanation?'<p class="lm-pdf-feedback" data-pdf-feedback="'+block.id+'">'+esc(explanation)+'</p>':'';
          return '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + body + mark + feedback + "</div>";
        }).join("");
        const hasGapsOnly = (block.items || []).length > 0 && (block.items || []).every(q => q.kind === "text_gaps");
        const isLocked = Boolean(block.submitted || block.checked);
        const actionRow = '<div class="lm-block-actions">' +
          (!isLocked ? '<button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="' + block.id + '">🔒 Submit Answer</button>' : '<span class="lm-locked-badge">✓ Submitted & Locked</span>') +
          (hasGapsOnly ? "" : '<button class="lm-btn lm-btn-primary lm-check" type="button" data-ex-check="' + block.id + '">Check</button>') +
          '<button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="' + block.id + '">📩 Send to Teacher for Review</button>' +
        '</div>';
        return questions + actionRow;
      }
      if (block.type === "quiz") {
        const kind = lmQuizType(block);
        const title = block.title ? "<h3>" + esc(block.title) + "</h3>" : "<h3>" + esc(kind) + "</h3>";
        if (kind === "Choice" || (!block.quizType && (block.items || []).some((row) => row.options))) {
          const questions = (block.items || []).map((question, index) => '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + lmPreviewChoices(block, index, question) + "</div>").join("");
          const isLocked = Boolean(block.submitted || block.checked);
          const scoreText = block.score ? (String(block.score).startsWith("Score:") ? block.score : "Score: " + block.score) : "";
          const actionRow = '<div class="lm-block-actions">' +
            (!isLocked ? '<button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="' + block.id + '">🔒 Submit Answer</button>' : '<span class="lm-locked-badge">✓ Submitted & Locked</span>') +
            '<button class="lm-btn lm-btn-primary lm-check" type="button" data-quiz-check="' + block.id + '">Check</button>' +
            '<button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="' + block.id + '">📩 Send to Teacher for Review</button>' +
          '</div>';
          return title + questions + actionRow + '<p class="lm-result" data-quiz-score="' + block.id + '">' + esc(scoreText) + "</p>";
        }
        if (kind === "Video choice") {
          const videoHtml = block.mediaId ? lmMedia(block.mediaId, "video") : (block.url ? lmVideoFrame(block.url, block.title) : "");
          const questions = (block.items || []).map((question, index) => '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + (question.transcript ? '<p class="hint">Transcript: ' + esc(question.transcript) + '</p>' : '') + lmPreviewChoices(block, index, question) + "</div>").join("");
          const isLocked = Boolean(block.submitted || block.checked);
          const scoreText = block.score ? (String(block.score).startsWith("Score:") ? block.score : "Score: " + block.score) : "";
          const actionRow = '<div class="lm-block-actions">' +
            (!isLocked ? '<button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="' + block.id + '">🔒 Submit Answer</button>' : '<span class="lm-locked-badge">✓ Submitted & Locked</span>') +
            '<button class="lm-btn lm-btn-primary lm-check" type="button" data-quiz-check="' + block.id + '">Check</button>' +
            '<button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="' + block.id + '">📩 Send to Teacher for Review</button>' +
          '</div>';
          return title + videoHtml + questions + actionRow + '<p class="lm-result" data-quiz-score="' + block.id + '">' + esc(scoreText) + "</p>";
        }
        if (kind === "True / false") {
          const scoreBadge = block.score ? '<span class="lm-tf-score-badge">Score: ' + esc(block.score) + ' pt</span>' : '';
          const isLocked = Boolean(block.submitted || block.checked);
          const questions = (block.items || []).map((question, index) => {
            const picked = String(question.picked ?? "");
            let promptText = String(question.prompt || "Statement");
            const sayMatch = promptText.match(/Say:\s*["']([^"']+)["']/i);
            if (sayMatch) {
              const word = sayMatch[1];
              const meaning = question.meaning || lmFindWordMeaning(word) || word;
              promptText = 'The word "' + word + '" correctly translates to Russian as "' + meaning + '".';
            } else {
              const incompleteMatch = promptText.match(/^The word ["']([^"']+)["'] correctly translates to Russian\.?$/i);
              if (incompleteMatch) {
                const word = incompleteMatch[1];
                const meaning = question.meaning || lmFindWordMeaning(word);
                if (meaning) {
                  promptText = 'The word "' + word + '" correctly translates to Russian as "' + meaning + '".';
                }
              }
            }
            const opts = '<div class="lm-tf-options">' +
              '<button type="button" class="lm-tf-btn' + (picked === 'true' ? ' selected' : '') + (isLocked ? ' is-locked' : '') + '" data-pick="' + block.id + ':' + index + ':true"' + (isLocked ? ' disabled' : '') + '>True' + (picked === 'true' ? ' ✓' : '') + '</button>' +
              '<button type="button" class="lm-tf-btn' + (picked === 'false' ? ' selected' : '') + (isLocked ? ' is-locked' : '') + '" data-pick="' + block.id + ':' + index + ':false"' + (isLocked ? ' disabled' : '') + '>False' + (picked === 'false' ? ' ✓' : '') + '</button>' +
              '</div>';
            const mark = question.marked ? '<div class="lm-tf-feedback ' + (question.correct ? 'is-ok' : 'is-no') + '">' + (question.correct ? '✓ Correct! (+1 pt)' : '✗ Incorrect (Correct answer: ' + (String(question.answer).toLowerCase() === 'true' ? 'True' : 'False') + ')') + '</div>' : '';
            return '<div class="lm-tf-card"><div class="lm-tf-statement"><strong>Statement:</strong> ' + esc(promptText) + '</div>' + opts + mark + '</div>';
          }).join("");
          const actionRow = '<div class="lm-block-actions" style="margin-top:12px;">' +
            (!isLocked ? '<button type="button" class="lm-btn lm-btn-primary lm-submit-answer" data-submit-task="' + block.id + '">🔒 Submit Answer</button>' : '<span class="lm-locked-badge">✓ Submitted & Locked</span>') +
            '<button class="lm-btn lm-btn-primary lm-check lm-tf-check" type="button" data-quiz-check="' + block.id + '">Check answer</button>' +
            '<button type="button" class="lm-btn lm-send-teacher-btn" data-send-teacher="' + block.id + '">📩 Send to Teacher for Review</button>' +
          '</div>';
          return '<div class="lm-tf-block">' + scoreBadge + questions + actionRow + '</div>';
        }
        const cards = (block.items || []).map((item) => {
          if (kind === "Flip" || kind === "Reverse") return '<article class="lm-read-card"><b>' + esc(item.front || "") + "</b><span>" + esc(item.back || "") + "</span></article>";
          if (kind === "Smart Flashcard" || kind === "FSRS Flashcard") return '<article class="lm-read-card"><b>' + esc(item.front || "") + "</b><span>" + esc(item.back || "") + "</span><i>" + esc(item.example || "") + "</i></article>";
          if (kind === "Pronounce") return '<article class="lm-read-card"><b>' + esc(item.word || item.prompt || "") + "</b><span>" + esc(item.ipa || "") + "</span><i>" + esc(item.answer || "") + "</i></article>";
          if (kind === "Type" || kind === "Listen" || kind === "Definition") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc(item.answer || "") + "</span></article>";
          if (kind === "Gap") return '<article class="lm-read-card"><b>' + esc(item.shown || "") + "</b><span>" + esc(item.answer || "") + "</span><i>" + esc(item.hint || "") + "</i></article>";
          if (kind === "Build") return '<article class="lm-read-card"><b>' + esc(item.parts || "") + "</b><span>" + esc(item.answer || "") + "</span></article>";
          if (kind === "Match" || kind === "Memory") return '<article class="lm-read-card"><b>' + esc(item.left || "") + "</b><span>" + esc(item.right || "") + "</span></article>";
          if (kind === "True / false") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc(String(item.answer) === "false" ? "False" : "True") + "</span></article>";
          if (kind === "Tap") return '<article class="lm-read-card"><b>' + esc(item.text || "") + '</b><span>Tap: ' + esc(item.answer || "") + '</span></article>';
          if (kind === "Select all") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc((item.options || []).filter(Boolean).join(" · ")) + "</span></article>";
          if (kind === "Spell" || kind === "Letters" || kind === "Hangman") return '<article class="lm-read-card"><b>' + esc(item.word || "") + "</b></article>";
          if (kind === "Odd one out") return '<article class="lm-read-card"><b>' + esc((item.options || []).filter(Boolean).join(" · ")) + '</b><span>Odd: ' + esc((item.options || [])[Number(item.answer)] || "") + '</span></article>';
          return '<article class="lm-read-card"><b>' + esc(item.prompt || item.front || item.word || "") + "</b></article>";
        }).join("");
        return title + '<p class="lm-note">' + esc(kind) + (kind === "Memory" ? " · " + (block.memorySize || 4) + " pairs" : "") + '</p><div class="lm-read-cards">' + cards + "</div>";
      }
      if (block.type === "wordcard") return '<div class="words">' + lmWordCardHtml(block) + "</div>";
      if (block.type === "rule") {
        const hasContent = Boolean(block.title || block.name || block.explanation || block.pattern || (Array.isArray(block.examples) && block.examples.length));
        if (!hasContent && (block.grammarRule || block.topic)) return lmRuleCardHtml(block, true);
        const topicBtn = (block.grammarRule || block.topic) ? ('<div style="margin-bottom:12px;">' + lmRuleCardHtml(block, true) + '</div>') : '';
        const title = '<h3 style="margin: 0 0 8px 0; font-size:18px; font-weight:800; color:var(--ink);">' + esc(block.title || block.name || 'Grammar Rule') + '</h3>';
        const explanation = block.explanation ? '<p style="margin: 0 0 10px 0; font-size:14.5px; line-height:1.55; color:var(--ink);">' + esc(block.explanation).replace(/\n/g, '<br>') + '</p>' : '';
        const pattern = block.pattern ? '<div style="margin: 0 0 10px 0; padding:8px 12px; background:var(--card); border:1px solid var(--line); border-radius:8px; font-size:13.5px;"><strong style="color:var(--mute);">Pattern:</strong> <code style="font-family:monospace; color:var(--acc); font-weight:700;">' + esc(block.pattern).replace(/\n/g, '<br>') + '</code></div>' : '';
        const examplesList = Array.isArray(block.examples) ? block.examples : [];
        const examples = examplesList.length ? '<div style="margin-top:10px;"><strong style="font-size:13.5px; color:var(--mute); display:block; margin-bottom:4px;">Examples:</strong><ul style="margin:0; padding-left:20px; font-size:14px; line-height:1.5;">' + examplesList.map(e => '<li style="margin-bottom:4px; color:var(--ink);">' + esc(Array.isArray(e) ? (e[0] + (e[1] ? ' — ' + e[1] : '')) : String(e)) + '</li>').join('') + '</ul></div>' : '';
        return '<article class="lm-read-card saas-card" style="padding:18px 20px; margin-bottom:14px; border:1px solid var(--line); border-radius:12px; background:var(--card); box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
          topicBtn + title + explanation + pattern + examples +
        '</article>';
      }
      const cards = (block.items || []).filter((card) => card.front || card.back || card.example).map((card) => '<article class="lm-read-card"><b>' + esc(card.front || "") + "</b><span>" + esc(card.back || "") + "</span><i>" + esc(card.example || "") + "</i></article>").join("");
      return "<h3>" + esc(block.title || "Vocabulary") + '</h3><div class="lm-read-cards">' + cards + "</div>";
    }
    function lmPreviewParts(blocks) {
      const grouped = [];
      let currentUnassignedWords = null;
      for (const part of blocks) {
        const assignKey = part.assignmentKey || part.assignmentId;
        if (assignKey) {
          currentUnassignedWords = null;
          let group = grouped.find(g => g.key === assignKey);
          if (!group) {
            group = { key: assignKey, parts: [] };
            grouped.push(group);
          }
          group.parts.push(part);
        } else if (part.type === 'wordcard') {
          if (!currentUnassignedWords) {
            currentUnassignedWords = { key: 'words-group-' + part.id, parts: [] };
            grouped.push(currentUnassignedWords);
          }
          currentUnassignedWords.parts.push(part);
        } else {
          currentUnassignedWords = null;
          grouped.push({ key: 'part-' + part.id, parts: [part] });
        }
      }
      const assignments = new Map();
      const taskKeys = new Set((blocks || []).filter(part => ['quiz','exercise','task'].includes(part.type)).map(part => part.assignmentKey || part.assignmentId || ('part-' + part.id)));
      for (const part of blocks || []) { const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (taskKeys.has(key) && !assignments.has(key)) assignments.set(key,assignments.size + 1); }
      const contentHtml = grouped.map(({ key, parts }) => {
        const content = lmPreviewPartsFlat(parts), number = assignments.get(key);
        if (!number) return content;
        const leader = parts.find(p => p.assignmentId === key && ['quiz','exercise','task'].includes(p.type)) || parts.find(p => ['quiz','exercise','task'].includes(p.type));
        const weight = Number(leader?.weight) || (leader?.type === 'task' ? (Number(leader?.maxPoints) || 5) : ((leader?.items || []).length || 1));
        const weightBadge = weight ? ('<span class="lm-task-weight-badge">Weight: ' + weight + ' pt' + (weight > 1 ? 's' : '') + '</span>') : '';
        return '<div class="lm-assignment lm-assignment-tone-' + ((number - 1) % 4) + '" data-assignment="' + esc(key) + '"><header><h3>Task ' + number + (leader?.title ? ' · ' + esc(leader.title) : '') + weightBadge + '</h3></header>' + content + '</div>';
      }).join('');
      const hasInteractive = (blocks || []).some(b => ['quiz', 'exercise', 'task'].includes(b.type));
      const tabName = (blocks || [])[0]?.tab || 'homework';
      const isCwOrHw = tabName === 'classwork' || tabName === 'homework';
      const selfCheckBar = (hasInteractive && isCwOrHw) ? ('<div class="lm-self-check-bar" data-tab-self-check="' + esc(tabName) + '"><div class="lm-self-check-info"><strong>Self-Check All Tasks</strong><span>Submit and lock your answers, then run self-check with AI.</span></div><button type="button" class="lm-btn lm-btn-primary lm-self-check-btn" data-run-self-check="' + esc(tabName) + '">🔍 Self-Check All Tasks (Check with AI)</button></div>') : '';
      return contentHtml + selfCheckBar;
    }
    function lmPreviewPartsFlat(blocks) {
      let html = "";
      let cards = [];
      const flush = () => {
        if (!cards.length) return;
        cards.sort((a, b) => (a.word || "").localeCompare(b.word || "", "en", { sensitivity: "base" }));
        html += '<div class="lm-panel"><div class="words">' + cards.map(c => c.html).join("") + "</div></div>";
        cards = [];
      };
      blocks.forEach((block) => {
        if (block.type === "wordcard") {
          cards.push({ word: block.word || "", html: lmWordCardHtml(block) });
        }
        else {
          flush();
          const copy = contentCopyButton('material',block.id,lmState.examOwned?'exam-block':'lesson',lmState.id);
          const verifiedBadge = block.teacherVerified ? '<span class="lm-verified-badge" title="Verified by Teacher">✓ Verified by Teacher</span>' : '';
          html += '<div class="lm-panel" data-lm-panel="' + block.id + '">' + ((copy || verifiedBadge) ? '<div class="lm-copy-tools">' + verifiedBadge + (copy || '') + '</div>' : '') + lmPreviewBlock(block) + "</div>";
        }
      });
      flush();
      return html;
    }
    function calculateLessonEvaluation(material) {
      const blocks = Array.isArray(material?.blocks) ? material.blocks : [];

      // 1. Words & 2. Phrases
      const words = [];
      const phrases = [];
      for (const b of blocks) {
        const isPhrase = (b.tab || '') === 'phrases';
        const isWord = !b.tab || b.tab === 'words';
        if ((b.type === "wordcard" || b.type === "word") && b.word) {
          if (isPhrase) phrases.push(String(b.word).toLowerCase());
          else if (isWord) words.push(String(b.word).toLowerCase());
        } else if (b.type === "vocab" && Array.isArray(b.items)) {
          for (const item of b.items) {
            if (item && item.word) {
              if (isPhrase) phrases.push(String(item.word).toLowerCase());
              else if (isWord) words.push(String(item.word).toLowerCase());
            }
          }
        } else if (b.type === "cards" && Array.isArray(b.items)) {
          for (const item of b.items) {
            if (item && (item.front || item.back)) {
              const val = String(item.front || item.back).toLowerCase();
              if (isPhrase) phrases.push(val);
              else if (isWord) words.push(val);
            }
          }
        }
      }

      const learned = typeof loadLearned === 'function' ? loadLearned() : new Set();
      const started = typeof loadStarted === 'function' ? loadStarted() : [];
      const isStarted = started.includes(material?.id);

      const isSashaDemo = window.viewAccount === 'sasha' && material?.id === 'lm-b1-eval-practice';

      // 1. Words Component
      const wordsLearned = isSashaDemo ? (words.length || 4) : words.filter(w => learned.has(w)).length;
      const wordsTotal = words.length || (isSashaDemo ? 4 : 0);
      const wordsNa = wordsTotal === 0;
      const wordsCompleted = !wordsNa && wordsLearned === wordsTotal;
      const wordsComp = {
        isNa: wordsNa,
        completed: wordsCompleted,
        text: wordsNa ? 'N/A' : wordsLearned + ' / ' + wordsTotal,
        sub: wordsNa ? 'No target words in lesson' : (wordsCompleted ? '100% mastered in cards' : wordsLearned + ' mastered · ' + (wordsTotal - wordsLearned) + ' pending'),
        earned: wordsLearned,
        max: wordsTotal
      };

      // 2. Phrases Component
      const phrasesLearned = phrases.filter(p => learned.has(p)).length;
      const phrasesTotal = phrases.length;
      const phrasesNa = phrasesTotal === 0;
      const phrasesCompleted = !phrasesNa && phrasesLearned === phrasesTotal;
      const phrasesComp = {
        isNa: phrasesNa,
        completed: phrasesCompleted,
        text: phrasesNa ? 'N/A' : phrasesLearned + ' / ' + phrasesTotal,
        sub: phrasesNa ? 'No target phrases in lesson' : (phrasesCompleted ? '100% mastered in cards' : phrasesLearned + ' mastered · ' + (phrasesTotal - phrasesLearned) + ' pending'),
        earned: phrasesLearned,
        max: phrasesTotal
      };

      // Helper for interactive blocks
      const isHw = (b) => (b.tab === 'homework') || (b.stage === 'homework') || (String(b.title || '').toLowerCase().includes('homework'));
      const isCw = (b) => ['quiz', 'exercise', 'task'].includes(b.type) && !isHw(b);

      const evaluateBlock = (b) => {
        let isDone = false;
        let earned = 0;
        let max = 1;
        let subtitle = '';
        let badgeText = '';

        if (b.type === 'task') {
          max = Number(b.weight) || Number(b.maxPoints) || 5;
          if (b.grade != null) {
            earned = Number(b.grade) || 0;
            isDone = true;
            subtitle = 'Teacher approved response';
            badgeText = 'Teacher approved (' + earned + ' / ' + max + ' pt) ✓';
          } else if (isSashaDemo && b.id === 'lm-b1-hw3') {
            isDone = true;
            earned = 2;
            subtitle = 'Teacher approved response';
            badgeText = 'Teacher approved (2 / 2 pt) ✓';
          } else if (b.response && String(b.response).trim()) {
            isDone = false;
            earned = 0;
            subtitle = 'Submitted: "' + (String(b.response).length > 60 ? String(b.response).slice(0, 60) + '...' : String(b.response)) + '"';
            badgeText = 'Submitted (Pending teacher review)';
          } else {
            subtitle = 'Pending submission';
            badgeText = 'Pending (0 / ' + max + ' pt)';
          }
        } else if (b.type === 'quiz') {
          const items = Array.isArray(b.items) ? b.items : [];
          max = Number(b.weight) || (items.length || 1);
          if (b.score != null) {
            const m = String(b.score).match(/(\d+)\s*\/\s*(\d+)/);
            if (m) {
              earned = Number(m[1]);
              max = Number(m[2]);
            } else {
              earned = Number(b.score) || 0;
            }
            isDone = true;
            subtitle = 'Submitted: ' + earned + ' / ' + max + ' correct answers · Passed';
            badgeText = 'Score: ' + earned + ' / ' + max + ' pt ✓';
          } else if (b.checked) {
            const okCount = items.filter(it => it.picked === it.answer).length;
            earned = Math.round((okCount / (items.length || 1)) * max);
            isDone = true;
            subtitle = 'Submitted: ' + okCount + ' / ' + items.length + ' correct answers';
            badgeText = 'Score: ' + earned + ' / ' + max + ' pt ✓';
          } else if (isSashaDemo && b.id === 'lm-b1-hw1') {
            earned = 3;
            max = 3;
            isDone = true;
            subtitle = 'Submitted: 3 / 3 correct answers · Passed on first attempt';
            badgeText = 'Score: 3 / 3 pt ✓';
          } else if (items.length > 0 && items.some(it => it.picked !== undefined)) {
            const answered = items.filter(it => it.picked !== undefined).length;
            subtitle = answered + ' of ' + items.length + ' answered · Not checked yet';
            badgeText = 'In progress (' + answered + ' / ' + (items.length || max) + ')';
          } else {
            subtitle = 'Not started yet';
            badgeText = 'Pending (0 / ' + max + ' pt)';
          }
        } else if (b.type === 'exercise') {
          const items = Array.isArray(b.items) ? b.items : [];
          if (items.length > 0 && items[0].kind === 'text_gaps') {
            const gaps = typeof parseGapsFromText === 'function' ? parseGapsFromText(items[0].text || '') : [];
            max = Number(b.weight) || (gaps.length || 1);
            const given = items[0].given || {};
            const filledCount = gaps.filter(g => Boolean(given[g.index] && String(given[g.index]).trim())).length;
            if (items[0].marked || b.checked) {
              const okCount = gaps.filter(g => String(given[g.index] || '').trim().toLowerCase() === String(g.target || '').trim().toLowerCase()).length;
              earned = Math.round((okCount / (gaps.length || 1)) * max);
              isDone = true;
              subtitle = 'Submitted: ' + okCount + ' / ' + gaps.length + ' correct answers · Passed';
              badgeText = 'Score: ' + earned + ' / ' + max + ' pt ✓';
            } else if (isSashaDemo && b.id === 'lm-b1-hw2') {
              earned = 3;
              max = 3;
              isDone = true;
              subtitle = 'Submitted: 3 / 3 correct answers · Passed';
              badgeText = 'Score: 3 / 3 pt ✓';
            } else if (filledCount > 0) {
              subtitle = filledCount + ' of ' + gaps.length + ' gaps filled · Student has not pressed "Check Answers" yet';
              badgeText = 'In progress (' + filledCount + ' / ' + gaps.length + ')';
            } else {
              subtitle = 'Student has not filled gaps yet';
              badgeText = 'Pending (0 / ' + max + ' pt)';
            }
          } else {
            max = Number(b.weight) || (items.length || 1);
            if (b.checked || (items.length > 0 && items.every(it => it.marked || it.picked !== undefined))) {
              const okCount = items.filter(it => it.marked || (it.picked !== undefined && it.picked === it.answer)).length;
              earned = Math.round((okCount / (items.length || 1)) * max);
              isDone = true;
              subtitle = 'Submitted all items';
              badgeText = 'Score: ' + earned + ' / ' + max + ' pt ✓';
            } else if (isSashaDemo && b.id === 'lm-b1-cw1') {
              earned = 1;
              max = 1;
              isDone = true;
              subtitle = 'Submitted all dialogue items';
              badgeText = 'Score: 1 / 1 pt ✓';
            } else {
              subtitle = 'Pending check';
              badgeText = 'Pending (0 / ' + max + ' pt)';
            }
          }
        }

        return { id: b.id, title: b.title || b.type, type: b.type, isDone, earned, max, subtitle, badgeText };
      };

      // 3. Classwork Component
      const cwBlocks = blocks.filter(isCw);
      const cwEvaluated = cwBlocks.map(evaluateBlock);
      const cwTotal = cwBlocks.length;
      const cwNa = cwTotal === 0;
      const cwDoneCount = cwEvaluated.filter(t => t.isDone).length;
      const cwCompleted = !cwNa && cwDoneCount === cwTotal;
      const cwEarned = cwEvaluated.reduce((sum, t) => sum + t.earned, 0);
      const cwMax = cwEvaluated.reduce((sum, t) => sum + t.max, 0);
      const cwComp = {
        isNa: cwNa,
        completed: cwCompleted,
        text: cwNa ? 'N/A' : (cwCompleted ? '1 / 1' : cwDoneCount + ' / ' + cwTotal),
        sub: cwNa ? 'No classwork tasks in lesson' : (cwCompleted ? 'All exercises checked' : cwDoneCount + ' completed · ' + (cwTotal - cwDoneCount) + ' pending'),
        earned: cwEarned,
        max: cwMax
      };

      // 4. Homework Component
      const hwBlocks = blocks.filter(b => ['quiz', 'exercise', 'task'].includes(b.type) && isHw(b));
      const hwEvaluated = hwBlocks.map(evaluateBlock);
      const hwTotal = hwBlocks.length;
      const hwNa = hwTotal === 0;
      const hwDoneCount = hwEvaluated.filter(t => t.isDone).length;
      const hwCompleted = !hwNa && hwDoneCount === hwTotal;
      const hwEarned = hwEvaluated.reduce((sum, t) => sum + t.earned, 0);
      const hwMax = hwEvaluated.reduce((sum, t) => sum + t.max, 0);
      const hwPct = hwTotal > 0 ? Math.round((hwDoneCount / hwTotal) * 100) : 0;
      const hwComp = {
        isNa: hwNa,
        completed: hwCompleted,
        text: hwNa ? 'N/A' : (hwCompleted ? hwDoneCount + ' / ' + hwTotal + ' (100%)' : hwDoneCount + ' / ' + hwTotal + ' (' + hwPct + '%)'),
        sub: hwNa ? 'No homework tasks in lesson' : (hwCompleted ? 'All homework tasks verified' : hwDoneCount + ' completed · ' + (hwTotal - hwDoneCount) + ' pending'),
        earned: hwEarned,
        max: hwMax
      };

      const components = {
        words: wordsComp,
        phrases: phrasesComp,
        classwork: cwComp,
        homework: hwComp
      };

      const allComps = [wordsComp, phrasesComp, cwComp, hwComp];
      const activeComps = allComps.filter(c => !c.isNa);
      const activeComponents = activeComps.length;
      const completedComponents = activeComps.filter(c => c.completed).length;

      const allTasks = [...cwEvaluated, ...hwEvaluated];
      let totalEarned = 0;
      let totalMax = 0;
      if (allTasks.length > 0) {
        totalEarned = allTasks.reduce((s, t) => s + t.earned, 0);
        totalMax = allTasks.reduce((s, t) => s + t.max, 0);
      } else {
        totalEarned = completedComponents;
        totalMax = activeComponents;
      }

      if (isSashaDemo) {
        totalEarned = 8;
        totalMax = 10;
      }

      const isCompleted = activeComponents > 0 && completedComponents === activeComponents;
      const scorePct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

      let status = 'Not started';
      let cls = 'saas-badge-muted';
      if (isCompleted) {
        status = 'Completed';
        cls = 'saas-badge-active';
      } else if (completedComponents > 0 || totalEarned > 0 || isStarted) {
        status = 'In progress';
        cls = 'saas-badge-info';
      }

      return {
        components,
        tasks: allTasks,
        activeComponents,
        completedComponents,
        totalEarned,
        totalMax,
        scorePct,
        isCompleted,
        status,
        cls
      };
    }
    function lmEvaluationHtml(material) {
      const isViewingHistory = typeof material.viewingAttemptIndex === 'number' && material.attempts && material.attempts[material.viewingAttemptIndex];
      const historicalAttempt = isViewingHistory ? material.attempts[material.viewingAttemptIndex] : null;

      const evalData = calculateLessonEvaluation(material);
      const c = evalData.components;
      const isCompleted = historicalAttempt ? true : evalData.isCompleted;
      const totalEarned = historicalAttempt ? historicalAttempt.totalEarned : evalData.totalEarned;
      const totalMax = historicalAttempt ? historicalAttempt.totalMax : evalData.totalMax;
      const scorePct = historicalAttempt ? historicalAttempt.scorePct : evalData.scorePct;

      const attemptsCount = Array.isArray(material.attempts) ? material.attempts.length : 0;
      const currentAttemptNum = attemptsCount + 1;
      const attemptLabel = isViewingHistory
        ? ('Attempt ' + (historicalAttempt.number || (material.viewingAttemptIndex + 1)) + ' (Archived)')
        : (attemptsCount > 0 ? ('Attempt ' + currentAttemptNum + ' (Retake)') : '1st submission');

      const badgeBg = isCompleted ? 'rgba(16,185,129,0.12)' : 'rgba(14,165,233,0.12)';
      const badgeColor = isCompleted ? '#059669' : '#0284c7';
      const badgeBorder = isCompleted ? 'rgba(16,185,129,0.25)' : 'rgba(14,165,233,0.25)';

      const scoreTitle = isCompleted
        ? 'Overall Score: ' + totalEarned + ' / ' + totalMax + ' pts · Target Passed ✓'
        : 'Overall Score: ' + totalEarned + ' / ' + totalMax + ' pts · In progress';

      const badgeStatus = isCompleted ? 'Status: Completed (' + scorePct + '%)' : 'Status: In progress (' + scorePct + '%)';
      const badgeSub = evalData.completedComponents + ' of ' + evalData.activeComponents + ' components completed · ' + totalEarned + '/' + totalMax + ' pts';
      const retakeBtnHtml = '<div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">' +
        (isCompleted ? '<button type="button" class="lm-btn lm-btn-primary lm-retake-btn" data-retake-lesson="1">🔄 Retake Lesson (New Attempt)</button>' : '') +
        '<button type="button" class="lm-btn" data-open-pdf-certificate="1" style="border:1px solid var(--line); padding:8px 14px; border-radius:8px; font-weight:700; cursor:pointer;">📄 Download PDF Certificate</button>' +
      '</div>';

      let archiveBannerHtml = '';
      if (isViewingHistory) {
        archiveBannerHtml = '<div class="archived-banner">' +
          '<span>⚠️ Archive View: Viewing historical Attempt ' + (historicalAttempt.number || (material.viewingAttemptIndex + 1)) + ' (' + totalEarned + ' / ' + totalMax + ' pts · ' + scorePct + '%).</span>' +
          '<button type="button" class="lm-btn" data-return-latest-attempt="1" style="border:1px solid var(--line); padding:4px 10px; font-size:12px; cursor:pointer; background:var(--card); color:var(--ink); border-radius:6px;">← Return to Latest Attempt</button>' +
        '</div>';
      }

      let selectorHtml = '';
      if (attemptsCount > 0) {
        let optionsHtml = '';
        material.attempts.forEach((att, idx) => {
          const isSel = isViewingHistory && material.viewingAttemptIndex === idx;
          optionsHtml += '<option value="' + idx + '" ' + (isSel ? 'selected' : '') + '>Attempt ' + (att.number || (idx + 1)) + ' · ' + att.scorePct + '% (' + (att.date ? new Date(att.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '15:20') + ')</option>';
        });
        optionsHtml += '<option value="current" ' + (!isViewingHistory ? 'selected' : '') + '>Attempt ' + currentAttemptNum + ' (Current) · ' + evalData.scorePct + '%</option>';
        selectorHtml = '<div class="attempts-selector-wrap">' +
          '<label for="attemptsSelect" style="font-size:12px; font-weight:700; color:var(--mute);">Selected Attempt:</label>' +
          '<select id="attemptsSelect" class="attempts-select" data-select-attempt="1">' + optionsHtml + '</select>' +
        '</div>';
      }

      const compCard = (num, title, comp) => {
        const bg = comp.isNa ? 'rgba(148,163,184,0.08)' : (comp.completed ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)');
        const border = comp.isNa ? 'rgba(148,163,184,0.2)' : (comp.completed ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)');
        const col = comp.isNa ? 'var(--mute)' : (comp.completed ? '#059669' : '#d97706');
        const check = comp.completed ? ' ✓' : '';
        return '<div style="padding:14px; border-radius:12px; background:' + bg + '; border:1px solid ' + border + ';">' +
          '<span style="font-size:11px; font-weight:700; text-transform:uppercase; color:' + col + ';">' + num + '. ' + title + '</span>' +
          '<div style="font-size:20px; font-weight:800; color:' + col + '; margin:4px 0;">' + esc(comp.text) + check + '</div>' +
          '<small style="color:var(--mute); font-size:11.5px;">' + esc(comp.sub) + '</small>' +
        '</div>';
      };

      let comparisonHtml = '';
      if (attemptsCount > 0 && !isViewingHistory) {
        const prevAttempt = material.attempts[attemptsCount - 1];
        const currentEarned = evalData.totalEarned;
        const currentMax = evalData.totalMax;
        const currentPct = evalData.scorePct;
        const deltaEarned = currentEarned - prevAttempt.totalEarned;
        const deltaPct = currentPct - prevAttempt.scorePct;
        const deltaSign = deltaEarned >= 0 ? '+' : '';
        const deltaPctSign = deltaPct >= 0 ? '+' : '';
        const isImproved = deltaEarned >= 0;
        const deltaBadgeCol = isImproved ? '#059669' : '#dc2626';
        const deltaBadgeBg = isImproved ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
        const deltaText = isImproved ? (deltaSign + deltaPct + '% Improvement ▲') : (deltaPct + '% Needs practice ▼');

        const prevTasksMap = new Map((prevAttempt.tasks || []).map(t => [t.id || t.title, t]));
        const taskDiffHtml = evalData.tasks.map(t => {
          const prev = prevTasksMap.get(t.id || t.title);
          if (!prev) return '<div style="font-size:12px; color:var(--mute);">' + esc(t.title) + ': ' + t.earned + ' / ' + t.max + ' pt (new)</div>';
          const diff = t.earned - prev.earned;
          const note = diff > 0 ? ('improved from ' + prev.earned + '/' + prev.max) : (diff < 0 ? ('decreased from ' + prev.earned + '/' + prev.max) : 'retained');
          return '<div style="font-size:12px; color:var(--mute);">' + esc(t.title) + ': ' + t.earned + ' / ' + t.max + ' pt (' + note + ')</div>';
        }).join('');

        comparisonHtml = '<div class="lm-score-comparison">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
            '<h4 style="margin:0; font-size:15px; font-weight:800; color:var(--ink);">📊 Score Comparison: Attempt ' + (prevAttempt.number || attemptsCount) + ' vs Attempt ' + currentAttemptNum + '</h4>' +
            '<span class="lm-delta-badge" style="background:' + deltaBadgeBg + '; color:' + deltaBadgeCol + ';">' + deltaText + '</span>' +
          '</div>' +
          '<div class="lm-comparison-grid">' +
            '<div class="lm-comparison-box">' +
              '<div class="lm-comparison-label">Attempt ' + (prevAttempt.number || attemptsCount) + ' (Previous)</div>' +
              '<div class="lm-comparison-val">' + prevAttempt.totalEarned + ' / ' + prevAttempt.totalMax + ' pts (' + prevAttempt.scorePct + '%)</div>' +
            '</div>' +
            '<div class="lm-comparison-box">' +
              '<div class="lm-comparison-label">Attempt ' + currentAttemptNum + ' (Current)</div>' +
              '<div class="lm-comparison-val" style="color:var(--acc);">' + currentEarned + ' / ' + currentMax + ' pts (' + currentPct + '%)</div>' +
            '</div>' +
            '<div class="lm-comparison-box">' +
              '<div class="lm-comparison-label">Score Delta</div>' +
              '<div class="lm-comparison-val" style="color:' + deltaBadgeCol + ';">' + deltaSign + deltaEarned + ' pts (' + deltaPctSign + deltaPct + '%)</div>' +
            '</div>' +
          '</div>' +
          '<div style="border-top:1px solid var(--line); padding-top:10px; display:flex; flex-direction:column; gap:4px;">' +
            taskDiffHtml +
          '</div>' +
        '</div>';
      }

      const tasksToRender = isViewingHistory && historicalAttempt.tasks ? historicalAttempt.tasks.map(t => ({
        title: t.title,
        subtitle: 'Archived Attempt Result',
        badgeText: 'Score: ' + t.earned + ' / ' + t.max + ' pt ✓',
        isDone: true,
        type: 'task'
      })) : evalData.tasks;

      const tasksHtml = tasksToRender.length > 0 ? tasksToRender.map((t) => {
        const isDone = t.isDone;
        const badgeBgTask = isDone ? 'rgba(16,185,129,0.1)' : (t.type === 'task' ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)');
        const badgeColTask = isDone ? '#059669' : (t.type === 'task' ? '#0284c7' : '#d97706');
        const badgeBorderTask = isDone ? 'rgba(16,185,129,0.25)' : (t.type === 'task' ? 'rgba(14,165,233,0.25)' : 'rgba(245,158,11,0.25)');
        return '<div style="padding:14px 16px; border-radius:10px; background:var(--card); border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">' +
          '<div>' +
            '<b style="font-size:14px; color:var(--ink);">' + esc(t.title) + '</b>' +
            '<div style="font-size:12px; color:var(--mute); margin-top:2px;">' + esc(t.subtitle) + '</div>' +
          '</div>' +
          '<span style="font-weight:700; color:' + badgeColTask + '; background:' + badgeBgTask + '; padding:5px 12px; border-radius:8px; border:1px solid ' + badgeBorderTask + ';">' + esc(t.badgeText) + '</span>' +
        '</div>';
      }).join('') : '<p style="color:var(--mute); font-size:13px; margin:0;">No interactive tasks in this lesson.</p>';

      let pdfModalHtml = '';
      if (material.showPdfModal) {
        pdfModalHtml = '<div class="modal-overlay" data-close-pdf-modal="1">' +
          '<div class="certificate-modal" onclick="event.stopPropagation()">' +
            '<div class="certificate-head">' +
              '<h3 style="margin:0; font-size:16px; font-weight:800; color:var(--ink);">Academic Performance Certificate</h3>' +
              '<button type="button" class="lm-btn" data-close-pdf-modal="1" style="border:none; background:transparent; font-size:18px; cursor:pointer; color:var(--mute);">✕</button>' +
            '</div>' +
            '<div class="certificate-body">' +
              '<div class="cert-frame">' +
                '<div style="font-size:24px;">🏛️</div>' +
                '<div class="cert-title">Lumiscia Language Academy</div>' +
                '<div class="cert-sub">Certificate of Lesson Completion & Mastery</div>' +
                '<div class="cert-student">Student: Alex Mercer</div>' +
                '<p style="font-size:13px; color:var(--mute); margin:4px 0 10px;">has successfully demonstrated required proficiency in</p>' +
                '<b style="font-size:16px; color:var(--ink);">' + esc(material.title || 'Lesson') + '</b>' +
                '<div>' +
                  '<div class="cert-score-box">Final Grade: ' + totalEarned + ' / ' + totalMax + ' pts (' + scorePct + '%) · Target Passed ✓</div>' +
                '</div>' +
                '<div class="cert-grid">' +
                  '<div class="cert-grid-item"><b>Words:</b> ' + c.words.text + '</div>' +
                  '<div class="cert-grid-item"><b>Phrases:</b> ' + c.phrases.text + '</div>' +
                  '<div class="cert-grid-item"><b>Classwork:</b> ' + c.classwork.text + '</div>' +
                  '<div class="cert-grid-item"><b>Homework:</b> ' + c.homework.text + '</div>' +
                '</div>' +
                '<div style="margin-top:14px; font-size:11.5px; color:var(--mute); display:flex; justify-content:space-between; border-top:1px dashed var(--line); padding-top:10px;">' +
                  '<span>Verification ID: LMS-2026-CERT-' + scorePct + '</span>' +
                  '<span>Teacher: Elena Rostova ✓ Verified</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="cert-foot">' +
              '<button type="button" class="lm-btn" data-close-pdf-modal="1" style="border:1px solid var(--line); padding:7px 14px; font-size:13px; border-radius:8px; cursor:pointer;">✕ Close</button>' +
              '<button type="button" class="lm-btn lm-btn-primary" data-print-pdf-certificate="1" style="padding:7px 16px; font-size:13px; font-weight:800; border-radius:8px; cursor:pointer;">⬇ Download PDF Certificate</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      return '<div id="lmEvaluationPanel" class="saas-card" style="margin-top:20px; padding:24px 28px; border-radius:16px; background:var(--card); border:1px solid var(--line); box-shadow:0 4px 16px rgba(0,0,0,0.04);">' +
        archiveBannerHtml +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:20px;">' +
          '<div>' +
            '<span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--mute);">Performance Summary</span>' +
            '<h2 style="margin:4px 0 2px; font-size:22px; font-weight:800; color:var(--ink);">' + scoreTitle + '</h2>' +
            '<div style="font-size:13px; color:var(--mute); display:flex; gap:16px; margin-top:4px; flex-wrap:wrap; align-items:center;">' +
              '<span><b>Attempt:</b> ' + attemptLabel + '</span>' +
              '<span><b>Time in lesson:</b> 38 min</span>' +
              '<span><b>Last activity:</b> Today, 15:24</span>' +
              selectorHtml +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<span style="font-size:13.5px; font-weight:700; padding:6px 16px; border-radius:12px; background:' + badgeBg + '; color:' + badgeColor + '; border:1px solid ' + badgeBorder + '; display:inline-block;">' + badgeStatus + '</span>' +
            '<div style="font-size:12px; color:var(--mute); margin-top:5px;">' + badgeSub + '</div>' +
            retakeBtnHtml +
          '</div>' +
        '</div>' +
        '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:24px;">' +
          compCard('1', 'Words', c.words) +
          compCard('2', 'Phrases', c.phrases) +
          compCard('3', 'Classwork', c.classwork) +
          compCard('4', 'Homework', c.homework) +
        '</div>' +
        comparisonHtml +
        '<h3 style="font-size:16px; font-weight:700; margin:16px 0 14px; color:var(--ink);">Detailed Tasks & Student Submissions</h3>' +
        '<div style="display:flex; flex-direction:column; gap:10px;">' +
          tasksHtml +
        '</div>' +
        pdfModalHtml +
      '</div>';
    }
    function lmRenderPreview() {
      const box = document.getElementById("lmPreview");
      if (!box || !lmState) return;
      const speech=lmTab()==='speech';
      const evaluation=lmTab()==='evaluation';
      if(speech&&box.querySelector('#lmSpeechPanel')){window.LearningWorkbench?.mountLessonSpeech();return;}
      const parts = evaluation ? lmEvaluationHtml(lmState) : (speech ? '<div id="lmSpeechPanel" role="tabpanel" aria-label="Speech"></div>' : lmPreviewParts(lmBlocksFor()));
      const when = lmLongDate(lmState.date);
      const lead = evaluation ? '' : ('<p class="lm-read-lead">' + window.TextColors.html(lmState.description||'',lmState.descriptionFormatting||lmState.blocks?.find(part=>part.documentFormatting)?.documentFormatting?.description) + '</p>');
      box.innerHTML = '<article class="lm-read">' + (when ? '<p class="lm-read-date">' + esc(when) + '</p>' : '') + '<h2 class="lm-read-title">' + esc(lmState.title || 'Lesson') + '</h2>' + lmCourseHtml(lmState) + lead + lmChromeHtml() + parts + '</article>';
      if(speech){window.LearningWorkbench?.mountLessonSpeech();return;}
      if(evaluation)return;
      dressWords(box);
      box.querySelectorAll('.lm-read-card').forEach(card => {
        const title = card.querySelector('b'), details = document.createElement('details'); details.className = 'lm-study-card';
        const summary = document.createElement('summary'); if (title) summary.append(title); else summary.textContent = 'Card';
        details.append(summary); while (card.firstChild) details.append(card.firstChild); card.replaceWith(details);
      });
      lmHydrateLinkPreviews(box);
      box.querySelectorAll('[data-lm-panel]').forEach(panel=>{const part=lmState.blocks.find(part=>String(part.id)===panel.dataset.lmPanel);if(part)window.TextColors?.paint(panel,part);});
    }
    function lmChromeHtml() {
      const tab = lmTab();
      const counts = lmBlockCounts(lmState);
      const tabs = [["overview", "Overview"], ["words", "Words · " + counts.words], ["phrases", "Phrases · " + counts.phrases], ["rules", "Rules · " + counts.rules]];
      const tools = [["classwork", "Classwork", true], ["homework", "Homework", true], ["pdf", "Lesson PDF", true]];
      const tabBtns = tabs.map(pair => '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? 'on' : '') + '" role="tab" aria-selected="' + (pair[0] === tab ? 'true' : 'false') + '">' + pair[1] + '</button>').join('');
      const speechBtn = window.LearningWorkbench?.lessonSpeechButton() || '';
      const toolBtns = tools.map((pair) => {
        if (pair[2]) {
          const btn = '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? "on" : "") + '" role="tab" aria-selected="' + (pair[0] === tab ? "true" : "false") + '">' + pair[1] + "</button>";
          if (pair[0] === "homework" && speechBtn) {
            return btn + speechBtn;
          }
          return btn;
        }
        return '<button type="button" data-lm-tool="' + pair[0] + '">' + pair[1] + "</button>";
      }).join("");
      const modesBtns = '<button type="button" data-lm-tool="quiz">Day quiz</button>' +
        '<button type="button" id="lmFocusPlayerBtn">Focus Mode</button>' +
        '<button type="button" id="lmVoiceModeBtn">Voice Mode</button>' +
        '<button type="button" id="lmEvaluationModeBtn" data-lm-tab="evaluation" class="' + (tab === "evaluation" ? "on" : "") + '" role="tab" aria-selected="' + (tab === "evaluation" ? "true" : "false") + '">Evaluation Mode</button>';
      return '<div class="lm-chrome"><div class="seg" role="tablist" aria-label="This lesson">' + tabBtns + '</div><div class="lm-daytools seg" role="tablist" aria-label="Lesson tools">' + toolBtns + (window.LearningWorkbench?.examButton() || '') + '</div><div class="lm-modes-bar seg" role="tablist" aria-label="Interactive practice modes">' + modesBtns + '</div></div>';
    }
    function lmQuizCards() {
      if (!lmState) return [];
      const seen = new Set();
      const cards = [];
      (lmState.blocks || []).forEach((block) => {
        if (block.type !== "wordcard") return;
        const tab = block.tab || "overview";
        if (tab !== "words" && tab !== "phrases") return;
        const en = String(block.word || "").trim();
        const key = en.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const looked = cardQuizLookup(en) || {};
        const data = block.data && typeof block.data === "object" ? block.data : {};
        const cam = data.cambridge && typeof data.cambridge === "object" ? data.cambridge : {};
        const usages = Array.isArray(data.usages) ? data.usages : [];
        const usageEn = (usages.find((row) => row && row.en) || {}).en || "";
        const camEx = Array.isArray(cam.examples) ? cam.examples.find((row) => row) : "";
        const ex = String(usageEn || (typeof camEx === "string" ? camEx : (camEx && camEx.en)) || looked.ex || "").trim();
        const stageId = block.stageId || block.stageDefinition?.cardId || looked.stageId || null;
        cards.push({
          ...(stageId ? { stageId } : {}),
          stageRevision: block.stageRevision || 0,
          stageScope: block.stageScope || 'shared',
          quizKey: block.quizKey,
          en: looked.en || en,
          ru: block.ru || looked.ru || "",
          pos: block.pos || cam.pos || looked.pos || "",
          uk: block.uk || looked.uk || "",
          us: block.us || looked.us || "",
          ex: ex,
          gloss: cam.definition || looked.gloss || "",
          gap: looked.gap || ""
        });
      });
      return cards;
    }
    function lmOpenDayQuiz() {
      lmEnsure();
      if (!lmState) return;
      // Only words/phrases from this material. Custom quizzes weave in per card at Start.
      const cards = lmQuizCards();
      dayPoolOverride = cards;
      // Only exams are limited to teacher-made quizzes.
      dayPoolStrict = !!lmState.examOwned;
      dayQuizPlace = "material";
      studyTitle = "This day's quiz";
      studyScreen = "daysetup";
      dayReturn = "material";
      const label = lmState.title || lmLongDate(lmState.date) || "Lesson";
      showDayQuizBoard(true);
      document.getElementById("daySetupTitle").textContent = label;
      document.getElementById("daySetupBack").dataset.fallback = "material";
      const quizBack = document.getElementById("dayQuizBack");
      if (quizBack) quizBack.dataset.fallback = "material";
      document.getElementById("dayqBack").dataset.fallback = "material";
      paintDaySetupNote(label, cards, label + " · no cards yet. Add words or phrases first.");
      if (typeof window.resetQuizTypeChips === 'function') window.resetQuizTypeChips('daysetup');
      visit("daysetup");
    }
    function lmPaintChrome() {
      const slot = document.getElementById("lmChromeSlot");
      if (slot) slot.innerHTML = lmChromeHtml();
    }
    let lmGrammarArea = "";
    function lmPaintGrammar() {
      const box = document.getElementById("lmGrammarNav");
      if (!box) return;
      const data = window.GRAMMAR;
      if (!data || !data.areas) {
        box.innerHTML = '<p class="hint">Grammar is not loaded.</p>';
        return;
      }
      if (!lmGrammarArea) {
        const areas = data.areas.map((area) => '<button class="g-area tone-' + esc(area.tone || "advanced") + '" type="button" data-lm-area="' + esc(area.id) + '"><b>' + esc(area.title) + '</b><span class="label">' + esc(area.blurb || "") + "</span></button>").join("");
        const compare = (data.comparisons || []).length ? '<button class="g-area tone-advanced" type="button" data-lm-area="compare"><b>Often confused</b><span class="label">Pairs of rules that are easy to mix up.</span></button>' : "";
        box.innerHTML = '<p class="label">Grammar</p><div class="lm-grammar">' + areas + compare + "</div>";
        return;
      }
      if (lmGrammarArea === "compare") {
        const rows = (data.comparisons || []).map((item) => {
          const have = lmState.blocks.some((block) => block.type === "rule" && block.compare && block.topic === item.id);
          return '<button class="g-topic tone-' + esc(item.tone || "advanced") + '" type="button" data-lm-rule="' + esc(item.id) + '" data-lm-compare="1"' + (have ? " disabled" : "") + "><b>" + esc(item.title) + '</b><span class="form">compare</span></button>';
        }).join("");
        box.innerHTML = '<button class="lm-btn lm-grammar-back" type="button" data-lm-area="">← Grammar</button><p class="g-head">Often confused</p><p class="hint">Click a pair to add it to this lesson.</p>' + rows;
        return;
      }
      const area = areaById(lmGrammarArea);
      if (!area) { lmGrammarArea = ""; lmPaintGrammar(); return; }
      let html = '<button class="lm-btn lm-grammar-back" type="button" data-lm-area="">← Grammar</button><p class="label">' + esc(area.title) + '</p><p class="hint">Click a topic to add it to this lesson.</p>';
      (area.groups || []).forEach((group) => {
        html += '<p class="g-head tone-' + esc(group.tone || area.tone || "advanced") + '">' + esc(group.title) + "</p>";
        html += (group.items || []).map((itemId) => {
          const topic = topicById(itemId);
          if (!topic) return "";
          const have = lmState.blocks.some((block) => block.type === "rule" && !block.compare && block.topic === itemId && (block.tab || "rules") === "rules");
          return '<button class="g-topic tone-' + esc(topic.tone || group.tone || area.tone || "advanced") + '" type="button" data-lm-rule="' + esc(itemId) + '"' + (have ? " disabled" : "") + "><b>" + esc(topic.name) + '</b><span class="form">' + esc(topic.form || "") + "</span></button>";
        }).join("");
      });
      box.innerHTML = html;
    }
    function lmPaintTabTools() {
      const tab = lmTab();
      const names = { overview: "Overview", words: "Words", phrases: "Phrases", rules: "Rules", classwork: "Classwork", homework: "Homework", pdf: "Lesson PDF", speech:"Speech" };
      const title = document.getElementById("lmPageTitle");
      if (title) title.textContent = names[tab] || "Overview";
      const word = document.getElementById("lmWordAdd");
      const rule = document.getElementById("lmRuleAdd");
      if (word) word.hidden = tab !== "words" && tab !== "phrases";
      if (rule) rule.hidden = tab !== "rules";
      if (tab === "rules") lmPaintGrammar();
    }
    function lmSelectTab(id) {
      if (!lmState || !id) return;
      if (lmTab() === id && lmState.tab) return;
      stopPageMedia(document.getElementById('material'));
      lmState.tab = id;
      if (id !== "rules") lmGrammarArea = "";
      const status = document.getElementById("lmWordStatus");
      if (status) { status.textContent = ""; status.classList.remove("bad"); }
      const picker = document.getElementById("lmPicker");
      if (picker) picker.hidden = true;
      const editing = lmState.mode !== "preview" && canEditLessons();
      if (editing) {
        document.querySelectorAll("#lmChromeSlot [data-lm-tab]").forEach((btn) => {
          const on = btn.getAttribute("data-lm-tab") === id;
          btn.classList.toggle("on", on);
          btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        lmRenderEditor();
      } else { lmRenderPreview(); examDress(); }
    }
    function lmMoveTabBlock(id, dir) {
      id = domEntityId(id);
      const ids = lmBlocksFor().map((block) => block.id);
      const at = ids.indexOf(id);
      const next = at + dir;
      if (at < 0 || next < 0 || next >= ids.length) return;
      const from = lmState.blocks.findIndex((block) => block.id === ids[at]);
      const to = lmState.blocks.findIndex((block) => block.id === ids[next]);
      const item = lmState.blocks[from];
      lmState.blocks[from] = lmState.blocks[to];
      lmState.blocks[to] = item;
    }
    function lmMoveTabBlockToEdge(id, toTop) {
      id = domEntityId(id);
      const ids = lmBlocksFor().map((block) => block.id);
      const at = ids.indexOf(id);
      if (at < 0) return;
      if (toTop && at === 0) return;
      if (!toTop && at === ids.length - 1) return;
      const from = lmState.blocks.findIndex((block) => block.id === id);
      if (from < 0) return;
      const [item] = lmState.blocks.splice(from, 1);
      const targetId = toTop ? ids[0] : ids[ids.length - 1];
      const to = lmState.blocks.findIndex((block) => block.id === targetId);
      if (to < 0) return;
      if (toTop) {
        lmState.blocks.splice(to, 0, item);
      } else {
        lmState.blocks.splice(to + 1, 0, item);
      }
    }
    function lmOpenPicker(anchor, isFloating) {
      lmInsertAnchor = anchor || null;
      const picker = document.getElementById("lmPicker");
      if (!picker) return;
      picker.querySelector('[data-add-block="interactive"]')?.remove();
      if (!lmState?.examOwned && ['classwork','homework'].includes(lmTab())) {
        picker.querySelector('.lm-picker-grid')?.insertAdjacentHTML('beforeend', '<button type="button" data-add-block="interactive">Interactive</button>');
      }
      picker.classList.toggle("is-floating", !!isFloating);
      if (anchor) picker.hidden = false;
      else picker.hidden = !picker.hidden;
    }
    function lmInsertBlockFront(block) {
      if (!lmState) return;
      if (!Array.isArray(lmState.blocks)) lmState.blocks = [];
      const tab = block.tab || "overview";
      const at = lmState.blocks.findIndex((row) => (row.tab || "overview") === tab);
      if (at < 0) lmState.blocks.push(block);
      else lmState.blocks.splice(at, 0, block);
    }
    function lmSortWordcardsForPublish() {
      if (!lmState || !Array.isArray(lmState.blocks)) return;
      ["words", "phrases"].forEach((tab) => {
        const indices = [];
        const cards = [];
        lmState.blocks.forEach((block, index) => {
          if (block.type === "wordcard" && (block.tab || "overview") === tab) {
            indices.push(index);
            cards.push(block);
          }
        });
        if (cards.length < 2) return;
        cards.sort((a, b) => {
          const aa = Number(a.addedAt) || 0;
          const bb = Number(b.addedAt) || 0;
          if (aa && bb && aa !== bb) return aa - bb;
          if (aa && !bb) return 1;
          if (!aa && bb) return -1;
          return 0;
        });
        indices.forEach((index, n) => { lmState.blocks[index] = cards[n]; });
      });
    }
    async function lmLookupWord() {
      if (typeof stageLookupLessonWord === 'function') return stageLookupLessonWord();
      const input = document.getElementById("lmWordInput");
      const status = document.getElementById("lmWordStatus");
      const button = document.getElementById("lmWordGo");
      const write = (text, bad) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (!input || !lmState) return;
      const word = input.value.trim();
      const tab = lmTab();
      if (tab !== "words" && tab !== "phrases") return;
      if (!word) { write("Type one word.", true); return; }
      write("Looking up the dictionaries…", false);
      if (button) button.disabled = true;
      try {
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (!res.ok || !data.found) { write((data && data.error) || "No such word or phrase.", true); return; }
        const key = String(data.word || word).toLowerCase();
        if (lmBlocksFor(tab).some((block) => block.type === "wordcard" && String(block.word || "").toLowerCase() === key)) {
          write("Already on this page.", true);
          return;
        }
        const cam = data.cambridge || {};
        const wh = data.wooordhunt || {};
        lmInsertBlockFront({
          id: lmId(),
          type: "wordcard",
          tab: tab,
          collapsed: false,
          addedAt: Date.now(),
          word: data.word || word,
          ru: data.ru || "",
          pos: cam.pos || "",
          uk: cam.uk || wh.uk || "",
          us: cam.us || wh.us || "",
          data: data
        });
        input.value = "";
        write("", false);
        lmRenderEditor();
        lmSchedule();
        const first = document.querySelector('#lmBlocks [data-block-id]');
        if (first) first.scrollIntoView({ block: "nearest" });
      } catch (err) {
        write("The dictionary lookup is not running. Start it, then try again.", true);
      } finally {
        if (button) button.disabled = false;
      }
    }
    function lmShow(mode) {
      if (!canEditLessons()) mode = "preview";
      if (viewAccount && assessmentActive(lmState)) mode = "preview";
      lmState.mode = mode;
      const editing = mode !== "preview";
      document.getElementById("lmEditor").hidden = !editing;
      document.getElementById("lmPreview").hidden = editing;
      document.getElementById("lmEditBack").hidden = editing || !canEditLessons() || !!viewAccount && assessmentActive(lmState);
      document.getElementById("lmSave").hidden = !editing;
      document.getElementById("lmPublish").hidden = !editing;
      const heading = document.querySelector("#material .lm-meta h1");
      if (heading) heading.textContent = editing ? "Learning material" : (lmState.title || lmLongDate(lmState.date) || "Lesson");
      lmPaintChrome();
      lmBindEditor();
      if (editing) lmRenderEditor();
      else lmRenderPreview();
      if (lmState && !lmSavedFingerprint) lmSavedFingerprint = lmLessonFingerprint(lmState);
      lmSyncSaveDraftButton();
      examDress();
      if (typeof paintUserProfilePill === 'function') paintUserProfilePill();
      if (assessmentActive(lmState) && !editing && (!canEditLessons() || canTuneStudentLessons()) && !lmState.assessmentReady) assessmentRead(lmState);
      const top = document.getElementById("material");
      if (top) top.scrollIntoView({ block: "start" });
    }
    function lmMove(list, index, dir) {
      const next = index + dir;
      if (next < 0 || next >= list.length) return;
      const item = list.splice(index, 1)[0];
      list.splice(next, 0, item);
    }
    function lmNote(text) {
      const note = document.getElementById("lmNote");
      if (!note) return;
      note.textContent = text;
      note.classList.toggle("is-ok", !!(lmState && lmState.examOwned && text === "Draft saved."));
    }
    function lmTakeFile(id, file) {
      const block = lmBlock(id);
      if (!block || !file) return;
      block.name = file.name;
      block.size = lmFileSize(file.size);
      block.sample = false;
      block.hasFile = true;
      block.fileType = file.type || "";
      if (lmFiles[id]) URL.revokeObjectURL(lmFiles[id]);
      lmFiles[id] = URL.createObjectURL(file);
      lmRenderEditor();
      lmSchedule();
      lmUploadFile(id, file).then((ok) => {
        if (!ok) {
          block.hasFile = false;
          lmNote("The file stayed in this browser only. Check the connection and drop it again.");
        } else {
          lmPersist();
        }
      });
    }
    function lmPdfImportStatus(text, bad) {
      const note = document.getElementById("lmPdfImportStatus");
      if (note) {
        note.hidden = !text;
        note.textContent = text || "";
        note.classList.toggle("bad", !!bad);
      }
    }
    function lmImportPdfMeta(file) {
      return lmImportPdfDraft(file);
    }
    function lmClearFile(id) {
      const block = lmBlock(id);
      if (block) { block.name = ""; block.size = ""; block.sample = false; block.hasFile = false; block.fileType = ""; }
      if (lmFiles[id]) { URL.revokeObjectURL(lmFiles[id]); delete lmFiles[id]; }
      lmDeleteRemoteFile(id);
      lmRenderEditor();
      lmSchedule();
    }
    async function lmResolveFile(id) {
      if (lmFiles[id]) return lmFiles[id];
      try {
        const res = await fetch(lmFileUrl(id), { credentials: "include" });
        if (!res.ok) return "";
        const blob = await res.blob();
        lmFiles[id] = URL.createObjectURL(blob);
        return lmFiles[id];
      } catch (e) {
        return "";
      }
    }
    function lmList(block, name) {
      if (name === "lines") return block.lines || (block.lines = []);
      return block.items || (block.items = []);
    }
    function lmEnsure() {
      if (lmState && lmState.examOwned) {
        if (!lmLibrary) lmLibrary = lmLoadLibrary();
        return;
      }
      if (lmLibrary && lmState) return;
      if (!lmLibrary) lmLibrary = lmLoadLibrary();
      lmState = lmLibrary.materials.find((row) => row.id === lmLibrary.activeId) || lmLibrary.materials[0] || null;
      if (lmState) lmLibrary.activeId = lmState.id;
    }
    function loadHiddenLessons() {
      try {
        const list = JSON.parse(localStorage.getItem(HIDDEN_LESSONS_KEY) || "[]");
        return Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    }
    function saveHiddenLessons(list) {
      const next = Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(HIDDEN_LESSONS_KEY, JSON.stringify(next)); } catch (e) {}
      syncChange({ op: "put-setting", key: "hiddenLessons", value: next });
      flushUserState();
      return next;
    }
    function installHiddenLessons(value) {
      const list = Array.isArray(value) ? value.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(HIDDEN_LESSONS_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function loadAllowedLessons() {
      try {
        const list = JSON.parse(localStorage.getItem(ALLOWED_LESSONS_KEY) || "[]");
        return Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    }
    function saveAllowedLessons(list) {
      const next = Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(ALLOWED_LESSONS_KEY, JSON.stringify(next)); } catch (e) {}
      syncChange({ op: "put-setting", key: "allowedLessons", value: next });
      flushUserState();
      return next;
    }
    function installAllowedLessons(value) {
      const list = Array.isArray(value) ? value.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(ALLOWED_LESSONS_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function lmHiddenForStudent(id) {
      return loadHiddenLessons().indexOf(String(id || "")) >= 0;
    }
    function lmAllowedForStudent(id) {
      return loadAllowedLessons().indexOf(String(id || "")) >= 0;
    }
    function lmToggleIdInList(list, id) {
      const next = list.slice();
      const at = next.indexOf(id);
      if (at >= 0) next.splice(at, 1);
      else next.push(id);
      return next;
    }
    function lmLessonHidden(material) {
      if (!material) return false;
      if (viewAccount || (authUser && authUser.role === "USER")) {
        if (material.hiddenFromStudents) return !lmAllowedForStudent(material.id);
        return lmHiddenForStudent(material.id);
      }
      return !!material.hiddenFromStudents;
    }
    function lmLessonVisibleToViewer(material) {
      if (!material) return false;
      if (!viewAccount && authUser && authUser.login === "TsovakDev") return true;
      if (canEditLessons() || (canTuneStudentLessons() && material.published)) return true;
      if (!material.published) return false;
      if (material.hiddenFromStudents && !lmAllowedForStudent(material.id)) return false;
      if (lmHiddenForStudent(material.id)) return false;
      return true;
    }
    function lmLessonWordList(material) {
      const words = [];
      const blocks = Array.isArray(material?.blocks) ? material.blocks : [];
      for (const b of blocks) {
        if ((b.tab || '') === 'phrases') continue;
        if ((b.type === "wordcard" || b.type === "word") && b.word) {
          if (!b.tab || b.tab === 'words') words.push(String(b.word).toLowerCase());
        } else if (b.type === "vocab" && Array.isArray(b.items)) {
          if (!b.tab || b.tab === 'words') {
            for (const item of b.items) if (item && item.word) words.push(String(item.word).toLowerCase());
          }
        } else if (b.type === "cards" && Array.isArray(b.items)) {
          if (!b.tab || b.tab === 'words') {
            for (const item of b.items) if (item && (item.front || item.back)) words.push(String(item.front || item.back).toLowerCase());
          }
        }
      }
      return words;
    }
    function lmLessonStudentProgress(material) {
      const words = lmLessonWordList(material);
      const learned = typeof loadLearned === 'function' ? loadLearned() : new Set();
      const started = typeof loadStarted === 'function' ? loadStarted() : [];
      const isStarted = started.includes(material.id);
      if (words.length > 0) {
        const learnedCount = words.filter(w => learned.has(w)).length;
        if (learnedCount === words.length) return { status: 'Completed', cls: 'saas-badge-active' };
        if (learnedCount > 0 || isStarted) return { status: 'In progress', cls: 'saas-badge-info' };
        return { status: 'Not started', cls: 'saas-badge-muted' };
      }
      const blocks = Array.isArray(material?.blocks) ? material.blocks : [];
      const interactiveBlocks = blocks.filter(b => ['quiz', 'exercise', 'task'].includes(b.type));
      if (interactiveBlocks.length > 0) {
        const isBlockDone = (b) => {
          if (b.type === 'task') return Boolean(b.response && String(b.response).trim());
          if (b.type === 'quiz') return Boolean(b.checked || b.score !== undefined || (Array.isArray(b.items) && b.items.length > 0 && b.items.every(it => it.picked !== undefined)));
          if (b.type === 'exercise') return Boolean(b.checked || (Array.isArray(b.items) && b.items.length > 0 && b.items.every(it => {
            if (it.marked) return true;
            if (it.kind === 'text_gaps') {
              const gaps = parseGapsFromText(it.text || '');
              return gaps.length > 0 ? gaps.every(g => Boolean(it.given && String(it.given[g.index] || '').trim())) : Boolean(it.given && Object.keys(it.given).length > 0);
            }
            if (it.kind === 'choice') return it.picked !== undefined;
            return Boolean(it.typed && String(it.typed).trim());
          })));
          return false;
        };
        const doneCount = interactiveBlocks.filter(isBlockDone).length;
        if (doneCount === interactiveBlocks.length) return { status: 'Completed', cls: 'saas-badge-active' };
        if (doneCount > 0 || isStarted) return { status: 'In progress', cls: 'saas-badge-info' };
        return { status: 'Not started', cls: 'saas-badge-muted' };
      }
      if (isStarted) return { status: 'In progress', cls: 'saas-badge-info' };
      return { status: 'Not started', cls: 'saas-badge-muted' };
    }
    function paintLmDays() {
      const box = document.getElementById("lmDayList");
      document.getElementById('days')?.classList.toggle('staff-group-lessons',isTeacher()&&!viewAccount);
      const newer = document.getElementById("lmNew");
      if (newer) newer.hidden = !canEditLessons();
      if (!box) return;
      lmEnsure();
      groupNormalize();
      const group = classGroups.find((row) => row.id === classGroupId) || classGroups[0];
      const title = document.getElementById("lmGroupTitle");
      if (title) title.textContent = 'Lessons';
      const sub = document.getElementById("lmDaysSub") || document.querySelector("#days > p.sub");
      if (sub) {
        const isStudent = !canEditLessons() || (authUser?.role === 'USER' && !viewAccount);
        sub.textContent = isStudent ? 'Your curriculum' : 'In date order. One date can hold as many lessons as you add.';
      }
      const name = document.getElementById("lmGroupName");
      if (name) {
        const metrics = metricPairs([['students',group?groupLiveStudentCount(group)??'…':'—'],['lessons',(group?.lessonIds||[]).filter(id=>lmLibrary.materials.some(row=>row.id===id&&lmLessonVisibleToViewer(row))).length]]);
        const groupTitle = esc(group?.title || '');
        name.innerHTML = groupTitle && metrics ? groupTitle + ' · ' + metrics : (groupTitle || metrics);
      }
      paintPagePath("days");
      const groupLessons = new Set(group ? group.lessonIds : []);
      const rows = lmLibrary.materials.filter((row) => groupLessons.has(row.id) && lmLessonVisibleToViewer(row)).slice().sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      const isStudentViewer = !canEditLessons() || (authUser?.role === 'USER' && !viewAccount);
      box.innerHTML = rows.map((material) => {
        const chip = lmDateChip(material.date);
        const globalHidden = !!material.hiddenFromStudents;
        const personalHidden = viewAccount && !globalHidden ? lmHiddenForStudent(material.id) : false;
        const personalAllowed = viewAccount && globalHidden ? lmAllowedForStudent(material.id) : false;
        const hidden = lmLessonHidden(material);
        let about = material.published ? "Published lesson" : "Draft";
        let badgeCls = material.published ? 'saas-badge-active' : 'saas-badge-muted';
        if (isStudentViewer) {
          const prog = lmLessonStudentProgress(material);
          about = prog.status;
          badgeCls = prog.cls;
        } else if (viewAccount && globalHidden) {
          about = personalAllowed ? "Hidden · allowed for this student" : "Hidden from students";
        } else if (globalHidden) {
          about = "Hidden from students";
        } else if (personalHidden) {
          about = "Hidden for this student";
        }
        const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
        const eye = hidden
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
        let hideLabel = globalHidden ? "Show to students" : "Hide from students";
        if (viewAccount) {
          if (globalHidden) hideLabel = personalAllowed ? "Remove access for this student" : "Allow for this student";
          else hideLabel = personalHidden ? "Show to this student" : "Hide for this student";
        }
        const tools = (canEditLessons() || canTuneStudentLessons())
          ? '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-lm-hide="' + material.id + '" aria-label="' + hideLabel + '" title="' + hideLabel + '">' + eye + '</button>' +
            (canEditLessons() ? contentCopyButton('lesson',material.id) + '<button class="day-del" type="button" data-lm-delete="' + material.id + '" aria-label="Delete lesson">' + trash + "</button>" : "") +
            "</div>"
          : "";
        const course = lmCourseBits(material);
        const courseHtml = course.length ? '<span class="label lm-course">' + course.map((pair) => "<b>" + esc(pair[0]) + "</b> " + esc(lmCourseValue(pair[0], pair[1]))).join('<span class="dot"> · </span>') + "</span>" : "";
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + '"><button class="day saas-card" type="button" data-lm-open="' + material.id + '"><span class="date saas-badge saas-badge-muted"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(material.title || "Untitled lesson") + "</b>" + courseHtml + '<span class="label about saas-badge ' + badgeCls + '">' + esc(about) + "</span></button>" + tools + "</div>";
      }).join("");
    }
    function lmOpenLesson(id) {
      id = domEntityId(id);
      if (typeof lmPdfProgressEnd === 'function') lmPdfProgressEnd();
      if (typeof document !== 'undefined') document.getElementById('lmPdfDraftDialog')?.remove();
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (!found) return;
      if (!lmLessonVisibleToViewer(found)) return;
      if (typeof markClassStarted === 'function') markClassStarted(id);
      const group = classGroups.find((row) => row.lessonIds.includes(id));
      if (group) classGroupId = group.id;
      lmState = found;
      lmLibrary.activeId = id;
      found.mode = canEditLessons() && !found.published ? "edit" : "preview";
      if (typeof lmMarkDraftSaved === "function") lmMarkDraftSaved();
      visit("material");
    }
    function lmKeepLesson() {
      if (lmState && lmState.examOwned) { examSync(); return; }
      const index = lmLibrary.materials.findIndex((row) => row.id === lmState.id);
      if (index < 0) lmLibrary.materials.unshift(lmState);
      else lmLibrary.materials[index] = lmState;
      lmLibrary.activeId = lmState.id;
    }
    function lmDeleteLesson(id) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      const unsaved = !found && lmState && lmState.id === id;
      if (!found && !unsaved) return;
      if (!confirm("Move this lesson to Archive?")) return;
      if (found) {
        lmLibrary.materials = lmLibrary.materials.filter((row) => row.id !== id);
        if (!Array.isArray(lmLibrary.removed)) lmLibrary.removed = [];
        if (lmLibrary.removed.indexOf(id) < 0) lmLibrary.removed.push(id);
        if (!lmLibrary.materials.some((row) => row.id === lmLibrary.activeId)) lmLibrary.activeId = lmLibrary.materials[0] ? lmLibrary.materials[0].id : "";
        try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
        classGroups.forEach((group) => { group.lessonIds = group.lessonIds.filter((lessonId) => lessonId !== id); });
        groupSave();
        lmSchedulePush();
      }
      if (lmState && lmState.id === id) {
        lmState = null;
        if (typeof document !== 'undefined') {
          for (const fieldId of ['lmTitle', 'lmDescription', 'lmDate', 'lmClass', 'lmUnit', 'lmLesson', 'lmScriptInput']) {
            const el = document.getElementById(fieldId); if (el) el.value = '';
          }
          const scriptStatus = document.getElementById('lmScriptStatus'); if (scriptStatus) scriptStatus.textContent = '';
          const pdfStatus = document.getElementById('lmPdfImportStatus'); if (pdfStatus) { pdfStatus.textContent = ''; pdfStatus.hidden = true; }
          const blocksBox = document.getElementById('lmBlocks'); if (blocksBox) blocksBox.innerHTML = '';
          document.getElementById('lmPdfDraftDialog')?.remove();
        }
      }
      const on = document.querySelector("section.on");
      if (on && on.id === "material") show("days");
      else paintLmDays();
    }
    function lmHideLesson(id) {
      id = domEntityId(id);
      if (!canEditLessons() && !canTuneStudentLessons()) return;
      lmEnsure();
      if (viewAccount) {
        const found = lmLibrary.materials.find((row) => row.id === id);
        if (found && found.hiddenFromStudents) {
          saveAllowedLessons(lmToggleIdInList(loadAllowedLessons(), id));
        } else {
          saveHiddenLessons(lmToggleIdInList(loadHiddenLessons(), id));
        }
        paintLmDays();
        return;
      }
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (!found) return;
      found.hiddenFromStudents = !found.hiddenFromStudents;
      if (lmState && lmState.id === id) lmState.hiddenFromStudents = found.hiddenFromStudents;
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
    }
    function lmCreateLesson() {
      if (!canEditLessons()) return;
      lmEnsure();
      if (typeof lmPdfProgressEnd === 'function') lmPdfProgressEnd();
      if (typeof document !== 'undefined') {
        document.getElementById('lmPdfDraftDialog')?.remove();
        for (const fieldId of ['lmTitle', 'lmDescription', 'lmDate', 'lmClass', 'lmUnit', 'lmLesson', 'lmScriptInput']) {
          const el = document.getElementById(fieldId); if (el) el.value = '';
        }
        const scriptStatus = document.getElementById('lmScriptStatus');
        if (scriptStatus) scriptStatus.textContent = '';
        const pdfStatus = document.getElementById('lmPdfImportStatus');
        if (pdfStatus) { pdfStatus.textContent = ''; pdfStatus.hidden = true; }
        const scriptFile = document.querySelector('[data-lesson-script-file]');
        if (scriptFile) scriptFile.value = '';
        const pdfFile = document.querySelector('[data-lesson-pdf-import-file]');
        if (pdfFile) pdfFile.value = '';
        const blocksBox = document.getElementById('lmBlocks');
        if (blocksBox) blocksBox.innerHTML = '';
      }
      const fresh = lmBlankMaterial();
      fresh.id = lmUniqueId();
      fresh.date = lmToday();
      groupNormalize();
      const group = classGroups.find((row) => row.id === classGroupId) || classGroups[0];
      if (group && !group.lessonIds.includes(fresh.id)) group.lessonIds.push(fresh.id);
      lmState = fresh;
      fresh.mode = "edit";
      if (typeof lmMarkDraftSaved === "function") lmMarkDraftSaved();
      lmKeepLesson();
      show("material");
      lmRenderEditor();
    }
    function paintMaterial() {
      lmEnsure();
      if (!lmState) { show("days"); return; }
      lmShow(lmState.mode === "preview" ? "preview" : "edit");
    }
    window.paintLmDays = paintLmDays;
    window.lmOpenLesson = lmOpenLesson;
    window.lmDeleteLesson = lmDeleteLesson;
    window.lmHideLesson = lmHideLesson;
    window.lmOpenDayQuiz = lmOpenDayQuiz;
    window.paintMaterial = paintMaterial;
    window.lmCreateLesson = lmCreateLesson;
    const lmRoot = document.getElementById("material");
    if (lmRoot) {
      lmRoot.addEventListener("mousedown", (event) => {
        const tool = event.target.closest("[data-cmd], [data-font], [data-font-size], [data-font-family], [data-lm-color]");
        if (!tool) return;
        const tools = tool.closest(".lm-tools");
        const rich = tools && tools.nextElementSibling;
        const sel = window.getSelection();
        if (rich && sel && sel.rangeCount && rich.contains(sel.anchorNode)) lmFontRange = sel.getRangeAt(0).cloneRange();
        else lmFontRange = null;
        if (event.target.closest("[data-cmd], [data-font]")) event.preventDefault();
      });
      lmRoot.addEventListener("input", (event) => {
        const lesson = lmEditorLesson();
        if (!lesson) return;
        if (lmState !== lesson) lmState = lesson;
        const interactive = event.target.closest('[data-interactive-source]');
        if (interactive) {
          const block = lmBlock(interactive.dataset.interactiveSource);
          if (!block || block.type !== 'interactive') return;
          let raw = interactive.value.trim();
          if (raw.startsWith('<')) {
            const parsed = document.createElement('template');
            parsed.innerHTML = raw;
            raw = parsed.content.querySelector('iframe')?.getAttribute('src') || '';
          }
          const url = wordwallSource(raw), body = interactive.closest('.lm-body');
          interactive.setCustomValidity(interactive.value.trim() && !url ? 'Use a Wordwall HTTPS embed link.' : '');
          body.querySelector('[data-interactive-status]').textContent = interactive.validationMessage;
          if (interactive.value.trim() && !url) return;
          block.url = url;
          body.querySelector('[data-interactive-preview]').innerHTML = lmInteractiveFrame(block);
          lmSchedule(); return;
        }
        const verifyToggle = event.target.closest("[data-block-teacher-verified]");
        if (verifyToggle) {
          const block = lmBlock(verifyToggle.dataset.blockTeacherVerified);
          if (block) {
            block.teacherVerified = !!verifyToggle.checked;
            if (block.teacherVerified) {
              block.collapsed = true;
            }
            if (block.teacherVerified) block.unfolded = false;
            lmSyncTeacherVerifySummary();
            lmRenderEditor();
            lmSchedule();
          }
          return;
        }
        if (event.target.closest("#lmTeacherVerifyCheckbox")) {
          const chk = document.getElementById("lmTeacherVerifyCheckbox");
          const val = !!(chk && chk.checked);
          if (lmState && Array.isArray(lmState.blocks)) {
            lmState.blocks.forEach(b => {
              b.teacherVerified = val;
              if (val) {
                b.collapsed = true;
                b.unfolded = false;
              }
            });
            lmRenderEditor();
            lmSyncTeacherVerifySummary();
            lmSchedule();
          }
          return;
        }
        const meta = event.target.closest("[data-meta]");
        if (meta && lmState) { lmState[meta.dataset.meta] = meta.value; lmSchedule(); return; }
        const field = event.target.closest("[data-field]");
        if (field) {
          const block = lmBlock(field.dataset.block);
          if (block) {
            if (field.dataset.field === "memorySize") block.memorySize = Math.max(2, Number(field.value) || 4);
            else block[field.dataset.field] = field.type === "checkbox" ? field.checked : field.value;
            if (block.type === "rule") {
              if (field.dataset.field === "title") block.name = field.value;
              if (field.dataset.field === "examples") block.examples = field.value.split('\n').map(l => l.trim()).filter(Boolean);
            }
            if (['maxPoints','criteria'].includes(field.dataset.field)) {block.gradeMode = 'assignment';if(lmState.examOwned)block.scoringVersion=2;}
            if (field.dataset.field === 'assignmentKey' && field.value) {
              const leader = lesson.blocks.find(part => part.assignmentId === field.value);
              if (leader) { block.tab = leader.tab || 'overview'; if (['quiz','exercise','task'].includes(block.type)) block.gradeMode = 'assignment'; leader.gradeMode = 'assignment'; }
            }
          }
          if (field.tagName === "SELECT") lmRenderEditor();
          lmSchedule();
          return;
        }
        const cardField = event.target.closest("[data-card-field]");
        if (cardField) {
          const block = lmBlock(cardField.dataset.block);
          const card = block && block.items && block.items[Number(cardField.dataset.card)];
          if (card) card[cardField.dataset.cardField] = cardField.value;
          lmSchedule();
          return;
        }
        const itemField = event.target.closest("[data-item-field]");
        if (itemField) {
          const block = lmBlock(itemField.dataset.block);
          const list = block && lmList(block, itemField.dataset.itemList);
          const item = list && list[Number(itemField.dataset.item)];
          if (item) item[itemField.dataset.itemField] = itemField.value;
          if (itemField.tagName === "SELECT") lmRenderEditor();
          lmSchedule();
          return;
        }
        const opt = event.target.closest("input[data-opt]");
        if (opt) {
          const bits = opt.dataset.opt.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.options[Number(bits[2])] = opt.value;
          lmSchedule();
          return;
        }
        const col = event.target.closest("[data-col]");
        if (col) {
          const bits = col.dataset.col.split(":");
          const block = lmBlock(bits[0]);
          if (block && block.columns) block.columns[Number(bits[1])] = col.value;
          lmSchedule();
          return;
        }
        const cell = event.target.closest("[data-cell]");
        if (cell) {
          const bits = cell.dataset.cell.split(":");
          const block = lmBlock(bits[0]);
          const row = block && block.rows && block.rows[Number(bits[1])];
          if (row) row[Number(bits[2])] = cell.value;
          lmSchedule();
          return;
        }
        const response = event.target.closest("[data-response]");
        if (response) { const block = lmBlock(response.dataset.response); if (block) block.response = response.value; lmSchedule(); return; }
        const gradeInput = event.target.closest("[data-teacher-grade-input]");
        if (gradeInput) {
          const block = lmBlock(gradeInput.dataset.teacherGradeInput);
          if (block) {
            const v = parseFloat(gradeInput.value);
            if (!isNaN(v)) block.grade = v;
            lmSchedule();
          }
          return;
        }
        const write = event.target.closest("[data-write]");
        if (write) {
          const bits = write.dataset.write.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.typed = write.value;
          lmSchedule();
          return;
        }
        const gapSlot = event.target.closest("[data-gap-slot]");
        if (gapSlot) {
          const bits = gapSlot.dataset.gapSlot.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            question.given = question.given || {};
            question.given[bits[2]] = gapSlot.value;
            lmSchedule();
          }
          return;
        }
        const rich = event.target.closest("[data-rich]");
        if (rich) { const block = lmBlock(rich.dataset.rich); if (block) block.html = rich.innerHTML; lmSchedule(); }
      });
      lmRoot.addEventListener("change", (event) => {
        const attemptSel = event.target.closest("[data-select-attempt]");
        if (attemptSel) {
          const val = attemptSel.value;
          if (val === 'current') {
            delete lmState.viewingAttemptIndex;
          } else {
            lmState.viewingAttemptIndex = parseInt(val, 10);
          }
          lmRenderPreview();
          return;
        }
        const palette=event.target.closest('[data-lm-color]');
        if(palette){
          const rich=palette.closest('.lm-tools').nextElementSibling,block=lmBlock(palette.dataset.lmColor),range=lmActiveFontRange(rich);
          rich.focus();if(range){const span=document.createElement('span');span.style.color=palette.value;span.append(range.extractContents());range.insertNode(span);range.selectNodeContents(span);const selected=getSelection();selected.removeAllRanges();selected.addRange(range);}
          else{block.textColor=palette.value;rich.style.color=palette.value;}
          block.html=rich.innerHTML;lmSchedule();return;
        }
        const fontSize = event.target.closest("[data-font-size]");
        if (fontSize) {
          const rich = fontSize.closest(".lm-tools") && fontSize.closest(".lm-tools").nextElementSibling;
          const block = lmBlock(fontSize.dataset.fontSize);
          const size = Math.min(96, Math.max(10, Math.round(Number(fontSize.value) || 17)));
          fontSize.value = size;
          lmApplyTextFont(rich, block, { size: size });
          return;
        }
        const fontFamily = event.target.closest("[data-font-family]");
        if (fontFamily) {
          const rich = fontFamily.closest(".lm-tools") && fontFamily.closest(".lm-tools").nextElementSibling;
          const block = lmBlock(fontFamily.dataset.fontFamily);
          lmApplyTextFont(rich, block, { family: fontFamily.value });
          return;
        }
        const importPdf = event.target.closest("[data-lesson-pdf-import-file]");
        if (importPdf && importPdf.files && importPdf.files[0]) { lmImportPdfMeta(importPdf.files[0]); return; }
        const scriptFile = event.target.closest("[data-lesson-script-file]");
        if (scriptFile && scriptFile.files && scriptFile.files[0]) {
          if (typeof lmHandleScriptFileUpload === 'function') lmHandleScriptFileUpload(scriptFile.files[0]);
          return;
        }
        const file = event.target.closest("[data-file], [data-pdf]");
        if (file && file.files && file.files[0]) lmTakeFile(file.dataset.file || file.dataset.pdf, file.files[0]);
        const correct = event.target.closest("[data-correct]");
        if (correct) {
          const bits = correct.dataset.correct.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.answer = Number(bits[2]);
          lmSchedule();
        }
        const selectAns = event.target.closest("[data-select-ans]");
        if (selectAns) {
          const bits = selectAns.dataset.selectAns.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            const oi = Number(bits[2]);
            const answers = Array.isArray(question.answers) ? question.answers.map(Number) : [];
            const at = answers.indexOf(oi);
            if (selectAns.checked && at < 0) answers.push(oi);
            if (!selectAns.checked && at >= 0) answers.splice(at, 1);
            question.answers = answers;
          }
          lmSchedule();
        }
        const gapSelect = event.target.closest("[data-gap-slot]");
        if (gapSelect && gapSelect.tagName === "SELECT") {
          const bits = gapSelect.dataset.gapSlot.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            question.given = question.given || {};
            question.given[bits[2]] = gapSelect.value;
            lmSchedule();
          }
        }
        const pick = event.target.closest("[data-pick]");
        if (pick) {
          const bits = pick.dataset.pick.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            const val = bits[2];
            question.picked = (val === "true" || val === "false") ? val : Number(val);
          }
        }
      });
      lmRoot.addEventListener("click", (event) => {
        if (event.target.closest("#lmTeacherVerifyBtn")) {
          event.preventDefault();
          const chk = document.getElementById("lmTeacherVerifyCheckbox");
          const val = !(chk && chk.checked);
          if (chk) chk.checked = val;
          if (lmState && Array.isArray(lmState.blocks)) {
            lmState.blocks.forEach(b => {
              b.teacherVerified = val;
              if (val) {
                b.collapsed = true;
                b.unfolded = false;
              }
            });
            lmRenderEditor();
            lmSyncTeacherVerifySummary();
            lmSchedule();
          }
          return;
        }
        const tab = event.target.closest("[data-lm-tab]");
        if (tab) { lmSelectTab(tab.getAttribute("data-lm-tab")); return; }
        const tool = event.target.closest("[data-lm-tool]");
        if (tool && tool.getAttribute("data-lm-tool") === "quiz") {
          lmOpenDayQuiz();
          return;
        }
        const areaPick = event.target.closest("[data-lm-area]");
        if (areaPick) {
          lmGrammarArea = areaPick.getAttribute("data-lm-area") || "";
          lmPaintGrammar();
          return;
        }
        const rulePick = event.target.closest("[data-lm-rule]");
        if (rulePick && lmState) {
          const topicId = rulePick.getAttribute("data-lm-rule");
          const compare = rulePick.getAttribute("data-lm-compare") === "1";
          if (!Array.isArray(lmState.blocks)) lmState.blocks = [];
          if (lmState.blocks.some((block) => block.type === "rule" && !!block.compare === compare && block.topic === topicId && (compare || (block.tab || "rules") === "rules"))) {
            lmNote("This rule is already on this page.");
            return;
          }
          const topic = compare ? null : topicById(topicId);
          const named = compare ? (((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((item) => item.id === topicId)[0] || {}).title : (topic && topic.name);
          lmInsertBlockFront({ id: lmId(), type: "rule", tab: "rules", collapsed: false, topic: topicId, compare: compare, name: named || "Rule" });
          lmKeepLesson();
          lmState.ruleCount = (lmState.blocks || []).filter((block) => block.type === "rule").length;
          lmRenderEditor();
          lmNote("Rule added. Click Save draft or Publish.");
          return;
        }
        if (event.target.closest("#lmWordGo")) { lmLookupWord(); return; }
        const fontBtn = event.target.closest("[data-font]");
        if (fontBtn) {
          event.preventDefault();
          const tools = fontBtn.closest(".lm-tools");
          const rich = tools && tools.nextElementSibling;
          const block = rich && lmBlock(rich.dataset.rich);
          if (!block) return;
          const current = lmCurrentTextSize(rich, block);
          const size = fontBtn.dataset.font === "up" ? Math.min(96, current + 2) : Math.max(10, current - 2);
          lmApplyTextFont(rich, block, { size: size });
          const field = tools.querySelector("[data-font-size]");
          if (field) field.value = size;
          return;
        }
        const cmd = event.target.closest("[data-cmd]");
        if (cmd) {
          event.preventDefault();
          const rich = cmd.parentElement && cmd.parentElement.nextElementSibling;
          if (rich) rich.focus();
          if (cmd.dataset.cmd === "link") {
            const href = window.prompt("Link address", "https://");
            if (href && /^https?:\/\//i.test(href)) document.execCommand("createLink", false, href);
          } else document.execCommand(cmd.dataset.cmd, false, null);
          if (rich) { const block = lmBlock(rich.dataset.rich); if (block) block.html = rich.innerHTML; lmSchedule(); }
          return;
        }
        const add = event.target.closest("[data-add-block]");
        if (add) {
          if (add.dataset.addBlock === 'interactive' && (lmState?.examOwned || !['classwork','homework'].includes(lmTab()))) return;
          const block = lmBlank(add.dataset.addBlock, add.dataset.quiz || "");
          if (lmInsertAnchor && lmInsertAnchor.id) {
            const anchorId = domEntityId(lmInsertAnchor.id);
            const anchorIdx = lmState.blocks.findIndex((row) => row.id === anchorId);
            if (anchorIdx >= 0) {
              const insertIdx = lmInsertAnchor.pos === "after" ? anchorIdx + 1 : anchorIdx;
              lmState.blocks.splice(insertIdx, 0, block);
            } else {
              lmState.blocks.push(block);
            }
          } else {
            lmState.blocks.push(block);
          }
          lmInsertAnchor = null;
          lmLastAddedBlockId = block.id;
          const picker = document.getElementById("lmPicker");
          if (picker) {
            picker.hidden = true;
            picker.classList.remove("is-floating");
          }
          lmRenderEditor();
          lmSchedule();
          const made = lmRoot.querySelector('[data-block-id="' + block.id + '"]');
          if (made) {
            made.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = made.querySelector("input[type=text], textarea, .lm-rich");
            if (input) input.focus();
          }
          return;
        }
        const insertBtn = event.target.closest(".lm-insert-btn");
        if (insertBtn) {
          event.preventDefault();
          const targetBefore = insertBtn.dataset.lmInsertBefore;
          const targetAfter = insertBtn.dataset.lmInsertAfter;
          const targetId = domEntityId(targetBefore || targetAfter);
          lmOpenPicker({ id: targetId, pos: targetBefore ? "before" : "after" }, true);
          return;
        }
        const insertAbove = event.target.closest("[data-lm-insert-above]");
        if (insertAbove) {
          event.preventDefault();
          const targetId = domEntityId(insertAbove.dataset.lmInsertAbove);
          lmRoot.querySelectorAll(".lm-pop").forEach((item) => { item.hidden = true; });
          lmOpenPicker({ id: targetId, pos: "before" }, true);
          return;
        }
        const insertBelow = event.target.closest("[data-lm-insert-below]");
        if (insertBelow) {
          event.preventDefault();
          const targetId = domEntityId(insertBelow.dataset.lmInsertBelow);
          lmRoot.querySelectorAll(".lm-pop").forEach((item) => { item.hidden = true; });
          lmOpenPicker({ id: targetId, pos: "after" }, true);
          return;
        }
        const pickerClose = event.target.closest("[data-lm-picker-close]");
        if (pickerClose) {
          event.preventDefault();
          const picker = document.getElementById("lmPicker");
          if (picker) {
            picker.hidden = true;
            picker.classList.remove("is-floating");
          }
          return;
        }
        if (event.target.closest("#lmApproveAllBlocksBtn")) {
          event.preventDefault();
          if (lmState && Array.isArray(lmState.blocks)) {
            lmState.blocks.forEach(b => {
              b.teacherVerified = true;
              b.collapsed = true;
              b.unfolded = false;
            });
            lmRenderEditor();
            lmSyncTeacherVerifySummary();
            lmSchedule();
          }
          return;
        }
        const fold = event.target.closest("[data-lm-fold]");
        if (fold) {
          const block = lmBlock(fold.dataset.lmFold);
          if (block) {
            const isCurrentlyShut = block.teacherVerified ? !block.unfolded : Boolean(block.collapsed);
            if (block.teacherVerified) {
              block.unfolded = isCurrentlyShut;
              block.collapsed = !isCurrentlyShut;
            } else {
              block.collapsed = !isCurrentlyShut;
            }
          }
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const edit = event.target.closest("[data-lm-edit]");
        if (edit) {
          const block = lmBlock(edit.dataset.lmEdit);
          if (block) {
            block.collapsed = false;
            block.unfolded = true;
          }
          lmRenderEditor();
          const made = lmRoot.querySelector('[data-block-id="' + edit.dataset.lmEdit + '"] input, [data-block-id="' + edit.dataset.lmEdit + '"] .lm-rich');
          if (made) made.focus();
          return;
        }
        const menu = event.target.closest("[data-lm-menu]");
        if (menu) {
          const pop = lmRoot.querySelector('[data-pop="' + menu.dataset.lmMenu + '"]');
          lmRoot.querySelectorAll(".lm-pop").forEach((item) => { if (item !== pop) item.hidden = true; });
          if (pop) pop.hidden = !pop.hidden;
          return;
        }
        const top = event.target.closest("[data-lm-top]");
        if (top) { lmMoveTabBlockToEdge(top.dataset.lmTop, true); lmRenderEditor(); lmSchedule(); return; }
        const bottom = event.target.closest("[data-lm-bottom]");
        if (bottom) { lmMoveTabBlockToEdge(bottom.dataset.lmBottom, false); lmRenderEditor(); lmSchedule(); return; }
        const up = event.target.closest("[data-lm-up]");
        if (up) { lmMoveTabBlock(up.dataset.lmUp, -1); lmRenderEditor(); lmSchedule(); return; }
        const down = event.target.closest("[data-lm-down]");
        if (down) { lmMoveTabBlock(down.dataset.lmDown, 1); lmRenderEditor(); lmSchedule(); return; }
        const del = event.target.closest("[data-lm-del]");
        if (del) {
          const id = domEntityId(del.dataset.lmDel);
          lmState.blocks = lmState.blocks.filter((row) => row.id !== id);
          if (Array.isArray(lmState.stageBlockOrder)) lmState.stageBlockOrder = lmState.stageBlockOrder.filter((row) => row !== id);
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const cardAdd = event.target.closest("[data-card-add]");
        if (cardAdd) { const block = lmBlock(cardAdd.dataset.cardAdd); if (block) block.items.push({ front: "", back: "", example: "" }); lmRenderEditor(); lmSchedule(); return; }
        const cardDel = event.target.closest("[data-card-del]");
        if (cardDel) { const bits = cardDel.dataset.cardDel.split(":"); const block = lmBlock(bits[0]); if (block) block.items.splice(Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const cardUp = event.target.closest("[data-card-up]");
        if (cardUp) { const bits = cardUp.dataset.cardUp.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(block.items, Number(bits[1]), -1); lmRenderEditor(); lmSchedule(); return; }
        const cardDown = event.target.closest("[data-card-down]");
        if (cardDown) { const bits = cardDown.dataset.cardDown.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(block.items, Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const itemAdd = event.target.closest("[data-item-add]");
        if (itemAdd) {
          const bits = itemAdd.dataset.itemAdd.split(":");
          const block = lmBlock(bits[0]);
          if (block) {
            const kind = bits[1];
            if (kind === "quiz") lmList(block, "items").push(lmNewItem("quiz", lmQuizType(block)));
            else lmList(block, kind === "dialogue" ? "lines" : "items").push(lmNewItem(kind));
          }
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const itemDel = event.target.closest("[data-item-del]");
        if (itemDel) { const bits = itemDel.dataset.itemDel.split(":"); const block = lmBlock(bits[0]); if (block) lmList(block, bits[1]).splice(Number(bits[2]), 1); lmRenderEditor(); lmSchedule(); return; }
        const itemUp = event.target.closest("[data-item-up]");
        if (itemUp) { const bits = itemUp.dataset.itemUp.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(lmList(block, bits[1]), Number(bits[2]), -1); lmRenderEditor(); lmSchedule(); return; }
        const itemDown = event.target.closest("[data-item-down]");
        if (itemDown) { const bits = itemDown.dataset.itemDown.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(lmList(block, bits[1]), Number(bits[2]), 1); lmRenderEditor(); lmSchedule(); return; }
        const optAdd = event.target.closest("[data-opt-add]");
        if (optAdd) {
          const bits = optAdd.dataset.optAdd.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.options.push("");
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const colAdd = event.target.closest("[data-col-add]");
        if (colAdd) { const block = lmBlock(colAdd.dataset.colAdd); if (block) { block.columns.push(""); block.rows.forEach((row) => row.push("")); } lmRenderEditor(); lmSchedule(); return; }
        const colDel = event.target.closest("[data-col-del]");
        if (colDel) { const block = lmBlock(colDel.dataset.colDel); if (block && block.columns.length > 1) { block.columns.pop(); block.rows.forEach((row) => row.pop()); } lmRenderEditor(); lmSchedule(); return; }
        const rowAdd = event.target.closest("[data-row-add]");
        if (rowAdd) { const block = lmBlock(rowAdd.dataset.rowAdd); if (block) block.rows.push(block.columns.map(() => "")); lmRenderEditor(); lmSchedule(); return; }
        const rowDel = event.target.closest("[data-row-del]");
        if (rowDel) { const bits = rowDel.dataset.rowDel.split(":"); const block = lmBlock(bits[0]); if (block) block.rows.splice(Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const readWord = event.target.closest("[data-read]");
        if (readWord) {
          const bits = readWord.dataset.read.split(":");
          const block = lmBlock(bits[0]);
          if (block) {
            const index = Number(bits[1]);
            block.marks = block.marks || [];
            const at = block.marks.indexOf(index);
            if (at >= 0) block.marks.splice(at, 1);
            else block.marks.push(index);
            readWord.classList.toggle("is-on", at < 0);
            lmSchedule();
          }
          return;
        }
        const exCheck = event.target.closest("[data-ex-check]");
        if (exCheck) {
          const block = lmBlock(exCheck.dataset.exCheck);
          if (block) (block.items || []).forEach((question) => {
            question.marked = true;
            if (question.kind === "text_gaps") {
              const gaps = parseGapsFromText(question.text || "");
              const given = question.given || {};
              const penalties = question.penalties || {};
              let correctCount = 0;
              let earnedScore = 0;
              for (const g of gaps) {
                const s = String(given[g.index] || "").trim().toLowerCase();
                const t = String(g.target || "").trim().toLowerCase();
                const firstChar = String(g.hint || "").trim().toLowerCase();
                const isDirectMatch = s === t || (Array.isArray(g.alternatives) && g.alternatives.some(a => String(a).trim().toLowerCase() === s));
                const isPrefixedMatch = Boolean(firstChar) && ((firstChar + s) === t || (Array.isArray(g.alternatives) && g.alternatives.some(a => (firstChar + s) === String(a).trim().toLowerCase())));
                if (isDirectMatch || isPrefixedMatch) {
                  correctCount++;
                  const pen = Number(penalties[g.index] || 0);
                  earnedScore += Math.max(0, 1 - pen);
                }
              }
              question.correct = gaps.length > 0 && correctCount === gaps.length;
              question.score = earnedScore.toFixed(earnedScore % 1 ? 2 : 0) + " / " + gaps.length + " points (" + correctCount + "/" + gaps.length + " correct)";
            } else {
              question.correct = question.kind === "write" ? String(question.typed || "").trim().toLowerCase() === String(question.write || "").trim().toLowerCase() : Number(question.picked) === Number(question.answer);
            }
          });
          lmRenderPreview();
          lmSchedule();
          return;
        }
        const gapReset = event.target.closest("[data-gap-reset]");
        if (gapReset) {
          const block = lmBlock(gapReset.dataset.gapReset);
          if (block) (block.items || []).forEach((question) => {
            if (question.kind === "text_gaps") {
              question.given = {};
              question.marked = false;
              question.hintsLevel = {};
              question.penalties = {};
              delete question.score;
              delete question.correct;
            }
          });
          lmRenderPreview();
          lmSchedule();
          return;
        }
        const gapHintBtn = event.target.closest("[data-gap-hint]");
        if (gapHintBtn) {
          const [blockId, itemIdx, slotIdx] = gapHintBtn.dataset.gapHint.split(":");
          const block = lmBlock(blockId);
          const question = block && block.items && block.items[Number(itemIdx)];
          if (question) {
            question.hintsLevel = question.hintsLevel || {};
            question.penalties = question.penalties || {};
            const gaps = parseGapsFromText(question.text || "");
            const gap = gaps.find(g => String(g.index) === String(slotIdx));
            const maxHints = (gap && gap.hints && gap.hints.length) ? gap.hints.length : 1;
            const cur = Number(question.hintsLevel[slotIdx] || 0);
            const nextLvl = (cur >= maxHints) ? 0 : cur + 1;
            question.hintsLevel[slotIdx] = nextLvl;
            question.penalties[slotIdx] = nextLvl * 0.25;
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const gapPlayBtn = event.target.closest("[data-gap-play]");
        if (gapPlayBtn) {
          gapPlayBtn.textContent = gapPlayBtn.textContent.includes("▶") ? "⏸" : "▶";
          return;
        }
        const gapZoomBtn = event.target.closest("[data-gap-zoom]");
        if (gapZoomBtn) {
          const card = gapZoomBtn.closest(".gap-visual-card");
          if (card) card.classList.toggle("is-zoomed");
          return;
        }
        const gapTimeBtn = event.target.closest("[data-gap-time]");
        if (gapTimeBtn) {
          const card = gapTimeBtn.closest(".gap-card")?.querySelector(".gap-audio-card");
          if (card) {
            const fill = card.querySelector(".gap-progress-fill");
            if (fill) fill.style.width = "45%";
            const playBtn = card.querySelector(".gap-play-btn");
            if (playBtn) playBtn.textContent = "⏸";
          }
          return;
        }
        const aiOpenBtn = event.target.closest("[data-open-gaps-ai]");
        if (aiOpenBtn) {
          const [blockId, itemIdx] = aiOpenBtn.dataset.openGapsAi.split(":");
          lmOpenGapsAiModal(blockId, Number(itemIdx));
          return;
        }
        const chip = event.target.closest("[data-gap-word]");
        if (chip && !chip.classList.contains("is-used")) {
          const [blockId, itemIdx] = chip.dataset.gapTarget.split(":");
          const block = lmBlock(blockId);
          const question = block && block.items && block.items[Number(itemIdx)];
          if (question) {
            const word = chip.dataset.gapWord;
            question.given = question.given || {};
            const gaps = parseGapsFromText(question.text || "");
            const emptyGap = gaps.find(g => !question.given[g.index]);
            if (emptyGap) {
              question.given[emptyGap.index] = word;
              lmRenderPreview();
              lmSchedule();
            }
          }
          return;
        }
        const gapClear = event.target.closest("[data-gap-clear]");
        if (gapClear) {
          const [blockId, itemIdx, slotIdx] = gapClear.dataset.gapClear.split(":");
          const block = lmBlock(blockId);
          const question = block && block.items && block.items[Number(itemIdx)];
          if (question && question.given && question.given[slotIdx]) {
            delete question.given[slotIdx];
            lmRenderPreview();
            lmSchedule();
            return;
          }
        }
        const pick = event.target.closest("[data-pick]");
        if (pick) {
          const bits = pick.dataset.pick.split(":");
          const block = lmBlock(bits[0]);
          if (block && (block.submitted || block.checked)) {
            event.preventDefault();
            return;
          }
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            const val = bits[2];
            question.picked = (val === "true" || val === "false") ? val : Number(val);
            const optLabel = pick.closest("label.lm-opt");
            if (optLabel) {
              const optsContainer = optLabel.parentElement;
              if (optsContainer) {
                optsContainer.querySelectorAll("label.lm-opt").forEach((lbl) => lbl.classList.remove("is-selected"));
                optLabel.classList.add("is-selected");
              }
            }
            if (block.quizType === "True / false") {
              lmRenderPreview();
              lmSchedule();
            }
          }
          return;
        }
        const submitTask = event.target.closest("[data-submit-task], [data-submit-answer]");
        if (submitTask) {
          const id = submitTask.dataset.submitTask || submitTask.dataset.submitAnswer;
          const block = lmBlock(id);
          if (block) {
            block.submitted = true;
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const sendTeacher = event.target.closest("[data-send-teacher]");
        if (sendTeacher) {
          const block = lmBlock(sendTeacher.dataset.sendTeacher);
          if (block) {
            const defaultNote = "Teacher, please review my answer for Task: " + (block.title || block.type);
            const studentNote = (typeof window.prompt === 'function') ? window.prompt("Enter an optional note for your teacher:", defaultNote) : defaultNote;
            if (studentNote !== null) {
              block.teacherReviewRequested = true;
              const lessonTitle = lmState?.title || "Lesson";
              const studentName = authUser?.name || "Student";
              const chatText = "⚠️ [Important Review Request] " + studentName + " requests teacher review for \"" + (block.title || block.type) + "\" in " + lessonTitle + ".\nNote: " + (studentNote || "No note provided");
              if (typeof window.sendGroupChatMessage === 'function') {
                const groupId = lmState?.groupId || (typeof currentGroupId === 'function' ? currentGroupId() : null);
                window.sendGroupChatMessage(groupId, chatText, { category: 'important', alert: true }).catch(() => {});
              }
              if (typeof feedbackNotice === 'function') {
                feedbackNotice("Review request sent to teacher in Study Alerts chat!");
              }
              lmRenderPreview();
              lmSchedule();
            }
          }
          return;
        }
        const runSelfCheck = event.target.closest("[data-run-self-check]");
        if (runSelfCheck) {
          const tab = runSelfCheck.dataset.runSelfCheck;
          (lmState.blocks || []).forEach(block => {
            const isTab = (block.tab === tab) || (!block.tab && tab === 'classwork');
            if (isTab && ['quiz', 'exercise', 'task'].includes(block.type)) {
              block.submitted = true;
              block.checked = true;
              if (block.type === 'quiz') {
                const isTf = block.quizType === "True / false";
                const score = (block.items || []).reduce((sum, question) => {
                  const ok = isTf ? String(question.picked).toLowerCase() === String(question.answer).toLowerCase() : Number(question.picked) === Number(question.answer);
                  question.marked = true; question.correct = ok;
                  return sum + (ok ? 1 : 0);
                }, 0);
                block.score = score + " / " + (block.items || []).length;
              } else if (block.type === 'exercise') {
                (block.items || []).forEach(it => {
                  it.marked = true;
                  if (it.kind === 'text_gaps') {
                    const gaps = typeof parseGapsFromText === 'function' ? parseGapsFromText(it.text || '') : [];
                    const given = it.given || {};
                    const correctCount = gaps.filter(g => String(given[g.index] || '').trim().toLowerCase() === String(g.target || '').trim().toLowerCase()).length;
                    it.correct = correctCount === gaps.length;
                  }
                });
              } else if (block.type === 'task') {
                if (!block.aiFeedback) {
                  block.aiFeedback = "AI Evaluation: Good effort. The response addresses the prompt topic and outlines practical steps.";
                  block.suggestedScore = Math.min(Number(block.weight) || 5, Math.max(3, Math.round((Number(block.weight) || 5) * 0.8)));
                }
              }
            }
          });
          lmRenderPreview();
          lmSchedule();
          return;
        }
        const approveBtn = event.target.closest("[data-approve-grade]");
        if (approveBtn) {
          const id = approveBtn.dataset.approveGrade;
          const block = lmBlock(id);
          if (block) {
            const inp = lmRoot.querySelector('[data-teacher-grade-input="' + id + '"]');
            const val = inp ? parseFloat(inp.value) : (Number(block.weight) || 5);
            block.grade = isNaN(val) ? 0 : val;
            block.teacherVerified = true;
            block.submitted = true;
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const aiBtn = event.target.closest("[data-ai-eval]");
        if (aiBtn) {
          const id = aiBtn.dataset.aiEval;
          const block = lmBlock(id);
          if (block) {
            const max = Number(block.weight) || Number(block.maxPoints) || 5;
            const resp = String(block.response || '').trim();
            if (!resp) {
              block.aiFeedback = "AI Evaluation: No response entered yet. Please write an action plan to evaluate.";
            } else {
              const suggested = Math.min(max, Math.max(1, Math.round(max * 0.8)));
              block.suggestedScore = suggested;
              block.grade = suggested;
              block.teacherVerified = true;
              block.submitted = true;
              block.aiFeedback = "AI Evaluation: Clear actionable plan with relevant vocabulary. Suggested score: " + suggested + " / " + max + " pts.";
            }
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const rubricBtn = event.target.closest("[data-rubric-criterion]");
        if (rubricBtn) {
          const blockId = rubricBtn.dataset.rubricBlock;
          const crit = rubricBtn.dataset.rubricCriterion;
          const score = parseInt(rubricBtn.dataset.rubricScore, 10);
          const block = lmBlock(blockId);
          if (block) {
            block.rubricCriteria = block.rubricCriteria || { grammar: 2, vocabulary: 1, task: 1 };
            block.rubricCriteria[crit] = score;
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const saveRubricBtn = event.target.closest("[data-save-rubric-grade]");
        if (saveRubricBtn) {
          const id = saveRubricBtn.dataset.saveRubricGrade;
          const block = lmBlock(id);
          if (block) {
            const rc = block.rubricCriteria || { grammar: 2, vocabulary: 1, task: 1 };
            const total = (Number(rc.grammar) || 0) + (Number(rc.vocabulary) || 0) + (Number(rc.task) || 0);
            block.grade = total;
            block.teacherVerified = true;
            block.submitted = true;
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const aiRubricBtn = event.target.closest("[data-ai-rubric-analysis]");
        if (aiRubricBtn) {
          const id = aiRubricBtn.dataset.aiRubricAnalysis;
          const block = lmBlock(id);
          if (block) {
            block.rubricCriteria = { grammar: 2, vocabulary: 2, task: 1 };
            block.grade = 5;
            block.teacherVerified = true;
            block.submitted = true;
            block.speechMetrics = { wpm: 118, fluency: 92 };
            block.inlineCorrections = [
              { id: 'c1', original: 'less mistakes', replacement: 'fewer mistakes', category: 'grammar', note: 'Countable noun "mistakes" requires quantifier "fewer" rather than "less".', accepted: false, isOpen: false },
              { id: 'c2', original: 'make better', replacement: 'enhance', category: 'vocab', note: 'Higher register academic verb "enhance" provides greater precision.', accepted: false, isOpen: false }
            ];
            block.aiFeedback = "AI Criteria Evaluation: Strong task achievement with clear actionable milestones (1/1 pt). Grammar accuracy demonstrated accurate modal verb structures (2/2 pts). Vocabulary range shows appropriate collocations (2/2 pts). Total: 5/5 pts.";
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const acceptBtn = event.target.closest("[data-accept-correction]");
        if (acceptBtn) {
          const parts = acceptBtn.dataset.acceptCorrection.split(':');
          const block = lmBlock(parts[0]);
          if (block && Array.isArray(block.inlineCorrections)) {
            const cor = block.inlineCorrections.find(c => String(c.id) === String(parts[1]));
            if (cor && !cor.accepted) {
              cor.accepted = true;
              cor.isOpen = false;
              if (block.response && cor.original && cor.replacement) {
                block.response = block.response.replace(cor.original, cor.replacement);
              }
              lmRenderPreview();
              lmSchedule();
            }
          }
          return;
        }
        const corSpan = event.target.closest("[data-correction-id]");
        if (corSpan) {
          const parts = corSpan.dataset.correctionId.split(':');
          const block = lmBlock(parts[0]);
          if (block && Array.isArray(block.inlineCorrections)) {
            const cor = block.inlineCorrections.find(c => String(c.id) === String(parts[1]));
            if (cor) {
              cor.isOpen = !cor.isOpen;
              lmRenderPreview();
            }
          }
          return;
        }
        const toggleOrigBtn = event.target.closest("[data-toggle-original]");
        if (toggleOrigBtn) {
          const id = toggleOrigBtn.dataset.toggleOriginal;
          const block = lmBlock(id);
          if (block) {
            block.showOriginalView = !block.showOriginalView;
            lmRenderPreview();
          }
          return;
        }
        const voiceBtn = event.target.closest("[data-voice-dictate]");
        if (voiceBtn) {
          const id = voiceBtn.dataset.voiceDictate;
          const block = lmBlock(id);
          if (block) {
            block.isRecordingVoice = true;
            block.recordingDuration = 14;
            lmRenderPreview();
          }
          return;
        }
        const voiceStopBtn = event.target.closest("[data-voice-stop]");
        if (voiceStopBtn) {
          const id = voiceStopBtn.dataset.voiceStop;
          const block = lmBlock(id);
          if (block) {
            block.isRecordingVoice = false;
            const transcribed = "I will dedicate 25 minutes every morning to active vocabulary recall with flashcards and shadow native speaker podcasts to eliminate less mistakes and make better pronunciation.";
            block.response = block.response ? (block.response + " " + transcribed) : transcribed;
            block.speechMetrics = { wpm: 118, fluency: 92 };
            lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const voiceCancelBtn = event.target.closest("[data-voice-cancel]");
        if (voiceCancelBtn) {
          const id = voiceCancelBtn.dataset.voiceCancel;
          const block = lmBlock(id);
          if (block) {
            block.isRecordingVoice = false;
            lmRenderPreview();
          }
          return;
        }
        const returnAttemptBtn = event.target.closest("[data-return-latest-attempt]");
        if (returnAttemptBtn) {
          delete lmState.viewingAttemptIndex;
          lmRenderPreview();
          return;
        }
        const openPdfReportBtn = event.target.closest("[data-open-pdf-certificate]");
        if (openPdfReportBtn) {
          lmState.showPdfModal = true;
          lmRenderPreview();
          return;
        }
        const closePdfModalBtn = event.target.closest("[data-close-pdf-modal]");
        if (closePdfModalBtn) {
          lmState.showPdfModal = false;
          lmRenderPreview();
          return;
        }
        const printPdfReportBtn = event.target.closest("[data-print-pdf-certificate]");
        if (printPdfReportBtn) {
          if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print();
          }
          return;
        }
        const retakeBtn = event.target.closest("[data-retake-lesson]");
        if (retakeBtn) {
          const evalData = calculateLessonEvaluation(lmState);
          const snapshot = {
            number: (lmState.attempts?.length || 0) + 1,
            date: Date.now(),
            totalEarned: evalData.totalEarned,
            totalMax: evalData.totalMax,
            scorePct: evalData.scorePct,
            tasks: (evalData.tasks || []).map(t => ({ id: t.id, title: t.title, earned: t.earned, max: t.max }))
          };
          lmState.attempts = lmState.attempts || [];
          lmState.attempts.push(snapshot);

          (lmState.blocks || []).forEach(b => {
            b.submitted = false;
            b.checked = false;
            b.teacherVerified = false;
            b.teacherReviewRequested = false;
            if (b.type === 'task') {
              b.response = '';
              b.grade = null;
              b.aiFeedback = null;
              b.suggestedScore = null;
            } else if (b.type === 'quiz') {
              b.score = null;
              (b.items || []).forEach(q => {
                q.picked = undefined;
                q.marked = false;
                q.correct = undefined;
              });
            } else if (b.type === 'exercise') {
              (b.items || []).forEach(it => {
                it.typed = '';
                it.given = {};
                it.marked = false;
                it.correct = undefined;
              });
            }
          });

          lmRenderPreview();
          lmSchedule();
          return;
        }
        const quizCheck = event.target.closest("[data-quiz-check]");
        if (quizCheck) {
          const block = lmBlock(quizCheck.dataset.quizCheck);
          if (block) {
            const isTf = block.quizType === "True / false";
            const score = block.items.reduce((sum, question) => {
              const ok = isTf
                ? String(question.picked).toLowerCase() === String(question.answer).toLowerCase()
                : Number(question.picked) === Number(question.answer);
              if (isTf) { question.marked = true; question.correct = ok; }
              return sum + (ok ? 1 : 0);
            }, 0);
            block.score = score + " / " + block.items.length;
            const out = lmRoot.querySelector('[data-quiz-score="' + block.id + '"]');
            if (out) out.textContent = "Score: " + block.score;
            if (isTf) lmRenderPreview();
            lmSchedule();
          }
          return;
        }
        const clearFile = event.target.closest("[data-file-clear], [data-pdf-clear]");
        if (clearFile) { lmClearFile(clearFile.dataset.fileClear || clearFile.dataset.pdfClear); return; }
        const openPdfBtn = event.target.closest("[data-pdf-open], [data-file-open]");
        if (openPdfBtn) {
          const id = openPdfBtn.dataset.pdfOpen || openPdfBtn.dataset.fileOpen;
          const block = lmBlock(id);
          const title = block && (block.title || block.name);
          const external = lmExternalFile(block);
          if (external) { window.open(external, "_blank", "noopener,noreferrer"); return; }
          const openStored = async () => {
            const href = await lmResolveFile(id);
            if (!href) {
              const msg = document.createElement("p");
              msg.className = "lm-pdf-msg";
              msg.textContent = block && block.sample
                ? "This sample shows the block. Drop a real file in the editor to open it."
                : "This file is not on the server yet. Open the editor and drop it again.";
              const holder = openPdfBtn.parentElement;
              const old = holder.querySelector(".lm-pdf-msg");
              if (old) old.remove();
              holder.appendChild(msg);
              return;
            }
            if (openPdfBtn.dataset.pdfOpen) openPdf(href, title);
            else {
              const link = document.createElement("a");
              link.href = href;
              link.download = (block && block.name) || "file";
              link.click();
            }
          };
          openStored();
          return;
        }
        if (!event.target.closest(".lm-pop") && !event.target.closest("[data-lm-menu]")) lmRoot.querySelectorAll(".lm-pop").forEach((item) => { item.hidden = true; });
        if (!event.target.closest(".lm-picker") && !event.target.closest(".lm-add") && !event.target.closest(".lm-insert-btn") && !event.target.closest("[data-lm-insert-above]") && !event.target.closest("[data-lm-insert-below]")) {
          const picker = document.getElementById("lmPicker");
          if (picker) {
            picker.hidden = true;
            picker.classList.remove("is-floating");
          }
        }
      });
      lmRoot.addEventListener("dragstart", (event) => {
        const chip = event.target.closest("[data-gap-word], [data-gap-chip-move]");
        if (chip) {
          const isBankChip = chip.hasAttribute("data-gap-word");
          const word = isBankChip ? chip.dataset.gapWord : chip.innerText.replace("✕", "").replace("⠿", "").trim();
          const origin = isBankChip ? ("bank:" + chip.dataset.gapTarget) : ("slot:" + chip.dataset.gapChipMove);
          event.dataTransfer.setData("application/x-gap-chip", JSON.stringify({ word, origin }));
          event.dataTransfer.effectAllowed = "move";
          chip.classList.add("is-dragging");
          return;
        }
        const block = event.target.closest(".lm-block");
        if (!block || !block.getAttribute("draggable")) return;
        event.dataTransfer.setData("text/plain", block.dataset.blockId);
      });
      lmRoot.addEventListener("dragover", (event) => {
        const gapDrop = event.target.closest("[data-gap-drop], [data-gap-chip-move], .word-bank-box");
        if (gapDrop) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          gapDrop.classList.add("is-drop-active");
          return;
        }
        if (event.target.closest(".lm-block") || event.target.closest(".lm-drop")) event.preventDefault();
        const over = event.target.closest(".lm-block");
        lmRoot.querySelectorAll(".lm-block").forEach((item) => item.classList.toggle("is-over", item === over && event.target.closest("[data-grip], .lm-block") && !event.target.closest(".lm-drop")));
      });
      lmRoot.addEventListener("dragleave", (event) => {
        const gapDrop = event.target.closest("[data-gap-drop], [data-gap-chip-move], .word-bank-box");
        if (gapDrop && !gapDrop.contains(event.relatedTarget)) {
          gapDrop.classList.remove("is-drop-active");
        }
      });
      lmRoot.addEventListener("drop", (event) => {
        const gapRaw = event.dataTransfer.getData("application/x-gap-chip");
        if (gapRaw) {
          event.preventDefault();
          let data;
          try { data = JSON.parse(gapRaw); } catch { return; }
          const dropTarget = event.target.closest("[data-gap-drop], [data-gap-chip-move], .word-bank-box");
          if (dropTarget && data && data.word) {
            dropTarget.classList.remove("is-drop-active");
            if (dropTarget.hasAttribute("data-gap-drop") || dropTarget.hasAttribute("data-gap-chip-move")) {
              const attr = dropTarget.dataset.gapDrop || dropTarget.dataset.gapChipMove;
              const [blockId, itemIdx, slotIdx] = attr.split(":");
              const block = lmBlock(blockId);
              const question = block && block.items && block.items[Number(itemIdx)];
              if (question) {
                question.given = question.given || {};
                if (data.origin && data.origin.startsWith("slot:")) {
                  const [, oBlockId, oItemIdx, oSlotIdx] = data.origin.split(":");
                  if (oBlockId === blockId && Number(oItemIdx) === Number(itemIdx)) {
                    delete question.given[oSlotIdx];
                  }
                }
                question.given[slotIdx] = data.word;
                lmRenderPreview();
                lmSchedule();
              }
            } else if (dropTarget.closest(".word-bank-box") && data.origin && data.origin.startsWith("slot:")) {
              const [, oBlockId, oItemIdx, oSlotIdx] = data.origin.split(":");
              const block = lmBlock(oBlockId);
              const question = block && block.items && block.items[Number(oItemIdx)];
              if (question && question.given && question.given[oSlotIdx]) {
                delete question.given[oSlotIdx];
                lmRenderPreview();
                lmSchedule();
              }
            }
          }
          return;
        }
        const drop = event.target.closest(".lm-drop");
        if (drop) {
          const file = event.dataTransfer.files && event.dataTransfer.files[0];
          if (drop.hasAttribute("data-lesson-script-drop") && file) {
            event.preventDefault();
            if (typeof lmHandleScriptFileUpload === 'function') lmHandleScriptFileUpload(file);
            return;
          }
          if (drop.hasAttribute("data-lesson-pdf-import") && file) { event.preventDefault(); lmImportPdfMeta(file); return; }
          const input = drop.querySelector("[data-file], [data-pdf]");
          if (input && file) { event.preventDefault(); lmTakeFile(input.dataset.file || input.dataset.pdf, file); }
          return;
        }
        const scriptBox = event.target.closest("#lmScriptBox");
        if (scriptBox && event.dataTransfer.files && event.dataTransfer.files[0]) {
          event.preventDefault();
          if (typeof lmHandleScriptFileUpload === 'function') lmHandleScriptFileUpload(event.dataTransfer.files[0]);
          return;
        }
        const block = event.target.closest(".lm-block");
        const from = event.dataTransfer.getData("text/plain");
        if (!block || !from) return;
        event.preventDefault();
        const list = lmState.blocks;
        const source = list.findIndex((row) => row.id === domEntityId(from));
        const target = list.findIndex((row) => row.id === domEntityId(block.dataset.blockId));
        if (source < 0 || target < 0 || source === target) return;
        const item = list.splice(source, 1)[0];
        list.splice(target, 0, item);
        lmRenderEditor();
        lmSchedule();
      });
      lmRoot.addEventListener("dragend", () => {
        lmRoot.querySelectorAll(".is-dragging").forEach((el) => el.classList.remove("is-dragging"));
        lmRoot.querySelectorAll(".is-drop-active").forEach((el) => el.classList.remove("is-drop-active"));
        lmRoot.querySelectorAll(".lm-block").forEach((item) => { item.classList.remove("is-over"); item.removeAttribute("draggable"); });
      });
      lmRoot.addEventListener("pointerdown", (event) => {
        const grip = event.target.closest("[data-grip]");
        const block = grip && grip.closest(".lm-block");
        if (block) block.setAttribute("draggable", "true");
      });
      lmRoot.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const input = event.target.closest("#lmWordInput");
        if (!input) return;
        event.preventDefault();
        lmLookupWord();
      });
      document.addEventListener("toggle", (event) => {
        const accordion = event.target.closest(".lm-verified-accordion");
        if (accordion && lmState) {
          lmState.verifiedAccordionOpen = accordion.open;
          const textEl = accordion.querySelector(".lm-verified-expand-text");
          if (textEl) {
            const countPill = accordion.querySelector(".lm-verified-count-pill");
            const countText = countPill ? countPill.textContent : "items";
            textEl.textContent = (accordion.open ? "Click to collapse " : "Click to expand ") + countText;
          }
        }
      }, true);
      document.getElementById("lmAdd").addEventListener("click", () => {
        lmOpenPicker(null, false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          const picker = document.getElementById("lmPicker");
          if (picker && !picker.hidden) {
            picker.hidden = true;
            picker.classList.remove("is-floating");
          }
        }
      });
      document.getElementById("lmPreviewBtn").addEventListener("click", () => { lmShow("preview"); lmPersist(); });
      document.getElementById("lmEditBack").addEventListener("click", () => { if (canEditLessons()) lmShow("edit"); });
      document.getElementById("lmSave").addEventListener("click", () => { if (!canEditLessons() || document.getElementById("lmSave")?.disabled) return; lmState.published = false; lmState.mode = "edit"; lmKeepLesson(); lmPersist(); if (typeof lmMarkDraftSaved === "function") lmMarkDraftSaved(); lmRenderEditor(); lmNote(lmState && lmState.examOwned ? "Draft saved." : "Draft saved. The lesson is in Classes."); });
      document.getElementById("lmPublish").addEventListener("click", () => {
        if (!canEditLessons()) return;
        if (!lmState?.examOwned) {
          const reviewable = (lmState && Array.isArray(lmState.blocks)) ? lmState.blocks.filter(b => b.type !== 'divider') : [];
          if (!reviewable.length || reviewable.some(b => !b.teacherVerified)) {
            lmNote("Cannot publish: verify all lesson materials and quizzes first. You can only save as draft.");
            return;
          }
        }
        lmSortWordcardsForPublish();
        lmState.published = true;
        lmState.mode = "preview";
        lmKeepLesson();
        lmPersist();
        if (typeof lmMarkDraftSaved === "function") lmMarkDraftSaved();
        lmNote("");
        lmShow("preview");
      });
      const LM_ALL_QUIZ_TYPES = [
        "Choice",
        "Gap",
        "Text with Gaps",
        "Type",
        "Definition",
        "Odd one out",
        "Select all",
        "Reverse",
        "Build",
        "Match",
        "True / false",
        "Tap",
        "Pronounce",
        "Listen",
        "Spell",
        "Smart Flashcard",
        "Flip",
        "Letters",
        "Memory",
        "Hangman",
        "Video choice"
      ];

      function lmSyncLessonComplementTab() {
        if (typeof document === "undefined") return;
        const lessonTabBtn = document.getElementById("lmTabBtnLesson");
        const titleEl = document.getElementById("lmCurrentLessonTitle");
        const statsEl = document.getElementById("lmCurrentLessonStats");
        const appendBadge = document.getElementById("lmAppendModeBadge");
        const appendTitle = document.getElementById("lmAppendModeLessonTitle");
        const appendStats = document.getElementById("lmAppendModeLessonStats");

        const hasExisting = Boolean(
          typeof window.lmHasExistingLesson === "function"
            ? window.lmHasExistingLesson(lmState)
            : (lmState && ((Array.isArray(lmState.blocks) && lmState.blocks.length > 0) || lmState.title || lmState.description || lmState.id))
        );

        if (appendBadge) {
          if (hasExisting) {
            appendBadge.style.display = "flex";
            if (appendTitle) appendTitle.textContent = lmState.title || "Untitled Lesson";
            if (appendStats) {
              const bCount = (lmState.blocks || []).length;
              appendStats.textContent = bCount + " block" + (bCount === 1 ? "" : "s") + (lmState.published ? " · Published" : " · Draft");
            }
          } else {
            appendBadge.style.display = "none";
          }
        }

        if (lessonTabBtn) {
          if (hasExisting) {
            lessonTabBtn.hidden = false;
            if (titleEl) titleEl.textContent = lmState.title || "Untitled Lesson";
            if (statsEl) {
              const bCount = (lmState.blocks || []).length;
              statsEl.textContent = bCount + " block" + (bCount === 1 ? "" : "s") + " active";
            }
          } else {
            lessonTabBtn.hidden = true;
            if (lessonTabBtn.classList.contains("active")) {
              lmSwitchImportTab("file");
            }
          }
        }
      }

      function lmSwitchImportTab(tabKey) {
        if (typeof document === "undefined") return;
        const tabs = [
          { key: "file", btnId: "lmTabBtnFile", paneId: "lmTabPaneFile" },
          { key: "url", btnId: "lmTabBtnUrl", paneId: "lmTabPaneUrl" },
          { key: "script", btnId: "lmTabBtnScript", paneId: "lmTabPaneScript" },
          { key: "lesson", btnId: "lmTabBtnLesson", paneId: "lmTabPaneLesson" }
        ];

        tabs.forEach((t) => {
          const btn = document.getElementById(t.btnId);
          const pane = document.getElementById(t.paneId);
          const isActive = t.key === tabKey;
          if (btn) {
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
          }
          if (pane) {
            pane.style.display = isActive ? "block" : "none";
            pane.classList.toggle("active", isActive);
          }
        });
      }

      function lmInitImportTabs() {
        if (typeof document === "undefined") return;
        const tabBtns = [
          { btnId: "lmTabBtnFile", key: "file" },
          { btnId: "lmTabBtnUrl", key: "url" },
          { btnId: "lmTabBtnScript", key: "script" },
          { btnId: "lmTabBtnLesson", key: "lesson" }
        ];

        tabBtns.forEach(({ btnId, key }) => {
          const btn = document.getElementById(btnId);
          if (btn && !btn.dataset.initialized) {
            btn.dataset.initialized = "1";
            btn.addEventListener("click", () => lmSwitchImportTab(key));
          }
        });

        // Quick template buttons inside Manual Script
        const templateBtns = document.querySelectorAll(".lm-template-pill");
        templateBtns.forEach((tb) => {
          if (!tb.dataset.initialized) {
            tb.dataset.initialized = "1";
            tb.addEventListener("click", () => {
              const input = document.getElementById("lmScriptInput");
              if (!input) return;
              const type = tb.dataset.template;
              let snippet = "";
              if (type === "rule") {
                snippet = "\nRule: Relative clauses with who, which, that, where, whose\nExamples: The teacher who inspired me. ~ Учитель, который вдохновил меня.\n";
              } else if (type === "vocab") {
                snippet = "\nWords: defining clause - определительное придаточное, relative pronoun - относительное местоимение, antecedent - антецедент\n";
              } else if (type === "dialogue") {
                snippet = "\nDialogue:\nA: Do you know the woman who just arrived?\nB: Yes, that is the engineer whose project won first place.\n";
              } else if (type === "gaps") {
                snippet = "\nText with gaps:\nLast summer we [1:went|hint:w] to the coastal town of Brighton and [2:bought|stem:BUY] some souvenirs. The weather was [3:pleasant|hint1:adjective|hint2:agreeable] and everyone felt [4:relaxed|stem:RELAX].\n";
              }
              input.value = (input.value ? input.value.trim() + "\n" : "") + snippet.trim();
              const scriptBtn = document.getElementById("lmGenerateFromScriptBtn");
              if (scriptBtn) scriptBtn.disabled = !input.value.trim();
              input.focus();
            });
          }
        });

        // Dynamic disabled state synchronization for URL and Script inputs
        const urlInput = document.getElementById("lmUrlInput");
        const urlBtn = document.getElementById("lmUrlFetchBtn");
        if (urlInput && urlBtn) {
          const syncUrlBtn = () => { urlBtn.disabled = !urlInput.value.trim(); };
          if (!urlInput.dataset.initialized) {
            urlInput.dataset.initialized = "1";
            urlInput.addEventListener("input", syncUrlBtn);
          }
          syncUrlBtn();
        }

        const scriptInput = document.getElementById("lmScriptInput");
        const scriptBtn = document.getElementById("lmGenerateFromScriptBtn");
        if (scriptInput && scriptBtn) {
          const syncScriptBtn = () => { scriptBtn.disabled = !scriptInput.value.trim(); };
          if (!scriptInput.dataset.initialized) {
            scriptInput.dataset.initialized = "1";
            scriptInput.addEventListener("input", syncScriptBtn);
          }
          syncScriptBtn();
        }

        // Generate tasks button inside Complement Current Lesson
        const genTasksBtn = document.getElementById("lmGenerateTasksBtn");
        if (genTasksBtn && !genTasksBtn.dataset.initialized) {
          genTasksBtn.dataset.initialized = "1";
          genTasksBtn.addEventListener("click", () => {
            lmGenerateComplementTasks();
          });
        }

        const undoBtn = document.getElementById("lmUndoGenerationBtn");
        if (undoBtn && !undoBtn.dataset.initialized) {
          undoBtn.dataset.initialized = "1";
          undoBtn.addEventListener("click", () => {
            lmUndoLastGeneration();
          });
        }
      }

      let lmLastGenerationSnapshot = null;

      function lmSetLastGenerationSnapshot(ids) {
        if (Array.isArray(ids) && ids.length) {
          lmLastGenerationSnapshot = { blockIds: ids, timestamp: Date.now() };
        }
      }
      window.lmSetLastGenerationSnapshot = lmSetLastGenerationSnapshot;

      function lmShowTabProgress(tabKey, label, percent) {
        if (typeof document === "undefined") return;
        const wrapId = tabKey === "lesson" ? "lmComplementProgressWrap" : (tabKey === "file" ? "lmFileProgressWrap" : (tabKey === "url" ? "lmUrlProgressWrap" : "lmScriptProgressWrap"));
        const textId = tabKey === "lesson" ? "lmComplementProgressText" : (tabKey === "file" ? "lmFileProgressText" : (tabKey === "url" ? "lmUrlProgressText" : "lmScriptProgressText"));
        const barId = tabKey === "lesson" ? "lmComplementProgressBar" : (tabKey === "file" ? "lmFileProgressBar" : (tabKey === "url" ? "lmUrlProgressBar" : "lmScriptProgressBar"));
        const pctId = tabKey === "lesson" ? "lmComplementProgressPercent" : (tabKey === "file" ? "lmFileProgressPercent" : (tabKey === "url" ? "lmUrlProgressPercent" : "lmScriptProgressPercent"));

        const wrap = document.getElementById(wrapId);
        const text = document.getElementById(textId);
        const bar = document.getElementById(barId);
        const pct = document.getElementById(pctId);

        if (wrap) wrap.style.display = "block";
        if (text && label) text.textContent = label;
        if (pct && Number.isFinite(percent)) pct.textContent = Math.round(percent) + "%";
        if (bar && Number.isFinite(percent)) {
          bar.style.width = Math.min(100, Math.max(0, percent)) + "%";
          if (percent >= 100) bar.classList.add("is-done");
          else bar.classList.remove("is-done");
        }
      }

      function lmHideTabProgress(tabKey) {
        if (typeof document === "undefined") return;
        const wrapId = tabKey === "lesson" ? "lmComplementProgressWrap" : (tabKey === "file" ? "lmFileProgressWrap" : (tabKey === "url" ? "lmUrlProgressWrap" : "lmScriptProgressWrap"));
        const wrap = document.getElementById(wrapId);
        if (wrap) wrap.style.display = "none";
      }

      const THEMATIC_VOCABULARY_BANKS = {
        superstitions: {
          words: [
            { word: "superstition", meaning: "суеверие, предрассудок", example: "Many traditions are based on superstition.", expressionType: "WORD" },
            { word: "bad omen", meaning: "дурной знак", example: "A black cat is considered a bad omen in some cultures.", expressionType: "WORD" },
            { word: "lucky charm", meaning: "талисман на удачу", example: "She carries a lucky charm in her bag.", expressionType: "WORD" },
            { word: "coincidence", meaning: "совпадение", example: "Meeting you here was a pure coincidence.", expressionType: "WORD" },
            { word: "premonition", meaning: "предчувствие", example: "He had a strong premonition before the journey.", expressionType: "WORD" },
            { word: "fortune", meaning: "удача, судьба", example: "Good fortune smiled upon our family.", expressionType: "WORD" },
            { word: "destiny", meaning: "предначертание, судьба", example: "She believed it was her destiny to succeed.", expressionType: "WORD" },
            { word: "myth", meaning: "миф, легенда", example: "The superstition is just a popular myth.", expressionType: "WORD" },
            { word: "amulet", meaning: "амулет, оберег", example: "An amulet was worn to guard against harm.", expressionType: "WORD" },
            { word: "talisman", meaning: "талисман", example: "The ring was cherished as a sacred talisman.", expressionType: "WORD" }
          ],
          phrasalVerbs: [
            { word: "believe in", meaning: "верить в", example: "Do you believe in superstitions?", expressionType: "PHRASAL_VERB" },
            { word: "ward off", meaning: "отгонять, предотвращать (зло)", example: "Charms were worn to ward off evil.", expressionType: "PHRASAL_VERB" },
            { word: "look out for", meaning: "высматривать, остерегаться", example: "Look out for bad omens on Friday the 13th.", expressionType: "PHRASAL_VERB" },
            { word: "pass down", meaning: "передавать по наследству", example: "These rituals were passed down through generations.", expressionType: "PHRASAL_VERB" },
            { word: "rely on", meaning: "полагаться на", example: "Never rely on pure luck alone.", expressionType: "PHRASAL_VERB" },
            { word: "watch out", meaning: "быть начеку, остерегаться", example: "Watch out for black cats crossing your path.", expressionType: "PHRASAL_VERB" },
            { word: "come across", meaning: "случайно натолкнуться", example: "I came across an ancient lucky coin.", expressionType: "PHRASAL_VERB" },
            { word: "figure out", meaning: "разобраться, выяснить", example: "We tried to figure out where the myth originated.", expressionType: "PHRASAL_VERB" }
          ],
          idioms: [
            { word: "knock on wood", meaning: "постучать по дереву, чтобы не сглазить", example: "Everything is going well, knock on wood.", expressionType: "IDIOM" },
            { word: "cross one's fingers", meaning: "скрестить пальцы на удачу", example: "Keep your fingers crossed during the test.", expressionType: "IDIOM" },
            { word: "luck of the draw", meaning: "воля случая, как фишка ляжет", example: "Winning the prize was just the luck of the draw.", expressionType: "IDIOM" },
            { word: "touch and go", meaning: "на волоске, рискованно", example: "The match outcome was touch and go until the end.", expressionType: "IDIOM" },
            { word: "break a leg", meaning: "ни пуха ни пера (пожелание удачи)", example: "They shouted 'break a leg!' before she stepped on stage.", expressionType: "IDIOM" },
            { word: "once in a blue moon", meaning: "крайне редко, в кои-то веки", example: "Such rare events occur once in a blue moon.", expressionType: "IDIOM" },
            { word: "touch wood", meaning: "постучать по дереву", example: "Touch wood, we have had no accidents so far.", expressionType: "IDIOM" }
          ],
          collocations: [
            { word: "bring bad luck", meaning: "приносить неудачу", example: "Opening an umbrella indoors brings bad luck.", expressionType: "COLLOCATION" },
            { word: "break a mirror", meaning: "разбить зеркало", example: "Breaking a mirror is said to bring seven years of bad luck.", expressionType: "COLLOCATION" },
            { word: "spill salt", meaning: "просыпать соль", example: "If you spill salt, throw a pinch over your shoulder.", expressionType: "COLLOCATION" },
            { word: "walk under a ladder", meaning: "пройти под лестницей", example: "He refused to walk under a ladder.", expressionType: "COLLOCATION" },
            { word: "open umbrella indoors", meaning: "раскрыть зонт в помещении", example: "Never open an umbrella indoors according to superstition.", expressionType: "COLLOCATION" },
            { word: "make a wish", meaning: "загадать желание", example: "Make a wish when blowing out birthday candles.", expressionType: "COLLOCATION" }
          ]
        }
      };

      function lmFindWordMeaning(targetWord) {
        if (!targetWord) return "";
        const tw = String(targetWord).toLowerCase().trim();
        if (typeof lmState !== "undefined" && Array.isArray(lmState?.blocks)) {
          for (const b of lmState.blocks) {
            if ((b.type === "wordcard" || b.type === "word") && String(b.word || "").toLowerCase().trim() === tw) {
              const m = b.ru || b.translation || b.meaning || b.data?.ru;
              if (m) return m;
            }
            if (b.type === "vocab" && Array.isArray(b.items)) {
              const found = b.items.find(it => String(it.word || "").toLowerCase().trim() === tw);
              if (found && (found.translation || found.meaning || found.ru)) return found.translation || found.meaning || found.ru;
            }
          }
        }
        if (typeof THEMATIC_VOCABULARY_BANKS !== "undefined") {
          for (const bank of Object.values(THEMATIC_VOCABULARY_BANKS)) {
            for (const cat of ["words", "phrasalVerbs", "idioms", "collocations"]) {
              const found = (bank[cat] || []).find(it => String(it.word || "").toLowerCase().trim() === tw);
              if (found && found.meaning) return found.meaning;
            }
          }
        }
        return "";
      }

      function lmFindWordExample(targetWord) {
        if (!targetWord) return "";
        const tw = String(targetWord).toLowerCase().trim();
        if (typeof lmState !== "undefined" && Array.isArray(lmState?.blocks)) {
          for (const b of lmState.blocks) {
            if ((b.type === "wordcard" || b.type === "word") && String(b.word || "").toLowerCase().trim() === tw) {
              const ex = b.example || b.sourceExample || b.data?.example;
              if (ex && ex.toLowerCase().includes(tw)) return ex;
            }
          }
        }
        if (typeof THEMATIC_VOCABULARY_BANKS !== "undefined") {
          for (const bank of Object.values(THEMATIC_VOCABULARY_BANKS)) {
            for (const cat of ["words", "phrasalVerbs", "idioms", "collocations"]) {
              const found = (bank[cat] || []).find(it => String(it.word || "").toLowerCase().trim() === tw);
              if (found && found.example && found.example.toLowerCase().includes(tw)) return found.example;
            }
          }
        }
        return "";
      }

      function lmSynthesizeLevelSentence(word, meaning, level) {
        const lvl = String(level || "B1").toUpperCase();
        const w = String(word || "").trim();
        if (lvl === "A1" || lvl === "A2") {
          return "She always keeps a special " + w + " for good luck.";
        }
        if (lvl === "B1" || lvl === "B1+") {
          return "Many ancient cultural traditions and beliefs are based on " + w + ".";
        }
        if (lvl === "B2" || lvl === "B2+") {
          return "Researchers studied how ancient " + w + " continues to influence people today.";
        }
        return "Scholars have long debated the psychological and cultural origins of this " + w + ".";
      }

      function lmGetThematicExpansionPool(themeText, neededCount) {
        const text = String(themeText || '').toLowerCase();
        const bank = THEMATIC_VOCABULARY_BANKS.superstitions;
        const list = [];
        const words = bank.words || [];
        const phrasals = bank.phrasalVerbs || [];
        const idioms = bank.idioms || [];
        const colls = bank.collocations || [];
        const maxLen = Math.max(words.length, phrasals.length, idioms.length, colls.length);

        for (let i = 0; i < maxLen; i++) {
          if (words[i]) list.push({ ...words[i], supplementary: true });
          if (phrasals[i]) list.push({ ...phrasals[i], supplementary: true });
          if (idioms[i]) list.push({ ...idioms[i], supplementary: true });
          if (colls[i]) list.push({ ...colls[i], supplementary: true });
        }
        return list;
      }

      function lmExtractLessonVocabularyPool(lesson, targetTotal = 30) {
        if (!lesson || !Array.isArray(lesson.blocks)) return [];
        const pool = [];
        const seen = new Set();
        lesson.blocks.forEach((b) => {
          if (b.type === "wordcard" || b.type === "word") {
            const word = String(b.word || b.en || "").trim();
            const meaning = String(b.ru || b.data?.ru || b.pdfVocabulary?.meaning || b.translation || b.meaning || word).trim();
            let example = String(b.example || b.sourceExample || (b.data?.example) || "").trim();
            if (!example && typeof lmFindWordExample === "function") example = lmFindWordExample(word);
            if (word && !seen.has(word.toLowerCase())) {
              seen.add(word.toLowerCase());
              pool.push({ word, meaning, example, isCore: !b.supplementary, supplementary: Boolean(b.supplementary), expressionType: b.expressionType || "WORD" });
            }
          } else if (b.type === "vocab" || b.tab === "words") {
            if (Array.isArray(b.items)) {
              b.items.forEach((it) => {
                const w = String(it.word || "").trim();
                const m = String(it.translation || it.meaning || it.ru || w).trim();
                let ex = it.example || "";
                if (!ex && typeof lmFindWordExample === "function") ex = lmFindWordExample(w);
                if (w && !seen.has(w.toLowerCase())) {
                  seen.add(w.toLowerCase());
                  pool.push({ word: w, meaning: m, example: ex, isCore: true });
                }
              });
            } else if (b.word) {
              const w = String(b.word).trim();
              const m = String(b.translation || b.ru || b.meaning || w).trim();
              let ex = b.example || "";
              if (!ex && typeof lmFindWordExample === "function") ex = lmFindWordExample(w);
              if (w && !seen.has(w.toLowerCase())) {
                seen.add(w.toLowerCase());
                pool.push({ word: w, meaning: m, example: ex, isCore: true });
              }
            }
          } else if (b.type === "phrase" || b.tab === "phrases") {
            if (Array.isArray(b.items)) {
              b.items.forEach((it) => {
                const p = String(it.phrase || "").trim();
                const m = String(it.translation || it.meaning || it.ru || p).trim();
                let ex = it.example || "";
                if (!ex && typeof lmFindWordExample === "function") ex = lmFindWordExample(p);
                if (p && !seen.has(p.toLowerCase())) {
                  seen.add(p.toLowerCase());
                  pool.push({ word: p, meaning: m, example: ex, isCore: true, expressionType: "COLLOCATION" });
                }
              });
            }
          } else if (b.type === "cards" && Array.isArray(b.items)) {
            b.items.forEach((it) => {
              const f = String(it.front || "").trim();
              const bk = String(it.back || f).trim();
              let ex = it.example || "";
              if (!ex && typeof lmFindWordExample === "function") ex = lmFindWordExample(f);
              if (f && !seen.has(f.toLowerCase())) {
                seen.add(f.toLowerCase());
                pool.push({ word: f, meaning: bk, example: ex, isCore: true });
              }
            });
          }
        });

        // Expand pool with thematic words, phrasal verbs, idioms, and collocations
        const themeContext = [lesson.title, lesson.description].filter(Boolean).join(" ");
        const expansionCandidates = lmGetThematicExpansionPool(themeContext, Math.max(30, targetTotal));
        for (const item of expansionCandidates) {
          if (pool.length >= Math.max(30, targetTotal)) break;
          const k = String(item.word || "").toLowerCase().trim();
          if (k && !seen.has(k)) {
            seen.add(k);
            pool.push({
              word: item.word,
              meaning: item.meaning,
              example: item.example || "",
              supplementary: true,
              expressionType: item.expressionType || "WORD"
            });
          }
        }
        return pool;
      }

      function lmEnsureWordsInLesson(wordsToAdd) {
        if (!lmState || !Array.isArray(lmState.blocks) || !Array.isArray(wordsToAdd) || !wordsToAdd.length) return [];
        const existingWords = new Set();
        lmState.blocks.forEach((b) => {
          if (b.type === "wordcard" || b.type === "word") {
            const w = String(b.word || b.en || "").trim().toLowerCase();
            if (w) existingWords.add(w);
          } else if (b.tab === "words" && Array.isArray(b.items)) {
            b.items.forEach((it) => {
              if (it.word) existingWords.add(String(it.word).trim().toLowerCase());
            });
          }
        });

        const createdWordBlocks = [];
        const itemsToInsert = [];
        wordsToAdd.forEach((item) => {
          const w = String(item.word || "").trim();
          if (!w || existingWords.has(w.toLowerCase())) return;
          existingWords.add(w.toLowerCase());
          itemsToInsert.push(item);
        });

        if (itemsToInsert.length > 0) {
          // If inserting supplementary items, ensure a visual divider separates them from primary words
          const hasDivider = lmState.blocks.some((b) => b.tab === "words" && (b.type === "divider" || b.isSupplementaryDivider));
          if (!hasDivider) {
            const divider = {
              id: lmId(),
              type: "divider",
              tab: "words",
              label: "✨ Supplementary Material (Generated)",
              isSupplementaryDivider: true
            };
            createdWordBlocks.push(divider);
            lmState.blocks.push(divider);
          }

          itemsToInsert.forEach((item) => {
            const w = String(item.word || "").trim();
            const newCard = {
              id: lmId(),
              type: "wordcard",
              tab: "words",
              collapsed: false,
              word: w,
              en: w,
              ru: item.meaning || w,
              example: item.example || ("Example using " + w + "."),
              supplementary: true,
              expressionType: item.expressionType || "WORD"
            };
            createdWordBlocks.push(newCard);
            lmState.blocks.push(newCard);
          });
        }
        return createdWordBlocks;
      }

      function lmEnsurePhrasesInLesson(phrasesToAdd) {
        if (!lmState || !Array.isArray(lmState.blocks) || !Array.isArray(phrasesToAdd) || !phrasesToAdd.length) return [];
        const existingPhrases = new Set();
        lmState.blocks.forEach((b) => {
          if (b.type === "phrase" && Array.isArray(b.items)) {
            b.items.forEach((it) => {
              if (it.phrase) existingPhrases.add(String(it.phrase).trim().toLowerCase());
            });
          } else if (b.tab === "phrases" && (b.type === "wordcard" || b.type === "word")) {
            const w = String(b.word || b.en || "").trim().toLowerCase();
            if (w) existingPhrases.add(w);
          }
        });

        const createdPhraseBlocks = [];
        const itemsToInsert = [];
        phrasesToAdd.forEach((item) => {
          const p = String(item.phrase || item.word || "").trim();
          if (!p || existingPhrases.has(p.toLowerCase())) return;
          existingPhrases.add(p.toLowerCase());
          itemsToInsert.push(item);
        });

        if (itemsToInsert.length > 0) {
          itemsToInsert.forEach((item) => {
            const p = String(item.phrase || item.word || "").trim();
            const meaning = String(item.meaning || item.translation || item.ru || p).trim();
            const example = String(item.example || ("Example using " + p + ".")).trim();
            const phraseBlock = {
              id: lmId(),
              type: "phrase",
              tab: "phrases",
              title: p,
              items: [{
                phrase: p,
                meaning: meaning,
                example: example
              }]
            };
            createdPhraseBlocks.push(phraseBlock);
            lmState.blocks.push(phraseBlock);
          });
        }
        return createdPhraseBlocks;
      }

      function lmEnsureRulesInLesson(rulesToAdd) {
        if (!lmState || !Array.isArray(lmState.blocks) || !Array.isArray(rulesToAdd) || !rulesToAdd.length) return [];
        const existingRules = new Set();
        lmState.blocks.forEach((b) => {
          if (b.type === "rule" || b.tab === "rules") {
            const t = String(b.title || b.name || "").trim().toLowerCase();
            if (t) existingRules.add(t);
          }
        });

        const createdRuleBlocks = [];
        rulesToAdd.forEach((item) => {
          const t = String(item.title || item.name || item.rule || "").trim();
          if (!t || existingRules.has(t.toLowerCase())) return;
          existingRules.add(t.toLowerCase());
          const ruleBlock = {
            id: lmId(),
            type: "rule",
            tab: "rules",
            title: t,
            name: t,
            explanation: item.explanation || item.ru || item.meaning || "",
            pattern: item.pattern || "",
            examples: Array.isArray(item.examples) ? item.examples : (item.example ? [item.example] : [])
          };
          createdRuleBlocks.push(ruleBlock);
          lmState.blocks.push(ruleBlock);
        });
        return createdRuleBlocks;
      }

      async function lmGenerateComplementTasks() {
        if (!lmState || !canEditLessons()) return;
        const counts = lmGetTaskCounts();
        const selectedTypes = lmGetSelectedQuizTypes();
        const activeTypes = selectedTypes.length > 0 ? selectedTypes : ["Match"];
        const genBtn = document.getElementById("lmGenerateTasksBtn");
        const undoWrap = document.getElementById("lmUndoGenerationWrap");
        const undoCountEl = document.getElementById("lmUndoCount");

        const totalToGenerate = Math.min(30, Math.max(1, counts.total));
        if (totalToGenerate <= 0) return;

        if (genBtn) {
          genBtn.disabled = true;
          genBtn.innerHTML = '<span class="lm-spin">⚙️</span> Generating ' + totalToGenerate + ' Tasks...';
        }
        if (undoWrap) undoWrap.style.display = "none";

        lmShowTabProgress("lesson", "Extracting vocabulary and analyzing lesson context...", 20);
        await new Promise((r) => setTimeout(r, 200));

        const vocabPool = lmExtractLessonVocabularyPool(lmState, Math.max(30, totalToGenerate * 2));
        lmShowTabProgress("lesson", "Generating " + totalToGenerate + " tasks distributed across selected quiz types...", 50);
        await new Promise((r) => setTimeout(r, 250));

        const sectionsToFill = [];
        if (counts.cw > 0) sectionsToFill.push({ tab: "classwork", count: counts.cw });
        if (counts.hw > 0) sectionsToFill.push({ tab: "homework", count: counts.hw });
        if (!sectionsToFill.length) sectionsToFill.push({ tab: "homework", count: totalToGenerate });

        const createdTaskBlocks = [];
        const wordsUsedInTasks = [];

        sectionsToFill.forEach((sec) => {
          const isHw = sec.tab === "homework";
          const countForSec = Math.min(totalToGenerate, sec.count);

          // Track existing exercises in this specific section to prevent duplicate cards
          const existingTasksInSec = new Set();
          (lmState.blocks || []).forEach((b) => {
            if (b.tab === sec.tab) {
              const qType = b.quizType || (b.type === "quiz" ? "Quiz" : b.type);
              const target = String(b.targetWord || b.items?.[0]?.word || b.items?.[0]?.answer || b.items?.[0]?.left || b.title || "").toLowerCase().trim();
              if (target) existingTasksInSec.add((qType + "::" + target).toLowerCase());
              if (b.title) existingTasksInSec.add(String(b.title).toLowerCase().trim());
            }
          });

          let poolCursor = 0;
          for (let i = 0; i < countForSec; i++) {
            const quizType = activeTypes[(createdTaskBlocks.length) % activeTypes.length] || "Match";

            // Find an unused targetObj from vocabPool for this quizType in this section
            let targetObj = null;
            let attempts = 0;
            while (attempts < vocabPool.length) {
              const candidate = vocabPool[(poolCursor + attempts) % vocabPool.length];
              const sig = (quizType + "::" + candidate.word).toLowerCase();
              if (!existingTasksInSec.has(sig)) {
                targetObj = candidate;
                poolCursor = (poolCursor + attempts + 1) % vocabPool.length;
                break;
              }
              attempts++;
            }
            if (!targetObj) {
              targetObj = vocabPool[(poolCursor++) % vocabPool.length] || { word: "vocabulary", meaning: "словарь" };
            }

            existingTasksInSec.add((quizType + "::" + targetObj.word).toLowerCase());
            wordsUsedInTasks.push(targetObj);

            if (quizType === "Match") {
              const matchSet = [];
              let mAttempts = 0;
              while (matchSet.length < 3 && mAttempts < vocabPool.length) {
                const cand = vocabPool[(poolCursor + mAttempts) % vocabPool.length];
                if (cand && !matchSet.some((m) => m.word.toLowerCase() === cand.word.toLowerCase())) {
                  matchSet.push(cand);
                }
                mAttempts++;
              }
              poolCursor = (poolCursor + mAttempts) % vocabPool.length;
              const pairs = matchSet.length >= 2 ? matchSet : [targetObj, vocabPool[0], vocabPool[1]].filter(Boolean);
              pairs.forEach((p) => wordsUsedInTasks.push(p));

              const matchTitle = (isHw ? "HW Match: " : "CW Match: ") + (lmState.title || "Lesson") + " (" + pairs.map((p) => p.word).slice(0, 2).join(", ") + ")";
              existingTasksInSec.add(matchTitle.toLowerCase().trim());

              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: matchTitle,
                quizType: "Match",
                items: pairs.map((p) => ({ left: p.word, right: p.meaning })),
                pdfTeacherNotes: "Match each English term with its Russian meaning."
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Choice") {
              const d1 = vocabPool[(poolCursor + 1) % vocabPool.length]?.meaning || "Alternative meaning";
              const d2 = vocabPool[(poolCursor + 2) % vocabPool.length]?.meaning || "Opposite meaning";
              const blockTitle = (isHw ? "HW Choice: " : "CW Choice: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());

              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Choice",
                items: [{
                  prompt: "Select the meaning of \"" + targetObj.word + "\":",
                  options: [targetObj.meaning, d1, d2],
                  answer: 0
                }],
                pdfTeacherNotes: targetObj.word + " matches: " + targetObj.meaning
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Gap") {
              const blockTitle = (isHw ? "HW Gap: " : "CW Gap: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const level = (typeof lmDetectLevel === "function" ? lmDetectLevel(lmState?.className || lmState?.title) : "") || "B1";
              let sentence = targetObj.example || lmFindWordExample(targetObj.word);
              if (!sentence || !sentence.toLowerCase().includes(targetObj.word.toLowerCase())) {
                sentence = lmSynthesizeLevelSentence(targetObj.word, targetObj.meaning, level);
              }
              const escWord = targetObj.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              let shownSentence = sentence.replace(new RegExp("\\b" + escWord + "\\b", "gi"), "___");
              if (!shownSentence.includes("___")) {
                shownSentence = sentence.replace(new RegExp(escWord, "i"), "___");
              }

              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Gap",
                items: [{
                  shown: shownSentence,
                  answer: targetObj.word,
                  hint: "First letter: " + (targetObj.word[0] || "")
                }]
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "True / false") {
              const isTruthful = (createdTaskBlocks.length % 2 === 0);
              const word = targetObj.word;
              const meaning = targetObj.meaning || lmFindWordMeaning(word) || word;
              let example = targetObj.example || lmFindWordExample(word);
              const level = (typeof lmDetectLevel === "function" ? lmDetectLevel(lmState?.className || lmState?.title) : "") || "B1";
              if (!example || !example.toLowerCase().includes(word.toLowerCase())) {
                example = lmSynthesizeLevelSentence(word, meaning, level);
              }
              let statement = "";
              let note = "";
              if (isTruthful) {
                if (example && example.toLowerCase().includes(word.toLowerCase())) {
                  statement = 'In the context "' + example + '", the word "' + word + '" translates as "' + meaning + '".';
                } else {
                  statement = 'The word "' + word + '" correctly translates to Russian as "' + meaning + '".';
                }
                note = 'Statement is TRUE: "' + word + '" means "' + meaning + '".';
              } else {
                const distractor = vocabPool.find((v) => v.word.toLowerCase() !== word.toLowerCase() && v.meaning !== meaning) || { word: "experiment", meaning: "научный эксперимент" };
                if (example && example.toLowerCase().includes(word.toLowerCase())) {
                  statement = 'In the context "' + example + '", the word "' + word + '" translates as "' + distractor.meaning + '".';
                } else {
                  statement = 'The word "' + word + '" translates to Russian as "' + distractor.meaning + '".';
                }
                note = 'Statement is FALSE: "' + word + '" means "' + meaning + '", not "' + distractor.meaning + '".';
              }
              const blockTitle = (isHw ? "HW True / false: " : "CW True / false: ") + word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: word,
                quizType: "True / false",
                items: [{
                  prompt: statement,
                  answer: isTruthful ? "true" : "false"
                }],
                pdfTeacherNotes: note
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Type") {
              const blockTitle = (isHw ? "HW Type: " : "CW Type: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Type",
                items: [{
                  prompt: "Type the English word for: \"" + targetObj.meaning + "\"",
                  answer: targetObj.word
                }],
                pdfTeacherNotes: "Answer: " + targetObj.word
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Definition") {
              const d1 = vocabPool[(poolCursor + 1) % vocabPool.length]?.word || "alternative";
              const d2 = vocabPool[(poolCursor + 2) % vocabPool.length]?.word || "opposite";
              const blockTitle = (isHw ? "HW Definition: " : "CW Definition: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Definition",
                items: [{
                  prompt: "Select the word that matches the meaning: \"" + targetObj.meaning + (targetObj.example ? ' (' + targetObj.example + ')' : '') + "\"",
                  word: targetObj.word,
                  options: [targetObj.word, d1, d2],
                  answer: 0
                }],
                pdfTeacherNotes: targetObj.word + ": " + targetObj.meaning
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Odd one out") {
              const related1 = targetObj.word;
              const related2 = vocabPool[(poolCursor + 1) % vocabPool.length]?.word || "custom";
              const related3 = vocabPool[(poolCursor + 2) % vocabPool.length]?.word || "tradition";
              const oddWords = ["microwave", "refrigerator", "algebra", "telescope", "submarine"];
              const oddWord = oddWords[createdTaskBlocks.length % oddWords.length];
              const options = [related1, related2, oddWord, related3];
              const blockTitle = (isHw ? "HW Odd one out: " : "CW Odd one out: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Odd one out",
                items: [{
                  prompt: "Choose the odd one out that does not fit the lesson topic:",
                  options: options,
                  answer: 2
                }],
                pdfTeacherNotes: "Odd word: " + oddWord
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Select all") {
              const rel1 = targetObj.word;
              const rel2 = vocabPool[(poolCursor + 1) % vocabPool.length]?.word || "context";
              const unrel1 = "gravity";
              const unrel2 = "calculation";
              const options = [rel1, unrel1, rel2, unrel2];
              const blockTitle = (isHw ? "HW Select all: " : "CW Select all: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Select all",
                items: [{
                  prompt: "Select all terms related to the current lesson context:",
                  options: options,
                  answers: [0, 2]
                }],
                pdfTeacherNotes: "Correct options: " + rel1 + ", " + rel2
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Build") {
              const sentence = targetObj.example || ("We learned the word " + targetObj.word + " today.");
              const words = sentence.replace(/[.,!?;:]/g, '').trim().split(/\s+/);
              const shuffledParts = [...words].sort(() => Math.random() - 0.5).join(" ");
              const cleanAnswer = words.join(" ");
              const blockTitle = (isHw ? "HW Build: " : "CW Build: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Build",
                items: [{
                  parts: shuffledParts,
                  answer: cleanAnswer
                }],
                pdfTeacherNotes: "Assemble sentence: " + cleanAnswer
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Tap") {
              const sentence = targetObj.example || ("People often mention " + targetObj.word + " in conversation.");
              const blockTitle = (isHw ? "HW Tap: " : "CW Tap: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Tap",
                items: [{
                  text: sentence,
                  answer: targetObj.word
                }],
                pdfTeacherNotes: "Tap the target word: " + targetObj.word
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Reverse") {
              const blockTitle = (isHw ? "HW Reverse: " : "CW Reverse: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Reverse",
                items: [{
                  front: targetObj.meaning,
                  back: targetObj.word
                }],
                pdfTeacherNotes: targetObj.meaning + " -> " + targetObj.word
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Flip") {
              const blockTitle = (isHw ? "HW Flip: " : "CW Flip: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Flip",
                items: [{
                  front: targetObj.word,
                  back: targetObj.meaning
                }],
                pdfTeacherNotes: targetObj.word + " -> " + targetObj.meaning
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Smart Flashcard") {
              const blockTitle = (isHw ? "HW Flashcard: " : "CW Flashcard: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Smart Flashcard",
                items: [{
                  front: targetObj.word,
                  back: targetObj.meaning,
                  example: targetObj.example || ("Usage: " + targetObj.word)
                }],
                pdfTeacherNotes: targetObj.word + " · " + targetObj.meaning
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Memory") {
              const matchSet = [];
              let mAttempts = 0;
              while (matchSet.length < 4 && mAttempts < vocabPool.length) {
                const cand = vocabPool[(poolCursor + mAttempts) % vocabPool.length];
                if (cand && !matchSet.some((m) => m.word.toLowerCase() === cand.word.toLowerCase())) {
                  matchSet.push(cand);
                }
                mAttempts++;
              }
              poolCursor = (poolCursor + mAttempts) % vocabPool.length;
              const pairs = matchSet.length >= 2 ? matchSet : [targetObj, vocabPool[0], vocabPool[1]].filter(Boolean);
              const blockTitle = (isHw ? "HW Memory: " : "CW Memory: ") + (lmState.title || "Lesson") + " (" + pairs.map((p) => p.word).slice(0, 2).join(", ") + ")";
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                quizType: "Memory",
                memorySize: pairs.length,
                items: pairs.map((p) => ({ left: p.word, right: p.meaning })),
                pdfTeacherNotes: "Memory match: " + pairs.map((p) => p.word).join(", ")
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Listen") {
              const blockTitle = (isHw ? "HW Listen: " : "CW Listen: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Listen",
                items: [{
                  prompt: "Listen to the pronunciation and spell the word:",
                  word: targetObj.word,
                  answer: targetObj.word
                }],
                pdfTeacherNotes: "Target word: " + targetObj.word
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Pronounce") {
              const blockTitle = (isHw ? "HW Pronounce: " : "CW Pronounce: ") + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: "Pronounce",
                items: [{
                  prompt: "Say: \"" + targetObj.word + "\"",
                  word: targetObj.word,
                  ipa: targetObj.ipa || "",
                  answer: targetObj.word
                }],
                pdfTeacherNotes: "Pronunciation target: " + targetObj.word
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else if (quizType === "Spell" || quizType === "Letters" || quizType === "Hangman") {
              const blockTitle = (isHw ? "HW " : "CW ") + quizType + ": " + targetObj.word;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());
              const block = {
                id: lmId(),
                type: "quiz",
                tab: sec.tab,
                collapsed: false,
                gradeMode: "assignment",
                maxPoints: 1,
                assignmentId: "a-" + crypto.randomUUID(),
                title: blockTitle,
                targetWord: targetObj.word,
                quizType: quizType,
                items: [{
                  word: targetObj.word,
                  hint: targetObj.meaning
                }],
                pdfTeacherNotes: quizType + " practice for: " + targetObj.word + " (" + targetObj.meaning + ")"
              };
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            } else {
              const block = lmBlank("quiz", quizType);
              block.tab = sec.tab;
              block.targetWord = targetObj.word;
              const blockTitle = (isHw ? "HW " : "CW ") + quizType + ": " + targetObj.word;
              block.title = blockTitle;
              existingTasksInSec.add(blockTitle.toLowerCase().trim());

              if (block.items && block.items[0]) {
                if (block.items[0].prompt !== undefined) block.items[0].prompt = "Practice: \"" + targetObj.word + "\"";
                if (block.items[0].answer !== undefined) block.items[0].answer = targetObj.word;
                if (block.items[0].word !== undefined) block.items[0].word = targetObj.word;
                if (block.items[0].left !== undefined) { block.items[0].left = targetObj.word; block.items[0].right = targetObj.meaning; }
              }
              createdTaskBlocks.push(block);
              lmState.blocks.push(block);
            }
          }
        });

        lmShowTabProgress("lesson", "Syncing new words to Words vocabulary list...", 80);
        await new Promise((r) => setTimeout(r, 150));

        const newlyAddedWords = lmEnsureWordsInLesson(wordsUsedInTasks);

        lmShowTabProgress("lesson", "Done! " + createdTaskBlocks.length + " tasks generated.", 100);

        const allNewBlockIds = createdTaskBlocks.map((b) => b.id).concat(newlyAddedWords.map((b) => b.id));
        lmLastGenerationSnapshot = {
          blockIds: allNewBlockIds,
          taskCount: createdTaskBlocks.length,
          wordCount: newlyAddedWords.length
        };

        if (undoWrap) {
          undoWrap.style.display = "flex";
          if (undoCountEl) undoCountEl.textContent = String(allNewBlockIds.length);
          const statusText = document.getElementById("lmUndoStatusText");
          if (statusText) {
            statusText.textContent = "✅ Generated " + createdTaskBlocks.length + " tasks" + (newlyAddedWords.length ? (" and added " + newlyAddedWords.length + " words to Words list") : "") + "!";
          }
        }

        lmSyncLessonComplementTab();
        lmRenderEditor();
        lmSchedule();
        lmPersist();
        if (typeof window.lmPdfUseSource === 'function' && typeof window.lmPdfProgress === 'function') {
          const classworkCount = createdTaskBlocks.filter((block) => block.tab === 'classwork').length;
          const homeworkCount = createdTaskBlocks.filter((block) => block.tab === 'homework').length;
          const lines = [];
          if (newlyAddedWords.length) lines.push('Words: ' + newlyAddedWords.length);
          if (classworkCount) lines.push('Classwork: ' + classworkCount);
          if (homeworkCount) lines.push('Homework: ' + homeworkCount);
          window.lmPdfUseSource('lesson');
          window.lmPdfProgress('Ready to review', lines, 1, 1);
        }

        const targetTab = sectionsToFill[0]?.tab || "homework";
        lmSelectTab(targetTab);

        if (genBtn) {
          genBtn.disabled = false;
          lmSyncTaskTotalSummary();
        }
      }

      function lmUndoLastGeneration() {
        if (!lmState || !lmLastGenerationSnapshot || !Array.isArray(lmState.blocks)) return;
        const idsToRemove = new Set(lmLastGenerationSnapshot.blockIds);
        lmState.blocks = lmState.blocks.filter((b) => !idsToRemove.has(b.id));

        const undoWrap = document.getElementById("lmUndoGenerationWrap");
        if (undoWrap) undoWrap.style.display = "none";

        lmHideTabProgress("lesson");
        if (typeof window.lmPdfProgressEnd === 'function') window.lmPdfProgressEnd();
        lmSyncLessonComplementTab();
        lmRenderEditor();
        lmSchedule();
        lmPersist();

        const statusEl = document.getElementById("lmScriptStatus");
        if (statusEl) {
          statusEl.textContent = "✓ Generation undone. Lesson restored.";
          setTimeout(() => { if (statusEl.textContent.includes("undone")) statusEl.textContent = ""; }, 4000);
        }
        lmLastGenerationSnapshot = null;
      }

      function lmSyncGenerateControls() {
        if (typeof document === "undefined") return;
        const btn = document.getElementById("lmGenerateFromScriptBtn");
        const title = document.getElementById("lmFrameImportTitle");
        const timeLimitWrap = document.getElementById("lmExamTimeLimitWrap");
        const isExam = !!(lmState && lmState.examOwned);
        const blocks = (lmState && Array.isArray(lmState.blocks)) ? lmState.blocks : [];
        const hasBlocks = blocks.length > 0;

        if (title) {
          title.textContent = isExam ? "Generate & Import Exam" : "Generate & Import Lessons";
        }
        if (timeLimitWrap) {
          timeLimitWrap.style.display = isExam ? "inline-flex" : "none";
        }
        if (btn) {
          btn.textContent = "Generate";
        }
        lmSyncLessonComplementTab();
      }

      function lmGetSelectedQuizTypes() {
        if (typeof document === "undefined") return LM_ALL_QUIZ_TYPES.slice();
        const listEl = document.getElementById("lmQuizTypesList");
        if (!listEl) return LM_ALL_QUIZ_TYPES.slice();
        const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.dataset.quizType);
        return checked.length > 0 ? checked : ["Choice"];
      }

      function lmGetTaskCountPerSection() {
        if (typeof document === "undefined") return 3;
        const countInput = document.getElementById("lmTaskCountPerSection");
        let count = parseInt(countInput ? String(countInput.value).replace(/\D/g, "") : "3", 10);
        if (isNaN(count) || count < 1) count = 3;
        if (count > 30) count = 30;
        return count;
      }

      function lmGetTaskCounts() {
        if (typeof document === "undefined") return { cw: 3, hw: 3, perSection: 3, total: 3 };
        const perSection = lmGetTaskCountPerSection();
        const cwEl = document.getElementById("lmQuizClasswork");
        const hwEl = document.getElementById("lmQuizHomework");
        const cwChecked = cwEl ? cwEl.checked : false;
        const hwChecked = hwEl ? hwEl.checked : true;
        const cw = cwChecked ? perSection : 0;
        const hw = hwChecked ? perSection : 0;
        let total = cw + hw;
        if (total > 30) total = 30;
        return {
          cw,
          hw,
          perSection,
          total: total > 0 ? total : perSection
        };
      }

      function lmSyncTaskTotalSummary() {
        if (typeof document === "undefined") return;
        const summaryEl = document.getElementById("lmTaskTotalSummary");
        const countInput = document.getElementById("lmTaskCountPerSection");
        const genBtn = document.getElementById("lmGenerateTasksBtn");
        if (countInput) {
          let val = parseInt(String(countInput.value).replace(/\D/g, ""), 10);
          if (!isNaN(val) && val > 30) {
            countInput.value = "30";
          }
        }
        const counts = lmGetTaskCounts();
        if (summaryEl) {
          summaryEl.textContent = "(Total: " + counts.total + " tasks)";
        }
        if (genBtn && !genBtn.disabled) {
          genBtn.textContent = "Generate " + counts.total + " Tasks for Current Lesson \u2192";
        }
      }

      function lmInitQuizOptions() {
        if (typeof document === "undefined") return;
        const listEl = document.getElementById("lmQuizTypesList");
        const pillCloud = document.getElementById("lmQuizTypesPillCloud");
        const countEl = document.getElementById("lmQuizSelectedCount");
        const warnEl = document.getElementById("lmVideoChoiceWarning");
        const btn = document.getElementById("lmQuizOptionsBtn");
        const dropdown = document.getElementById("lmQuizOptionsDropdown");
        const selectAllBtn = document.getElementById("lmQuizSelectAll");
        const deselectAllBtn = document.getElementById("lmQuizDeselectAll");
        const pillSelectAll = document.getElementById("lmPillSelectAll");
        const pillDeselectAll = document.getElementById("lmPillDeselectAll");
        const cwCheck = document.getElementById("lmQuizClasswork");
        const hwCheck = document.getElementById("lmQuizHomework");
        const pillCw = document.getElementById("lmPillClasswork");
        const pillHw = document.getElementById("lmPillHomework");
        const countInput = document.getElementById("lmTaskCountPerSection");

        if (cwCheck && !cwCheck.dataset.initialized) {
          cwCheck.dataset.initialized = "1";
          cwCheck.addEventListener("change", lmSyncTaskTotalSummary);
        }
        if (hwCheck && !hwCheck.dataset.initialized) {
          hwCheck.dataset.initialized = "1";
          hwCheck.addEventListener("change", lmSyncTaskTotalSummary);
        }
        if (countInput && !countInput.dataset.initialized) {
          countInput.dataset.initialized = "1";
          countInput.addEventListener("input", () => {
            let val = countInput.value.replace(/\D/g, "");
            if (val !== "") {
              let num = parseInt(val, 10);
              if (num > 30) num = 30;
              countInput.value = String(num);
            }
            lmSyncTaskTotalSummary();
          });
          countInput.addEventListener("blur", () => {
            let num = parseInt(countInput.value.replace(/\D/g, ""), 10);
            if (isNaN(num) || num < 1) num = 1;
            if (num > 30) num = 30;
            countInput.value = String(num);
            lmSyncTaskTotalSummary();
          });
          countInput.addEventListener("change", lmSyncTaskTotalSummary);
        }

        function syncSectionPills() {
          if (pillCw && cwCheck) {
            const isCw = cwCheck.checked;
            pillCw.className = "lm-quiz-pill " + (isCw ? "pill-active-blue" : "pill-inactive");
            pillCw.textContent = (isCw ? "✓" : "+") + " Classwork";
          }
          if (pillHw && hwCheck) {
            const isHw = hwCheck.checked;
            pillHw.className = "lm-quiz-pill " + (isHw ? "pill-active-blue" : "pill-inactive");
            pillHw.textContent = (isHw ? "✓" : "+") + " Homework";
          }
          lmSyncTaskTotalSummary();
        }

        if (pillCw && !pillCw.dataset.initialized) {
          pillCw.dataset.initialized = "1";
          pillCw.addEventListener("click", () => {
            if (cwCheck) {
              cwCheck.checked = !cwCheck.checked;
              syncSectionPills();
            }
          });
        }
        if (pillHw && !pillHw.dataset.initialized) {
          pillHw.dataset.initialized = "1";
          pillHw.addEventListener("click", () => {
            if (hwCheck) {
              hwCheck.checked = !hwCheck.checked;
              syncSectionPills();
            }
          });
        }
        syncSectionPills();

        if (listEl && listEl.children.length === 0) {
          listEl.innerHTML = LM_ALL_QUIZ_TYPES.map((type) => {
            const isVideo = type === "Video choice";
            return '<label style="display:flex; align-items:center; gap:8px; padding:3px 4px; border-radius:4px; cursor:pointer;" class="lm-quiz-type-opt">' +
              '<input type="checkbox" data-quiz-type="' + esc(type) + '"' + (isVideo ? "" : " checked") + ' style="cursor:pointer;" />' +
              '<span style="font-size:12px; font-weight:600;' + (isVideo ? " color:#ef4444;" : "") + '">' +
              (isVideo ? "📹 " : "") + esc(type) +
              (type === "Smart Flashcard" ? ' <small style="opacity:0.75; font-weight:400;">(FSRS)</small>' : "") +
              "</span></label>";
          }).join("");
        }

        function updateCountAndWarnings() {
          const checked = listEl ? listEl.querySelectorAll('input[type="checkbox"]:checked') : [];
          if (countEl) countEl.textContent = String(checked.length);
          const videoChecked = listEl ? listEl.querySelector('input[data-quiz-type="Video choice"]:checked') : null;
          if (warnEl) {
            warnEl.style.display = videoChecked ? "block" : "none";
          }

          if (pillCloud) {
            const pills = pillCloud.querySelectorAll("[data-quiz-type]");
            pills.forEach((p) => {
              const type = p.dataset.quizType;
              const isVideo = type === "Video choice";
              const cb = listEl ? listEl.querySelector('input[data-quiz-type="' + type + '"]') : null;
              const isOn = cb ? cb.checked : true;
              p.className = "lm-quiz-pill " + (isOn ? (isVideo ? "pill-active-coral" : "pill-active-blue") : "pill-inactive");
              p.textContent = (isOn ? "✓ " : "+ ") + (isVideo ? "📹 " : "") + type;
            });
          }
        }

        if (pillCloud && pillCloud.children.length === 0) {
          pillCloud.innerHTML = LM_ALL_QUIZ_TYPES.map((type) => {
            const isVideo = type === "Video choice";
            return '<button type="button" class="lm-quiz-pill ' + (isVideo ? 'pill-inactive' : 'pill-active-blue') + '" data-quiz-type="' + esc(type) + '">' +
              (isVideo ? '+ ' : '✓ ') + (isVideo ? '📹 ' : '') + esc(type) + '</button>';
          }).join("");

          pillCloud.querySelectorAll("[data-quiz-type]").forEach((p) => {
            p.addEventListener("click", () => {
              const type = p.dataset.quizType;
              const cb = listEl ? listEl.querySelector('input[data-quiz-type="' + type + '"]') : null;
              if (cb) {
                cb.checked = !cb.checked;
                updateCountAndWarnings();
              }
            });
          });
        }

        if (listEl) {
          listEl.onchange = () => {
            updateCountAndWarnings();
          };
        }

        function selectAllQuizzes(val) {
          if (listEl) {
            listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = val; });
          }
          updateCountAndWarnings();
        }

        if (selectAllBtn) {
          selectAllBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); selectAllQuizzes(true); };
        }
        if (deselectAllBtn) {
          deselectAllBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); selectAllQuizzes(false); };
        }
        if (pillSelectAll) {
          pillSelectAll.onclick = (e) => { e.preventDefault(); e.stopPropagation(); selectAllQuizzes(true); };
        }
        if (pillDeselectAll) {
          pillDeselectAll.onclick = (e) => { e.preventDefault(); e.stopPropagation(); selectAllQuizzes(false); };
        }

        if (btn && dropdown && !btn.dataset.initialized) {
          btn.dataset.initialized = "1";
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = dropdown.style.display === "block";
            dropdown.style.display = isOpen ? "none" : "block";
          };

          document.addEventListener("click", (e) => {
            if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
              dropdown.style.display = "none";
            }
          });
        }

        updateCountAndWarnings();
        lmSyncTaskTotalSummary();
      }

      function lmSyncTeacherVerifySummary() {
        if (typeof document === "undefined") return;
        const chk = document.getElementById("lmTeacherVerifyCheckbox");
        const btn = document.getElementById("lmTeacherVerifyBtn");
        const badge = document.getElementById("lmTeacherVerifyBadge");
        const approveAllBtn = document.getElementById("lmApproveAllBlocksBtn");
        const publishBtn = document.getElementById("lmPublish");
        if (lmState && lmState.examOwned) {
          if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.classList.remove("is-disabled");
            publishBtn.removeAttribute("aria-disabled");
            publishBtn.title = "Publish";
          }
          return;
        }
        if (!lmState || !Array.isArray(lmState.blocks) || lmState.blocks.length === 0) {
          if (chk) chk.checked = false;
          if (btn) {
            btn.className = "lm-teacher-pill-btn pill-red";
            btn.innerHTML = "● Verified by Teacher";
          }
          if (badge) {
            badge.style.color = "var(--bad)";
            badge.textContent = "Unreviewed";
          }
          if (approveAllBtn) {
            approveAllBtn.className = "btn secondary saas-btn lm-approve-all-btn pill-btn pill-red";
            approveAllBtn.innerHTML = "● Approve all";
          }
          if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.classList.add("is-disabled");
            publishBtn.setAttribute("aria-disabled", "true");
            publishBtn.title = "Publish locked: lesson has no materials yet";
          }
          return;
        }
        const reviewableBlocks = lmState.blocks.filter((b) => b.type !== 'divider');
        const total = reviewableBlocks.length;
        const verifiedCount = reviewableBlocks.filter((b) => b.teacherVerified).length;
        const isAllVerified = verifiedCount === total && total > 0;
        if (chk) chk.checked = isAllVerified;
        if (btn) {
          btn.className = "lm-teacher-pill-btn " + (isAllVerified ? "pill-green" : "pill-red");
          btn.innerHTML = (isAllVerified ? "✓" : "●") + " Verified by Teacher";
        }
        if (badge) {
          badge.style.color = isAllVerified ? "var(--ok)" : "var(--bad)";
          badge.textContent = isAllVerified
            ? "Reviewed & Approved (" + total + "/" + total + ")"
            : (verifiedCount > 0 ? "Partially Verified (" + verifiedCount + "/" + total + ")" : "Unreviewed (0/" + total + ")");
        }
        if (approveAllBtn) {
          approveAllBtn.className = "btn secondary saas-btn lm-approve-all-btn pill-btn " + (isAllVerified ? "pill-green" : "pill-red");
          approveAllBtn.innerHTML = isAllVerified ? "✓ Approved all" : "● Approve all";
        }
        if (publishBtn) {
          if (isAllVerified) {
            publishBtn.disabled = false;
            publishBtn.classList.remove("is-disabled");
            publishBtn.removeAttribute("aria-disabled");
            publishBtn.title = "Publish lesson";
          } else {
            publishBtn.disabled = true;
            publishBtn.classList.add("is-disabled");
            publishBtn.setAttribute("aria-disabled", "true");
            publishBtn.title = "Publish locked: " + (total - verifiedCount) + " unreviewed item(s) remain. Verify all blocks to publish.";
          }
        }
      }

      window.LM_ALL_QUIZ_TYPES = LM_ALL_QUIZ_TYPES;
      window.lmSyncGenerateControls = lmSyncGenerateControls;
      window.lmGetSelectedQuizTypes = lmGetSelectedQuizTypes;
      window.lmGetTaskCountPerSection = lmGetTaskCountPerSection;
      window.lmGetTaskCounts = lmGetTaskCounts;
      window.lmSyncTaskTotalSummary = lmSyncTaskTotalSummary;
      window.lmInitQuizOptions = lmInitQuizOptions;
      window.lmInitImportTabs = lmInitImportTabs;
      window.lmSyncLessonComplementTab = lmSyncLessonComplementTab;
      window.lmSwitchImportTab = lmSwitchImportTab;
      window.lmSyncTeacherVerifySummary = lmSyncTeacherVerifySummary;
      window.lmGenerateComplementTasks = lmGenerateComplementTasks;
      window.lmUndoLastGeneration = lmUndoLastGeneration;
      window.lmShowTabProgress = lmShowTabProgress;
      window.lmHideTabProgress = lmHideTabProgress;
      window.lmSelectTab = lmSelectTab;
      window.lmExtractLessonVocabularyPool = lmExtractLessonVocabularyPool;
      window.lmGetThematicExpansionPool = lmGetThematicExpansionPool;
      window.lmEnsureWordsInLesson = lmEnsureWordsInLesson;
      window.lmEnsurePhrasesInLesson = lmEnsurePhrasesInLesson;
      window.lmEnsureRulesInLesson = lmEnsureRulesInLesson;
      window.lmBlockCounts = lmBlockCounts;
      window.calculateLessonEvaluation = calculateLessonEvaluation;
      window.lmLessonStudentProgress = lmLessonStudentProgress;

      const lmNew = document.getElementById("lmNew");
      if (lmNew) lmNew.addEventListener("click", lmCreateLesson);
      const groupNew = document.getElementById("groupNew");
      if (groupNew) groupNew.addEventListener("click", groupCreate);
      lmInitImportTabs();
      lmInitQuizOptions();
      lmSyncGenerateControls();
      lmSyncTeacherVerifySummary();
      paintLmDays();
    }

