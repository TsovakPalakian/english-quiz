// Build locally from accepted TEST assets; never deploy or copy credentials.
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mainPreview} from './turso-main-preview.mjs';
import {pdfAssetPaths,pdfAssetFile} from './turso-pdf-assets.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=resolve(root,'rollback/turso-production-assets'),accepted=resolve(root,'rollback/turso-worker-assets');
const config=readFileSync(resolve(root,'production/wrangler.application.toml'),'utf8');
assert.match(config,/^CONTENT_WRITES = "false"$/m);assert.match(config,/^preview_urls = false$/m);
const host=config.match(/^CONTENT_ALLOWED_HOST = "([a-z0-9.-]+)"$/m)?.[1];
assert.equal(host,'learn-english-turso-production.east-tarsal.workers.dev');
mkdirSync(target,{recursive:true,mode:0o700});
const english=JSON.parse(readFileSync(resolve(root,'production/ui-english.json'),'utf8'));
const presentation=text=>Object.entries(english).sort(([a],[b])=>b.length-a.length).reduce((value,[from,to])=>value.replaceAll(from,to),text).replaceAll('тестовой Turso','Turso').replaceAll('тестовую Turso','Turso')
  .replaceAll('тестового сервера','сервера').replaceAll('тестовом сервере','сервере')
  .replaceAll('разрешённого тестового стенда','разрешённого сайта').replaceAll('разрешённом тестовом стенде','разрешённом сайте');
for(const name of ['preview.css','almond-blossom.jpg','theme-init.js','demonstratives.js','main-stage.css','favicon.svg','favicon.png','favicon.ico'])
  copyFileSync(resolve(accepted,name),resolve(target,name));
writeFileSync(resolve(target,'main-stage.css'),readFileSync(resolve(accepted,'main-stage.css'),'utf8')+'\n'+readFileSync(resolve(root,'production/notification.css'),'utf8'));
copyFileSync(resolve(root,'production/catalog-loader.js'),resolve(target,'catalog-loader.js'));
let bridge=readFileSync(resolve(root,'staging/main-bridge.js'),'utf8');
const anchor="const mediaAllowed=()=>['127.0.0.1','learn-english-turso-integrated-test.east-tarsal.workers.dev'].includes(location.hostname);";
assert.equal(bridge.split(anchor).length,2);
bridge=bridge.replace(anchor,`const mediaAllowed=()=>${JSON.stringify([host,'learn-english.east-tarsal.workers.dev'])}.includes(location.hostname);`);
writeFileSync(resolve(target,'main-bridge.js'),presentation(bridge));
assert.ok(!/[А-Яа-яЁё]/.test(presentation(bridge)),'Untranslated bridge UI text');
assert.ok(!/[А-Яа-яЁё]/.test(presentation(readFileSync(resolve(root,'staging/main-hooks.js'),'utf8'))),'Untranslated hook UI text');
writeFileSync(resolve(target,'preview.js'),presentation(mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'staging/main-hooks.js'),'utf8')))
  .replaceAll('fetch("tense-bank.json")','window.TursoLoadCatalog("TENSE_BANK").then(data=>({ok:true,json:async()=>data}))'));
const version=name=>createHash('sha256').update(readFileSync(resolve(target,name))).digest('hex').slice(0,16);
const loader=readFileSync(resolve(root,'production/catalog-loader.js'),'utf8').replace(/script\.src='\/preview\.js(?:\?[^']*)?'/,"script.src='/preview.js?v="+version('preview.js')+"'");
writeFileSync(resolve(target,'catalog-loader.js'),loader);
const html=readFileSync(resolve(accepted,'preview.html'),'utf8');
const banner='TEST Turso — отдельный Worker. Рабочий сайт не переключён.';
assert.equal(html.split(banner).length,2);
const productionHtml=html.replace(banner,'')
  .replace('<html','<html data-turso-compact-notices="true"')
  .replace('id="turso-main-banner"','id="turso-main-banner" data-compact-notices="true" hidden')
  .replace('>Проверить сервер</button>','>Reload server</button>')
  .replace('>Повторить</button>','>Retry</button>');
const pagedHtml=productionHtml.replace(/<script src="(?:grammar|irregular|lesson-data|speakout|preview)\.js(?:\?[^"<>]*)?"><\/script>/g,'')+'\n';
assert.ok(!/<script[^>]+src="\/?preview\.js(?:\?|"|$)/.test(pagedHtml));
assert.ok(pagedHtml.includes('</body>'));
const versionedHtml=pagedHtml.replace(/((?:src|href)="\/?)(preview\.css|theme-init\.js|main-bridge\.js|main-stage\.css)(?:\?[^"<>]*)?"/g,(_,prefix,name)=>prefix+name+'?v='+version(name)+'"');
for(const name of ['preview.html','index.html'])writeFileSync(resolve(target,name),versionedHtml.replace('</body>','<script src="/catalog-loader.js?v='+version('catalog-loader.js')+'"></script></body>'));
for(const path of pdfAssetPaths()){
  const file=resolve(target,path.slice(1));mkdirSync(resolve(file,'..'),{recursive:true,mode:0o700});copyFileSync(pdfAssetFile(path).file,file);
}
const inline=resolve(accepted,'private-migration-media'),files=readdirSync(inline);assert.ok(files.length<=32);
mkdirSync(resolve(target,'private-migration-media'),{recursive:true,mode:0o700});
for(const file of files){assert.match(file,/^[a-f0-9]{64}\.bin$/);const bytes=readFileSync(resolve(inline,file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.slice(0,-4));
  writeFileSync(resolve(target,'private-migration-media',file),bytes,{mode:0o600});}
console.log(JSON.stringify({status:'production-assets-built-locally',deploymentPerformed:false,inlineObjects:files.length}));
