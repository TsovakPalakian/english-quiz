import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {skyCatalogueFactory} from '../ops/build-preview.mjs';

const catalogue=JSON.parse(readFileSync('data/constellations_catalogue.json','utf8'));
const oph=catalogue.find(c=>c.abbr==='Oph'),hips=new Map(oph.stars.map(s=>[s.id,s.catalogue.hip]));
// Independently transcribed labelled Go Astronomy outline, interior and branches.
const paths=[[86032,83000,80883,79593,79882,81377,84012,86263,88048,86742,86032],
  [86742,87108,84012],[83000,81377,80894,80343],[84012,84970,84405]];
const key=edge=>[...edge].sort((a,b)=>a-b).join(':');
const expected=new Set(paths.flatMap(path=>path.slice(1).map((hip,i)=>key([path[i],hip]))));

test('Ophiuchus matches the reviewed Go Astronomy outline rather than the old atlas',()=>{
  const actual=oph.connections.map(edge=>key(edge.map(id=>hips.get(id))));
  assert.equal(actual.length,17);assert.deepEqual(new Set(actual),expected);
  for(const pair of [[84012,86742],[87108,88048],[84970,85423],[80343,80473]])assert.ok(!new Set(actual).has(key(pair)),'Old incorrect connection '+pair);
  const source=JSON.parse(readFileSync('data/constellation_go_astronomy_source.json','utf8')).reviewedOverrides.Oph;
  assert.deepEqual(source.lines,paths);
  assert.equal(createHash('sha256').update(readFileSync('references/constellations/go-astronomy/Oph.jpg')).digest('hex'),source.imageSha256);
});
test('new vertices retain pinned astrometry and photometry; existing disconnected stars remain real stars',()=>{
  const rows=JSON.parse(readFileSync('data/constellations_hyg_source.json','utf8')).rows;
  for(const hip of [86263,84405]){
    const star=oph.stars.find(s=>s.catalogue.hip===hip),row=rows.find(r=>Number(r.hip)===hip);
    assert.ok(star&&row);assert.ok(star.isSkeleton);
    assert.ok(Math.abs(star.coordinates.rightAscensionDeg-Number(row.ra)*15)<1e-6);
    assert.equal(star.coordinates.declinationDeg,Number(row.dec));
    assert.equal(star.photometry.apparentMagnitude,Number(row.mag));
    assert.equal(star.catalogue.constellation,hip===86263?'Ser':'Oph');
  }
  for(const hip of [80628,80569,80473,85423]){
    const star=oph.stars.find(s=>s.catalogue.hip===hip);assert.ok(star);assert.equal(star.isSkeleton,false);
  }
});
test('renderer keeps the shared xi Ser vertex, every edge and a complete figure across viewport sizes',()=>{
  const scope={};runInNewContext(skyCatalogueFactory()+readFileSync('client/06-auth-astronomy.js','utf8')+';globalThis.astro=StudioSkyAstronomy;globalThis.oph=astro.catalogue(STUDIO_SKY_CATALOGUE).find(c=>c.abbr==="Oph");',scope);
  const {astro,oph:figure}=scope;
  assert.equal(figure.stars.length,19);
  assert.deepEqual(new Set(Array.from(figure.lines,edge=>key(Array.from(edge,index=>figure.stars[index].hip)))),expected);
  for(const [width,height] of [[1440,1000],[390,844],[844,390]]){
    const result=astro.fitFigure(figure,width,height,[],(text,size)=>text.length*size*.55,2,()=>.5);
    assert.ok(result.layout,'Ophiuchus fits '+width+'x'+height);
    assert.ok(result.layout.stars.slice(0,figure.stars.length).every(p=>p.x>=18&&p.x<=width-18&&p.y>=18&&p.y<=height-18));
    const stars=result.layout.stars,alpha=stars.find(s=>s.hip===86032),theta=stars.find(s=>s.hip===84970);
    assert.ok(alpha.y<theta.y,'North remains up without mirroring or moving the source stars');
  }
});
