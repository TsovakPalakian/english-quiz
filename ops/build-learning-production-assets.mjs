// Build locally from site/ (HTML/CSS source) and private/ (untracked inline media); never deploy or copy credentials.
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mainPreview} from './learning-main-preview.mjs';
import {pdfAssetPaths,pdfAssetFile} from './learning-pdf-assets.mjs';
import {buildPreview} from './build-preview.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
buildPreview();
const target=resolve(root,'rollback/production-assets'),accepted=resolve(root,'site');
const config=readFileSync(resolve(root,'wrangler.toml'),'utf8');
assert.match(config,/^DB_PROVIDER = "d1"$/m);assert.match(config,/^preview_urls = false$/m);
const host=config.match(/^CONTENT_ALLOWED_HOST = "([a-z0-9.-]+)"$/m)?.[1];
assert.equal(host,'learn-english.tsovakpalakian.workers.dev');
const liveHost=readFileSync(resolve(root,'wrangler.toml'),'utf8').match(/^CONTENT_ALLOWED_HOST = "([a-z0-9.-]+)"$/m)?.[1];
assert.ok(liveHost&&/^[a-z0-9.-]+$/.test(liveHost),'Production host is required');
mkdirSync(target,{recursive:true,mode:0o700});
const english=JSON.parse(readFileSync(resolve(root,'production/ui-english.json'),'utf8'));
const presentation=text=>Object.entries(english).sort(([a],[b])=>b.length-a.length).reduce((value,[from,to])=>value.replaceAll(from,to),text).replaceAll('тестовой Learning','Learning').replaceAll('тестовую Learning','Learning')
  .replaceAll('тестового сервера','сервера').replaceAll('тестовом сервере','сервере')
  .replaceAll('разрешённого тестового стенда','разрешённого сайта').replaceAll('разрешённом тестовом стенде','разрешённом сайте');
for(const name of ['preview.css','almond-blossom.jpg','theme-init.js','demonstratives.js','main-stage.css','favicon.svg','favicon.png','favicon.ico'])
  copyFileSync(resolve(accepted,name),resolve(target,name));
writeFileSync(resolve(target,'main-stage.css'),readFileSync(resolve(accepted,'main-stage.css'),'utf8')+'\n'+readFileSync(resolve(root,'production/notification.css'),'utf8')+'\n'+readFileSync(resolve(root,'production/material-upgrades.css'),'utf8')+'\n'+readFileSync(resolve(root,'production/essential.css'),'utf8')+'\n'+readFileSync(resolve(root,'production/exams.css'),'utf8'));
copyFileSync(resolve(root,'production/catalog-loader.js'),resolve(target,'catalog-loader.js'));
copyFileSync(resolve(root,'production/database-context.js'),resolve(target,'database-context.js'));
for(const name of ['speakout-editor.js','speakout-editor.css','text-colors.js'])copyFileSync(resolve(root,'production',name),resolve(target,name));
for(const name of ['heic-to-1.6.6.js','fflate-0.8.2.js','chat-archive-worker.js','heic-to-LICENSE.txt','fflate-LICENSE.txt','chat-media-dependencies.txt'])copyFileSync(resolve(root,'production',name),resolve(target,name));
const soundCatalog=JSON.parse(readFileSync(resolve(root,'production/notification-catalog.json'),'utf8'));
assert.ok(soundCatalog.length>=100&&new Set(soundCatalog.map(sound=>sound.id)).size===soundCatalog.length);
mkdirSync(resolve(target,'notification-audio'),{recursive:true});
for(const sound of soundCatalog){assert.match(sound.file,/^\/notification-audio\/[a-z0-9-]+\.wav$/);const bytes=readFileSync(resolve(root,'production'+sound.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),sound.sha256);copyFileSync(resolve(root,'production'+sound.file),resolve(target,'.'+sound.file));}
for(const name of ['CC0.txt','SOURCES.json'])copyFileSync(resolve(root,'production/notification-audio',name),resolve(target,'notification-audio',name));
writeFileSync(resolve(target,'messages.js'),'window.NotificationSoundCatalog='+JSON.stringify(soundCatalog.map(({id,name,group,duration,file})=>({id,name,group,duration,file})))+';\n'+readFileSync(resolve(root,'production/notification-sounds.js'),'utf8')+'\n'+readFileSync(resolve(root,'production/chat.js'),'utf8'));
copyFileSync(resolve(root,'production/chat.css'),resolve(target,'messages.css'));
for(const name of ['chat-background.png','chat-icons.js','chat-inter.ttf','chat-font-license.txt'])copyFileSync(resolve(root,'production',name),resolve(target,name));
let bridge=readFileSync(resolve(root,'client/main/main-bridge.js'),'utf8');
const anchor="const mediaAllowed=()=>['127.0.0.1','learn-english-learning-integrated-test.east-tarsal.workers.dev'].includes(location.hostname);";
assert.equal(bridge.split(anchor).length,2);
bridge=bridge.replace(anchor,`const mediaAllowed=()=>${JSON.stringify([...new Set([host,liveHost])])}.includes(location.hostname);`);
writeFileSync(resolve(target,'main-bridge.js'),presentation(bridge));
assert.ok(!/[А-Яа-яЁё]/.test(presentation(bridge)),'Untranslated bridge UI text');
assert.ok(!/[А-Яа-яЁё]/.test(presentation(readFileSync(resolve(root,'client/main/main-hooks.js'),'utf8'))),'Untranslated hook UI text');
writeFileSync(resolve(target,'preview.js'),presentation(mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'client/main/main-hooks.js'),'utf8')))
  .replaceAll('fetch("tense-bank.json")','window.LearningLoadCatalog("TENSE_BANK").then(data=>({ok:true,json:async()=>data}))'));
