import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mainPreview} from './turso-main-preview.mjs';
import {pdfAssetPaths,pdfAssetFile} from './turso-pdf-assets.mjs';
import {defaultSnapshot} from './run-turso-stage.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'rollback/turso-worker-assets');
mkdirSync(dir,{recursive:true,mode:0o700});
if(process.argv.includes('--hooks-only')){
  // Preserve the last accepted assets, especially unrelated local CSS changes.
  writeFileSync(resolve(dir,'preview.js'),mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'staging/main-hooks.js'),'utf8')));
  copyFileSync(resolve(root,'staging/main-bridge.js'),resolve(dir,'main-bridge.js'));
  console.log('Updated TEST JavaScript only; other accepted assets unchanged.');process.exit(0);
}
// These paths are NEVER publicPaths. run_worker_first + the owner-bound inline
// route are mandatory: raw asset requests are rejected before ASSETS.fetch.
const inlineDirectory=resolve(defaultSnapshot,'inline-media');
if(existsSync(inlineDirectory)){
  const files=readdirSync(inlineDirectory);if(files.length>32)throw new Error('Inline asset bound exceeded.');
  mkdirSync(resolve(dir,'private-migration-media'),{recursive:true,mode:0o700});
  for(const file of files){
    if(!/^[a-f0-9]{64}\.bin$/.test(file))throw new Error('Unsafe inline asset filename.');
    const bytes=readFileSync(resolve(inlineDirectory,file));
    if(!bytes.length||bytes.length>5_000_000||createHash('sha256').update(bytes).digest('hex')!==file.slice(0,-4))throw new Error('Inline asset checksum mismatch.');
    writeFileSync(resolve(dir,'private-migration-media',file),bytes,{mode:0o600});
  }
}
for(const path of pdfAssetPaths()){
  const asset=pdfAssetFile(path),target=resolve(dir,path.slice(1));
  mkdirSync(resolve(target,'..'),{recursive:true,mode:0o700});copyFileSync(asset.file,target);
}
// Explicit allowlist: never copy .dev.vars, configurations, backups or accounts.
for(const name of ['preview.css','almond-blossom.jpg'])copyFileSync(resolve(root,name),resolve(dir,name));
writeFileSync(resolve(dir,'preview.js'),mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'staging/main-hooks.js'),'utf8')));
for(const [name,source] of [['main-bridge.js','staging/main-bridge.js'],['main-stage.css','staging/main-stage.css']])copyFileSync(resolve(root,source),resolve(dir,name));
copyFileSync(resolve(defaultSnapshot,'local-catalogs/demonstratives.js'),resolve(dir,'demonstratives.js'));
const html=readFileSync(resolve(root,'preview.html'),'utf8').replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g,'')
  .replace('</head>','<link rel="stylesheet" href="/main-stage.css"></head>').replace(/<body[^>]*>/,m=>m+'<div id="turso-main-banner"><p>TEST Turso — отдельный Worker. Рабочий сайт не переключён. <button id="turso-main-refresh">Проверить сервер</button><button id="turso-main-retry">Повторить</button></p><div id="turso-main-status" role="status"></div></div>')
  .replace('<script src="grammar.js">','<script src="/main-bridge.js"></script><script src="grammar.js">');
writeFileSync(resolve(dir,'preview.html'),html);writeFileSync(resolve(dir,'index.html'),html);
console.log('Built allowlisted TEST Worker assets in rollback/turso-worker-assets; no secrets copied.');
