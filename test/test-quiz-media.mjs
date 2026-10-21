import test from 'node:test';
import assert from 'node:assert/strict';
import {actors,body} from './quiz-review-fixture.mjs';
import {mediaFixture,wav,fakeMp4} from './quiz-media-fixture.mjs';
import {validateReviewContent} from '../src/quiz-review-content.mjs';
import {KitSessions} from '../src/kit-sessions.mjs';
const denied=(value,status)=>assert.rejects(value,error=>error.status===status);
test('media type is explicitly enabled; uploads enforce context, signatures, privacy and deletion replay',async()=>{
  const f=await mediaFixture();try{
    const asset=await f.upload();assert.equal(asset.descriptor.duration,0.5);
    assert.throws(()=>validateReviewContent('Video choice',f.video(asset)),error=>error.status===400);
    await denied(f.media.response(actors.other,asset.id,new Request('http://local/media')),404);
    await denied(f.media.upload(actors.student,body({...f.context,purpose:'quiz',mime:'video/mp4',name:'x.mp4',rights:'Original.'}),wav()),415);
    await denied(f.media.upload(actors.student,body({...f.context,cardId:3,purpose:'quiz',mime:'video/mp4',name:'x.mp4',rights:'Original.'}),fakeMp4),403);
    await denied(f.media.upload(actors.student,body({...f.context,purpose:'quiz',mime:'image/svg+xml',name:'x.svg'}),new Uint8Array([1])),415);
    const operation=body({});await f.media.remove(actors.student,asset.id,operation);await f.media.remove(actors.student,asset.id,operation);await denied(f.media.response(actors.student,asset.id,new Request('http://local')),404);
  }finally{f.close();}
});
test('Video choice requires media confirmation and never leaks transcript through shared APIs or exam snapshots',async()=>{
  const f=await mediaFixture();try{
    const asset=await f.upload(),q=await f.draft(actors.student,{type:'Video choice',content:f.video(asset)});await f.service.submit(actors.student,q.id,body({expectedRevision:1}));
    await denied(f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true}})),400);
    await f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true,media:true}}));
    const shared=await f.service.sharedForCard(actors.other,1);assert.equal(shared[0].previewRestricted,true);assert.doesNotMatch(JSON.stringify(shared),/transcript|fine drizzle|"answer"|mediaId/);
    await denied(f.service.get(actors.other,q.id),403);await denied(f.media.remove(actors.student,asset.id,body({})),409);
    for(const answer of [0,1]){
      const {id}=await f.sessions.start(actors.other,body({cardId:1,senseId:f.senseId,versionId:q.id,mode:'practice'}));
      const open=await f.sessions.get(actors.other,id);assert.ok(open.questions[0].mediaUrl);assert.doesNotMatch(JSON.stringify(open),/transcript|fine drizzle|"answer"/);
      const range=await f.sessions.media(actors.other,id,0,new Request('http://local',{headers:{Range:'bytes=0-7'}}));assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,8);assert.equal(range.headers.get('Cache-Control'),'private, no-store');
      await denied(f.sessions.media(actors.student,id,0,new Request('http://local')),404);
      await f.sessions.submit(actors.other,id,body({expectedRevision:1,responses:[answer]}));assert.equal((await f.sessions.get(actors.other,id)).content.items[0].transcript,'A fine drizzle started falling.');
    }
    const {id}=await f.sessions.start(actors.other,body({cardId:1,senseId:f.senseId,versionId:q.id,mode:'exam'}));await f.sessions.submit(actors.other,id,body({expectedRevision:1,responses:[0]}));assert.doesNotMatch(JSON.stringify(await f.sessions.get(actors.other,id)),/transcript|fine drizzle|correctCount/);
    await denied(f.sessions.release(actors.dev,id,body({expectedRevision:2})),403);
    const release=new KitSessions(f.kits,{authorizeExamRelease:async actor=>actor.id===actors.teacher.id});await release.release(actors.teacher,id,body({expectedRevision:2}));assert.equal((await release.get(actors.other,id)).content.items[0].transcript,'A fine drizzle started falling.');
    assert.equal((await f.kits.coverage(actors.other,f.context)).counts.total,17);assert.equal((await f.kits.coverage(actors.other,f.context)).additionalTypes[0].status,'ready');
  }finally{f.close();}
});
test('Listen keeps legacy schema, becomes audio-ready only with an approved verified asset, and freezes media on withdrawal',async()=>{
  const f=await mediaFixture();try{
    const audio=await f.upload(actors.student,'quiz','audio/wav',wav());
    const content={explanation:'Light rain.',items:[{prompt:'Choose the meaning.',word:'drizzle',mediaId:audio.id,options:['Rain','Snow'],answer:0}]};
    assert.throws(()=>validateReviewContent('Listen',content),error=>error.status===400);
    const q=await f.draft(actors.student,{type:'Listen',content});await f.service.submit(actors.student,q.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true,media:true}}));
    assert.equal((await f.kits.coverage(actors.other,f.context)).types.find(type=>type.type==='Listen').status,'ready');
    const started=await f.sessions.start(actors.other,body({cardId:1,senseId:f.senseId,versionId:q.id,mode:'practice'}));await f.kits.publication(actors.teacher,q.id,body({expectedRevision:0,available:false,reason:'Check the spoken text.'}));
    assert.equal((await f.sessions.media(actors.other,started.id,0,new Request('http://local'))).status,200);assert.equal((await f.kits.coverage(actors.other,f.context)).types.find(type=>type.type==='Listen').status,'needs_changes');
  }finally{f.close();}
});
test('private feedback attachments cannot become quiz media and reports never claim delivery',async()=>{
  const f=await mediaFixture();try{
    const attachment=await f.upload(actors.student,'feedback');await denied(f.draft(actors.student,{type:'Video choice',content:f.video(attachment)}),415);
    const operation=body({cardId:1,senseId:f.senseId,versionId:null,category:'bug',description:'The answer is ambiguous.',attachments:[attachment.id]});
    const result=await f.feedback.create(actors.student,operation);assert.equal(result.recipient,'info@lumiscia.org');assert.equal(result.delivered,false);assert.deepEqual(await f.feedback.create(actors.student,operation),result);
    await denied(f.feedback.create(actors.other,{...operation,mutationId:crypto.randomUUID()}),403);assert.deepEqual(await f.feedback.mine(actors.other),[]);await denied(f.media.response(actors.teacher,attachment.id,new Request('http://local')),404);
    await denied(f.media.remove(actors.student,attachment.id,body({})),409);assert.equal((await f.feedback.mine(actors.student)).length,1);
  }finally{f.close();}
});
test('failed media inspection and active-account checks prevent storing invalid assets',async()=>{
  const f=await mediaFixture({inspect:async()=>({kind:'video',duration:1000})});try{
    await denied(f.upload(),415);await denied(f.upload({...actors.student,active:false}),401);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM qr_media').get().n,0);
  }finally{f.close();}
});
test('a missing underlying object is not counted as playable media or offered to a new session',async()=>{
  const f=await mediaFixture();try{
    const asset=await f.upload(),id=await f.approved(asset),row=await f.media.row(asset.id);await f.store.delete('quiz-media/'+row.id+'/'+row.digest);
    assert.equal(await f.media.available('Video choice',f.video(asset)),false);assert.deepEqual(await f.service.sharedForCard(actors.other,1),[]);await denied(f.sessions.start(actors.other,body({cardId:1,senseId:f.senseId,versionId:id,mode:'practice'})),409);
  }finally{f.close();}
});
