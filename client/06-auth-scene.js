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
    if(node.matches('.guest-brand')){
      const brand=document.createElement('div');brand.className=node.className;brand.innerHTML=node.innerHTML;node.replaceWith(brand);
    }
  });
  const launch=document.querySelector('#homeAuth [data-account="show-login"]');
  if(launch)launch.textContent='Enter the Learning Studio';

  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-password-recovery]'))return;
    const box=document.getElementById('accountBody');
    box.innerHTML='<div class="account-gate"><div class="card"><h1 class="auth-title">Reset your password</h1><form id="passwordRecoveryForm"><label for="recoveryEmail">Email address</label><input id="recoveryEmail" name="email" type="email" autocomplete="email" maxlength="120" required/><button class="btn auth-code-send" type="button" data-recovery-send>Send code</button><div data-recovery-fields hidden><label for="recoveryCode">Email code</label><input id="recoveryCode" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" disabled required/><label for="recoveryPassword">New password</label><div class="auth-password"><input id="recoveryPassword" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="32" disabled required/><button type="button" data-auth-password aria-controls="recoveryPassword" aria-label="Show password" title="Show password" aria-pressed="false">Show</button></div><p class="hint">8–32 characters</p><button class="btn primary" type="submit" disabled>Save new password</button></div><p class="hint" role="status" data-form-status></p></form><button class="auth-forgot" type="button" data-account="show-login">Back to log in</button></div></div>';
    box.querySelector('input').focus();
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
        paintAccountForm(false);
        document.querySelector('#loginForm [data-form-status]').textContent='Password updated. Log in with your new password.';
        document.querySelector('#authLogin').value=address;
      }
    }catch(error){if(form.isConnected){status.textContent=error.message;status.classList.add('bad');}}
    finally{delete form.dataset.busy;buttons.forEach(button=>button.disabled=!!button.closest('[hidden]'));}
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-recovery-send]');if(button)void recover(button.closest('form'),true);});
  document.addEventListener('submit',event=>{if(event.target.id!=='passwordRecoveryForm')return;event.preventDefault();void recover(event.target,event.target.elements.code.disabled);});

  // Original archive animation, adapted for lifecycle, pixel density and form-safe paths.

  const canvas=document.createElement('canvas');canvas.id='authSky';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
  const captionLink=document.createElement('a');captionLink.className='auth-sky-caption';captionLink.target='_blank';captionLink.rel='noopener noreferrer';captionLink.hidden=true;document.body.append(captionLink);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const constellations=STUDIO_CONSTELLATIONS.map(c=>({...c,latin:STUDIO_CONSTELLATION_LABELS[c.name][0],abbr:STUDIO_CONSTELLATION_LABELS[c.name][1],stars:c.stars.map(([x,y,mag])=>({x,y,mag}))}));
  const MAX_STARS=Math.max(...constellations.map(c=>c.stars.length));
  let obstacles=[],routeStar=null,polaris=null,openedMode='',captionObstacle=null,recentConstellations=[];
  try{
    const saved=JSON.parse(sessionStorage.getItem('lumiscia-sky-recent-v2')||'null');
    if(Array.isArray(saved)&&saved.every(i=>Number.isInteger(i)&&i>=0&&i<constellations.length))recentConstellations=saved.slice(-12);
  }catch{}
  function nextConstellation(){
    const limit=Math.min(12,constellations.length-1),recent=recentConstellations.slice(-limit),choices=constellations.map((_,i)=>i).filter(i=>!recent.includes(i));
    const selected=choices[Math.floor(Math.random()*choices.length)];
    recentConstellations=[...recent,selected].slice(-12);
    try{sessionStorage.setItem('lumiscia-sky-recent-v2',JSON.stringify(recentConstellations));}catch{}
    return selected;
  }
  const protectedRect=()=>{const node=document.querySelector('body.guest-home #home,body.guest-auth #account');const r=node?.getBoundingClientRect()||{left:0,right:0,top:0,bottom:0};return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  function uiBoxes(mode){
    const brand=mode==='home'?'#home .studio-brand':'#account .auth-brand';
    const selectors=brand+' .brand-mark,'+brand+' .brand-copy b,'+brand+' .brand-copy small,'+brand+' .studio-translation,'+(mode==='home'?'#homeAuth button':'#accountBody')+',.site-copyright';
    return [...document.querySelectorAll(selectors)].map(node=>node.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}));
  }
  const protectedPoint=(x,y)=>obstacles.some(o=>StudioSkyGeometry.contains({x,y},o.points));
  function randomSafePoint(){for(let i=0;i<200;i++){const p={x:32+Math.random()*Math.max(0,innerWidth-64),y:32+Math.random()*Math.max(0,innerHeight-96)};if(!protectedPoint(p.x,p.y))return p;}return {x:-40,y:-40};}
  function prepareObstacles(mode){
    obstacles=[];captionObstacle=null;
    const boxes=uiBoxes(mode);
    for(const r of boxes){
      obstacles.push(StudioSkyGeometry.shape((r.left+r.right)/2,(r.top+r.bottom)/2,r.width/2+38,r.height/2+38,'rounded'));
    }
    for(let i=0;i<2;i++){
      const p=randomSafePoint(),rx=Math.min(innerWidth*.08,40+Math.random()*38),ry=26+Math.random()*38;
      const shape=StudioSkyGeometry.shape(p.x,p.y,rx,ry,i?'organic':'ellipse');
      if((!polaris||Math.hypot(p.x-polaris.x,p.y-polaris.y)>rx+40)&&!obstacles.some(o=>StudioSkyGeometry.blocked({x:p.x-rx,y:p.y},{x:p.x+rx,y:p.y},[o])))obstacles.push(shape);
    }
    const fits=p=>p.x>=38&&p.x<=innerWidth-38&&p.y>=38&&p.y<=innerHeight-58&&!protectedPoint(p.x,p.y)&&!boxes.some(r=>p.x+38>r.left-8&&p.x-38<r.right+8&&p.y+58>r.top-8&&p.y-38<r.bottom+8);
    if(mode!==openedMode||!polaris||!fits(polaris)){
      polaris={x:-100,y:-100};
      for(let i=0;i<240;i++){const p=randomSafePoint();if(fits(p)){polaris=p;break;}}
      if(polaris.x<0)for(let y=38;y<=innerHeight-58&&polaris.x<0;y+=16)for(let x=38;x<=innerWidth-38;x+=16)if(fits({x,y})){polaris={x,y};break;}
    }
    obstacles.push(StudioSkyGeometry.shape(polaris.x,polaris.y+14,56,80,'ellipse'));
    routeStar=StudioSkyGeometry.router(obstacles);
    openedMode=mode;
  }
  function safeZones(captionWidth=180,previousStars=[]){
    const w=innerWidth,h=innerHeight,available=[];
    for(let i=0;i<600&&available.length<36;i++){
      const size=(i<400?.65+Math.random()*.35:.2+Math.random()*.45)*Math.min(680,w*.52,h*.6),cx=30+Math.random()*Math.max(0,w-60),cy=30+Math.random()*Math.max(0,h-100);
      const halfWidth=Math.max(size/2+32,captionWidth/2+38),left=cx-halfWidth,right=cx+halfWidth,top=cy-size/2-32,bottom=cy+size/2+92;
      if(left<12||right>w-12||top<12||bottom>h-40)continue;
      const box=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
      if(obstacles.some(o=>o.points.some(p=>p.x>left&&p.x<right&&p.y>top&&p.y<bottom)||box.some((p,j)=>StudioSkyGeometry.blocked(p,box[(j+1)%4],[o]))))continue;
      if(previousStars.some(p=>Math.abs(p.x-cx)<captionWidth/2+40&&Math.abs(p.y-(cy+size/2+52))<64))continue;
      available.push({cx:cx/w,cy:cy/h,w:size/w,h:size/h});
    }
    return available.length?available:[{cx:-1,cy:-1,w:.1,h:.1}];
  }
  const safeRoute=(a,b)=>routeStar(a,b);
  const routePoint=(route,t)=>StudioSkyGeometry.point(route,t);
  function drift(star,delta,w,h,normalized=false){
    let x=normalized?star.x*w:star.x,y=normalized?star.y*h:star.y;
    const near=StudioSkyGeometry.nearest({x,y},obstacles);
    if(near.distance<48){const force=Math.max(0,(48-near.distance)/48)*.018*delta;star.vx+=near.nx*force;star.vy+=near.ny*force;}
    const speed=Math.hypot(star.vx,star.vy)||1;star.vx=star.vx/speed*star.speedPx;star.vy=star.vy/speed*star.speedPx;
    const nx=x+star.vx*delta,ny=y+star.vy*delta;
    if(!protectedPoint(nx,ny)){x=nx;y=ny;}else{star.vx*=-1;star.vy*=-1;}
    x=(x+w+12)%(w+12);y=(y+h+12)%(h+12);
    if(protectedPoint(x,y)){const p=randomSafePoint();x=p.x;y=p.y;}
    star.x=normalized?x/w:x;star.y=normalized?y/h:y;
    return Math.max(0,Math.min(1,StudioSkyGeometry.nearest({x,y},obstacles).distance/26));
  }


  function startSky(){
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w=innerWidth,h=innerHeight;
    let zones=[],animationId=0,lastTime=null;
    const sizeCanvas=()=>{w=innerWidth;h=innerHeight;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);};
    sizeCanvas();

    function drawStar(x,y,radius,alpha,color){
      if(alpha<=0)return;
      ctx.fillStyle='rgba('+color+','+alpha+')';ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    }

    // Ambient background stars
    const ambientStars=Array.from({length:Math.min(340,Math.max(160,Math.round(w*h/3500)))}).map(()=>{
      const p=randomSafePoint(),angle=Math.random()*Math.PI*2,speedPx=.015+Math.random()*.045;
      return {x:p.x/w,y:p.y/h,vx:Math.cos(angle)*speedPx,vy:Math.sin(angle)*speedPx,speedPx,radius:.25+Math.random()*1.05,phase:Math.random()*Math.PI*2,speed:.003+Math.random()*.007};
    });

    // Wandering stars — slow, drifting golden points
    const wanderers             = Array.from({ length: 16 }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const sp = Math.random() * 0.08 + 0.025,p=randomSafePoint();
      return {
        x:p.x,
        y:p.y,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        speedPx:sp,
        radius: Math.random() * .65 + 1.15,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.008 + 0.003,
      };
    });

    // Continuous cycle: gather → hold → morph → hold → morph → ...
    // "morph" flows stars directly from one constellation to the next — no scatter phase

    let phase        = 'gather';
    let phaseStart = performance.now();

    const GATHER_DURATION = 15000;
    const HOLD_DURATION = 8000;
    const MORPH_DURATION = 18000;

    let constIndex = nextConstellation(),previousConstIndex=constIndex;
    let zoneIndex = -1;

    // Track current live positions + constellation for click hit-testing
    let currentLive                                              = [];
    let currentConstIndex = 0;
    let currentPhase        = 'gather';

    const HIT_RADIUS = 35;

    function isOverConstellation(cx        , cy        )          {
      if (currentPhase !== 'hold' || protectedPoint(cx,cy)) return false;
      for (let i = 0; i < currentLive.length; i++) {
        const p = currentLive[i];
        if (p.opacity < 0.3) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) return true;
      }
      return false;
    }

    function handleClick(e            ) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.target.closest('button,input,a,form,select,textarea') || !isOverConstellation(cx, cy)) return;
      const c = constellations[currentConstIndex % constellations.length];
      window.open(
        `https://www.go-astronomy.com/constellations.php?Name=${c.latin}`,
        '_blank', 'noopener,noreferrer'
      );
    }
    window.addEventListener('click', handleClick);

    let lastHoverState = false;
    function handleMouseMove(e            ) {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const over = isOverConstellation(cx, cy);
      if (over !== lastHoverState) {
        lastHoverState = over;
        canvas.classList.toggle('sky-hover',over);
      }
    }
    window.addEventListener('mousemove', handleMouseMove);

    // Each slot tracks position + opacity (for stars that appear/disappear between constellations)


    let slots         = [];

    function getConstellationLayout(ci        , zi        ) {
      const c = constellations[ci % constellations.length];
      const zone = zones[zi % zones.length];
      const size = Math.min(w * zone.w, h * zone.h);
      const offsetX = w * zone.cx - size / 2;
      const offsetY = h * zone.cy - size / 2;

      if(captionObstacle)obstacles=obstacles.filter(o=>o!==captionObstacle);
      ctx.font='16px "Cinzel",serif';const labelWidth=ctx.measureText(c.latin.toUpperCase()).width+28;
      captionObstacle=StudioSkyGeometry.shape(w*zone.cx,h*zone.cy+size/2+54,labelWidth/2+20,36,'rounded');
      obstacles.push(captionObstacle);routeStar=StudioSkyGeometry.router(obstacles);

      // Build a full MAX_STARS-length array — stars beyond the constellation's count get opacity 0
      const targets                                                           = [];
      for (let i = 0; i < MAX_STARS; i++) {
        if (i < c.stars.length) {
          const s = c.stars[i];
          targets.push({
            x: offsetX + s.x * size,
            y: offsetY + s.y * size,
            opacity: 1,
            mag: s.mag,
          });
        } else {
          // Extra slot — fade out, position at center of constellation
          targets.push({
            x: offsetX + 0.5 * size,
            y: offsetY + 0.5 * size,
            opacity: 0,
            mag: 4,
          });
        }
      }
      // Keep close catalogue points distinct without changing the overall pattern.
      for(let pass=0;pass<12;pass++)for(let i=0;i<c.stars.length;i++)for(let j=0;j<i;j++){
        const a=targets[i],b=targets[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);
        if(d>=15)continue;const nx=d?dx/d:Math.cos(i+j),ny=d?dy/d:Math.sin(i+j),push=(15-d)/2;
        a.x=Math.max(offsetX,Math.min(offsetX+size,a.x+nx*push));a.y=Math.max(offsetY,Math.min(offsetY+size,a.y+ny*push));
        b.x=Math.max(offsetX,Math.min(offsetX+size,b.x-nx*push));b.y=Math.max(offsetY,Math.min(offsetY+size,b.y-ny*push));
      }
      return { targets, c };
    }

    function easeInOut(t        )         {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function startPhase(p       , now        ) {
      phase = p;
      phaseStart = now;

      if (p === 'gather' || p === 'morph') {
        // Pick next zone for morph
        if (p === 'morph') {
          previousConstIndex=constIndex;constIndex=nextConstellation();
          if(captionObstacle)obstacles=obstacles.filter(o=>o!==captionObstacle);
          ctx.font='16px "Cinzel",serif';zones=safeZones(ctx.measureText(constellations[constIndex].latin.toUpperCase()).width,slots);
          zoneIndex = pickZone(zoneIndex);
        }

        const { targets, c } = getConstellationLayout(constIndex, zoneIndex);

        if (slots.length === 0) {
          // First time — initialize from random positions
          slots = targets.map((t) => {
            const {x:sx,y:sy}=randomSafePoint();
            return {
              x: sx,
              y: sy,
              fromX: sx,
              fromY: sy,
              targetX: t.x,
              targetY: t.y,
              fromOpacity: 0,
              targetOpacity: t.opacity,
              mag: t.mag,
            };
          });
        } else {
          // Morph — flow from current position to new constellation
          slots = slots.map((slot, i) => ({
            x: slot.x,
            y: slot.y,
            fromX: slot.x,
            fromY: slot.y,
            targetX: targets[i].x,
            targetY: targets[i].y,
            fromOpacity: slot.targetOpacity,
            targetOpacity: targets[i].opacity,
            mag: targets[i].mag,
          }));
        }

      }
    }

    function pickZone(previous){let index=Math.floor(Math.random()*zones.length);if(index===previous&&zones.length>1)index=(index+1)%zones.length;return index;}
    // Initialize
    ctx.font='16px "Cinzel",serif';zones=safeZones(ctx.measureText(constellations[constIndex].latin.toUpperCase()).width);
    zoneIndex = pickZone(-1);
    const initLayout = getConstellationLayout(0, zoneIndex);
    slots = initLayout.targets.map((t) => {
      const {x:sx,y:sy}=randomSafePoint();
      return {
        x: sx,
        y: sy,
        fromX: sx,
        fromY: sy,
        targetX: t.x,
        targetY: t.y,
        fromOpacity: 0,
        targetOpacity: t.opacity,
        mag: t.mag,
      };
    });

    phase = 'gather';
    phaseStart = performance.now();

    let frame = 0;

    function animate(now        ) {
      const delta=lastTime===null?1:Math.min(3,(now-lastTime)/16.6667);lastTime=now;frame+=delta;
      let elapsed = now - phaseStart;

      // Phase transitions
      if (phase === 'gather' && elapsed > GATHER_DURATION) {
        startPhase('hold', now);
      } else if (phase === 'hold' && elapsed > HOLD_DURATION) {
        startPhase('morph', now);
      } else if (phase === 'morph' && elapsed > MORPH_DURATION) {
        startPhase('hold', now);
      }

      elapsed=now-phaseStart;
      canvas.dataset.skyPhase=phase;canvas.dataset.skyConstellation=constellations[constIndex%constellations.length].name;
      // Clear
      ctx.clearRect(0,0,w,h);
      ctx.save();

      // Draw ambient stars
      for (const s of ambientStars) {
        const clearance=motion.matches?1:drift(s,delta,w,h,true);
        if(protectedPoint(s.x*w,s.y*h))continue;
        const twinkle = Math.sin(frame * s.speed + s.phase) * 0.3 + 0.7;
        drawStar(s.x*w,s.y*h,s.radius,twinkle*.25*clearance,'200,220,240');
      }

      // Draw wandering stars
      for (const wst of wanderers) {
        // Move
        const clearance=motion.matches?1:drift(wst,delta,w,h);
        if(protectedPoint(wst.x,wst.y))continue;
        // Wrap around edges
        if (wst.x < -10) wst.x = w + 10;
        if (wst.x > w + 10) wst.x = -10;
        if (wst.y < -10) wst.y = h + 10;
        if (wst.y > h + 10) wst.y = -10;

        const twinkle = Math.sin(frame * wst.speed + wst.phase) * 0.25 + 0.75;
        const r = wst.radius * twinkle;

        // Glow
        const glow = ctx.createRadialGradient(wst.x, wst.y, 0, wst.x, wst.y, r * 5);
        glow.addColorStop(0, `rgba(255, 235, 178, ${0.12 * twinkle*clearance})`);
        glow.addColorStop(1, 'rgba(255, 235, 178, 0)');
        ctx.beginPath();
        ctx.arc(wst.x, wst.y, r * 5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core
        drawStar(wst.x,wst.y,r,.3*twinkle*clearance,'255,245,210');
      }

      // Polaris stays fixed for this screen opening and is the brightest visual anchor.
      canvas.dataset.polarisX=String(polaris.x);canvas.dataset.polarisY=String(polaris.y);
      const poleGlow=ctx.createRadialGradient(polaris.x,polaris.y,0,polaris.x,polaris.y,30);
      poleGlow.addColorStop(0,'rgba(255,245,210,.65)');poleGlow.addColorStop(.35,'rgba(255,235,178,.24)');poleGlow.addColorStop(1,'rgba(255,235,178,0)');
      ctx.fillStyle=poleGlow;ctx.beginPath();ctx.arc(polaris.x,polaris.y,30,0,Math.PI*2);ctx.fill();
      drawStar(polaris.x,polaris.y,5.5,1,'255,255,255');
      ctx.strokeStyle='rgba(255,245,210,.75)';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(polaris.x-11,polaris.y);ctx.lineTo(polaris.x+11,polaris.y);ctx.moveTo(polaris.x,polaris.y-11);ctx.lineTo(polaris.x,polaris.y+11);ctx.stroke();
      ctx.font='12px Georgia,serif';ctx.textAlign='center';ctx.fillStyle='rgba(225,205,153,.85)';ctx.fillText('Polaris',polaris.x,polaris.y+46);

      // Compute interpolation progress
      let progress = 0;
      if (phase === 'gather') progress = easeInOut(Math.min(elapsed / GATHER_DURATION, 1));
      else if (phase === 'hold') progress = 1;
      else progress = easeInOut(Math.min(elapsed / MORPH_DURATION, 1));

      // Interpolate slots
      const live=slots.map(s=>({...routePoint(s.route||(s.route=safeRoute({x:s.fromX,y:s.fromY},{x:s.targetX,y:s.targetY})),progress),opacity:s.fromOpacity+(s.targetOpacity-s.fromOpacity)*progress,mag:s.mag}));
      live.forEach((p,i)=>{slots[i].x=p.x;slots[i].y=p.y;});

      // Update hit-test state
      currentLive = live;
      currentConstIndex = constIndex;
      currentPhase = phase;

      // If phase changed away from hold, reset hover state
      if (phase !== 'hold' && lastHoverState) {
        lastHoverState = false;
        canvas.classList.remove('sky-hover');
      }

      const c = constellations[constIndex % constellations.length];

      // Draw constellation lines
      let lineAlpha = 0;
      if (phase === 'gather') lineAlpha = progress * 0.18;
      else if (phase === 'hold') lineAlpha = 0.18;
      else lineAlpha = 0.18 * progress; // morph — new constellation lines fade in

      // During morph, also fade out old constellation lines
      if (phase === 'morph') {
        const prevC = constellations[previousConstIndex];
        const oldLineAlpha = 0.18 * (1 - progress);
        if (oldLineAlpha > 0.01) {
          ctx.strokeStyle = `rgba(197, 168, 104, ${oldLineAlpha})`;
          ctx.lineWidth = 0.8;
          for (const [a, b] of prevC.lines) {
            if (live[a] && live[b] && live[a].opacity > 0.1 && live[b].opacity > 0.1&&!StudioSkyGeometry.blocked(live[a],live[b],obstacles)) {
              ctx.beginPath();
              ctx.moveTo(live[a].x, live[a].y);
              ctx.lineTo(live[b].x, live[b].y);
              ctx.stroke();
            }
          }
        }
      }

      if (lineAlpha > 0.01) {
        ctx.strokeStyle = `rgba(197, 168, 104, ${lineAlpha})`;
        ctx.lineWidth = 0.8;
        for (const [a, b] of c.lines) {
          if (live[a] && live[b] && live[a].opacity > 0.1 && live[b].opacity > 0.1&&!StudioSkyGeometry.blocked(live[a],live[b],obstacles)) {
            ctx.beginPath();
            ctx.moveTo(live[a].x, live[a].y);
            ctx.lineTo(live[b].x, live[b].y);
            ctx.stroke();
          }
        }
      }

      // Draw constellation stars
      for (let i = 0; i < live.length; i++) {
        const pos = live[i];
        if (pos.opacity < 0.05) continue;

        const mag = pos.mag;
        const brightness = Math.max(0.35, 1 - mag / 5);
        const radius = Math.max(1.5, 5 - mag * 0.5);

        // Glow
        const glowRadius = radius * 6;
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowRadius);
        gradient.addColorStop(0, `rgba(255, 235, 178, ${brightness * 0.45 * pos.opacity})`);
        gradient.addColorStop(1, 'rgba(255, 235, 178, 0)');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core
        drawStar(pos.x,pos.y,radius,brightness*pos.opacity,'255,245,210');
      }

      // Draw constellation name
      let nameAlpha = 0;
      if (phase === 'gather') nameAlpha = Math.max(0, (progress - 0.6) / 0.4) * 0.5;
      else if (phase === 'hold') nameAlpha = 0.5*(1-easeInOut(Math.max(0,Math.min(1,(elapsed-(HOLD_DURATION-3500))/3500))));
      else if (phase === 'morph') {
        // Fade old name out, new name in
        nameAlpha = 0.5*easeInOut(Math.max(0,(progress-.6)/.4));
      }

      if (nameAlpha > 0.01 && zoneIndex >= 0) {
        const zone = zones[zoneIndex];
        const nameX = w * zone.cx;
        const nameY = h * zone.cy + Math.min(w * zone.w, h * zone.h)/2+52;

        ctx.font = '16px "Cinzel", serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(197, 168, 104, ${nameAlpha})`;
        ctx.fillText(c.latin.toUpperCase(), nameX, nameY);
        ctx.font = '11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = `rgba(197, 168, 104, ${nameAlpha * 0.6})`;
        ctx.fillText(c.abbr, nameX, nameY + 16);
        ctx.font='16px "Cinzel",serif';const width=Math.max(ctx.measureText(c.latin.toUpperCase()).width,48)+16;
        captionLink.href='https://www.go-astronomy.com/constellations.php?Name='+encodeURIComponent(c.latin);
        captionLink.setAttribute('aria-label','Learn about '+c.name);captionLink.title=c.name;
        captionLink.style.left=(nameX-width/2)+'px';captionLink.style.top=(nameY-20)+'px';captionLink.style.width=width+'px';captionLink.style.height='44px';
        captionLink.hidden=nameAlpha<.08||nameX<0||nameY<0||nameY>h;
      }else{
        captionLink.hidden=true;
      }

      ctx.restore();
      if(!motion.matches)animationId=requestAnimationFrame(animate);
    }

    if(motion.matches){phase='hold';slots.forEach(s=>{s.fromX=s.targetX;s.fromY=s.targetY;s.fromOpacity=s.targetOpacity;});animate(performance.now());}else animationId=requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);canvas.classList.remove('sky-hover');
      captionLink.hidden=true;
      window.removeEventListener('click', handleClick);
      window.removeEventListener('mousemove', handleMouseMove);
    };


  }
  let stop=null,lifecycleKey='';
  function sync(){
    const mode=document.body.matches('.guest-home')?'home':document.body.matches('.guest-auth')?'account':'';
    const key=JSON.stringify([mode,innerWidth,innerHeight,protectedRect(),mode?uiBoxes(mode):[],document.hidden,motion.matches]);
    if(key===lifecycleKey)return;lifecycleKey=key;
    stop?.();stop=null;canvas.hidden=!mode;if(!mode)openedMode='';if(mode&&!document.hidden){prepareObstacles(mode);stop=startSky();}
  }
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  const sizes=new ResizeObserver(sync);['home','account'].forEach(id=>{const node=document.getElementById(id);if(node)sizes.observe(node);});
  new MutationObserver(()=>{document.querySelectorAll('.auth-providers .auth-google').forEach(button=>{const label=button.textContent.trim();if(label){button.title=label;button.setAttribute('aria-label',label);}});sync();}).observe(document.getElementById('accountBody'),{childList:true,subtree:true});
  addEventListener('resize',sync);addEventListener('scroll',sync,{passive:true});document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);sync();
})();
