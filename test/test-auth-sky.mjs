import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('client/06-auth-scene.js','utf8'),geometry=readFileSync('client/06-auth-geometry.js','utf8');
const node={getBoundingClientRect:()=>({left:500,right:940,top:220,bottom:720,width:440,height:500})};
const scope={innerWidth:1440,innerHeight:1000,document:{querySelector:()=>node}};
runInNewContext(geometry+'\n'+source.slice(source.indexOf('  let obstacles='),source.indexOf('  function startSky()'))+'\nglobalThis.sky={prepareObstacles,safeZones};globalThis.geometry=StudioSkyGeometry;',scope);
const g=scope.geometry,obstacles=[g.shape(720,470,240,260,'rounded'),g.shape(290,260,65,80,'ellipse'),g.shape(1100,700,80,55,'organic')],route=g.router(obstacles);
for(const [a,b] of [[{x:100,y:400},{x:1250,y:400}],[{x:700,y:100},{x:700,y:900}],[{x:100,y:100},{x:1250,y:900}]]){
  const path=route(a,b);assert.equal(path[0].x,a.x);assert.equal(path.at(-1).x,b.x);
  let previous=g.point(path,0);
  for(let i=0;i<=400;i++){const p=g.point(path,i/400);assert.equal(obstacles.some(o=>g.contains(p,o.points)),false,'Rounded, elliptical and organic obstacles are avoided');assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<20);previous=p;}
  assert.ok(path.length>3,'Corners are rounded with sampled curves');
}
scope.sky.prepareObstacles('home');
const first=scope.sky.safeZones(),second=scope.sky.safeZones();
assert.ok(first.length>8,'Constellations have many available positions');assert.notDeepEqual(first,second,'Layouts are sampled anew, not selected from fixed regions');
assert.match(source,/GATHER_DURATION = 15000/);assert.match(source,/HOLD_DURATION = 8000/);assert.match(source,/MORPH_DURATION = 18000/);
assert.match(source,/length: 16/);assert.match(source,/Math\.max\(160/);
assert.doesNotMatch(source,/ctx\.clip\(/,'No hard mask cuts off star glows');
console.log('Sky: smooth multi-shape obstacle avoidance, randomized placement, slower timing and no hard clipping passed.');
