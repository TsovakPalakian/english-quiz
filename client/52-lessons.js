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
      if (lmLibrary && classGroups.length) lmLibrary.materials.forEach((material) => {
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
        }).catch(() => {});
    }
    let groupViewLevel = '', examViewLevel = '', examViewGroup = null;
    document.addEventListener('input',event=>{if(event.target.id==='groupSearch')paintGroups();});
    function metricPairs(rows,compact=false){if(!authUser||viewAccount||!['ADMIN','DEVELOPER'].includes(authUser.role))return '';return '<span class="metric-pairs'+(compact?' metric-pairs--compact':'')+'">'+rows.map(([label,value])=>'<span>'+esc(compact?({'groups':'group','assigned works':'assigned','ready for review':'ready'}[label]||label):label)+' · <b>'+esc(String(value))+'</b></span>').join('')+'</span>';}
    function levelButtons(rows,attribute) {
      const hasUnassigned = (classGroupsReady || !authUser) && rows.some(row=>accountGroupLevel(row)==='unassigned');
      const levels = hasUnassigned ? [...adminLevels,'unassigned'] : adminLevels;
      return '<div class="decks">' + levels.filter(level=>canEditLessons()||rows.some(row=>accountGroupLevel(row)===level)).map(level=>{const groups=rows.filter(row=>accountGroupLevel(row)===level),pairs=[['groups',groups.length],['students',groups.reduce((sum,g)=>sum+(g.studentCount||0),0)],['lessons',groups.reduce((sum,g)=>sum+(g.lessonIds?.length||0),0)]];const empty=pairs.every(([,value])=>!value);return '<button class="file-card'+(empty?' is-empty':'')+'" type="button" '+attribute+'="'+level+'"><b>'+esc(level==='unassigned'?'Unassigned':level)+'</b><span class="label">'+metricPairs(pairs,true)+'</span></button>';}).join('')+'</div>';
    }
    document.addEventListener('click',event=>{
      const group=event.target.closest('[data-group-level]'), level=event.target.closest('[data-exam-level]'), subgroup=event.target.closest('[data-exam-group-view]');
      if(group){pushHistory();groupViewLevel=group.dataset.groupLevel;const search=document.getElementById('groupSearch');if(search)search.value='';paintGroups();rememberPlace();}
      if(level){pushHistory();examViewLevel=level.dataset.examLevel;examViewGroup=null;examPaintList();rememberPlace();}
      if(subgroup){pushHistory();examViewGroup=subgroup.dataset.examGroupView;examPaintList();rememberPlace();}
    });
    function teacherOwnsGroup(group) {
      if (viewAccount || sessionIsDeveloper()) return true;
      if (!authUser || authUser.role !== 'ADMIN') return true;
      if (Array.isArray(group?.teacherIds)) return group.teacherIds.includes(authUser.id);
      if (typeof groupDirectoryReady === 'function' && groupDirectoryReady() && groupDirectory?.assignments) {
        const assignment = groupDirectory.assignments.find(row => String(row.groupId) === String(group.id));
        if (assignment) return assignment.teacherIds?.includes(authUser.id);
      }
      if (typeof adminTeacherAssignments !== 'undefined' && adminTeacherAssignments?.length) {
        const assignment = adminTeacherAssignments.find(row => String(row.groupId) === String(group.id));
        if (assignment) return assignment.teacherIds?.includes(authUser.id);
      }
      return false;
    }
    function paintGroups() {
      const box = document.getElementById("groupList");
      const newer = document.getElementById("groupNew");
      if (newer) newer.hidden = !canEditLessons();
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
      const levelRows=groupViewLevel?allRows.filter(group=>accountGroupLevel(group)===groupViewLevel):allRows;
      if(!groupViewLevel){box.innerHTML=levelButtons(allRows,'data-group-level');return;}
      const query=document.getElementById('groupSearch')?.value.trim().toLocaleLowerCase()||'';
      const rows=levelRows.filter(group=>group.title.toLocaleLowerCase().includes(query));
      box.innerHTML = '<h2>Study groups</h2>'+rows.map((group) => {
        const count = group.lessonIds.filter((id) => visible.has(id)).length;
        const hiddenCount = viewAccount ? group.lessonIds.filter(id => { const lesson = lmLibrary?.materials?.find(row => row.id === id); return !lesson || !lesson.published || lmLessonHidden(lesson); }).length : 0;
        const chip = lmDateChip(group.date);
        const hidden = viewAccount ? group.personalHidden : group.hidden;
        const empty = (group.studentCount || 0) === 0 && count === 0;
        const about = hidden ? (viewAccount ? "Hidden for this student" : "Hidden") : (viewAccount && hiddenCount ? "Hidden " + hiddenCount + " / " + group.lessonIds.length + " lessons" : count + " lessons");
        const eye = hidden
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
        const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
        const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
        const tools = canEditLessons() || canTuneStudentLessons() ? '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-group-hide="' + esc(group.id) + '" aria-label="' + (hidden ? "Show" : "Hide") + '">' + eye + '</button>' + (canEditLessons() ? '<button class="day-edit" type="button" data-group-edit="' + esc(group.id) + '" aria-label="Edit group" title="Edit group">' + pencil + '</button><button class="day-del" type="button" data-group-delete="' + esc(group.id) + '" aria-label="Delete group">' + trash + '</button>' : '') + '</div>' : '';
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + (empty ? " is-empty" : "") + '"><button class="day" type="button" data-group-open="' + esc(group.id) + '"><span class="date"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(group.title) + '</b><span class="label about">' + metricPairs([['students',group.studentCount||0],['lessons',count]],true)+(hidden||hiddenCount?'<span>'+esc(about)+'</span>':'') + "</span></button>" + tools + "</div>";
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
    function lmSchedule() {
      clearTimeout(lmSaveTimer);
      lmSaveTimer = setTimeout(lmPersist, 400);
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
      if (id === "words" || id === "phrases" || id === "rules" || id === "classwork" || id === "homework" || id === "pdf") return id;
      return "overview";
    }
    function lmBlocksFor(tab) {
      const id = tab || lmTab();
      return (lmState && lmState.blocks || []).filter((block) => (block.tab || "overview") === id);
    }
    function lmWordCardHtml(block) {
      const card = { word: block.word, en: block.word, ru: block.ru || "", uk: block.uk || "", us: block.us || "", data: block.data || null };
      if (examStudentRestricted()) return '<details class="lm-study-card"><summary>' + esc(block.word || '') + '</summary><div class="lm-study-card-body">' + ipaHtml(card) + (block.pos ? '<p>' + esc(block.pos) + '</p>' : '') + '</div></details>';
      const content = '<button class="wcard" type="button" data-lm-word="' + esc(block.id) + '">' + wordPic(block.word) + '<div class="en">' + esc(block.word || "") + '</div>' + (block.pos ? '<div class="pos">' + esc(block.pos) + "</div>" : "") + ipaHtml(card) + (block.pdfVocabulary?.meaning?'<div class="meaning" lang="en">'+esc(block.pdfVocabulary.meaning)+'</div>':'') + '<div class="label" lang="ru">' + esc(block.ru || "") + "</div></button>";
      const kit = window.LearningWorkbench?.lessonButton(block) || '';
      return kit ? '<div class="lm-word-card-wrap">' + content + '<div class="lm-word-kit">' + kit + '</div></div>' : content;
    }
    function lmRuleCardHtml(block, link) {
      if(block.grammarRule&&window.GrammarDetails?.[block.grammarRule])return '<button type="button" class="g-topic" data-grammar-rule="'+esc(block.grammarRule)+'"><b>'+esc(block.grammarRule)+'</b><span class="form">Grammar</span></button>';
      const topic = block.compare ? null : topicById(block.topic);
      const compare = block.compare ? ((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((item) => item.id === block.topic)[0] : null;
      const name = (topic && topic.name) || (compare && compare.title) || block.name || "Rule";
      const form = (topic && topic.form) || (compare ? "compare" : "open");
      const tone = (topic && topic.tone) || (compare && compare.tone) || "advanced";
      const attr = link ? (block.compare ? ' data-compare="' + esc(block.topic) + '"' : ' data-topic="' + esc(block.topic) + '"') : "";
      const tag = link ? "button" : "div";
      return "<" + tag + ' class="g-topic tone-' + esc(tone) + '"' + attr + (link ? ' type="button"' : "") + "><b>" + esc(name) + '</b><span class="form">' + esc(form) + "</span></" + tag + ">";
    }
    function lmQuizBlankItem(quizType) {
      const kind = quizType || "Choice";
      if (kind === "Flip" || kind === "Reverse") return { front: "", back: "" };
      if (kind === "Choice") return { prompt: "", options: ["", "", ""], answer: 0 };
      if (kind === "Type" || kind === "Listen" || kind === "Definition") return { prompt: "", answer: "" };
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
      if (block.type === "rule") return block.name || "Rule";
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
      if (kind === "Choice") {
        return lmItemField(block, "items", index, "prompt", "Question", true) + lmChoiceEditor(block, index);
      }
      if (kind === "Type" || kind === "Listen") {
        return lmItemField(block, "items", index, "prompt", kind === "Listen" ? "Prompt / transcript" : "Prompt", true) +
          lmItemField(block, "items", index, "answer", "Answer", true);
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
      const addLabel = (kind === "Match" || kind === "Memory") ? "+ Add pair" : (kind === "Spell" || kind === "Letters" || kind === "Hangman") ? "+ Add word" : "+ Add card";
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
    function lmHead(block, label, isFirst, isLast) {
      const copy = contentCopyButton('material', block.id, lmState.examOwned ? 'exam-block' : 'lesson', lmState.id, 'lm-icon');
      const newBadge = block.id === lmLastAddedBlockId ? '<span class="lm-new-badge">New</span>' : '';
      const topDisabled = isFirst ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const upDisabled = isFirst ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const downDisabled = isLast ? ' disabled style="opacity:0.35;cursor:default"' : '';
      const bottomDisabled = isLast ? ' disabled style="opacity:0.35;cursor:default"' : '';
      return '<div class="lm-block-head"><button class="lm-grip" type="button" data-grip="' + block.id + '" aria-label="Move">≡</button><span class="lm-type">' + label + '</span>' + newBadge + '<div class="lm-head-actions"><button class="lm-icon" type="button" data-lm-fold="' + block.id + '" aria-label="Collapse">' + (block.collapsed ? "▸" : "▾") + '</button><button class="lm-icon" type="button" data-lm-top="' + block.id + '" aria-label="Move to top" title="Move to top"' + topDisabled + '>⤒</button><button class="lm-icon" type="button" data-lm-up="' + block.id + '" aria-label="Move up"' + upDisabled + '>↑</button><button class="lm-icon" type="button" data-lm-down="' + block.id + '" aria-label="Move down"' + downDisabled + '>↓</button><button class="lm-icon" type="button" data-lm-bottom="' + block.id + '" aria-label="Move to bottom" title="Move to bottom"' + bottomDisabled + '>⤓</button><button class="lm-icon" type="button" data-lm-menu="' + block.id + '" aria-label="More">⋮</button>' + copy + '<button class="lm-icon danger" type="button" data-lm-del="' + block.id + '" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button><div class="lm-pop" data-pop="' + block.id + '" hidden><button type="button" data-lm-edit="' + block.id + '">Edit</button><button type="button" data-lm-insert-above="' + block.id + '">Insert above...</button><button type="button" data-lm-insert-below="' + block.id + '">Insert below...</button></div></div></div><p class="lm-summary">' + esc(lmSummary(block)) + "</p>";
    }
    function lmQuestions(block) {
      return (block.items || []).map((question, index) => {
        const write = block.type === "exercise" && question.kind === "write";
        const kind = block.type === "exercise" ? '<label>Answer type<select data-item-field="kind" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="choice"' + (write ? "" : " selected") + '>Choices</option><option value="write"' + (write ? " selected" : "") + ">Type the answer</option></select></label>" : "";
        const body = write ? '<label class="lm-span">Correct answer<input type="text" data-item-field="write" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.write || "") + '" /></label>' : lmChoiceEditor(block, index);
        return '<div class="lm-card-row"><div class="lm-card-fields">' + lmItemField(block, "items", index, "prompt", "Question", true) + kind + body + "</div>" + lmItemTools(block.id, "items", index) + "</div>";
      }).join("");
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
      if (block.type === "rule") return lmRuleCardHtml(block, false);
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
      box.innerHTML = blocks.length ? blocks.map((block, index) => {
        const isFirst = index === 0;
        const isLast = index === blocks.length - 1;
        const isNew = block.id === lmLastAddedBlockId;
        const label = block.type === "interactive" ? "Interactive" : block.type === "quiz" ? ("Quiz · " + lmQuizType(block)) : (labels[block.type] || "Block");
        const grading = ["quiz", "exercise", "task"].includes(block.type);
        const assessed = grading && !lmState.examOwned ? '<label><input type="checkbox" data-field="assessed" data-block="' + block.id + '"' + (block.assessed ? ' checked' : '') + '> Assessed task</label>' : '';
        const derived=lmState.examOwned&&examScoringChildren(lmState.blocks,block).length>0;
        const maximum = grading ? '<label class="lm-max-score">Maximum points<input type="text" inputmode="decimal" data-field="maxPoints" data-block="' + block.id + '"'+(derived?' readonly':'')+' value="' + esc(String(derived?examScoringMax(lmState.blocks,block):block.maxPoints??(block.scoringVersion===2?'':assessmentUnitMax(block)))) + '"></label>' : '';
        const head = lmHead(block,label,isFirst,isLast).replace('<div class="lm-head-actions">','<div class="lm-head-actions">' + maximum);
        const source=block.pdfImport ? '<p class="hint">PDF pages: '+esc((block.pdfImport.pages||[]).join(', ')||'overview')+(block.pdfImport.generated?' · Generated practice':'')+'</p>' : '';
        const teacherNotes=block.pdfTeacherNotes ? '<label>Teacher notes / sample answer<textarea data-field="pdfTeacherNotes" data-block="'+block.id+'">'+esc(block.pdfTeacherNotes)+'</textarea></label>' : '';
        const beforeZone = lmInsertZoneHtml(block.id, "before");
        const blockHtml = '<article class="lm-block' + (block.collapsed ? " is-shut" : "") + (isNew ? " is-newly-added" : "") + '" data-block-id="' + block.id + '">' + head + '<div class="lm-body">' + source + assessed + assessmentGroupEditor(block) + lmBody(block) + teacherNotes + (grading ? '<label>Grading criteria<textarea data-field="criteria" data-block="' + block.id + '" placeholder="Content | 3&#10;Grammar | 2">' + esc(block.criteria || '') + '</textarea></label>' : '') + "</div></article>";
        const afterZone = isLast ? lmInsertZoneHtml(block.id, "after") : "";
        return beforeZone + blockHtml + afterZone;
      }).join("") : (lmTab() === "rules" ? '<p class="hint">Nothing on this page yet. Click a grammar topic above to add it.</p>' : '<p class="hint">Nothing on this page yet.</p>');
      box.querySelectorAll('textarea[data-field],input[type=text][data-field],textarea[data-item-field],input[type=text][data-item-field],input[type=text][data-card-field]').forEach(field=>{
        const name=field.dataset.field||field.dataset.itemField||field.dataset.cardField;if(['criteria','url','remoteUrl','ipa','maxPoints','memorySize','answer','write'].includes(name))return;
        const part=lmBlock(field.dataset.block);if(!part)return;const key=[name,field.dataset.item??field.dataset.card??''].join(':');
        window.TextColors?.mount(field,{format:part.textFormatting?.[key],onChange:format=>{part.textFormatting||={};part.textFormatting[key]=format;lmSchedule();}});
      });
      dressWords(box);
      lmPaintChrome();
      lmPaintTabTools();
    }
    function lmPreviewFile(block, label, action, attr) {
      const external = lmExternalFile(block);
      if (external) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><div style="margin-top:8px"><a class="lm-btn lm-btn-primary" href="' + esc(external) + '" target="_blank" rel="noopener noreferrer">' + esc(action) + '</a></div></div>';
      if (block.hasFile === false && !lmSrc(block)) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><p class="hint">No file attached.</p></div>';
      return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + "</b><span>" + esc([block.name && block.title ? block.name : "", block.size || ""].filter(Boolean).join(" · ")) + '</span><div style="margin-top:8px"><button class="lm-btn lm-btn-primary" type="button" ' + attr + '="' + block.id + '">' + action + "</button></div></div>";
    }
    function lmPreviewChoices(block, index, question) {
      return (question.options || []).map((opt, oi) => '<label class="lm-opt"><input type="radio" name="pv-' + block.id + "-" + index + '" data-pick="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.picked) === oi ? " checked" : "") + " /> " + esc(opt || "Option") + "</label>").join("");
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
      if (block.type === "divider") return '<div class="lm-divider">' + esc(block.label || "") + "</div>";
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
      if (block.type === "task") return "<h3>" + esc(block.title || "Task") + '</h3><p>' + esc(block.text || "") + '</p><label>Your answer<textarea data-response="' + block.id + '">' + esc(block.response || "") + "</textarea></label>";
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
          const body = question.kind === "write" ? '<input type="text" data-write="' + block.id + ":" + index + '" value="' + esc(question.typed || "") + '" placeholder="Your answer" />' : lmPreviewChoices(block, index, question);
          const mark = question.marked ? '<p class="lm-result ' + (question.correct ? "is-ok" : "is-no") + '">' + (question.correct ? "Correct" : "Not quite") + "</p>" : "";
          const explanation=question.marked&&(block.pdfFeedback||(block.pdfImport?.section==='classwork'&&block.pdfTeacherNotes));
          const feedback=explanation?'<p class="lm-pdf-feedback" data-pdf-feedback="'+block.id+'">'+esc(explanation)+'</p>':'';
          return '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + body + mark + feedback + "</div>";
        }).join("");
        return questions + '<button class="lm-btn lm-btn-primary lm-check" type="button" data-ex-check="' + block.id + '">Check</button>';
      }
      if (block.type === "quiz") {
        const kind = lmQuizType(block);
        const title = block.title ? "<h3>" + esc(block.title) + "</h3>" : "<h3>" + esc(kind) + "</h3>";
        if (kind === "Choice" || (!block.quizType && (block.items || []).some((row) => row.options))) {
          const questions = (block.items || []).map((question, index) => '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + lmPreviewChoices(block, index, question) + "</div>").join("");
          return title + questions + '<button class="lm-btn lm-btn-primary lm-check" type="button" data-quiz-check="' + block.id + '">Check</button><p class="lm-result" data-quiz-score="' + block.id + '">' + esc(block.score || "") + "</p>";
        }
        const cards = (block.items || []).map((item) => {
          if (kind === "Flip" || kind === "Reverse") return '<article class="lm-read-card"><b>' + esc(item.front || "") + "</b><span>" + esc(item.back || "") + "</span></article>";
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
      if (block.type === "rule") return lmRuleCardHtml(block, true);
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
      const taskKeys = new Set((lmState.blocks || []).filter(part => ['quiz','exercise','task'].includes(part.type)).map(part => part.assignmentKey || part.assignmentId || ('part-' + part.id)));
      for (const part of lmState.blocks || []) { const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (taskKeys.has(key) && !assignments.has(key)) assignments.set(key,assignments.size + 1); }
      return grouped.map(({ key, parts }) => {
        const content = lmPreviewPartsFlat(parts), number = assignments.get(key);
        if (!number) return content;
        const leader = parts.find(p => p.assignmentId === key && ['quiz','exercise','task'].includes(p.type)) || parts.find(p => ['quiz','exercise','task'].includes(p.type));
        return '<div class="lm-assignment lm-assignment-tone-' + ((number - 1) % 4) + '" data-assignment="' + esc(key) + '"><header><h3>Task ' + number + (leader?.title ? ' · ' + esc(leader.title) : '') + '</h3></header>' + content + '</div>';
      }).join('');
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
          html += '<div class="lm-panel" data-lm-panel="' + block.id + '">' + (copy ? '<div class="lm-copy-tools">' + copy + '</div>' : '') + lmPreviewBlock(block) + "</div>";
        }
      });
      flush();
      return html;
    }
    function lmRenderPreview() {
      const box = document.getElementById("lmPreview");
      if (!box || !lmState) return;
      const speech=lmTab()==='speech';
      if(speech&&box.querySelector('#lmSpeechPanel')){window.LearningWorkbench?.mountLessonSpeech();return;}
      const parts = speech?'<div id="lmSpeechPanel" role="tabpanel" aria-label="Speech"></div>':lmPreviewParts(lmBlocksFor());
      const when = lmLongDate(lmState.date);
      box.innerHTML = '<article class="lm-read">' + (when ? '<p class="lm-read-date">' + esc(when) + "</p>" : "") + '<h2 class="lm-read-title">' + esc(lmState.title || "Lesson") + "</h2>" + lmCourseHtml(lmState) + '<p class="lm-read-lead">' + window.TextColors.html(lmState.description||'',lmState.descriptionFormatting||lmState.blocks?.find(part=>part.documentFormatting)?.documentFormatting?.description) + "</p>" + lmChromeHtml() + parts + "</article>";
      if(speech){window.LearningWorkbench?.mountLessonSpeech();return;}
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
      const tools = [["quiz", "Day quiz", false], ["classwork", "Classwork", true], ["homework", "Homework", true], ["pdf", "Lesson PDF", true]];
      const tabBtns = tabs.map(pair => '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? 'on' : '') + '" role="tab" aria-selected="' + (pair[0] === tab ? 'true' : 'false') + '">' + pair[1] + '</button>').join('');
      const toolBtns = tools.map((pair) => {
        if (pair[2]) {
          return '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? "on" : "") + '" role="tab" aria-selected="' + (pair[0] === tab ? "true" : "false") + '">' + pair[1] + "</button>";
        }
        return '<button type="button" data-lm-tool="' + pair[0] + '">' + pair[1] + "</button>";
      }).join("");
      return '<div class="lm-chrome"><div class="seg" role="tablist" aria-label="This lesson">' + tabBtns + '</div><div class="lm-daytools" role="tablist" aria-label="Lesson tools">' + toolBtns + (window.LearningWorkbench?.lessonSpeechButton() || '') + (window.LearningWorkbench?.examButton() || '') + '</div></div>';
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
      document.getElementById("daySetupTitle").textContent = "This day's quiz";
      document.getElementById("daySetupBack").dataset.fallback = "material";
      document.getElementById("dayqBack").dataset.fallback = "material";
      const label = lmState.title || lmLongDate(lmState.date) || "Lesson";
      paintDaySetupNote(label, cards, label + " · no cards yet. Add words or phrases first.");
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
      const copy = document.getElementById("lmCopy");
      if (copy) {
        copy.hidden = !canEditLessons() || !Number.isSafeInteger(lmState.id) || lmState.id < 1;
        copy.dataset.contentCopy = (lmState.examOwned ? "exam-block" : "lesson") + ":" + lmState.id;
      }
      const heading = document.querySelector("#material .lm-meta h1");
      if (heading) heading.textContent = editing ? "Learning material" : (lmLongDate(lmState.date) || lmState.title || "Lesson");
      lmPaintChrome();
      lmBindEditor();
      if (editing) lmRenderEditor();
      else lmRenderPreview();
      examDress();
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
      const name = document.getElementById("lmGroupName");
      if (name) name.innerHTML = esc(group?.title||'')+' · '+metricPairs([['students',group?groupLiveStudentCount(group)??'…':'—'],['lessons',(group?.lessonIds||[]).filter(id=>lmLibrary.materials.some(row=>row.id===id&&lmLessonVisibleToViewer(row))).length]]);
      paintPagePath("days");
      const groupLessons = new Set(group ? group.lessonIds : []);
      const rows = lmLibrary.materials.filter((row) => groupLessons.has(row.id) && lmLessonVisibleToViewer(row)).slice().sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      box.innerHTML = rows.map((material) => {
        const chip = lmDateChip(material.date);
        const globalHidden = !!material.hiddenFromStudents;
        const personalHidden = viewAccount && !globalHidden ? lmHiddenForStudent(material.id) : false;
        const personalAllowed = viewAccount && globalHidden ? lmAllowedForStudent(material.id) : false;
        const hidden = lmLessonHidden(material);
        let about = material.published ? "Published lesson" : "Draft";
        if (viewAccount && globalHidden) about = personalAllowed ? "Hidden · allowed for this student" : "Hidden from students";
        else if (globalHidden) about = "Hidden from students";
        else if (personalHidden) about = "Hidden for this student";
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
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + '"><button class="day saas-card" type="button" data-lm-open="' + material.id + '"><span class="date saas-badge saas-badge-muted"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(material.title || "Untitled lesson") + "</b>" + courseHtml + '<span class="label about saas-badge ' + (material.published ? 'saas-badge-active' : 'saas-badge-muted') + '">' + esc(about) + "</span></button>" + tools + "</div>";
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
      const group = classGroups.find((row) => row.lessonIds.includes(id));
      if (group) classGroupId = group.id;
      lmState = found;
      lmLibrary.activeId = id;
      found.mode = canEditLessons() && !found.published ? "edit" : "preview";
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
      if (lmState && lmState.id === id) lmState = null;
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
        const scriptInput = document.getElementById('lmScriptInput');
        if (scriptInput) scriptInput.value = '';
        const scriptStatus = document.getElementById('lmScriptStatus');
        if (scriptStatus) scriptStatus.textContent = '';
        const pdfStatus = document.getElementById('lmPdfImportStatus');
        if (pdfStatus) { pdfStatus.textContent = ''; pdfStatus.hidden = true; }
        const scriptFile = document.querySelector('[data-lesson-script-file]');
        if (scriptFile) scriptFile.value = '';
        const pdfFile = document.querySelector('[data-lesson-pdf-import-file]');
        if (pdfFile) pdfFile.value = '';
      }
      const fresh = lmBlankMaterial();
      fresh.id = lmUniqueId();
      fresh.date = lmToday();
      groupNormalize();
      const group = classGroups.find((row) => row.id === classGroupId) || classGroups[0];
      if (group && !group.lessonIds.includes(fresh.id)) group.lessonIds.push(fresh.id);
      lmState = fresh;
      fresh.mode = "edit";
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
        const meta = event.target.closest("[data-meta]");
        if (meta && lmState) { lmState[meta.dataset.meta] = meta.value; lmSchedule(); return; }
        const field = event.target.closest("[data-field]");
        if (field) {
          const block = lmBlock(field.dataset.block);
          if (block) {
            if (field.dataset.field === "memorySize") block.memorySize = Math.max(2, Number(field.value) || 4);
            else block[field.dataset.field] = field.type === "checkbox" ? field.checked : field.value;
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
        const write = event.target.closest("[data-write]");
        if (write) {
          const bits = write.dataset.write.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.typed = write.value;
          lmSchedule();
          return;
        }
        const rich = event.target.closest("[data-rich]");
        if (rich) { const block = lmBlock(rich.dataset.rich); if (block) block.html = rich.innerHTML; lmSchedule(); }
      });
      lmRoot.addEventListener("change", (event) => {
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
        const pick = event.target.closest("[data-pick]");
        if (pick) {
          const bits = pick.dataset.pick.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.picked = Number(bits[2]);
        }
      });
      lmRoot.addEventListener("click", (event) => {
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
        const fold = event.target.closest("[data-lm-fold]");
        if (fold) { const block = lmBlock(fold.dataset.lmFold); if (block) block.collapsed = !block.collapsed; lmRenderEditor(); lmSchedule(); return; }
        const edit = event.target.closest("[data-lm-edit]");
        if (edit) {
          const block = lmBlock(edit.dataset.lmEdit);
          if (block) block.collapsed = false;
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
          if (block) block.items.forEach((question) => {
            question.marked = true;
            question.correct = question.kind === "write" ? String(question.typed || "").trim().toLowerCase() === String(question.write || "").trim().toLowerCase() : Number(question.picked) === Number(question.answer);
          });
          lmRenderPreview();
          lmSchedule();
          return;
        }
        const quizCheck = event.target.closest("[data-quiz-check]");
        if (quizCheck) {
          const block = lmBlock(quizCheck.dataset.quizCheck);
          if (block) {
            const score = block.items.reduce((sum, question) => sum + (Number(question.picked) === Number(question.answer) ? 1 : 0), 0);
            block.score = score + " / " + block.items.length;
            const out = lmRoot.querySelector('[data-quiz-score="' + block.id + '"]');
            if (out) out.textContent = block.score;
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
        const block = event.target.closest(".lm-block");
        if (!block || !block.getAttribute("draggable")) return;
        event.dataTransfer.setData("text/plain", block.dataset.blockId);
      });
      lmRoot.addEventListener("dragover", (event) => {
        if (event.target.closest(".lm-block") || event.target.closest(".lm-drop")) event.preventDefault();
        const over = event.target.closest(".lm-block");
        lmRoot.querySelectorAll(".lm-block").forEach((item) => item.classList.toggle("is-over", item === over && event.target.closest("[data-grip], .lm-block") && !event.target.closest(".lm-drop")));
      });
      lmRoot.addEventListener("drop", (event) => {
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
      document.getElementById("lmSave").addEventListener("click", () => { if (!canEditLessons()) return; lmState.published = false; lmState.mode = "edit"; lmKeepLesson(); lmPersist(); lmRenderEditor(); lmNote(lmState && lmState.examOwned ? "Draft saved." : "Draft saved. The lesson is in Classes."); });
      document.getElementById("lmPublish").addEventListener("click", () => {
        if (!canEditLessons()) return;
        lmSortWordcardsForPublish();
        lmState.published = true;
        lmState.mode = "preview";
        lmKeepLesson();
        lmPersist();
        lmNote("");
        lmShow("preview");
      });
      const lmNew = document.getElementById("lmNew");
      if (lmNew) lmNew.addEventListener("click", lmCreateLesson);
      const groupNew = document.getElementById("groupNew");
      if (groupNew) groupNew.addEventListener("click", groupCreate);
      paintLmDays();
    }

