import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../production/chat.js',import.meta.url),'utf8');
function presentation(data={contacts:[]}){
  const definitions=['dateLabel','time','roomTime','roomTitle'].map(name=>{
    const line=source.split('\n').find(line=>line.trimStart().startsWith('const '+name+'='));
    assert.ok(line,'Missing presentation helper '+name);return line;
  }).join('\n');
  return runInNewContext(definitions+'\n({dateLabel,time,roomTime,roomTitle})',{data,Date});
}
test('chat uses local dotted times and dates across year and midnight boundaries',()=>{
  const p=presentation(),now=new Date(2026,0,1,0,5).getTime();
  assert.equal(p.roomTime(new Date(2026,0,1,0,1).getTime(),now),'00.01');
  assert.equal(p.roomTime(new Date(2025,11,31,23,59).getTime(),now),'31.12.2025');
  assert.equal(p.roomTime(new Date(2025,0,1,0,1).getTime(),now),'01.01.2025');
  assert.equal(p.time(new Date(2026,9,16,20,55).getTime()),'20.55');
  assert.equal(p.dateLabel('1990-04-25'),'25.04.1990');
});
test('chat names use public roles, preserve group titles and do not invent internal roles',()=>{
  const p=presentation({contacts:[{id:'a',role:'Support'},{id:'b',role:'Teacher'},{id:'c',role:'DEVELOPER'}]});
  assert.equal(p.roomTitle({title:'Alice',kind:'direct',peerId:'a'}),'Alice · Support');
  assert.equal(p.roomTitle({title:'Bob',kind:'direct',peerId:'b'}),'Bob · Teacher');
  assert.equal(p.roomTitle({title:'Class',kind:'group',peerId:'a'}),'Class');
  assert.equal(p.roomTitle({title:'Hidden',kind:'direct',peerId:'c'}),'Hidden');
  assert.equal(p.roomTitle({title:'External',kind:'direct',peerRole:'Student'}),'External · Student');
});
test('unchanged receipts do not rebuild icons or mutate the timeline',()=>{
  const message={id:1,text:'hello',senderId:'me',createdMs:1,delivered:true};
  const content=JSON.stringify([message.id,message.text,message.format,message.files,message.forwarded,message.replyTo,message.replyText,message.replySender,message.sender,message.createdMs,message.examId,message.assignmentActive,message.pending,message.failed,message.deleted,message.editedMs,message.reactions]);
  let writes=0,scans=0;
  const receipt={getAttribute:()=> 'Delivered',setAttribute(){writes++;},classList:{toggle(){writes++;}},set innerHTML(value){writes++;},set title(value){writes++;}};
  const node={dataset:{content,msgId:'1'},querySelector:()=>receipt};
  const timeline={querySelector:()=>node,querySelectorAll:()=>[node]};
  const merge=runInNewContext(source.slice(source.indexOf('  function mergeNode('),source.indexOf('  function syncDays('))+'\nmergeNode',{timeline,CSS:{escape:String},icon:()=>{scans++;return '';},icons:()=>scans++});
  for(let i=0;i<100;i++)merge(message);
  assert.equal(writes,0);assert.equal(scans,0);
});
test('icon rendering coalesces a burst of updates into one animation frame',()=>{
  let scans=0;const callbacks=[];
  const icons=runInNewContext('let iconFrame=0;'+source.split('\n').find(line=>line.trimStart().startsWith('const icons='))+'\nicons',{
    document:{querySelectorAll:()=>[]},window:{lucide:{createIcons(options){assert.equal(options.nameAttr,'data-chat-icon');scans++;}}},requestAnimationFrame(callback){callbacks.push(callback);return callbacks.length;}
  });
  for(let i=0;i<100;i++)icons();
  assert.equal(callbacks.length,1);assert.equal(scans,0);callbacks[0]();assert.equal(scans,1);
  icons();assert.equal(callbacks.length,2);callbacks[1]();assert.equal(scans,2);
});