let preview=readFileSync(resolve(target,'preview.js'),'utf8');
assert.equal(preview.split('    function show(id) {').length,2);
preview=preview.replace('    function show(id) {',"    function show(id) {\n      if(id==='messages' && (viewAccount || accountChecked && !authUser))id='account';");
writeFileSync(resolve(target,'preview.js'),preview);
writeFileSync(resolve(target,'preview.js'),preview+'\n'+readFileSync(resolve(root,'client/main/exam-workflow.js'),'utf8'));
const version=name=>createHash('sha256').update(readFileSync(resolve(target,name))).digest('hex').slice(0,16);
const scoring='(()=>{\n'+readFileSync(resolve(root,'src/exam-scoring.mjs'),'utf8').replace(/^export /gm,'')+'\nwindow.MaterialScoring={examAnswered,examChildren,examAnswerQuestions,examElementMax,examTaskMax,examGrading,validateExamScoring,memoryDeck,memoryScore};})();';
const grammar='(()=>{'+readFileSync(resolve(root,'src/grammar-content.mjs'),'utf8').replace(/^export /gm,'')+'\nwindow.GrammarDetails=grammarDetails;window.GrammarReferences=grammarReferences;window.GrammarGroupNames=grammarGroupNames;window.GrammarUi=grammarUi;})();';
const loader=(scoring+'\n'+readFileSync(resolve(root,'production/grammar-categories.js'),'utf8')+'\n'+grammar+'\n'+readFileSync(resolve(root,'production/color-picker.js'),'utf8')+'\n'+readFileSync(resolve(root,'production/material-quiz.js'),'utf8')+'\n'+readFileSync(resolve(root,'production/speakout-cache.js'),'utf8')+'\n'+readFileSync(resolve(root,'production/catalog-loader.js'),'utf8')).replace(/script\.src='\/preview\.js(?:\?[^']*)?'/,"script.src='/preview.js?v="+version('preview.js')+"'")
  .replace('document.body.append(script);',"script.addEventListener('load',()=>{const icons=document.createElement('script');icons.src='/chat-icons.js?v="+version('chat-icons.js')+"';icons.addEventListener('load',()=>{const messages=document.createElement('script');messages.src='/messages.js?v="+version('messages.js')+"';document.body.append(messages);});document.body.append(icons);});document.body.append(script);");
