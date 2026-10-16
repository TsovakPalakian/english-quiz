import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('application accepts only D1 and Neon and defaults to D1',async()=>{
  const {readDatabaseSelection}=await import('../src/database-selection.mjs');
  assert.equal((await readDatabaseSelection({get:async()=>null})).selection.provider,'d1');
  await assert.rejects(readDatabaseSelection({get:async()=>({json:async()=>({provider:'legacy-provider',revision:0,scope:'site'})})}),e=>e.status===503);
  const {databaseStatus}=await import('../src/database-administration.mjs');
  assert.deepEqual(databaseStatus({}).providers.map(p=>p.id).sort(),['d1','neon']);
});
test('runtime no longer contains a remote SQLite HTTP transport or dependency',()=>{
  const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
  assert.ok(!Object.keys(pkg.dependencies||{}).some(name=>name.startsWith('@libsql/')));
  for(const file of readdirSync(resolve(root,'src')).filter(name=>name.endsWith('.mjs'))){
    const source=readFileSync(resolve(root,'src',file),'utf8');
    assert.ok(!source.includes('/v2/pipeline'),file);
    assert.ok(/^[a-z][a-z0-9.-]*\.mjs$/.test(file),file);
  }
});
test('renamed module imports resolve throughout application, tooling and tests',()=>{
  for(const directory of ['src','scripts','db'])for(const name of readdirSync(resolve(root,directory)).filter(n=>/\.(mjs|js)$/.test(n))){
    const path=resolve(root,directory,name),source=readFileSync(path,'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.(?:mjs|js))['"]/g))assert.ok(existsSync(resolve(dirname(path),match[1]))||existsSync(resolve(root,match[1])),directory+'/'+name+' -> '+match[1]);
  }
});
