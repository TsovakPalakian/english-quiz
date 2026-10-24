    document.addEventListener('input',event=>{
      if(!event.target.matches('#otpLoginForm [name="email"],#registerForm [name="email"]'))return;
      const form=event.target.closest('form');
      if(!form.querySelector('[data-otp-step]'))return;
      form.querySelectorAll('[data-otp-step]').forEach(field=>{field.hidden=true;if('disabled' in field)field.disabled=true;});
      form.querySelector('[name="code"],[name="emailCode"]').value='';
      form.querySelector('[data-form-status]').textContent='';
    });
    let inviteDetails=null,inviteDetailsError='',teacherInviteOffered=false;
    function offerTeacherInvite(){
      if(teacherInviteOffered||inviteDetails?.kind!=='teacher'||!accountChecked||!authUser)return;
      teacherInviteOffered=true;
      let token='';try{token=sessionStorage.getItem('enquiz-invite')||'';}catch{}
      if(!token)return;
      const dialog=document.createElement('dialog');dialog.className='invite-accept-dialog';
      dialog.innerHTML='<form class="invite-form"><h2>Accept teacher invitation</h2><label>Email<input name="email" type="email" required autocomplete="email"></label><button type="button" class="btn" data-send>Send code</button><label hidden data-code>Email code<input name="code" inputmode="numeric" autocomplete="one-time-code"></label><p role="status" class="hint"></p><button type="submit" class="btn primary" hidden data-accept>Accept invite</button><button type="button" class="btn" data-google>Continue with Google</button><button type="button" class="btn" data-close>Cancel</button></form>';
      document.body.append(dialog);dialog.showModal();
      const form=dialog.querySelector('form'),status=form.querySelector('[role="status"]');form.elements.email.value=authUser.email||'';
      form.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
      form.querySelector('[data-google]').onclick=()=>{location.href='/api/auth/google?invite='+encodeURIComponent(token);};
      form.elements.email.oninput=()=>{form.querySelector('[data-code]').hidden=true;form.querySelector('[data-accept]').hidden=true;form.elements.code.value='';};
      form.querySelector('[data-send]').onclick=async()=>{
        if(!form.elements.email.reportValidity())return;
        const email=form.elements.email.value,button=form.querySelector('[data-send]');button.disabled=true;
        try{await accountFetch('/api/auth/otp/request',{method:'POST',body:JSON.stringify({email})});if(email!==form.elements.email.value)return;
          form.querySelector('[data-code]').hidden=false;form.querySelector('[data-accept]').hidden=false;form.elements.code.required=true;form.elements.code.focus();status.textContent='Code sent.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      };
      form.onsubmit=async event=>{
        event.preventDefault();const button=form.querySelector('[data-accept]');button.disabled=true;
        try{const result=await accountFetch('/api/auth/otp/verify',{method:'POST',body:JSON.stringify({email:form.elements.email.value,code:form.elements.code.value,invite:token})});
          if(result.inviteWarning)throw new Error(result.inviteWarning);
          sessionStorage.removeItem('enquiz-invite');dialog.close();await enterAccount(result.user);
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
      };
    }
    function captureInviteFromLocation() {
      try {
        const params = new URLSearchParams(location.search);
        const token = params.get('invite');
        if (token) {
          sessionStorage.setItem('enquiz-invite', token);
          params.delete('invite');
          const query = params.toString();
          history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
        }
        const saved=token||sessionStorage.getItem('enquiz-invite');
        if(saved&&!params.has('auth')&&(token||!sessionStorage.getItem('enquiz-auth-form')))sessionStorage.setItem('enquiz-auth-form','register');
        if(saved)accountFetch('/api/accounts/invites?token='+encodeURIComponent(saved)).then(details=>{inviteDetails=details;}).catch(error=>{inviteDetailsError=error.message;}).finally(()=>{
          if(document.querySelector('[data-invite-loading]'))paintAccountForm(true);
          offerTeacherInvite();
        });
      } catch (e) {}
    }
    async function redeemPendingInvite() {
      let token = '';
      try { token = sessionStorage.getItem('enquiz-invite') || ''; } catch (e) {}
      if (!token || !authUser || authUser.role !== 'USER') return;
      try {
        await accountFetch('/api/accounts/invites', { method: 'POST', body: JSON.stringify({ action: 'redeem', token }) });
        try { sessionStorage.removeItem('enquiz-invite'); } catch (e) {}
      } catch (error) {
        console.warn(error.message || 'Invite could not be used.');
      }
    }
    captureInviteFromLocation();
    (function captureAuthFlashFromLocation() {
      try {
        const params = new URLSearchParams(location.search);
        const auth = params.get("auth");
        if (!auth) return;
        params.delete("auth");
        const query = params.toString();
        history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
        const messages = {
          pending: "Account saved. Waiting for teacher approval before you can sign in.",
          google_denied: "Google sign-in was cancelled.",
          google_error: "Google sign-in failed. Try again.",
          invite_warning: "Signed in, but the group invite could not be applied.",
          microsoft_denied: "Microsoft sign-in was cancelled.",
          microsoft_error: "Microsoft sign-in failed. Try again.",
          telegram_denied: "Telegram sign-in was cancelled.",
          telegram_error: "Telegram sign-in failed. Try again."
        };
        if (messages[auth]) sessionStorage.setItem("enquiz-auth-flash", messages[auth]);
        if(auth==='pending'){sessionStorage.removeItem('enquiz-invite');sessionStorage.setItem('enquiz-auth-form','login');}
        if(auth==='microsoft_verify')sessionStorage.setItem('enquiz-microsoft-verify','1');
        if(auth.startsWith('microsoft')||auth==='pending')sessionStorage.setItem('enquiz-place',JSON.stringify({id:'account'}));
        if(['microsoft','microsoft_denied','microsoft_error'].includes(auth))sessionStorage.removeItem('enquiz-microsoft-verify');
        if(auth==='telegram_verify'){
          sessionStorage.removeItem('enquiz-microsoft-verify');
          sessionStorage.setItem('enquiz-telegram-verify','1');
        }
        if(auth==='microsoft_verify')sessionStorage.removeItem('enquiz-telegram-verify');
        if(auth.startsWith('telegram'))sessionStorage.setItem('enquiz-place',JSON.stringify({id:'account'}));
        if(['telegram','telegram_denied','telegram_error'].includes(auth))sessionStorage.removeItem('enquiz-telegram-verify');
      } catch (e) {}
    })();
    function enterAccount(user) {
      signedOutHello = false;
      accountChecked = true;
      authUser = user;
      localStorage.removeItem('enquiz-idle-expired');
      localStorage.setItem('enquiz-last-activity:' + user.id, String(Date.now()));
      idleActor = user.id; idleRenewed = Date.now(); idleExpiring = false;
      ownAccountData = null;
      viewCache.clear();
      accountReady = false;
      paintDeveloperChrome();
      localStorage.setItem("enquiz-auth-on", "1");
      paintAccount();
      const on = document.querySelector("section.on");
      if (on && (on.id === "account" || on.id === "profile")) show("home");
      else if (on && on.id === "home") show("home");
      examPreload();
      return loadAccountThemes().then((pack) => applyAccountThemes(pack)).then(() => accountFetch("/api/me/state?summary=1")).then((state) => {
        fillEmptyFromAccount(state);
        accountReady = true;
        paintGuestAccess();
        paintThemeSegs();
        startAccountPull();
        lmPullFromServer();
        if (syncQueue.length) scheduleStateSave();
      }).catch(() => {
        accountReady = !!(loadAdded().length || loadSongs().length);
        if (syncQueue.length) scheduleStateSave();
      }).then(() => redeemPendingInvite());
    }
    function clearMediaStore(names) {
      const want = names && names.length ? names : ["files", "added", "songs"];
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const have = want.filter((name) => db.objectStoreNames.contains(name));
        if (!have.length) { resolve(); return; }
        const tx = db.transaction(have, "readwrite");
        have.forEach((name) => tx.objectStore(name).clear());
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Could not clear local files."));
      }));
    }
    function clearOwnBrowserData(opts) {
      viewKeys().forEach((key) => localStorage.removeItem(key));
      [CARD_QUIZ_KEY, STARTED_KEY, LM_KEY, "enquiz-anon-backup", "enquiz-auth-on", "enquiz-dev-stash", "enquiz-view-id", "enquiz-view-login", "enquiz-view-role", "enquiz-view-email", "enquiz-view-name"].forEach((key) => localStorage.removeItem(key));
      try {
        const prefs = JSON.parse(localStorage.getItem("learning-main-prefs") || "{}");
        if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
          delete prefs.customThemes;
          localStorage.setItem("learning-main-prefs", JSON.stringify(prefs));
        }
      } catch (e) {}
      try { sessionStorage.removeItem("enquiz-place"); } catch (e) {}
      Object.keys(songBlobUrls).forEach(forgetBlobUrl);
      try { revokePreviewUrl(); } catch (e) {}
      try { revokeEditPreviewUrl(); } catch (e) {}
      try {
        Object.keys(lmFiles).forEach((id) => {
          try { URL.revokeObjectURL(lmFiles[id]); } catch (err) {}
          delete lmFiles[id];
        });
      } catch (e) {}
      addedCache = null;
      lyricSize = 20;
      lmLibrary = null;
      lmState = null;
      groupReset();
      viewGen += 1;
      // Wipe IndexedDB audio blobs on logout so the next account on this browser
      // cannot resolve a colliding song id to the previous user's file.
      const mediaNames = (opts && opts.wipeFiles === false) ? ["added", "songs"] : ["files", "added", "songs"];
      return Promise.all([clearMediaStore(mediaNames), idbDeleteStash()]);
    }
    function leaveAccount(options) {
      signedOutHello = !!(options && options.signedOut);
      accountChecked = true;
      examResetAccount();
      viewAccount = null;
      viewSwitching = false;
      stashOwned = false;
      authUser = null;
      ownAccountData = null;
      viewCache.clear();
      accountReady = false;
      paintDeveloperChrome();
      syncQueue.length = 0;
      clearTimeout(syncTimer);
      stopAccountPull();
      paintViewBar();
      paintHomeAccount();
      return clearOwnBrowserData().then(() => {
        paintAdded();
        paintLyrics();
        refreshCatalog();
        if (window.paintDemonstratives) window.paintDemonstratives();
        document.documentElement.removeAttribute("data-painted-theme");
        applyTheme(DEFAULT_THEME, { sync: false, persist: false });
        settleThemeAudience();
        paintHomeAccount();
        if(!options?.authEntry)paintAccount();
        show('home');
        document.body.removeAttribute('data-shell-pending');
      });
    }
    function performLogout() {
      return drainUserState().then(() => {
        const theme = currentTheme();
        if (authUser && themeCanShow(theme)) {
          return accountFetch("/api/me/state", { method: "PUT", body: JSON.stringify({ op: "put-setting", key: "theme", value: theme }) }).catch(() => {});
        }
      }).then(() => accountFetch("/api/logout", { method: "POST", body: "{}" })).then(() => leaveAccount({ signedOut: true }))
        .catch((err) => alert(err && err.message ? err.message : "Could not sign out safely. Try again."));
    }
    document.body.addEventListener("change", (e) => {
      const id = e.target && e.target.id;
      if (id === "highVisibility") {
        const enabled = !!e.target.checked;
        document.documentElement.toggleAttribute("data-high-visibility", enabled);
        if (enabled) document.documentElement.setAttribute("data-high-visibility", "1");
        localStorage.setItem("enquiz-high-visibility", enabled ? "1" : "0");
        return;
      }
      if (id === "statsFrom" || id === "statsTo") {
        document.querySelectorAll("[data-stats-range]").forEach((btn) => btn.classList.remove("primary"));
      }
      if (id === "statsFrom" || id === "statsTo" || id === "statsRole" || id === "statsUser" || id === "statsCompare") paintStats();
    });
    document.body.addEventListener("submit", (e) => {
      const form = e.target;
      if (form.id === "ownPasswordForm") {
        e.preventDefault();
        const status = form.querySelector("[data-form-status]");
        const data = Object.fromEntries(new FormData(form).entries());
        if (status) { status.textContent = ""; status.classList.remove("bad"); }
        if (data.password !== data.repeat) {
          if (status) { status.textContent = "The new passwords do not match."; status.classList.add("bad"); }
          return;
        }
        accountFetch("/api/me/password", { method: "POST", body: JSON.stringify({ current: data.current, password: data.password }) }).then(() => {
          form.reset();
          if (status) status.textContent = "Password saved.";
        }).catch((err) => {
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        });
        return;
      }
      if (form.id === "ownAccountForm") {
        e.preventDefault();
        const status = form.querySelector("[data-form-status]");
        const data = Object.fromEntries(new FormData(form).entries());
        if (status) { status.textContent = ""; status.classList.remove("bad"); }
        accountFetch("/api/me/account", { method: "POST", body: JSON.stringify(data) }).then(() => loadOwnAccount()).catch((err) => {
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        });
        return;
      }
      if (form.id !== "loginForm" && form.id !== "registerForm" && form.id !== "otpLoginForm") return;
      e.preventDefault();
      if(form.id==='otpLoginForm'&&form.querySelector('[name="code"]').disabled){form.querySelector('[data-otp-send]').click();return;}
      if(form.id==='registerForm'&&form.querySelector('[name="emailCode"]')?.disabled){form.querySelector('[data-invite-email-send]').click();return;}
      const status = form.querySelector("[data-form-status]");
      const data = Object.fromEntries(new FormData(form).entries());
      if (status) { status.textContent = ""; status.classList.remove("bad"); }
      if(form.id==='registerForm'){
        data.name=String(data.name||'').trim();
        if(!data.name){if(status){status.textContent='Enter your name.';status.classList.add('bad');}form.elements.name.focus();return;}
        delete data.role;
      }
      if (form.id === "otpLoginForm") {
        let invite = "";
        try { invite = sessionStorage.getItem("enquiz-invite") || ""; } catch (err) {}
        if (invite) data.invite = invite;
        accountFetch("/api/auth/otp/verify", { method: "POST", body: JSON.stringify(data) }).then((result) => {
          if (result.inviteWarning) throw new Error(result.inviteWarning);
          try { sessionStorage.removeItem("enquiz-invite"); } catch (err) {}
          return enterAccount(result.user);
        }).catch((err) => {
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        });
        return;
      }
      const path = form.id === "loginForm" ? "/api/login" : "/api/register";
      let hasInvite=false;try{hasInvite=!!sessionStorage.getItem('enquiz-invite');}catch{}
      if(path==='/api/login'&&hasInvite&&inviteDetails?.kind==='teacher'){
        if(status)status.textContent='Accept this teacher invite using email code or Google.';
        return;
      }
      if (path === "/api/register") {
        let invite = "";
        try { invite = sessionStorage.getItem("enquiz-invite") || ""; } catch (err) {}
        if (invite) data.invite = invite;
      }
      accountFetch(path, { method: "POST", body: JSON.stringify(data) }).then((result) => {
        if (result.status === "pending") {
          if(path==='/api/register'&&hasInvite){
            try { sessionStorage.removeItem('enquiz-invite'); } catch {}
          }
          paintAccountForm(false);
          const loginStatus = document.querySelector("#loginForm [data-form-status]");
          if (loginStatus) loginStatus.textContent = hasInvite?'Waiting for approval by the inviting teacher or a developer. Your group invitation has been accepted.':"Waiting for approval. You can sign in after the teacher accepts this account.";
          return;
        }
        if (result.inviteWarning) console.warn(result.inviteWarning);
        if (path === "/api/register" && result.user) {
          try { sessionStorage.removeItem("enquiz-invite"); } catch (err) {}
        }
        return enterAccount(result.user);
      }).catch((err) => {
        if (status) { status.textContent = err.message; status.classList.add("bad"); }
      });
    });
    document.body.addEventListener("click", (e) => {
      const googleAuth = e.target.closest("[data-google-auth]");
      const passwordToggle=e.target.closest('[data-auth-password]');
      if(passwordToggle){
        const field=document.getElementById(passwordToggle.getAttribute('aria-controls')),reveal=field.type==='password';
        field.type=reveal?'text':'password';passwordToggle.setAttribute('aria-pressed',String(reveal));
        passwordToggle.title=reveal?'Hide password':'Show password';passwordToggle.setAttribute('aria-label',passwordToggle.title);
        passwordToggle.textContent=reveal?'Hide':'Show';return;
      }
      if (googleAuth) {
        let invite = "";
        try { invite = sessionStorage.getItem("enquiz-invite") || ""; } catch (err) {}
        location.href = "/api/auth/google" + (invite ? "?invite=" + encodeURIComponent(invite) : "");
        return;
      }
      const loginMode = e.target.closest("[data-login-mode]");
      if (loginMode && !loginMode.closest("form")) {
        const mode = loginMode.dataset.loginMode;
        const gate = loginMode.closest(".account-gate");
        if (gate) {
          gate.querySelectorAll("[data-login-mode].chip").forEach((btn) => btn.classList.toggle("on", btn.dataset.loginMode === mode));
          const passwordForm = gate.querySelector("#loginForm");
          const otpForm = gate.querySelector("#otpLoginForm");
          if (passwordForm) passwordForm.hidden = mode !== "password";
          if (otpForm) otpForm.hidden = mode !== "otp";
        }
        return;
      }
      const otpSend = e.target.closest("[data-otp-send],[data-invite-email-send]");
      if (otpSend) {
        const form = otpSend.closest("#otpLoginForm,#registerForm");
        const status = form && form.querySelector("[data-form-status]");
        const emailField=form?.querySelector('[name="email"]');
        if(!emailField?.reportValidity())return;
        const email = emailField.value;
        form.querySelectorAll('[data-otp-step]').forEach(field=>{field.hidden=true;if('disabled' in field)field.disabled=true;});
        const code=form.querySelector('[name="code"],[name="emailCode"]');code.value='';
        if (status) { status.textContent = ""; status.classList.remove("bad"); }
        otpSend.disabled = true;
        accountFetch("/api/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }).then((result) => {
          if(!form.isConnected||emailField.value!==email)return;
          if (status) status.textContent = "Code sent to " + (result.email || email) + ". Check your inbox.";
          form.querySelectorAll('[data-otp-step]').forEach(field=>{field.hidden=false;if('disabled' in field)field.disabled=false;});
          code.focus();
        }).catch((err) => {
          if(!form.isConnected||emailField.value!==email)return;
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        }).finally(() => { otpSend.disabled = false; });
        return;
      }
      const displayOpen = e.target.closest("[data-display-open]");
      if (displayOpen) {
        const dialog = document.getElementById("displayDialog");
        if (dialog) { dialog.hidden = false; paintDisplaySettings(); }
        return;
      }
      if (e.target.closest("[data-display-close]")) {
        const dialog = document.getElementById("displayDialog");
        if (dialog) dialog.hidden = true;
        return;
      }
      const displaySizeButton = e.target.closest("button[data-display-size]");
      if (displaySizeButton) { setDisplaySize(displaySizeButton.dataset.displaySize); return; }
      const range = e.target.closest("[data-stats-range]");
      if (range) {
        document.querySelectorAll("[data-stats-range]").forEach((btn) => btn.classList.toggle("primary", btn === range));
        statsShift(Number(range.dataset.statsRange));
        paintStats();
        return;
      }
      const statsModeButton = e.target.closest("[data-stats-mode]");
      if (statsModeButton) {
        statsMode = statsModeButton.dataset.statsMode;
        const box = document.getElementById("statsBody");
        if (box && box._stats) box.innerHTML = renderStats(box._stats, document.getElementById("statsCompare").checked);
        return;
      }
      if (e.target.closest("[data-stats-export]")) { exportStats(); return; }
      const button = e.target.closest("[data-account]");
      if (!button) return;
      const action = button.dataset.account;
      if (action === "show-register" || action === "show-login") {
        if (button.closest("#homeAuth")) show("account");
        paintAccountForm(action === "show-register");
        return;
      }
      if (action === "logout") {
        performLogout();
        return;
      }
      if (action === "revoke") {
        if (!confirm("This deletes your words, songs and progress. You will be signed out and cannot sign in to this account again. Registering with the same email starts a new empty account.")) return;
        drainUserState().then(() => accountFetch("/api/me/revoke", { method: "POST", body: "{}" }).then(() => {
          return clearOwnBrowserData({ wipeFiles: true }).then(() => leaveAccount({ signedOut: true }));
        })).catch((err) => alert(err && err.message ? err.message : "Some changes could not be saved. Try again."));
        return;
      }
      if (action === "edit-details") { openOwnAccountForm(); return; }
      if (action === "edit-password") { openOwnPasswordForm(); return; }
      if (action === "cancel-change") {
        accountFetch("/api/me/account/cancel", { method: "POST", body: "{}" }).then(() => loadOwnAccount()).catch((err) => alert(err.message));
        return;
      }
      if (action === "approve-change" || action === "reject-change") {
        if (!isTeacher() || viewAccount) return;
        const verb = action === "approve-change" ? "approve" : "reject";
        const row = button.closest('.account-approval-row') || button, controls = [...row.querySelectorAll('button,select'), button];
        if (row.dataset.busy) return;
        row.dataset.busy = '1';
        controls.forEach((node) => { node.disabled = true; });
        button.textContent = verb === 'approve' ? 'Approving…' : 'Rejecting…';
        accountFetch("/api/admin/changes/" + encodeURIComponent(button.dataset.id) + "/" + verb, { method: "POST", body: "{}" })
          .then(() => paintAdmin())
          .catch((err) => { paintAdmin(); alert(err.message); });
        return;
      }
      if (action === "approve" || action === "reject") {
        if (!isTeacher() || viewAccount) return;
        const picker = document.querySelector('[data-registration-group="' + button.dataset.id + '"]');
        const rolePicker=document.querySelector('[data-registration-role="'+button.dataset.id+'"]');
        const row = button.closest('.account-approval-row') || button, controls = [...row.querySelectorAll('button,select'), button];
        if (row.dataset.busy) return;
        row.dataset.busy = '1';
        controls.forEach((node) => { node.disabled = true; });
        button.textContent = action === 'approve' ? 'Approving…' : 'Rejecting…';
        accountFetch("/api/admin/registrations/" + encodeURIComponent(button.dataset.id) + "/" + action, { method: "POST", body: JSON.stringify(action === 'approve' ? {...(picker?.value&&rolePicker?.value!=='ADMIN'?{groupId:Number(picker.value)}:{}),...(rolePicker?{role:rolePicker.value}:{})} : {}) })
          .then((result) => {
            if (result?.groupWarning) window.LearningMain?.notice(result.groupWarning, true);
            paintAdmin();
          })
          .catch((err) => { paintAdmin(); alert(err.message); });
        return;
      }
      if (action === 'assign-group') {
        if (!isTeacher() || viewAccount) return;
        const picker = button.closest('.card').querySelector('[data-student-group]');
        if (!picker || picker.value === picker.dataset.originalGroup || picker.disabled) return;
        const selected = picker.value;button.disabled = true;picker.disabled = true;
        accountFetch('/api/groups/members',{method:'POST',body:JSON.stringify({accountId:button.dataset.id,groupId:picker.value ? Number(picker.value) : null})}).then(async () => {
          picker.dataset.originalGroup = selected;
          adminMembers = (await accountFetch('/api/groups/members')).members || [];
          if (adminTab === 'groups') paintAdminGroups(); else paintAdminAccounts();
        }).catch(error => alert(error.message)).finally(() => { picker.disabled = false;button.disabled = picker.value === picker.dataset.originalGroup; });return;
      }
      if (action === "save-profile") {
        if (!sessionIsDeveloper() || viewAccount) return;
        const card = button.closest(".card");
        const login = card && card.querySelector("[data-profile-login]");
        const email = card && card.querySelector("[data-profile-email]");
        const name = card && card.querySelector("[data-profile-name]");
        if (!login || !email || !name) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/profile", {
          method: "POST",
          body: JSON.stringify({ login: login.value.trim(), email: email.value.trim(), name: name.value.trim() })
        }).then((data) => {
          if (viewAccount && viewAccount.id === button.dataset.id && data.user) {
            viewAccount.login = data.user.login;
            localStorage.setItem("enquiz-view-login", data.user.login);
            paintViewBar();
          }
          paintAdmin();
        }).catch((err) => alert(err.message));
        return;
      }
      if (action === "open-pages") {
        if (!isTeacher() || viewAccount) return;
        openStudentPages({ id: button.dataset.id, login: button.dataset.login || "", role: button.dataset.role || "", email: button.dataset.email || "", name: button.dataset.name || "" });
        return;
      }
      if (action === "exit-view") {
        exitStudentPages();
        return;
      }
      if (action === "hide-user") {
        if (!sessionIsDeveloper() || viewAccount) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/hidden", {
          method: "POST",
          body: JSON.stringify({ hidden: button.dataset.hidden !== "1" })
        }).then(() => paintAdmin()).catch((err) => alert(err.message));
        return;
      }
      if (action === "active-user") {
        if (!sessionIsDeveloper() || viewAccount) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/active", {
          method: "POST",
          body: JSON.stringify({ active: button.dataset.active !== "1" })
        }).then(() => paintAdmin()).catch((err) => alert(err.message));
        return;
      }
      if (action === "set-role") {
        if (!sessionIsDeveloper() || viewAccount) return;
        const pick = button.parentElement && button.parentElement.parentElement && button.parentElement.parentElement.querySelector("[data-role-pick]");
        if (!pick) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/role", { method: "POST", body: JSON.stringify({ role: pick.value }) })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "delete-user") {
        if (!sessionIsDeveloper() || viewAccount) return;
        if (!confirm("Delete this account permanently? The login, cards and songs stored for it will be removed.")) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id), { method: "DELETE" })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "user") {
        if (!isTeacher() || viewAccount) return;
        adminAccountId = button.dataset.id; visit('adminuser');
      }
    });
