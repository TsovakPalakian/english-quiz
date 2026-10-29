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
  inspector.className='auth-sky-inspector auth-sky-star-inspector is-collapsed';
  inspector.setAttribute('role','tooltip');
  inspector.hidden=true;
  inspector.innerHTML=`<div class="auth-sky-inspector-head"><div><div class="auth-sky-inspector-title"><span class="auth-sky-inspector-bayer"></span><span class="auth-sky-inspector-name"></span></div><div class="auth-sky-inspector-bayer-latin"></div><div class="auth-sky-inspector-con"></div></div><div class="auth-sky-con-badge-row"><span class="auth-sky-inspector-mag"></span><button type="button" class="auth-sky-inspector-more">more...</button><button type="button" class="auth-sky-inspector-close" aria-label="Close" title="Close">×</button></div></div><div class="auth-sky-inspector-body"><div class="auth-sky-inspector-hemi-cluster"><div class="auth-sky-inspector-row"><span class="k">Celestial Hemisphere:</span><span class="v auth-sky-hemi-val"></span></div><div class="auth-sky-inspector-row auth-sky-cluster-row"><span class="k">Star Cluster:</span><span class="v auth-sky-cluster-val"></span></div></div><div class="auth-sky-inspector-grid"><div class="auth-sky-inspector-item"><span class="k">Distance:</span><span class="v auth-sky-dist-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Luminosity:</span><span class="v auth-sky-lum-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Spectral Class:</span><span class="v"><span class="auth-sky-spect-dot"></span><span class="auth-sky-spect-val"></span></span></div><div class="auth-sky-inspector-item"><span class="k">Temperature:</span><span class="v auth-sky-temp-val"></span></div><div class="auth-sky-inspector-item"><span class="k">Color Index (B−V):</span><span class="v auth-sky-bv-val"></span></div><div class="auth-sky-inspector-item"><span class="k">System Type:</span><span class="v auth-sky-sys-val"></span></div><div class="auth-sky-inspector-coords"><span class="auth-sky-coords-val"></span><span class="auth-sky-hip-val"></span></div></div><div class="auth-sky-temp-bar-container"><div class="auth-sky-temp-labels"><span>3,000 K</span><span class="auth-sky-temp-bar-val"></span><span>15,000+ K</span></div><div class="auth-sky-temp-bar"><div class="auth-sky-temp-needle"></div></div></div><div class="auth-sky-inspector-desc"></div><div class="auth-sky-inspector-foot"><span>SIMBAD Database</span><a class="auth-sky-inspector-simbad" target="_blank" rel="noopener noreferrer">Open in SIMBAD ↗</a></div></div>`;
  document.body.append(inspector);
  const inspBayer=inspector.querySelector('.auth-sky-inspector-bayer');
  const inspName=inspector.querySelector('.auth-sky-inspector-name');
  const inspBayerLatin=inspector.querySelector('.auth-sky-inspector-bayer-latin');
  const inspCon=inspector.querySelector('.auth-sky-inspector-con');
  const inspMag=inspector.querySelector('.auth-sky-inspector-mag');
  const inspMore=inspector.querySelector('.auth-sky-inspector-more');
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

  const conInspector=document.createElement('div');
  conInspector.className='auth-sky-inspector auth-sky-con-inspector is-collapsed';
  conInspector.setAttribute('role','tooltip');
  conInspector.hidden=true;
  conInspector.innerHTML=`<div class="auth-sky-inspector-head"><div><div class="auth-sky-inspector-title"><span class="auth-sky-con-name-en"></span><span class="auth-sky-con-sep"> · </span><span class="auth-sky-con-meaning"></span></div><div class="auth-sky-inspector-bayer-latin auth-sky-con-sub"><span class="auth-sky-con-gen"></span><span class="auth-sky-con-sub-sep"> · </span><span class="auth-sky-con-name-ru"></span></div><div class="auth-sky-inspector-con auth-sky-con-family"></div></div><div class="auth-sky-con-badges"><div class="auth-sky-con-badge-row"><span class="auth-sky-inspector-mag auth-sky-con-abbr"></span><button type="button" class="auth-sky-inspector-more">more...</button><button type="button" class="auth-sky-inspector-close" aria-label="Close" title="Close">×</button></div><span class="auth-sky-con-quad"></span></div></div><div class="auth-sky-inspector-body"><div class="auth-sky-inspector-hemi-cluster"><div class="auth-sky-inspector-row"><span class="k">Celestial Hemisphere:</span><span class="v auth-sky-con-hemi"></span></div><div class="auth-sky-inspector-row auth-sky-cluster-row"><span class="k">Visibility Latitude:</span><span class="v auth-sky-con-vis"></span></div><div class="auth-sky-inspector-row auth-sky-cluster-row"><span class="k">Best Viewing Month:</span><span class="v auth-sky-con-month"></span></div></div><div class="auth-sky-inspector-grid"><div class="auth-sky-inspector-item"><span class="k">Angular Area:</span><span class="v auth-sky-con-area"></span></div><div class="auth-sky-inspector-item"><span class="k">Brightest Star:</span><span class="v auth-sky-con-brightest"></span></div><div class="auth-sky-inspector-item"><span class="k">Exoplanet Hosts:</span><span class="v auth-sky-con-planets"></span></div><div class="auth-sky-inspector-item"><span class="k">Constellation Family:</span><span class="v auth-sky-con-fam-val"></span></div><div class="auth-sky-inspector-coords auth-sky-con-dso-row"><span class="auth-sky-con-dso-label">Key Deep-Sky:</span><span class="auth-sky-con-dso-val"></span></div></div><div class="auth-sky-temp-bar-container auth-sky-size-container"><div class="auth-sky-temp-labels"><span>Crux (68°)</span><span class="auth-sky-temp-bar-val auth-sky-size-bar-val"></span><span>Hydra (1303°)</span></div><div class="auth-sky-temp-bar auth-sky-size-bar"><div class="auth-sky-temp-needle auth-sky-size-needle"></div></div></div><div class="auth-sky-inspector-desc auth-sky-con-desc"></div><div class="auth-sky-inspector-foot"><span>IAU & Go-Astronomy Atlas</span><a class="auth-sky-inspector-simbad auth-sky-con-link" target="_blank" rel="noopener noreferrer">Explore Constellation ↗</a></div></div>`;
  document.body.append(conInspector);

  const conNameEn=conInspector.querySelector('.auth-sky-con-name-en');
  const conSep=conInspector.querySelector('.auth-sky-con-sep');
  const conMeaning=conInspector.querySelector('.auth-sky-con-meaning');
  const conGen=conInspector.querySelector('.auth-sky-con-gen');
  const conSubSep=conInspector.querySelector('.auth-sky-con-sub-sep');
  const conNameRu=conInspector.querySelector('.auth-sky-con-name-ru');
  const conFamily=conInspector.querySelector('.auth-sky-con-family');
  const conAbbr=conInspector.querySelector('.auth-sky-con-abbr');
  const conMore=conInspector.querySelector('.auth-sky-inspector-more');
  const conQuad=conInspector.querySelector('.auth-sky-con-quad');
  const conHemi=conInspector.querySelector('.auth-sky-con-hemi');
  const conVis=conInspector.querySelector('.auth-sky-con-vis');
  const conMonth=conInspector.querySelector('.auth-sky-con-month');
  const conArea=conInspector.querySelector('.auth-sky-con-area');
  const conBrightest=conInspector.querySelector('.auth-sky-con-brightest');
  const conPlanets=conInspector.querySelector('.auth-sky-con-planets');
  const conFamVal=conInspector.querySelector('.auth-sky-con-fam-val');
  const conDsoVal=conInspector.querySelector('.auth-sky-con-dso-val');
  const conSizeBarVal=conInspector.querySelector('.auth-sky-size-bar-val');
  const conSizeNeedle=conInspector.querySelector('.auth-sky-size-needle');
  const conDesc=conInspector.querySelector('.auth-sky-con-desc');
  const conLink=conInspector.querySelector('.auth-sky-con-link');

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

  const conRuNames={
    And:'Андромеда',Ant:'Насос',Aps:'Райская Птица',Aqr:'Водолей',Aql:'Орёл',
    Ara:'Жертвенник',Ari:'Овен',Aur:'Возничий',Boo:'Волопас',Cae:'Резец',
    Cam:'Жираф',Cnc:'Рак',CVn:'Гончие Псы',CMa:'Большой Пёс',CMi:'Малый Пёс',
    Cap:'Козерог',Car:'Киль',Cas:'Кассиопея',Cen:'Центавр',Cep:'Цефей',
    Cet:'Кит',Cha:'Хамелеон',Cir:'Циркуль',Col:'Голубь',Com:'Волосы Вероники',
    CrA:'Южная Корона',CrB:'Северная Корона',Crv:'Ворон',Crt:'Чаша',Cru:'Южный Крест',
    Cyg:'Лебедь',Del:'Дельфин',Dor:'Золотая Рыба',Dra:'Дракон',Equ:'Малый Конь',
    Eri:'Эридан',For:'Печь',Gem:'Близнецы',Gru:'Журавль',Her:'Геркулес',
    Hor:'Часы',Hya:'Гидра',Hyi:'Южная Гидра',Ind:'Индеец',Lac:'Ящерица',
    Leo:'Лев',LMi:'Малый Лев',Lep:'Заяц',Lib:'Весы',Lup:'Волк',
    Lyn:'Рысь',Lyr:'Лира',Men:'Столовая Гора',Mic:'Микроскоп',Mon:'Единорог',
    Mus:'Муха',Nor:'Наугольник',Oct:'Октант',Oph:'Змееносец',Ori:'Орион',
    Pav:'Павлин',Peg:'Пегас',Per:'Персей',Phe:'Феникс',Pic:'Живописец',
    Psc:'Рыбы',PsA:'Южная Рыба',Pup:'Корма',Pyx:'Компас',Ret:'Сетка',
    Sge:'Стрела',Sgr:'Стрелец',Sco:'Скорпион',Scl:'Скульптор',Sct:'Щит',
    Ser:'Змея',Sex:'Секстант',Tau:'Телец',Tel:'Телескоп',Tri:'Треугольник',
    TrA:'Южный Треугольник',Tuc:'Тукан',UMa:'Большая Медведица',UMi:'Малая Медведица',
    Vel:'Паруса',Vir:'Дева',Vol:'Летучая Рыба',Vul:'Лисичка'
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

  function conFallbackDesc(c){
    const meaning=c.meaning?` depicting ${c.meaning}`:'';
    const starsCount=c.stars?.length||0;
    const best=c.bestViewingMonth?(c.bestViewingMonth+(c.bestSeason?` (${c.bestSeason})`:'')):'optimal viewing seasons';
    return `Prominent constellation in the ${c.hemisphere||'celestial'} sky${meaning}. Spans ${c.areaSqDeg||'several hundred'} square degrees across the celestial sphere with ${starsCount} catalogued stars. Best observed during ${best}. Complete astronomical atlas catalogued in IAU and Go-Astronomy archives.`;
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
    const roots=[...document.querySelectorAll(brand+','+(mode==='home'?'#homeAuth':'#accountBody')+',.site-copyright,#feedbackFloatingTrigger')];
    return roots
      .map(n=>{
        const r=n.getBoundingClientRect();
        const extra=n.id==='feedbackFloatingTrigger'?8:0;
        return {left:r.left-extra,right:r.right+extra,top:r.top-extra,bottom:r.bottom+extra,width:r.width+extra*2,height:r.height+extra*2,element:n.id?'#'+n.id:'.'+[...n.classList].join('.')};
      }).filter(r=>r.width&&r.height);
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
    canvas.dataset.skyBlackHole='idle';
    canvas.dataset.skyBlackHoleCount='0';
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
      return {...safePoint(true),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,speed,radius:1.15+Math.random()*.65,phase:Math.random()*Math.PI*2,cooldown:0,encounter:null};
    });
    let encounters=[],flashes=[];
    let blackHoleEvent=null,nextBlackHoleAt=performance.now()+300000+Math.random()*180000,blackHoleCount=0;
    function triggerBlackHole(){
      if(blackHoleEvent||motion.matches)return;
      let center=safePoint(false);
      if(center.x<0)center=safePoint(true);
      if(center.x<0)return;
      const targetStar=wanderers.find(s=>!s.encounter&&(!s.cooldown||performance.now()>s.cooldown))||wanderers.find(s=>!s.encounter)||wanderers[0];
      if(targetStar.encounter&&typeof targetStar.encounter==='object'){
        const other=targetStar.encounter.a===targetStar?targetStar.encounter.b:targetStar.encounter.a;
        if(other){other.encounter=null;other.cooldown=performance.now()+4000;}
        encounters=encounters.filter(e=>e!==targetStar.encounter);
      }
      targetStar.encounter='blackhole';
      const initialDist=Math.hypot(targetStar.x-center.x,targetStar.y-center.y)||140;
      blackHoleEvent={
        star:targetStar,
        center,
        r0:Math.max(90,Math.min(220,initialDist)),
        theta0:Math.atan2(targetStar.y-center.y,targetStar.x-center.x),
        started:performance.now(),
        duration:6500,
        streamer:[]
      };
      blackHoleCount++;
      canvas.dataset.skyBlackHoleCount=String(blackHoleCount);
      canvas.dataset.skyBlackHole='active';
    }
    canvas.__triggerBlackHole=triggerBlackHole;
    canvas.addEventListener('sky:blackhole',triggerBlackHole);
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
      inspector.classList.add('is-collapsed');
      if(inspMore)inspMore.textContent='more...';
      inspector.hidden=false;
      const cardW=290,cardH=inspector.offsetHeight||52,margin=14;
      let left=slot.x+20,top=slot.y-24;
      if(left+cardW>w-margin)left=slot.x-cardW-20;
      const overlaps=r=>uiRects.some(u=>!(r.right<u.left||r.left>u.right||r.bottom<u.top||r.top>u.bottom));
      if(overlaps({left,right:left+cardW,top,bottom:top+cardH})){
        const altLeft=(left>slot.x)?(slot.x-cardW-20):(slot.x+20);
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
    let inspectedCon=null,conHideTimer=0;
    function cancelConHide(){
      if(conHideTimer){clearTimeout(conHideTimer);conHideTimer=0;}
    }
    function scheduleConHide(delay=350){
      cancelConHide();
      conHideTimer=setTimeout(()=>{
        conHideTimer=0;
        if(!conInspector.matches(':hover')&&!document.querySelector('.auth-sky-title:hover')){
          hideConInspector();
          if(motion.matches)redraw?.();
        }
      },delay);
    }
    function hideConInspector(){
      cancelConHide();
      const wasInspected=!!inspectedCon;
      inspectedCon=null;
      conInspector.classList.remove('active');
      conInspector.hidden=true;
      if(wasInspected&&phase==='hold'){
        phaseStart=performance.now();
        if(frozen)resumeReturn();
      }
    }
    function showConInspector(c,targetNode){
      cancelConHide();
      pauseReturn();
      inspectedCon=c;
      hideInspector();
      conNameEn.textContent=c.name||'';
      const meaning=c.meaning?`"${c.meaning}"`:'';
      conMeaning.textContent=meaning;
      conSep.hidden=!meaning;
      const gen=c.genitive||conGenitives[c.abbr]||'';
      const ru=conRuNames[c.abbr]||c.name||'';
      conGen.textContent=gen;
      conNameRu.textContent=ru;
      conSubSep.hidden=!(gen&&ru);
      conFamily.textContent='Family: '+(c.family||'IAU Constellation');
      conAbbr.textContent=c.abbr||'';
      conQuad.textContent=c.quadrant?c.quadrant+' Quad':'';
      conHemi.textContent=c.hemisphere?('🌐 '+(c.hemisphere.includes('Sky')?c.hemisphere:c.hemisphere+' Sky')):'🌐 Celestial Sphere';
      conVis.textContent=c.visibility||'Global';
      conMonth.textContent=c.bestViewingMonth?(c.bestViewingMonth+(c.bestSeason?` (${c.bestSeason})`:'')):'Year-round';
      conArea.textContent=c.areaSqDeg?(c.areaSqDeg+' sq deg'+(c.sizeRank?` (${c.sizeRank})`:'')):'—';
      conBrightest.textContent=c.brightestStar||'—';
      conPlanets.textContent=c.starsWithPlanets!==null&&c.starsWithPlanets!==undefined?(c.starsWithPlanets+' planetary system'+(c.starsWithPlanets===1?'':'s')):'—';
      conFamVal.textContent=c.family||'Classical';
      const dsoNames=[...new Set((c.objects||[]).map(o=>o.name).filter(Boolean))].slice(0,4).join(' · ');
      conDsoVal.textContent=dsoNames||'None catalogued';
      const areaNum=c.areaSqDeg||400;
      const pct=Math.round(Math.max(0,Math.min(100,((areaNum-68)/(1303-68))*100)));
      conSizeNeedle.style.left=pct+'%';
      conSizeBarVal.textContent=c.sizeRank?`Rank: ${c.sizeRank} (${areaNum} sq deg)`:`Area: ${areaNum} sq deg`;
      conDesc.textContent=conFallbackDesc(c);
      const url='https://www.go-astronomy.com/constellations.php?Name='+encodeURIComponent(c.name);
      conLink.href=url;
      conInspector.classList.add('is-collapsed');
      if(conMore)conMore.textContent='more...';
      conInspector.hidden=false;
      const cardW=320,cardH=conInspector.offsetHeight||52,margin=14;
      const r=targetNode.getBoundingClientRect();
      const coreStars=(slots||[]).slice(0,c?.stars?.length||0).filter(s=>s&&Number.isFinite(s.x)&&Number.isFinite(s.y));
      const figLeft=coreStars.length?Math.min(...coreStars.map(s=>s.x))-16:r.left;
      const figRight=coreStars.length?Math.max(...coreStars.map(s=>s.x))+16:r.right;
      const figTop=coreStars.length?Math.min(...coreStars.map(s=>s.y))-16:r.top;
      const figBottom=coreStars.length?Math.max(...coreStars.map(s=>s.y))+16:r.bottom;
      const figureBox={left:figLeft,right:figRight,top:figTop,bottom:figBottom};
      const overlaps=(a,b)=>!(a.right<b.left||a.left>b.right||a.bottom<b.top||a.top>b.bottom);
      const clamp=(val,min,max)=>Math.max(min,Math.min(max,val));
      const makeBox=(l,t)=>{
        const left=clamp(l,margin,Math.max(margin,w-cardW-margin));
        const top=clamp(t,margin,Math.max(margin,h-cardH-margin));
        return {left,right:left+cardW,top,bottom:top+cardH};
      };
      const score=box=>{
        let s=0;
        const hitsStar=coreStars.some(st=>st.x>=box.left-10&&st.x<=box.right+10&&st.y>=box.top-10&&st.y<=box.bottom+10);
        if(hitsStar)s+=200000;
        const hitsLine=(c.connections||[]).some(([i,j])=>{
          const a=coreStars[i],b=coreStars[j];
          return a&&b&&astro.segmentHitsBox(a,b,box);
        });
        if(hitsLine)s+=100000;
        if(overlaps(box,r))s+=80000;
        for(const u of uiRects){
          if(overlaps(box,u)){
            const xOv=Math.max(0,Math.min(box.right,u.right)-Math.max(box.left,u.left));
            const yOv=Math.max(0,Math.min(box.bottom,u.bottom)-Math.max(box.top,u.top));
            s+=xOv*yOv*50;
          }
        }
        const targetX=(r.left+r.right)/2,targetY=(r.top+r.bottom)/2;
        const boxX=(box.left+box.right)/2,boxY=(box.top+box.bottom)/2;
        s+=Math.hypot(boxX-targetX,boxY-targetY)*5;
        return s;
      };
      const candidates=[];
      candidates.push(makeBox(r.right+16,r.top-4));
      candidates.push(makeBox(r.left-cardW-16,r.top-4));
      candidates.push(makeBox(r.left,r.bottom+14));
      candidates.push(makeBox(r.left,r.top-cardH-14));
      candidates.push(makeBox(figureBox.right+18,(figTop+figBottom)/2-cardH/2));
      candidates.push(makeBox(figureBox.left-cardW-18,(figTop+figBottom)/2-cardH/2));
      candidates.push(makeBox((figLeft+figRight)/2-cardW/2,figBottom+16));
      candidates.push(makeBox((figLeft+figRight)/2-cardW/2,figTop-cardH-16));
      candidates.sort((a,b)=>score(a)-score(b));
      const best=candidates[0]||makeBox(r.left,r.bottom+12);
      conInspector.style.left=Math.round(best.left)+'px';
      conInspector.style.top=Math.round(best.top)+'px';
      conInspector.classList.add('active');
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
      if(!frozen||inspected||inspectedCon||document.hidden||!document.hasFocus())return;
      if(frozen.resumeAt===null)frozen.resumeAt=performance.now()+5000;
      clearTimeout(freezeTimer);
      freezeTimer=setTimeout(()=>{
        if(stopped||!frozen||inspected||inspectedCon)return;
        if(document.hidden||!document.hasFocus()){pauseReturn();return;}
        frozen=null;advance(performance.now());
        if(motion.matches){phase='hold';labels=layout?.labels||[];phaseStart=performance.now()-2000;render(performance.now());}
      },Math.max(0,frozen.resumeAt-performance.now()));
    }
    function freezeFigure(){
      frozen={constellation:current,at:performance.now(),resumeAt:null};
      if(!inspected&&!inspectedCon)resumeReturn();
      if(motion.matches)render(performance.now());
    }
    const onVisibility=()=>{if(document.hidden)pauseReturn();else resumeReturn();};
    const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
    function advance(now){
      hideInspector();
      hideConInspector();
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
      if(!frozen&&!inspected&&!inspectedCon&&!motion.matches&&now-phaseStart>durations[phase])advance(now);
      const t=phase==='hold'?1:ease(Math.min(1,(phaseNow-phaseStart)/durations[phase]));
      canvas.dataset.skyPhase=phase;canvas.dataset.skyConstellation=current.abbr;
      canvas.dataset.skyFrozen=String(!!frozen||!!inspected||!!inspectedCon);
      canvas.dataset.skyScale=String(constellationScale);
      canvas.dataset.skyBackgroundBrightness=String(brightness.background);
      canvas.dataset.skyConstellationBrightness=String(brightness.constellation);
      ctx.clearRect(0,0,w,h);
      ctx.save();
      const background=s=>({x:((s.x-skyPan.x)%(w+12)+w+12)%(w+12),y:((s.y-skyPan.y)%(h+12)+h+12)%(h+12)});
      for(const s of ambient){drift(s,delta);const p=background(s);if(s.phase%1<.12&&uiRects.some(r=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom))continue;dot(p.x,p.y,s.radius,(Math.sin(clock*.004+s.phase)*.3+.7)*.25,'200,220,240',false,brightness.background);}
      if(!motion.matches){
        encounters=encounters.filter(enc=>{
          const elapsed=now-enc.started;
          const u=Math.min(1,elapsed/enc.duration);
          enc.cx=(enc.cx+enc.cvx*delta+w+12)%(w+12);
          enc.cy=(enc.cy+enc.cvy*delta+h+12)%(h+12);
          if(enc.mode==='slingshot'){
            const theta=enc.theta0+enc.dir*(Math.PI*Math.pow(u,0.75));
            const r=enc.r0*(0.4+0.6*Math.pow(2*u-1,2));
            enc.a.x=enc.cx+Math.cos(theta)*r;
            enc.a.y=enc.cy+Math.sin(theta)*r;
            enc.b.x=enc.cx-Math.cos(theta)*r;
            enc.b.y=enc.cy-Math.sin(theta)*r;
            if(u>=1){
              const v=Math.max(enc.a.speed,enc.b.speed)*1.25;
              enc.a.vx=-Math.sin(theta)*enc.dir*v;
              enc.a.vy=Math.cos(theta)*enc.dir*v;
              enc.b.vx=-enc.a.vx;enc.b.vy=-enc.a.vy;
              enc.a.encounter=null;enc.b.encounter=null;
              enc.a.cooldown=now+4000;enc.b.cooldown=now+4000;
              return false;
            }
          }else if(enc.mode==='dance'){
            const theta=enc.theta0+enc.dir*(5*Math.PI*ease(u));
            const r=enc.r0*(0.65+0.35*Math.cos(4*Math.PI*u));
            enc.a.x=enc.cx+Math.cos(theta)*r;
            enc.a.y=enc.cy+Math.sin(theta)*r;
            enc.b.x=enc.cx-Math.cos(theta)*r;
            enc.b.y=enc.cy-Math.sin(theta)*r;
            const pA=background(enc.a),pB=background(enc.b);
            ctx.save();
            ctx.strokeStyle='rgba(255,235,180,'+(0.14*(1-u*0.5)*brightness.background)+')';
            ctx.lineWidth=0.8;
            ctx.beginPath();ctx.moveTo(pA.x,pA.y);ctx.lineTo(pB.x,pB.y);ctx.stroke();
            ctx.restore();
            if(u>=1){
              enc.a.vx=-Math.sin(theta)*enc.dir*enc.a.speed;
              enc.a.vy=Math.cos(theta)*enc.dir*enc.a.speed;
              enc.b.vx=-enc.a.vx;enc.b.vy=-enc.a.vy;
              enc.a.encounter=null;enc.b.encounter=null;
              enc.a.cooldown=now+4000;enc.b.cooldown=now+4000;
              return false;
            }
          }else if(enc.mode==='merge'){
            const theta=enc.theta0+enc.dir*(6*Math.PI*Math.pow(u,1.4));
            const r=enc.r0*Math.pow(Math.max(0,1-u),1.2);
            enc.a.x=enc.cx+Math.cos(theta)*r;
            enc.a.y=enc.cy+Math.sin(theta)*r;
            enc.b.x=enc.cx-Math.cos(theta)*r;
            enc.b.y=enc.cy-Math.sin(theta)*r;
            if(u>=1){
              const flashP=background({x:enc.cx,y:enc.cy});
              flashes.push({x:flashP.x,y:flashP.y,started:now,duration:1600,maxRadius:38});
              enc.a.x=enc.cx;enc.a.y=enc.cy;
              enc.a.radius=Math.min(2.4,Math.hypot(enc.a.radius,enc.b.radius));
              enc.a.encounter=null;enc.a.cooldown=now+5000;
              Object.assign(enc.b,safePoint(true));
              const newA=Math.random()*Math.PI*2;
              enc.b.vx=Math.cos(newA)*enc.b.speed;enc.b.vy=Math.sin(newA)*enc.b.speed;
              enc.b.radius=1.15+Math.random()*0.5;
              enc.b.encounter=null;enc.b.cooldown=now+5000;
              return false;
            }
          }
          return true;
        });

        for(let i=0;i<wanderers.length;i++){
          const a=wanderers[i];
          if(a.encounter||(a.cooldown&&now<a.cooldown))continue;
          for(let j=i+1;j<wanderers.length;j++){
            const b=wanderers[j];
            if(b.encounter||(b.cooldown&&now<b.cooldown))continue;
            const dx=a.x-b.x,dy=a.y-b.y,dist=Math.hypot(dx,dy);
            if(dist<38){
              const dvx=a.vx-b.vx,dvy=a.vy-b.vy,relSpeed=Math.hypot(dvx,dvy)||0.001;
              const cross=Math.abs(dx*dvy-dy*dvx)/relSpeed;
              const mode=cross<10?'merge':cross<22?'dance':'slingshot';
              const dir=(dx*dvy-dy*dvx)>=0?1:-1;
              const enc={
                a,b,mode,
                cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,
                cvx:(a.vx+b.vx)/2,cvy:(a.vy+b.vy)/2,
                r0:dist/2,
                theta0:Math.atan2(a.y-(a.y+b.y)/2,a.x-(a.x+b.x)/2),
                dir:dir||1,
                started:now,
                duration:mode==='slingshot'?1200:mode==='dance'?2200:1700
              };
              a.encounter=enc;b.encounter=enc;
              encounters.push(enc);
              break;
            }
          }
        }
      }
      for(const s of wanderers){
        if(s.encounter==='blackhole')continue;
        if(!s.encounter)drift(s,delta);
        const p=background(s);
        const pulse=(Math.sin(clock*.004+s.phase)*.25+.75)*.3;
        const boost=s.encounter?1.3:1;
        dot(p.x,p.y,s.radius*boost,pulse*boost,'255,245,210',true,brightness.background);
      }
      flashes=flashes.filter(f=>{
        const progress=(now-f.started)/f.duration;
        if(progress>=1)return false;
        const ringR=Math.sin(progress*Math.PI*0.5)*f.maxRadius;
        const alpha=(1-progress)*brightness.background;
        ctx.save();
        ctx.strokeStyle='rgba(255,235,180,'+(alpha*0.6)+')';
        ctx.lineWidth=Math.max(0.5,2.5*(1-progress));
        ctx.beginPath();ctx.arc(f.x,f.y,ringR,0,Math.PI*2);ctx.stroke();
        ctx.restore();
        dot(f.x,f.y,3.5*(1-progress),(1-progress)*0.85,'255,245,210',true,brightness.background,Infinity,6*(1-progress));
        return true;
      });
      if(!motion.matches){
        if(!blackHoleEvent&&now>=nextBlackHoleAt){
          triggerBlackHole();
          nextBlackHoleAt=now+600000+Math.random()*480000;
        }
      }else if(blackHoleEvent){
        if(blackHoleEvent.star){
          blackHoleEvent.star.encounter=null;
          blackHoleEvent.star.cooldown=now+4000;
          Object.assign(blackHoleEvent.star,safePoint(true));
        }
        blackHoleEvent=null;
      }
      canvas.dataset.skyBlackHole=blackHoleEvent?'active':'idle';
      if(blackHoleEvent){
        const ev=blackHoleEvent,elapsed=now-ev.started,u=Math.min(1,elapsed/ev.duration);
        const bhRadius=Math.max(4,Math.min(7,Math.round(Math.min(w,h)*0.008)));
        let flare=1,jetLength=0,bhAlpha=1;
        if(u<0.22){
          bhAlpha=Math.min(1,u/0.18);
          const t=u/0.22,r=ev.r0*(1.25-t*0.25),theta=ev.theta0+t*Math.PI*0.6;
          ev.star.x=ev.center.x+Math.cos(theta)*r;
          ev.star.y=ev.center.y+Math.sin(theta)*r;
          flare=0.6+0.4*t;
        }else if(u<0.65){
          const t=(u-0.22)/0.43,theta=ev.theta0+Math.PI*0.6+Math.pow(t,1.3)*Math.PI*4,r=ev.r0*(1.0-t*0.85);
          ev.star.x=ev.center.x+Math.cos(theta)*r;
          ev.star.y=ev.center.y+Math.sin(theta)*r;
          flare=1+t*0.8;
          ev.streamer.push({x:ev.star.x,y:ev.star.y,time:now});
        }else if(u<0.82){
          const t=(u-0.65)/0.17;
          flare=1.8+Math.sin(t*Math.PI)*1.5;
          jetLength=Math.sin(t*Math.PI)*bhRadius*10;
        }else{
          const t=(u-0.82)/0.18;
          bhAlpha=Math.max(0,1-t);
          flare=Math.max(0.2,1.8*(1-t*0.8));
          jetLength=0;
        }
        const bgGain=Math.max(0.1,Math.min(1.5,brightness.background/20));
        const effectiveAlpha=bhAlpha*bgGain;
        if(effectiveAlpha>0.01){
          const sc=background(ev.center),cx=sc.x,cy=sc.y;
          ctx.save();
          ctx.translate(cx,cy);
          ctx.rotate(-0.25);
          const diskRx=bhRadius*3.6,diskRy=bhRadius*1.35;
          const gradBack=ctx.createRadialGradient(0,0,bhRadius*1.1,0,0,diskRx);
          gradBack.addColorStop(0,'rgba(165,215,255,'+Math.min(1,0.9*flare*effectiveAlpha)+')');
          gradBack.addColorStop(0.3,'rgba(255,215,120,'+Math.min(1,0.75*flare*effectiveAlpha)+')');
          gradBack.addColorStop(0.7,'rgba(249,115,22,'+Math.min(1,0.4*flare*effectiveAlpha)+')');
          gradBack.addColorStop(1,'rgba(225,29,72,0)');
          ctx.save();
          ctx.scale(1,diskRy/diskRx);
          ctx.fillStyle=gradBack;
          ctx.beginPath();
          ctx.arc(0,0,diskRx,Math.PI,Math.PI*2);
          ctx.fill();
          ctx.restore();
          const lensGrad=ctx.createRadialGradient(0,0,bhRadius*0.9,0,0,bhRadius*2.4);
          lensGrad.addColorStop(0,'rgba(255,255,255,'+Math.min(1,0.95*flare*effectiveAlpha)+')');
          lensGrad.addColorStop(0.25,'rgba(147,197,253,'+Math.min(1,0.7*flare*effectiveAlpha)+')');
          lensGrad.addColorStop(0.65,'rgba(168,85,247,'+Math.min(1,0.25*flare*effectiveAlpha)+')');
          lensGrad.addColorStop(1,'rgba(15,23,42,0)');
          ctx.fillStyle=lensGrad;
          ctx.beginPath();
          ctx.arc(0,0,bhRadius*2.4,0,Math.PI*2);
          ctx.fill();
          ctx.fillStyle='#02050c';
          ctx.beginPath();
          ctx.arc(0,0,bhRadius,0,Math.PI*2);
          ctx.fill();
          ctx.strokeStyle='rgba(255,255,255,'+Math.min(1,0.95*flare*effectiveAlpha)+')';
          ctx.lineWidth=Math.max(0.75,bhRadius*0.08);
          ctx.beginPath();
          ctx.arc(0,0,bhRadius+0.5,0,Math.PI*2);
          ctx.stroke();
          const gradFront=ctx.createRadialGradient(0,0,bhRadius*1.1,0,0,diskRx);
          gradFront.addColorStop(0,'rgba(255,255,255,'+Math.min(1,0.98*flare*effectiveAlpha)+')');
          gradFront.addColorStop(0.2,'rgba(165,215,255,'+Math.min(1,0.85*flare*effectiveAlpha)+')');
          gradFront.addColorStop(0.5,'rgba(255,215,120,'+Math.min(1,0.8*flare*effectiveAlpha)+')');
          gradFront.addColorStop(0.85,'rgba(234,88,12,'+Math.min(1,0.45*flare*effectiveAlpha)+')');
          gradFront.addColorStop(1,'rgba(225,29,72,0)');
          ctx.save();
          ctx.scale(1,diskRy/diskRx);
          ctx.fillStyle=gradFront;
          ctx.beginPath();
          ctx.arc(0,0,diskRx,0,Math.PI);
          ctx.fill();
          ctx.restore();
          if(jetLength>0){
            ctx.save();
            ctx.rotate(Math.PI/2);
            const jetGrad=ctx.createLinearGradient(0,0,jetLength,0);
            jetGrad.addColorStop(0,'rgba(255,255,255,'+Math.min(1,0.95*effectiveAlpha)+')');
            jetGrad.addColorStop(0.2,'rgba(147,197,253,'+Math.min(1,0.85*effectiveAlpha)+')');
            jetGrad.addColorStop(0.7,'rgba(168,85,247,'+Math.min(1,0.4*effectiveAlpha)+')');
            jetGrad.addColorStop(1,'rgba(236,72,153,0)');
            ctx.strokeStyle=jetGrad;
            ctx.lineWidth=Math.max(1.2,bhRadius*0.15);
            ctx.beginPath();
            ctx.moveTo(bhRadius*0.8,0);ctx.lineTo(jetLength,0);
            ctx.moveTo(-bhRadius*0.8,0);ctx.lineTo(-jetLength,0);
            ctx.stroke();
            ctx.strokeStyle='rgba(255,255,255,'+Math.min(1,0.9*effectiveAlpha)+')';
            ctx.lineWidth=Math.max(0.75,bhRadius*0.05);
            ctx.beginPath();
            ctx.moveTo(bhRadius*0.8,0);ctx.lineTo(jetLength*0.8,0);
            ctx.moveTo(-bhRadius*0.8,0);ctx.lineTo(-jetLength*0.8,0);
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
          ev.streamer=ev.streamer.filter(p=>now-p.time<500);
          if(ev.streamer.length>1&&u<0.82){
            ctx.save();
            for(let i=1;i<ev.streamer.length;i++){
              const p1=background(ev.streamer[i-1]),p2=background(ev.streamer[i]);
              const age=(now-ev.streamer[i].time)/500;
              const grad=ctx.createLinearGradient(p1.x,p1.y,p2.x,p2.y);
              grad.addColorStop(0,'rgba(255,235,180,'+Math.min(1,0.85*(1-age)*effectiveAlpha)+')');
              grad.addColorStop(1,'rgba(249,115,22,'+Math.min(1,0.5*(1-age)*effectiveAlpha)+')');
              ctx.strokeStyle=grad;
              ctx.lineWidth=Math.max(0.6,2.0*(1-age));
              ctx.beginPath();
              ctx.moveTo(p1.x,p1.y);
              ctx.lineTo(p2.x,p2.y);
              ctx.stroke();
            }
            ctx.restore();
          }
          if(u<0.65){
            const sp=background(ev.star);
            dot(sp.x,sp.y,ev.star.radius*0.9,0.95*bhAlpha,'255,245,210',true,brightness.background,Infinity,5);
          }
        }
        if(u>=1){
          Object.assign(ev.star,safePoint(true));
          const newA=Math.random()*Math.PI*2;
          ev.star.vx=Math.cos(newA)*ev.star.speed;
          ev.star.vy=Math.sin(newA)*ev.star.speed;
          ev.star.encounter=null;
          ev.star.cooldown=now+8000;
          blackHoleEvent=null;
          nextBlackHoleAt=now+600000+Math.random()*480000;
        }
      }
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
      if(phase==='hold')for(const r of uiRects){if(!r.element||!r.element.includes('brand')){ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(r.left,r.top,r.right-r.left,r.bottom-r.top);ctx.clip('evenodd');}}
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
      const caption=event.target.closest('.auth-sky-title');
      if(caption){
        cancelConHide();
        canvas.classList.add('sky-hover');
        if(!inspectedCon||inspectedCon.abbr!==current.abbr){
          showConInspector(current,caption);
          if(motion.matches)redraw?.();
        }
        return;
      }
      if(conInspector.contains(event.target)){
        cancelConHide();
        return;
      }
      if(inspectedCon&&!conHideTimer){
        scheduleConHide(350);
      }
      if(inspector.contains(event.target))return;
      const target=findStar(event.clientX,event.clientY)||starFromLandmark(event.target);
      canvas.classList.toggle('sky-hover',!!target);
      if(!pinned){
        if(target){
          if(inspectedCon){cancelConHide();hideConInspector();}
          showInspector(target.star,target.slot,false);
          if(motion.matches)redraw?.();
        }else if(!event.target.closest('.auth-sky-inspector')){
          hideInspector();
          if(motion.matches)redraw?.();
        }
      }
    };
    let lastConTouch=-1000;
    const onClick=event=>{
      if(event.defaultPrevented||event.button!==0)return;
      if(event.target.closest('.auth-sky-inspector-close')){
        if(inspector.contains(event.target)){
          hideInspector();
          if(motion.matches)redraw?.();
          return;
        }
        if(conInspector.contains(event.target)){
          cancelConHide();
          hideConInspector();
          if(motion.matches)redraw?.();
          return;
        }
      }
      const moreBtn=event.target.closest('.auth-sky-inspector-more');
      if(moreBtn){
        const targetInsp=inspector.contains(moreBtn)?inspector:conInspector;
        const isCollapsed=targetInsp.classList.toggle('is-collapsed');
        moreBtn.textContent=isCollapsed?'more...':'less';
        if(targetInsp===conInspector){
          cancelConHide();
          pauseReturn();
        }
        const rect=targetInsp.getBoundingClientRect();
        if(rect.bottom>h-14){
          targetInsp.style.top=Math.max(14,Math.round(h-rect.height-14))+'px';
        }
        return;
      }
      if(inspector.contains(event.target))return;
      if(performance.now()-lastConTouch<400)return;
      if(conInspector.contains(event.target))return;
      cancelConHide();
      hideConInspector();
      const caption=event.target.closest('.auth-sky-title');
      if(caption){
        freezeFigure();
        return;
      }
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
      if(!event.changedTouches||event.changedTouches.length!==1)return;
      if(event.target.closest('.auth-sky-inspector-close')){
        if(inspector.contains(event.target)){
          lastConTouch=performance.now();
          hideInspector();
          if(motion.matches)redraw?.();
          return;
        }
        if(conInspector.contains(event.target)){
          lastConTouch=performance.now();
          cancelConHide();
          hideConInspector();
          if(motion.matches)redraw?.();
          return;
        }
      }
      const moreBtn=event.target.closest('.auth-sky-inspector-more');
      if(moreBtn){
        lastConTouch=performance.now();
        const targetInsp=inspector.contains(moreBtn)?inspector:conInspector;
        const isCollapsed=targetInsp.classList.toggle('is-collapsed');
        moreBtn.textContent=isCollapsed?'more...':'less';
        if(targetInsp===conInspector){
          cancelConHide();
          pauseReturn();
        }
        const rect=targetInsp.getBoundingClientRect();
        if(rect.bottom>h-14){
          targetInsp.style.top=Math.max(14,Math.round(h-rect.height-14))+'px';
        }
        return;
      }
      if(inspector.contains(event.target)||conInspector.contains(event.target))return;
      const t=event.changedTouches[0];
      const caption=event.target.closest('.auth-sky-title');
      if(caption){
        lastConTouch=performance.now();
        freezeFigure();
        if(!inspectedCon){
          showConInspector(current,caption);
          if(motion.matches)redraw?.();
          return;
        }else{
          cancelConHide();
          hideConInspector();
          if(motion.matches)redraw?.();
          return;
        }
      }
      cancelConHide();
      hideConInspector();
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
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        let changed=false;
        if(inspected){hideInspector();changed=true;}
        if(inspectedCon){cancelConHide();hideConInspector();changed=true;}
        if(changed&&motion.matches)redraw?.();
      }
    };
    const onConEnter=()=>cancelConHide();
    const onConLeave=()=>{if(inspectedCon&&!document.querySelector('.auth-sky-title:hover'))scheduleConHide(250);};
    conInspector.addEventListener('mouseenter',onConEnter);
    conInspector.addEventListener('mouseleave',onConLeave);
    window.addEventListener('click',onClick);window.addEventListener('mousemove',onMove);
    window.addEventListener('keydown',onKeyDown);
    window.addEventListener('touchend',onTouchEnd,{passive:true});
    window.addEventListener('blur',pauseReturn);window.addEventListener('focus',resumeReturn);document.addEventListener('visibilitychange',onVisibility);
    resumeReturn();
    redraw=()=>render(performance.now());
    if(motion.matches){phase='hold';labels=layout?.labels||[];phaseStart=performance.now()-2000;render(performance.now());}
    else frameId=requestAnimationFrame(render);
    return ()=>{stopped=true;redraw=null;refreshText=null;canvas.removeEventListener('sky:blackhole',triggerBlackHole);delete canvas.__triggerBlackHole;cancelAnimationFrame(frameId);clearTimeout(freezeTimer);cancelConHide();canvas.classList.remove('sky-hover');links.forEach(n=>n.hidden=true);hideInspector();hideConInspector();conInspector.removeEventListener('mouseenter',onConEnter);conInspector.removeEventListener('mouseleave',onConLeave);window.removeEventListener('click',onClick);window.removeEventListener('mousemove',onMove);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('touchend',onTouchEnd);window.removeEventListener('blur',pauseReturn);window.removeEventListener('focus',resumeReturn);document.removeEventListener('visibilitychange',onVisibility);};
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
