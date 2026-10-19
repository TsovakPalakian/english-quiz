import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../client/57a-dashboard.js',import.meta.url),'utf8');
function fixture(){
  const saved=new Map(),years=[{textContent:''}];
  const scope={authUser:{id:'one'},viewAccount:null,window:{},sessionStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},
    document:{getElementById:()=>null,querySelectorAll:selector=>selector==='[data-copyright-year]'?years:[]}};
  const api=runInNewContext(source+'\n({homeRecentItems,rememberHomeNavigation,installShellBranding})',scope);
  return {...api,scope,saved,years};
}
test('Recent pages are deduplicated, bounded and isolated by account',()=>{
  const f=fixture();for(const id of ['days','exams','allwords','tenses','library','days'])f.rememberHomeNavigation(id);
  assert.deepEqual(Array.from(f.homeRecentItems(),row=>row.screen),['days','library','tenses','allwords']);
  f.scope.authUser={id:'two'};assert.equal(f.homeRecentItems().length,0);
  f.rememberHomeNavigation('exams');f.scope.viewAccount={id:'student'};f.rememberHomeNavigation('days');assert.equal(f.homeRecentItems().length,0);
  f.scope.viewAccount=null;assert.equal(f.homeRecentItems()[0].screen,'exams');
});
test('Malformed local history never becomes HTML or an invalid date',()=>{
  const f=fixture();f.saved.set('enquiz-home-recent:one',JSON.stringify([null,{screen:'__proto__',at:1},{screen:'<script>',at:1},{screen:'days',at:1e30}]));
  assert.equal(f.homeRecentItems().length,0);f.saved.set('enquiz-home-recent:one','{');assert.equal(f.homeRecentItems().length,0);
});
test('Copyright uses the current client year without a server request',()=>{
  const f=fixture();f.scope.Date=class extends Date{getFullYear(){return 2031;}};
  f.installShellBranding();assert.equal(f.years[0].textContent,'2031');
});
