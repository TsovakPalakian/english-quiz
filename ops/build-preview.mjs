// Builds root preview.js from client/*.js and production/chat.js from production/chat/*.js in file-name order: npm run build:preview
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {wordwallSource} from '../src/learning-embed.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
export function inviteQrDependency(){
  const library=readFileSync(require.resolve('qrcode-generator'),'utf8');
  return 'const createInviteQr = (() => { const module = {exports:{}}; const exports = module.exports;\n'+library+'\nreturn module.exports; })();\n';
}
export const bundles={'preview.js':'client','production/chat.js':'production/chat'};
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
  return (target==='preview.js'?wordwallSource.toString()+'\n'+inviteQrDependency()+passkeys+speechUIFactory()+providerUIFactory()+reviewEditorFactory():'')+readdirSync(dir).filter(name=>name.endsWith('.js')).sort().map(name=>{
    const text=readFileSync(resolve(dir,name),'utf8');
    if(!text.endsWith('\n'))throw new Error(bundles[target]+'/'+name+' must end with a newline');
    return text;
  }).join('');
}
export function buildPreview(){for(const target of Object.keys(bundles))writeFileSync(resolve(root,target),bundleSource(target));}

if(process.argv[1]===fileURLToPath(import.meta.url))buildPreview();