writeFileSync(resolve(target,'catalog-loader.js'),loader);
let html=readFileSync(resolve(accepted,'preview.html'),'utf8');
html=html.replace('>Approved accounts</button>','>Approved accounts &amp; Groups</button>').replace('<button type="button" role="tab" data-admin-tab="groups" aria-selected="false">Groups</button>','');
html=html.replace('<head>','<head><script src="/database-context.js?v='+version('database-context.js')+'"></script>'+['preview.js','chat-icons.js','messages.js'].map(name=>'<link rel="preload" as="script" href="/'+name+'?v='+version(name)+'">').join(''));
html=html.replace(/<section id="groups">[\s\S]*?<\/section>/,section=>section.replace('<p class="sub">In date order.</p>','').replace('<button class="btn primary" type="button" id="groupNew">+ New group</button>',''));
html=html.replace('<div id="groupList"></div>','<p class="sub" id="groupOverview"></p><div id="groupControls" hidden><button class="btn primary" type="button" id="groupNew">+ Add subgroup</button><input id="groupSearch" type="search" aria-label="Search subgroups" placeholder="Search subgroups"></div><div id="groupList"></div>');
html=html.replace('<section id="admingroup">','<section id="admingrouplevel"><div class="meta"><button class="btn ghost" type="button" data-nav-back data-fallback="admin">Back</button><h1 id="adminLevelTitle">Groups</h1></div><div id="adminLevelBody"></div></section>\n<section id="admingroup">');
const everydayAnchor='      <h2 class="lib-h">Words</h2>\n      <div class="decks">';
assert.equal(html.split(everydayAnchor).length,2);
const myWordsAnchor='<button class="file-card" type="button" data-jump="add"><span class="num" id="myWordCount">0</span><b>My words</b><span class="label">one field · both directions</span></button>';
assert.equal(html.split(myWordsAnchor).length,2);
html=html.replace(myWordsAnchor,myWordsAnchor+'\n        <button class="file-card" type="button" data-jump="everyday"><span class="num">3</span><b>Essential English</b><span class="label">Speech essentials · Basic sets · Topics</span></button>');
html=html.replaceAll('My words','My cards').replaceAll('Words you added yourself.','Cards you added yourself.');
html=html.replace('<section id="library">',readFileSync(resolve(root,'production/essential.html'),'utf8')+'\n<section id="library">');
html=html.replace('<section id="library">',readFileSync(resolve(root,'production/grammar-categories.html'),'utf8')+'\n<section id="library">');
const irregularAnchor='<button class="file-card" type="button" data-jump="verbs"><span class="num" id="verbCount">0</span><b>Irregular verbs</b><span class="label">three forms</span></button>';
assert.equal(html.split(irregularAnchor).length,2);
html=html.replace(irregularAnchor,irregularAnchor+'\n        <button class="file-card" type="button" data-jump="grammarcategories"><span class="num">7</span><b>Grammatical Categories</b><span class="label">word classes · syntax · meaning</span></button>');
const brandRow=readFileSync(resolve(root,'preview.html'),'utf8').match(/^    <div class="brand-row">.*<\/div>$/m)?.[0];
assert.ok(brandRow,'Account avatar header missing');
const oldBrand='    <button class="brand" type="button" data-jump="home">English</button>';
assert.equal(html.split(oldBrand).length,2);
html=html.replace(oldBrand,brandRow).replace(/(<div class="side-foot">\s*)<button class="btn ghost" type="button" data-jump="account">My account<\/button>/,'$1');
assert.ok(!/<div class="side-foot">\s*<button[^>]+data-jump="account"/.test(html));
assert.equal(html.split('<section id="account">').length,2);
html=html.replace('<section id="account">',readFileSync(resolve(root,'production/chat.html'),'utf8')+'\n<section id="account">')
  .replace('</head>','<link rel="stylesheet" href="/messages.css?v='+version('messages.css')+'"></head>');
const banner='TEST Learning — отдельный Worker. Рабочий сайт не переключён.';
assert.equal(html.split(banner).length,2);
const productionHtml=html.replace(banner,'')
  .replace('<html','<html data-learning-compact-notices="true"')
  .replace('id="learning-main-banner"','id="learning-main-banner" data-compact-notices="true" hidden')
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
const inline=resolve(root,'private/private-migration-media'),files=readdirSync(inline);assert.ok(files.length<=32);
mkdirSync(resolve(target,'private-migration-media'),{recursive:true,mode:0o700});
for(const file of files){assert.match(file,/^[a-f0-9]{64}\.bin$/);const bytes=readFileSync(resolve(inline,file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.slice(0,-4));
  writeFileSync(resolve(target,'private-migration-media',file),bytes,{mode:0o600});}
console.log(JSON.stringify({status:'production-assets-built-locally',deploymentPerformed:false,inlineObjects:files.length}));
