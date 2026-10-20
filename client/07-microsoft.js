    let federatedProviders;
    function createFederatedSignIn(provider,label){
      const pendingKey='enquiz-'+provider+'-verify';
      const api=async(path,body)=>{
        const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const value=await response.json();if(!response.ok)throw Error(value.error||label+' sign-in unavailable.');return value;
      };
      const pending=()=>{try{return sessionStorage.getItem(pendingKey)==='1';}catch{return false;}};
      const clear=()=>{try{sessionStorage.removeItem(pendingKey);}catch{}};
      async function decorate(root){
        if(!federatedProviders)federatedProviders=api('/api/auth/providers').catch(()=>{federatedProviders=null;return {};});
        const enabled=(await federatedProviders)[provider]===true;
        root.querySelectorAll('[data-'+provider+'-auth]').forEach(button=>{button.hidden=!enabled;});
      }
      function paint(box){
        box.innerHTML='<div class="account-gate"><div class="card"><h1 class="auth-title">Microsoft sign-in</h1><form class="auth-code-confirm" data-microsoft-confirm><label for="microsoftEmail">Email</label><input id="microsoftEmail" name="email" type="email" autocomplete="email" maxlength="120" required><button type="button" class="btn auth-code-send" data-microsoft-send>Send code</button><label for="microsoftCode" data-ms-code hidden>Email code</label><input id="microsoftCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required disabled data-ms-code hidden><p class="hint" role="status"></p><button type="submit" class="btn primary" data-ms-code hidden disabled>Confirm and continue</button></form><button class="btn" type="button" data-microsoft-cancel>Back to Log in</button></div></div>'.replaceAll('microsoft',provider).replaceAll('Microsoft',label);
        const form=box.querySelector('form'),email=form.elements.email,code=form.elements.code,status=form.querySelector('[role=status]'),send=form.querySelector('[data-'+provider+'-send]');
        const step=visible=>form.querySelectorAll('[data-ms-code]').forEach(node=>{node.hidden=!visible;if('disabled' in node)node.disabled=!visible;});
        api('/api/auth/'+provider+'/profile').then(value=>{if(form.isConnected)email.value=value.email||'';}).catch(error=>{status.textContent=error.message;});
        email.oninput=()=>{step(false);code.value='';status.textContent='';};
        send.onclick=async()=>{
          if(!email.reportValidity())return;send.disabled=true;status.textContent='';
          try{await api('/api/auth/'+provider+'/code',{email:email.value});step(true);code.focus();status.textContent='Code sent. Confirm your email to connect '+label+'.';}
          catch(error){status.textContent=error.message;}finally{send.disabled=false;}
        };
        form.onsubmit=async event=>{
          event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='';
          try{
            const result=await api('/api/auth/'+provider+'/verify',{email:email.value,code:code.value});clear();
            if(!result.inviteWarning)try{sessionStorage.removeItem('enquiz-invite');}catch{}
            if(result.status==='pending'){
              try{sessionStorage.setItem('enquiz-auth-flash','Account saved. Waiting for approval before you can sign in.');}catch{}
              paintAccountForm(false);return;
            }
            if(result.inviteWarning)console.warn(result.inviteWarning);
            await enterAccount(result.user);
          }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
        };
        box.querySelector('[data-'+provider+'-cancel]').onclick=()=>{clear();paintAccountForm(false);};
      }
      return {pending,paint,decorate};
    }
    window.MicrosoftSignIn=createFederatedSignIn('microsoft','Microsoft');
    window.TelegramSignIn=createFederatedSignIn('telegram','Telegram');
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-microsoft-auth],[data-telegram-auth]');if(!button)return;
      const provider=button.hasAttribute('data-telegram-auth')?'telegram':'microsoft';
      let invite='';try{invite=sessionStorage.getItem('enquiz-invite')||'';}catch{}
      location.href='/api/auth/'+provider+(invite?'?invite='+encodeURIComponent(invite):'');
    });
