import {chromiumExecutable,resolveTestDependency} from '../ops/check-environment.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(resolveTestDependency('playwright'));
const source=readFileSync('production/chat/80-dialogs.js','utf8');
const search=source.slice(source.indexOf('  function chatSearchRanges('),source.indexOf("  el('msgTextSearch').oninput"));
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable()});
try{
  const page=await browser.newPage();
  await page.setContent('<div id="messages"><input id="msgTextSearch"><select id="msgSearchMode"><option>prefix</option><option>exact</option><option>regex</option></select><input type="checkbox" id="msgSearchCase"><div id="msgSearchResults"></div><button id="msgSearchMore"></button><div id="timeline"><article data-msg-id="1" tabindex="-1"><div class="chat-message-text"><span style="color:rgb(58,235,238)">Hello he</span><b>llo</b> HELLO &lt;world&gt;</div></article></div></div>');
  await page.addStyleTag({content:readFileSync('production/chat.css','utf8')});
  await page.addScriptTag({content:`
    const el=id=>document.getElementById(id),timeline=el('timeline');
    const escape=text=>{const node=document.createElement('span');node.textContent=text;return node.innerHTML;};
    const stamp=()=>'',panel=()=>{},scheduleRead=()=>{};
    let room='room',kind='personal',searchToken=0,searchBefore=0,rightMode='search',stickBottom=true;
    async function request(){return {messages:[{id:1,sender:'Student',text:timeline.textContent,createdMs:1}],more:false};}
    ${search}
    window.runSearch=async(query,mode='prefix',sensitive=false)=>{
      el('msgTextSearch').value=query;el('msgSearchMode').value=mode;el('msgSearchCase').checked=sensitive;await search();
    };
    window.focusResult=()=>focusMessage(1,kind,'',true);
  `});
  for(const width of [1000,390]){
    await page.setViewportSize({width,height:800});
    for(const mode of ['prefix','exact','regex']){
      await page.evaluate(mode=>runSearch(mode==='regex'?'hel+o':'hello',mode),mode);
      assert.equal(await page.locator('#msgSearchResults mark').count(),3,mode+' highlights all result matches');
      assert.equal(await page.locator('#timeline mark').count(),4,mode+' preserves matches split across formatting');
      await page.evaluate(()=>focusResult());
      assert.equal(await page.locator('#timeline mark').count(),4,'Jumping to the message keeps highlighting without duplication');
      assert.equal(await page.locator('.chat-message-text').textContent(),'Hello hello HELLO <world>');
      assert.equal(await page.locator('.chat-message-text > span').evaluate(node=>node.style.color),'rgb(58, 235, 238)');
      assert.equal(await page.locator('#timeline mark').first().evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 224, 138)');
    }
    await page.evaluate(()=>runSearch('Hello','exact',true));
    assert.equal(await page.locator('#timeline mark').count(),1,'Case sensitivity is respected');
    await page.evaluate(()=>runSearch('<world>','exact'));
    assert.equal(await page.locator('#msgSearchResults mark').textContent(),'<world>','Query is escaped, not interpreted as HTML');
    await page.evaluate(()=>runSearch('[','regex'));
    assert.equal(await page.locator('#timeline mark').count(),0,'Invalid regex does not break rendering');
    await page.evaluate(()=>runSearch('','exact'));
    assert.equal(await page.locator('#messages mark').count(),0,'Clearing search removes all highlights');
  }
  console.log('Chat search: result and message highlighting, formatting, case, regex, escaping and clearing passed on desktop/mobile');
}finally{await browser.close();}
