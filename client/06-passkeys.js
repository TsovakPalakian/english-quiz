    window.LumisciaPasskeys=(()=>{
      const supported=()=>!!(window.isSecureContext&&window.PublicKeyCredential&&navigator.credentials&&window.SimpleWebAuthnBrowser);
      const api=async(path,body)=>{
        const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Passkey request failed.');return result;
      };
      const message=error=>['NotAllowedError','AbortError'].includes(error.name)?'Passkey request cancelled.':error.message||'Passkey unavailable on this device.';
      async function login(){
        const {options}=await api('/api/auth/passkeys/options',{});
        const response=await window.SimpleWebAuthnBrowser.startAuthentication({optionsJSON:options});
        let invite='';try{invite=sessionStorage.getItem('enquiz-invite')||'';}catch{}
        const result=await api('/api/auth/passkeys/verify',{response,invite});
        if(!result.inviteWarning)try{sessionStorage.removeItem('enquiz-invite');}catch{}
        return result;
      }
      async function mount(host){
        if(!host)return;
        host.classList.add('security-passkeys');
        let expanded=false;
        host.innerHTML=
          '<button class="settings-action accordion-btn" type="button" data-passkey-toggle style="width:100%; justify-content:space-between;"><span style="display:flex; align-items:center; gap:10px;"><i data-lucide="fingerprint" aria-hidden="true"></i>Set passkeys</span><span class="accordion-arrow">▸</span></button>'+
          '<div data-passkey-content hidden style="margin-top:10px;">'+
          '<div data-passkey-list></div>'+
          '<label style="display:grid; gap:4px; font-size:13px; font-weight:500;">Passkey name<input type="text" data-passkey-label maxlength="80" placeholder="Set device name" required style="height:38px; padding:6px 12px; border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--ink); font-size:14px;"></label>'+
          '<button class="settings-action" type="button" data-passkey-code style="margin-top:8px;">Send confirmation code</button>'+
          '<label hidden data-passkey-code-step style="display:grid; gap:4px; font-size:13px; font-weight:500; margin-top:8px;">Email code<input type="text" data-passkey-code-value inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="height:38px; padding:6px 12px; border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--ink); font-size:14px;"></label>'+
          '<button class="settings-action" type="button" data-passkey-add hidden disabled style="margin-top:8px;"><i data-lucide="fingerprint" aria-hidden="true"></i>Add passkey</button>'+
          '<p class="hint" role="status" data-passkey-status style="margin:8px 0 0 0;"></p>'+
          '</div>';

        const toggleBtn=host.querySelector('[data-passkey-toggle]');
        const arrow=toggleBtn.querySelector('.accordion-arrow');
        const content=host.querySelector('[data-passkey-content]');
        const status=host.querySelector('[data-passkey-status]');
        const labelInput=host.querySelector('[data-passkey-label]');
        const codeStep=host.querySelector('[data-passkey-code-step]');
        const codeInput=host.querySelector('[data-passkey-code-value]');
        const addBtn=host.querySelector('[data-passkey-add]');
        const codeBtn=host.querySelector('[data-passkey-code]');

        toggleBtn.onclick=()=>{
          expanded=!expanded;
          content.hidden=!expanded;
          arrow.textContent=expanded?'▾':'▸';
        };

        const draw=()=>window.lucide?.createIcons({root:host});
        const run=async(button,action)=>{
          button.disabled=true;status.textContent='';
          try{await action();}catch(error){status.textContent=message(error);}finally{if(button.isConnected)button.disabled=false;}
        };
        async function load(){
          const {passkeys}=await api('/api/me/passkeys');
          if(!host.isConnected)return;
          const list=host.querySelector('[data-passkey-list]');list.replaceChildren();
          for(const key of passkeys){
            const row=document.createElement('div');row.className='security-passkey-row';
            const name=document.createElement('span');name.textContent=key.label;
            const date=document.createElement('small');date.className='hint';date.textContent=key.lastUsedAt?'Last used '+new Date(key.lastUsedAt).toLocaleDateString():'Not used yet';
            const remove=document.createElement('button');remove.type='button';remove.className='settings-action danger';remove.title='Remove passkey';remove.setAttribute('aria-label','Remove '+key.label);remove.innerHTML='<i data-lucide="trash-2" aria-hidden="true"></i>';
            remove.onclick=()=>run(remove,async()=>{
              requireCode();
              await api('/api/me/passkeys/delete',{id:key.id,emailCode:codeInput.value});
              codeInput.value='';
              validateCode();
              await load();
              status.textContent='Passkey removed.';
            });
            const details=document.createElement('div');details.append(name,date);row.append(details,remove);list.append(row);
          }
          if(!passkeys.length)list.textContent='No passkeys added.';draw();
        }
        function validateCode(){
          const valid=/^\d{6}$/.test(codeInput.value.trim());
          addBtn.disabled=!valid||!supported();
        }
        codeInput.oninput=()=>validateCode();
        function requireCode(){if(!/^\d{6}$/.test(codeInput.value.trim())){codeInput.focus();throw Error('Send a confirmation code to your account email and enter it here.');}}
        codeBtn.onclick=event=>run(event.currentTarget,async()=>{
          if(!labelInput.value.trim()){labelInput.focus();throw Error('Set device name first.');}
          await api('/api/me/passkeys/code',{});
          codeStep.hidden=false;
          addBtn.hidden=false;
          validateCode();
          codeInput.focus();
          status.textContent='Confirmation code sent to your account email.';
        });
        addBtn.onclick=event=>run(event.currentTarget,async()=>{
          if(!labelInput.value.trim()){labelInput.focus();throw Error('Set device name first.');}
          requireCode();
          const {options}=await api('/api/me/passkeys/options',{emailCode:codeInput.value.trim()});
          codeInput.value='';
          validateCode();
          const response=await window.SimpleWebAuthnBrowser.startRegistration({optionsJSON:options});
          await api('/api/me/passkeys/verify',{response,label:labelInput.value.trim()});
          await load();
          status.textContent='Passkey added.';
        });
        if(!supported())status.textContent='This browser does not support adding passkeys.';
        try{await load();}catch(error){status.textContent=message(error);}draw();
      }
      return {supported,login,mount,message};
    })();
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-passkey-login]');if(!button||button.disabled)return;
      const status=(button.closest('.account-gate')||button.parentElement).querySelector('[data-passkey-status]');button.disabled=true;status.textContent='';
      try{
        if(inviteDetails?.kind==='teacher')throw Error('Accept this teacher invite using email code or Google.');
        const result=await window.LumisciaPasskeys.login();
        if(result.inviteWarning)console.warn(result.inviteWarning);
        await enterAccount(result.user);
      }catch(error){status.textContent=window.LumisciaPasskeys.message(error);}finally{button.disabled=false;}
    });
