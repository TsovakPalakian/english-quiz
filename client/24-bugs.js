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
        const resolve = canResolve ? '<button class="day-hide bug-resolve saas-btn" type="button" data-bug-resolve="' + esc(row.id) + '" aria-label="Resolve bug" title="Resolve bug">✓</button>' : "";
        const copy = '<button class="day-edit bug-copy saas-btn" type="button" data-bug-copy="' + esc(row.id) + '" aria-label="Copy bug body" title="Copy bug body">⧉</button>';
        return '<div class="bug-item' + (row.resolved ? " is-fixed" : "") + '"><div class="day-row saas-card"><button class="day" type="button" data-bug="' + esc(row.id) + '" aria-expanded="false"><span class="date saas-badge saas-badge-muted"><b>' + (index + 1) + '</b><small>×' + hits + '</small></span><b>' + esc(route || place) + '</b><span class="label about saas-badge saas-badge-info">' + caption + '</span></button><div class="day-tools">' + resolve + copy + '</div></div><div class="bug-body" hidden>'+bugHistoryHtml(row)+'<pre class="bug-detail">' + esc(detail) + "</pre></div></div>";
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
    let feedbackUserLimits = {};
    let feedbackBreadcrumbsLimit = 10;
    const FEEDBACK_PAGE_LIMIT = 20;

    function formatFileSize(bytes) {
      const num = Number(bytes) || 0;
      if (num < 1024) return num + ' B';
      if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
      return (num / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fileTypeIcon(mime) {
      const m = String(mime || '').toLowerCase();
      if (m.startsWith('image/')) return '🖼️';
      if (m.startsWith('audio/')) return '🎵';
      if (m.startsWith('video/')) return '🎥';
      if (m.includes('pdf')) return '📕';
      if (m.includes('text') || m.includes('json') || m.includes('log') || m.includes('csv')) return '📄';
      if (m.includes('zip') || m.includes('tar') || m.includes('gzip') || m.includes('compressed')) return '📦';
      return '📎';
    }

    function sortFeedbackAttachments(list) {
      if (!Array.isArray(list)) return [];
      const typePriority = mime => {
        const m = String(mime || '').toLowerCase();
        if (m.startsWith('image/')) return 1;
        if (m.startsWith('video/')) return 2;
        if (m.startsWith('audio/')) return 3;
        if (m.includes('pdf')) return 4;
        if (m.includes('text') || m.includes('json') || m.includes('log') || m.includes('csv')) return 5;
        if (m.includes('zip') || m.includes('tar') || m.includes('gzip') || m.includes('compressed')) return 6;
        return 7;
      };
      return list.slice().sort((a, b) => {
        const pA = typePriority(a.mime || a.type);
        const pB = typePriority(b.mime || b.type);
        if (pA !== pB) return pA - pB;
        const tA = String(a.mime || a.type || '');
        const tB = String(b.mime || b.type || '');
        const mimeComp = tA.localeCompare(tB);
        if (mimeComp !== 0) return mimeComp;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    }

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

      const cardsHtml = filtered.map(fb => {
        const userKey = fb.userId || fb.userLogin;
        const customLimit = userKey && feedbackUserLimits && feedbackUserLimits[userKey] != null ? feedbackUserLimits[userKey] : null;
        const limitTag = userKey ? `
          <span style="display:inline-flex;align-items:center;gap:4px;margin-left:4px;">
            <span class="chip" style="font-size:11px;${customLimit != null ? 'background:rgba(234,179,8,0.15);color:#ca8a04;font-weight:600;' : 'opacity:0.7;'}">${customLimit != null ? customLimit + '/hr (custom)' : 'role default'}</span>
            <button type="button" class="btn tiny ghost" data-fb-set-limit="${esc(userKey)}" data-current-limit="${customLimit ?? ''}" style="padding:1px 5px;font-size:11px;" title="Configure feedback limit for ${esc(userKey)}">⚙ Limit</button>
          </span>
        ` : '';

        const attachments = sortFeedbackAttachments(Array.isArray(fb.attachments) && fb.attachments.length
          ? fb.attachments
          : (fb.screenshot ? [{ id: 'screenshot', name: 'screenshot.png', mime: 'image/png', dataUrl: fb.screenshot }] : []));

        const attachmentsHtml = (() => {
          if (!attachments.length) return '';
          const images = attachments.filter(a => a.mime && a.mime.startsWith('image/'));
          const others = attachments.filter(a => !a.mime || !a.mime.startsWith('image/'));

          const imgHtml = images.map(img => {
            const src = img.dataUrl || (img.storageKey ? `/api/feedback/attachment?key=${encodeURIComponent(img.storageKey)}` : '');
            if (!src) return '';
            return `<div style="display:inline-block;margin:4px 6px 4px 0;"><img src="${src}" alt="${esc(img.name)}" class="feedback-screenshot-thumb" style="max-width:180px;max-height:140px;border-radius:6px;border:1px solid var(--line);cursor:zoom-in;" title="${esc(img.name)} (${formatFileSize(img.size)})"></div>`;
          }).join('');

          const otherHtml = others.map(f => {
            const href = f.dataUrl || (f.storageKey ? `/api/feedback/attachment?key=${encodeURIComponent(f.storageKey)}` : '');
            return `
              <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-sub,#f1f5f9);border:1px solid var(--line,#cbd5e1);border-radius:6px;font-size:12px;margin:2px 4px 2px 0;">
                <span>${fileTypeIcon(f.mime)}</span>
                <span style="font-weight:500;">${esc(f.name)}</span>
                <small style="opacity:0.7;">(${formatFileSize(f.size)})</small>
                ${href ? `<a href="${href}" target="_blank" download="${esc(f.name)}" style="color:var(--accent,#0284c7);text-decoration:none;font-weight:600;margin-left:4px;" title="Download file">⬇</a>` : ''}
              </div>
            `;
          }).join('');

          return `
            <div class="feedback-card-attachments" style="margin-top:8px;">
              <small style="display:block;font-weight:600;color:var(--ink-sub);margin-bottom:4px;">Attachments (${attachments.length}):</small>
              ${imgHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">${imgHtml}</div>` : ''}
              ${otherHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${otherHtml}</div>` : ''}
            </div>
          `;
        })();

        return `
          <article class="bug-item card">
            <div class="bug-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 14px;">
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                  <span class="chip" style="font-size:12px;font-weight:600;">${fb.category === 'bug' ? '🐞 Bug' : fb.category === 'idea' ? '💡 Idea' : '❓ Question'}</span>
                  <b style="font-size:13px;">${esc(fb.userLogin ? '@' + fb.userLogin : (fb.userEmail || 'Guest'))}</b>
                  ${limitTag}
                  <small style="color:var(--ink-sub);">${esc(bugWhen(fb.createdAt * 1000))}</small>
                  ${fb.resolved && fb.resolvedAt ? `<span class="chip" style="font-size:11px;color:var(--ok, #10b981);">✓ Resolved ${esc(bugWhen(fb.resolvedAt * 1000))}</span>` : ''}
                </div>
                <p style="margin:0 0 8px 0;font-size:14px;white-space:pre-wrap;">${esc(fb.message)}</p>
                ${(() => {
                  if (!fb.url) return '';
                  const isSafe = /^https?:\/\//i.test(fb.url);
                  return `<small style="display:block;color:var(--ink-sub);margin-bottom:8px;">Page: ${isSafe ? `<a href="${esc(fb.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">${esc(fb.url)}</a>` : `<span>${esc(fb.url)}</span>`}</small>`;
                })()}
                ${(fb.deviceInfo?.breadcrumbs && fb.deviceInfo.breadcrumbs.length) ? `
                  <details style="margin-top:8px;font-size:12px;color:var(--ink-sub);">
                    <summary style="cursor:pointer;user-select:none;font-weight:500;">User actions (${fb.deviceInfo.breadcrumbs.length})</summary>
                    <ul style="margin:4px 0 0 16px;padding:0;line-height:1.5;">
                      ${fb.deviceInfo.breadcrumbs.map(c => `<li><span style="opacity:0.7;">${esc(c.ago || '')}</span>: <b>${esc(c.action || '')}</b> ${esc(c.details || '')}</li>`).join('')}
                    </ul>
                  </details>
                ` : ''}
                ${attachmentsHtml}
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
        `;
      }).join('');

      const canLoadMore = items.length < feedbackTotal && feedbackFilterCategory === 'all' && !feedbackSearchQuery;
      const loadMoreHtml = canLoadMore ? `
        <div style="text-align:center;padding:16px 0;" id="feedbackLoadMoreBox">
          <button type="button" class="btn small" id="feedbackLoadMoreBtn">Load more (${items.length} of ${feedbackTotal})</button>
        </div>
      ` : '';

      container.innerHTML = cardsHtml + loadMoreHtml;

      container.querySelectorAll('.feedback-screenshot-thumb').forEach(img => {
        img.addEventListener('click', () => {
          const src = img.getAttribute('src');
          if (src) {
            const win = window.open('', '_blank');
            if (win) {
              try { win.opener = null; } catch (_) {}
              win.document.write('<!DOCTYPE html><title>Screenshot</title><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img style="max-width:100%;max-height:100vh;object-fit:contain;" src="' + src + '"></body>');
              win.document.close();
            }
          }
        });
      });

      container.querySelectorAll('[data-fb-set-limit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const userKey = btn.dataset.fbSetLimit;
          const current = btn.dataset.currentLimit || '';
          const input = prompt(`Set custom feedback limit per hour for ${userKey} (number, or empty for role default):`, current);
          if (input === null) return;
          const trimmed = input.trim();
          const limit = trimmed === '' ? null : Number(trimmed);
          if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) {
            notice('Please enter a valid positive number.', true);
            return;
          }
          accountFetch('/api/feedback/limit', {
            method: 'POST',
            body: JSON.stringify({ userId: userKey, limit })
          }).then(() => {
            notice(`Feedback limit updated for ${userKey}: ${limit !== null ? limit + '/hr' : 'role default'}`);
            paintBugs();
          }).catch(err => {
            notice(err.message, true);
          });
        });
      });

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
      paintBugKpis();
      const draw = (rows) => {
        paintBugKpis();
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
          feedbackUserLimits = (data && data.userLimits) || {};
          if (typeof data?.breadcrumbsLimit === 'number') {
            feedbackBreadcrumbsLimit = data.breadcrumbsLimit;
            window.__breadcrumbsLimit = data.breadcrumbsLimit;
          }

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
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <div style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink-sub);">
                    <label for="feedbackBreadcrumbsLimitInput" title="Maximum recorded User actions history items">User actions:</label>
                    <input type="number" id="feedbackBreadcrumbsLimitInput" min="0" max="50" style="width:50px;height:28px;padding:0 6px;border-radius:4px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;font-size:12px;" value="${feedbackBreadcrumbsLimit}">
                    <button type="button" class="btn tiny ghost" id="feedbackSaveBreadcrumbsBtn" title="Save global User actions history limit">Save</button>
                  </div>
                  <button type="button" class="btn tiny ghost" id="feedbackExportCsv" title="Export filtered feedback to CSV">📥 CSV</button>
                  <input type="search" id="feedbackSearchInput" placeholder="Search message, user, url..." value="${esc(feedbackSearchQuery)}" style="width:180px;height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink);box-sizing:border-box;font:inherit;font-size:13px;">
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

          box.querySelector('#feedbackSaveBreadcrumbsBtn')?.addEventListener('click', () => {
            const input = box.querySelector('#feedbackBreadcrumbsLimitInput');
            const val = Number(input?.value);
            if (!Number.isSafeInteger(val) || val < 0 || val > 100) {
              notice('User actions limit must be between 0 and 100.', true);
              return;
            }
            accountFetch('/api/feedback/settings', {
              method: 'POST',
              body: JSON.stringify({ breadcrumbsLimit: val })
            }).then(res => {
              feedbackBreadcrumbsLimit = res.breadcrumbsLimit;
              window.__breadcrumbsLimit = res.breadcrumbsLimit;
              notice('Saved User actions limit: ' + res.breadcrumbsLimit);
            }).catch(err => {
              notice(err.message, true);
            });
          });

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

    function paintBugKpis() {
      const activeBtn = document.getElementById("bugKpiActive");
      if (!activeBtn) return;
      const countEl = document.getElementById("bugKpiActiveCount");
      const hitsEl = document.getElementById("bugKpiActiveHits");
      const highestEl = document.getElementById("bugKpiActiveHighest");

      const active = (bugCache || []).filter((b) => !b.resolved);
      const activeCount = active.length;
      const totalHits = active.reduce((sum, b) => sum + (Number(b.hits) || 1), 0);

      if (countEl) countEl.textContent = String(activeCount);
      if (hitsEl) hitsEl.textContent = "signature" + (activeCount === 1 ? "" : "s") + " (" + totalHits + " hit" + (totalHits === 1 ? "" : "s") + ")";
      if (highestEl) {
        if (active.length) {
          const sorted = active.slice().sort((a, b) => (Number(b.hits) || 1) - (Number(a.hits) || 1));
          const top = sorted[0];
          const topPath = ((top.method || "") + " " + (top.path || top.request?.url || "")).trim();
          highestEl.textContent = "Highest: " + (topPath || "Unknown route") + " (" + (top.hits || 1) + " hits)";
        } else {
          highestEl.textContent = "No active worker errors";
        }
      }

      const uptimeEl = document.getElementById("bugKpiSystemUptime");
      const queueEl = document.getElementById("bugKpiSystemQueue");
      if (uptimeEl) uptimeEl.textContent = navigator.onLine ? "100%" : "Offline";
      if (queueEl) {
        const queueSize = typeof backgroundQueueSize === "function" ? backgroundQueueSize() : 0;
        const memoryStr = window.performance?.memory?.usedJSHeapSize ? " · RAM: " + (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1) + " MB" : "";
        queueEl.textContent = "Prefetch Queue: " + queueSize + " pending" + (navigator.onLine ? " · Online" : " · Offline") + memoryStr;
      }

      if (isDeveloper() || isTeacher()) {
        accountFetch("/api/admin/changes").then((data) => {
          const changes = (data && data.changes) || [];
          const auditCountEl = document.getElementById("bugKpiAuditCount");
          const auditLatestEl = document.getElementById("bugKpiAuditLatest");
          if (auditCountEl) auditCountEl.textContent = String(changes.length);
          if (auditLatestEl) {
            const latest = changes[0];
            if (latest) {
              const actor = latest.from_login || latest.from_name || "user";
              auditLatestEl.textContent = "Latest: " + (latest.type || latest.status || "change") + " for @" + actor;
            } else {
              auditLatestEl.textContent = "No recorded mutation events";
            }
          }
        }).catch(() => {});
      }
    }

    function onBugKpiActiveClick() {
      bugTab = "open";
      document.querySelectorAll("[data-bug-tab]").forEach((btn) => btn.classList.toggle("on", btn.dataset.bugTab === "open"));
      if (bugCache) paintBugs(bugCache);
      else paintBugs();
      document.getElementById("bugList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function onBugKpiSystemClick() {
      const dialog = document.createElement("dialog");
      dialog.className = "bug-kpi-dialog";
      const queueSize = typeof backgroundQueueSize === "function" ? backgroundQueueSize() : 0;
      const online = navigator.onLine;
      const memoryStr = window.performance?.memory?.usedJSHeapSize ? (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1) + " MB" : "N/A";

      dialog.innerHTML = '<form method="dialog"><button class="bug-kpi-dialog-close" aria-label="Close">✕</button></form>' +
        '<h2>System Health &amp; Cache Diagnostics</h2>' +
        '<div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px;">' +
          '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;">' +
            '<span style="color:var(--saas-text-muted);">Network Status:</span>' +
            '<b style="color:' + (online ? '#16a34a' : '#dc2626') + ';">' + (online ? '● Online (Edge Connected)' : '○ Offline') + '</b>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;">' +
            '<span style="color:var(--saas-text-muted);">Cache Subsystem:</span>' +
            '<b>IndexedDB / LocalStorage Active</b>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;">' +
            '<span style="color:var(--saas-text-muted);">Background Queue:</span>' +
            '<b>' + queueSize + ' pending requests</b>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;">' +
            '<span style="color:var(--saas-text-muted);">Heap Memory:</span>' +
            '<b>' + memoryStr + '</b>' +
          '</div>' +
          '<div id="bugSystemPingBox" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;">' +
            '<span style="color:var(--saas-text-muted);">API Latency:</span>' +
            '<button type="button" class="btn tiny" id="bugSystemPingBtn">Run Ping Test</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">' +
          '<button type="button" class="btn ghost saas-btn" id="bugSystemOpenStats">Open Statistics</button>' +
          '<form method="dialog"><button class="btn primary saas-btn">Done</button></form>' +
        '</div>';

      document.body.appendChild(dialog);
      dialog.addEventListener("close", () => dialog.remove());
      dialog.querySelector("#bugSystemOpenStats")?.addEventListener("click", () => {
        dialog.close();
        visit("stats");
      });
      dialog.querySelector("#bugSystemPingBtn")?.addEventListener("click", () => {
        const pingBtn = dialog.querySelector("#bugSystemPingBtn");
        if (!pingBtn) return;
        pingBtn.disabled = true;
        pingBtn.textContent = "Pinging…";
        const t0 = performance.now();
        accountFetch("/api/me/state").then(() => {
          const ms = Math.round(performance.now() - t0);
          pingBtn.replaceWith(document.createTextNode(ms + " ms (HTTP 200)"));
        }).catch((err) => {
          pingBtn.disabled = false;
          pingBtn.textContent = "Failed (" + err.message + ")";
        });
      });
      dialog.showModal();
    }

    function onBugKpiAuditClick() {
      const dialog = document.createElement("dialog");
      dialog.className = "bug-kpi-dialog";
      dialog.innerHTML = '<form method="dialog"><button class="bug-kpi-dialog-close" aria-label="Close">✕</button></form>' +
        '<h2>Accounts Mutations Audit Log</h2>' +
        '<p class="sub" style="margin-bottom:14px;">Recent account mutations and role change requests from <code>/api/admin/changes</code>.</p>' +
        '<div id="bugAuditDialogList" style="max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:8px;font-size:13px;">' +
          '<p class="sub">Loading audit log…</p>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">' +
          '<button type="button" class="btn ghost saas-btn" id="bugAuditOpenAdmin">Open Accounts</button>' +
          '<form method="dialog"><button class="btn primary saas-btn">Close</button></form>' +
        '</div>';

      document.body.appendChild(dialog);
      dialog.addEventListener("close", () => dialog.remove());
      dialog.querySelector("#bugAuditOpenAdmin")?.addEventListener("click", () => {
        dialog.close();
        visit("admin");
      });
      accountFetch("/api/admin/changes").then((data) => {
        const box = dialog.querySelector("#bugAuditDialogList");
        if (!box) return;
        const changes = (data && data.changes) || [];
        if (!changes.length) {
          box.innerHTML = '<p class="sub">No account mutation events found.</p>';
          return;
        }
        box.innerHTML = changes.slice(0, 30).map((row, idx) => {
          const user = row.from_login || row.from_email || "User";
          const whenStr = row.created_at ? bugWhen(row.created_at * 1000) : "Date not recorded";
          const st = row.status || "recorded";
          const badgeCls = st === "approved" ? "badge-emerald" : st === "rejected" ? "badge-rose" : "badge-amber";
          return '<div style="padding:10px 12px;background:var(--saas-card-muted,#f8fafc);border-radius:8px;border:1px solid var(--saas-border,#e2e8f0);display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
            '<div>' +
              '<b>' + (idx + 1) + '. @' + esc(user) + '</b> <span style="color:var(--saas-text-muted);font-size:12px;">(' + esc(row.type || 'account mutation') + ')</span>' +
              '<div style="font-size:11.5px;color:var(--saas-text-muted);margin-top:3px;">' + esc(whenStr) + '</div>' +
            '</div>' +
            '<span class="badge ' + badgeCls + '" style="font-size:11px;font-weight:700;text-transform:uppercase;">' + esc(st) + '</span>' +
          '</div>';
        }).join("");
      }).catch((err) => {
        const box = dialog.querySelector("#bugAuditDialogList");
        if (box) box.innerHTML = '<p class="sub" style="color:#dc2626;">Failed to load audit records: ' + esc(err.message) + '</p>';
      });
      dialog.showModal();
    }

    document.addEventListener("click", (event) => {
      if (event.target.closest("#bugKpiActive")) { onBugKpiActiveClick(); return; }
      if (event.target.closest("#bugKpiSystem")) { onBugKpiSystemClick(); return; }
      if (event.target.closest("#bugKpiAudit")) { onBugKpiAuditClick(); return; }
    });

    window.paintBugs = paintBugs;
    window.paintBugKpis = paintBugKpis;
