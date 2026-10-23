// Explicit local Docker smoke test. Only synthetic media, no volumes or cloud calls.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
export async function verifyDockerInspector({image='lumiscia-workbench-inspector:local'}={}){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9./:_-]{0,199}$/.test(image))throw Error('Choose a local inspector image.');
  const token=randomBytes(32).toString('base64url'),name='lumiscia-inspector-check-'+randomBytes(6).toString('hex');let started=false;
  const docker=async(args,options={})=>execute('docker',args,{timeout:30000,maxBuffer:1024*1024,...options});
  const ffmpeg=async(args)=>docker(['exec',name,'ffmpeg','-nostdin','-v','error','-threads','1','-filter_threads','1','-filter_complex_threads','1',...args]);
  try{
    await docker(['image','inspect',image]);
    await docker(['run','--detach','--rm','--pull=never','--name',name,'--label','org.lumiscia.purpose=inspector-smoke','--read-only','--tmpfs','/tmp:size=96m,mode=1777','--memory','512m','--cpus','1','--pids-limit','48','--cap-drop','ALL','--security-opt','no-new-privileges:true','--log-driver','none','--env','INSPECTOR_TOKEN','--publish','127.0.0.1::8000',image],{env:{...process.env,INSPECTOR_TOKEN:token}});started=true;
    const state=JSON.parse((await docker(['inspect',name])).stdout)[0],binding=state.NetworkSettings.Ports['8000/tcp'];
    assert.equal(state.Config.User,'node');assert.equal(state.HostConfig.ReadonlyRootfs,true);assert.equal(state.HostConfig.Memory,512*1024*1024);assert.equal(state.HostConfig.PidsLimit,48);assert.equal(state.HostConfig.NanoCpus,1000000000);assert.ok(state.HostConfig.CapDrop.includes('ALL'));assert.ok(state.HostConfig.SecurityOpt.includes('no-new-privileges:true'));assert.equal(state.HostConfig.LogConfig.Type,'none');assert.equal(binding.length,1);assert.equal(binding[0].HostIp,'127.0.0.1');
    const endpoint='http://127.0.0.1:'+binding[0].HostPort+'/inspect';
    let online=false;for(let n=0;n<40;n++){try{const response=await fetch(endpoint,{signal:AbortSignal.timeout(1000)});online=response.status===401;if(online)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(online,true,'Inspector did not start.');
    await ffmpeg(['-f','lavfi','-i','color=c=red:s=96x64','-frames:v','1','-threads','1','/tmp/check.png']);
    await ffmpeg(['-f','lavfi','-i','color=c=blue:s=96x64','-frames:v','1','-threads','1','/tmp/check.jpg']);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2','-c:a','pcm_s16le','/tmp/check.wav']);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2','-c:a','libmp3lame','/tmp/check.mp3']);
    await ffmpeg(['-f','lavfi','-i','testsrc=size=96x64:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','/tmp/check.mp4']);
    const submit=async(bytes,mime,credential=token)=>{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':mime,Authorization:'Bearer '+credential},body:bytes,signal:AbortSignal.timeout(15000)});
      return {status:response.status,body:await response.json()};
    };
    const accepted=[];
    for(const [extension,mime,kind] of [['png','image/png','image'],['jpg','image/jpeg','image'],['wav','audio/wav','audio'],['mp3','audio/mpeg','audio'],['mp4','video/mp4','video']]){
      const bytes=(await docker(['exec',name,'cat','/tmp/check.'+extension],{encoding:'buffer'})).stdout;
      const result=await submit(bytes,mime);assert.equal(result.status,200,extension+': '+JSON.stringify(result.body));assert.equal(result.body.kind,kind);
      if(kind==='image')assert.deepEqual(result.body,{kind,duration:0,width:96,height:64});else assert.ok(result.body.duration>=1.9&&result.body.duration<2.5);
      accepted.push(extension);
      const damaged=await submit(bytes.subarray(0,24),mime);assert.equal(damaged.status,415,'Truncated '+extension+' was accepted.');
    }
    assert.equal((await submit(new Uint8Array([1]),'audio/wav','invalid')).status,401);
    assert.equal((await submit(new Uint8Array([1]),'constructor')).status,415);
    assert.equal((await submit(new Uint8Array(5*1024*1024+1),'image/png')).status,413);
    assert.equal((await submit(new TextEncoder().encode('https://example.test/private.mp4'),'video/mp4')).status,415);
    const corrupt=(await docker(['exec',name,'cat','/tmp/check.png'],{encoding:'buffer'})).stdout;
    const idat=corrupt.indexOf('IDAT');assert.ok(idat>0);corrupt[idat+4]=0;assert.equal((await submit(corrupt,'image/png')).status,415);
    await ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','181','-c:a','pcm_s16le','/tmp/long.wav']);
    assert.equal((await submit((await docker(['exec',name,'cat','/tmp/long.wav'],{encoding:'buffer',maxBuffer:10*1024*1024})).stdout,'audio/wav')).status,415);
    await ffmpeg(['-f','lavfi','-i','color=c=red:s=9000x2','-frames:v','1','-threads','1','/tmp/wide.png']);
    assert.equal((await submit((await docker(['exec',name,'cat','/tmp/wide.png'],{encoding:'buffer'})).stdout,'image/png')).status,415);
    const leftovers=(await docker(['exec',name,'find','/tmp','-maxdepth','1','-name','workbench-inspect-*'])).stdout.trim();assert.equal(leftovers,'');
    return {localOnly:true,accepted,corruptFilesRejected:true,authorizationVerified:true,boundsVerified:true,temporaryFilesRemoved:true,hardenedContainer:true,cloudModified:false,containerRemoved:true};
  }finally{if(started)await docker(['rm','--force',name]);}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3||process.argv[2]!=='--run')throw Error('Usage: node ops/verify-workbench-inspector-docker.mjs --run');
  console.log(JSON.stringify(await verifyDockerInspector()));
}
