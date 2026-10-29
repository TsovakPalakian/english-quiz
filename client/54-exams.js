    let examHold = null;
    let examCurrentId = "";
    let examKnown = null;
    let examReady = false;
    let examPulling = false;
    let examFlight = null;
    let examSession = 0;
    const examBaselines = new Map();
    function examPreload() {
      examPull();
      examPullWork();
    }
    function examResetAccount() {
      examSection='active';
      examSession += 1;
      examKnown = null;
      examReady = false;
      examPulling = false;
      examFlight = null;
      examBaselines.clear();
      examResetWork();
    }
    function examLoad() {
      if (authUser?.role === "USER" && !examReady) return [];
      try {
        const list = JSON.parse(localStorage.getItem("enquiz-exams") || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }
    function examWire(exam) {
      const numeric = (value) => Number.isSafeInteger(value) && value > 0;
      return {
        ...(numeric(exam.id) ? { id: exam.id } : {}),
        ...(numeric(exam.groupId) ? {groupId:exam.groupId} : {}),
        title: exam.title || "Exam",
        date: exam.date || "",
        published: !!exam.published,
        hidden: !!exam.hidden,
        blocks: (exam.blocks || []).map((block) => {
          const doc = block.doc || {};
          return {
            ...(numeric(block.id) ? { id: block.id } : {}),
            title: doc.title || "Examination block",
            published: !!doc.published,
            hidden: !!block.hidden,
            materials: (doc.blocks || []).map((part) => {
              const copy = JSON.parse(JSON.stringify(part));
              if (!numeric(copy.id)) delete copy.id;
              if (Array.isArray(copy.items)) copy.items.forEach((item) => { if (item) delete item.given; });
              return copy;
            })
          };
        })
      };
    }
    function examFromWire(row) {
      return {
        id: row.id,
        stageRevision: row.revision || 0,
        groupId: row.groupId || null,
        instanceStatus:row.instanceStatus||null,
        groupTitle:row.groupTitle||'',
        completedAt:row.completedAt||null,
        studentId:row.studentId||null,
        studentName:row.studentName||'',
        maximumPoints:row.maximumPoints,
        earnedPoints:row.earnedPoints,
        title: row.title || "Exam",
        date: row.date || "",
        published: !!row.published,
        hidden: !!row.hidden,
        personalHidden: !!row.personalHidden,
        created: row.created || Date.now(),
        blocks: (row.blocks || []).map((block) => ({
          id: block.id,
          hidden: !!block.hidden,
          personalHidden: !!block.personalHidden,
          doc: {
            id: block.id,
            title: block.title || "Examination block",
            description: block.materials?.find(part=>part.documentFormatting)?.documentFormatting?.description?.runs?.map(run=>run.text).join('')||"",
            className: "",
            unit: "",
            lesson: "",
            date: row.date || "",
            published: !!block.published,
            mode: block.published ? "preview" : "edit",
            blocks: block.materials || [],
            examOwned: true,
            examId: row.id,
            blockId: block.id,
            studentSaved: false
          }
        }))
      };
    }
    function examRemoteSave(exam) {
      if (!exam || typeof accountFetch !== "function") return Promise.resolve();
      const session = examSession, actor = authUser?.id;
      return accountFetch("/api/exams", { method: "POST", body: JSON.stringify({ exam: examWire(exam) }) }).then((saved) => {
        if (session !== examSession || actor !== authUser?.id) return;
        if (!saved || !saved.id) return;
        const exams = examLoad();
        const local = exams.find((row) => row.id === exam.id);
        if (!local) return;
        local.id = saved.id;
        if (examCurrentId === exam.id) examCurrentId = saved.id;
        (saved.blocks || []).forEach((block, index) => {
          const previous = local.blocks?.[index];
          if (!previous) return;
          const oldId = previous.id;
          previous.id = block.id;
          Object.assign(previous.doc, { id: block.id, examId: saved.id, blockId: block.id });
          if (lmState?.examOwned && lmState.examId === exam.id && lmState.blockId === oldId) {
            Object.assign(lmState, { id: block.id, examId: saved.id, blockId: block.id });
            lmBindEditor();
            rememberPlace();
          }
        });
        examBaselines.set(saved.id, JSON.stringify(examWire(local)));
        examKnown?.add(saved.id);
        try { localStorage.setItem("enquiz-exams", JSON.stringify(exams)); } catch (e) {}
        examPaintList();
        const blocks = document.getElementById("examblocks");
        if (examCurrentId && blocks && blocks.classList.contains("on")) examPaintBlocks();
        return saved;
      });
    }
    function examRemoteDrop(id) {
      if (!Number.isSafeInteger(id) || id < 1 || typeof accountFetch !== "function") return Promise.resolve();
      examBaselines.delete(id);
      return window.LearningMain.archiveItem("exam", id);
    }
    function examPush(list) {
      if (!examReady || !canEditLessons() || typeof accountFetch !== "function") return Promise.resolve();
      const rows = Array.isArray(list) ? list.filter(row=>!row.instanceStatus) : [];
      const ids = new Set(rows.map((row) => row && row.id).filter(Boolean));
      const instanceIds=new Set((list||[]).filter(row=>row.instanceStatus).map(row=>row.id));
      const gone = examKnown ? [...examKnown].filter((id) => !ids.has(id)&&!instanceIds.has(id)) : [];
      examKnown = ids;
      const dirtyRows = rows.filter((row) => {
        if (!row) return false;
        if (!Number.isSafeInteger(row.id) || row.id < 1) return true;
        return examBaselines.get(row.id) !== JSON.stringify(examWire(row));
      });
      return Promise.all(gone.map(examRemoteDrop).concat(dirtyRows.map(examRemoteSave)));
    }
    let examSaveQueue = Promise.resolve();
    function examSave(list) {
      try { localStorage.setItem("enquiz-exams", JSON.stringify(list)); } catch (e) {}
      const session = examSession, actor = authUser?.id;
      const task = examSaveQueue.catch(() => {}).then(() => {
        if (session !== examSession || actor !== authUser?.id) return;
        return examPush(examLoad());
      });
      examSaveQueue = task;
      task.catch((error) => window.LearningMain?.notice(error.message, true));
      return task;
    }
    function examPull(force = false) {
      if (!force && examPulling) return examFlight || Promise.resolve();
      if ((!force && examReady) || !authUser || typeof accountFetch !== "function") return Promise.resolve();
      if (force) examSession += 1;
      examPulling = true;
      const session = examSession;
      const actorId = authUser.id;
      const target = viewAccount?.id || '', generation = viewGen;
      examFlight = accountFetch("/api/exams" + (target ? "?for=" + encodeURIComponent(target) : "")).then((data) => {
        if (session !== examSession || !authUser || authUser.id !== actorId || generation !== viewGen || target !== (viewAccount?.id || '')) return;
        const remote = Array.isArray(data && data.exams) ? data.exams.map(examFromWire) : [];
        examKnown = new Set(remote.filter(row=>!row.instanceStatus).map((row) => row.id));
        remote.forEach((row) => {
          if (Number.isSafeInteger(row.id)) examBaselines.set(row.id, JSON.stringify(examWire(row)));
        });
        examReady = true;
        examPulling = false;
        try { localStorage.setItem("enquiz-exams", JSON.stringify(remote)); } catch (e) {}
        examPaintList();
        const blocks = document.getElementById("examblocks");
        if (examCurrentId && blocks && blocks.classList.contains("on")) examPaintBlocks();
      }).catch((error) => {
        if (session === examSession && authUser && authUser.id === actorId) examPulling = false;
        window.LearningMain?.notice(error.message, true);
      });
      return examFlight;
    }
    function examFind(id) {
      id = domEntityId(id);
      return examLoad().find((row) => row.id === id) || null;
    }
    async function examOpenSelected(id){
      id=domEntityId(id);
      let exam=examFind(id);
      if(exam?.studentId&&isTeacher()&&!viewAccount){
        const actor=authUser?.id,generation=viewGen,page=document.querySelector('section.on')?.id;
        examReady=false;await examPull(true);
        if(!examReady||actor!==authUser?.id||generation!==viewGen||page!==document.querySelector('section.on')?.id)return;
        exam=examFind(id);
        if(!exam){window.LearningMain?.notice('This work is no longer available in this group.');return;}
        materialReviewStudent={id:exam.studentId,name:exam.studentName,email:exam.studentEmail};examResetWork();
      }
      if(!exam)return;
      examCurrentId=id;visit('examblocks');
    }
    let examWork = {};
    let examWorkLoadedFor = "";
    let examWorkPulling = false;
    let examWorkSession = 0;
    function examResetWork() {
      examWorkSession += 1;
      examWorkLoadedFor = "";
      examWorkPulling = false;
    }
    function examWorkAccount() {
      return (viewAccount && viewAccount.id) || (typeof materialReviewStudent!=='undefined'&&materialReviewStudent?.id) || (authUser && authUser.id) || "";
    }
    function examWorkBag() {
      const id = examWorkAccount();
      if (!id) return {};
      if (!examWork[id]) {
        try { examWork[id] = JSON.parse(localStorage.getItem("enquiz-exam-work-" + id) || "{}"); }
        catch (e) { examWork[id] = {}; }
      }
      return examWork[id];
    }
    function examWorkWrite() {
      const id = examWorkAccount();
      if (!id) return;
      try { localStorage.setItem("enquiz-exam-work-" + id, JSON.stringify(examWork[id] || {})); } catch (e) {}
    }
    function assessmentActive(doc) { return !!doc && (!!doc.examOwned || (doc.blocks || []).some(part => part.assessed)); }
    function assessmentRubric(item) {
      return String(item.criteria || '').split('\n').map(line => { const [label, points] = line.split('|'); return {label:label.trim(), max:Number(String(points).replace(',','.'))}; }).filter(row => row.label && Number.isFinite(row.max) && row.max > 0 && row.max <= 1e12).slice(0,20);
    }
    function assessmentMax(part, index) {
      const item = part.type === 'task' ? part : (part.items || [])[index] || {}, criteria = assessmentRubric(item);
      return criteria.length ? criteria.reduce((n,c) => n + c.max,0) : Number(String(item.maxPoints ?? part.maxPoints ?? 1).replace(',','.'));
    }
    function assessmentAnswerQuestions(doc) {
      return (doc.blocks || []).filter(part => ['quiz','exercise','task'].includes(part.type) && (doc.examOwned || part.assessed)&&(!doc.examOwned||!doc.blocks.some(p=>p.scoringVersion===2)||!examScoringChildren(doc.blocks,part).length)).flatMap(part => (part.type === 'task' ? [part] : part.items || []).map((item,index) => ({part,index,max:assessmentMax(part,index)})));
    }
    function assessmentUnitMax(part) {
      if(lmState?.examOwned&&lmState.blocks?.some(p=>p.scoringVersion===2))return examScoringMax(lmState.blocks,part);
      const criteria = assessmentRubric(part);
      if (criteria.length) return criteria.reduce((n,c) => n + c.max,0);
      if (part.gradeMode === 'assignment') return Number(String(part.maxPoints ?? 1).replace(',','.'));
      return part.type === 'task' ? assessmentMax(part,0) : (part.items || []).reduce((n,_,i) => n + assessmentMax(part,i),0);
    }
    function assessmentQuestions(doc) {
      if(doc.examOwned&&doc.blocks.some(part=>part.scoringVersion===2))return doc.blocks.filter(part=>['quiz','exercise','task'].includes(part.type)&&!examScoringChildren(doc.blocks,part).length).map(part=>({part,index:0,max:examScoringMax(doc.blocks,part)}));
      const seen = new Set(), result = [];
      for (const part of (doc.blocks || []).filter(p => ['quiz','exercise','task'].includes(p.type) && (doc.examOwned || p.assessed))) {
        if (part.gradeMode !== 'assignment') { result.push(...assessmentAnswerQuestions({...doc,blocks:[part]})); continue; }
        const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (seen.has(key)) continue; seen.add(key);
        const leader = (doc.blocks || []).find(p => p.assignmentId === key && p.gradeMode === 'assignment' && ['quiz','exercise','task'].includes(p.type)) || part;
        result.push({part:leader,index:0,max:assessmentUnitMax(leader)});
      }
      return result;
    }
    function examScoringChildren(parts,part){return parts.filter(child=>child!==part&&['task','quiz','exercise'].includes(child.type)&&child.assignmentKey&&child.assignmentKey===(part.assignmentId||('part-'+part.id)));}
    function examScoringMax(parts,part,seen=new Set()){
      if(seen.has(part))return 0;seen.add(part);const children=examScoringChildren(parts,part);
      if(children.length)return Number(children.reduce((sum,child)=>sum+examScoringMax(parts,child,new Set(seen)),0).toFixed(10));
      const criteria=assessmentRubric(part);return criteria.length?criteria.reduce((sum,row)=>sum+row.max,0):Number(String(part.maxPoints??1).replace(',','.'));
    }
    function assessmentGroupEditor(block) {
      const tasks = (lmState.blocks || []).filter(p => ['quiz','exercise','task'].includes(p.type));
      if (!tasks.length) return '';
      tasks.forEach(p => { p.assignmentId ||= 'a-' + crypto.randomUUID(); });
      return '<label>Assignment<select data-field="assignmentKey" data-block="' + block.id + '"><option value="">Standalone</option>' + tasks.filter(p => p.id !== block.id && !p.assignmentKey).map(p => '<option value="' + esc(p.assignmentId) + '"' + (block.assignmentKey === p.assignmentId ? ' selected' : '') + '>' + esc(p.title || lmSummary(p) || 'Task') + '</option>').join('') + '</select></label>';
    }
    function assessmentKey(doc) { return (doc.examOwned ? doc.examId : 'lesson') + '/' + (doc.examOwned ? doc.blockId : doc.id); }
    function assessmentApply(doc,row) {
      doc.studentSaved = !!row.saved; doc.assessmentState = row.state || (row.saved ? 'submitted' : 'draft'); doc.assessmentRevision = row.revision || 0;
      doc.examCorrections = row.corrections || {}; doc.examPoints = row.points || {}; doc.examErrors = row.errors || {}; doc.examCriteriaPoints = row.criteriaPoints || {};
      doc.examReviewText = row.reviewText || {};
      doc.examAnswerText=row.answerText||{};doc.examCommentFormatting=row.commentFormatting||{};
      if (row.saved && row.materials?.length) {
        if (doc.examOwned) doc.blocks = row.materials;
        else doc.blocks = (doc.blocks || []).map(part => row.materials.find(p => String(p.id) === String(part.id)) || part);
      }
      (doc.blocks || []).forEach(part => {
        if (!doc.examOwned && !part.assessed) return;
        const given = (row.answers || {})[part.id] || {};
        if (part.type === 'task') part.response = given[0] || '';
        (part.items || []).forEach((item,index) => { item.given = given[index] ?? ''; });
      });
      doc.assessmentReady = true;
    }
    function assessmentStatus(message,doc=lmState) {
      if (doc !== lmState) return;
      let box = document.getElementById('assessmentSummary');
      if (!box) { box = document.createElement('div'); box.id = 'assessmentSummary'; box.className = 'assessment-summary'; document.querySelector('#material .lm-meta')?.after(box); }
      box.hidden = !assessmentActive(doc);
      if (box.hidden) return;
      const qs = assessmentQuestions(doc), max = Math.round(qs.reduce((n,q) => n + q.max,0)*1e8)/1e8, graded = qs.filter(q => doc.examPoints?.[q.part.id]?.[q.index] != null && doc.examPoints[q.part.id][q.index] !== '');
      const earned = Math.round(graded.reduce((n,q) => n + Number(String(doc.examPoints[q.part.id][q.index]).replace(',','.')),0)*1e8)/1e8;
      const states = {draft:'Draft',submitted:'Submitted',reviewing:'Being reviewed',published:'Results published'};
      box.innerHTML = '<strong>' + esc(states[doc.assessmentState] || 'Draft') + '</strong><span>Maximum: ' + esc(String(max)) + ' points</span>' + (canTuneStudentLessons() || doc.assessmentState === 'published' ? '<span>' + esc(String(earned)) + ' / ' + esc(String(max)) + ' · ' + graded.length + ' / ' + qs.length + ' graded</span>' : '') + '<span role="status" aria-live="polite">' + esc(message || doc.assessmentMessage || '') + '</span>';
      if (doc.assessmentError) box.innerHTML += '<button class="lm-btn" type="button" id="assessmentRetry">Retry saving</button>';
    }
    async function assessmentRead(doc) {
      if (doc.assessmentLoading) return;
      doc.assessmentLoading = true;
      const account = examWorkAccount(), kind = doc.examOwned ? 'exam-block' : 'lesson', id = doc.examOwned ? doc.blockId : doc.id;
      assessmentStatus('Loading answers…',doc);
      try {
        if (assessmentPendingDoc && assessmentKey(assessmentPendingDoc) === assessmentKey(doc)) {
          clearTimeout(assessmentTimer); const pendingDoc = assessmentPendingDoc; assessmentPendingDoc = null;
          await assessmentWrite(pendingDoc,'draft').catch(() => {});
        }
        await assessmentQueue.catch(() => {});
        const target=doc.reviewStudentId||viewAccount?.id;
        const row = await accountFetch('/api/assessment?kind=' + kind + '&id=' + id + (target ? '&student=' + encodeURIComponent(target) : ''),{signal:AbortSignal.timeout(20000)});
        if (account !== examWorkAccount()) return;
        const pending = examWorkBag()[assessmentKey(doc)]?.pendingAnswers;
        const recovered = pending && !row.saved ? {...row,answers:pending,pendingAnswers:pending} : row;
        assessmentApply(doc,recovered); examWorkBag()[assessmentKey(doc)] = recovered; examWorkWrite();
        if (pending && !row.saved) { doc.assessmentError = true; doc.assessmentMessage = 'Unsaved answers recovered. Retry saving.'; }
        else { doc.assessmentError = false; doc.assessmentMessage = ''; }
        if (doc === lmState) { lmRenderPreview(); examDress(); }
      } catch(error) { doc.assessmentError = true; doc.assessmentMessage = error.message || 'Could not load answers.'; if (doc === lmState) assessmentStatus(doc.assessmentMessage,doc); }
      finally { doc.assessmentLoading = false; }
    }
    let assessmentQueue = Promise.resolve(), assessmentTimer, assessmentPendingDoc;
    function assessmentWrite(doc,action,extra={}) {
      const account = examWorkAccount(), actor = authUser?.id, target = doc.reviewStudentId||viewAccount?.id;
      const payload = {kind:doc.examOwned ? 'exam-block' : 'lesson',id:doc.examOwned ? doc.blockId : doc.id,action,autoPublish:!!(doc.autoPublish||doc.blocks?.some(p=>p.autoPublish)),answers:examCollectAnswers(doc),points:JSON.parse(JSON.stringify(doc.examPoints || {})),corrections:JSON.parse(JSON.stringify(doc.examCorrections || {})),errors:JSON.parse(JSON.stringify(doc.examErrors || {})),criteriaPoints:JSON.parse(JSON.stringify(doc.examCriteriaPoints || {})),...extra};
      if (target) payload.studentId = target;
      payload.reviewText = JSON.parse(JSON.stringify(doc.examReviewText || {}));
      payload.answerText=JSON.parse(JSON.stringify(doc.examAnswerText||{}));payload.commentFormatting=JSON.parse(JSON.stringify(doc.examCommentFormatting||{}));
      const task = assessmentQueue.catch(() => {}).then(async () => {
        if (actor !== authUser?.id || account !== examWorkAccount()) throw new Error('Account changed. Reopen the material.');
        if (!doc.assessmentReady) throw new Error('Load answers before saving.');
        payload.expectedRevision = doc.assessmentRevision || 0;
        assessmentStatus('Saving…',doc);
        const row = await accountFetch('/api/assessment',{method:'POST',body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
        doc.assessmentRevision = row.revision; doc.assessmentState = row.state; doc.studentSaved = !!row.saved; doc.assessmentError = false;
        doc.assessmentMessage = row.state === 'published' ? 'Results published' : action === 'draft' ? 'Draft saved' : action === 'submit' ? 'Submitted' : action === 'publish' ? 'Results published' : 'Saved';
        const pending = examWorkBag()[assessmentKey(doc)]?.pendingAnswers;
        examWorkBag()[assessmentKey(doc)] = {...row,...(action === 'draft' && pending && JSON.stringify(pending) !== JSON.stringify(row.answers) ? {pendingAnswers:pending} : {})}; examWorkWrite();
        if (action !== 'draft') {
          assessmentApply(doc,row);
          if (doc === lmState) { lmRenderPreview(); examDress(); }
        }
        assessmentStatus(doc.assessmentMessage,doc); examPaintList(); if (examCurrentId) examPaintBlocks();
        if(doc.examOwned&&['submit','publish','amend'].includes(action))await examPull(true);
        return row;
      }).catch(error => { doc.assessmentError = true; doc.assessmentMessage = error.message || 'Not saved. Retry.'; assessmentStatus(doc.assessmentMessage,doc); throw error; });
      assessmentQueue = task; return task;
    }
    function assessmentAutosave(doc) {
      clearTimeout(assessmentTimer);
      if (assessmentPendingDoc && assessmentPendingDoc !== doc && !assessmentPendingDoc.studentSaved) assessmentWrite(assessmentPendingDoc,'draft').catch(() => {});
      assessmentPendingDoc = doc; doc.assessmentMessage = 'Unsaved changes'; assessmentStatus(doc.assessmentMessage,doc);
      const bag = examWorkBag(), key = assessmentKey(doc);
      const answers = examCollectAnswers(doc); bag[key] = {...bag[key],answers,pendingAnswers:answers}; examWorkWrite();
      assessmentTimer = setTimeout(() => { assessmentPendingDoc = null; assessmentWrite(doc,'draft').catch(() => {}); },700);
    }
    function examPullWork() {
      const account = examWorkAccount();
      if (!account || examWorkPulling || typeof accountFetch !== "function") return;
      examWorkPulling = true;
      examWorkLoadedFor = account;
      const session = examSession;
      const workSession = examWorkSession;
      const reviewTarget=viewAccount?.id||(typeof materialReviewStudent!=='undefined'&&materialReviewStudent?.id);
      const path = "/api/exams/work" + (reviewTarget ? "?student=" + encodeURIComponent(reviewTarget) : "");
      accountFetch(path).then((data) => {
        if (session !== examSession || workSession !== examWorkSession || account !== examWorkAccount()) return;
        const cached = examWorkBag(), bag = {};
        (data && data.work || []).forEach((row) => {
          const key = row.examId + '/' + row.blockId;
          bag[key] = { ...row, saved: !!row.saved, answers: row.answers || {}, corrections: row.corrections || {}, points: row.points || {}, ...(!row.saved && cached[key]?.pendingAnswers ? {pendingAnswers:cached[key].pendingAnswers} : {}) };
        });
        for (const [key,row] of Object.entries(cached)) if (!bag[key] && (key.startsWith('lesson/') || row.pendingAnswers)) bag[key] = row;
        examWork[account] = bag;
        examWorkWrite();
        examWorkPulling = false;
        examPaintList();
        const blocks = document.getElementById("examblocks");
        if (examCurrentId && blocks && blocks.classList.contains("on")) examPaintBlocks();
      }).catch(() => {
        if (session !== examSession || workSession !== examWorkSession) return;
        examWorkPulling = false;
        examWorkLoadedFor = "";
      });
    }
    function examApplyWork(exam) {
      const bag = examWorkBag();
      (exam.blocks || []).forEach((block) => {
        const row = bag[exam.id + "/" + block.id];
        if (!row || !block.doc) return;
        block.doc.studentSaved = !!row.saved;
        block.doc.assessmentState = row.state || (row.saved ? 'submitted' : 'draft');
        block.doc.assessmentRevision = row.revision || 0;
        block.doc.examErrors = row.errors || {};
        block.doc.examCriteriaPoints = row.criteriaPoints || {};
        block.doc.examCorrections = row.corrections || {};
        block.doc.examPoints = row.points || {};
        const answers = row.answers || {};
        (block.doc.blocks || []).forEach((part) => {
          const given = answers[part.id] || {};
          if (part.type === "task") part.response = given[0] || "";
          (part.items || []).forEach((item, index) => { if (item && given[index] != null) item.given = given[index]; });
        });
      });
      return exam;
    }
    function examView(id) {
      const exam = examFind(id);
      if (!exam) return null;
      return examApplyWork(JSON.parse(JSON.stringify(exam)));
    }
    function examShown() {
      return examLoad().map((exam) => examApplyWork(JSON.parse(JSON.stringify(exam))));
    }
    function examStripDoc(doc) {
      if (!doc) return;
      delete doc.studentSaved;
      delete doc.examPoints;
      delete doc.examCorrections;
      for (const key of Object.keys(doc)) if (key.startsWith('assessment') || ['examErrors','examCriteriaPoints'].includes(key)) delete doc[key];
      (doc.blocks || []).forEach(part => { if (part.type === 'task') delete part.response; });
      (doc.blocks || []).forEach((part) => (part.items || []).forEach((item) => { if (item) delete item.given; }));
    }
    function examCollectAnswers(doc) {
      const answers = {};
      (doc.blocks || []).forEach((part) => {
        if (!part || !["quiz", "exercise", "task"].includes(part.type)) return;
        if (!doc.examOwned && !part.assessed) return;
        const row = {};
        if (part.type === "task" && part.response) row[0] = part.response;
        (part.items || []).forEach((item, index) => { if (item && item.given != null && item.given !== "") row[index] = item.given; });
        if (Object.keys(row).length) answers[part.id] = row;
      });
      return answers;
    }
    function examPointsTotal(block) {
      const map = (block.doc && block.doc.examPoints) || {};
      let sum = 0;
      Object.keys(map).forEach((partId) => {
        const row = map[partId] || {};
        Object.keys(row).forEach((index) => { sum += Number(String(row[index]).replace(',','.')) || 0; });
      });
      return sum;
    }
    function examVisibleBlocks(exam) {
      return (exam.blocks || []).filter((block) => canEditLessons() || (block.doc && block.doc.published && !block.hidden));
    }
    function examReadyForReview(exam) {
      const blocks = examVisibleBlocks(exam);
      return blocks.length > 0 && blocks.every((block) => block.doc && block.doc.studentSaved);
    }
    function examStamp(exam) {
      if (!exam) return false;
      if(exam.instanceStatus)return false;
      const published = (exam.blocks || []).some((block) => block.doc && block.doc.published);
      if (!!exam.published === published) return false;
      exam.published = published;
      return true;
    }
    function examSync() {
      if (!lmState || !lmState.examOwned || !canEditLessons()) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === lmState.examId);
      const block = exam && (exam.blocks || []).find((row) => row.id === lmState.blockId);
      if (!block) return;
      const copy = JSON.parse(JSON.stringify(lmState));
      examStripDoc(copy);
      block.doc = copy;
      examStamp(exam);
      return examSave(exams);
    }
    globalThis.examSync = examSync;
    function examLeave() {
      if (lmState && lmState.examOwned) {
        examSync();
        lmState = examHold;
      }
      examHold = null;
      const root = document.getElementById("material");
      if (root) {
        root.classList.remove("is-exam-locked");
        root.classList.remove("is-exam-restricted", "notranslate");
        root.removeAttribute("translate");
        const back = root.querySelector("[data-nav-back]");
        if (back) {
          back.dataset.fallback = "days";
          back.classList.remove("back-text");
          back.classList.add("icon");
          back.setAttribute("aria-label", "Back");
          back.innerHTML = backArrow;
        }
      }
      document.querySelectorAll("[data-exam-quiz]").forEach((btn) => { btn.hidden = true; });
      const save = document.getElementById("examSave");
      if (save) save.hidden = true;
    }
    function examStudentRestricted() {
      return authUser?.role === "USER" && !viewAccount && lmState?.examOwned && document.querySelector("section.on")?.id === "material";
    }
    document.addEventListener("click", (event) => {
      if (!examStudentRestricted() || !event.target.closest("#material")) return;
      if (event.target.closest("[data-read], [data-lm-word], [data-rule-open], [data-content-copy], [data-ex-check], [data-quiz-check], [data-usages]")) {
        event.preventDefault(); event.stopImmediatePropagation(); hideSelpop();
      }
    }, true);
    for (const type of ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart", "drop"]) document.addEventListener(type, (event) => {
      if (!examStudentRestricted() || !event.target.closest?.("#material")) return;
      if (type === "selectstart" && event.target.closest("input, textarea")) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    function examDress() {
      const root = document.getElementById("material");
      const owned = assessmentActive(lmState);
      const reviewer = owned && canTuneStudentLessons();
      const taking = owned && !canEditLessons() && !reviewer;
      const locked = taking && !!lmState.studentSaved;
      if (root) root.classList.toggle("is-exam-locked", locked);
      if (root) {
        const restricted = !!lmState?.examOwned && authUser?.role === "USER" && !viewAccount;
        root.classList.toggle("is-exam-restricted", restricted);
        root.classList.toggle("notranslate", restricted);
        if (restricted) { root.setAttribute("translate", "no"); hideSelpop(); }
        else root.removeAttribute("translate");
      }
      const save = document.getElementById("examSave");
      if (save) { save.hidden = reviewer ? !lmState.studentSaved || lmState.assessmentState === 'published' : (!taking || locked); save.textContent = reviewer ? 'Save review' : 'Submit'; save.disabled = !lmState?.assessmentReady || !!lmState?.assessmentBusy; }
      document.getElementById('assessmentPublish').textContent = lmState?.examOwned ? 'Publish review' : 'Publish results';
      document.getElementById('assessmentAmend').textContent = lmState?.examOwned ? 'Reopen review' : 'Amend review';
      for (const [id,visible] of [['assessmentPublish',reviewer && lmState.studentSaved && lmState.assessmentState !== 'published'],['assessmentReopen',reviewer && lmState.studentSaved && !lmState.examOwned],['assessmentAmend',reviewer && lmState.assessmentState === 'published'],['assessmentHistory',reviewer]]) {
        const button = document.getElementById(id); if (button) { button.hidden = !visible; button.disabled = !lmState?.assessmentReady || !!lmState?.assessmentBusy; }
      }
      assessmentStatus();
      document.querySelectorAll("[data-exam-quiz]").forEach((btn) => { btn.hidden = !owned || !canEditLessons(); });
      if (!owned || !root) return;
      const back = root.querySelector("[data-nav-back]");
      if (back && lmState.examOwned) {
        back.dataset.fallback = "examblocks";
        back.classList.remove("back-text");
        back.classList.add("icon");
        back.setAttribute("aria-label", "Back");
        back.innerHTML = backArrow;
      }
      const heading = root.querySelector(".lm-meta h1");
      if (heading && lmState.examOwned) heading.textContent = "Examination block";
      if (lmState.examOwned) root.querySelectorAll(".lm-chrome").forEach((chrome) => { chrome.hidden = true; });
      if (taking || reviewer) examFillAnswers();
      if ((taking || reviewer) && !lmState.assessmentReady) root.querySelectorAll('[data-exam-given],[data-exam-response],[data-exam-points],[data-exam-fix],[data-exam-error],[data-exam-criterion]').forEach(input => { input.disabled = true; });
      if (reviewer && (!lmState.studentSaved || lmState.assessmentState === 'published')) root.querySelectorAll('[data-exam-points],[data-exam-fix],[data-exam-error],[data-exam-criterion]').forEach(input => { input.disabled = true; });
    }
    globalThis.examDress = examDress;
    function examSame(given, right) {
      if (Array.isArray(right)) {
        const left = (Array.isArray(given) ? given : []).map(Number).sort().join(",");
        return left === right.map(Number).slice().sort().join(",");
      }
      return String(given == null ? "" : given).trim().toLowerCase() === String(right == null ? "" : right).trim().toLowerCase();
    }
    function examRight(item, kind) {
      if (!item) return null;
      if (kind === "Select all") return Array.isArray(item.answers) ? item.answers : null;
      if (kind === "Match" || kind === "Memory") return item.right || "";
      if (item.answer == null || item.answer === "") return null;
      return item.answer;
    }
    function examMarkClass(reviewer, given, right, value) {
      if (!reviewer || right == null || right === "") return "";
      if (Array.isArray(right)) {
        const correct = right.map(Number);
        const chosen = (Array.isArray(given) ? given : []).map(Number);
        if (correct.indexOf(Number(value)) >= 0) return " exam-hit";
        if (chosen.indexOf(Number(value)) >= 0) return " exam-miss";
        return "";
      }
      if (examSame(value, right)) return " exam-hit";
      if (examSame(given, value)) return " exam-miss";
      return "";
    }
    function examPointInput(block, index, whole=false) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      const individual=lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2);
      if(individual&&!whole){const mark=lmState.examErrors?.[block.id]?.[index]||'';return '<label>Review<select data-exam-error="'+block.id+':'+index+'"><option value="">Unmarked</option><option value="correct"'+(mark==='correct'?' selected':'')+'>Correct</option><option value="needs-work"'+(mark==='needs-work'?' selected':'')+'>Needs work</option></select></label>';}
      if (!individual&&block.gradeMode === 'assignment' && !whole) return '';
      const value = ((lmState.examPoints || {})[block.id] || {})[index];
      const shown = value == null || value === "" ? "" : String(value);
      const mark = ((lmState.examErrors || {})[block.id] || {})[index] || '';
      const item = individual||whole || block.type === 'task' ? block : (block.items || [])[index] || {}, criteria = assessmentRubric(item);
      const maximum = individual||whole ? assessmentUnitMax(block) : assessmentMax(block,index);
      const criteriaHtml = criteria.map((criterion,i) => '<label>' + esc(criterion.label) + ' / ' + criterion.max + '<input type="number" min="0" max="' + criterion.max + '" step="any" data-exam-criterion="' + block.id + ':' + index + ':' + i + '" value="' + esc(String(lmState.examCriteriaPoints?.[block.id]?.[index]?.[i] ?? '')) + '"></label>').join('');
      return '<div class="assessment-grading">' + criteriaHtml + '<label class="exam-point">Points / ' + maximum + ' <input class="exam-points" type="text" inputmode="decimal" data-exam-points="' + block.id + ":" + index + '" value="' + esc(shown) + '" /></label><label>Review<select data-exam-error="' + block.id + ':' + index + '"><option value="">Unmarked</option><option value="correct"' + (mark === 'correct' ? ' selected' : '') + '>Correct</option><option value="needs-work"' + (mark === 'needs-work' ? ' selected' : '') + '>Needs work</option></select></label></div>';
    }
    function examFixInput(block, index) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      const value = ((lmState.examCorrections || {})[block.id] || {})[index] || "";
      return '<label>Feedback<textarea maxlength="3000" data-exam-fix="' + block.id + ":" + index + '">' + esc(value) + '</textarea></label>';
    }
    function reviewHtml(value) {
      return (value?.runs || []).map(run => {
        const m = run.marks || {}, style = [];
        if (m.color && /^#[a-f0-9]{6}$/i.test(m.color)) style.push('color:' + m.color);
        if (m.size >= 10 && m.size <= 96) style.push('font-size:' + m.size + 'px');
        if (m.bold) style.push('font-weight:bold'); if (m.italic) style.push('font-style:italic');
        const decoration = [m.underline ? 'underline' : '',m.strike ? 'line-through' : ''].filter(Boolean).join(' ');
        if (decoration) style.push('text-decoration:' + decoration);
        return '<span style="' + esc(style.join(';')) + '">' + esc(run.text) + '</span>';
      }).join('');
    }
    function reviewRuns(editor) {
      const runs = [];
      function visit(node,inherited={}) {
        if (node.nodeType === 3) { if (node.textContent) runs.push({text:node.textContent,marks:inherited}); return; }
        if (node.nodeType !== 1) return;
        if (node.tagName === 'BR') { runs.push({text:'\n',marks:inherited}); return; }
        const marks = {...inherited}, style = node.style;
        if (['B','STRONG'].includes(node.tagName) || style.fontWeight === 'bold') marks.bold = true;
        if (['I','EM'].includes(node.tagName) || style.fontStyle === 'italic') marks.italic = true;
        if (node.tagName === 'U' || style.textDecoration.includes('underline')) marks.underline = true;
        if (['S','STRIKE','DEL'].includes(node.tagName) || style.textDecoration.includes('line-through')) marks.strike = true;
        const color = style.color || node.getAttribute('color') || '', rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (/^#[a-f0-9]{6}$/i.test(color)) marks.color = color;
        else if (rgb) marks.color = '#' + rgb.slice(1).map(n => Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('');
        const size = parseFloat(style.fontSize); if (size >= 10 && size <= 96) marks.size = size;
        node.childNodes.forEach(child => visit(child,marks));
        if (node !== editor && ['P','DIV','LI'].includes(node.tagName)) runs.push({text:'\n',marks:inherited});
      }
      editor.childNodes.forEach(child => visit(child)); return {runs};
    }
    function reviewEditor(part,index,original) {
      const key = part.id + ':' + index, saved = lmState.examReviewText?.[part.id]?.[index] || {runs:[{text:String(original || ''),marks:{}}]};
      const published = lmState.assessmentState === 'published' || !lmState.studentSaved || lmState.assessmentBusy;
      return '<div class="review-answer"><details><summary>Original answer</summary><p>' + esc(String(original || 'Not answered')) + '</p></details>' + (!published ? '<div class="review-toolbar" data-review-toolbar="' + key + '"><button type="button" data-review-command="bold" title="Bold"><b>B</b></button><button type="button" data-review-command="italic" title="Italic"><i>I</i></button><button type="button" data-review-command="underline" title="Underline"><u>U</u></button><button type="button" data-review-command="strikeThrough" title="Strike through"><s>S</s></button><input type="color" data-review-color aria-label="Text color" value="#c62828"><input type="number" data-review-size min="10" max="96" value="18" aria-label="Text size"></div>' : '') + '<div class="review-edit" role="textbox" aria-multiline="true" aria-label="Reviewed answer" contenteditable="' + (!published) + '" data-review-text="' + key + '">' + reviewHtml(saved) + '</div></div>';
    }
    let reviewSelection;
    document.addEventListener('selectionchange',() => {
      const selection = window.getSelection(), node = selection?.anchorNode, element = node?.nodeType === 1 ? node : node?.parentElement;
      if (selection?.rangeCount && element?.closest('.review-edit')) reviewSelection = selection.getRangeAt(0).cloneRange();
    });
    document.addEventListener('mousedown',event => { if (event.target.closest('[data-review-command]')) event.preventDefault(); });
    document.addEventListener('paste',event => {
      const editor = event.target.closest?.('.review-edit[contenteditable="true"]');
      if (!editor) return;
      event.preventDefault(); document.execCommand('insertText',false,event.clipboardData?.getData('text/plain') || ''); examRemember(editor);
    });
    function reviewFormat(control) {
      if (!canTuneStudentLessons() || !lmState.studentSaved || lmState.assessmentState === 'published') return;
      const toolbar = control.closest('[data-review-toolbar]'), editor = toolbar?.nextElementSibling;
      if (!editor) return;
      editor.focus(); const selection = window.getSelection();
      if (reviewSelection && editor.contains(reviewSelection.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(reviewSelection); }
      if (control.dataset.reviewCommand) document.execCommand(control.dataset.reviewCommand,false,null);
      else if (control.matches('[data-review-color]')) document.execCommand('foreColor',false,control.value);
      else if (control.matches('[data-review-size]')) {
        const size = Math.max(10,Math.min(96,Number(control.value) || 18));
        if (selection.rangeCount && !selection.isCollapsed && editor.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0), span = document.createElement('span'); span.style.fontSize = size + 'px'; span.append(range.extractContents()); range.insertNode(span); range.selectNodeContents(span); selection.removeAllRanges(); selection.addRange(range); reviewSelection = range.cloneRange();
        } else { editor.querySelectorAll('span').forEach(span => { span.style.fontSize = size + 'px'; }); }
      }
      if (selection.rangeCount && editor.contains(selection.anchorNode)) reviewSelection = selection.getRangeAt(0).cloneRange();
      examRemember(editor);
    }
    document.addEventListener('click',event => { const control = event.target.closest('[data-review-command]'); if (control) reviewFormat(control); });
    document.addEventListener('change',event => { if (event.target.matches('[data-review-color],[data-review-size]')) reviewFormat(event.target); });
    function assessmentFeedback(block,index) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      if(lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2)){
        if(lmState.assessmentState!=='published')return '';
        const comment=lmState.examCorrections?.[block.id]?.[index]||'',mark=lmState.examErrors?.[block.id]?.[index]||'';
        return '<div class="assessment-feedback">'+(mark?'<span>'+esc(mark==='correct'?'Correct':'Needs work')+'</span>':'')+(comment?'<p>'+window.TextColors.html(comment,lmState.examCommentFormatting?.[block.id]?.[index])+'</p>':'')+'</div>';
      }
      if (block.gradeMode === 'assignment') return '';
      let html = '<p class="assessment-question-score">Maximum: ' + assessmentMax(block,index) + ' points</p>';
      if (lmState.assessmentState !== 'published') return html;
      const points = lmState.examPoints?.[block.id]?.[index], feedback = lmState.examCorrections?.[block.id]?.[index], mark = lmState.examErrors?.[block.id]?.[index];
      html += '<div class="assessment-feedback"><strong>' + esc(String(points ?? 'Not graded')) + ' / ' + assessmentMax(block,index) + '</strong>' + (mark ? '<span>' + (mark === 'correct' ? 'Correct' : 'Needs work') + '</span>' : '') + (feedback ? '<p>' + esc(feedback) + '</p>' : '') + '</div>';
      return html;
    }
    function examTextReview(block, item, index, kind) {
      const right = examRight(item, kind);
      const given = item.given || "";
      const known = right != null && right !== "";
      const same = known && examSame(given, right);
      let html = "";
      if (!known) html = '<p class="exam-miss exam-strike">' + esc(given || "—") + "</p>";
      else if (same) html = '<p class="exam-hit">' + esc(given || right) + "</p>";
      else html = '<p class="exam-miss exam-strike">' + esc(given || "—") + '</p><p class="exam-hit">' + esc(right) + "</p>";
      const source = block.assessmentSource || block, sourceIndex = block.assessmentIndex ?? index;
      return html + reviewEditor(source,sourceIndex,given) + examFixInput(block, index) + examPointInput(block, index);
    }
    function examAnswerHtml(block) {
      const kind = lmQuizType(block);
      const title = "<h3>" + esc(block.title || kind) + "</h3>";
      const reviewer = canTuneStudentLessons();
      const lock = reviewer || lmState.studentSaved ? " disabled" : "";
      const items = block.items || [];
      const tail = (index) => reviewer ? (["Choice", "Odd one out", "Select all", "True / false"].includes(kind) ? examFixInput(block, index) : "") + examPointInput(block, index) : assessmentFeedback(block,index);
      if (kind === "Choice" || kind === "Odd one out") {
        return title + items.map((item, index) => {
          const given = Number(item.given);
          const right = examRight(item, kind);
          const inputs = (item.options || []).map((opt, oi) => '<label class="lm-opt' + examMarkClass(reviewer, given, right, oi) + '"><input type="radio" name="ex-' + block.id + "-" + index + '" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + oi + '"' + (given === oi ? " checked" : "") + lock + " /> " + esc(opt || "Option") + "</label>").join("");
          return '<div class="lm-q"><b>' + esc(item.prompt || kind) + "</b>" + inputs + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Select all") {
        return title + items.map((item, index) => {
          const given = Array.isArray(item.given) ? item.given.map(Number) : [];
          const right = examRight(item, kind);
          const inputs = (item.options || []).map((opt, oi) => '<label class="lm-opt' + examMarkClass(reviewer, given, right, oi) + '"><input type="checkbox" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + oi + '"' + (given.indexOf(oi) >= 0 ? " checked" : "") + lock + " /> " + esc(opt || "Option") + "</label>").join("");
          return '<div class="lm-q"><b>' + esc(item.prompt || "Question") + "</b>" + inputs + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "True / false") {
        return title + items.map((item, index) => {
          const right = examRight(item, kind);
          const radio = (value, label) => '<label class="lm-opt' + examMarkClass(reviewer, item.given, right, value) + '"><input type="radio" name="ex-' + block.id + "-" + index + '" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + value + '"' + (item.given === value ? " checked" : "") + lock + " /> " + label + "</label>";
          return '<div class="lm-q"><b>' + esc(item.prompt || "Statement") + "</b>" + radio("true", "True") + radio("false", "False") + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Match" || kind === "Memory") {
        const rights = block.answerOptions || items.map((item) => item.right || "").filter(Boolean);
        return title + items.map((item, index) => {
          if (reviewer) {
            const ok = examSame(item.given, item.right);
            const mark = ok ? '<p class="exam-hit">' + esc(item.given || item.right || "") + "</p>" : '<p class="exam-miss exam-strike">' + esc(item.given || "—") + '</p><p class="exam-hit">' + esc(item.right || "") + "</p>";
            return '<div class="lm-q"><b>' + esc(item.left || "Left") + "</b>" + mark + examFixInput(block, index) + tail(index) + "</div>";
          }
          const options = '<option value="">Choose</option>' + rights.map((right) => '<option' + (item.given === right ? " selected" : "") + ">" + esc(right) + "</option>").join("");
          return '<div class="lm-q"><b>' + esc(item.left || "Left") + '</b><select data-exam-given="' + block.id + ":" + index + '"' + lock + ">" + options + "</select>" + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Gap" || kind === "Build") {
        const prompt = (item) => kind === "Gap" ? (item.shown || "Fill the gap") : (item.parts || "Build the phrase");
        return title + items.map((item, index) => '<div class="lm-q"><b>' + esc(prompt(item)) + "</b>" + (reviewer ? examTextReview(block, item, index, kind) : '<input type="text" data-exam-given="' + block.id + ":" + index + '" value="' + esc(item.given || "") + '"' + lock + " />") + "</div>").join("");
      }
      return title + items.map((item, index) => {
        const prompt = item.prompt || item.front || item.word || item.text || kind;
        const field = reviewer ? examTextReview(block, item, index, kind) : '<input type="text" data-exam-given="' + block.id + ":" + index + '" value="' + esc(item.given || "") + '"' + lock + " />";
        return '<div class="lm-q"><b>' + esc(prompt) + "</b>" + field + "</div>";
      }).join("");
    }
    function examFillAnswers() {
      document.querySelectorAll('#lmPreview .assignment-score').forEach(node => node.remove());
      (lmState.blocks || []).forEach((block) => {
        if (!["quiz", "exercise", "task"].includes(block.type) || !lmState.examOwned && !block.assessed) return;
        const panel = document.querySelector('#lmPreview [data-lm-panel="' + block.id + '"]');
        if (!panel) return;
        if (block.type === "quiz") panel.innerHTML = examAnswerHtml(block);
        else if (block.type === "task") {
          if(lmState.blocks.some(p=>p.scoringVersion===2)&&examScoringChildren(lmState.blocks,block).length){panel.innerHTML='<h3>'+esc(block.title||'Task')+'</h3><p>'+esc(block.text||'')+'</p>';return;}
          const reviewer = canTuneStudentLessons(), given = block.response || "";
          panel.innerHTML = "<h3>" + esc(block.title || "Task") + "</h3><p>" + esc(block.text || "") + '</p><label>Your answer<textarea data-exam-response="' + block.id + '"' + (reviewer || lmState.studentSaved ? " disabled" : "") + ">" + esc(given) + "</textarea></label>" + (reviewer ? examFixInput(block, 0) + examPointInput(block, 0) : assessmentFeedback(block,0));
        } else {
          panel.innerHTML = '<h3>' + esc(block.title || 'Exercise') + '</h3>' + (block.items || []).map((item, index) => examAnswerHtml({ ...block, assessmentSource:block, assessmentIndex:index, quizType: item.kind === "write" ? "Type" : "Choice", items: [{...item,answer:item.kind==='write'?item.write:item.answer}] }).replace(/^<h3>.*?<\/h3>/,'').replaceAll('data-exam-given="' + block.id + ':0"', 'data-exam-given="' + block.id + ':' + index + '"').replaceAll('ex-' + block.id + '-0', 'ex-' + block.id + '-' + index)).join("");
        }
      });
      if (canTuneStudentLessons()) {
        document.querySelectorAll('#lmPreview [data-exam-response],#lmPreview input[type="text"][data-exam-given]').forEach(field => {
          const key = field.dataset.examGiven || field.dataset.examResponse + ':0', [id,index] = key.split(':'), part = lmState.blocks.find(p => String(p.id) === id);
          if (!part) return;
          const original = field.value; field.hidden = true;
          field.insertAdjacentHTML('afterend',reviewEditor(part,Number(index),original));
        });
      } else if (lmState.assessmentState === 'published') {
        for (const [id,items] of Object.entries(lmState.examReviewText || {})) for (const [index,value] of Object.entries(items)) {
          const field = document.querySelector('[data-exam-given="' + id + ':' + index + '"],[data-exam-response="' + id + '"]');
          field?.insertAdjacentHTML('afterend','<div class="review-edit review-published"><b>Teacher review</b><div>' + reviewHtml(value) + '</div></div>');
        }
      }
      const individualScoring=lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2);
      const leaders = individualScoring?[]:assessmentQuestions(lmState).filter(q => q.part.gradeMode === 'assignment');
      for (const q of leaders) {
        const panel = document.querySelector('#lmPreview [data-lm-panel="' + q.part.id + '"]'); if (!panel) continue;
        const target = panel.closest('.lm-assignment')?.querySelector('header') || panel;
        let html = '<div class="assignment-score"><strong>Maximum: ' + q.max + ' points</strong>';
        if (canTuneStudentLessons()) html += examPointInput(q.part,0,true);
        else if (lmState.assessmentState === 'published') html += '<p>Score: ' + esc(String(lmState.examPoints?.[q.part.id]?.[0] ?? 'Not graded')) + ' / ' + q.max + '</p>';
        target.insertAdjacentHTML('beforeend',html + '</div>');
      }
      if(individualScoring){
        const parts=lmState.blocks,earned=part=>{const children=examScoringChildren(parts,part);return children.length?Number(children.reduce((sum,child)=>sum+earned(child),0).toFixed(10)):(Number(String(lmState.examPoints?.[part.id]?.[0]||0).replace(',','.'))||0);};
        if(canTuneStudentLessons())for(const {part} of assessmentQuestions(lmState)){
          const panel=document.querySelector('#lmPreview [data-lm-panel="'+part.id+'"]');if(!panel)continue;
          const grading=document.createElement('div');grading.className='exam-element-grading';grading.innerHTML=examPointInput(part,0,true);grading.querySelector('[data-exam-error]')?.closest('label')?.remove();panel.prepend(grading);
        }
        for(const part of parts.filter(part=>['task','quiz','exercise'].includes(part.type))){
          if(examScoringChildren(parts,part).length||part.type==='task'&&!part.assignmentKey)continue;
          const panel=document.querySelector('#lmPreview [data-lm-panel="'+part.id+'"]');if(!panel)continue;
          panel.classList.add('exam-scored-element');panel.insertAdjacentHTML('afterbegin','<div class="exam-element-maximum">Maximum '+assessmentUnitMax(part)+(lmState.assessmentState==='published'?' · Score '+earned(part):'')+'</div>');
        }
        document.querySelectorAll('#lmPreview .lm-assignment').forEach(group=>{
          const key=group.dataset.assignment,partsInGroup=parts.filter(part=>(part.assignmentKey||part.assignmentId||('part-'+part.id))===key&&['task','quiz','exercise'].includes(part.type));
          const roots=partsInGroup.filter(part=>!part.assignmentKey),graded=roots.length?roots:partsInGroup;
          const max=graded.reduce((sum,part)=>sum+examScoringMax(parts,part),0),score=graded.reduce((sum,part)=>sum+earned(part),0);
          group.querySelector('header')?.insertAdjacentHTML('beforeend','<div class="assignment-score">Maximum '+Number(max.toFixed(10))+((canTuneStudentLessons()||lmState.assessmentState==='published')?' · Score <span data-exam-task-earned="'+esc(key)+'">'+Number(score.toFixed(10))+'</span>':'')+'</div>');
        });
      }
      document.querySelectorAll('#lmPreview .lm-q').forEach(question => {
        const details = document.createElement('details'), summary = document.createElement('summary'); details.className = 'lm-study-card exam-question-card'; details.open = true;
        const title = question.querySelector('b'); if (title) summary.append(title); else summary.textContent = 'Question';
        question.before(details); details.append(summary,question);
      });
      if (!canTuneStudentLessons()) (lmState.blocks || []).filter(part => ['quiz','exercise'].includes(part.type) && (lmState.examOwned || part.assessed)).forEach(part => {
        document.querySelectorAll('#lmPreview [data-lm-panel="' + part.id + '"] .lm-q').forEach((question,index) => { if (!question.querySelector('.assessment-question-score')) question.insertAdjacentHTML('beforeend',assessmentFeedback(part,index)); });
      });
      const preview=document.getElementById('lmPreview');
      preview.querySelectorAll('textarea[data-exam-response],input[type=text][data-exam-given],textarea[data-exam-fix]').forEach(field=>{
        const feedback=field.dataset.examFix,key=feedback||field.dataset.examGiven||field.dataset.examResponse+':0',[id,index]=key.split(':');
        const map=feedback?(lmState.examCommentFormatting||={}):(lmState.examAnswerText||={}),format=map[id]?.[index];
        if(field.disabled&&format){field.hidden=true;field.insertAdjacentHTML('afterend','<div class="text-color-rich">'+window.TextColors.html(field.value,format)+'</div>');return;}
        window.TextColors?.mount(field,{format,onChange:value=>{if(!value.runs.map(run=>run.text).join(''))delete map[id]?.[index];else (map[id]||={})[index]=value;}});
      });
      preview.querySelectorAll('[data-lm-panel]').forEach(panel=>{const part=lmState.blocks.find(part=>String(part.id)===panel.dataset.lmPanel);if(part)window.TextColors?.paint(panel,part);});
    }
    function examRemember(input) {
      if (!assessmentActive(lmState) || canEditLessons() && !canTuneStudentLessons() || !lmState.assessmentReady) return;
      const reviewer = canTuneStudentLessons();
      if (!reviewer && lmState.studentSaved) return;
      if (reviewer && lmState.assessmentState === 'published') return;
      const reviewed = input.closest('[data-review-text]');
      if (reviewed && reviewer) {
        const [id,index] = reviewed.dataset.reviewText.split(':'); lmState.examReviewText ||= {}; (lmState.examReviewText[id] ||= {})[index] = reviewRuns(reviewed); assessmentStatus('Unsaved review'); return;
      }
      const errorMark = input.closest('[data-exam-error]'), criterion = input.closest('[data-exam-criterion]');
      if ((errorMark || criterion) && reviewer) {
        const source = errorMark || criterion, bits = (source.dataset.examError || source.dataset.examCriterion).split(':');
        if (errorMark) { lmState.examErrors ||= {}; (lmState.examErrors[bits[0]] ||= {})[bits[1]] = source.value; }
        else {
          lmState.examCriteriaPoints ||= {}; const scores = ((lmState.examCriteriaPoints[bits[0]] ||= {})[bits[1]] ||= {}); scores[bits[2]] = source.value;
          const part = lmState.blocks.find(p => String(p.id) === bits[0]), item = ['task','text'].includes(part.type) || part.gradeMode === 'assignment' ? part : part.items[Number(bits[1])];
          const rows = assessmentRubric(item), complete = rows.every((_,i) => scores[i] != null && scores[i] !== '');
          const total = complete ? rows.reduce((n,_,i) => n + Number(scores[i]),0) : '';
          (lmState.examPoints[bits[0]] ||= {})[bits[1]] = total;
          const field = document.querySelector('[data-exam-points="' + bits[0] + ':' + bits[1] + '"]'); if (field) field.value = total;
        }
        assessmentStatus('Unsaved review');examRefreshTaskScores(); return;
      }
      const points = input.closest("[data-exam-points]");
      const fix = input.closest("[data-exam-fix]");
      if (points || fix) {
        const source = points || fix;
        const bits = (source.dataset.examPoints || source.dataset.examFix || "").split(":");
        const partId = bits[0];
        const index = bits[1];
        const bucket = points ? "examPoints" : "examCorrections";
        if (!lmState[bucket]) lmState[bucket] = {};
        if (!lmState[bucket][partId]) lmState[bucket][partId] = {};
        lmState[bucket][partId][index] = points ? source.value : source.value;
        assessmentStatus('Unsaved review');
        examRefreshTaskScores();
        return;
      }
      const source = input.closest("[data-exam-given]");
      const response = input.closest("[data-exam-response]");
      if (response && !reviewer) {
        const block = lmState.blocks.find(row => String(row.id) === response.dataset.examResponse);
        if (block) { block.response = response.value; assessmentAutosave(lmState); }
        return;
      }
      if (!source || reviewer) return;
      const bits = source.dataset.examGiven.split(":");
      const block = (lmState.blocks || []).find((row) => row.id === domEntityId(bits[0]));
      const item = block && (block.items || [])[Number(bits[1])];
      if (!item) return;
      if (source.type === "checkbox") {
        item.given = [...source.closest(".lm-q").querySelectorAll("input:checked")].map((box) => Number(box.dataset.examValue));
      } else if (source.type === "radio") {
        item.given = source.dataset.examValue === "true" || source.dataset.examValue === "false" ? source.dataset.examValue : Number(source.dataset.examValue);
      } else item.given = source.value;
      assessmentAutosave(lmState);
    }
    function examRefreshTaskScores(){
      if(!lmState?.examOwned||!lmState.blocks.some(part=>part.scoringVersion===2))return;
      const questions=assessmentQuestions(lmState);
      document.querySelectorAll('[data-exam-task-earned]').forEach(node=>{const key=node.dataset.examTaskEarned,total=questions.filter(q=>(q.part.assignmentKey||q.part.assignmentId||('part-'+q.part.id))===key).reduce((sum,q)=>sum+(Number(String(lmState.examPoints?.[q.part.id]?.[0]||0).replace(',','.'))||0),0);node.textContent=String(Number(total.toFixed(10)));});
    }
    function examRow(chip, title, about, attr, locked, hidden, tools) {
      const badgeHtml = Array.isArray(about) ? about.join('') : (about ? '<span class="label about saas-badge saas-badge-info">' + esc(about) + '</span>' : '');
      const dateHtml = chip ? '<span class="date saas-badge saas-badge-muted"><b>' + esc(chip.day) + "</b>" + (chip.month ? "<small>" + esc(chip.month) + "</small>" : "") + "</span>" : "";
      return '<div class="day-row' + (locked ? " exam-locked" : "") + (hidden ? " is-hidden" : "") + '"><button class="day saas-card" type="button" ' + attr + '>' + dateHtml + '<b>' + esc(title) + '</b><div class="exam-card-badges">' + badgeHtml + '</div></button>' + (tools || "") + "</div>";
    }
    function examTools(kind, id, hidden) {
      if (!canEditLessons() && !canTuneStudentLessons()) return "";
      const eye = hidden
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
      const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
      const pencil = kind === "exam" && canEditLessons() ? '<button class="day-edit" type="button" data-exam-edit="' + id + '" aria-label="Edit exam" title="Edit exam"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' : "";
      const hideLabel = hidden ? "Show" : "Hide";
      return '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-exam-hide="' + kind + ":" + id + '" aria-label="' + hideLabel + '" title="' + hideLabel + '">' + eye + "</button>" + pencil + (canEditLessons() ? contentCopyButton(kind==='exam'?'exam':'exam-block',id) + '<button class="day-del" type="button" data-exam-del="' + kind + ":" + id + '" aria-label="Delete">' + trash + '</button>' : '') + '</div>';
    }
    function examStudentSees(exam) {
      if (!exam || exam.hidden) return false;
      return (exam.blocks || []).some((block) => block.doc && block.doc.published && !block.hidden);
    }
    let examSection='active';
    function examPaintList() {
      const box = document.getElementById("examList");
      const heading=document.querySelector('#exams .meta h1');
      const owner=classGroups.find(group=>String(group.id)===String(examViewGroup));
      if(heading)heading.textContent='Exams'+(owner?' · '+owner.title:'');
      const newer = document.getElementById("examNew");
      if (newer) newer.hidden = !canEditLessons() || !classGroups.some(group=>String(group.id)===String(examViewGroup));
      if (!box) return;
      if (authUser && !examReady && !examPulling) examPull();
      const account = examWorkAccount();
      if (authUser && account && examWorkLoadedFor !== account && !examWorkPulling) examPullWork();
      const stored = examLoad();
      let dirty = false;
      stored.forEach((exam) => { if (examStamp(exam)) dirty = true; });
      if (dirty) examSave(stored);
      const exams = examShown();
      document.querySelectorAll('[data-exam-section]').forEach(button=>button.classList.toggle('primary',button.dataset.examSection===examSection));
      const rows = exams.filter(exam=>(exam.instanceStatus==='completed')===(examSection==='completed')).filter((exam) => canEditLessons() || canTuneStudentLessons() || examStudentSees(exam)).slice().sort((a, b) => {
        const groups = String(a.groupTitle || classGroups.find(g => g.id === a.groupId)?.title || 'Unassigned').localeCompare(String(b.groupTitle || classGroups.find(g => g.id === b.groupId)?.title || 'Unassigned'));
        if (groups) return groups;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.created || 0) - (a.created || 0);
      });
      const groupFor=exam=>classGroups.find(g=>g.id===exam.groupId)||{id:exam.groupId||'unassigned',title:exam.groupTitle||'Unassigned'};
      const groups=[...new Map(rows.map(exam=>{const group=groupFor(exam);return [String(group.id),group];})).values()];
      if(!examViewLevel){box.innerHTML=levelButtons(groups,'data-exam-level');return;}
      const back='<button class="btn ghost" type="button" data-exam-level="">Back</button><h2>'+esc(examViewLevel==='unassigned'?'Unassigned':examViewLevel)+'</h2>';
      if(examViewGroup===null){box.innerHTML=back+'<div class="decks">'+groups.filter(group=>accountGroupLevel(group)===examViewLevel).map(group=>'<button class="file-card saas-card" type="button" data-exam-group-view="'+esc(group.id)+'"><b>'+esc(group.title)+'</b><span class="label saas-badge saas-badge-muted">'+rows.filter(exam=>String(groupFor(exam).id)===String(group.id)).length+' exams</span></button>').join('')+'</div>';return;}
      const selectedGroup=groups.find(group=>String(group.id)===String(examViewGroup));
      box.innerHTML = '<button class="btn ghost" type="button" data-exam-level="'+esc(examViewLevel)+'">Back</button><h2>'+esc(selectedGroup?.title||'Unassigned')+'</h2>' + rows.filter(exam=>String(groupFor(exam).id)===String(examViewGroup)).map((exam) => {
        const chip = lmDateChip(exam.date);
        const mine = !canEditLessons();
        const ready = mine && examReadyForReview(exam);
        const sum = mine ? examVisibleBlocks(exam).reduce((total, block) => total + examPointsTotal(block), 0) : 0;
        const visible = examVisibleBlocks(exam), maximum = Math.round(visible.reduce((n,b) => n + assessmentQuestions({...b.doc,examOwned:true}).reduce((m,q) => m + q.max,0),0)*1e8)/1e8;
        const reviewed = visible.filter(b => b.doc?.assessmentState === 'published').length;
        const hidden = viewAccount ? !!exam.personalHidden : !!exam.hidden;
        const badges = [];
        if (exam.instanceStatus === 'completed') {
          badges.push('<span class="label about saas-badge saas-badge-success">Completed · Maximum ' + exam.maximumPoints + ' · ' + exam.earnedPoints + ' points</span>');
        } else {
          const statusClass = exam.published ? 'saas-badge-active' : 'saas-badge-muted';
          const statusText = hidden ? (viewAccount ? 'Hidden for this student' : 'Hidden') : (ready ? 'Ready for review' : (exam.published ? 'Published' : 'Draft'));
          badges.push('<span class="label about saas-badge ' + statusClass + '">' + esc(statusText) + '</span>');
          badges.push('<span class="saas-badge saas-badge-muted">Examination blocks · ' + (exam.blocks || []).length + '</span>');
          badges.push('<span class="saas-badge saas-badge-info">Maximum score: ' + maximum + '</span>');
          if (mine && (canTuneStudentLessons() || reviewed)) badges.push('<span class="saas-badge saas-badge-muted">' + sum + ' points · ' + reviewed + ' / ' + visible.length + ' reviewed</span>');
          if (viewAccount && !hidden) {
            const hiddenBlocks = (exam.blocks || []).filter(block => block.personalHidden || block.hidden || !block.doc?.published).length;
            if (hiddenBlocks) badges.push('<span class="saas-badge saas-badge-muted">Hidden ' + hiddenBlocks + ' / ' + (exam.blocks || []).length + ' blocks</span>');
          }
        }
        return examRow(chip, (exam.title || "Exam")+(canEditLessons()&&exam.studentName?' · '+exam.studentName:''), badges, 'data-exam-open="' + exam.id + '"', ready, hidden, exam.instanceStatus==='completed' ? '' : examTools("exam", exam.id, hidden));
      }).join("");
    }
    function examPaintBlocks() {
      const box = document.getElementById("examBlocks");
      const newer = document.getElementById("examBlockNew");
      const date = document.getElementById("examBlocksDate");
      const exam = examView(examCurrentId);
      if (canTuneStudentLessons() && examWorkLoadedFor !== examWorkAccount() && !examWorkPulling) examPullWork();
      if (newer) newer.hidden = !canEditLessons();
      const name = document.getElementById("examBlocksName");
      if (name) name.textContent = exam ? exam.title || "Exam" : "";
      if (date && exam) date.textContent = lmLongDate(exam.date) || "";
      paintPagePath("examblocks");
      if (!box || !exam) return;
      box.innerHTML = (exam.blocks || []).map((block, index) => {
        if (!canEditLessons() && !canTuneStudentLessons() && (!(block.doc && block.doc.published) || block.hidden)) return "";
        const saved = !canEditLessons() && block.doc && block.doc.studentSaved;
        const mine = !canEditLessons();
        const sum = mine ? examPointsTotal(block) : 0;
        const maximum = Math.round(assessmentQuestions({...block.doc,examOwned:true}).reduce((n,q) => n + q.max,0)*1e8)/1e8;
        const hidden = viewAccount ? !!block.personalHidden : !!block.hidden;
        const badges = [];
        const statusClass = (block.doc?.assessmentState === 'published' || (block.doc && block.doc.published)) ? 'saas-badge-active' : (saved ? 'saas-badge-info' : 'saas-badge-muted');
        let statusText = hidden ? (viewAccount ? 'Hidden for this student' : 'Hidden') : (block.doc?.assessmentState === 'published' ? 'Results published' : saved ? 'Submitted' : (block.doc && block.doc.published ? 'Published' : 'Draft'));
        if (canTuneStudentLessons() && !hidden) statusText = ({draft:'Not submitted',submitted:'Submitted',reviewing:'Being reviewed',published:'Results published'})[block.doc?.assessmentState] || (examWorkLoadedFor === examWorkAccount() && !examWorkPulling ? 'Not submitted' : 'Loading status…');
        let aboutText = statusText + ' · Maximum ' + maximum;
        if (mine && (canTuneStudentLessons() || block.doc?.assessmentState === 'published')) aboutText += ' · ' + sum + ' points';
        badges.push('<span class="label about saas-badge ' + statusClass + '">' + esc(aboutText) + '</span>');
        return examRow({ day: String(index + 1), month: "" }, (block.doc && block.doc.title) || "Examination block", badges, 'data-exam-block="' + block.id + '"', saved, hidden, exam.instanceStatus==='completed' ? '' : examTools("block", block.id, hidden));
      }).join("");
    }
    function examHide(kind, id) {
      id = domEntityId(id);
      if (viewAccount) {
        const exam = examFind(kind === 'exam' ? id : examCurrentId);
        const row = kind === 'exam' ? exam : exam?.blocks?.find(block => block.id === id);
        if (row) return toggleManagedVisibility(row, kind === 'exam' ? 'exam' : 'exam-block');
        return;
      }
      if (!canEditLessons()) return;
      const exams = examLoad();
      if (kind === "exam") {
        const exam = exams.find((row) => row.id === id);
        if (!exam) return;
        exam.hidden = !exam.hidden;
      } else {
        const exam = exams.find((row) => row.id === examCurrentId);
        const block = exam && (exam.blocks || []).find((row) => row.id === id);
        if (!block) return;
        block.hidden = !block.hidden;
      }
      examSave(exams);
      if (kind === "exam") examPaintList();
      else examPaintBlocks();
    }
    function toggleManagedVisibility(row, type) {
      if (!canTuneStudentLessons() || !accountReady || viewSwitching) return;
      const target = viewAccount.id, generation = viewGen;
      return window.LearningMain.perform(async () => {
        await window.LearningMain.setManagedVisibility(target, type, row.id, !!row.personalHidden, !row.personalHidden);
        if (generation !== viewGen || viewAccount?.id !== target) return;
        window.ContentCache?.drop('account:');
        if (type === 'group') await groupPull(true);
        else await examPull(true);
      });
    }
    function examDelete(kind, id) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      if (!confirm(kind === "exam" ? "Move this exam to Archive?" : "Move this examination block to Archive?")) return;
      const exams = examLoad();
      if (kind === "exam") {
        if (!Number.isSafeInteger(id) || id < 1) {
          const next = exams.filter((row) => row.id !== id);
          if (examCurrentId === id) examCurrentId = "";
          examSave(next);
          examPaintList();
          return;
        }
        return window.LearningMain.perform(async () => {
          await window.LearningMain.archiveItem("exam", id);
          if (examCurrentId === id) examCurrentId = "";
          const next = examLoad().filter((row) => row.id !== id);
          try { localStorage.setItem("enquiz-exams", JSON.stringify(next)); } catch (e) {}
          examPaintList();
        });
      }
      const exam = exams.find((row) => row.id === examCurrentId);
      if (!exam) return;
      const blockIndex = (exam.blocks || []).findIndex((b) => b.id === id || b.doc?.id === id);
      if (blockIndex < 0) return;
      const block = exam.blocks[blockIndex];
      const targetId = Number.isSafeInteger(block.id) && block.id > 0 ? block.id : (Number.isSafeInteger(id) && id > 0 ? id : null);
      if (!targetId) {
        exam.blocks.splice(blockIndex, 1);
        examSave(exams);
        examPaintBlocks();
        return;
      }
      return window.LearningMain.perform(async () => {
        await window.LearningMain.archiveItem("exam-block", targetId);
        const currentExams = examLoad();
        const currentExam = currentExams.find((row) => row.id === examCurrentId);
        if (currentExam) {
          currentExam.blocks = (currentExam.blocks || []).filter((b) => b.id !== targetId);
          try { localStorage.setItem("enquiz-exams", JSON.stringify(currentExams)); } catch (e) {}
        }
        examPaintBlocks();
      });
    }
    function examTool(event) {
      const dateBtn = event.target.closest("[data-exam-edit]");
      const del = event.target.closest("[data-exam-del]");
      const hide = event.target.closest("[data-exam-hide]");
      if (!dateBtn && !del && !hide) return false;
      event.preventDefault();
      if (dateBtn) { examEdit(dateBtn.getAttribute("data-exam-edit"), dateBtn); return true; }
      const raw = (del || hide).getAttribute(del ? "data-exam-del" : "data-exam-hide") || "";
      const kind = raw.slice(0, raw.indexOf(":"));
      const id = raw.slice(kind.length + 1);
      if (del) examDelete(kind, id);
      else examHide(kind, id);
      return true;
    }
    let examCalPick = null;
    let examCalAnchor = null;
    let examCalView = null;
    function examCloseCalendar() {
      const pop = document.getElementById("examCal");
      if (pop) pop.hidden = true;
      examCalPick = null;
      examCalAnchor = null;
    }
    function examCalShift(step) {
      examCalView.m += step;
      if (examCalView.m < 1) { examCalView.m = 12; examCalView.y -= 1; }
      if (examCalView.m > 12) { examCalView.m = 1; examCalView.y += 1; }
    }
    function examRenderCalendar() {
      let pop = document.getElementById("examCal");
      if (!pop) {
        pop = document.createElement("div");
        pop.id = "examCal";
        pop.className = "exam-cal";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-label", "Choose a date");
        document.body.appendChild(pop);
        pop.addEventListener("pointerdown", (event) => event.stopPropagation());
        pop.addEventListener("click", (event) => {
          const btn = event.target.closest("[data-cal]");
          if (!btn || !examCalView) return;
          const act = btn.getAttribute("data-cal");
          if (act === "prev") examCalShift(-1);
          else if (act === "next") examCalShift(1);
          else if (act === "prev-year") examCalView.y -= 1;
          else if (act === "next-year") examCalView.y += 1;
          else if (act === "day") {
            const date = btn.getAttribute("data-date");
            const pick = examCalPick;
            examCloseCalendar();
            if (pick && date) pick(date);
            return;
          }
          examRenderCalendar();
        });
      }
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const y = examCalView.y;
      const m = examCalView.m;
      const first = new Date(y, m - 1, 1);
      const lead = (first.getDay() + 6) % 7;
      const count = new Date(y, m, 0).getDate();
      const today = lmToday();
      let cells = "";
      for (let i = 0; i < lead; i++) cells += '<span class="exam-cal-pad"></span>';
      for (let day = 1; day <= count; day++) {
        const iso = y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        const on = iso === examCalView.selected ? " is-on" : "";
        const now = iso === today ? " is-today" : "";
        cells += '<button class="exam-cal-day' + on + now + '" type="button" data-cal="day" data-date="' + iso + '">' + day + "</button>";
      }
      pop.innerHTML = '<div class="exam-cal-nav"><button type="button" data-cal="prev-year" aria-label="Previous year">«</button><button type="button" data-cal="prev" aria-label="Previous month">‹</button><strong>' + months[m - 1] + " " + y + '</strong><button type="button" data-cal="next" aria-label="Next month">›</button><button type="button" data-cal="next-year" aria-label="Next year">»</button></div><div class="exam-cal-week"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="exam-cal-grid">' + cells + "</div>";
      pop.hidden = false;
      const rect = examCalAnchor.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      let left = rect.left;
      let top = rect.bottom + 8;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
      pop.style.left = Math.max(8, left) + "px";
      pop.style.top = Math.max(8, top) + "px";
    }
    function examOpenCalendar(anchor, value, onPick) {
      if (!anchor) return;
      const picked = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
      const base = picked || lmToday();
      const parts = base.split("-").map(Number);
      examCalPick = onPick;
      examCalAnchor = anchor;
      examCalView = { y: parts[0], m: parts[1], selected: picked };
      examRenderCalendar();
    }
    function closeItemEditor() {
      const pop = document.getElementById("itemEditPop");
      if (pop) pop.remove();
    }
    function openItemEditor(anchor, value, onSave) {
      closeItemEditor();
      const pop = document.createElement("form");
      pop.id = "itemEditPop";
      pop.className = "item-edit-pop";
      pop.innerHTML = '<label>' + esc(value.label || "Name") + '<input type="text" name="title" maxlength="120" value="' + esc(value.title || "") + '"></label><label>Date<span class="date-control"><input type="text" name="date" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10" value="' + esc(value.date || "") + '"><button class="date-picker-btn" type="button" data-item-calendar aria-label="Choose date"></button></span></label><div class="item-edit-actions"><button class="btn ghost" type="button" data-item-cancel>Cancel</button><button class="btn primary" type="submit">Save</button></div>';
      document.body.appendChild(pop);
      pop.addEventListener("pointerdown", (event) => event.stopPropagation());
      pop.querySelector("[data-item-cancel]").addEventListener("click", closeItemEditor);
      pop.querySelector("[data-item-calendar]").addEventListener("click", (event) => {
        const input = pop.elements.date;
        examOpenCalendar(event.currentTarget, input.value, (date) => { input.value = date; });
      });
      pop.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = pop.elements.title.value.trim().slice(0, 120);
        const date = pop.elements.date.value.trim();
        if (!title) { pop.elements.title.focus(); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { pop.elements.date.focus(); return; }
        closeItemEditor();
        onSave({ title: title, date: date });
      });
      pop.elements.title.focus();
      pop.elements.title.select();
    }
    function examEdit(id, button) {
      id = domEntityId(id);
      const exam = examFind(id);
      if (!exam || !button) return;
      openItemEditor(button, { title: exam.title || "Exam", date: exam.date || "", label: "Exam name" }, (value) => examSetMeta(id, value));
    }
    function examGroupName(title,groupId) {
      const group=classGroups.find(group=>group.id===groupId),level=group&&accountGroupLevel(group);
      if(!adminLevels.includes(level))return title;
      const old=accountGroupLevel({title:title});
      const suffix=old==='unassigned'?title:title===old?'Exam':title.startsWith(old+' ')?title.slice(old.length+1):title.slice(0,-old.length-1);
      return (level+' '+(suffix||'Exam')).slice(0,120);
    }
    function examSetMeta(id, value) {
      if (!canEditLessons() || !value.title || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === id);
      if (!exam) return;
      exam.title = examGroupName(value.title,exam.groupId);
      exam.date = value.date;
      (exam.blocks || []).forEach((block) => { if (block.doc) block.doc.date = value.date; });
      if (lmState && lmState.examOwned && lmState.examId === id) lmState.date = value.date;
      examSave(exams);
      examPaintList();
    }
    function examAdd() {
      if (!canEditLessons()) return;
      openItemEditor(document.getElementById("examNew"), { title: (adminLevels.includes(examViewLevel)?examViewLevel+' ':'')+'Exam', date: lmToday(), label: "Exam name" }, (value) => {
        const exams = examLoad();
        const groupId=classGroups.some(group=>String(group.id)===String(examViewGroup))?Number(examViewGroup):null;
        exams.push({ id: "exam-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), groupId, title: examGroupName(value.title,groupId), date: value.date, created: Date.now(), blocks: [] });
        examSave(exams);
        examPaintList();
      });
    }
    function examAddBlock() {
      if (!canEditLessons()) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === examCurrentId);
      if (!exam) return;
      const doc = lmBlankMaterial();
      doc.id = "exb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      doc.title = "Examination block";
      doc.date = exam.date || lmToday();
      doc.examOwned = true;
      doc.examId = exam.id;
      doc.blockId = doc.id;
      doc.studentSaved = false;
      exam.blocks = exam.blocks || [];
      exam.blocks.push({ id: doc.id, doc: doc });
      examSave(exams);
      examPaintBlocks();
    }
    function examOpenBlock(blockId) {
      blockId = domEntityId(blockId);
      const exam = examView(examCurrentId);
      const block = exam && (exam.blocks || []).find((row) => row.id === blockId);
      if (!block || !block.doc) return;
      if (!examHold) examHold = lmState && lmState.examOwned ? null : lmState;
      lmState = block.doc;
      lmState.examOwned = true;
      lmState.examId = exam.id;
      lmState.blockId = block.id;
      if(typeof materialReviewStudent!=='undefined'&&materialReviewStudent&&!viewAccount)lmState.reviewStudentId=materialReviewStudent.id;
      if (!canEditLessons()) lmState.mode = "preview";
      visit("material");
    }
    function examBoot() {
      const openScreen = show;
      show = function (id) {
        if ((examHold || (lmState && lmState.examOwned)) && !(id === "material" && lmState && lmState.examOwned)) examLeave();
        if(materialReviewStudent&&!['material','examblocks'].includes(id)){materialReviewStudent=null;examResetWork();}
        const result = openScreen(id);
        if (id === "exams") examPaintList();
        if (id === "examblocks") examPaintBlocks();
        return result;
      };
      const newer = document.getElementById("examNew");
      const blockNew = document.getElementById("examBlockNew");
      const list = document.getElementById("examList");
      const blocks = document.getElementById("examBlocks");
      const save = document.getElementById("examSave");
      if (newer) newer.addEventListener("click", examAdd);
      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-date-picker]");
        if (!button) return;
        const input = document.getElementById(button.dataset.datePicker);
        if (!input) return;
        examOpenCalendar(button, input.value, (date) => {
          input.value = date;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
      document.addEventListener("pointerdown", (event) => {
        const pop = document.getElementById("examCal");
        const editor = document.getElementById("itemEditPop");
        if (pop && !pop.hidden && !pop.contains(event.target)) examCloseCalendar();
        if (editor && !editor.contains(event.target)) closeItemEditor();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { examCloseCalendar(); closeItemEditor(); }
      });
      if (blockNew) blockNew.addEventListener("click", examAddBlock);
      document.addEventListener('click',event => {
        const open = event.target.closest('#adminGroupDetail [data-exam-open]');
        if (!open || !isTeacher() || viewAccount) return;
        void examOpenSelected(open.dataset.examOpen);
      });
      document.getElementById('examSections')?.addEventListener('click',event=>{const button=event.target.closest('[data-exam-section]');if(button){examSection=button.dataset.examSection;examPaintList();rememberPlace();}});
      if (list) list.addEventListener("click", async (event) => {
        if (examTool(event)) return;
        const open = event.target.closest("[data-exam-open]");
        if (!open) return;
        await examOpenSelected(open.dataset.examOpen);
      });
      if (blocks) blocks.addEventListener("click", (event) => {
        if (examTool(event)) return;
        const open = event.target.closest("[data-exam-block]");
        if (!open) return;
        examOpenBlock(open.dataset.examBlock);
      });
      async function assessmentAction(action,extra={}) {
        const doc = lmState;
        if (!assessmentActive(doc) || !doc.assessmentReady || doc.assessmentBusy) return;
        if (assessmentPendingDoc === doc) { clearTimeout(assessmentTimer); assessmentPendingDoc = null; }
        doc.assessmentBusy = true; examDress();
        try { await assessmentWrite(doc,action,extra); }
        catch(error) { assessmentStatus(error.message,doc); }
        finally { doc.assessmentBusy = false; if (doc === lmState) examDress(); }
      }
      if (save) save.addEventListener('click',async () => {
        if (!assessmentActive(lmState) || canEditLessons() && !canTuneStudentLessons()) return;
        if (canTuneStudentLessons()) return assessmentAction('review');
        if (lmState.studentSaved) return;
        const answers = examCollectAnswers(lmState), missing = assessmentAnswerQuestions(lmState).filter(q => answers[q.part.id]?.[q.index] == null || answers[q.part.id][q.index] === '' || Array.isArray(answers[q.part.id][q.index]) && !answers[q.part.id][q.index].length).length;
        if (!confirm((missing ? missing + ' unanswered question(s). ' : '') + 'Submit your answers?'+(lmState.examOwned?' Your answers will be permanently locked.':' You cannot change them unless your teacher reopens the submission.'))) return;
        await assessmentAction('submit');
      });
      document.getElementById('assessmentPublish')?.addEventListener('click',() => { if (confirm('Publish scores and feedback for this student?')) assessmentAction('publish'); });
      for (const [id,action] of [['assessmentReopen','reopen'],['assessmentAmend','amend']]) document.getElementById(id)?.addEventListener('click',() => {
        if(lmState?.examOwned&&action==='amend'){assessmentAction(action);return;}
        const reason = prompt(action === 'reopen' ? 'Why are you reopening the submission?' : 'Why are you amending the published review?');
        if (reason?.trim()) assessmentAction(action,{reason:reason.trim()});
      });
      document.getElementById('assessmentHistory')?.addEventListener('click',async () => {
        const doc = lmState;
        try {
          const result = await accountFetch('/api/assessment?history=1&kind=' + (doc.examOwned ? 'exam-block' : 'lesson') + '&id=' + (doc.examOwned ? doc.blockId : doc.id) + '&student=' + encodeURIComponent(doc.reviewStudentId||viewAccount?.id||examWorkAccount()));
          const rows = result.history || [];
          const dialog = document.createElement('dialog'); dialog.className = 'assessment-history saas-card';
          dialog.innerHTML = '<form method="dialog"><button class="lm-btn saas-btn" aria-label="Close">Close</button></form><h2>Submission history</h2>' + (rows.length ? rows.map(row => '<p><strong>' + esc(row.action) + '</strong> · ' + esc(new Date(row.createdAt * 1000).toLocaleString()) + '</p>' + (row.reason ? '<p>' + esc(row.reason) + '</p>' : '')).join('') : '<p>No changes yet.</p>');
          document.body.append(dialog); dialog.addEventListener('close',() => dialog.remove()); dialog.showModal();
        } catch(error) { assessmentStatus(error.message); }
      });
      document.addEventListener('click',event => { if (event.target.closest('#assessmentRetry')) { if (!lmState.assessmentReady) assessmentRead(lmState); else assessmentAction(canTuneStudentLessons() ? 'review' : lmState.studentSaved ? 'review' : 'draft'); } });
      document.addEventListener("input", (event) => examRemember(event.target));
      document.addEventListener("change", (event) => examRemember(event.target));
    }
