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
const presentation=text=>text.replaceAll('тестовой Turso','Turso').replaceAll('тестовую Turso','Turso')
  .replaceAll('тестового сервера','сервера').replaceAll('тестовом сервере','сервере')
  .replaceAll('разрешённого тестового стенда','разрешённого сайта').replaceAll('разрешённом тестовом стенде','разрешённом сайте');
for(const name of ['preview.css','almond-blossom.jpg','demonstratives.js','main-stage.css'])
  copyFileSync(resolve(accepted,name),resolve(target,name));
let bridge=readFileSync(resolve(root,'staging/main-bridge.js'),'utf8');
const anchor="const mediaAllowed=()=>['127.0.0.1','learn-english-turso-integrated-test.east-tarsal.workers.dev'].includes(location.hostname);";
assert.equal(bridge.split(anchor).length,2);
bridge=bridge.replace(anchor,`const mediaAllowed=()=>${JSON.stringify([host,'learn-english.east-tarsal.workers.dev'])}.includes(location.hostname);`);
writeFileSync(resolve(target,'main-bridge.js'),presentation(bridge));
writeFileSync(resolve(target,'preview.js'),presentation(mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'staging/main-hooks.js'),'utf8'))));
const html=readFileSync(resolve(accepted,'preview.html'),'utf8');
const banner='TEST Turso — отдельный Worker. Рабочий сайт не переключён.';
assert.equal(html.split(banner).length,2);
for(const name of ['preview.html','index.html'])writeFileSync(resolve(target,name),html.replace(banner,'Учебные данные сохраняются на сервере.'));
for(const path of pdfAssetPaths()){
  const file=resolve(target,path.slice(1));mkdirSync(resolve(file,'..'),{recursive:true,mode:0o700});copyFileSync(pdfAssetFile(path).file,file);
}
const inline=resolve(accepted,'private-migration-media'),files=readdirSync(inline);assert.ok(files.length<=32);
mkdirSync(resolve(target,'private-migration-media'),{recursive:true,mode:0o700});
for(const file of files){assert.match(file,/^[a-f0-9]{64}\.bin$/);const bytes=readFileSync(resolve(inline,file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.slice(0,-4));
  writeFileSync(resolve(target,'private-migration-media',file),bytes,{mode:0o600});}
console.log(JSON.stringify({status:'production-assets-built-locally',deploymentPerformed:false,inlineObjects:files.length}));
