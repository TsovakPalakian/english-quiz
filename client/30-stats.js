    function cardArea(place) {
      const value = place || "mine";
      if (value.indexOf("lesson") === 0) return "class";
      if (value === "mine") return "my words";
      if (value === "music") return "lyrics";
      if (value === "tenses") return "grammar";
      return String(value).slice(0, 32);
    }
    function trackEvent(kind, area, result) {
      if (!authUser || viewSwitching) return;
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const payload = { id: id, kind: kind, area: area || "", result: result || "" };
      if (viewAccount) payload.for = viewAccount.id;
      accountFetch("/api/stats/event", {
        method: "POST",
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
    function statsShift(days) {
      const end = new Date();
      const to = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      const from = new Date(to.getTime() - (days - 1) * 86400000);
      const fromEl = document.getElementById("statsFrom");
      const toEl = document.getElementById("statsTo");
      if (fromEl) fromEl.value = from.toISOString().slice(0, 10);
      if (toEl) toEl.value = to.toISOString().slice(0, 10);
    }
    function statsDelta(current, previous, compare) {
      if (!compare) return "";
      if (!previous) return '<p class="hint">Previous period: 0</p>';
      const pct = Math.round((current - previous) * 100 / previous);
      const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
      const sign = pct > 0 ? "+" : "";
      return '<p class="delta ' + cls + '">' + sign + pct + '% vs previous period</p>';
    }
    function statsBars(rows, label) {
      const max = rows.reduce((peak, row) => Math.max(peak, row.value), 1);
      const step = rows.length > 16 ? Math.ceil(rows.length / 8) : 1;
      return '<div class="bars" role="img" aria-label="' + esc(label) + '">' + rows.map((row, index) =>
        '<div class="bar-col" title="' + esc(row.title + ": " + row.value) + '"><i style="height:' + (row.value ? Math.max(2, Math.round(row.value / max * 100)) : 0) + '%"></i><span>' + (index % step === 0 ? esc(row.label) : "") + "</span></div>"
      ).join("") + "</div>";
    }
    function statsBuckets(series, key) {
      if (series.length <= 42) return series.map((row) => ({ label: row.day.slice(5), value: row[key] || 0, title: row.day }));
      const weeks = [];
      for (let i = 0; i < series.length; i += 7) {
        const slice = series.slice(i, i + 7);
        weeks.push({
          label: slice[0].day.slice(5),
          value: slice.reduce((sum, row) => sum + (row[key] || 0), 0),
          title: slice[0].day + " to " + slice[slice.length - 1].day
        });
      }
      return weeks;
    }
    let statsToken = 0;
    let statsMode = "overview";
    function displaySize() {
      return localStorage.getItem("enquiz-display-size") || "comfortable";
    }
    function paintDisplaySettings() {
      const dialog = document.getElementById("displayDialog");
      document.querySelectorAll("button[data-display-size]").forEach((button) => button.classList.toggle("on", button.dataset.displaySize === displaySize()));
      const high = document.getElementById("highVisibility");
      if (high) high.checked = document.documentElement.getAttribute("data-high-visibility") === "1";
      if (dialog && !dialog.hidden) dialog.querySelector("[data-display-size].on")?.focus();
    }
    function setDisplaySize(size) {
      if (!["small", "compact", "comfortable", "large", "extra-large"].includes(size)) return;
      document.documentElement.setAttribute("data-display-size", size);
      localStorage.setItem("enquiz-display-size", size);
      paintDisplaySettings();
    }
    function statsRates(series) {
      const groups = [];
      if (series.length <= 42) {
        series.forEach((row) => groups.push({ label: row.day.slice(5), title: row.day, answers: row.answers || 0, correct: row.correct || 0 }));
      } else {
        for (let i = 0; i < series.length; i += 7) {
          const slice = series.slice(i, i + 7);
          groups.push({
            label: slice[0].day.slice(5),
            title: slice[0].day + " to " + slice[slice.length - 1].day,
            answers: slice.reduce((sum, row) => sum + (row.answers || 0), 0),
            correct: slice.reduce((sum, row) => sum + (row.correct || 0), 0)
          });
        }
      }
      return groups.filter((row) => row.answers).map((row) => ({
        label: row.label,
        title: row.title + ": " + row.correct + " of " + row.answers + " correct",
        value: Math.round(row.correct * 100 / row.answers)
      }));
    }
    function statsList(title, map) {
      const names = Object.keys(map || {}).sort((a, b) => map[b] - map[a]);
      if (!names.length) return "";
      let html = '<div class="card saas-card"><p class="label">' + esc(title) + "</p>";
      names.forEach((name) => {
        html += '<div class="funnel-step"><span>' + esc(name) + "</span><b>" + map[name] + "</b></div>";
      });
      return html + "</div>";
    }
    function fillStatsPeople(people) {
      const userEl = document.getElementById("statsUser");
      if (!userEl) return;
      const selected = userEl.value;
      const ids = (people || []).map((person) => person.id).join(",");
      if (userEl.dataset.ids === ids) return;
      userEl.dataset.ids = ids;
      userEl.innerHTML = '<option value="">All people</option>' + (people || []).map((person) =>
        '<option value="' + esc(person.id) + '">' + esc(person.login || "Account") + " · " + esc(roleLabel(person.role)) + "</option>"
      ).join("");
      if ([].some.call(userEl.options, (option) => option.value === selected)) userEl.value = selected;
    }
    function statsIntro() {
      const sub = document.getElementById("statsSub");
      const roleEl = document.getElementById("statsRole");
      const userEl = document.getElementById("statsUser");
      const developer = isDeveloper();
      if (developer && roleEl && !roleEl.querySelector('option[value="DEVELOPER"]')) {
        const option = document.createElement("option");
        option.value = "DEVELOPER";
        option.textContent = "Developer";
        roleEl.appendChild(option);
      }
      if (roleEl) roleEl.hidden = !developer;
      if (userEl) userEl.hidden = !developer;
      if (!developer) {
        if (roleEl) roleEl.value = "";
        if (userEl) userEl.value = "";
      }
      if (!sub) return;
      if (!authUser) sub.textContent = "Sign in to see your statistics. Dates are UTC.";
      else if (developer) sub.textContent = "Overall numbers for the app. Dates are UTC. The period filter applies to every figure on this page.";
      else if (hideStudentSongs()) sub.textContent = "This student's study: learned checks, answers and exams. Dates are UTC.";
      else if ((viewAccount ? viewAccount.role : authUser.role) === "ADMIN") sub.textContent = "Your study. Students are not assigned to a teacher here, so this page stays yours. Dates are UTC.";
      else sub.textContent = "Your study. Dates are UTC. The period filter applies to every figure on this page.";
    }
    function paintStats() {
      const box = document.getElementById("statsBody");
      if (!box) return;
      statsIntro();
      if (!document.getElementById("statsFrom").value) statsShift(30);
      if (!authUser) {
        box.innerHTML = '<div class="card"><p>Sign in to see your statistics.</p></div>';
        return;
      }
      const token = ++statsToken;
      const params = new URLSearchParams();
      params.set("from", document.getElementById("statsFrom").value);
      params.set("to", document.getElementById("statsTo").value);
      if (viewAccount) {
        params.set("user", viewAccount.id);
        params.set("as", "user");
      } else if (isDeveloper()) {
        const role = document.getElementById("statsRole").value;
        const person = document.getElementById("statsUser").value;
        if (role) params.set("role", role);
        if (person) params.set("user", person);
      }
      const compare = document.getElementById("statsCompare").checked;
      viewFresh('stats:' + params.toString(), () => accountFetch("/api/stats?" + params.toString()), (data) => {
        if (token !== statsToken) return;
        const fromEl = document.getElementById("statsFrom");
        const toEl = document.getElementById("statsTo");
        if (fromEl && data.from) fromEl.value = data.from;
        if (toEl && data.to) toEl.value = data.to;
        if (data.scope === "all") fillStatsPeople(data.people || []);
        box.innerHTML = renderStats(data, compare);
      }, () => { box.innerHTML = '<p class="hint">Loading…</p>'; }).catch((err) => {
        if (token !== statsToken) return;
        box.innerHTML = '<div class="card"><p class="hint bad">' + esc(err.message) + "</p></div>";
      });
    }
    function renderStats(data, compare) {
      const accounts = data.accounts || {};
      const regs = data.registrations || {};
      const activity = data.activity || {};
      const overall = data.scope === "all";
      const period = data.from + " to " + data.to + " UTC";
      let html = "";
      html += statsVisualSummary(data, compare);
      html += '<div class="stat-panel' + (statsMode === "details" ? " on" : "") + '" data-stat-panel="details">';
      if (overall && data.directory === false) {
        html += '<div class="card saas-card"><p>Account and registration counts are not ready yet. They appear after a teacher signs in once, when the account list is saved. Nothing here is filled in with zero.</p></div>';
      } else if (overall) {
        html += '<div class="overview">';
        html += '<div><b>' + accounts.created + '</b><span>New accounts</span>' + statsDelta(accounts.created, accounts.previous, compare) + "</div>";
        html += '<div><b>' + regs.created + '</b><span>New registrations</span>' + statsDelta(regs.created, regs.previous && regs.previous.created, compare) + "</div>";
        html += '<div><b>' + (regs.approved + regs.rejected) + '</b><span>Decisions</span>' + statsDelta(regs.approved + regs.rejected, regs.previous ? regs.previous.approved + regs.previous.rejected : 0, compare) + "</div>";
        if (regs.approvalRate == null) html += '<div><b>—</b><span>Approval rate</span><p class="hint">No decisions in this period.</p></div>';
        else html += '<div><b>' + Math.round(regs.approvalRate * 100) + '%</b><span>Approval rate</span>' + (compare && regs.previous && regs.previous.approvalRate != null ? '<p class="hint">Previous period: ' + Math.round(regs.previous.approvalRate * 100) + "%</p>" : "") + "</div>";
        html += "</div>";
      }
      html += '<p class="hint">' + esc(period) + (compare ? ". Previous period " + esc(data.previousFrom) + " to " + esc(data.previousTo) + "." : "") + "</p>";
      if (overall && data.directory !== false) {
        const accountBars = statsBuckets(accounts.series || [], "count");
        html += '<div class="card saas-card"><p class="label">New accounts' + ((accounts.series || []).length > 42 ? " by week" : " by day") + "</p>";
        html += '<p class="hint">Count of accounts whose creation date falls in each ' + ((accounts.series || []).length > 42 ? "week" : "day") + ". A day with none is a real zero.</p>";
        html += statsBars(accountBars, "New accounts");
        html += '<table class="stat-table saas-table"><thead><tr><th>Day</th><th>Accounts</th></tr></thead><tbody>';
        (accounts.series || []).forEach((row) => {
          if (!row.count) return;
          html += "<tr><td>" + esc(row.day) + "</td><td>" + row.count + "</td></tr>";
        });
        if (!(accounts.series || []).some((row) => row.count)) html += '<tr><td colspan="2">No new accounts in this period.</td></tr>';
        html += "</tbody></table></div>";
        const roles = accounts.byRole || {};
        html += '<div class="card saas-card"><p class="label">New accounts by role</p><p class="hint">Role on the account now, among accounts created in this period.</p>';
        html += '<div class="funnel-step"><span>Students</span><b>' + (roles.USER || 0) + "</b></div>";
        html += '<div class="funnel-step"><span>Teachers</span><b>' + (roles.ADMIN || 0) + "</b></div>";
        html += '<div class="funnel-step"><span>Developers</span><b>' + (roles.DEVELOPER || 0) + "</b></div>";
        html += '<p class="hint">Registrations opened in this period that are still pending: ' + regs.pending + ". Approved decisions: " + regs.approved + ". Rejected decisions: " + regs.rejected + ".</p>";
        if (accounts.undated) html += '<p class="hint">' + accounts.undated + " accounts have no creation date and are left out.</p>";
        if (regs.undated) html += '<p class="hint">' + regs.undated + " registrations have no dates and are left out.</p>";
        html += "</div>";
      }
      if (!activity.tracked) {
        html += '<div class="card saas-card"><p class="label">Study activity</p><p>' + (overall
          ? "No study activity has been recorded yet. Checked answers, exams, new cards and new songs will appear here after they happen. Older study is not shown as zero."
          : "No study activity has been recorded for you yet. Checked answers, exams, new cards and new songs will appear here after they happen.") + "</p></div>";
      } else {
        const activityCompare = compare && activity.since <= data.previousFrom;
        html += '<div class="overview">';
        if (overall) html += '<div><b>' + activity.activeUsers + '</b><span>Active people</span>' + statsDelta(activity.activeUsers, activity.previousActiveUsers, activityCompare) + '<p class="hint">Signed-in people with a recorded action.</p></div>';
        html += '<div><b>' + activity.answers + '</b><span>Answers checked</span>' + statsDelta(activity.answers, activity.previousAnswers, activityCompare) + "</div>";
        if (!activity.answers) html += '<div><b>—</b><span>Correct</span><p class="hint">No checked answers in this period.</p></div>';
        else html += '<div><b>' + Math.round(activity.correct * 100 / activity.answers) + '%</b><span>Correct</span><p class="hint">' + activity.correct + " of " + activity.answers + "</p></div>";
        if (!activity.exams) html += '<div><b>—</b><span>Exams passed</span><p class="hint">No exams in this period.</p></div>';
        else html += '<div><b>' + activity.examPass + "/" + activity.exams + '</b><span>Exams passed</span>' + statsDelta(activity.examPass, activity.previousExamPass, activityCompare) + "</div>";
        html += "</div>";
        html += '<div class="overview">';
        html += '<div><b>' + activity.learned + '</b><span>Learned checks</span>' + statsDelta(activity.learned, activity.previousLearned, activityCompare) + '<p class="hint">A check reached four correct answers in a row.</p></div>';
        html += '<div><b>' + activity.cards + '</b><span>Cards added</span>' + statsDelta(activity.cards, activity.previousCards, activityCompare) + "</div>";
        if (!data.hideSongs) {
          html += '<div><b>' + activity.songs + '</b><span>Songs added</span>' + statsDelta(activity.songs, activity.previousSongs, activityCompare) + "</div>";
          html += '<div><b>' + activity.archives + '</b><span>Songs archived</span>' + statsDelta(activity.archives, activity.previousArchives, activityCompare) + "</div>";
        }
        html += "</div>";
        html += '<p class="hint">Study recording started ' + esc(activity.since) + " UTC. Days before that are left out, not shown as zero.</p>";
        if (compare && !activityCompare) html += '<p class="hint">The previous period started before recording, so study figures are not compared with it.</p>';
        const answerBars = statsBuckets(activity.series || [], "answers");
        if (answerBars.length) {
          html += '<div class="card"><p class="label">Answers checked' + ((activity.series || []).length > 42 ? " by week" : " by day") + "</p>";
          html += '<p class="hint">Number of checked answers. Unit: answers.</p>';
          html += statsBars(answerBars, "Answers checked");
          html += "</div>";
        }
        const rates = statsRates(activity.series || []);
        if (rates.length) {
          html += '<div class="card"><p class="label">Correct answers, percent' + ((activity.series || []).length > 42 ? " by week" : " by day") + "</p>";
          html += '<p class="hint">Only ' + ((activity.series || []).length > 42 ? "weeks" : "days") + " that have checked answers. Unit: percent.</p>";
          html += statsBars(rates, "Correct answers, percent");
          html += "</div>";
        }
        html += statsList("Answers by quiz", activity.byArea);
        html += statsList("Cards added by place", activity.cardAreas);
        const failLabels = { time: "Time ran out", mistakes: "Two mistakes", score: "Not passed" };
        const failMap = {};
        Object.keys(activity.examFail || {}).forEach((key) => { failMap[failLabels[key] || key] = activity.examFail[key]; });
        html += statsList("Exams not passed", failMap);
        if (activity.funnel) {
          html += '<div class="card"><p class="label">Study steps</p><p class="hint">' + (overall ? "People in this period. Each step counts a person once." : "Your steps in this period.") + "</p>";
          html += '<div class="funnel-step"><span>Checked an answer</span><b>' + activity.funnel.answered + "</b></div>";
          html += '<div class="funnel-step"><span>Had a correct answer</span><b>' + activity.funnel.correct + "</b></div>";
          html += '<div class="funnel-step"><span>Learned a check</span><b>' + activity.funnel.learned + "</b></div></div>";
        }
        if (activityCompare && activity.retention && !overall) {
          html += '<div class="card"><p class="label">Came back</p><p>' + (activity.retention.returned ? "You studied in the previous period and again in this one." : "You studied in the previous period, and not in this one.") + "</p></div>";
        } else if (activityCompare && activity.retention) {
          html += '<div class="card"><p class="label">Came back</p><p><b>' + activity.retention.returned + "</b> of <b>" + activity.retention.base + "</b> people who studied in the previous period also studied in this one.</p></div>";
        } else if (activityCompare) {
          html += '<div class="card"><p class="label">Came back</p><p class="hint">' + (overall ? "Nobody studied in the previous period, so this share cannot be calculated." : "You did not study in the previous period, so this cannot be calculated.") + "</p></div>";
        }
        if (overall && data.byUser && data.byUser.length) {
          html += '<div class="card"><p class="label">People</p><p class="hint">Study in this period. One row per person who has a recorded action.</p>';
          html += '<table class="stat-table"><thead><tr><th>Person</th><th>Role</th><th>Answers</th><th>Correct</th><th>Exams</th><th>Learned</th><th>Cards</th><th>Songs</th></tr></thead><tbody>';
          data.byUser.forEach((row) => {
            html += "<tr><td>" + esc(row.login || "Account") + "</td><td>" + esc(roleLabel(row.role)) + "</td><td>" + row.answers + "</td><td>" + row.correct + "</td><td>" + row.examPass + "/" + row.exams + "</td><td>" + row.learned + "</td><td>" + row.cards + "</td><td>" + row.songs + "</td></tr>";
          });
          html += "</tbody></table></div>";
        }
      }
      html += '<div class="row"><button class="btn" type="button" data-stats-export>Download CSV</button></div></div>';
      boxDataset(data);
      return html;
    }
    function statsVisualSummary(data, compare) {
      const a = data.activity || {};
      const pct = (part, total) => total ? Math.round(part * 100 / total) : 0;
      const minutes = Math.round((a.seconds || 0) / 60);
      const previousMinutes = Math.round((a.previousSeconds || 0) / 60);
      const role = viewAccount ? "student" : (authUser && authUser.role === "DEVELOPER" ? "developer" : authUser && authUser.role === "ADMIN" ? "teacher" : "student");
      const heading = role === "developer" ? "System overview" : role === "teacher" ? "Teaching and learning" : "Learning overview";
      const tiles = [
        [a.answers || 0, "Answers", a.previousAnswers || 0],
        [pct(a.correct || 0, a.answers || 0) + "%", "Accuracy", pct(a.previousCorrect || 0, a.previousAnswers || 0) + "%"],
        [a.learned || 0, "Learned checks", a.previousLearned || 0],
        [minutes + " min", "Study time", previousMinutes + " min"]
      ];
      const modes = [["overview", "Overview"], ["learning", "Learning"], ["materials", "Materials"], ["exams", "Exams"], ["activity", "Activity"], ["details", "Details"]];
      if (role === "developer") modes.push(["system", "System"]);
      let html = '<div class="stat-section-head"><div><span>' + esc(heading) + '</span><h2>' + (viewAccount ? esc(viewAccount.name || viewAccount.login || "Student") : "Statistics") + '</h2></div></div>';
      if (viewAccount) html += '<div class="stat-person"><b>' + esc(viewAccount.name || "Name not provided") + '</b><span>@' + esc(viewAccount.login || "student") + '</span><span>' + esc(viewAccount.email || "Email not provided") + '</span><span>Student</span><span>Group: not assigned</span></div>';
      html += '<div class="stat-modes" role="tablist">' + modes.map((mode) => '<button type="button" role="tab" aria-selected="' + (statsMode === mode[0]) + '" class="' + (statsMode === mode[0] ? "on" : "") + '" data-stats-mode="' + mode[0] + '">' + mode[1] + '</button>').join('') + '</div>';
      html += '<div class="stat-panel' + (statsMode === "overview" ? " on" : "") + '" data-stat-panel="overview"><div class="stat-kpis">' + tiles.map((row) => '<div class="stat-kpi"><b>' + row[0] + '</b><span>' + row[1] + '</span>' + (compare ? '<small>Previous: ' + row[2] + '</small>' : '') + '</div>').join('') + '</div>';
      const rows = [
        ["Answers", a.answers || 0, a.previousAnswers || 0],
        ["Learned", a.learned || 0, a.previousLearned || 0],
        ["Cards added", a.cards || 0, a.previousCards || 0],
        ["Exams", a.exams || 0, a.previousExams || 0],
        ["Study minutes", minutes, previousMinutes]
      ];
      const max = Math.max(1, ...rows.flatMap((row) => [Number(row[1]) || 0, Number(row[2]) || 0]));
      html += '<section class="stat-compare"><div class="stat-title"><h2>Progress by period</h2><span><i></i>Selected period <i></i>Previous</span></div>' + rows.map((row) => '<div class="stat-compare-row"><b>' + row[0] + '</b><div><i style="--w:' + Math.round(row[1] * 100 / max) + '%"></i><i style="--w:' + Math.round(row[2] * 100 / max) + '%"></i></div><span>' + row[1] + (compare ? ' / ' + row[2] : '') + '</span></div>').join('') + '</section></div>';
      const accuracy = pct(a.correct || 0, a.answers || 0), examRate = pct(a.examPass || 0, a.exams || 0);
      const ring = (value, label, detail) => '<div class="stat-ring-item"><div class="stat-ring" style="--p:' + value + '"><b>' + value + '%</b></div><strong>' + label + '</strong><small>' + detail + '</small></div>';
      html += '<div class="stat-panel' + (statsMode === "learning" ? " on" : "") + '" data-stat-panel="learning"><div class="stat-rings">' + ring(accuracy, "Answer accuracy", (a.correct || 0) + " correct") + ring(Math.min(100, (a.learned || 0) * 10), "Learned checks", (a.learned || 0) + " completed") + ring(examRate, "Exam success", (a.examPass || 0) + " passed") + '</div><div class="card saas-card"><p class="label">Answers over time</p>' + statsBars(statsBuckets(a.series || [], "answers"), "Answers over time") + '</div>' + statsList("Practice by quiz type", a.byArea) + '</div>';
      html += '<div class="stat-panel' + (statsMode === "materials" ? " on" : "") + '" data-stat-panel="materials"><div class="stat-kpis"><div class="stat-kpi"><b>' + (a.cards || 0) + '</b><span>Cards added</span></div><div class="stat-kpi"><b>' + (a.songs || 0) + '</b><span>Songs added</span></div><div class="stat-kpi"><b>' + (a.archives || 0) + '</b><span>Archived</span></div><div class="stat-kpi"><b>' + (a.learned || 0) + '</b><span>Learned checks</span></div></div>' + statsList("Cards and materials by section", a.cardAreas) + '</div>';
      html += '<div class="stat-panel' + (statsMode === "exams" ? " on" : "") + '" data-stat-panel="exams"><div class="stat-rings">' + ring(examRate, "Pass rate", (a.examPass || 0) + " of " + (a.exams || 0)) + ring(Math.max(0, 100 - examRate), "Needs review", Math.max(0, (a.exams || 0) - (a.examPass || 0)) + " attempts") + '</div>' + statsList("Why exams were not passed", a.examFail) + '</div>';
      html += '<div class="stat-panel' + (statsMode === "activity" ? " on" : "") + '" data-stat-panel="activity"><div class="stat-kpis"><div class="stat-kpi"><b>' + minutes + '</b><span>Study minutes</span></div><div class="stat-kpi"><b>' + (a.answers || 0) + '</b><span>Interactions</span></div><div class="stat-kpi"><b>' + ((a.series || []).filter((row) => (row.answers || row.seconds || row.exams)).length) + '</b><span>Active days</span></div><div class="stat-kpi"><b>' + accuracy + '%</b><span>Accuracy</span></div></div><div class="card saas-card"><p class="label">Daily activity</p>' + statsBars(statsBuckets(a.series || [], "answers"), "Daily activity") + '</div></div>';
      if (data.developerBugs) {
        const bugs = data.developerBugs;
        const system = data.developerSystem || {};
        html += '<div class="stat-panel' + (statsMode === "system" ? " on" : "") + '" data-stat-panel="system"><div class="stat-system"><div class="stat-title"><h2>System health</h2><span>Live application snapshot</span></div><div class="stat-kpis"><div class="stat-kpi"><b>' + bugs.active + '</b><span>Active bugs</span><small>' + bugs.hits + ' recorded occurrences</small></div><div class="stat-kpi"><b>' + bugs.resolved + '</b><span>Resolved bugs</span></div><div class="stat-kpi"><b>' + (system.cards || 0) + '</b><span>Cards available</span></div><div class="stat-kpi"><b>' + (system.materials || 0) + '</b><span>Personal materials</span></div></div><div class="system-status"><div><i class="' + (system.online ? "ok" : "bad") + '"></i><span>Network</span><b>' + (system.online ? "Online" : "Offline") + '</b></div><div><i class="' + (system.preloadActive ? "busy" : "ok") + '"></i><span>Background loading</span><b>' + (system.preloadActive || 0) + ' active · ' + (system.preloadWaiting || 0) + ' waiting</b></div><div><i class="ok"></i><span>Viewport</span><b>' + esc(system.viewport || "—") + '</b></div></div><button class="btn primary saas-btn" type="button" data-jump="bugs">Open bug diagnostics</button></div></div>';
      }
      return html;
    }
    function boxDataset(data) {
      const box = document.getElementById("statsBody");
      if (box) box._stats = data;
    }
    function csvCell(value) {
      const text = String(value == null ? "" : value);
      if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }
    function exportStats() {
      const box = document.getElementById("statsBody");
      const data = box && box._stats;
      if (!data) return;
      const lines = ["day,new accounts,answers,correct answers"];
      const answers = {};
      ((data.activity && data.activity.series) || []).forEach((row) => { answers[row.day] = row; });
      const days = (data.scope === "all" && data.accounts && data.accounts.series) || (data.activity && data.activity.series) || [];
      days.forEach((row) => {
        const study = answers[row.day] || {};
        const accounts = data.scope === "all" && row.count != null ? row.count : "";
        lines.push([row.day, accounts, study.answers == null ? "" : study.answers, study.correct == null ? "" : study.correct].join(","));
      });
      if (data.scope === "all" && data.byUser && data.byUser.length) {
        lines.push("");
        lines.push("person,role,answers,correct,exams,passed,learned,cards,songs");
        data.byUser.forEach((row) => {
          lines.push([csvCell(row.login || "Account"), csvCell(roleLabel(row.role)), row.answers, row.correct, row.exams, row.examPass, row.learned, row.cards, row.songs].join(","));
        });
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "statistics-" + data.from + "-to-" + data.to + ".csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }
