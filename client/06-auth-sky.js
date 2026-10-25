(() => {
  const astro=StudioSkyAstronomy,geometry=StudioSkyGeometry;
  const catalogue=astro.catalogue(STUDIO_SKY_CATALOGUE);
  const canvas=document.createElement('canvas');
  canvas.id='authSky';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const links=Array.from({length:8},()=>{
    const link=document.createElement('a');link.className='auth-sky-landmark';link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;document.body.append(link);return link;
  });
  const inspector=document.createElement('div');
  inspector.className='auth-sky-inspector';
  inspector.setAttribute('role','tooltip');
  inspector.hidden=true;
  inspector.innerHTML=`<div class="auth-sky-inspector-head"><div><div class="auth-sky-inspector-title"><span class="auth-sky-inspector-bayer"></span><span class="auth-sky-inspector-name"></span></div><div class="auth-sky-inspector-con"></div></div><span class="auth-sky-inspector-mag"></span></div><div class="auth-sky-inspector-grid"><div class="auth-sky-inspector-item"><span class="k">Спектральный класс:</span><span class="v"><span class="auth-sky-spect-dot"></span><span class="auth-sky-spect-val"></span></span></div><div class="auth-sky-inspector-item"><span class="k">Расстояние:</span><span class="v auth-sky-dist-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Индекс цвета B−V:</span><span class="v auth-sky-bv-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Каталог Hipparcos:</span><span class="v auth-sky-hip-val"></span></div><div class="auth-sky-inspector-coords"><span>Координаты (J2000):</span><span class="auth-sky-coords-val"></span></div></div><div class="auth-sky-inspector-desc"></div><div class="auth-sky-inspector-foot"><span>База данных SIMBAD</span><a class="auth-sky-inspector-simbad" target="_blank" rel="noopener noreferrer">Открыть в SIMBAD ↗</a></div>`;
  document.body.append(inspector);
  const inspBayer=inspector.querySelector('.auth-sky-inspector-bayer');
  const inspName=inspector.querySelector('.auth-sky-inspector-name');
  const inspCon=inspector.querySelector('.auth-sky-inspector-con');
  const inspMag=inspector.querySelector('.auth-sky-inspector-mag');
  const inspSpectDot=inspector.querySelector('.auth-sky-spect-dot');
  const inspSpectVal=inspector.querySelector('.auth-sky-spect-val');
  const inspDistVal=inspector.querySelector('.auth-sky-dist-val');
  const inspBvVal=inspector.querySelector('.auth-sky-bv-val');
  const inspHipVal=inspector.querySelector('.auth-sky-hip-val');
  const inspCoordsVal=inspector.querySelector('.auth-sky-coords-val');
  const inspDesc=inspector.querySelector('.auth-sky-inspector-desc');
  const inspSimbad=inspector.querySelector('.auth-sky-inspector-simbad');

  const starKnowledge={
    107556:{name:'Deneb Algedi',dist:'~39 св. лет',desc:'Ярчайшая звезда Козерога. Четырёхкратная звёздная система, главный компонент — затменно-переменная типа Алголя с периодом 24.5 часа.'},
    100064:{name:'Algedi',dist:'~106 св. лет (α²)',desc:'Знаменитая оптическая двойная звезда: пара несвязанных гравитационно жёлтых звёзд (α¹ на 690 св. л. и α² на 106 св. л.), различимых невооружённым глазом.'},
    100345:{name:'Dabih',dist:'~330 св. лет',desc:'Вторая по блеску звезда Козерога. Сложная кратная система из пяти компонентов: оранжевый яркий гигант с горячим голубым спутником.'},
    106985:{name:'Nashira',dist:'~139 св. лет',desc:'Химически пекулярная белая звезда типа Am с аномальным содержанием металлов в фотосфере.'},
    27989:{name:'Betelgeuse',dist:'~640 св. лет',desc:'Колоссальный красный сверхгигант. Если поместить его в центр Солнечной системы, его внешняя атмосфера поглотила бы орбиту Юпитера.'},
    24436:{name:'Rigel',dist:'~860 св. лет',desc:'Ярчайшая звезда Ориона и мощнейший голубой сверхгигант: светимость превосходит солнечную более чем в 120 000 раз.'},
    25336:{name:'Bellatrix',dist:'~250 св. лет',desc:'Голубой гигант-сверхгигант, третья по яркости звезда Ориона, отмечающая его левое плечо.'},
    27366:{name:'Saiph',dist:'~650 св. лет',desc:'Горячий сверхгигант спектрального класса B0.5Ia, завершающий нижний четырёхугольник Ориона.'},
    26727:{name:'Alnitak',dist:'~1260 св. лет',desc:'Восточная звезда Пояса Ориона, горячий голубой сверхгигант с близкой туманностью Конская Голова.'},
    26311:{name:'Alnilam',dist:'~2000 св. лет',desc:'Центральная звезда Пояса Ориона, мощный голубой сверхгигант с колоссальной светимостью.'},
    25930:{name:'Mintaka',dist:'~1200 св. лет',desc:'Западная звезда Пояса Ориона, кратная затменная система, расположенная практически точно на небесном экваторе.'},
    54061:{name:'Dubhe',dist:'~123 св. года',desc:'Вторая по блеску звезда Ковша. Вместе с Мераком указывает точное направление на Полярную звезду.'},
    53910:{name:'Merak',dist:'~79 св. лет',desc:'Белая звезда главной последовательности, указывающая путь к Полярной звезде.'},
    58001:{name:'Phecda',dist:'~83 св. года',desc:'Звезда нижнего левого угла Ковша, входит в движущуюся группу Большой Медведицы.'},
    59774:{name:'Megrez',dist:'~80 св. лет',desc:'Соединяет чашу Ковша с его рукоятью, наименее яркая из семи звёзд основного астеризма.'},
    62956:{name:'Alioth',dist:'~81 св. год',desc:'Ярчайшая звезда Большой Медведицы с аномально сильным магнитным полем и переменным блеском.'},
    65378:{name:'Mizar',dist:'~83 св. года',desc:'Знаменитая визуальная двойная звезда (Мицар и Алькор) — древнейший тест на остроту зрения.'},
    67301:{name:'Alkaid',dist:'~104 св. года',desc:'Крайняя звезда рукояти Ковша, горячая голубая звезда, не входящая в ассоциацию UMa.'},
    11767:{name:'Polaris',dist:'~433 св. года',desc:'Северная Полярная звезда, жёлтый сверхгигант и классическая цефеида, указывающая на Северный полюс мира.'},
    32349:{name:'Sirius',dist:'~8.6 св. лет',desc:'Ярчайшая звезда ночного неба Земли. Белая звезда главной последовательности с белым карликом-спутником.'},
    91262:{name:'Vega',dist:'~25 св. лет',desc:'Главная звезда Лиры и Летнего треугольника; фотометрический эталон нулевой звёздной величины.'},
    97649:{name:'Altair',dist:'~16.7 св. лет',desc:'Быстровращающаяся сплюснутая белая звезда, вершина Летне-осеннего треугольника.'},
    102098:{name:'Deneb',dist:'~2600 св. лет',desc:'Белый сверхгигант в созвездии Лебедя, одна из самых далёких звёзд первой величины.'},
    69673:{name:'Arcturus',dist:'~36.7 св. лет',desc:'Ярчайшая звезда северного полушария, оранжевый гигант с быстрым собственным движением.'},
    21421:{name:'Aldebaran',dist:'~65 св. лет',desc:'Оранжевый гигант, «глаз» Тельца, проецирующийся на звёздное скопление Гиады.'},
    80763:{name:'Antares',dist:'~550 св. лет',desc:'Красный сверхгигант, «сердце» Скорпиона, соперничающий цветом и яркостью с Марсом.'},
    65474:{name:'Spica',dist:'~250 св. лет',desc:'Ярчайшая звезда Девы, тесная спектрально-двойная система из двух горячих гигантов.'},
    37826:{name:'Pollux',dist:'~34 св. года',desc:'Оранжевый гигант в Близнецах, обладающий подтверждённой экзопланетой.'},
    36850:{name:'Castor',dist:'~51 св. год',desc:'Уникальная шестикратная звёздная система из трёх пар спектрально-двойных звёзд.'},
    24608:{name:'Capella',dist:'~43 св. года',desc:'Ярчайшая звезда Возничего, четверная система с парой жёлтых гигантов-сверхгигантов.'},
    49669:{name:'Regulus',dist:'~79 св. лет',desc:'«Сердце Льва», быстровращающийся сплюснутый голубовато-белый субгигант.'},
    113368:{name:'Fomalhaut',dist:'~25 св. лет',desc:'Молодая звезда с гигантским околозвёздным пылевым диском и планетной системой.'},
    60718:{name:'Acrux',dist:'~320 св. лет',desc:'Ярчайшая звезда созвездия Южный Крест, кратная система из горячих звёзд класса B.'},
    7588:{name:'Achernar',dist:'~139 св. лет',desc:'Самая сплюснутая звезда Млечного Пути из-за рекордной скорости экваториального вращения.'},
    30438:{name:'Canopus',dist:'~310 св. лет',desc:'Вторая по яркости звезда ночного неба Земли, желтовато-белый яркий гигант.'},
    37279:{name:'Procyon',dist:'~11.5 св. лет',desc:'Желтовато-белый субгигант в Малом Псе с тусклым спутником — белым карликом.'}
  };

  function formatCoords(raDeg,decDeg){
    if(!Number.isFinite(raDeg)||!Number.isFinite(decDeg))return '—';
    let totalSec=Math.round((((raDeg/15)%24+24)%24)*3600)%86400;
    const h=Math.floor(totalSec/3600);
    totalSec%=3600;
    const m=Math.floor(totalSec/60),s=totalSec%60;
    const sign=decDeg>=0?'+':'−';
    let totalArcsec=Math.round(Math.abs(decDeg)*3600);
    const d=Math.floor(totalArcsec/3600);
    totalArcsec%=3600;
    const dm=Math.floor(totalArcsec/60),ds=totalArcsec%60;
    return `${h}ʰ ${String(m).padStart(2,'0')}ᵐ ${String(s).padStart(2,'0')}ˢ / ${sign}${d}° ${String(dm).padStart(2,'0')}′ ${String(ds).padStart(2,'0')}″`;
  }

  function spectralColor(spect,bv){
    const s=(spect||'').toUpperCase();
    if(s.startsWith('O'))return '#9db4ff';
    if(s.startsWith('B'))return '#bbccff';
    if(s.startsWith('A'))return '#f8f9ff';
    if(s.startsWith('F'))return '#ffffed';
    if(s.startsWith('G'))return '#fff4e8';
    if(s.startsWith('K'))return '#ffd2a1';
    if(s.startsWith('M'))return '#ffad51';
    if(bv!==null&&bv!==undefined){
      if(bv<0)return '#bbccff';
      if(bv<0.3)return '#f8f9ff';
      if(bv<0.6)return '#ffffed';
      if(bv<0.8)return '#fff4e8';
      if(bv<1.4)return '#ffd2a1';
      return '#ffad51';
    }
    return '#f8f9ff';
  }

  function starFallbackDesc(star,conName){
    const s=(star.spect||'').toUpperCase();
    let type='Звезда';
    if(s.startsWith('O'))type='Горячий голубой сверхгигант';
    else if(s.startsWith('B'))type='Голубая звезда спектрального класса B';
    else if(s.startsWith('A'))type='Белая звезда главной последовательности';
    else if(s.startsWith('F'))type='Жёлто-белая субгигантная звезда';
    else if(s.startsWith('G'))type='Жёлтая звезда солнечного типа';
    else if(s.startsWith('K'))type='Оранжевый гигант спектрального класса K';
    else if(s.startsWith('M'))type='Красный гигант спектрального класса M';
    const hipText=star.hip?` Зарегистрирована в каталоге Hipparcos как HIP ${star.hip}.`:'';
    return `${type} в созвездии ${conName||'неба'} с видимым блеском ${star.mag!==null?star.mag.toFixed(2)+'m':'—'}.${hipText} Доступна подробная астрометрия в базе SIMBAD.`;
  }
  const brightness=Object.freeze({background:20,constellation:100});
  const constellationScale=2;
  const skyPan={x:0,y:0};let touch=null;
  function pan(event,dx,dy){
    if(!document.body.matches('.guest-home,.guest-auth')||event.target.closest('input,textarea,select'))return;
    const form=event.target.closest('#accountBody');
    if(form&&form.scrollHeight>form.clientHeight+1)return;
    event.preventDefault();skyPan.x=(skyPan.x+dx)%(innerWidth+12);skyPan.y=(skyPan.y+dy)%(innerHeight+12);
    if(motion.matches)redraw?.();
  }
  addEventListener('wheel',e=>pan(e,e.deltaX,e.deltaY),{passive:false});
  addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  addEventListener('touchmove',e=>{if(touch&&e.touches.length===1){const p=e.touches[0];pan(e,touch.x-p.clientX,touch.y-p.clientY);touch={x:p.clientX,y:p.clientY};}},{passive:false});
  let redraw=null,refreshText=null,frozen=null;
  let recent=[];
  try{recent=JSON.parse(sessionStorage.getItem('lumiscia-catalogue-sky-recent')||'[]');if(!Array.isArray(recent))recent=[];}catch{}
  function next(){
    const history=recent.slice(-Math.min(12,catalogue.length-1));
    const pool=catalogue.filter(c=>!history.includes(c.abbr));
    const c=pool[Math.floor(Math.random()*pool.length)];
    recent=[...history,c.abbr];
    try{sessionStorage.setItem('lumiscia-catalogue-sky-recent',JSON.stringify(recent));}catch{}
    return c;
  }
  function uiBoxes(mode){
    const brand=mode==='home'?'#home .studio-brand':'#account .auth-brand';
    const roots=[...document.querySelectorAll(brand+','+(mode==='home'?'#homeAuth':'#accountBody')+',.site-copyright')];
    return roots
      .map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,element:n.id?'#'+n.id:'.'+[...n.classList].join('.')};}).filter(r=>r.width&&r.height);
  }
  function textBoxes(mode){
    const result=[];
    for(const root of document.querySelectorAll((mode==='home'?'#homeAuth,#home .brand-copy':'#accountBody,#account .brand-copy')+',.site-copyright')){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        if(!walker.currentNode.textContent.trim())continue;
        const node=walker.currentNode,range=document.createRange();
        if(root.matches('.brand-copy')){
          for(let i=0;i<node.length;i++)if(node.textContent[i].trim()){
            range.setStart(node,i);range.setEnd(node,i+1);
            result.push(...[...range.getClientRects()].map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,tight:true})));
          }
        }else{range.selectNodeContents(node);result.push(...range.getClientRects());}
      }
      for(const input of root.querySelectorAll('input')){
        const r=input.getBoundingClientRect();if(!r.width||!r.height)continue;
        const css=getComputedStyle(input),text=input.type==='password'&&input.value?'•'.repeat(input.value.length):input.value||input.placeholder;
        if(!text)continue;ctx.font=css.font;
        const left=r.left+parseFloat(css.paddingLeft),top=r.top+(r.height-parseFloat(css.fontSize))/2;
        result.push({left,top,right:Math.min(r.right-8,left+ctx.measureText(text).width+4),bottom:top+parseFloat(css.fontSize)+3});
      }
    }
    return result.filter(r=>r.right>r.left&&r.bottom>r.top).map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,tight:!!r.tight}));
  }
  function start(mode,boxes){
    const w=innerWidth,h=innerHeight,ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    canvas.dataset.skyProjection='gnomonic-j2000';
    canvas.dataset.skyFlybyCount='0';
    const pad=r=>({left:r.left-4,right:r.right+4,top:r.top-4,bottom:r.bottom+4,element:r.element});
    const uiRects=boxes.map(pad);
    const obstacles=[];
    let labels=[],frameId=0,stopped=false,lastTime=null,clock=0;
    const delay=()=>geometry.flybyDelay()*(mode==='home'?2+Math.random()*3:1);
    const firstDelay=delay();let flybys=[],nextFlybyAt=performance.now()+firstDelay;
    canvas.dataset.skyFlybyDelay=String(firstDelay);
    let textRects=textBoxes(mode);
    refreshText=()=>{textRects=textBoxes(mode);if(motion.matches)redraw?.();};
    const logoRects=[...document.querySelectorAll(mode==='home'?'#home .studio-brand .brand-mark':'#account .auth-brand .brand-mark')].map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height).map(pad);
    const backgroundObstacles=logoRects.map(r=>geometry.shape((r.left+r.right)/2,(r.top+r.bottom)/2,(r.right-r.left)/2,(r.bottom-r.top)/2,'rounded'));
    const inside=p=>obstacles.some(o=>geometry.contains(p,o.points));
    const labelContains=p=>labels.some(b=>p.x>b.left-4&&p.x<b.right+4&&p.y>b.top-4&&p.y<b.bottom+4);
    const starBlocked=(p,r=8)=>logoRects.some(b=>astro.intersects(b,{left:p.x-r,right:p.x+r,top:p.y-r,bottom:p.y+r}))||labelContains(p);
    function safePoint(background=false){
      for(let i=0;i<120;i++){const p={x:12+Math.random()*Math.max(1,w-24),y:12+Math.random()*Math.max(1,h-24)};if((background||!inside(p))&&!starBlocked(p))return p;}
      return {x:-40,y:-40};
    }
    for(const r of uiRects)obstacles.push(geometry.shape((r.left+r.right)/2,(r.top+r.bottom)/2,(r.right-r.left)/2,(r.bottom-r.top)/2,'rounded'));
    const ambient=Array.from({length:Math.min(340,Math.max(160,Math.round(w*h/3500)))},()=>{
      const p=safePoint(true),a=Math.random()*Math.PI*2,speed=.015+Math.random()*.04;
      return {...p,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,speed,radius:.25+Math.random()*1.05,phase:Math.random()*Math.PI*2};
    });
    const wanderers=Array.from({length:16},()=>{
      const a=Math.random()*Math.PI*2,speed=.025+Math.random()*.06;
      return {...safePoint(true),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,speed,radius:1.15+Math.random()*.65,phase:Math.random()*Math.PI*2};
    });
    const layoutIssues=new Map();
    function chooseLayout(c){
      const measure=(text,size=12)=>{ctx.font=size+'px Georgia,serif';return ctx.measureText(text).width;};
      const result=astro.fitFigure(c,w,h,uiRects,measure,constellationScale);
      if(result.diagnostic.placed&&!result.diagnostic.interfaceLimited)layoutIssues.delete(c.abbr);else layoutIssues.set(c.abbr,result.diagnostic);
      canvas.dataset.skyLayoutIssues=JSON.stringify([...layoutIssues.values()]);
      canvas.dataset.skyFigureSize=String(result.diagnostic.size||0);
      return result.layout;
    }
    let current=frozen?.constellation||next(),previous=null,layout=chooseLayout(current),slots=[],phase=frozen?'hold':'gather',phaseStart=performance.now();
    let inspected=null,pinned=false;
    function hideInspector(){
      inspected=null;pinned=false;
      inspector.classList.remove('active');
      inspector.hidden=true;
    }
    function showInspector(star,slot,isPinned=false){
      inspected={star,slot};
      if(isPinned)pinned=true;
      const bayer=star.bayer||'';
      inspBayer.textContent=bayer;
      inspBayer.hidden=!bayer;
      inspName.textContent=star.name||(star.hip?'HIP '+star.hip:'Звезда');
      inspCon.textContent=(current.name||'')+(current.genitive?` (${current.genitive})`:'');
      inspMag.textContent=(star.mag!==null&&Number.isFinite(star.mag))?star.mag.toFixed(2)+'m':'—';
      const spect=star.spect||'';
      inspSpectVal.textContent=spect||'—';
      inspSpectDot.style.backgroundColor=spectralColor(spect,star.bv);
      const curated=starKnowledge[star.hip]||(star.id&&starKnowledge[star.id])||null;
      inspDistVal.textContent=(curated&&curated.dist)?curated.dist:(star.hip?'SIMBAD / Gaia DR3':'—');
      inspBvVal.textContent=(star.bv!==null&&Number.isFinite(star.bv))?(star.bv>=0?'+':'')+star.bv.toFixed(2):'—';
      inspHipVal.textContent=star.hip?'HIP '+star.hip:'—';
      inspCoordsVal.textContent=formatCoords(star.ra,star.dec);
      inspDesc.textContent=(curated&&curated.desc)?curated.desc:starFallbackDesc(star,current.name);
      const ident=star.hip?'HIP '+star.hip:(star.name||star.id);
      inspSimbad.href='https://simbad.cds.unistra.fr/simbad/sim-id?Ident='+encodeURIComponent(ident);
      inspector.hidden=false;
      const cardW=280,cardH=inspector.offsetHeight||220,margin=14;
      let left=slot.x+22,top=slot.y-30;
      if(left+cardW>w-margin)left=slot.x-cardW-22;
      const overlaps=r=>uiRects.some(u=>!(r.right<u.left||r.left>u.right||r.bottom<u.top||r.top>u.bottom));
      if(overlaps({left,right:left+cardW,top,bottom:top+cardH})){
        const altLeft=(left>slot.x)?(slot.x-cardW-22):(slot.x+22);
        if(!overlaps({left:altLeft,right:altLeft+cardW,top,bottom:top+cardH}))left=altLeft;
      }
      if(left<margin)left=margin;
      if(left+cardW>w-margin)left=w-cardW-margin;
      if(top<margin)top=margin;
      if(top+cardH>h-margin)top=h-cardH-margin;
      inspector.style.left=Math.round(left)+'px';
      inspector.style.top=Math.round(top)+'px';
      inspector.classList.add('active');
    }
    const durations={gather:15000,hold:8000,morph:18000};
    function target(nextLayout){
      labels=[];links.forEach(n=>n.hidden=true);
      const count=Math.max(slots.length,nextLayout?.stars.length||0),old=slots;
      slots=Array.from({length:count},(_,i)=>{
        const to=nextLayout?.stars[i],from=old[i]||{...safePoint(),opacity:0,mag:to?.mag??6};
        const end=to||{x:from.x,y:from.y,mag:from.mag};
        return {from:{x:from.x,y:from.y},end:{x:end.x,y:end.y},x:from.x,y:from.y,opacity:from.opacity,
          fromOpacity:from.opacity,toOpacity:to?1:0,fromMag:from.mag??6,mag:end.mag??6,bv:to?.bv??null,path:[from,end]};
      });
    }
    target(layout);
    if(frozen)labels=layout?.labels||[];
    let freezeTimer=0;
    function pauseReturn(){
      clearTimeout(freezeTimer);
      if(frozen)frozen.resumeAt=null;
    }
    function resumeReturn(){
      if(!frozen||document.hidden||!document.hasFocus())return;
      if(frozen.resumeAt===null)frozen.resumeAt=performance.now()+5000;
      clearTimeout(freezeTimer);
      freezeTimer=setTimeout(()=>{
        if(stopped||!frozen)return;
        if(document.hidden||!document.hasFocus()){pauseReturn();return;}
        frozen=null;advance(performance.now());
        if(motion.matches){phase='hold';labels=layout?.labels||[];phaseStart=performance.now()-2000;render(performance.now());}
      },Math.max(0,frozen.resumeAt-performance.now()));
    }
    function freezeFigure(){
      frozen={constellation:current,at:performance.now(),resumeAt:null};
      resumeReturn();
      if(motion.matches)render(performance.now());
    }
    const onVisibility=()=>{if(document.hidden)pauseReturn();else resumeReturn();};
    const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
    function advance(now){
      hideInspector();
      if(phase==='hold'){
        previous=current;current=next();layout=chooseLayout(current);phase='morph';target(layout);
      }else{phase='hold';labels=layout?.labels||[];}
      phaseStart=now;
    }
    function dot(x,y,r,alpha,color,glow=true,gain=brightness.constellation,maxGlow=Infinity,spikes=0){
      if(alpha<=0||x<0||y<0||x>w||y>h||starBlocked({x,y},glow?Math.min(r*4,maxGlow):r))return;
      const exposed=astro.exposedAlpha(alpha,gain);
      if(glow){
        const haloFactor=gain===brightness.constellation?7.2:4;
        const radius=Math.max(Number.EPSILON,Math.min(r*haloFactor,maxGlow)),g=ctx.createRadialGradient(x,y,0,x,y,radius);
        if(gain===brightness.constellation){
          g.addColorStop(0,'rgba('+color+','+(exposed*.38)+')');
          g.addColorStop(.25,'rgba('+color+','+(exposed*.16)+')');
          g.addColorStop(.65,'rgba('+color+','+(exposed*.04)+')');
          g.addColorStop(1,'rgba('+color+',0)');
        }else{
          g.addColorStop(0,'rgba('+color+','+astro.exposedAlpha(alpha*.24,gain)+')');
          g.addColorStop(1,'rgba('+color+',0)');
        }
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
      }
      if(spikes>0){
        const spikeLen=Math.min(spikes,maxGlow*.85);
        ctx.save();
        ctx.strokeStyle='rgba(255,255,255,'+(exposed*.75)+')';ctx.lineWidth=Math.max(.6,Math.min(1,r*.35));
        ctx.beginPath();
        ctx.moveTo(x-spikeLen,y);ctx.lineTo(x+spikeLen,y);
        ctx.moveTo(x,y-spikeLen);ctx.lineTo(x,y+spikeLen);
        ctx.stroke();
        ctx.strokeStyle='rgba('+color+','+(exposed*.28)+')';ctx.lineWidth=Math.max(1.2,Math.min(2,r*.7));
        ctx.beginPath();
        ctx.moveTo(x-spikeLen*.75,y);ctx.lineTo(x+spikeLen*.75,y);
        ctx.moveTo(x,y-spikeLen*.75);ctx.lineTo(x,y+spikeLen*.75);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle='rgba('+color+','+exposed+')';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      if(gain===brightness.constellation&&r>=1){
        ctx.fillStyle='rgba(255,255,255,'+exposed+')';ctx.beginPath();ctx.arc(x,y,Math.max(.7,r*.65),0,Math.PI*2);ctx.fill();
      }
    }
    function drift(s,delta){
      if(motion.matches)return;
      const near=geometry.nearest(s,backgroundObstacles);
      if(near.distance<42){const force=Math.max(0,(42-near.distance)/42)*.016*delta;s.vx+=near.nx*force;s.vy+=near.ny*force;}
      const speed=Math.hypot(s.vx,s.vy)||1;s.vx=s.vx/speed*s.speed;s.vy=s.vy/speed*s.speed;
      s.x=(s.x+s.vx*delta+w+12)%(w+12);s.y=(s.y+s.vy*delta+h+12)%(h+12);
    }
    function drawLines(c,alpha){
      if(!c||alpha<.01)return;
      ctx.strokeStyle='rgba(197,168,104,'+alpha+')';ctx.lineWidth=.8;
      for(const [a,b] of c.lines){
        const p=slots[a],q=slots[b];
        if(!p||!q)continue;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
      }
    }
    function render(now){
      if(stopped)return;
      const delta=lastTime===null?1:Math.min(3,(now-lastTime)/16.6667);lastTime=now;clock+=delta;
      const phaseNow=frozen?frozen.at:now;
      if(!frozen&&!motion.matches&&now-phaseStart>durations[phase])advance(now);
      const t=phase==='hold'?1:ease(Math.min(1,(phaseNow-phaseStart)/durations[phase]));
      canvas.dataset.skyPhase=phase;canvas.dataset.skyConstellation=current.abbr;
      canvas.dataset.skyFrozen=String(!!frozen);
      canvas.dataset.skyScale=String(constellationScale);
      canvas.dataset.skyBackgroundBrightness=String(brightness.background);
      canvas.dataset.skyConstellationBrightness=String(brightness.constellation);
      ctx.clearRect(0,0,w,h);
      ctx.save();
      const background=s=>({x:((s.x-skyPan.x)%(w+12)+w+12)%(w+12),y:((s.y-skyPan.y)%(h+12)+h+12)%(h+12)});
      for(const s of ambient){drift(s,delta);const p=background(s);if(s.phase%1<.12&&uiRects.some(r=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom))continue;dot(p.x,p.y,s.radius,(Math.sin(clock*.004+s.phase)*.3+.7)*.25,'200,220,240',false,brightness.background);}
      for(const s of wanderers){drift(s,delta);const p=background(s);dot(p.x,p.y,s.radius,(Math.sin(clock*.004+s.phase)*.25+.75)*.3,'255,245,210',true,brightness.background);}
      if(!motion.matches&&now>=nextFlybyAt){
        const count=Math.random()<.5?1:2,interval=delay();
        const route=geometry.router(obstacles);
        flybys=Array.from({length:count},()=>{const s=geometry.flyby(w,h);if(mode==='home'){s.path=route(s.path[0],s.path.at(-1));s.duration*=3+Math.random()*2;}return {...s,started:now};}).filter(s=>Math.hypot(s.path.at(-1).x-s.path[0].x,s.path.at(-1).y-s.path[0].y)>1);
        nextFlybyAt=now+interval;canvas.dataset.skyFlybyCount=String(count);canvas.dataset.skyFlybyDelay=String(interval);
      }
      flybys=flybys.filter(s=>now-s.started<s.duration);
      for(const s of flybys){
        const progress=(now-s.started)/s.duration;
        for(let i=8;i>=0;i--){
          const p=geometry.point(s.path,Math.max(0,progress-i*.007));
          dot(p.x,p.y,s.radius*(1-i*.06),s.alpha*(1-i/9), '245,245,235',i===0,brightness.background);
        }
      }
      ctx.save();
      if(phase==='hold')for(const r of uiRects){ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(r.left,r.top,r.right-r.left,r.bottom-r.top);ctx.clip('evenodd');}
      for(const slot of slots){
        Object.assign(slot,geometry.point(slot.path,t));slot.opacity=slot.fromOpacity+(slot.toOpacity-slot.fromOpacity)*t;
        const mag=slot.fromMag+(slot.mag-slot.fromMag)*t,style=astro.appearance(mag,slot.bv);
        const spacing=phase==='hold'?(layout?.stars[slots.indexOf(slot)]?.spacing??Infinity):Infinity;
        const shimmer=motion.matches?1:(.94+.08*Math.sin(clock*.003+slot.x*.05+slot.y*.05));
        const flux=Math.pow(10,-.4*mag);
        const spikeLen=mag<=3.5?Math.max(5,Math.min(Math.min(28,style.radius*5.5*.75*Math.pow(flux,.15)),spacing*.38)):0;
        dot(slot.x,slot.y,Math.min(style.radius,spacing*.28),style.alpha*slot.opacity*shimmer,style.color,true,brightness.constellation,spacing*.65,spikeLen);
      }
      if(phase==='morph')drawLines(previous,.18*(1-t));
      drawLines(current,.18*t);
      if(inspected&&phase==='hold'&&inspected.slot&&inspected.slot.opacity>.5){
        const is=inspected.slot,pulse=motion.matches?1:(.85+.15*Math.sin(clock*.06)),ringR=13;
        ctx.save();
        ctx.strokeStyle='rgba(229,207,152,'+(.85*pulse)+')';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(is.x,is.y,ringR,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='rgba(255,216,133,'+(.9*pulse)+')';ctx.lineWidth=1;
        const tl=4;
        ctx.beginPath();
        ctx.moveTo(is.x-ringR-tl,is.y);ctx.lineTo(is.x-ringR+1,is.y);
        ctx.moveTo(is.x+ringR-1,is.y);ctx.lineTo(is.x+ringR+tl,is.y);
        ctx.moveTo(is.x,is.y-ringR-tl);ctx.lineTo(is.x,is.y-ringR+1);
        ctx.moveTo(is.x,is.y+ringR-1);ctx.lineTo(is.x,is.y+ringR+tl);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      // Protect branding and glyphs, not the transparent backgrounds of controls.
      for(const b of [...logoRects,...labels])ctx.clearRect(b.left-1,b.top-1,b.right-b.left+2,b.bottom-b.top+2);
      for(const r of textRects){const pad=r.tight?0:2;ctx.clearRect(r.left-pad,r.top-(r.tight?0:1),r.right-r.left+pad*2,r.bottom-r.top+(r.tight?0:2));}
      ctx.restore();
      links.forEach((link,i)=>{
        const b=labels[i];link.hidden=!b;
        if(!b)return;
        link.className=b.star.caption?'auth-sky-caption auth-sky-title':b.star.primary?'auth-sky-landmark auth-sky-primary':b.star.alpha?'auth-sky-landmark auth-sky-alpha':'auth-sky-landmark';
        if(b.star.caption){
          if(link.dataset.caption!==b.star.label){
            const name=document.createElement('span');name.className='auth-sky-name';name.textContent=b.star.label;link.replaceChildren(name);link.dataset.caption=b.star.label;
          }
          link.title=b.star.label;
        }else{link.textContent=b.star.label;delete link.dataset.caption;link.title=b.star.label;}
        link.href=b.star.caption?'https://www.go-astronomy.com/constellations.php?Name='+encodeURIComponent(current.name):'https://simbad.cds.unistra.fr/simbad/sim-id?Ident='+encodeURIComponent(b.star.hip?'HIP '+b.star.hip:(b.star.name||b.star.label));
        link.style.left=b.left+'px';link.style.top=b.top+'px';link.style.width=(b.right-b.left)+'px';link.style.height=(b.bottom-b.top)+'px';
        const elapsed=phaseNow-phaseStart;link.style.opacity=motion.matches||frozen?'1':String(ease(Math.min(1,elapsed/1500))*(1-ease(Math.max(0,(elapsed-(durations.hold-1800))/1800))));
      });
      if(!motion.matches)frameId=requestAnimationFrame(render);
    }
    function findStar(clientX,clientY){
      if(phase!=='hold'||uiRects.some(r=>clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom))return null;
      const len=Math.min(slots.length,current.stars.length);
      for(let i=0;i<len;i++){
        const s=slots[i];
        if(s.opacity<.5)continue;
        if(Math.hypot(s.x-clientX,s.y-clientY)<20)return {star:current.stars[i],slot:s,index:i};
      }
      return null;
    }
    function starFromLandmark(targetNode){
      const landmark=targetNode?.closest('.auth-sky-landmark');
      if(!landmark)return null;
      const idx=links.indexOf(landmark);
      if(idx!==-1&&labels[idx]&&labels[idx].star&&!labels[idx].star.caption){
        const sIdx=current.stars.findIndex(s=>s.hip===labels[idx].star.hip||s.name===labels[idx].star.name);
        if(sIdx!==-1)return {star:current.stars[sIdx],slot:slots[sIdx],index:sIdx};
      }
      return null;
    }
    function hit(event){
      if(phase!=='hold'||event.target.closest('a,button,input,form,select,textarea'))return false;
      return !!findStar(event.clientX,event.clientY);
    }
    const onMove=event=>{
      if(inspector.contains(event.target))return;
      const target=findStar(event.clientX,event.clientY)||starFromLandmark(event.target);
      canvas.classList.toggle('sky-hover',!!target);
      if(!pinned){
        if(target){
          showInspector(target.star,target.slot,false);
          if(motion.matches)redraw?.();
        }else if(!event.target.closest('.auth-sky-inspector')){
          hideInspector();
          if(motion.matches)redraw?.();
        }
      }
    };
    const onClick=event=>{
      if(event.defaultPrevented||event.button!==0||inspector.contains(event.target))return;
      const caption=event.target.closest('.auth-sky-title');
      if(caption){freezeFigure();return;}
      const target=findStar(event.clientX,event.clientY)||starFromLandmark(event.target);
      if(target){
        freezeFigure();
        showInspector(target.star,target.slot,true);
        if(motion.matches)redraw?.();
      }else if(!event.target.closest('.auth-sky-inspector,.auth-sky-landmark')){
        hideInspector();
        if(motion.matches)redraw?.();
      }
    };
    const onTouchEnd=event=>{
      if(!event.changedTouches||event.changedTouches.length!==1||inspector.contains(event.target))return;
      const t=event.changedTouches[0];
      const target=findStar(t.clientX,t.clientY)||starFromLandmark(event.target);
      if(target){
        freezeFigure();
        showInspector(target.star,target.slot,true);
        if(motion.matches)redraw?.();
      }else if(!event.target.closest('.auth-sky-inspector,.auth-sky-landmark')){
        hideInspector();
        if(motion.matches)redraw?.();
      }
    };
    window.addEventListener('click',onClick);window.addEventListener('mousemove',onMove);
    window.addEventListener('touchend',onTouchEnd,{passive:true});
    window.addEventListener('blur',pauseReturn);window.addEventListener('focus',resumeReturn);document.addEventListener('visibilitychange',onVisibility);
    resumeReturn();
    redraw=()=>render(performance.now());
    if(motion.matches){phase='hold';labels=layout?.labels||[];phaseStart=performance.now()-2000;render(performance.now());}
    else frameId=requestAnimationFrame(render);
    return ()=>{stopped=true;redraw=null;refreshText=null;cancelAnimationFrame(frameId);clearTimeout(freezeTimer);canvas.classList.remove('sky-hover');links.forEach(n=>n.hidden=true);hideInspector();window.removeEventListener('click',onClick);window.removeEventListener('mousemove',onMove);window.removeEventListener('touchend',onTouchEnd);window.removeEventListener('blur',pauseReturn);window.removeEventListener('focus',resumeReturn);document.removeEventListener('visibilitychange',onVisibility);};
  }
  let stop=null,lifecycle='';
  function sync(){
    const mode=document.body.matches('.guest-home')?'home':document.body.matches('.guest-auth')?'account':'';
    const boxes=mode?uiBoxes(mode):[],key=JSON.stringify([mode,innerWidth,innerHeight,boxes,motion.matches]);
    if(key===lifecycle){refreshText?.();return;}lifecycle=key;stop?.();stop=null;canvas.hidden=!mode;
    if(mode)stop=start(mode,boxes);else frozen=null;
  }
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  const observer=new ResizeObserver(sync);['home','account'].forEach(id=>{const node=document.getElementById(id);if(node)observer.observe(node);});
  const account=document.getElementById('accountBody');
  if(account)new MutationObserver(()=>{account.querySelectorAll('.auth-providers .auth-google').forEach(button=>{const name=button.textContent.trim();if(name){button.title=name;button.setAttribute('aria-label',name);}});sync();}).observe(account,{childList:true,subtree:true});
  addEventListener('resize',sync);addEventListener('scroll',sync,{passive:true});document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);sync();
  document.fonts?.addEventListener('loadingdone',sync);
  document.addEventListener('input',sync);
  document.addEventListener('click',event=>{if(event.target.closest('[data-auth-password]'))queueMicrotask(sync);});
  document.getElementById('accountBody')?.addEventListener('scroll',sync,{passive:true});
})();
