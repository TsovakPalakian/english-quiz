import {readFileSync} from 'node:fs';
import {fixture,actors,body} from './quiz-review-fixture.mjs';
import {LearningKits} from '../src/learning-kits.mjs';
import {QuizMedia,memoryQuizMediaStore} from '../src/quiz-media.mjs';
import {QuizFeedback} from '../src/quiz-feedback.mjs';
import {KitSessions} from '../src/kit-sessions.mjs';
export function wav(){
  const data=Buffer.alloc(44+24000);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(24000,24);data.writeUInt32LE(48000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);
  for(let n=0;n<12000;n++)data.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*440*n/24000)),44+n*2);return new Uint8Array(data);
}
export const fakeMp4=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50]);
export async function mediaFixture({inspect=async(bytes,mime)=>({kind:mime.startsWith('video/')?'video':mime.startsWith('image/')?'image':'audio',duration:mime.startsWith('image/')?0:0.5,width:320,height:180}),d1=true}={}){
  const f=await fixture({d1,extendedLifecycle:true});for(const name of ['002_generation_jobs','005_provider_settings','009_learning_kits','010_quiz_media'])f.sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/'+name+'.sql',import.meta.url),'utf8'));
  const kits=new LearningKits(f.service),store=memoryQuizMediaStore(),media=new QuizMedia(kits,{store,inspect});f.service.mediaQuizzes=true;f.service.contentPolicy=media;
  const context={groupId:1,lessonId:1,cardId:1,senseId:f.senseId},sessions=new KitSessions(kits),feedback=new QuizFeedback(kits,media);
  f.sql.exec("UPDATE class_group_students SET group_id=1,assigned_by='teacher' WHERE account_id='u2'");
  const upload=(actor=actors.student,purpose='quiz',mime='video/mp4',bytes=fakeMp4)=>media.upload(actor,body({...context,purpose,mime,name:mime.startsWith('video/')?'clip.mp4':'reference.wav',rights:'Original synthetic test recording.'}),bytes);
  const video=asset=>({explanation:'The speaker is talking about light rain.',items:[{prompt:'What weather is described?',mediaId:asset.id,transcript:'A fine drizzle started falling.',options:['Light rain','Snow'],answer:0}]});
  const approved=async(asset)=>{const q=await f.draft(actors.student,{type:'Video choice',content:video(asset)});await f.service.submit(actors.student,q.id,body({expectedRevision:1}));await f.service.approve(actors.teacher,q.id,body({expectedRevision:2,checks:{meaning:true,answers:true,level:true,media:true}}));return q.id;};
  return {...f,kits,media,store,sessions,feedback,context,upload,video,approved};
}
