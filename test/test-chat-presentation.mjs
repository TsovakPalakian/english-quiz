import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {extractFunction} from './helpers/extract-function.mjs';

const source=readFileSync(new URL('../production/chat.js',import.meta.url),'utf8');
// Top-level statements inside the chat IIFE start at a two-space indent.
function definition(name){
  const lines=source.split('\n'),start=lines.findIndex(line=>line.startsWith('  const '+name+' = '));
  if(start<0)return '';
  let end=start+1;while(end<lines.length&&!/^ {2}\S/.test(lines[end]))end++;
  if(/^ {2}[)}\]]/.test(lines[end]))end++;
  return lines.slice(start,end).join('\n');
}
function presentation(data={contacts:[]}){
  const definitions=['dateLabel','time','stamp','roomTime','roomTitle'].map(name=>{
    const line=definition(name);
    assert.ok(line,'Missing presentation helper '+name);return line;
  }).join('\n');
  return runInNewContext(definitions+'\n({dateLabel,time,stamp,roomTime,roomTitle})',{data,Date});
}
test('chat clock uses a colon and day labels keep dots across year and midnight boundaries',()=>{
  const p=presentation(),now=new Date(2026,0,1,0,5).getTime();
  assert.equal(p.time(new Date(2026,5,4,4,6).getTime()),'04:06');
  assert.equal(p.dateLabel(new Date(2026,5,4,4,6).getTime()),'04.06.2026');
  assert.equal(p.roomTime(new Date(2026,0,1,0,1).getTime(),now),'00:01');
  assert.equal(p.roomTime(new Date(2025,11,31,23,59).getTime(),now),'31.12.2025');
  assert.equal(p.roomTime(new Date(2025,0,1,0,1).getTime(),now),'01.01.2025');
  assert.equal(p.time(new Date(2026,9,16,20,55).getTime()),'20:55');
  assert.equal(p.dateLabel('1990-04-25'),'25.04.1990');
  assert.equal(p.stamp(new Date(2026,5,4,4,6,7,8).getTime()),'04.06.2026 · 04:06.07.008');
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
  const content=JSON.stringify([message.id,message.text,message.format,message.files,message.forwarded,message.replyTo,message.replyText,message.replySender,message.sender,message.senderId,message.createdMs,message.examId,message.assignmentActive,message.pending,message.failed,message.deleted,message.editedMs,message.reactions,false]);
  let writes=0,scans=0;
  const receipt={getAttribute:()=> 'Delivered',setAttribute(){writes++;},classList:{toggle(){writes++;},contains:cls=>cls==='is-delivered'},set innerHTML(value){writes++;},set title(value){writes++;}};
  const node={dataset:{content,msgId:'1'},querySelector:()=>receipt};
  const timeline={querySelector:()=>node,querySelectorAll:()=>[node]};
  const merge=runInNewContext(extractFunction(source,'chatReceiptFace')+'\n'+extractFunction(source,'mergeNode')+'\nmergeNode',{timeline,data:{rooms:[]},room:'fixture',CSS:{escape:String},icon:()=>{scans++;return '';},icons:()=>scans++});
  for(let i=0;i<100;i++)merge(message);
  assert.equal(writes,0);assert.equal(scans,0);
});
test('repeated paint puts the sender bubble on the own side and leaves another sender on the left',()=>{
  function paint(message,classes){
    const content=JSON.stringify([message.id,message.text,message.format,message.files,message.forwarded,message.replyTo,message.replyText,message.replySender,message.sender,message.senderId,message.createdMs,message.examId,message.assignmentActive,message.pending,message.failed,message.deleted,message.editedMs,message.reactions,false]);
    let writes=0;
    const receipt={getAttribute:()=>'Sent',setAttribute(){writes++;},classList:{toggle(){writes++;},contains:()=>false},set innerHTML(value){writes++;},set title(value){writes++;}};
    const node={dataset:{content,msgId:String(message.id)},querySelector:()=>receipt,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)}};
    const timeline={querySelector:()=>node,querySelectorAll:()=>[node]};
    const merge=runInNewContext(extractFunction(source,'chatReceiptFace')+'\n'+extractFunction(source,'mergeNode')+'\nmergeNode',{timeline,data:{rooms:[]},room:'fixture',account:'me',CSS:{escape:String},icon:()=>'',icons(){writes++;}});
    merge(message);
    return writes;
  }
  const own=new Set(['msg-message']);
  const other=new Set(['msg-message','is-own']);
  assert.equal(paint({id:2,text:'mine',senderId:'me',sender:'Me',createdMs:2},own),0);
  assert.equal(own.has('is-own'),true);
  assert.equal(paint({id:3,text:'theirs',senderId:'other',sender:'Other',createdMs:3},other),0);
  assert.equal(other.has('is-own'),false);
});
test('the signed-in profile identifies own messages even when a stale cache account exists',()=>{
  const core=readFileSync(new URL('../production/chat/00-core.js',import.meta.url),'utf8');
  const line=core.split('\n').find(value=>value.includes('const myAccountId'))?.trim();assert.ok(line);
  const own=runInNewContext(line+'\nmyAccountId',{account:'stale-account',data:{profile:{id:'current-account'}},signedIn:()=>({id:'session-account'}),String});
  assert.equal(own(),'current-account');
});
test('icon rendering coalesces a burst of updates into one animation frame',()=>{
  let scans=0;const callbacks=[];
  const section={querySelectorAll:()=>[]};
  const icons=runInNewContext('let iconFrame=0;'+definition('icons')+'\nicons',{
    section,document:{querySelectorAll:()=>[]},window:{lucide:{createIcons(options){assert.ok(options.nameAttr==='data-chat-icon'||options.nameAttr==='data-lucide');assert.equal(options.root,section);scans++;}}},requestAnimationFrame(callback){callbacks.push(callback);return callbacks.length;}
  });
  for(let i=0;i<100;i++)icons();
  assert.equal(callbacks.length,1);assert.equal(scans,0);callbacks[0]();assert.equal(scans,2);
  icons();assert.equal(callbacks.length,2);callbacks[1]();assert.equal(scans,4);
});
test('folder markers sum only current-user unread across visible member chats',()=>{
  const data={rooms:[{id:'a',unread:{personal:3}},{id:'b',unread:{personal:3}},{id:'muted',muted:true,unread:{learning:2}},{id:'archived',archived:true,unread:{personal:9}},{id:'blocked',access:{blockedByMe:true},unread:{personal:8}}]};
  const line=definition('folderUnread');assert.ok(line);
  const count=runInNewContext(line+'\nfolderUnread',{data});
  assert.equal(count({roomIds:['a','b','a']}),6);assert.equal(count({roomIds:['muted','archived','blocked','missing']}),2);assert.equal(count({roomIds:[]}),0);
});
test('chat context menus outside the chat section also receive icons',()=>{
  const scans=[],callbacks=[],portal={querySelectorAll:()=>[]};
  const section={contains:()=>false,querySelectorAll:()=>[]};
  const icons=runInNewContext('let iconFrame=0;'+definition('icons')+'\nicons',{
    section,document:{querySelectorAll:()=>[portal]},window:{lucide:{createIcons:options=>scans.push(options.root)}},
    requestAnimationFrame(callback){callbacks.push(callback);return callbacks.length;},
  });
  icons();callbacks[0]();assert.equal(scans.filter(root=>root===portal).length,2);
});
test('chat previews shorten words and unbroken text without altering messages',()=>{
  const line=definition('roomPreview');assert.ok(line);
  const preview=runInNewContext(line+'\nroomPreview');
  assert.equal(preview('one two three four five six seven eight'),'one two three four five six…');
  assert.equal(preview('short message'),'short message');assert.equal(preview('  short\nmessage  '),'short message');assert.ok(preview('x'.repeat(100)).length<=65);
});
test('isOwnMessage recognizes messages by senderId, sender account, or profile name',()=>{
  const code=extractFunction(source,'myAccountId')+'\n'+extractFunction(source,'isOwnMessage')+'\nisOwnMessage';
  const ctx={
    data:{profile:{id:'user-42',name:'Tsovak Palakian'}},
    account:'user-42',
    signedIn:()=>({id:'user-42'}),
    String,
    Boolean
  };
  const isOwn=runInNewContext(code,ctx);
  assert.equal(isOwn({senderId:'user-42',sender:'Other'}),true);
  assert.equal(isOwn({senderId:'diff-id',sender:'Tsovak Palakian'}),true);
  assert.equal(isOwn({senderId:'diff-id',sender:'Jane Doe'}),false);
  assert.equal(isOwn({pending:true}),true);
});
test('chat cache persists and restores the authenticated profile object',()=>{
  const core=readFileSync(new URL('../production/chat/00-core.js',import.meta.url),'utf8');
  assert.ok(core.includes('profile: target.profile || data?.profile || null'));
  assert.ok(core.includes('profile: cached.profile || null'));
  const code=extractFunction(source,'applyChatCache')+'\napplyChatCache';
  let data={rooms:[]},profileViews={},account='',seq=0;
  const ctx={data,profileViews,account,seq,Object,Array,Math,String};
  const apply=runInNewContext(code,ctx);
  const restored=apply({rooms:[{id:'room-1'}],profile:{id:'acc-99',name:'Student'},seq:10});
  assert.equal(restored,true);
  assert.equal(ctx.data.profile.id,'acc-99');
  assert.equal(ctx.data.profile.name,'Student');
  assert.equal(ctx.account,'acc-99');
});
test('openRoom unconditionally marks room read upon opening to prevent re-appearing unread counters',()=>{
  const messages=readFileSync(new URL('../production/chat/40-messages.js',import.meta.url),'utf8');
  assert.match(messages,/await history\(\);\s*\}\s*finally\s*\{\s*markRead\(true, id, openedKind\);/);
});
