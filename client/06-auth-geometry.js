const StudioSkyGeometry=(()=>{
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function shape(cx,cy,rx,ry,kind='ellipse'){
    const points=[];
    if(kind==='rounded'){
      const radius=Math.min(28,rx*.35,ry*.5);
      for(let corner=0;corner<4;corner++){
        const angle=corner*Math.PI/2,ox=cx+(corner===0||corner===3?1:-1)*(rx-radius),oy=cy+(corner<2?1:-1)*(ry-radius);
        for(let i=0;i<=6;i++){const a=angle+i*Math.PI/12;points.push({x:ox+Math.cos(a)*radius,y:oy+Math.sin(a)*radius});}
      }
    }else for(let i=0;i<24;i++){const a=i*Math.PI/12,r=kind==='organic'?1+.12*Math.cos(a*3):1;points.push({x:cx+Math.cos(a)*rx*r,y:cy+Math.sin(a)*ry*r});}
    return {cx,cy,rx,ry,points};
  }
  function contains(p,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }return inside;
  }
  function nearest(p,obstacles){
    let best={distance:Infinity,nx:0,ny:0};
    for(const obstacle of obstacles){
      const points=obstacle.points,inside=contains(p,points);
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        const x=p.x-a.x-t*dx,y=p.y-a.y-t*dy,d=Math.hypot(x,y);
        if(d<Math.abs(best.distance))best={distance:inside?-d:d,nx:(inside?-1:1)*x/(d||1),ny:(inside?-1:1)*y/(d||1)};
      }
    }return best;
  }
  function intersects(a,b,c,d){
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    return cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;
  }
  function blocked(a,b,obstacles){
    return obstacles.some(o=>contains(a,o.points)||contains(b,o.points)||o.points.some((p,i)=>intersects(a,b,p,o.points[(i+1)%o.points.length])));
  }
  function router(obstacles){
    const nodes=obstacles.flatMap(o=>o.points.map(p=>({x:o.cx+(p.x-o.cx)*(o.rx+30)/o.rx,y:o.cy+(p.y-o.cy)*(o.ry+30)/o.ry}))).filter(p=>!obstacles.some(o=>contains(p,o.points)));
    let graph;
    return (a,b)=>{
      if(!blocked(a,b,obstacles))return [a,b];
      if(!graph){graph=nodes.map(()=>[]);nodes.forEach((p,i)=>{for(let j=0;j<i;j++)if(!blocked(p,nodes[j],obstacles)){const d=distance(p,nodes[j]);graph[i].push([j,d]);graph[j].push([i,d]);}});}
      const all=[...nodes,a,b],edges=graph.map(list=>[...list]),start=nodes.length,end=start+1;edges.push([],[]);
      for(let i=0;i<nodes.length;i++)for(const [index,p] of [[start,a],[end,b]])if(!blocked(nodes[i],p,obstacles)){const d=distance(nodes[i],p);edges[i].push([index,d]);edges[index].push([i,d]);}
      const costs=all.map(()=>Infinity),previous=[],seen=new Set();costs[start]=0;
      for(let step=0;step<all.length;step++){
        let k=-1;all.forEach((_,i)=>{if(!seen.has(i)&&(k<0||costs[i]<costs[k]))k=i;});
        if(k===end||!Number.isFinite(costs[k]))break;seen.add(k);
        for(const [i,d] of edges[k])if(costs[k]+d<costs[i]){costs[i]=costs[k]+d;previous[i]=k;}
      }
      if(!Number.isFinite(costs[end]))return [a,a];
      const path=[b];for(let k=end;k!==start;){k=previous[k];path.unshift(all[k]);}
      const smooth=[a];
      for(let i=1;i<path.length-1;i++){
        const p=path[i],before=path[i-1],after=path[i+1];let radius=Math.min(26,distance(before,p)*.25,distance(after,p)*.25),curve;
        do{
          const u={x:p.x+(before.x-p.x)*radius/(distance(before,p)||1),y:p.y+(before.y-p.y)*radius/(distance(before,p)||1)},v={x:p.x+(after.x-p.x)*radius/(distance(after,p)||1),y:p.y+(after.y-p.y)*radius/(distance(after,p)||1)};
          curve=Array.from({length:13},(_,j)=>{const t=j/12;return {x:(1-t)**2*u.x+2*(1-t)*t*p.x+t*t*v.x,y:(1-t)**2*u.y+2*(1-t)*t*p.y+t*t*v.y};});
          radius/=2;
        }while(radius>.5&&curve.some((q,j)=>j&&blocked(curve[j-1],q,obstacles)));
        if(curve.some((q,j)=>j&&blocked(curve[j-1],q,obstacles)))smooth.push(p);else smooth.push(...curve);
      }
      smooth.push(b);return smooth;
    };
  }
  function point(route,t){
    const lengths=route.lengths||(route.lengths=route.slice(1).map((p,i)=>distance(p,route[i])));let d=lengths.reduce((a,b)=>a+b,0)*t;
    for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const f=lengths[i]?Math.min(1,d/lengths[i]):1;return {x:route[i].x+(route[i+1].x-route[i].x)*f,y:route[i].y+(route[i+1].y-route[i].y)*f};}d-=lengths[i];}return route[0];
  }
  const flybyDelay=(random=Math.random)=>7000+random()*5000;
  function flyby(width,height,random=Math.random){
    const vertical=random()<.5,reverse=random()<.5,span=vertical?height:width,cross=vertical?width:height;
    const from=-48,to=span+48,start=random()*cross,end=random()*cross;
    const controls=[start,random()*cross,random()*cross,end];
    const path=Array.from({length:33},(_,i)=>{
      const t=i/32,u=1-t,along=from+(to-from)*(reverse?1-t:t);
      const across=u*u*u*controls[0]+3*u*u*t*controls[1]+3*u*t*t*controls[2]+t*t*t*controls[3];
      return vertical?{x:across,y:along}:{x:along,y:across};
    });
    return {path,duration:450+random()*950,radius:.8+random()*1.3,alpha:.22+random()*.65};
  }
  return {shape,contains,nearest,blocked,router,point,flybyDelay,flyby};
})();
