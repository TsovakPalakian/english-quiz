import {mkdtempSync,mkdirSync,readdirSync,symlinkSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),directory=mkdtempSync('/private/tmp/english-neon-corpus-');
try{
  mkdirSync(join(directory,'scripts'));
  for(const name of ['src','staging','production','migrations','rollback','db','examples','node_modules','preview.js','preview.html','preview.css','grammar.js','lesson-data.js','irregular.js','speakout.js','tense-bank.json','demonstratives.js','theme-init.js','wrangler.toml','package.json'])if(existsSync(join(root,name)))symlinkSync(join(root,name),join(directory,name));
  for(const name of readdirSync(join(root,'scripts')))if(name!=='test-learning-main.mjs')symlinkSync(join(root,'scripts',name),join(directory,'scripts',name));
  const source=readFileSync(join(root,'scripts/test-learning-main.mjs'),'utf8'),needle='return {sqlite,db,source,users,gone,password,queries:()=>queries};';
  if(source.split(needle).length!==2)throw Error('Canonical fixture changed; update the shadow harness.');
  const generated="import {after} from 'node:test';\nimport {neonShadow,closeNeonShadow} from "+JSON.stringify(new URL('./neon-shadow-fixture.mjs',import.meta.url).href)+";\nafter(closeNeonShadow);\n"+source.replace(needle,'return {sqlite,db:neonShadow(sqlite,db),source,users,gone,password,queries:()=>queries};');
  writeFileSync(join(directory,'scripts/test-learning-main.mjs'),generated);
  const pattern=process.argv[2];
  const child=spawn(process.execPath,['--test','--test-reporter=spec',...(pattern?['--test-name-pattern='+pattern]:[]),join(directory,'scripts/test-learning-main.mjs')],{stdio:'inherit'});
  const [code]=await once(child,'exit');process.exitCode=code??1;
}finally{rmSync(directory,{recursive:true,force:true});}
