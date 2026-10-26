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
  inspector.innerHTML=`<div class="auth-sky-inspector-head"><div><div class="auth-sky-inspector-title"><span class="auth-sky-inspector-bayer"></span><span class="auth-sky-inspector-name"></span></div><div class="auth-sky-inspector-bayer-latin"></div><div class="auth-sky-inspector-con"></div></div><span class="auth-sky-inspector-mag"></span></div><div class="auth-sky-inspector-hemi-cluster"><div class="auth-sky-inspector-row"><span class="k">Celestial Hemisphere:</span><span class="v auth-sky-hemi-val"></span></div><div class="auth-sky-inspector-row auth-sky-cluster-row"><span class="k">Star Cluster:</span><span class="v auth-sky-cluster-val"></span></div></div><div class="auth-sky-inspector-grid"><div class="auth-sky-inspector-item"><span class="k">Distance:</span><span class="v auth-sky-dist-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Luminosity:</span><span class="v auth-sky-lum-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Spectral Class:</span><span class="v"><span class="auth-sky-spect-dot"></span><span class="auth-sky-spect-val"></span></span></div><div class="auth-sky-inspector-item"><span class="k">Temperature:</span><span class="v auth-sky-temp-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Color Index (B−V):</span><span class="v auth-sky-bv-val"></span></div><div class="auth-sky-inspector-item"><span class="k">System Type:</span><span class="v auth-sky-sys-val"></span></div><div class="auth-sky-inspector-coords"><span class="auth-sky-coords-val"></span><span class="auth-sky-hip-val"></span></div></div><div class="auth-sky-temp-bar-container"><div class="auth-sky-temp-labels"><span>3,000 K</span><span class="auth-sky-temp-bar-val"></span><span>15,000+ K</span></div><div class="auth-sky-temp-bar"><div class="auth-sky-temp-needle"></div></div></div><div class="auth-sky-inspector-desc"></div><div class="auth-sky-inspector-foot"><span>SIMBAD Database</span><a class="auth-sky-inspector-simbad" target="_blank" rel="noopener noreferrer">Open in SIMBAD ↗</a></div>`;
  document.body.append(inspector);
  const inspBayer=inspector.querySelector('.auth-sky-inspector-bayer');
  const inspName=inspector.querySelector('.auth-sky-inspector-name');
  const inspBayerLatin=inspector.querySelector('.auth-sky-inspector-bayer-latin');
  const inspCon=inspector.querySelector('.auth-sky-inspector-con');
  const inspMag=inspector.querySelector('.auth-sky-inspector-mag');
  const inspHemiVal=inspector.querySelector('.auth-sky-hemi-val');
  const inspClusterVal=inspector.querySelector('.auth-sky-cluster-val');
  const inspDistVal=inspector.querySelector('.auth-sky-dist-val');
  const inspLumVal=inspector.querySelector('.auth-sky-lum-val');
  const inspSpectDot=inspector.querySelector('.auth-sky-spect-dot');
  const inspSpectVal=inspector.querySelector('.auth-sky-spect-val');
  const inspTempVal=inspector.querySelector('.auth-sky-temp-val');
  const inspBvVal=inspector.querySelector('.auth-sky-bv-val');
  const inspSysVal=inspector.querySelector('.auth-sky-sys-val');
  const inspCoordsVal=inspector.querySelector('.auth-sky-coords-val');
  const inspHipVal=inspector.querySelector('.auth-sky-hip-val');
  const inspTempBarVal=inspector.querySelector('.auth-sky-temp-bar-val');
  const inspTempNeedle=inspector.querySelector('.auth-sky-temp-needle');
  const inspDesc=inspector.querySelector('.auth-sky-inspector-desc');
  const inspSimbad=inspector.querySelector('.auth-sky-inspector-simbad');

  const greekNames={
    'α':'Alpha','β':'Beta','γ':'Gamma','δ':'Delta','ε':'Epsilon','ζ':'Zeta','η':'Eta',
    'θ':'Theta','ι':'Iota','κ':'Kappa','λ':'Lambda','μ':'Mu','ν':'Nu','ξ':'Xi',
    'ο':'Omicron','π':'Pi','ρ':'Rho','σ':'Sigma','τ':'Tau','υ':'Upsilon','φ':'Phi',
    'χ':'Chi','ψ':'Psi','ω':'Omega'
  };

  const conGenitives={
    Cap:'Capricorni',Tau:'Tauri',Ori:'Orionis',UMa:'Ursae Majoris',UMi:'Ursae Minoris',
    Cyg:'Cygni',Lyr:'Lyrae',Aql:'Aquilae',Leo:'Leonis',Sco:'Scorpii',Vir:'Virginis',
    Gem:'Geminorum',Aur:'Aurigae',Cru:'Crucis',Cas:'Cassiopeiae',Per:'Persei',
    And:'Andromedae',Peg:'Pegasi',Cen:'Centauri',Boo:'Boötis',CMa:'Canis Majoris',
    CMi:'Canis Minoris',Eri:'Eridani',Car:'Carinae',Psc:'Piscium'
  };

  const starClusters={
    17702:'Pleiades (M45)',17499:'Pleiades (M45)',17573:'Pleiades (M45)',
    17847:'Pleiades (M45)',17743:'Pleiades (M45)',17900:'Pleiades (M45)',
    17776:'Pleiades (M45)',17489:'Pleiades (M45)',
    20889:'Hyades (Mel 25)',20894:'Hyades (Mel 25)',20205:'Hyades (Mel 25)',
    20455:'Hyades (Mel 25)',21421:'Hyades (Foreground)',
    24436:'Orion OB1',25336:'Orion OB1',27366:'Orion OB1',
    26727:'Orion OB1',26311:'Orion OB1',25930:'Orion OB1',
    53910:'Ursa Major Moving Group',58001:'Ursa Major Moving Group',
    59774:'Ursa Major Moving Group',62956:'Ursa Major Moving Group',
    65378:'Ursa Major Moving Group',
    15863:'Alpha Persei Cluster (Mel 20)',102098:'Cygnus OB7'
  };

  const starKnowledge={
    107556:{name:'Deneb Algedi',dist:'~38.7 ly (11.9 pc)',lum:'8.5 × Sun (L☉)',temp:'7,300 K',sys:'Eclipsing Binary',cluster:'None (Field Star)',desc:'Brightest star in Capricornus. An Algol-type eclipsing spectroscopic binary showing strong metallic absorption lines.'},
    100064:{name:'Algedi',dist:'~106 ly (32.5 pc)',lum:'43 × Sun (L☉)',temp:'5,050 K',sys:'Optical Double',cluster:'None (Field Star)',desc:'Renowned optical double star: an unbonded yellow star pair (α¹ at 690 ly and α² at 106 ly) separated by 6.3 arcminutes, easily split with the naked eye.'},
    100345:{name:'Dabih',dist:'~330 ly (101 pc)',lum:'1,050 × Sun (L☉)',temp:'4,900 K',sys:'Multiple (5★)',cluster:'None (Field Star)',desc:'Second-brightest star in Capricornus. A complex quintuple star system dominated by an orange bright giant with a hot blue companion.'},
    106985:{name:'Nashira',dist:'~139 ly (42.6 pc)',lum:'47 × Sun (L☉)',temp:'7,400 K',sys:'Single (Am Met)',cluster:'None (Field Star)',desc:'Chemically peculiar metallic-line Am-type star with anomalous photospheric metal concentrations.'},
    27989:{name:'Betelgeuse',dist:'~640 ly (196 pc)',lum:'100,000 × Sun (L☉)',temp:'3,600 K',sys:'Red Supergiant',cluster:'None (Field Star)',desc:'Colossal red supergiant and semiregular variable. If placed at the center of the Solar System, its outer atmosphere would engulf the orbit of Jupiter.'},
    24436:{name:'Rigel',dist:'~860 ly (264 pc)',lum:'120,000 × Sun (L☉)',temp:'12,100 K',sys:'Supergiant (4★)',cluster:'Orion OB1',desc:'Brightest star in Orion and an extraordinarily luminous blue supergiant, radiating over 120,000 times more energy than the Sun.'},
    25336:{name:'Bellatrix',dist:'~250 ly (77 pc)',lum:'9,200 × Sun (L☉)',temp:'22,000 K',sys:'Hot Blue Giant',cluster:'Orion OB1',desc:'Hot blue-white giant marking the left shoulder of Orion, the constellation\'s third-brightest star.'},
    27366:{name:'Saiph',dist:'~650 ly (200 pc)',lum:'56,000 × Sun (L☉)',temp:'26,500 K',sys:'Blue Supergiant',cluster:'Orion OB1',desc:'Luminous B0.5Ia supergiant star defining the south-eastern corner of the Orion constellation figure.'},
    26727:{name:'Alnitak',dist:'~1,260 ly (386 pc)',lum:'250,000 × Sun (L☉)',temp:'29,500 K',sys:'Multiple (3★)',cluster:'Orion OB1',desc:'Easternmost star of Orion\'s Belt, a multiple blue supergiant system illuminating the nearby Horsehead Nebula.'},
    26311:{name:'Alnilam',dist:'~2,000 ly (613 pc)',lum:'537,000 × Sun (L☉)',temp:'27,500 K',sys:'Blue Supergiant',cluster:'Orion OB1',desc:'Central star of Orion\'s Belt, an intensely luminous blue supergiant of immense radiance.'},
    25930:{name:'Mintaka',dist:'~1,200 ly (368 pc)',lum:'190,000 × Sun (L☉)',temp:'29,500 K',sys:'Multiple (5★)',cluster:'Orion OB1',desc:'Westernmost star of Orion\'s Belt, a multiple eclipsing binary system lying almost precisely on the celestial equator.'},
    54061:{name:'Dubhe',dist:'~123 ly (38 pc)',lum:'316 × Sun (L☉)',temp:'4,500 K',sys:'Binary (4★)',cluster:'None (Field Star)',desc:'Alpha star of Ursa Major and second-brightest in the Big Dipper. Together with Merak, it points directly toward the North Star.'},
    53910:{name:'Merak',dist:'~79 ly (24 pc)',lum:'63 × Sun (L☉)',temp:'9,350 K',sys:'Single Star',cluster:'Ursa Major Moving Group',desc:'Brilliant white main-sequence star serving as the primary pointer toward Polaris.'},
    58001:{name:'Phecda',dist:'~83 ly (25 pc)',lum:'72 × Sun (L☉)',temp:'9,350 K',sys:'Astrometric Binary',cluster:'Ursa Major Moving Group',desc:'Lower-left star of the Big Dipper bowl, belonging to the Ursa Major Moving Group.'},
    59774:{name:'Megrez',dist:'~80 ly (25 pc)',lum:'23 × Sun (L☉)',temp:'8,630 K',sys:'Single Star',cluster:'Ursa Major Moving Group',desc:'Connecting the bowl of the Big Dipper to its handle, the faintest of the seven primary asterism stars.'},
    62956:{name:'Alioth',dist:'~81 ly (25 pc)',lum:'102 × Sun (L☉)',temp:'9,020 K',sys:'Magnetic Ap Star',cluster:'Ursa Major Moving Group',desc:'Brightest star in Ursa Major. An Ap chemically peculiar star exhibiting an unusually strong, fluctuating magnetic field.'},
    65378:{name:'Mizar',dist:'~83 ly (25 pc)',lum:'33 × Sun (L☉)',temp:'9,000 K',sys:'Quadruple (4★)',cluster:'Ursa Major Moving Group',desc:'Celebrated visual double star (Mizar and Alcor) that served as an ancient naked-eye eyesight test.'},
    67301:{name:'Alkaid',dist:'~104 ly (32 pc)',lum:'594 × Sun (L☉)',temp:'15,540 K',sys:'Single Star',cluster:'None (Field Star)',desc:'Easternmost star of the Big Dipper handle, a young hot blue star independent of the UMa stellar association.'},
    11767:{name:'Polaris',dist:'~433 ly (133 pc)',lum:'2,500 × Sun (L☉)',temp:'6,015 K',sys:'Triple System (3★)',cluster:'None (Field Star)',desc:'Northern Pole Star, a yellow supergiant classical Cepheid variable closely aligned with Earth\'s rotational axis.'},
    32349:{name:'Sirius',dist:'~8.6 ly (2.6 pc)',lum:'25.4 × Sun (L☉)',temp:'9,940 K',sys:'Binary (White Dwarf)',cluster:'None (Field Star)',desc:'Brightest star in the night sky. A luminous white main-sequence star orbited by a dense white dwarf companion.'},
    91262:{name:'Vega',dist:'~25 ly (7.7 pc)',lum:'40.1 × Sun (L☉)',temp:'9,600 K',sys:'Single (Dust Disc)',cluster:'None (Field Star)',desc:'Lead star of Lyra and vertex of the Summer Triangle; historic photometric calibration baseline for apparent magnitude.'},
    97649:{name:'Altair',dist:'~16.7 ly (5.1 pc)',lum:'10.6 × Sun (L☉)',temp:'7,700 K',sys:'Rapid Rotator',cluster:'None (Field Star)',desc:'Rapidly spinning, oblate white star located just 16.7 light-years from Earth, anchoring the Summer Triangle.'},
    102098:{name:'Deneb',dist:'~2,600 ly (800 pc)',lum:'196,000 × Sun (L☉)',temp:'8,525 K',sys:'White Supergiant',cluster:'Cygnus OB7',desc:'First-magnitude white supergiant in Cygnus, among the most luminous and distant naked-eye stars.'},
    69673:{name:'Arcturus',dist:'~36.7 ly (11.3 pc)',lum:'170 × Sun (L☉)',temp:'4,286 K',sys:'Orange Giant',cluster:'None (Field Star)',desc:'Brightest star in the northern celestial hemisphere, an orange giant exhibiting exceptionally high proper motion.'},
    21421:{name:'Aldebaran',dist:'~65 ly (20 pc)',lum:'518 × Sun (L☉)',temp:'3,900 K',sys:'Orange Giant',cluster:'Hyades (Foreground)',desc:'Distinctive orange giant marking the glowing "Eye of the Bull" in Taurus, projected against the Hyades cluster.'},
    17702:{name:'Alcyone',dist:'~444 ly (136 pc)',lum:'2,400 × Sun (L☉)',temp:'12,300 K',sys:'Multiple (4★)',cluster:'Pleiades (M45)',desc:'Brightest member of the Pleiades star cluster. Rapidly spinning blue-white giant with a circumstellar gas disc.'},
    80763:{name:'Antares',dist:'~550 ly (169 pc)',lum:'75,000 × Sun (L☉)',temp:'3,660 K',sys:'Binary (Supergiant)',cluster:'None (Field Star)',desc:'Vast red supergiant marking the heart of Scorpius, rivaling the crimson hue and brightness of Mars.'},
    65474:{name:'Spica',dist:'~250 ly (77 pc)',lum:'20,500 × Sun (L☉)',temp:'25,300 K',sys:'Spectroscopic Binary',cluster:'None (Field Star)',desc:'Brightest star in Virgo, a close spectroscopic binary system composed of two massive, hot blue giants.'},
    37826:{name:'Pollux',dist:'~34 ly (10.4 pc)',lum:'43 × Sun (L☉)',temp:'4,666 K',sys:'Giant (Exoplanet)',cluster:'None (Field Star)',desc:'Evolved orange giant star in Gemini and the closest giant star to the Solar System, hosting an extrasolar planet.'},
    36850:{name:'Castor',dist:'~51 ly (15.6 pc)',lum:'52 × Sun (L☉)',temp:'10,286 K',sys:'Sextuple System (6★)',cluster:'None (Field Star)',desc:'Fascinating sextuple star system composed of three pairs of spectroscopic binary stars.'},
    24608:{name:'Capella',dist:'~43 ly (13.1 pc)',lum:'150 × Sun (L☉)',temp:'4,970 K',sys:'Quadruple (4★)',cluster:'None (Field Star)',desc:'Brightest star in Auriga, a quadruple star system dominated by a pair of luminous yellow giants.'},
    49669:{name:'Regulus',dist:'~79 ly (24.3 pc)',lum:'312 × Sun (L☉)',temp:'12,460 K',sys:'Multiple (4★)',cluster:'None (Field Star)',desc:'The "Heart of the Lion" in Leo, an oblate, extremely rapid rotator with a subgiant companion.'},
    113368:{name:'Fomalhaut',dist:'~25 ly (7.7 pc)',lum:'16.6 × Sun (L☉)',temp:'8,590 K',sys:'Triple (Dust Ring)',cluster:'None (Field Star)',desc:'Young star surrounded by an expansive circumstellar dust disc and candidate exoplanetary system.'},
    60718:{name:'Acrux',dist:'~320 ly (98 pc)',lum:'25,000 × Sun (L☉)',temp:'28,000 K',sys:'Multiple (3★)',cluster:'None (Field Star)',desc:'Brightest star in the Southern Cross (Crux), a multiple system composed of massive, hot B-type stars.'},
    7588:{name:'Achernar',dist:'~139 ly (42.8 pc)',lum:'3,150 × Sun (L☉)',temp:'15,000 K',sys:'Binary (Oblate)',cluster:'None (Field Star)',desc:'The least spherical star known in the Milky Way due to its exceptionally high equatorial rotational velocity.'},
    30438:{name:'Canopus',dist:'~310 ly (95 pc)',lum:'10,700 × Sun (L☉)',temp:'7,400 K',sys:'Bright Giant',cluster:'None (Field Star)',desc:'Second-brightest star in Earth\'s night sky, a luminous yellow-white bright giant.'},
    37279:{name:'Procyon',dist:'~11.5 ly (3.5 pc)',lum:'6.9 × Sun (L☉)',temp:'6,530 K',sys:'Binary (White Dwarf)',cluster:'None (Field Star)',desc:'Yellow-white subgiant in Canis Minor, forming the Winter Triangle together with Sirius and Betelgeuse.'}
  };

  function estimateTemp(spect,bv){
    if(bv!==null&&Number.isFinite(bv)){
      const t=4600*(1/(0.92*bv+1.7)+1/(0.92*bv+0.62));
      if(Number.isFinite(t)&&t>1500&&t<50000)return Math.round(t);
    }
    const s=(spect||'').toUpperCase();
    if(s.startsWith('O'))return 35000;
    if(s.startsWith('B0')||s.startsWith('B1')||s.startsWith('B2'))return 22000;
    if(s.startsWith('B'))return 14000;
    if(s.startsWith('A0')||s.startsWith('A1')||s.startsWith('A2'))return 9600;
    if(s.startsWith('A'))return 8200;
    if(s.startsWith('F'))return 6800;
    if(s.startsWith('G'))return 5800;
    if(s.startsWith('K'))return 4500;
    if(s.startsWith('M'))return 3200;
    return 6000;
  }

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
    let type='Star';
    if(s.startsWith('O'))type='Hot luminous blue supergiant';
    else if(s.startsWith('B'))type='Luminous B-type blue star';
    else if(s.startsWith('A'))type='White main-sequence A-type star';
    else if(s.startsWith('F'))type='Yellow-white F-type subgiant star';
    else if(s.startsWith('G'))type='Yellow solar-type G star';
    else if(s.startsWith('K'))type='Orange K-type giant star';
    else if(s.startsWith('M'))type='Red M-type giant star';
    const hipText=star.hip?` Catalogued in the Hipparcos archive as HIP ${star.hip}.`:'';
    return `${type} in the constellation ${conName||'sky'} with an apparent magnitude of ${star.mag!==null?star.mag.toFixed(2)+'m':'—'}.${hipText} Complete astrometry catalogued in the SIMBAD database.`;
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
      const wasInspected=!!inspected;
      inspected=null;pinned=false;
      inspector.classList.remove('active');
      inspector.hidden=true;
      if(wasInspected&&phase==='hold'){
        phaseStart=performance.now();
        if(frozen)resumeReturn();
      }
    }
    function showInspector(star,slot,isPinned=false){
      pauseReturn();
      inspected={star,slot};
      if(isPinned)pinned=true;
      const bayer=star.bayer||'';
      inspBayer.textContent=bayer;
      inspBayer.hidden=!bayer;
      inspName.textContent=star.name||(star.hip?'HIP '+star.hip:'Star');
      const bayerLatinName=bayer?(greekNames[bayer]||bayer):'';
      const conGenitive=current.genitive||conGenitives[current.abbr]||current.name||'';
      inspBayerLatin.textContent=bayerLatinName?`${bayerLatinName} ${conGenitive}`:'';
      inspBayerLatin.hidden=!inspBayerLatin.textContent;
      inspCon.textContent=`Constellation: ${current.name||''}${conGenitive?` (${conGenitive})`:''}`;
      inspMag.textContent=(star.mag!==null&&Number.isFinite(star.mag))?star.mag.toFixed(2)+'m':'—';
      const hemi=(star.dec!==undefined&&Number.isFinite(star.dec))?(star.dec>=0?'🌐 Northern Sky':'🌐 Southern Sky'):'🌐 Celestial Sphere';
      inspHemiVal.textContent=hemi;
      const curated=starKnowledge[star.hip]||(star.id&&starKnowledge[star.id])||null;
      const cluster=starClusters[star.hip]||curated?.cluster||'None (Field Star)';
      inspClusterVal.textContent=cluster;
      inspDistVal.textContent=(curated&&curated.dist)?curated.dist:(star.hip?'SIMBAD / Gaia DR3':'—');
      const spect=star.spect||'';
      inspSpectVal.textContent=spect||'—';
      inspSpectDot.style.backgroundColor=spectralColor(spect,star.bv);
      const tempNum=curated?.temp?parseInt(curated.temp.replace(/[^0-9]/g,''),10):estimateTemp(spect,star.bv);
      inspTempVal.textContent=tempNum?tempNum.toLocaleString('en-US')+' K':'—';
      inspLumVal.textContent=curated?.lum||'—';
      inspBvVal.textContent=(star.bv!==null&&Number.isFinite(star.bv))?(star.bv>=0?'+':'')+star.bv.toFixed(2):'—';
      inspSysVal.textContent=curated?.sys||(star.hip?'Single Star':'Stellar Object');
      inspHipVal.textContent=star.hip?'HIP '+star.hip:'—';
      inspCoordsVal.textContent=formatCoords(star.ra,star.dec);
      const tempClamp=Math.max(3000,Math.min(15000,tempNum||6000));
      const needlePct=Math.round(((tempClamp-3000)/12000)*100);
      inspTempNeedle.style.left=needlePct+'%';
      inspTempBarVal.textContent='T: '+(tempNum?tempNum.toLocaleString('en-US')+' K':'—');
      inspDesc.textContent=(curated&&curated.desc)?curated.desc:starFallbackDesc(star,current.name);
      const ident=star.hip?'HIP '+star.hip:(star.name||star.id);
      inspSimbad.href='https://simbad.cds.unistra.fr/simbad/sim-id?Ident='+encodeURIComponent(ident);
      inspector.hidden=false;
      const cardW=290,cardH=inspector.offsetHeight||280,margin=14;
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
      if(!frozen||inspected||document.hidden||!document.hasFocus())return;
      if(frozen.resumeAt===null)frozen.resumeAt=performance.now()+5000;
      clearTimeout(freezeTimer);
      freezeTimer=setTimeout(()=>{
        if(stopped||!frozen||inspected)return;
        if(document.hidden||!document.hasFocus()){pauseReturn();return;}
        frozen=null;advance(performance.now());
        if(motion.matches){phase='hold';labels=layout?.labels||[];phaseStart=performance.now()-2000;render(performance.now());}
      },Math.max(0,frozen.resumeAt-performance.now()));
    }
    function freezeFigure(){
      frozen={constellation:current,at:performance.now(),resumeAt:null};
      if(!inspected)resumeReturn();
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
      if(!frozen&&!inspected&&!motion.matches&&now-phaseStart>durations[phase])advance(now);
      const t=phase==='hold'?1:ease(Math.min(1,(phaseNow-phaseStart)/durations[phase]));
      canvas.dataset.skyPhase=phase;canvas.dataset.skyConstellation=current.abbr;
      canvas.dataset.skyFrozen=String(!!frozen||!!inspected);
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
