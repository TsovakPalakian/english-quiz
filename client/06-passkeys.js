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
        host.innerHTML='<h3>Passkeys</h3><div data-passkey-list></div><label>Passkey name<input type="text" data-passkey-label maxlength="80" value="My device"></label><button class="settings-action" type="button" data-passkey-code>Send confirmation code</button><label hidden data-passkey-code-step>Email code<input type="text" data-passkey-code-value inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><button class="settings-action" type="button" data-passkey-add'+(supported()?'':' disabled')+'><i data-lucide="fingerprint" aria-hidden="true"></i>Add passkey</button><p class="hint" role="status" data-passkey-status></p>';
        const status=host.querySelector('[data-passkey-status]'),code=host.querySelector('[data-passkey-code-value]');
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
            remove.onclick=()=>run(remove,async()=>{requireCode();await api('/api/me/passkeys/delete',{id:key.id,emailCode:code.value});code.value='';await load();status.textContent='Passkey removed.';});
            const details=document.createElement('div');details.append(name,date);row.append(details,remove);list.append(row);
          }
          if(!passkeys.length)list.textContent='No passkeys added.';draw();
        }
        function requireCode(){if(!/^\d{6}$/.test(code.value)){code.focus();throw Error('Send a confirmation code to your account email and enter it here.');}}
        host.querySelector('[data-passkey-code]').onclick=event=>run(event.currentTarget,async()=>{await api('/api/me/passkeys/code',{});host.querySelector('[data-passkey-code-step]').hidden=false;code.focus();status.textContent='Confirmation code sent to your account email.';});
        host.querySelector('[data-passkey-add]').onclick=event=>run(event.currentTarget,async()=>{
          requireCode();const {options}=await api('/api/me/passkeys/options',{emailCode:code.value});code.value='';
          const response=await window.SimpleWebAuthnBrowser.startRegistration({optionsJSON:options});
          await api('/api/me/passkeys/verify',{response,label:host.querySelector('[data-passkey-label]').value});await load();status.textContent='Passkey added.';
        });
        if(!supported())status.textContent='This browser does not support adding passkeys.';
        try{await load();}catch(error){status.textContent=message(error);}draw();
      }
      return {supported,login,mount,message};
    })();
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-passkey-login]');if(!button)return;
      const status=button.parentElement.querySelector('[data-passkey-status]');button.disabled=true;status.textContent='';
      try{
        if(inviteDetails?.kind==='teacher')throw Error('Accept this teacher invite using email code or Google.');
        const result=await window.LumisciaPasskeys.login();
        if(result.inviteWarning)console.warn(result.inviteWarning);
        await enterAccount(result.user);
      }catch(error){status.textContent=window.LumisciaPasskeys.message(error);}finally{button.disabled=false;}
    });
