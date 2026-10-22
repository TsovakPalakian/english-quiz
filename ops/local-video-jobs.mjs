// Disposable prototype only. A browser-rendered fixture is never described as AI inference.
import {exactFields} from '../src/quiz-review-content.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const staff=actor=>{if(!actor?.id||!['ADMIN','DEVELOPER'].includes(actor.role))fail(403,'Teacher access required.');};
export function createLocalVideoJobs(local,{now=Date.now,dailyLimit=5}={}){
  const jobs=new Map(),mutations=new Map();let provider='off',revision=1;
  const context={groupId:1,lessonId:1,cardId:1,senseId:local.senseId};
  function change(job,state,issue=''){job.state=state;job.issue=issue;job.revision++;job.history.push({state,issue,at:now()});}
  function current(job){if(job.state==='running'&&job.deadline<=now())change(job,'failed','Local rendering timed out.');return job;}
  const dto=job=>structuredClone(current(job));
  function owned(actor,id){staff(actor);const job=jobs.get(id);if(!job)fail(404,'Video job not found.');if(job.ownerId!==actor.id)fail(403,'Only the requesting teacher can run this job.');return current(job);}
  function quota(actor){const day=Math.floor(now()/86400000),used=[...jobs.values()].filter(j=>j.ownerId===actor.id).flatMap(j=>j.history).filter(e=>e.state==='running'&&Math.floor(e.at/86400000)===day).length;return {limit:dailyLimit,used,remaining:Math.max(0,dailyLimit-used)};}
  function gate(job){if(provider!=='local-fixture'||job.providerRevision!==revision)fail(409,'Video provider changed. Create a new job.');}
  function expected(job,value){if(value!==job.revision)fail(409,'Video job changed. Refresh first.');}
  return {
    async list(actor){staff(actor);await local.services.review.checkContext(actor,context);const rows=[];for(const job of [...jobs.values()].reverse()){const row=dto(job);if(job.quizId){try{row.reviewState=(await local.services.review.get(actor,job.quizId)).state;}catch(error){if(![403,404].includes(error.status))throw error;row.reviewState='unavailable';}}rows.push(row);}return {synthetic:true,provider,revision,quota:quota(actor),contexts:[{...context,label:'A1 Monday / Weather / drizzle (noun)'}],jobs:rows};},
    configure(actor,body){staff(actor);if(actor.role!=='DEVELOPER')fail(403,'Developer access required.');exactFields(body,['provider','expectedRevision']);if(!['off','local-fixture'].includes(body.provider))fail(400,'Only Off and the synthetic local renderer are available.');if(body.expectedRevision!==revision)fail(409,'Video settings changed.');if([...jobs.values()].some(job=>job.state==='validating'))fail(409,'Wait for media validation before changing the provider.');provider=body.provider;revision++;for(const job of jobs.values())if(['queued','running'].includes(job.state))change(job,'cancelled','Provider configuration changed.');return {provider,revision};},
    async create(actor,body){staff(actor);exactFields(body,['mutationId','groupId','lessonId','cardId','senseId']);if(typeof body.mutationId!=='string'||!/^[a-f0-9-]{36}$/.test(body.mutationId))fail(400,'Use a unique request identity.');
      const key=actor.id+':'+body.mutationId,signature=JSON.stringify(Object.keys(context).map(key=>body[key]));
      const previous=mutations.get(key);if(previous){if(previous.signature!==signature)fail(409,'Request identity reused for different context.');return dto(jobs.get(previous.id));}
      if(provider!=='local-fixture')fail(409,'Enable the local synthetic renderer first.');if(Object.keys(context).some(key=>body[key]!==context[key]))fail(400,'This fixture supports only the selected drizzle meaning.');
      await local.services.review.checkContext(actor,context);
      const replay=mutations.get(key);if(replay){if(replay.signature!==signature)fail(409,'Request identity reused for different context.');return dto(jobs.get(replay.id));}
      if(provider!=='local-fixture')fail(409,'Video rendering is off.');
      if(jobs.size>=100)fail(429,'Local video queue is full. Restart the disposable preview to reset it.');
      if(!quota(actor).remaining||[...jobs.values()].filter(j=>j.ownerId===actor.id&&['queued','running','validating'].includes(current(j).state)).length>=2)fail(429,'Local video quota or pending-job limit reached.');
      const job={id:crypto.randomUUID(),ownerId:actor.id,ownerName:actor.name,...context,state:'queued',revision:1,attempts:0,providerRevision:revision,synthetic:true,issue:'',quizId:null,mediaId:null,history:[{state:'queued',issue:'',at:now()}]};jobs.set(job.id,job);mutations.set(key,{signature,id:job.id});return dto(job);
    },
    async start(actor,id,body){const job=owned(actor,id);exactFields(body,['expectedRevision']);expected(job,body.expectedRevision);gate(job);await local.services.review.checkContext(actor,context);
      if(!['queued','failed'].includes(job.state)||job.attempts>=2)fail(409,'Only queued or failed jobs with fewer than two attempts can run.');if(!quota(actor).remaining)fail(429,'Daily local video limit reached.');
      // Recheck after the asynchronous permission read.
      expected(job,body.expectedRevision);gate(job);job.attempts++;job.deadline=now()+60000;change(job,'running');return {...dto(job),recipe:'synthetic-rain-v1'};
    },
    cancel(actor,id,body){const job=owned(actor,id);exactFields(body,['expectedRevision']);expected(job,body.expectedRevision);if(!['queued','running','failed'].includes(job.state))fail(409,'This job can no longer be cancelled.');change(job,'cancelled');return dto(job);},
    failed(actor,id,body){const job=owned(actor,id);exactFields(body,['expectedRevision']);expected(job,body.expectedRevision);if(job.state!=='running')fail(409,'This job is not rendering.');change(job,'failed','Browser rendering failed. No automatic retry.');return dto(job);},
    async finish(actor,id,expectedRevision,bytes){const job=owned(actor,id);expected(job,expectedRevision);gate(job);if(job.state!=='running')fail(409,'Video job is not running.');change(job,'validating');
      try{
        const asset=await local.services.media.upload(local.actors.dev,{mutationId:'video-media-'+job.id,...context,purpose:'quiz',mime:'video/mp4',name:'synthetic-rain.mp4',rights:'Procedural local fixture, created for this demonstration. Not AI-generated.',sourceUrl:null},bytes,{kind:'local-synthetic-video',jobId:job.id});
        gate(job);await local.services.review.checkContext(actor,context);
        const quiz=await local.services.review.createGeneratedDraft(local.actors.dev,actor,{mutationId:'video-quiz-'+job.id,...context,type:'Video choice',content:{explanation:'Synthetic rain scene for a local workflow demonstration; teacher validation is required.',items:[{prompt:'Which weather does the clip demonstrate?',mediaId:asset.id,transcript:'A fine drizzle started falling.',options:['Light rain','Heavy snow'],answer:0}]},generation:{source:{task:'generation',adapterId:'local-video-fixture',locale:'en-US',mode:'text',provider:'local-fixture',model:'procedural-rain-not-ai',version:'v1',configurationRevision:job.providerRevision},usage:{},instructionVersion:'synthetic-rain-v1',generatedAt:new Date(now()).toISOString(),contentRevision:1}});
        job.quizId=quiz.id;job.mediaId=asset.id;change(job,'submitted');return dto(job);
      }catch(error){change(job,'failed','Media validation or review submission failed. No automatic retry.');throw error;}
    }
  };
}
