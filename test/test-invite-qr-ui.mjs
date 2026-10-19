import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {inviteQrDependency} from '../ops/build-preview.mjs';
const require=createRequire(import.meta.url),{chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage(),requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<div id="qr"></div>');
  await page.addScriptTag({content:inviteQrDependency()+readFileSync('client/invite-qr.js','utf8')});
  for(const secret of ['a'.repeat(48),'b'.repeat(48)]){
    const link='https://lumiscia.org/?invite=0123456789abcdef.'+secret;
    await page.evaluate(link=>paintInviteQr(document.getElementById('qr'),link),link);
    assert.match(await page.locator('#qr img').getAttribute('src'),/^data:image\/gif;base64,/);
    assert.equal(await page.locator('#qr img').getAttribute('alt'),'Invite QR code');
    for(const size of [180,0]){
      const pixels=await page.locator('#qr img').evaluate(async(img,size)=>{
        await img.decode();const canvas=document.createElement('canvas');canvas.width=size||img.naturalWidth;canvas.height=size||img.naturalHeight;
        const context=canvas.getContext('2d');context.drawImage(img,0,0,canvas.width,canvas.height);
        return {width:canvas.width,height:canvas.height,data:[...context.getImageData(0,0,canvas.width,canvas.height).data]};
      },size);
      assert.equal(jsQR(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height)?.data,link,'QR decodes to the original invite at '+(size||'native')+'px');
    }
  }
  await page.screenshot({path:'/private/tmp/lumiscia-local-invite-qr.png'});
  await page.evaluate(()=>paintInviteQr(document.getElementById('qr'),''));
  assert.equal(await page.locator('#qr').isVisible(),false);
  assert.equal(await page.locator('#qr img').count(),0);
  await page.evaluate(()=>paintInviteQr(document.getElementById('qr'),'x'.repeat(10000)));
  assert.equal(await page.locator('#qr img').count(),0);
  assert.match(await page.locator('#qr').innerText(),/Copy the invite link/);
  assert.deepEqual(requests,[],'Rendering and updating an invite QR makes no network requests');
  console.log('Local invite QR: decoded at displayed/native sizes, replacement, empty/error fallback and zero network requests passed');
}finally{await browser.close();}
