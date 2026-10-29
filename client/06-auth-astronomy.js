const StudioSkyAstronomy=(()=>{
  const radians=Math.PI/180;
  const vector=s=>{const ra=s.ra*radians,dec=s.dec*radians;return [Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];};
  function centre(stars){
    const sum=stars.reduce((v,s)=>vector(s).map((n,i)=>n+v[i]),[0,0,0]);
    return {ra:(Math.atan2(sum[1],sum[0])/radians+360)%360,dec:Math.atan2(sum[2],Math.hypot(sum[0],sum[1]))/radians};
  }
  function project(star,origin){
    const ra=(star.ra-origin.ra)*radians,dec=star.dec*radians,d0=origin.dec*radians;
    const denominator=Math.sin(d0)*Math.sin(dec)+Math.cos(d0)*Math.cos(dec)*Math.cos(ra);
    if(denominator<=1e-12)return null;
    // Gnomonic chart: north up, east left. One projection for stars and landmarks.
    return {x:-Math.cos(dec)*Math.sin(ra)/denominator,y:-(Math.cos(d0)*Math.sin(dec)-Math.sin(d0)*Math.cos(dec)*Math.cos(ra))/denominator};
  }
  function angularDistance(a,b){const va=vector(a),vb=vector(b);return Math.acos(Math.max(-1,Math.min(1,va.reduce((s,n,i)=>s+n*vb[i],0))))/radians;}
  const landmarkIds={UMi:{polaris:'Polaris'},Cru:{acrux:'Acrux',gacrux:'Gacrux',mimosa:'Mimosa',delta_cru:'Delta Crucis'},Cen:{alpha_cen:'Rigil Kentaurus',hadar:'Hadar'}};
  function catalogue(rows){
    const landmarks=rows.flatMap(c=>c.stars.filter(s=>landmarkIds[c.abbr]?.[s.id]).map(s=>({...s,abbr:c.abbr,label:landmarkIds[c.abbr][s.id]})));
    return rows.map(c=>{
      const origin=centre(c.stars),points=c.stars.map(s=>({...s,...project(s,origin),landmark:false}));
      if(points.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)))throw Error('Constellation exceeds chart hemisphere: '+c.abbr);
      const external=landmarks.filter(s=>s.abbr!==c.abbr).flatMap(s=>{const p=project(s,origin);return p?[{...s,...p,landmark:true}]:[];});
      const all=[...points,...external];
      const byId=new Map(points.map((s,i)=>[s.id,i]));
      const lines=c.connections.map(edge=>edge.map(id=>{if(!byId.has(id))throw Error('Unknown sky connection: '+id);return byId.get(id);}));
      // Frame the constellation itself; external references never alter its scale.
      const minX=Math.min(...points.map(s=>s.x)),maxX=Math.max(...points.map(s=>s.x)),minY=Math.min(...points.map(s=>s.y)),maxY=Math.max(...points.map(s=>s.y));
      const objects=c.objects.flatMap(o=>{const p=project(o,origin);return p?[{...o,...p}]:[];});
      return {...c,origin,points:all,lines,objects,bounds:{minX,maxX,minY,maxY,width:Math.max(.01,maxX-minX),height:Math.max(.01,maxY-minY)}};
    });
  }
  function appearance(magnitude,bv=null){
    const mag=Number.isFinite(magnitude)?magnitude:6,flux=10**(-.4*mag);
    const anchors=[[-.3,[170,195,255]],[0,[225,235,255]],[.65,[255,245,220]],[1.4,[255,205,160]],[2,[255,170,125]]];
    const color=anchors.find((a,i)=>i&&bv<=a[0]);
    let rgb=[245,242,230];
    if(Number.isFinite(bv)){
      const upper=color||anchors.at(-1),i=anchors.indexOf(upper),lower=anchors[Math.max(0,i-1)],t=Math.max(0,Math.min(1,(bv-lower[0])/(upper[0]-lower[0]||1)));
      rgb=lower[1].map((n,j)=>Math.round(n+(upper[1][j]-n)*t));
    }
    // Compress display dynamic range, while preserving the catalogue flux ordering.
    return {flux,radius:.65+2.4*flux**.22,alpha:Math.min(1,.16+.58*flux**.25),color:rgb.join(',')};
  }
  function layout(c,cx,cy,size){
    const b=c.bounds,scale=size/Math.max(b.width,b.height),x0=(b.minX+b.maxX)/2,y0=(b.minY+b.maxY)/2;
    const transform=s=>({...s,x:cx+(s.x-x0)*scale,y:cy+(s.y-y0)*scale});
    return {stars:c.points.map(transform),objects:c.objects.map(transform),size};
  }
  const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const inViewport=(p,width,height)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height;
  function segmentHitsBox(a,b,r){
    let lo=0,hi=1;
    for(const [p,d,min,max] of [[a.x,b.x-a.x,r.left,r.right],[a.y,b.y-a.y,r.top,r.bottom]]){
      if(Math.abs(d)<1e-12){if(p<min||p>max)return false;continue;}
      const u=(min-p)/d,v=(max-p)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
      if(lo>hi)return false;
    }
    return true;
  }
  function clearFigure(c,stars,rects){
    return !stars.some(s=>rects.some(r=>intersects(r,{left:s.x-10,right:s.x+10,top:s.y-10,bottom:s.y+10})))&&
      !c.lines.some(([a,b])=>rects.some(r=>segmentHitsBox(stars[a],stars[b],r)));
  }
  function markerSpacing(stars){
    // Close catalogue pairs may blend, but must not erase each other's markers.
    return stars.map((s,i)=>Math.min(...stars.filter((p,j)=>i!==j&&angularDistance(s,p)>=0.2).map(p=>Math.hypot(p.x-s.x,p.y-s.y))));
  }
  function preferredSize(c,width,height){
    const core=c.points.slice(0,c.stars.length),span=Math.max(c.bounds.width,c.bounds.height);
    const gaps=core.map((s,i)=>Math.min(...core.filter((_,j)=>i!==j).map(p=>Math.hypot(p.x-s.x,p.y-s.y)/span))).filter(d=>d>1e-5).sort((a,b)=>a-b);
    const gap=gaps[Math.floor(gaps.length*.2)]||.1;
    const screen=Math.max(0,Math.min(width,height));
    // All size targets are viewport-relative; uniform resizing preserves the base scale ratio.
    return Math.max(screen*.25,Math.min(width*.9,height*.85,screen*.024/gap));
  }
  function freeFrames(width,height,rects){
    let frames=[{left:18,top:18,right:width-18,bottom:height-18}];
    for(const r of rects){
      frames=frames.flatMap(f=>!intersects(f,r)?[f]:[
        {...f,right:Math.min(f.right,r.left)}, {...f,left:Math.max(f.left,r.right)},
        {...f,bottom:Math.min(f.bottom,r.top)}, {...f,top:Math.max(f.top,r.bottom)}
      ]).filter(f=>f.right-f.left>=24&&f.bottom-f.top>=24);
      frames=frames.filter((f,i)=>!frames.some((g,j)=>i!==j&&g.left<=f.left&&g.right>=f.right&&g.top<=f.top&&g.bottom>=f.bottom&&(g.left<f.left||g.right>f.right||g.top<f.top||g.bottom>f.bottom||j<i)));
    }
    return frames;
  }
  function fitFigure(c,width,height,rects,measure,scale=2,random=Math.random){
    const fewStarsFactor=c.stars.length<=6?.62:1;
    const base=preferredSize(c,width,height)*scale*fewStarsFactor,span=Math.max(c.bounds.width,c.bounds.height);
    const frames=freeFrames(width,height,rects),candidates=[];
    for(const f of frames){
      const maxW=(f.right-f.left-20)*fewStarsFactor,maxH=(f.bottom-f.top-20)*fewStarsFactor;
      const size=Math.min(base,maxW*span/c.bounds.width,maxH*span/c.bounds.height);
      if(size<=0)continue;
      for(const factor of [1,.9,.8,.65,.5,.35,.28,.22,.16]){
        const s=size*factor,halfX=s*c.bounds.width/span/2,halfY=s*c.bounds.height/span/2;
        const left=f.left+halfX+10,right=f.right-halfX-10,top=f.top+halfY+10,bottom=f.bottom-halfY-10;
        const positions=[[(left+right)/2,(top+bottom)/2],[left,top],[right,bottom],[left,bottom],[right,top]];
        for(let i=0;i<5;i++)positions.push([left+random()*(right-left),top+random()*(bottom-top)]);
        for(const [cx,cy] of positions)candidates.push({cx,cy,size:s,tie:random()});
      }
    }
    candidates.sort((a,b)=>b.size-a.size||a.tie-b.tie);
    const primaryId=brightest(c.stars,c.abbr)?.id;
    const alphaId=alphaStar(c.stars,c.abbr)?.id;
    let fallbackLayout=null;
    for(const frame of candidates){
      const candidate=layout(c,frame.cx,frame.cy,frame.size),core=candidate.stars.slice(0,c.stars.length);
      if(core.some(p=>p.x<18||p.x>width-18||p.y<18||p.y>height-18))continue;
      const visible=candidate.stars.filter(p=>inViewport(p,width,height));
      if(!clearFigure(c,visible,rects))continue;
      if(visible.some(p=>{const r=appearance(p.mag,p.bv).radius*4;return rects.some(b=>intersects(b,{left:p.x-r,right:p.x+r,top:p.y-r,bottom:p.y+r}));}))continue;
      const blocked=b=>rects.some(r=>intersects(b,r))||c.lines.some(([i,j])=>segmentHitsBox(candidate.stars[i],candidate.stars[j],b));
      const boxes=labels(visible,width,height,blocked,text=>measure(text,12),primaryId,alphaId);
      if(boxes.filter(b=>b.star.landmark).length!==visible.filter(p=>p.landmark).length||!boxes.some(b=>b.star.primary))continue;
      const hasAlpha=!alphaId||!visible.some(p=>p.id===alphaId)||boxes.some(b=>b.star.alpha);
      const title=caption(core,c.name,width,height,blocked,text=>measure(text,18),boxes,'',alphaId||primaryId);
      if(!title)continue;
      const spacing=markerSpacing(candidate.stars);
      candidate.stars.forEach((s,i)=>{s.spacing=spacing[i];});
      const gaps=core.flatMap((s,i)=>core.slice(i+1).map(p=>({distance:Math.hypot(p.x-s.x,p.y-s.y),stars:[s.name,p.name]}))).sort((a,b)=>a.distance-b.distance);
      const unobstructed=Math.min(base,(width-56)*span/c.bounds.width,(height-56)*span/c.bounds.height);
      const interfaceLimited=rects.length>0&&frame.size<unobstructed*.5;
      const currentResult={layout:{...candidate,frame,labels:[...boxes,title]},diagnostic:{abbr:c.abbr,viewport:{width,height},placed:true,size:frame.size,closestPair:gaps[0]||null,
        interfaceLimited,blockers:interfaceLimited?rects.map(r=>({element:r.element||'interface',left:r.left,right:r.right,top:r.top,bottom:r.bottom})):[]}};
      if(hasAlpha)return currentResult;
      if(!fallbackLayout)fallbackLayout=currentResult;
    }
    if(fallbackLayout)return fallbackLayout;
    return {layout:null,diagnostic:{abbr:c.abbr,viewport:{width,height},placed:false,
      reason:frames.length?'No complete figure with its title, main star and visible landmark labels fits the available space.':'Interface occupies all available space.',
      blockers:rects.map(r=>({element:r.element||'interface',left:r.left,right:r.right,top:r.top,bottom:r.bottom}))}};
  }
  const brightest=(stars,abbr=null)=>stars.filter(s=>Number.isFinite(s.mag)&&(!abbr||!s.constellation||s.constellation===abbr)).reduce((best,s)=>!best||s.mag<best.mag?s:best,null);
  const alphaStar=(stars,abbr=null)=>stars.find(s=>s.bayer==='α'&&(!abbr||!s.constellation||s.constellation===abbr));
  function labels(stars,width,height,blocked,measure,primaryId=null,alphaId=null){
    const boxes=[];
    const primary=stars.find(s=>!s.landmark&&s.id===primaryId);
    const alpha=alphaId&&alphaId!==primaryId?stars.find(s=>!s.landmark&&s.id===alphaId):null;
    const namedStar=(s,isPrimary,isAlpha)=>({...s,label:(s.bayer?s.bayer+' ':'')+s.name,primary:isPrimary,alpha:isAlpha});
    const candidates=[...stars.filter(p=>p.landmark),...(primary?[namedStar(primary,true,primary.id===alphaId)]:[])];
    if(alpha)candidates.push(namedStar(alpha,false,true));
    for(const s of candidates){
      const labelWidth=measure(s.label)+12,r=appearance(s.mag,s.bv).radius+10;
      const choices=[0,12,24,40,60].flatMap(offset=>[
        {left:s.x+r+offset,top:s.y-11},{left:s.x-labelWidth-r-offset,top:s.y-11},
        {left:s.x-labelWidth/2,top:s.y-r-22-offset},{left:s.x-labelWidth/2,top:s.y+r+offset},
        {left:s.x+r+offset,top:s.y-r-22-offset},{left:s.x-labelWidth-r-offset,top:s.y-r-22-offset},
        {left:s.x+r+offset,top:s.y+r+offset},{left:s.x-labelWidth-r-offset,top:s.y+r+offset}
      ]);
      const label=choices.map(p=>({...p,right:p.left+labelWidth,bottom:p.top+22,star:s})).find(b=>b.left>=8&&b.right<=width-8&&b.top>=8&&b.bottom<=height-8&&!blocked(b)&&!boxes.some(o=>intersects(b,o))&&!stars.some(p=>p!==s&&intersects(b,{left:p.x-8,right:p.x+8,top:p.y-8,bottom:p.y+8})));
      if(label)boxes.push(label);
    }
    return boxes;
  }
  function caption(stars,title,width,height,blocked,measure,reserved=[],subtitle='',anchorId=null){
    const left=Math.min(...stars.map(s=>s.x)),right=Math.max(...stars.map(s=>s.x)),top=Math.min(...stars.map(s=>s.y)),bottom=Math.max(...stars.map(s=>s.y));
    const anchorStar=anchorId?stars.find(s=>s.id===anchorId):null;
    const size=Math.max(measure(title),subtitle.length*6.5)+20,boxHeight=subtitle?54:32,cx=anchorStar?anchorStar.x:(left+right)/2,cy=(top+bottom)/2;
    const choices=[{left:cx-size/2,top:bottom+18},{left:cx-size/2,top:top-boxHeight-18},{left:right+18,top:cy-boxHeight/2},{left:left-size-18,top:cy-boxHeight/2}];
    // A zoomed chart may extend beyond all four sides; its title can still use free screen space.
    const fallback=[];
    for(let y=8;y<=height-boxHeight-8;y+=boxHeight+4)for(let x=8;x<=width-size-8;x+=Math.max(24,size/2))fallback.push({left:x,top:y});
    const anchorX=Math.max(8,Math.min(width-8,cx)),anchorY=Math.max(8,Math.min(height-8,cy));
    fallback.sort((a,b)=>Math.hypot(a.left+size/2-anchorX,a.top+13-anchorY)-Math.hypot(b.left+size/2-anchorX,b.top+13-anchorY));
    choices.push(...fallback);
    return choices.map(p=>({...p,right:p.left+size,bottom:p.top+boxHeight,star:{label:title,caption:true,scaleLabel:subtitle}})).find(b=>b.left>=8&&b.right<=width-8&&b.top>=8&&b.bottom<=height-8&&!blocked(b)&&!reserved.some(r=>intersects(b,r))&&!stars.some(p=>intersects(b,{left:p.x-10,right:p.x+10,top:p.y-10,bottom:p.y+10})))||null;
  }
  const exposedAlpha=(alpha,gain)=>1-(1-Math.max(0,Math.min(1,alpha)))**gain;
  const controlFactor=(position,maximum=4)=>{const p=Math.max(0,Math.min(1000,position));return p<=500?p/500:maximum**((p-500)/500);};
  return {centre,project,angularDistance,catalogue,appearance,layout,labels,caption,exposedAlpha,controlFactor,brightest,alphaStar,intersects,inViewport,landmarkIds,segmentHitsBox,clearFigure,markerSpacing,preferredSize,freeFrames,fitFigure};
})();
