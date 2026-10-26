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

  let currentScreenshot = '';
  let currentCategory = 'bug';
  let modalEl = null;

  function ensureModal() {
    if (modalEl && document.body.contains(modalEl)) return modalEl;
    modalEl = document.createElement('dialog');
    modalEl.id = 'feedbackModal';
    modalEl.className = 'feedback-dialog';
    modalEl.innerHTML = `
      <div class="feedback-header">
        <h2>Обратная связь и ошибки</h2>
        <button type="button" class="feedback-close" data-feedback-close aria-label="Закрыть">✕</button>
      </div>
      <div class="feedback-types">
        <button type="button" class="feedback-type-btn active" data-type="bug">🐞 Ошибка</button>
        <button type="button" class="feedback-type-btn" data-type="idea">💡 Идея / вопрос</button>
      </div>
      <textarea class="feedback-textarea" id="feedbackMessage" placeholder="Опишите, что пошло не так или чего не хватает..." required></textarea>
      
      <div class="feedback-preview-box" id="feedbackPreviewBox" hidden>
        <img id="feedbackPreviewImg" src="" alt="Скриншот">
        <button type="button" class="feedback-preview-remove" id="feedbackRemoveScreenshot" title="Удалить скриншот">✕</button>
      </div>

      <div class="feedback-dropzone" id="feedbackDropzone">
        <p>📸 Прикрепить скриншот</p>
        <small>Нажмите <b>Ctrl+V</b> (Cmd+V) для быстрой вставки, перетащите файл или нажмите сюда</small>
        <input type="file" id="feedbackFileInput" accept="image/*" style="display:none">
      </div>

      <input type="text" class="feedback-input" id="feedbackContact" placeholder="Ваш Email или @telegram для связи (необязательно)">

      <div class="feedback-footer">
        <button type="button" class="feedback-btn" data-feedback-close>Отмена</button>
        <button type="button" class="feedback-btn feedback-btn-primary" id="feedbackSubmitBtn">Отправить</button>
      </div>
      <div class="feedback-status" id="feedbackStatus" role="status" aria-live="polite"></div>
    `;

    document.body.appendChild(modalEl);

    // Event listeners inside modal
    modalEl.querySelectorAll('[data-feedback-close]').forEach(btn => {
      btn.addEventListener('click', closeFeedbackModal);
    });

    modalEl.querySelectorAll('.feedback-type-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        modalEl.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.dataset.type || 'bug';
      });
    });

    const dropzone = modalEl.querySelector('#feedbackDropzone');
    const fileInput = modalEl.querySelector('#feedbackFileInput');
    const removeBtn = modalEl.querySelector('#feedbackRemoveScreenshot');

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function() {
      if (this.files && this.files[0]) processImageFile(this.files[0]);
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
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        processImageFile(e.dataTransfer.files[0]);
      }
    });

    removeBtn.addEventListener('click', clearScreenshot);

    const submitBtn = modalEl.querySelector('#feedbackSubmitBtn');
    submitBtn.addEventListener('click', submitFeedback);

    return modalEl;
  }

  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      compressImage(e.target.result, 1400, 0.82, function(compressedDataUrl) {
        currentScreenshot = compressedDataUrl;
        renderScreenshotPreview(compressedDataUrl);
      });
    };
    reader.readAsDataURL(file);
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

  function renderScreenshotPreview(dataUrl) {
    const previewBox = modalEl.querySelector('#feedbackPreviewBox');
    const previewImg = modalEl.querySelector('#feedbackPreviewImg');
    const dropzone = modalEl.querySelector('#feedbackDropzone');
    if (!previewBox || !previewImg || !dropzone) return;

    previewImg.src = dataUrl;
    previewBox.hidden = false;
    dropzone.hidden = true;
  }

  function clearScreenshot() {
    currentScreenshot = '';
    const previewBox = modalEl.querySelector('#feedbackPreviewBox');
    const previewImg = modalEl.querySelector('#feedbackPreviewImg');
    const dropzone = modalEl.querySelector('#feedbackDropzone');
    const fileInput = modalEl.querySelector('#feedbackFileInput');
    if (previewImg) previewImg.src = '';
    if (previewBox) previewBox.hidden = true;
    if (dropzone) dropzone.hidden = false;
    if (fileInput) fileInput.value = '';
  }

  // Handle global paste
  window.addEventListener('paste', function(e) {
    if (!modalEl || !modalEl.open) return;
    const items = (e.clipboardData || window.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) processImageFile(file);
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
    if (textarea) textarea.value = '';
    clearScreenshot();

    // Prefill contact if user is authenticated
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

    if (submitBtn) submitBtn.disabled = false;

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.setAttribute('open', '');
    }
    textarea.focus();
  }

  function closeFeedbackModal() {
    if (!modalEl) return;
    if (typeof modalEl.close === 'function') {
      modalEl.close();
    } else {
      modalEl.removeAttribute('open');
    }
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
        status.textContent = 'Пожалуйста, опишите проблему или предложение.';
        status.className = 'feedback-status error';
      }
      if (textarea) textarea.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (status) {
      status.textContent = 'Отправка...';
      status.className = 'feedback-status';
    }

    const payload = {
      category: currentCategory,
      message: message,
      screenshot: currentScreenshot || '',
      contact: (contact ? contact.value : '').trim(),
      context: {
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1
        },
        userAgent: navigator.userAgent,
        recentErrors: window.__recentErrors || []
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
        throw new Error(errJson.error || 'Ошибка при отправке (' + res.status + ')');
      }
      if (status) {
        status.textContent = '✓ Спасибо! Ваше сообщение успешно отправлено.';
        status.className = 'feedback-status success';
      }
      setTimeout(() => {
        closeFeedbackModal();
      }, 1400);
    } catch (err) {
      if (status) {
        status.textContent = err.message || 'Не удалось отправить сообщение. Попробуйте позже.';
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
    btn.setAttribute('aria-label', 'Сообщить о проблеме или идея');
    btn.innerHTML = '<span aria-hidden="true">💬</span><span>Отзыв</span>';
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingBtn);
  } else {
    initFloatingBtn();
  }
})();
