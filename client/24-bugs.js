    function bugWhen(ms, zone) {
      const time = Number(ms);
      if (!time) return "";
      const timeZone = zone || "UTC";
      try {
        const shown = new Intl.DateTimeFormat("en-GB", {
          timeZone: timeZone, day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hourCycle: "h23", timeZoneName: "shortOffset"
        }).format(new Date(time));
        return timeZone === "UTC" ? shown : shown + " " + timeZone;
      } catch (e) {
        return new Date(time).toISOString() + " UTC";
      }
    }
    async function copyBugBody(button) {
      const item = button && button.closest(".bug-item");
      const detail = item && item.querySelector(".bug-detail");
      const text = detail ? detail.textContent : "";
      if (!text) return;
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
          const area = document.createElement("textarea");
          area.value = text;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
          area.remove();
        }
        button.textContent = "✓";
        setTimeout(() => { if (button.isConnected) button.textContent = "⧉"; }, 1200);
      } catch (e) {
        button.title = "Copy failed";
      }
    }
    function bugListHtml(rows, canResolve) {
      if (!rows.length) return '<p class="sub">No bugs yet.</p>';
      const ordered = rows.slice().sort((a, b) => {
        const fixed = Number(!!a.resolved) - Number(!!b.resolved);
        if (fixed) return fixed;
        const date = (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0);
        if (date) return date;
        return (Number(b.hits) || 0) - (Number(a.hits) || 0);
      });
      return ordered.map((row, index) => {
        const hits = Math.max(1, Number(row.hits) || 1);
        const who = (row.accounts || []).filter(Boolean).join(", ") || "Unknown account";
        const zone = row.timeZone || "UTC";
        const when = row.when || bugWhen(row.lastAt, zone);
        const first = row.firstWhen || bugWhen(row.firstAt, zone);
        const place = (() => {
          const raw = row.request && row.request.url ? String(row.request.url) : (row.path || "");
          const [path, query] = raw.split("#")[0].split("?");
          return ((row.method || "") + " " + path + (query ? "?" + query : "")).trim();
        })();
        const happened = ((row.status || row.status === 0 ? String(row.status) + " " : "") + (row.error || "")).trim();
        const ctx = row.request && row.request.context && typeof row.request.context === "object" ? row.request.context : {};
        const app = ctx.application && typeof ctx.application === "object" ? ctx.application : {};
        const headers = row.request && row.request.headers && typeof row.request.headers === "object" ? row.request.headers : {};
        const history = Array.isArray(row.request && row.request.history) ? row.request.history : [];
        const earlier = history.map((item) => [bugWhen(item && item.at, zone), item && item.url, item && item.body].filter(Boolean).join(" ")).join("\n");
        const detail = [
          "Bug ID: " + (row.id || ""), "Where: " + place, "What happened: " + happened, "Account: " + who, ctx.role ? "Role: " + ctx.role : "",
          app.name ? "Application: " + app.name : "", app.service ? "Service: " + app.service : "",
          app.deploymentId ? "Deployment ID: " + app.deploymentId : "", app.deploymentTag ? "Deployment tag: " + app.deploymentTag : "",
          app.deployedAt ? "Deployed: " + app.deployedAt : "", app.host ? "Host: " + app.host : "",
          "Count: " + hits, "Last: " + when, "First: " + first, ctx.screen ? "Screen: " + ctx.screen : "",
          ctx.href ? "Page: " + ctx.href : "", (ctx.userAgent || headers["user-agent"]) ? "Browser: " + (ctx.userAgent || headers["user-agent"]) : "",
          ctx.language ? "Language: " + ctx.language : "", ctx.viewport ? "Viewport: " + ctx.viewport : "",
          typeof ctx.online === "boolean" ? "Online: " + (ctx.online ? "yes" : "no") : "",
          ctx.stack ? "Stack:\n" + ctx.stack : "", earlier ? "Earlier:\n" + earlier : "",
          "", "Request", JSON.stringify(row.request || {}, null, 2), "", "Response", JSON.stringify(row.response || {}, null, 2)
        ].filter(Boolean).join("\n");
        const stamp = when ? '<small style="display:block;font-size:11px;font-weight:400">' + esc(when) + "</small>" : "";
        const caption = esc(happened) + " · " + esc(who) + stamp;
        const route = ((row.method || "") + " " + (row.path || "")).trim();
        const resolve = canResolve ? '<button class="day-hide bug-resolve" type="button" data-bug-resolve="' + esc(row.id) + '" aria-label="Resolve bug" title="Resolve bug">✓</button>' : "";
        const copy = '<button class="day-edit bug-copy" type="button" data-bug-copy="' + esc(row.id) + '" aria-label="Copy bug body" title="Copy bug body">⧉</button>';
        return '<div class="bug-item' + (row.resolved ? " is-fixed" : "") + '"><div class="day-row"><button class="day" type="button" data-bug="' + esc(row.id) + '"><span class="date"><b>' + (index + 1) + '</b><small>×' + hits + '</small></span><b>' + esc(route || place) + '</b><span class="label about">' + caption + '</span></button><div class="day-tools">' + resolve + copy + '</div></div><pre class="bug-detail" hidden>' + esc(detail) + "</pre></div>";
      }).join("");
    }
    let bugTab = "open";
    let bugCache = null;
    function paintBugs(preset) {
      const box = document.getElementById("bugList");
      if (!box) return;
      const draw = (rows) => {
        const shown = rows.filter((row) => bugTab === "done" ? row.resolved : !row.resolved);
        box.innerHTML = bugListHtml(shown, bugTab !== "done");
      };
      const onBugs = () => (document.querySelector("section.on") || {}).id === "bugs";
      if (Array.isArray(preset)) { draw(preset); return; }
      if (!isDeveloper()) return;
      if (bugCache) {
        draw(bugCache);
        accountFetch("/api/bugs?heads=1").then((data) => {
          if (!onBugs()) return;
          const heads = (data && data.heads) || [];
          const known = new Map(bugCache.map((row) => [row.id, row]));
          const need = [];
          heads.forEach((head) => {
            const row = known.get(head.id);
            if (!row || row.hits !== head.hits || !!row.resolved !== !!head.resolved) need.push(head.id);
          });
          const live = new Set(heads.map((head) => head.id));
          bugCache = bugCache.filter((row) => live.has(row.id));
          if (!need.length) { draw(bugCache); return; }
          return accountFetch("/api/bugs?ids=" + need.map((id) => encodeURIComponent(id)).join(",")).then((full) => {
            const map = new Map(bugCache.map((row) => [row.id, row]));
            ((full && full.bugs) || []).forEach((row) => map.set(row.id, row));
            bugCache = heads.map((head) => map.get(head.id)).filter(Boolean);
            if (onBugs()) draw(bugCache);
          });
        }).catch(() => {});
        return;
      }
      box.innerHTML = '<p class="sub">Loading…</p>';
      accountFetch("/api/bugs").then((data) => {
        if (!onBugs()) return;
        bugCache = (data && data.bugs) || [];
        draw(bugCache);
      }).catch(() => {
        if (onBugs()) box.innerHTML = '<p class="sub">The bug list could not be loaded.</p>';
      });
    }
    window.paintBugs = paintBugs;
