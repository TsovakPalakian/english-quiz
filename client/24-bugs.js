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
    function bugDayKey(ms) {
      if(!Number(ms))return '';
      const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Number(ms)));
      const part=type=>parts.find(value=>value.type===type).value;
      return part('year')+'-'+part('month')+'-'+part('day');
    }
    function bugDayLabel(key) {
      return key?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric'}).format(new Date(key+'T12:00:00')):'Date not recorded';
    }
    function bugHistoryHtml(row) {
      const days=new Map();
      for(const event of row.occurrences||[]){
        const key=bugDayKey(event.at);if(!key)continue;
        const day=days.get(key)||{count:0,inferred:false};day.count++;day.inferred ||= !!event.inferred;days.set(key,day);
      }
      const missing=Math.max(0,Number(row.undatedOccurrences)||0);
      const events=[...days].map(([key,day])=>({at:key,label:bugDayLabel(key)+' — '+(missing&&day.inferred?'at least ':'')+day.count+' occurrence'+(day.count===1?'':'s')}));
      for(const event of row.resolutions||[])events.push({at:bugDayKey(event.at),label:'Resolved: '+bugWhen(event.at,row.timeZone)});
      events.sort((a,b)=>b.at.localeCompare(a.at));
      const entries=events.map(event=>'<li>'+esc(event.label)+'</li>').join('');
      return '<details class="bug-history" data-bug-history="'+esc(row.id)+'"><summary>Occurrence history · '+Math.max(1,Number(row.hits)||1)+'</summary><ul>'+entries+(missing?'<li>'+missing+' earlier occurrence'+(missing===1?'':'s')+' without recorded dates</li>':'')+(!entries&&!missing?'<li>Date not recorded</li>':'')+'</ul></details>';
    }
    function bugRowsHtml(rows, canResolve) {
      if (!rows.length) return '<p class="sub">No bugs yet.</p>';
      const ordered = rows.slice().sort((a, b) => {
        const fixed = Number(!!a.resolved) - Number(!!b.resolved);
        if (fixed) return fixed;
        const date = (Number(b.resolved?b.resolvedAt:b.lastAt) || 0) - (Number(a.resolved?a.resolvedAt:a.lastAt) || 0);
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
          "Count: " + hits, "Last: " + when, "First: " + first, row.resolved ? 'Resolved: '+(row.resolvedAt?bugWhen(row.resolvedAt,zone):'Date not recorded'):'', ctx.screen ? "Screen: " + ctx.screen : "",
          ctx.href ? "Page: " + ctx.href : "", (ctx.userAgent || headers["user-agent"]) ? "Browser: " + (ctx.userAgent || headers["user-agent"]) : "",
          ctx.language ? "Language: " + ctx.language : "", ctx.viewport ? "Viewport: " + ctx.viewport : "",
          typeof ctx.online === "boolean" ? "Online: " + (ctx.online ? "yes" : "no") : "",
          ctx.stack ? "Stack:\n" + ctx.stack : "", earlier ? "Earlier:\n" + earlier : "",
          "", "Request", JSON.stringify(row.request || {}, null, 2), "", "Response", JSON.stringify(row.response || {}, null, 2)
        ].filter(Boolean).join("\n");
        const stamp = '<small class="bug-stamp">'+esc(row.resolved?'Resolved: '+(row.resolvedAt?bugWhen(row.resolvedAt,zone):'Date not recorded'):when)+'</small>';
        const caption = esc(happened) + " · " + esc(who) + stamp;
        const route = ((row.method || "") + " " + (row.path || "")).trim();
        const resolve = canResolve ? '<button class="day-hide bug-resolve" type="button" data-bug-resolve="' + esc(row.id) + '" aria-label="Resolve bug" title="Resolve bug">✓</button>' : "";
        const copy = '<button class="day-edit bug-copy" type="button" data-bug-copy="' + esc(row.id) + '" aria-label="Copy bug body" title="Copy bug body">⧉</button>';
        return '<div class="bug-item' + (row.resolved ? " is-fixed" : "") + '"><div class="day-row"><button class="day" type="button" data-bug="' + esc(row.id) + '" aria-expanded="false"><span class="date"><b>' + (index + 1) + '</b><small>×' + hits + '</small></span><b>' + esc(route || place) + '</b><span class="label about">' + caption + '</span></button><div class="day-tools">' + resolve + copy + '</div></div><div class="bug-body" hidden>'+bugHistoryHtml(row)+'<pre class="bug-detail">' + esc(detail) + "</pre></div></div>";
      }).join("");
    }
    function bugListHtml(rows,canResolve){
      if(!rows.length)return '<p class="sub">No bugs yet.</p>';
      const days=new Map();
      for(const row of rows){const key=bugDayKey(row.resolved?row.resolvedAt:row.lastAt);if(!days.has(key))days.set(key,[]);days.get(key).push(row);}
      return [...days.keys()].sort((a,b)=>b.localeCompare(a)).map((key,index)=>'<details class="bug-day" data-bug-day="'+esc(key||'unknown')+'"'+(index===0?' open':'')+'><summary><span>'+esc(bugDayLabel(key))+'</span><small>'+days.get(key).length+'</small></summary><div class="bug-day-list">'+bugRowsHtml(days.get(key),canResolve)+'</div></details>').join('');
    }
    let bugTab = "open";
    let bugCache = null;
    const bugExpansion=new Map();
    let feedbackStatusTab = "active"; // "active" or "resolved"
    let feedbackFilterCategory = "all";
    let feedbackSearchQuery = "";
    let feedbackLoadedItems = [];
    let feedbackTotal = 0;
    const FEEDBACK_PAGE_LIMIT = 20;

    function updateFeedbackTabBadge(openCount) {
      const tabBtn = document.querySelector('button[data-bug-tab="feedback"]');
      if (!tabBtn) return;
      const count = Number(openCount) || 0;
      let badge = tabBtn.querySelector('.feedback-tab-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'feedback-tab-badge';
          badge.style.cssText = 'margin-left:6px;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:600;background:var(--acc, #0284c7);color:var(--on-acc, #fff);display:inline-block;line-height:1.2;';
          tabBtn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
      } else if (badge) {
        badge.remove();
      }
    }

    function filterFeedbackItems(items) {
      const q = feedbackSearchQuery.toLowerCase().trim();
      return items.filter(fb => {
        if (feedbackFilterCategory !== "all" && fb.category !== feedbackFilterCategory) return false;
        if (q) {
          const matchMsg = String(fb.message || "").toLowerCase().includes(q);
          const matchUser = String(fb.userLogin || fb.userEmail || "").toLowerCase().includes(q);
          const matchUrl = String(fb.url || "").toLowerCase().includes(q);
          if (!matchMsg && !matchUser && !matchUrl) return false;
        }
        return true;
      });
    }

    function exportFeedbackCsv(items) {
      const header = ['ID', 'Category', 'User', 'Email/Contact', 'Message', 'URL', 'Created (UTC)', 'Resolved', 'ResolvedAt (UTC)'];
      const rows = items.map(fb => [
        fb.id,
        fb.category,
        fb.userLogin ? '@' + fb.userLogin : '',
        fb.userEmail || '',
        `"${String(fb.message || '').replace(/"/g, '""')}"`,
        `"${String(fb.url || '').replace(/"/g, '""')}"`,
        fb.createdAt ? new Date(fb.createdAt * 1000).toISOString() : '',
        fb.resolved ? 'Yes' : 'No',
        fb.resolvedAt ? new Date(fb.resolvedAt * 1000).toISOString() : ''
      ]);
      const csv = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback-${feedbackStatusTab}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function renderFeedbackCards(items, container) {
      if (!container) return;
      const filtered = filterFeedbackItems(items);

      if (!filtered.length) {
        container.innerHTML = `<p class="sub" style="padding:16px 0;">No ${feedbackStatusTab} feedback reports match current filter.</p>`;
        return;
      }

      const cardsHtml = filtered.map(fb => `
        <article class="bug-item card">
          <div class="bug-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 14px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                <span class="chip" style="font-size:12px;font-weight:600;">${fb.category === 'bug' ? '🐞 Bug' : fb.category === 'idea' ? '💡 Idea' : '❓ Question'}</span>
                <b style="font-size:13px;">${esc(fb.userLogin ? '@' + fb.userLogin : (fb.userEmail || 'Guest'))}</b>
                <small style="color:var(--ink-sub);">${esc(bugWhen(fb.createdAt * 1000))}</small>
                ${fb.resolved && fb.resolvedAt ? `<span class="chip" style="font-size:11px;color:var(--ok, #10b981);">✓ Resolved ${esc(bugWhen(fb.resolvedAt * 1000))}</span>` : ''}
              </div>
              <p style="margin:0 0 8px 0;font-size:14px;white-space:pre-wrap;">${esc(fb.message)}</p>
              ${fb.url ? `<small style="display:block;color:var(--ink-sub);margin-bottom:8px;">Page: <a href="${esc(fb.url)}" target="_blank" style="color:var(--accent);">${esc(fb.url)}</a></small>` : ''}
              ${(fb.deviceInfo?.breadcrumbs && fb.deviceInfo.breadcrumbs.length) ? `
                <details style="margin-top:8px;font-size:12px;color:var(--ink-sub);">
                  <summary style="cursor:pointer;user-select:none;font-weight:500;">User actions (${fb.deviceInfo.breadcrumbs.length})</summary>
                  <ul style="margin:4px 0 0 16px;padding:0;line-height:1.5;">
                    ${fb.deviceInfo.breadcrumbs.map(c => `<li><span style="opacity:0.7;">${esc(c.ago || '')}</span>: <b>${esc(c.action || '')}</b> ${esc(c.details || '')}</li>`).join('')}
                  </ul>
                </details>
              ` : ''}
              ${fb.screenshot ? `<div style="margin-top:8px;"><img src="${fb.screenshot}" alt="Screenshot" style="max-width:100%;max-height:260px;border-radius:6px;border:1px solid var(--line);cursor:zoom-in;" onclick="window.open('${fb.screenshot}')"></div>` : ''}
            </div>
            <div>
              ${fb.resolved ? `
                <button class="btn tiny ghost" type="button" data-feedback-unresolve="${esc(fb.id)}" title="Reopen this report">Reopen</button>
              ` : `
                <button class="btn tiny" type="button" data-feedback-resolve="${esc(fb.id)}">Resolve</button>
              `}
            </div>
          </div>
        </article>
      `).join('');

      const canLoadMore = items.length < feedbackTotal && feedbackFilterCategory === 'all' && !feedbackSearchQuery;
      const loadMoreHtml = canLoadMore ? `
        <div style="text-align:center;padding:16px 0;" id="feedbackLoadMoreBox">
          <button type="button" class="btn small" id="feedbackLoadMoreBtn">Load more (${items.length} of ${feedbackTotal})</button>
        </div>
      ` : '';

      container.innerHTML = cardsHtml + loadMoreHtml;

      const loadMoreBtn = container.querySelector('#feedbackLoadMoreBtn');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          loadMoreBtn.disabled = true;
          loadMoreBtn.textContent = 'Loading...';
          const isResolvedQuery = feedbackStatusTab === "resolved" ? "1" : "0";
          accountFetch(`/api/feedback?resolved=${isResolvedQuery}&limit=${FEEDBACK_PAGE_LIMIT}&offset=${items.length}`).then(res => {
            const more = (res && res.feedback) || [];
            items.push(...more);
            feedbackTotal = Number(res?.total) || items.length;
            renderFeedbackCards(items, container);
          }).catch(() => {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Failed to load. Retry?';
          });
        });
      }
    }

    function paintBugs(preset) {
      const box = document.getElementById("bugList");
      if (!box) return;
      const draw = (rows) => {
        if(box.dataset.bugListTab)bugExpansion.set(box.dataset.bugListTab,{
          days:new Set([...box.querySelectorAll('[data-bug-day][open]')].map(node=>node.dataset.bugDay)),
          history:new Set([...box.querySelectorAll('[data-bug-history][open]')].map(node=>node.dataset.bugHistory)),
          bugs:new Set([...box.querySelectorAll('[data-bug][aria-expanded="true"]')].map(node=>node.dataset.bug)),
        });
        const shown = rows.filter((row) => bugTab === "done" ? row.resolved : !row.resolved);
        box.innerHTML = bugListHtml(shown, bugTab !== "done");
        box.dataset.bugListTab=bugTab;
        const expanded=bugExpansion.get(bugTab);if(!expanded)return;
        box.querySelectorAll('[data-bug-day]').forEach(node=>{node.open=expanded.days.has(node.dataset.bugDay);});
        box.querySelectorAll('[data-bug-history]').forEach(node=>{node.open=expanded.history.has(node.dataset.bugHistory);});
        box.querySelectorAll('[data-bug]').forEach(node=>{if(expanded.bugs.has(node.dataset.bug)){node.setAttribute('aria-expanded','true');node.classList.add('active');node.closest('.bug-item').querySelector('.bug-body').hidden=false;}});
      };
      const onBugs = () => (document.querySelector("section.on") || {}).id === "bugs";
      if (Array.isArray(preset)) { draw(preset); return; }
      if (!isDeveloper()) return;
      if (bugTab === "feedback") {
        box.innerHTML = '<p class="sub">Loading user feedback...</p>';
        const isResolvedQuery = feedbackStatusTab === "resolved" ? "1" : "0";
        accountFetch(`/api/feedback?resolved=${isResolvedQuery}&limit=${FEEDBACK_PAGE_LIMIT}&offset=0`).then(data => {
          if (!onBugs() || bugTab !== "feedback") return;
          updateFeedbackTabBadge(data.counts?.open);
          feedbackLoadedItems = (data && data.feedback) || [];
          feedbackTotal = Number(data && data.total) || feedbackLoadedItems.length;

          const bugCount = feedbackLoadedItems.filter(i => i.category === 'bug').length;
          const ideaCount = feedbackLoadedItems.filter(i => i.category === 'idea').length;
          const qCount = feedbackLoadedItems.filter(i => i.category === 'question').length;

          box.innerHTML = `
            <div class="feedback-filter-toolbar card" style="padding:12px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div class="steps" style="margin:0;">
                  <button type="button" class="step ${feedbackStatusTab === 'active' ? 'on' : ''}" data-fb-status="active">Active (${data.counts?.open ?? bugCount})</button>
                  <button type="button" class="step ${feedbackStatusTab === 'resolved' ? 'on' : ''}" data-fb-status="resolved">Resolved archive (${data.counts?.resolved ?? 0})</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <button type="button" class="btn tiny ghost" id="feedbackExportCsv" title="Export filtered feedback to CSV">📥 CSV</button>
                  <input type="search" id="feedbackSearchInput" placeholder="Search message, user, url..." value="${esc(feedbackSearchQuery)}" style="width:200px;height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-sizing:border-box;font:inherit;font-size:13px;">
                </div>
              </div>
              <div class="feedback-filter-chips" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="btn chip ${feedbackFilterCategory === 'all' ? 'on' : ''}" data-fb-filter="all">All (${feedbackLoadedItems.length})</button>
                <button type="button" class="btn chip ${feedbackFilterCategory === 'bug' ? 'on' : ''}" data-fb-filter="bug">🐞 Bugs (${bugCount})</button>
                <button type="button" class="btn chip ${feedbackFilterCategory === 'idea' ? 'on' : ''}" data-fb-filter="idea">💡 Ideas (${ideaCount})</button>
                ${qCount ? `<button type="button" class="btn chip ${feedbackFilterCategory === 'question' ? 'on' : ''}" data-fb-filter="question">❓ Questions (${qCount})</button>` : ''}
              </div>
            </div>
            <div id="feedbackCardsList"></div>
          `;

          const listContainer = box.querySelector('#feedbackCardsList');
          renderFeedbackCards(feedbackLoadedItems, listContainer);

          // Handle Active / Resolved toggle
          box.querySelectorAll('[data-fb-status]').forEach(btn => {
            btn.addEventListener('click', () => {
              if (feedbackStatusTab === btn.dataset.fbStatus) return;
              feedbackStatusTab = btn.dataset.fbStatus || 'active';
              paintBugs();
            });
          });

          // Handle Category filters
          box.querySelectorAll('[data-fb-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
              feedbackFilterCategory = btn.dataset.fbFilter || 'all';
              box.querySelectorAll('[data-fb-filter]').forEach(b => b.classList.toggle('on', b === btn));
              renderFeedbackCards(feedbackLoadedItems, listContainer);
            });
          });

          // Handle Search input
          const searchInput = box.querySelector('#feedbackSearchInput');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              feedbackSearchQuery = e.target.value;
              renderFeedbackCards(feedbackLoadedItems, listContainer);
            });
          }

          // Handle Export CSV
          const exportBtn = box.querySelector('#feedbackExportCsv');
          if (exportBtn) {
            exportBtn.addEventListener('click', () => {
              const currentFiltered = filterFeedbackItems(feedbackLoadedItems);
              exportFeedbackCsv(currentFiltered);
            });
          }
        }).catch(() => {
          if (onBugs()) box.innerHTML = '<p class="sub">Failed to load feedback reports.</p>';
        });
        return;
      }
      accountFetch("/api/feedback?limit=1").then(data => {
        updateFeedbackTabBadge(data.counts?.open);
      }).catch(()=>{});
      if (bugCache) {
        draw(bugCache);
        accountFetch("/api/bugs?heads=1").then((data) => {
          if (!onBugs()) return;
          const heads = (data && data.heads) || [];
          const known = new Map(bugCache.map((row) => [row.id, row]));
          const need = [];
          heads.forEach((head) => {
            const row = known.get(head.id);
            if (!row || row.hits !== head.hits || !!row.resolved !== !!head.resolved || row.resolvedAt!==head.resolvedAt) need.push(head.id);
          });
          const live = new Set(heads.map((head) => head.id));
          bugCache = bugCache.filter((row) => live.has(row.id));
          if (!need.length) { draw(bugCache); return; }
          return (async()=>{
            const map = new Map(bugCache.map((row) => [row.id, row]));
            for(let start=0;start<need.length;start+=20){
              const full=await accountFetch('/api/bugs?ids='+need.slice(start,start+20).map(encodeURIComponent).join(','));
              ((full&&full.bugs)||[]).forEach(row=>map.set(row.id,row));
            }
            bugCache = heads.map((head) => map.get(head.id)).filter(Boolean);
            if (onBugs()) draw(bugCache);
          })();
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
