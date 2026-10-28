(() => {
  const rays=Array.from({length:24},(_,i)=>{
    const a=i*Math.PI/12,r=i%2?38:36,R=i%2?40:43;
    return '<line x1="'+(44+Math.cos(a)*r)+'" y1="'+(44+Math.sin(a)*r)+'" x2="'+(44+Math.cos(a)*R)+'" y2="'+(44+Math.sin(a)*R)+'" opacity="'+(i%2?'.35':'.65')+'"/>';
  }).join('');
  const emblem='<svg viewBox="0 0 88 88" fill="none" aria-hidden="true" focusable="false"><g stroke="#b99b59" stroke-linecap="round"><circle cx="44" cy="44" r="41" stroke-width=".8" opacity=".5"/><circle cx="44" cy="44" r="36" stroke-width=".5" opacity=".3"/>'+rays+'<polygon points="44,64 32.244,27.820 63.021,50.180 24.979,50.180 55.756,27.820" stroke-width=".7" opacity=".45"/></g><g transform="translate(23 23)"><path d="M21 30 Q15 26.5 8 27.5 L8 14 Q15 13 21 16.5 Q27 13 34 14 L34 27.5 Q27 26.5 21 30 Z" fill="#c5a868" fill-opacity=".16" stroke="#b99b59" stroke-width="1.1" stroke-linejoin="round"/><path d="M21 16.5V30" stroke="#b99b59" stroke-width=".8"/><path d="M21 5 Q23.5 9 22.5 12 Q24.5 11 24.5 14.5 Q24.5 17.5 21 17.5 Q17.5 17.5 17.5 14.5 Q17.5 11 19.5 12 Q18.5 9 21 5Z" fill="#c5a868"/><path d="M21 8 Q22 10.5 21.5 12 Q22.5 11.5 22.5 13.5 Q22.5 15.5 21 15.5 Q19.5 15.5 19.5 13.5 Q19.5 11.5 20.5 12 Q20 10.5 21 8Z" fill="#ffebb2"/></g></svg>';
  document.querySelectorAll('.brand-mark').forEach(node=>{node.innerHTML=emblem;});
  document.querySelectorAll('.guest-brand,.auth-brand').forEach(node=>{
    node.classList.add('studio-brand');
    node.querySelector('.brand-copy').innerHTML='<b>Lumiscia</b><small lang="la">LUMEN EX SCIENTIA</small><span class="studio-translation" lang="en">“Light is born from knowledge”</span>';
    if(node.matches('.guest-brand,.auth-brand')){
      const brand=document.createElement('div');brand.className=node.className;brand.innerHTML=node.innerHTML;node.replaceWith(brand);
    }
  });
  const launch=document.querySelector('#homeAuth [data-account="show-login"]');
  if(launch)launch.textContent='Enter the Learning Studio';

  function paintRecovery(){
    const box=document.getElementById('accountBody');
    box.innerHTML='<div class="account-gate"><div class="card saas-card"><h1 class="auth-title">Reset your password</h1><form id="passwordRecoveryForm"><label for="recoveryEmail">Email address</label><input class="saas-input" id="recoveryEmail" name="email" type="email" autocomplete="email" maxlength="120" required/><button class="btn auth-code-send primary saas-btn" type="button" data-recovery-send>Send code</button><div data-recovery-fields hidden><label for="recoveryCode">Email code</label><input class="saas-input" id="recoveryCode" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" disabled required/><label for="recoveryPassword">New password</label><div class="auth-password"><input class="saas-input" id="recoveryPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="32" disabled required/><button type="button" data-auth-password aria-controls="recoveryPassword" aria-label="Show password" title="Show password" aria-pressed="false">Show</button></div><p class="hint">8–32 characters</p><button class="btn primary saas-btn" type="submit" disabled>Save new password</button></div><p class="hint" role="status" data-form-status></p></form></div></div>';
    box.querySelector('input').focus();
  }
  const navigation=['home'];let restoring=false;
  const names={home:'home',login:'log in',register:'create account',recovery:'password reset',otp:'email code log in'};
  function navigate(state){
    if(!restoring&&navigation.at(-1)!==state)navigation.push(state);
  }
  function backLink(){
    const card=document.querySelector('#accountBody .account-gate>.card');
    if(!card)return;
    const cancel=card.querySelector('[data-microsoft-cancel],[data-telegram-cancel]');
    if(cancel){
      card.querySelector('[data-studio-back]')?.remove();
      cancel.className='auth-forgot studio-back';
      if(cancel.textContent!=='Back to log in')cancel.textContent='Back to log in';
      return;
    }
    let button=card.querySelector('[data-studio-back]');
    if(!button){button=document.createElement('button');button.type='button';button.className='auth-forgot studio-back';button.dataset.studioBack='';card.append(button);}
    const text='Back to '+names[navigation.at(-2)||'home'];if(button.textContent!==text)button.textContent=text;
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-studio-back]')){
      event.preventDefault();event.stopPropagation();
      if(navigation.length>1)navigation.pop();const state=navigation.at(-1);restoring=true;
      if(state==='home')show('home');
      else if(state==='recovery')paintRecovery();
      else{paintAccountForm(state==='register');if(state==='otp')document.querySelector('.auth-providers [data-login-mode="otp"]')?.click();}
      restoring=false;backLink();return;
    }
    const account=event.target.closest('[data-account]')?.dataset.account;
    if(event.target.closest('[data-microsoft-cancel],[data-telegram-cancel]'))navigate('login');
    if(account==='show-register')navigate('register');
    if(account==='show-login')navigate('login');
    const mode=event.target.closest('[data-login-mode]')?.dataset.loginMode;
    if(mode)navigate(mode==='otp'?'otp':'login');
    if(event.target.closest('[data-password-recovery]')){navigate('recovery');paintRecovery();}
    queueMicrotask(backLink);
  },true);
  const accountBox=document.getElementById('accountBody');
  if(accountBox)new MutationObserver(backLink).observe(accountBox,{childList:true,subtree:true});
  document.addEventListener('input',event=>{
    if(event.target.matches('#registerForm [name="name"]'))event.target.setCustomValidity(event.target.value.trim()?'':'Enter your name.');
  });
  async function recover(form,send){
    const status=form.querySelector('[data-form-status]'),email=form.elements.email;
    if(!email.reportValidity()||(!send&&!form.reportValidity())||form.dataset.busy)return;
    form.dataset.busy='true';status.textContent='';status.classList.remove('bad');
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
    const address=email.value.trim();
    try{
      await accountFetch('/api/auth/password/'+(send?'code':'reset'),{method:'POST',body:JSON.stringify(send?{email:address}:{email:address,code:form.elements.code.value,password:form.elements.password.value})});
      if(!form.isConnected)return;
      if(send){
        email.readOnly=true;
        form.querySelector('[data-recovery-fields]').hidden=false;
        form.querySelectorAll('[data-recovery-fields] input').forEach(input=>input.disabled=false);
        status.textContent='Check your inbox for a password reset code. It expires in 10 minutes.';
        form.elements.code.focus();
      }else{
        while(navigation.length>1&&navigation.at(-1)!=='login')navigation.pop();
        paintAccountForm(false);
        document.querySelector('#loginForm [data-form-status]').textContent='Password updated. Log in with your new password.';
        document.querySelector('#authLogin').value=address;
      }
    }catch(error){if(form.isConnected){status.textContent=error.message;status.classList.add('bad');}}
    finally{delete form.dataset.busy;buttons.forEach(button=>button.disabled=!!button.closest('[hidden]'));}
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-recovery-send]');if(button)void recover(button.closest('form'),true);});
  document.addEventListener('submit',event=>{if(event.target.id!=='passwordRecoveryForm')return;event.preventDefault();void recover(event.target,event.target.elements.code.disabled);});

})();
