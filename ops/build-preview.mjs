// Builds root preview.js from client/*.js and production/chat.js from production/chat/*.js in file-name order: npm run build:preview
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {wordwallSource} from '../src/learning-embed.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const GREEK_MAP = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ',
  Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ',
  Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω'
};
export function getGreek(s){
  if(!s)return null;
  const b=s.bayer||'';
  const m=b.match(/^([αβγδεζηθικλμνξοπρστυφχψω])/u);
  if(m)return m[1];
  const catBayer=(s.catalogue?.bayer||b.split(' ')[0]||'').replace(/-.*$/,'');
  return GREEK_MAP[catBayer]||null;
}
export function inviteQrDependency(){
  const library=readFileSync(require.resolve('qrcode-generator'),'utf8');
  return 'const createInviteQr = (() => { const module = {exports:{}}; const exports = module.exports;\n'+library+'\nreturn module.exports; })();\n';
}
export const bundles={'preview.js':'client','production/chat.js':'production/chat'};
export function skyCatalogueFactory(){
  const catalogue=JSON.parse(readFileSync(resolve(root,'data/constellations_catalogue.json'),'utf8'));
  const seen=new Set();
  const packed=catalogue.filter(c=>{if(seen.has(c.abbr))return false;seen.add(c.abbr);return true;}).map(c=>{
    const pack=(s)=>{
      const p=s.coordinates;
      if(!p||!Number.isFinite(p.rightAscensionDeg)||!Number.isFinite(p.declinationDeg))throw Error('Missing sky coordinates: '+s.id);
      return {id:s.id,name:s.catalogue?.properName||s.name,ra:p.rightAscensionDeg,dec:p.declinationDeg,hip:s.catalogue?.hip??null,constellation:s.catalogue?.constellation??null,
        mag:s.photometry?.apparentMagnitude??s.photometry?.magnitudeV??null,bv:s.photometry?.colorIndexBV??null,bayer:getGreek(s),
        spect:s.catalogueSpectralType||s.spectralType||null};
    };
    const packObject=(part,object)=>({...pack({...part,id:part.identifier?object.id+':'+part.identifier:object.id,name:object.name}),
      mag:part.displayPhotometry?.magnitudeV??part.photometry?.magnitudeV??null,
      estimated:part.displayPhotometry?.estimated??false,kind:object.type});
    const objects=c.deepSkyObjects.flatMap(o=>{
      if(o.components?.length)return o.components.map(p=>packObject(p,o));
      if(o.catalogue?.reviewRequired||!o.coordinates)return [];
      return [packObject(o,o)];
    });
    const connected=new Set(c.connections.flat());
    // Retain own unconnected stars, but not unused neighbouring vertices from an older atlas.
    const stars=c.stars.filter(s=>!s.catalogue?.constellation||s.catalogue.constellation===c.abbr||connected.has(s.id));
    return {
      name:c.name,abbr:c.abbr,genitive:c.genitive||null,meaning:c.meaning||null,family:c.family||null,
      hemisphere:c.hemisphere||null,quadrant:c.quadrant||null,visibility:c.visibility||null,
      bestSeason:c.bestSeason||null,bestViewingMonth:c.bestViewingMonth||null,areaSqDeg:c.areaSqDeg||null,
      sizeRank:c.sizeRank||null,brightestStar:c.brightestStar||null,starsWithPlanets:c.starsWithPlanets??null,
      stars:stars.map(pack),connections:c.connections,objects
    };
  });
  return 'const STUDIO_SKY_CATALOGUE='+JSON.stringify(packed)+';\n';
}
export function reviewEditorFactory(){
  const source=readFileSync(resolve(root,'client/demos/quiz-review-editor.js'),'utf8');
  if(/^import /m.test(source))throw Error('Shared review editor must be dependency-free.');
  return 'const integratedReviewEditor = (() => {\n'+source.replace(/^export function /gm,'function ')+'\nreturn {emptyReviewItems,renderReviewItems,readReviewItems,editReviewItems,reviewItemPreview};\n})();\n';
}
export function speechUIFactory(){
  const source=readFileSync(resolve(root,'client/demos/speech-practice-ui.js'),'utf8');
  if(/^import /m.test(source)||source.split('export function createSpeechPracticeUI(').length!==2)throw Error('Shared speech UI entry changed.');
  return 'const createIntegratedSpeechPracticeUI = (() => {\n'+source.replace('export function createSpeechPracticeUI(','function createSpeechPracticeUI(')+'\nreturn createSpeechPracticeUI;\n})();\n';
}
export function providerUIFactory(){
  const source=readFileSync(resolve(root,'client/demos/provider-settings-ui.js'),'utf8');
  if(/^import /m.test(source)||source.split('export function createProviderSettingsUI(').length!==2)throw Error('Shared provider UI entry changed.');
  return 'const createIntegratedProviderSettingsUI = (() => {\n'+source.replace('export function createProviderSettingsUI(','function createProviderSettingsUI(')+'\nreturn createProviderSettingsUI;\n})();\n';
}
// Plain scripts, not modules: parts share one scope, so each part must end with a newline.
export function bundleSource(target){
  const dir=resolve(root,bundles[target]);
  const passkeys=target==='preview.js'?readFileSync(resolve(dirname(require.resolve('@simplewebauthn/browser')),'../dist/bundle/index.umd.min.js'),'utf8')+'\n':'';
  return (target==='preview.js'?skyCatalogueFactory()+wordwallSource.toString()+'\n'+inviteQrDependency()+passkeys+speechUIFactory()+providerUIFactory()+reviewEditorFactory():'')+readdirSync(dir).filter(name=>name.endsWith('.js')).sort().map(name=>{
    const text=readFileSync(resolve(dir,name),'utf8');
    if(!text.endsWith('\n'))throw new Error(bundles[target]+'/'+name+' must end with a newline');
    return text;
  }).join('');
}
export function buildPreview(){for(const target of Object.keys(bundles))writeFileSync(resolve(root,target),bundleSource(target));}

if(process.argv[1]===fileURLToPath(import.meta.url))buildPreview();
