(function initCookieConsent() {
  function getCookie(name) {
    try {
      const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function readSavedChoice() {
    try {
      const fromStorage = localStorage.getItem('cookie_consent');
      if (fromStorage && ['all', 'essential', 'declined'].includes(fromStorage)) return fromStorage;
    } catch {}
    const fromCookie = getCookie('cookie_consent');
    if (fromCookie && ['all', 'essential', 'declined'].includes(fromCookie)) return fromCookie;
    try {
      if (sessionStorage.getItem('cookie_dismissed') === 'true') return 'dismissed';
    } catch {}
    return null;
  }

  function handleCookieChoice(choice, banner) {
    try {
      if (choice === 'dismissed') {
        sessionStorage.setItem('cookie_dismissed', 'true');
      } else {
        localStorage.setItem('cookie_consent', choice);
        const secureFlag = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = 'cookie_consent=' + encodeURIComponent(choice) + '; Path=/; SameSite=Lax; Max-Age=31536000' + secureFlag;
        if (choice === 'declined' || choice === 'essential') {
          window.__lumisciaTelemetryDisabled = true;
        } else {
          window.__lumisciaTelemetryDisabled = false;
        }
        try {
          fetch('/api/cookie-consent', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({consent: choice})
          }).catch(() => {});
        } catch {}
      }
    } catch {}

    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translate(-50%, 16px)';
      setTimeout(() => {
        try { banner.remove(); } catch {}
      }, 250);
    }
  }

  function mountBanner() {
    if (document.getElementById('cookieConsentBanner')) return;
    if (readSavedChoice()) return;

    const banner = document.createElement('div');
    banner.id = 'cookieConsentBanner';
    banner.className = 'stellar-cookie-banner-refined';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.innerHTML = [
      '<div class="stellar-banner-sparkle" aria-hidden="true">✦</div>',
      '<div class="stellar-banner-text-compact">Cookies illuminate your study journey. Choose your mode.</div>',
      '<div class="stellar-actions-transparent">',
      '  <button type="button" id="cookieDeclineBtn" class="stellar-btn-decline-transp">Decline</button>',
      '  <button type="button" id="cookiePartialBtn" class="stellar-btn-essential-transp">Essential</button>',
      '  <button type="button" id="cookieAcceptBtn" class="stellar-btn-accept-framed">Accept all</button>',
      '  <button type="button" id="cookieDismissBtn" class="stellar-btn-close-transp" aria-label="Close">✕</button>',
      '</div>'
    ].join('\n');

    const declineBtn = banner.querySelector('#cookieDeclineBtn');
    const partialBtn = banner.querySelector('#cookiePartialBtn');
    const acceptBtn = banner.querySelector('#cookieAcceptBtn');
    const dismissBtn = banner.querySelector('#cookieDismissBtn');

    if (declineBtn) declineBtn.addEventListener('click', () => handleCookieChoice('declined', banner));
    if (partialBtn) partialBtn.addEventListener('click', () => handleCookieChoice('essential', banner));
    if (acceptBtn) acceptBtn.addEventListener('click', () => handleCookieChoice('all', banner));
    if (dismissBtn) dismissBtn.addEventListener('click', () => handleCookieChoice('dismissed', banner));

    document.body.appendChild(banner);
  }

  function scheduleMount() {
    if (readSavedChoice()) return;
    setTimeout(() => {
      try { mountBanner(); } catch {}
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMount);
  } else {
    scheduleMount();
  }
})();
