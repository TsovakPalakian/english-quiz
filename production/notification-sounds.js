(() => {
  'use strict';
  const choices=[['soft-double','Soft double',1.2,[660,880]],['triple','Melodic triple',1.8,[523,659,784]],['bell','Long bell',2.6,[880,1320]],['ping','Short ping',.3,[880]],['wood','Wood tap',.25,[330]],['glass','Glass',.7,[1200,1600]],['rise','Rising melody',2,[440,554,659,880]],['fall','Falling melody',1.6,[880,659,440]],['pulse','Double pulse',.65,[440,440]],['sparkle','Sparkle',2.4,[1046,1318,1568]],['low','Low chime',1.4,[330,440]],['classic','Classic',.45,[660,880]]];
  const defaults=()=>({enabled:true,volume:.65,sound:'soft-double',sounds:[],revision:''});
  let owner='',settings=defaults(),context,playing=[],buffer=null,loading=null,version=0,dialog,uploadBuffer,available=false;
  const own=()=>typeof authUser!=='undefined'&&authUser&&!(typeof viewAccount!=='undefined'&&viewAccount)?authUser.id:'';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(method='GET',body,url=''){
    const account=owner;
    const response=await fetch('/api/me/notification-sounds'+url,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'If-Match':settings.revision,'Content-Type':body instanceof ArrayBuffer?'audio/wav':'application/json'},body:body instanceof ArrayBuffer?body:body?JSON.stringify(body):undefined});
    if(account!==own()||account!==owner)throw Error('Account changed.');
    if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.error||'Sound settings unavailable.');}
    return response.json();
  }
  function stop(){for(const source of playing)try{source.stop();}catch{}playing=[];}
  async function unlock(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio is unavailable in this browser.');context||=new Audio();if(context.state==='suspended')await context.resume();return context;}
  async function preload(){
    buffer=null;const account=owner,selected=settings.sound;
    if(!settings.sounds.some(sound=>sound.id===selected))return;
    const response=await fetch('/api/me/notification-sounds?id='+encodeURIComponent(selected),{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error('Custom sound unavailable.');
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context||=new Audio();
    const decoded=await context.decodeAudioData(await response.arrayBuffer());if(account===owner&&selected===settings.sound)buffer=decoded;
  }
  async function load(account){
    if(account===owner&&loading)return loading;
    if(account!==owner){stop();owner=account;settings=defaults();buffer=null;uploadBuffer=null;available=false;version++;dialog?.close();}
    if(!account)return;
    const token=version;
    loading=api().then(value=>{if(token!==version)return;if(typeof value.enabled!=='boolean'||!Array.isArray(value.sounds))throw Error('Sound settings unavailable.');settings=value;available=true;return preload();}).catch(()=>{if(token===version)available=false;}).finally(()=>{if(token===version)loading=null;});
    return loading;
  }
  function play(preview=false){
    if(!available||!owner||owner!==own()||(!preview&&!settings.enabled)||!context||context.state!=='running'||settings.sounds.some(sound=>sound.id===settings.sound)&&!buffer)return;
    stop();const now=context.currentTime,gain=context.createGain();gain.gain.value=settings.volume;gain.connect(context.destination);
    if(buffer){const source=context.createBufferSource();source.buffer=buffer;source.connect(gain);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();playing.push(source);return;}
    const [, ,duration,notes]=choices.find(item=>item[0]===settings.sound)||choices[0];
    let remaining=notes.length;
    notes.forEach((frequency,index)=>{const source=context.createOscillator(),envelope=context.createGain(),start=now+index*(duration*.45/notes.length),end=now+duration;source.type='sine';source.frequency.value=frequency;envelope.gain.setValueAtTime(.0001,start);envelope.gain.exponentialRampToValueAtTime(.13/notes.length,start+.015);envelope.gain.exponentialRampToValueAtTime(.0001,end);source.connect(envelope);envelope.connect(gain);source.onended=()=>{source.disconnect();envelope.disconnect();if(!--remaining)gain.disconnect();};source.start(start);source.stop(end);playing.push(source);});
  }
  function wav(audio,start,duration){
    const rate=24000,count=Math.floor(duration*rate),bytes=new ArrayBuffer(44+count*2),view=new DataView(bytes),write=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);
    const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
    for(let i=0;i<count;i++){const position=(start+i/rate)*audio.sampleRate,left=Math.floor(position),fraction=position-left;let sample=0;for(const data of channels)sample+=(data[left]||0)*(1-fraction)+(data[left+1]||0)*fraction;sample/=channels.length;const fade=Math.min(1,i/240,(count-1-i)/240);view.setInt16(44+i*2,Math.max(-1,Math.min(1,sample*fade))*32767,true);}
    return bytes;
  }
  async function open(){
    const account=own();if(!account)return;await load(account);if(account!==own())return;
    if(!available)throw Error('Sound settings unavailable. Try again.');
    if(!dialog){dialog=document.createElement('dialog');dialog.className='notification-sound-settings';document.body.append(dialog);dialog.addEventListener('close',()=>{stop();if(owner===own())load(owner);});}
    const render=()=>{
      dialog.innerHTML='<header><h2>Notification sounds</h2><button type="button" data-close title="Close" aria-label="Close"><i data-lucide="x"></i></button></header><form><label class="sound-toggle">Message notifications<input type="checkbox" name="enabled"'+(settings.enabled?' checked':'')+'></label><label>Sound<select name="sound">'+choices.map(([id,name,length])=>'<option value="'+id+'"'+(id===settings.sound?' selected':'')+'>'+name+' · '+length+' s</option>').join('')+settings.sounds.map(item=>'<option value="'+item.id+'"'+(item.id===settings.sound?' selected':'')+'>'+escape(item.name)+' · '+item.duration.toFixed(1)+' s</option>').join('')+'</select></label><div class="sound-actions"><button type="button" data-preview title="Preview sound" aria-label="Preview sound"><i data-lucide="volume-2"></i></button><button type="button" data-remove title="Delete custom sound" aria-label="Delete custom sound"'+(!settings.sounds.some(item=>item.id===settings.sound)?' hidden':'')+'><i data-lucide="trash-2"></i></button></div><label>Volume <output>'+Math.round(settings.volume*100)+'%</output><input name="volume" type="range" min="0" max="1" step="0.01" value="'+settings.volume+'"></label><label>Custom sound<input name="upload" type="file" accept="audio/*"></label><div data-trim hidden><label>Start, seconds<input name="start" type="number" min="0" step="0.1" value="0"></label><label>Duration, seconds<input name="duration" type="number" min="0.1" max="3" step="0.1" value="3"></label><button type="button" data-upload>Upload sound</button></div><p role="status"></p><button type="submit" class="btn primary">Save</button></form>';
      window.lucide?.createIcons({root:dialog});const form=dialog.querySelector('form'),notice=dialog.querySelector('[role=status]');
      const fail=error=>notice.textContent=error.message;
      const update=()=>{settings={...settings,enabled:form.elements.enabled.checked,sound:form.elements.sound.value,volume:Number(form.elements.volume.value)};form.querySelector('output').textContent=Math.round(settings.volume*100)+'%';};
      dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      form.elements.volume.oninput=update;form.elements.enabled.onchange=update;
      form.elements.sound.onchange=()=>{update();dialog.querySelector('[data-remove]').hidden=!settings.sounds.some(item=>item.id===settings.sound);preload().catch(fail);};
      dialog.querySelector('[data-preview]').onclick=async()=>{try{update();await unlock();if(!buffer&&settings.sounds.some(item=>item.id===settings.sound))await preload();play(true);}catch(error){fail(error);}};
      form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{update();settings=await api('POST',{enabled:settings.enabled,sound:settings.sound,volume:settings.volume});notice.textContent='Saved';}catch(error){fail(error);}finally{button.disabled=false;}};
      dialog.querySelector('[data-remove]').onclick=async()=>{try{settings=await api('DELETE',null,'?id='+encodeURIComponent(settings.sound));buffer=null;render();}catch(error){fail(error);}};
      form.elements.upload.onchange=async()=>{try{const file=form.elements.upload.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('Maximum source file size is 10 MB.');await unlock();uploadBuffer=await context.decodeAudioData(await file.arrayBuffer());if(uploadBuffer.duration<.1)throw Error('Audio is too short.');form.elements.duration.value=Math.min(3,uploadBuffer.duration).toFixed(2);form.elements.start.max=Math.max(0,uploadBuffer.duration-.1);dialog.querySelector('[data-trim]').hidden=false;notice.textContent='';}catch(error){uploadBuffer=null;fail(error);}};
      dialog.querySelector('[data-upload]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const start=Number(form.elements.start.value),duration=Number(form.elements.duration.value);if(!uploadBuffer||!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<.1||duration>3||start+duration>uploadBuffer.duration+.001)throw Error('Select a valid fragment up to 3 seconds.');settings=await api('PUT',wav(uploadBuffer,start,duration),'?name='+encodeURIComponent(form.elements.upload.files[0].name));await preload();uploadBuffer=null;render();}catch(error){fail(error);}finally{button.disabled=false;}};
    };
    render();dialog.showModal();
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-notification-sounds]'))open().catch(error=>{if(window.TursoMain?.notice)window.TursoMain.notice(error.message,true);else window.alert(error.message);});});
  window.NotificationSounds={load,play,stop,unlock};
})();
