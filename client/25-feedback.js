// Client-side user feedback & bug reporting with screenshot paste and compression
(function() {
  window.__recentErrors = window.__recentErrors || [];
  window.addEventListener('error', function(e) {
    try {
      const msg = String(e.message || e.error || 'Unknown script error');
      const src = e.filename ? e.filename.split('/').pop() + ':' + e.lineno : '';
      window.__recentErrors.push({message: msg, source: src, time: Date.now()});
      if (window.__recentErrors.length > 5) window.__recentErrors.shift();
    } catch (_) {}
  });

  window.__userBreadcrumbs = window.__userBreadcrumbs || [];
  window.__breadcrumbsLimit = window.__breadcrumbsLimit || 10;
  function recordBreadcrumb(action, details) {
    try {
      window.__userBreadcrumbs.push({
        time: Date.now(),
        action: String(action || '').slice(0, 40),
        details: String(details || '').slice(0, 100)
      });
      const limit = Number.isSafeInteger(window.__breadcrumbsLimit) && window.__breadcrumbsLimit >= 0
        ? window.__breadcrumbsLimit
        : 10;
      while (window.__userBreadcrumbs.length > limit) window.__userBreadcrumbs.shift();
    } catch (_) {}
  }

  // Record user clicks on interactive elements
  document.addEventListener('click', function(e) {
    try {
      const target = e.target;
      if (!target) return;
      const el = target.closest('button, a, [role="button"], input[type="submit"], select, summary, .step, .tab');
      if (!el) return;
      if (modalEl && modalEl.contains(el)) return; // Skip clicks inside feedback modal
      const tag = el.tagName.toLowerCase();
      let label = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.id || el.className || '').trim();
      if (el.type === 'password') label = '***';
      label = label.replace(/\s+/g, ' ').slice(0, 50);
      recordBreadcrumb('click', `${tag}${el.id ? '#' + el.id : ''}${label ? ': ' + label : ''}`);
    } catch (_) {}
  }, true);

  window.addEventListener('hashchange', function() {
    recordBreadcrumb('nav', window.location.hash || '#');
  });

  try {
    const origPush = history.pushState;
    if (origPush) {
      history.pushState = function() {
        if (arguments[2]) recordBreadcrumb('route', String(arguments[2]).slice(0, 50));
        return origPush.apply(this, arguments);
      };
    }
  } catch (_) {}

  let currentAttachments = [];
  let currentCategory = 'bug';
  let modalEl = null;
  const MAX_FEEDBACK_BYTES = 25 * 1024 * 1024; // 25 MiB

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

  function sortAttachments(list) {
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

  function totalAttachmentsSize() {
    return currentAttachments.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  }

  function saveDraft() {
    try {
      const textarea = modalEl?.querySelector('#feedbackMessage');
      const contact = modalEl?.querySelector('#feedbackContact');
      const draft = {
        category: currentCategory,
        message: textarea ? textarea.value : '',
        contact: contact ? contact.value : '',
        attachments: currentAttachments.map(a => ({
          id: a.id,
          name: a.name,
          mime: a.mime,
          size: a.size,
          dataUrl: a.dataUrl && a.dataUrl.length < 2000000 ? a.dataUrl : ''
        }))
      };
      localStorage.setItem('feedback_draft_v1', JSON.stringify(draft));
    } catch (_) {}
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem('feedback_draft_v1');
      if (!raw) return false;
      const draft = JSON.parse(raw);
      const textarea = modalEl?.querySelector('#feedbackMessage');
      const contact = modalEl?.querySelector('#feedbackContact');
      if (draft.category) {
        currentCategory = draft.category;
        modalEl?.querySelectorAll('.feedback-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === currentCategory);
        });
      }
      if (textarea && typeof draft.message === 'string') {
        textarea.value = draft.message;
        adjustFeedbackTextarea(textarea);
      }
      if (contact && typeof draft.contact === 'string' && draft.contact) {
        contact.value = draft.contact;
      }
      if (Array.isArray(draft.attachments) && draft.attachments.length) {
        currentAttachments = sortAttachments(draft.attachments);
        renderAttachmentsList();
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem('feedback_draft_v1');
    } catch (_) {}
    currentAttachments = [];
    if (modalEl) {
      const textarea = modalEl.querySelector('#feedbackMessage');
      if (textarea) textarea.value = '';
      renderAttachmentsList();
    }
  }

  function renderAttachmentsList() {
    const listEl = modalEl?.querySelector('#feedbackFilesList');
    const previewBox = modalEl?.querySelector('#feedbackPreviewBox');
    const previewImg = modalEl?.querySelector('#feedbackPreviewImg');
    const firstImage = currentAttachments.find(a => a.mime && a.mime.startsWith('image/'));
    if (previewBox && previewImg) {
      if (firstImage && firstImage.dataUrl) {
        previewImg.src = firstImage.dataUrl;
        previewBox.hidden = false;
        previewBox.style.display = 'block';
      } else {
        previewImg.src = '';
        previewBox.hidden = true;
        previewBox.style.display = 'none';
      }
    }
    if (!listEl) return;
    if (!currentAttachments.length) {
      listEl.innerHTML = '';
      listEl.hidden = true;
      return;
    }
    listEl.hidden = false;
    const totalBytes = totalAttachmentsSize();
    const sorted = sortAttachments(currentAttachments);
    currentAttachments = sorted;

    const itemsHtml = sorted.map(a => `
      <div class="feedback-file-chip" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-sub,#f1f5f9);border:1px solid var(--line,#cbd5e1);border-radius:6px;font-size:12px;margin:2px 4px 2px 0;">
        <span>${fileTypeIcon(a.mime)}</span>
        <span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.name}">${a.name}</span>
        <span style="opacity:0.6;font-size:11px;">(${formatFileSize(a.size)})</span>
        <button type="button" class="feedback-file-remove" data-remove-id="${a.id}" style="border:none;background:transparent;cursor:pointer;color:var(--ink,#334155);font-size:12px;padding:0 2px;" title="Remove this file">✕</button>
      </div>
    `).join('');

    listEl.innerHTML = `
      <div style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink-sub,#64748b);">
        <span>Attached files (${sorted.length}) · Total: ${formatFileSize(totalBytes)} / 25 MB</span>
        <button type="button" id="feedbackClearAllFiles" style="border:none;background:transparent;cursor:pointer;color:var(--accent,#0284c7);font-size:11px;">Clear all</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${itemsHtml}</div>
    `;

    listEl.querySelectorAll('[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.removeId;
        currentAttachments = currentAttachments.filter(a => a.id !== id);
        renderAttachmentsList();
        saveDraft();
      });
    });

    listEl.querySelector('#feedbackClearAllFiles')?.addEventListener('click', e => {
      e.stopPropagation();
      currentAttachments = [];
      renderAttachmentsList();
      saveDraft();
    });
  }

  function adjustFeedbackTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    const minH = 80;
    const maxH = minH * 3; // 240px (3x base height)
    const nextH = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = nextH + 'px';
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }

  function ensureModal() {
    if (modalEl && document.body.contains(modalEl)) return modalEl;
    modalEl = document.createElement('dialog');
    modalEl.id = 'feedbackModal';
    modalEl.className = 'feedback-dialog';
    modalEl.innerHTML = `
      <div class="feedback-header">
        <h2>Feedback & Bug Report</h2>
        <button type="button" class="feedback-close" data-feedback-close aria-label="Close">✕</button>
      </div>
      <div class="feedback-types">
        <button type="button" class="feedback-type-btn active" data-type="bug">🐞 Bug</button>
        <button type="button" class="feedback-type-btn" data-type="idea">💡 Idea / Question</button>
      </div>
      <textarea class="feedback-textarea" id="feedbackMessage" placeholder="Describe what went wrong or what is missing..." required></textarea>
      
      <div class="feedback-attachments-box" id="feedbackAttachmentsBox" style="margin:8px 0;">
        <div class="feedback-preview-box" id="feedbackPreviewBox" hidden style="margin-bottom:8px;position:relative;display:none;">
          <img id="feedbackPreviewImg" alt="Screenshot preview" style="max-height:160px;border-radius:6px;display:block;">
          <button type="button" class="feedback-preview-remove" id="feedbackPreviewRemove" title="Remove screenshot" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;">✕</button>
        </div>
        <div class="feedback-files-list" id="feedbackFilesList" hidden></div>
        <div class="feedback-dropzone" id="feedbackDropzone">
          <p>📎 Attach files</p>
          <small>Press <b>Ctrl+V</b> (Cmd+V) to paste, drag & drop files, or click here (any file type, up to 25 MB total)</small>
          <input type="file" id="feedbackFileInput" multiple style="display:none">
        </div>
      </div>

      <input type="text" class="feedback-input" id="feedbackContact" placeholder="Your Email or @telegram for follow-up (optional)">

      <div class="feedback-footer">
        <button type="button" class="feedback-btn feedback-btn-cancel" data-feedback-close>Cancel</button>
        <button type="button" class="feedback-btn feedback-btn-primary" id="feedbackSubmitBtn">Send</button>
      </div>
      <div class="feedback-status" id="feedbackStatus" role="status" aria-live="polite"></div>
    `;

    document.body.appendChild(modalEl);

    // Event listeners inside modal
    modalEl.querySelectorAll('[data-feedback-close]').forEach(btn => {
      btn.addEventListener('click', closeFeedbackModal);
    });

    const textarea = modalEl.querySelector('#feedbackMessage');
    const contactInput = modalEl.querySelector('#feedbackContact');
    if (textarea) {
      textarea.addEventListener('input', () => {
        adjustFeedbackTextarea(textarea);
        saveDraft();
      });
    }
    if (contactInput) {
      contactInput.addEventListener('input', saveDraft);
    }

    modalEl.querySelectorAll('.feedback-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        modalEl.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.dataset.type || 'bug';
        saveDraft();
      });
    });

    const dropzone = modalEl.querySelector('#feedbackDropzone');
    const fileInput = modalEl.querySelector('#feedbackFileInput');

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() {
      if (this.files && this.files.length) {
        for (let i = 0; i < this.files.length; i++) {
          processFile(this.files[i]);
        }
      }
      this.value = '';
    });

    modalEl.querySelector('#feedbackPreviewRemove')?.addEventListener('click', e => {
      e.stopPropagation();
      const firstImageIdx = currentAttachments.findIndex(a => a.mime && a.mime.startsWith('image/'));
      if (firstImageIdx >= 0) {
        currentAttachments.splice(firstImageIdx, 1);
        renderAttachmentsList();
        saveDraft();
      }
    });

    dropzone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function() {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          processFile(e.dataTransfer.files[i]);
        }
      }
    });

    const submitBtn = modalEl.querySelector('#feedbackSubmitBtn');
    submitBtn.addEventListener('click', submitFeedback);

    return modalEl;
  }

  function processFile(file) {
    if (!file) return;
    const currentTotal = totalAttachmentsSize();
    if (currentTotal + file.size > MAX_FEEDBACK_BYTES) {
      const status = modalEl?.querySelector('#feedbackStatus');
      if (status) {
        status.textContent = 'Total attachments exceed 25 MiB limit (' + formatFileSize(currentTotal + file.size) + ').';
        status.className = 'feedback-status error';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const dataUrl = e.target.result;
      if (file.type && file.type.startsWith('image/') && file.size > 500000) {
        compressImage(dataUrl, 1600, 0.85, function(compressedUrl) {
          addAttachmentRecord({
            id: 'file_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            name: file.name || 'image.png',
            mime: file.type || 'image/png',
            size: Math.round(compressedUrl.length * 0.75),
            dataUrl: compressedUrl
          });
        });
      } else {
        addAttachmentRecord({
          id: 'file_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name: file.name || 'file',
          mime: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: dataUrl
        });
      }
    };
    reader.readAsDataURL(file);
  }

  function addAttachmentRecord(item) {
    currentAttachments.push(item);
    currentAttachments = sortAttachments(currentAttachments);
    renderAttachmentsList();
    saveDraft();
  }

  function compressImage(src, maxDim, quality, callback) {
    const img = new Image();
    img.onload = function() {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      
      let out = '';
      try {
        out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) throw 0;
      } catch (_) {
        out = canvas.toDataURL('image/jpeg', quality);
      }
      callback(out);
    };
    img.src = src;
  }

  // Handle global paste
  window.addEventListener('paste', function(e) {
    if (!modalEl || !modalEl.open) return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) {
        e.preventDefault();
        processFile(file);
        break;
      }
    }
  });

  function openFeedbackModal() {
    const modal = ensureModal();
    const status = modal.querySelector('#feedbackStatus');
    const textarea = modal.querySelector('#feedbackMessage');
    const contact = modal.querySelector('#feedbackContact');
    const submitBtn = modal.querySelector('#feedbackSubmitBtn');

    if (status) { status.textContent = ''; status.className = 'feedback-status'; }

    // Restore draft if present
    const hasDraft = restoreDraft();
    if (!hasDraft) {
      currentAttachments = [];
      renderAttachmentsList();
      if (textarea) {
        textarea.value = '';
        adjustFeedbackTextarea(textarea);
      }
      if (contact) {
        const user = window.authUser;
        if (user && user.email) {
          contact.value = user.email;
        } else if (user && user.login) {
          contact.value = '@' + user.login;
        } else {
          contact.value = '';
        }
      }
    }

    if (submitBtn) submitBtn.disabled = false;

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
    textarea?.focus();
  }

  function closeFeedbackModal() {
    if (!modalEl) return;
    saveDraft();
    if (typeof modalEl.close === 'function') {
      modalEl.close();
    } else {
      modalEl.removeAttribute('open');
    }
  }

  function playSuccessChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;

      // Note 1: D5 (587.33 Hz) soft sine
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.04, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2: A5 (880.00 Hz) celestial harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.08);
      gain2.gain.setValueAtTime(0.05, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);

      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 600);
    } catch (_) {}
  }

  function triggerHaptic() {
    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate([25, 35, 25]);
      }
    } catch (_) {}
  }

  async function submitFeedback() {
    if (!modalEl) return;
    const textarea = modalEl.querySelector('#feedbackMessage');
    const contact = modalEl.querySelector('#feedbackContact');
    const status = modalEl.querySelector('#feedbackStatus');
    const submitBtn = modalEl.querySelector('#feedbackSubmitBtn');

    const message = (textarea ? textarea.value : '').trim();
    if (!message) {
      if (status) {
        status.textContent = 'Please describe the issue or suggestion.';
        status.className = 'feedback-status error';
      }
      if (textarea) textarea.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (status) {
      status.textContent = 'Sending...';
      status.className = 'feedback-status';
    }

    const now = Date.now();
    const breadcrumbs = (window.__userBreadcrumbs || []).map(b => ({
      ago: Math.max(0, Math.round((now - b.time) / 1000)) + 's ago',
      action: b.action,
      details: b.details
    }));

    const sorted = sortAttachments(currentAttachments);
    const firstImage = sorted.find(a => a.mime && a.mime.startsWith('image/'));

    const payload = {
      category: currentCategory,
      message: message,
      screenshot: firstImage?.dataUrl || '',
      attachments: sorted.map(a => ({
        id: a.id,
        name: a.name,
        mime: a.mime,
        size: a.size,
        dataUrl: a.dataUrl || ''
      })),
      contact: (contact ? contact.value : '').trim(),
      context: {
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1
        },
        userAgent: navigator.userAgent,
        recentErrors: window.__recentErrors || [],
        breadcrumbs: breadcrumbs
      }
    };

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to send (' + res.status + ')');
      }
      if (status) {
        status.textContent = '✓ Thank you! Your feedback has been sent.';
        status.className = 'feedback-status success';
      }
      clearDraft();
      playSuccessChime();
      triggerHaptic();
      setTimeout(() => {
        closeFeedbackModal();
      }, 1400);
    } catch (err) {
      if (status) {
        status.textContent = err.message || 'Failed to send. Please try again later.';
        status.className = 'feedback-status error';
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  window.openFeedbackModal = openFeedbackModal;
  window.closeFeedbackModal = closeFeedbackModal;

  // Delegate clicks on any [data-feedback-open]
  document.addEventListener('click', function(e) {
    if (e.target && e.target.closest('[data-feedback-open]')) {
      e.preventDefault();
      openFeedbackModal();
    }
  });

  // Inject floating feedback trigger button if not present
  function initFloatingBtn() {
    if (document.getElementById('feedbackFloatingTrigger')) return;
    const btn = document.createElement('button');
    btn.id = 'feedbackFloatingTrigger';
    btn.type = 'button';
    btn.className = 'feedback-floating-btn';
    btn.setAttribute('data-feedback-open', '');
    btn.setAttribute('aria-label', 'Report an issue or share feedback');
    btn.innerHTML = '<span aria-hidden="true">💬</span><span>Feedback</span>';
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingBtn);
  } else {
    initFloatingBtn();
  }
})();
