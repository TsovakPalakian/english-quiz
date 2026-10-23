import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {skyCatalogueFactory} from '../ops/build-preview.mjs';
const scope={};
runInNewContext(skyCatalogueFactory()+readFileSync('client/06-auth-astronomy.js','utf8')+readFileSync('client/06-auth-geometry.js','utf8')+';globalThis.astro=StudioSkyAstronomy;globalThis.sky=astro.catalogue(STUDIO_SKY_CATALOGUE);globalThis.geometry=StudioSkyGeometry;',scope);
const {astro,sky,geometry:g}=scope;
const obstacle={left:40,right:60,top:40,bottom:60};
assert.ok(astro.segmentHitsBox({x:0,y:50},{x:100,y:50},obstacle));
assert.ok(astro.segmentHitsBox({x:50,y:0},{x:50,y:100},obstacle));
assert.equal(astro.segmentHitsBox({x:0,y:0},{x:30,y:30},obstacle),false);
assert.equal(astro.clearFigure({lines:[[0,1]]},[{x:0,y:50},{x:100,y:50}],[obstacle]),false,'A line crossing the UI is rejected even with both stars outside');
assert.ok(astro.clearFigure({lines:[[0,1]]},[{x:0,y:0},{x:100,y:0}],[obstacle]));
assert.ok(new Set(sky.map(c=>Math.round(astro.preferredSize(c,1440,1000)))).size>10,'Figure scale depends on its own projected spacing');
const raw=JSON.parse(readFileSync('data/constellations_catalogue.json','utf8'));
assert.equal(sky.length,88,'All 88 sourced constellations are drawn once, including Ophiuchus');
for(const c of sky){
  const original=raw.find(x=>x.abbr===c.abbr);
  assert.equal(c.stars.length,original.stars.length,'Disconnected stars are retained');
  for(let i=0;i<c.stars.length;i++){
    const s=c.stars[i],source=original.stars[i];
    assert.equal(s.mag,source.photometry.apparentMagnitude,'Renderer uses sourced V, not historical magnitude');
    assert.equal(s.ra,source.coordinates.rightAscensionDeg);assert.equal(s.dec,source.coordinates.declinationDeg);
    assert.equal(s.hip,source.catalogue.hip);
  }
  assert.equal(JSON.stringify(c.lines.map(edge=>edge.map(i=>c.stars[i].id))),JSON.stringify(original.connections));
  const layout=astro.layout(c,500,400,500);
  // Independent inverse gnomonic projection catches handedness, RA wrapping and
  // declination errors rather than comparing the projection with itself.
  const ra=c.origin.ra*Math.PI/180,dec=c.origin.dec*Math.PI/180;
  const origin=[Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];
  const east=[-Math.sin(ra),Math.cos(ra),0],north=[-Math.sin(dec)*Math.cos(ra),-Math.sin(dec)*Math.sin(ra),Math.cos(dec)];
  for(const p of c.points){
    const v=origin.map((n,i)=>n-p.x*east[i]-p.y*north[i]);
    const recovered={ra:(Math.atan2(v[1],v[0])*180/Math.PI+360)%360,dec:Math.atan2(v[2],Math.hypot(v[0],v[1]))*180/Math.PI};
    assert.ok(Math.abs(recovered.dec-p.dec)<1e-8,c.abbr+' declination');
    assert.ok(Math.abs(((recovered.ra-p.ra+540)%360)-180)<1e-8,c.abbr+' right ascension');
  }
  for(const o of c.objects){
    const source=original.deepSkyObjects.flatMap(x=>x.components?.length?x.components.map(p=>({...p,id:x.id+':'+p.identifier})):x).find(x=>x.id===o.id);
    assert.equal(o.mag,source.displayPhotometry.magnitudeV);
    assert.equal(o.estimated,source.displayPhotometry.estimated);
  }
  for(let i=0;i<c.points.length;i++)for(let j=0;j<i;j++){
    const projected=Math.hypot(c.points[i].x-c.points[j].x,c.points[i].y-c.points[j].y);
    const screen=Math.hypot(layout.stars[i].x-layout.stars[j].x,layout.stars[i].y-layout.stars[j].y);
    if(projected>1e-8)assert.ok(Math.abs(screen/projected-500/Math.max(c.bounds.width,c.bounds.height))<1e-7,'No individual star repulsion');
  }
}
const crux=sky.find(c=>c.abbr==='Cru'),cen=sky.find(c=>c.abbr==='Cen');
assert.equal(JSON.stringify(crux.points.filter(s=>s.landmark).map(s=>s.id)),JSON.stringify(['alpha_cen','hadar']));
assert.ok(cen.points.filter(s=>s.landmark).every(s=>s.abbr==='Cru'));
assert.equal(sky.find(c=>c.abbr==='UMi').points.some(s=>s.id==='polaris'&&s.landmark),false);
for(const c of sky)for(const star of c.points.filter(s=>s.landmark))assert.ok(astro.angularDistance(star,c.origin)<90,'Back-hemisphere landmarks are not fabricated nearby');
assert.ok(sky.find(c=>c.abbr==='And').points.some(s=>s.id==='polaris'&&s.landmark));
const cvn=sky.find(c=>c.abbr==='CVn');
assert.ok(cvn.points.some(s=>s.id==='polaris'&&s.landmark),'References are not discarded by a size heuristic');
assert.equal(cvn.bounds.width,Math.max(...cvn.stars.map(s=>astro.project(s,cvn.origin).x))-Math.min(...cvn.stars.map(s=>astro.project(s,cvn.origin).x)),'Only core stars determine chart scale');
assert.ok(astro.angularDistance({ra:359,dec:0},{ra:1,dec:0})<2.001);
assert.ok(Math.abs(astro.centre([{ra:359,dec:0},{ra:1,dec:0}]).ra%360)<1e-6);
assert.equal(astro.project({ra:180,dec:0},{ra:0,dec:0}),null);
assert.ok(astro.project({ra:80,dec:0},{ra:0,dec:0}),'No 60 degree cutoff');
assert.ok(astro.project({ra:1,dec:0},{ra:0,dec:0}).x<0,'East is left');
assert.ok(astro.project({ra:0,dec:1},{ra:0,dec:0}).y<0,'North is up');
assert.ok(Math.abs(astro.appearance(0).flux/astro.appearance(5).flux-100)<1e-10);
assert.ok(astro.appearance(.77).radius>astro.appearance(1.97).radius,'Acrux is brighter than Polaris');
const testLayout=astro.layout(crux,500,400,100),visible=testLayout.stars.filter(s=>astro.inViewport(s,1000,800));
const twice=astro.layout(crux,500,400,200),zero=astro.layout(crux,500,400,0);
for(let i=0;i<testLayout.stars.length;i++){
  assert.ok(Math.abs(twice.stars[i].x-500-2*(testLayout.stars[i].x-500))<1e-9);
  assert.ok(Math.abs(twice.stars[i].y-400-2*(testLayout.stars[i].y-400))<1e-9);
  assert.equal(zero.stars[i].x,500);assert.equal(zero.stars[i].y,400);
}
const labels=astro.labels(visible,1000,800,()=>false,s=>s.length*7);
assert.equal(labels.length,2);assert.ok(labels.every(l=>l.star.landmark));assert.ok(!astro.intersects(labels[0],labels[1]));
let singleFound=false;
for(let size=100;size<=500;size+=5){
  const stars=astro.layout(crux,500,400,size).stars.filter(s=>astro.inViewport(s,1000,800));
  if(stars.filter(s=>s.landmark).length!==1)continue;
  assert.equal(astro.labels(stars,1000,800,()=>false,s=>s.length*7).length,1,'A single visible pointer is labelled independently');singleFound=true;break;
}
assert.ok(singleFound);
const caption=astro.caption(testLayout.stars.slice(0,4),'Crux',1000,800,()=>false,s=>s.length*8,labels);
assert.ok(caption);assert.equal(caption.star.label,'Crux');assert.ok(labels.every(l=>!astro.intersects(caption,l)));
for(const gain of [.3,1,3])assert.ok(astro.exposedAlpha(.2,gain)<astro.exposedAlpha(.7,gain),'Brightness adjustment preserves ordering');
assert.ok(astro.exposedAlpha(.3,2)>astro.exposedAlpha(.3,1));assert.equal(astro.exposedAlpha(0,3),0);
assert.equal(astro.exposedAlpha(.8,0),0);assert.equal(astro.exposedAlpha(1,0),0);
assert.equal(astro.controlFactor(0),0);assert.equal(astro.controlFactor(500),1);assert.equal(astro.controlFactor(1000),4);
assert.equal(astro.controlFactor(0,100),0);assert.equal(astro.controlFactor(500,100),1);assert.equal(astro.controlFactor(1000,100),100);
assert.equal(astro.controlFactor(0,10000),0);assert.equal(astro.controlFactor(500,10000),1);assert.equal(astro.controlFactor(1000,10000),10000);
assert.ok(astro.controlFactor(501,100)>1&&astro.controlFactor(501,100)<1.01);
assert.equal(astro.brightest(crux.stars).name,'Acrux');
assert.equal(astro.brightest(sky.find(c=>c.abbr==='Pyx').stars,'Pyx').constellation,'Pyx','A brighter neighbouring figure vertex is not the main star');
const primaryLabels=astro.labels(testLayout.stars,1000,800,()=>false,s=>s.length*7,astro.brightest(crux.stars).id);
assert.equal(primaryLabels.filter(b=>b.star.primary).length,1);
const primaryCaption=astro.caption(testLayout.stars.slice(0,crux.stars.length),'Crux',1000,800,()=>false,s=>s.length*7,primaryLabels);
assert.ok(primaryCaption);assert.ok(primaryLabels.every(b=>!astro.intersects(primaryCaption,b)));
assert.equal(astro.controlFactor(495),.99);assert.ok(astro.controlFactor(505)>1&&astro.controlFactor(505)<1.02);
for(let p=5;p<=1000;p+=5)assert.ok(astro.controlFactor(p)>astro.controlFactor(p-5));
const renderer=readFileSync('client/06-auth-sky.js','utf8');
assert.match(renderer,/Object\.freeze\(\{background:20,constellation:100\}\)/);
assert.match(renderer,/const constellationScale=2;/);
assert.doesNotMatch(renderer,/authSkyTuning|lumiscia-sky-brightness|lumiscia-sky-scale-|lumiscia-sky-distance-scale/,'Temporary controls and their persisted overrides were removed');
assert.match(renderer,/geometry\.nearest\(s,backgroundObstacles\)/,'Ambient stars do not avoid the entire text/interface container');
assert.match(renderer,/if\(phase==='hold'\)for\(const r of uiRects\)/,'Only completed figures are excluded from the interface');
assert.doesNotMatch(renderer,/ctx\.ellipse\(|for\(const o of layout\.objects\)/,'Hollow DSO markers are not rendered');
assert.match(renderer,/const uiRects=boxes\.map\(pad\)/,'Ready figures protect entire UI containers');
const linesSource=renderer.slice(renderer.indexOf('function drawLines('),renderer.indexOf('function render('));
assert.doesNotMatch(linesSource,/geometry\.blocked|opacity\s*</,'Every catalogue connection is submitted even with an offscreen endpoint');
const obstacles=[g.shape(720,470,240,260,'rounded'),g.shape(290,260,65,80,'ellipse'),g.shape(1100,700,80,55,'organic')],route=g.router(obstacles);
for(const [a,b] of [[{x:100,y:400},{x:1250,y:400}],[{x:700,y:100},{x:700,y:900}],[{x:100,y:100},{x:1250,y:900}]]){
  const path=route(a,b);assert.equal(path[0].x,a.x);assert.equal(path.at(-1).x,b.x);
  for(let i=0;i<=400;i++)assert.equal(obstacles.some(o=>g.contains(g.point(path,i/400),o.points)),false);
}
console.log('Sky: catalogue projections, exact connections, external landmark labels, fluxes and obstacle routes passed.');
const directions=new Set(),durations=new Set(),alphas=new Set(),counts=new Set();
let seed=42;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<200;i++){
  const delay=g.flybyDelay(random);assert.ok(delay>=7000&&delay<12000);
  counts.add(random()<.5?1:2);
  const star=g.flyby(1440,900,random),a=star.path[0],b=star.path.at(-1);
  assert.equal(star.path.length,33);assert.ok(star.duration>=450&&star.duration<1400);
  assert.ok(star.alpha>=.22&&star.alpha<.87);
  assert.ok(star.path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const acrossX=a.x<0&&b.x>1440||b.x<0&&a.x>1440,acrossY=a.y<0&&b.y>900||b.y<0&&a.y>900;
  assert.ok(acrossX||acrossY,'Flight crosses opposite screen edges');
  directions.add(acrossX?(b.x>a.x?'right':'left'):(b.y>a.y?'down':'up'));
  durations.add(star.duration);alphas.add(star.alpha);
}
assert.equal(directions.size,4);assert.equal(counts.size,2);assert.ok(durations.size>100&&alphas.size>100);
