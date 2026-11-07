import {launchChromium,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {extractFunctions} from './helpers/extract-function.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const source=readFileSync(new URL('../production/chat/40-messages.js',import.meta.url),'utf8');
const grouping=extractFunctions(source, 'sameSenderSeries', 'syncDays');
const css=readFileSync(new URL('../production/chat.css',import.meta.url),'utf8');
const browser=await launchChromium(chromium);
try {
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  await page.setContent('<div id="messages" class="on"><div id="fixture" style="width:600px"></div></div>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:`
    const timeline=document.getElementById('fixture');
    const data={rooms:[{id:'fixture',kind:'group'}]},room='fixture';
    const isGroupChat=row=>['group','circle'].includes(row?.kind);
    const avatar=(name,group,id)=>'<span class="chat-avatar" data-avatar-subject="'+id+'">'+name.slice(0,2)+'</span>';
    const scheduleProfiles=()=>{};
    ${grouping}
    window.renderSeries=(kind='group')=>{
      data.rooms[0].kind=kind;
      timeline.innerHTML='';
      const rows=[['a',0],['a',60000],['a',120001],['b',120002],['a',120003],['a',120004]];
      rows.forEach(([sender,time],i)=>{
        const node=document.createElement('article');
        node.className='msg-message'+(sender==='a'?' is-own':'');
        Object.assign(node.dataset,{msgId:String(i),senderId:sender,senderName:sender,createdMs:String(time+1),day:i===5?'Tomorrow':'Today'});
        node.innerHTML='<header><strong>'+sender+'</strong></header><p>Message '+i+'</p><footer>19.24</footer>';
        timeline.append(node);
      });
      syncDays();
    };
  `});
  for(const width of [1000,390]) {
    await page.setViewportSize({width,height:800});
    await page.locator('#fixture').evaluate(node=>{node.style.width='100%';});
    for(const kind of ['group','circle','direct']) {
      await page.evaluate(kind=>window.renderSeries(kind),kind);
      assert.equal(await page.locator('.is-series-continuation').count(),1,'Only adjacent same-sender messages within 60 seconds group');
      assert.equal(await page.locator('article[data-msg-id="1"]>header').isVisible(),false);
      assert.equal(await page.locator('article[data-msg-id="2"]>header').isVisible(),true,'61-second gap starts a new series');
      assert.equal(await page.locator('article>footer').count(),6,'All message times remain');
      assert.equal(await page.locator('.msg-message.is-own .msg-sender-avatar').count(),0);
      assert.equal(await page.locator('.msg-sender-avatar').count(),kind==='direct'?0:1);
      const positions=await page.locator('.msg-message').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().left));
      const boxes=await page.locator('.msg-message').evaluateAll(nodes=>nodes.map(node=>({own:node.classList.contains('is-own'),group:node.classList.contains('is-group-message'),visibility:getComputedStyle(node).contentVisibility,marginLeft:getComputedStyle(node).marginLeft})));
      if(kind==='direct'){
        assert.ok(positions[0]>positions[3],'Direct own messages stay on the right');
        assert.ok(boxes.every(row=>row.visibility==='visible'&&!row.group));
        assert.ok(boxes.filter(row=>row.own).every(row=>row.marginLeft!=='0px'));
        assert.ok(boxes.filter(row=>!row.own).every(row=>row.marginLeft==='0px'));
      }else{
        assert.ok(positions[0]>positions[3],'Own group messages stay on the right');
        assert.ok(boxes.filter(row=>row.own).every(row=>row.group&&row.marginLeft!=='44px'));
        assert.ok(boxes.filter(row=>!row.own).every(row=>row.group&&row.marginLeft==='44px'));
      }
      await page.evaluate(()=>{
        document.querySelector('article[data-msg-id="0"]').remove();
        syncDays();
      });
      assert.equal(await page.locator('article[data-msg-id="1"]>header').isVisible(),true,'Deleting the series head restores the next author');
    }
  }
  console.log('Message series: 60-second boundary, sender/day changes, deletion, group avatars and group/direct alignment passed on desktop/mobile');
} finally { await browser.close(); }
