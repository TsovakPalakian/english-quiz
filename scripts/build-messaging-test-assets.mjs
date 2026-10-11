import {readFileSync,writeFileSync,copyFileSync,cpSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const target=resolve('rollback/turso-messaging-assets');
mkdirSync(target,{recursive:true});
// The input is the existing explicit-allowlist TEST build, never the workspace.
cpSync(resolve('rollback/turso-worker-assets'),target,{recursive:true});
for(const name of ['messages-test.js','messages-test.css'])copyFileSync(resolve('staging',name),resolve(target,name));
let preview=readFileSync(resolve(target,'preview.js'),'utf8');
if(preview.split('    function show(id) {').length!==2)throw new Error('Navigation guard anchor changed.');
preview=preview.replace('    function show(id) {',"    function show(id) {\n      if(id==='messages' && (viewAccount || accountChecked && !authUser))id='account';");
writeFileSync(resolve(target,'preview.js'),preview);
const fragment=readFileSync(resolve('staging/messages-test.html'),'utf8');
const version=name=>createHash('sha256').update(readFileSync(resolve(target,name))).digest('hex').slice(0,16);
let loader=readFileSync(resolve('production/catalog-loader.js'),'utf8');
loader=loader.replace(/script\.src='\/preview\.js[^']*'/,"script.src='/preview.js?v="+version('preview.js')+"'")
  .replace('document.body.append(script);',"script.addEventListener('load',()=>{const messages=document.createElement('script');messages.src='/messages-test.js?v="+version('messages-test.js')+"';document.body.append(messages);});document.body.append(script);");
writeFileSync(resolve(target,'catalog-loader.js'),loader);
for(const name of ['index.html','preview.html']){
  let html=readFileSync(resolve(target,name),'utf8');
  if(html.split('<section id="account">').length!==2)throw new Error('Account layout anchor changed.');
  html=html.replace('<section id="account">',fragment+'\n<section id="account">')
    .replace('</head>','<link rel="stylesheet" href="/messages-test.css?v='+version('messages-test.css')+'"></head>')
    .replace(/<script src="(?:grammar|irregular|lesson-data|speakout|preview)\.js(?:\?[^"<>]*)?"><\/script>/g,'')
    .replace('</body>','<script src="/catalog-loader.js?v='+version('catalog-loader.js')+'"></script></body>');
  writeFileSync(resolve(target,name),html);
}
console.log('Messaging TEST assets built separately; production assets unchanged.');
