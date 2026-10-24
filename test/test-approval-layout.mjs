import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
assert.ok(readFileSync('rollback/production-assets/preview.js','utf8').includes('class="account-approval-row" data-list-row'));
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
try{
  const page=await browser.newPage();
  await page.setContent('<html data-theme="almond"><body><main><section class="on"><div class="card"><p>Waiting for approval</p>'+['Student_4','Student_3','Student_2','Student_1_with_a_long_name'].map(name=>'<div class="account-approval-row"><div><b>'+name+'</b><br><span class="hint">'+name.toLowerCase()+'@gmail.com · '+name+' · Student</span></div><select aria-label="Student group"><option>A1 Group</option></select><button class="btn primary">Approve</button><button class="btn">Reject</button></div>').join('')+'</div></section></main></body></html>');
  for(const file of ['preview.css','main-stage.css'])await page.addStyleTag({content:readFileSync('rollback/production-assets/'+file,'utf8')});
  await page.addStyleTag({content:'body{padding:16px!important}main{margin:0!important;max-width:100%}section.on{display:block;padding:0}'});
  for(const width of [1280,700,390,320]){
    await page.setViewportSize({width,height:900});
    const rows=await page.locator('.account-approval-row').evaluateAll(nodes=>nodes.map(node=>[...node.children].map(child=>{const r=child.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})));
    for(const row of rows)for(const box of row)assert.ok(box.x>=0&&box.x+box.width<=width+1,'Fits viewport '+width);
    for(let column=1;column<4;column++)assert.ok(rows.every(row=>Math.abs(row[column].x-rows[0][column].x)<1),'Aligned column '+column+' at '+width);
    for(const row of rows){assert.equal(row[1].height,row[2].height);assert.equal(row[2].height,row[3].height);if(width>700)assert.ok(Math.abs(row[1].y-row[2].y)<1);}
    await Promise.resolve();
  }
  console.log('Approval columns, control heights and responsive layout passed');
}finally{await browser.close();}
