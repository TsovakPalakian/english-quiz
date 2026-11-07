import test from 'node:test';
import assert from 'node:assert/strict';
import {integratedWorker,feedbackAttachmentRecord,feedbackAttachmentHeaders} from '../src/learning-integrated-worker.mjs';

function pngBytes(){return Uint8Array.from([137,80,78,71,13,10,26,10]);}
function dataUrl(mime,bytes){return 'data:'+mime+';base64,'+Buffer.from(bytes).toString('base64');}

test('a client image type cannot store HTML and a broken data URL is rejected',()=>{
  const png=feedbackAttachmentRecord({name:'shot.png',mime:'text/html',dataUrl:dataUrl('text/html',pngBytes())});
  assert.equal(png.mime,'image/png');
  assert.match(png.dataUrl,/^data:image\/png;base64,/);
  assert.throws(()=>feedbackAttachmentRecord({name:'page.html',mime:'image/png',size:1,dataUrl:dataUrl('image/png',Buffer.from('<html><script>alert(1)</script></html>'))}),error=>error.status===400&&!error.dataUrl);
  assert.throws(()=>feedbackAttachmentRecord({name:'shot.png',mime:'image/png',size:1,dataUrl:'data:image/png;base64,%%%'}),error=>error.status===400);
  const log=feedbackAttachmentRecord({name:'test.log',mime:'text/plain',dataUrl:dataUrl('text/plain',Buffer.from('test'))});
  assert.equal(log.mime,'text/plain');
  const html=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(feedbackAttachmentHeaders(html)['Content-Disposition'],'attachment');
  assert.equal(feedbackAttachmentHeaders(html)['Content-Type'],'application/octet-stream');
  assert.equal(feedbackAttachmentHeaders(html)['X-Content-Type-Options'],'nosniff');
  assert.equal(feedbackAttachmentHeaders(Buffer.from('%PDF-1.7'))['Content-Disposition'],'attachment');
  assert.equal(feedbackAttachmentHeaders(pngBytes())['Content-Type'],'image/png');
});

test('GET /api/feedback/attachment sniffs bytes and does not trust the stored type',async()=>{
  const mediaStore=new Map();
  mediaStore.set('feedback-attachments/page.html',{bytes:Buffer.from('<html><script>alert(1)</script></html>'),contentType:'image/png'});
  mediaStore.set('feedback-attachments/shot.png',{bytes:pngBytes(),contentType:'text/html'});
  let actor={id:'admin-1',role:'ADMIN'};
  const app=integratedWorker({authenticate:async()=>actor,studyDatabase:()=>({read:async()=>[],atomic:async()=>{}})});
  const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'stage.example',STAGE_WRITES:'true',DB:{prepare:()=>({bind(){return this;},async first(){return null;}})},MEDIA:{async get(key){const item=mediaStore.get(key);return item?{body:item.bytes,httpMetadata:{contentType:item.contentType}}:null;}}};
  const html=await app.fetch(new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/page.html'),env,{});
  assert.equal(html.status,200);
  assert.equal(html.headers.get('Content-Type'),'application/octet-stream');
  assert.equal(html.headers.get('Content-Disposition'),'attachment');
  assert.equal(html.headers.get('X-Content-Type-Options'),'nosniff');
  const image=await app.fetch(new Request('https://stage.example/api/feedback/attachment?key=feedback-attachments/shot.png'),env,{});
  assert.equal(image.headers.get('Content-Type'),'image/png');
  assert.equal(image.headers.get('Content-Disposition'),'inline');
  assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');
});
