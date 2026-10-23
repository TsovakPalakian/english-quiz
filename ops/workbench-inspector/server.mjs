import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
const formats={'image/png':{kind:'image',format:'image2',extension:'png',codecs:['png'],max:5*1024*1024},'image/jpeg':{kind:'image',format:'image2',extension:'jpg',codecs:['mjpeg'],max:5*1024*1024},'audio/wav':{kind:'audio',format:'wav',extension:'wav',codecs:['pcm_s16le','pcm_s24le','pcm_f32le'],max:10*1024*1024},'audio/mpeg':{kind:'audio',format:'mp3',extension:'mp3',codecs:['mp3'],max:10*1024*1024},'video/mp4':{kind:'video',format:'mov',extension:'mp4',codecs:['h264','hevc','vp9','av1','mpeg4'],max:20*1024*1024}};
const reject=()=>{throw Object.assign(Error('Media validation failed.'),{status:415});};
export function describeMedia(probe,mime){
  const format=Object.hasOwn(formats,mime)?formats[mime]:null;if(!format||!Array.isArray(probe?.streams)||!probe.streams.length||probe.streams.length>2)reject();
  const video=probe.streams.filter(row=>row.codec_type==='video'),audio=probe.streams.filter(row=>row.codec_type==='audio');
  if(video.length+audio.length!==probe.streams.length||video.length>1||audio.length>1)reject();
  const stream=format.kind==='audio'?audio[0]:video[0];
  if(!stream||!format.codecs.includes(stream.codec_name)||format.kind==='audio'&&video.length||format.kind==='image'&&audio.length)reject();
  const width=format.kind==='audio'?0:stream.width,height=format.kind==='audio'?0:stream.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<0||height<0||format.kind!=='audio'&&(!width||!height||width*height>24000000||width>(format.kind==='video'?1920:8192)||height>(format.kind==='video'?1920:8192)))reject();
  const duration=format.kind==='image'?0:Number(probe.format?.duration);
  if(!Number.isFinite(duration)||duration<0||format.kind!=='image'&&(duration===0||duration>(format.kind==='video'?60:180)))reject();
  if(audio.some(row=>!Number.isSafeInteger(row.channels)||row.channels<1||row.channels>8||!Number.isFinite(Number(row.sample_rate))||Number(row.sample_rate)<8000||Number(row.sample_rate)>192000))reject();
  return {kind:format.kind,duration,width,height};
}
export async function inspectMedia(bytes,mime,{run=execute,signal}={}){
  const format=Object.hasOwn(formats,mime)?formats[mime]:null;if(!format||!bytes.length||bytes.length>format.max)reject();
  const directory=await mkdtemp(join(tmpdir(),'workbench-inspect-'));
  try{
    const path=join(directory,'input.'+format.extension);await writeFile(path,bytes,{mode:0o600});
    // A forced demuxer and file-only protocol prevent playlists or network fetching.
    const input=['-protocol_whitelist','file,pipe','-probesize','5242880','-analyzeduration','1000000','-f',format.format,...(format.kind==='image'?['-pattern_type','none']:[])];
    const {stdout}=await run('ffprobe',['-v','error',...input,'-show_streams','-show_format','-of','json',path],{timeout:2000,maxBuffer:65536,signal});
    let probe;try{probe=JSON.parse(stdout);}catch{reject();}const descriptor=describeMedia(probe,mime);
    const maps=descriptor.kind==='audio'?['-map','0:a:0']:['-map','0:v:0',...(descriptor.kind==='video'?['-map','0:a:0?']:[])];
    await run('ffmpeg',['-nostdin','-v','error','-xerror','-threads','1','-filter_threads','1','-max_alloc','67108864',...input,'-i',path,...maps,...(descriptor.kind==='image'?['-frames:v','1']:[]),'-f','null','-'],{timeout:6000,maxBuffer:8192,signal});
    return descriptor;
  }finally{await rm(directory,{recursive:true,force:true});}
}
export function inspectorServer({token,inspect=inspectMedia}={}){
  if(typeof token!=='string'||!/^[a-zA-Z0-9_-]{32,256}$/.test(token))throw Error('A private inspector token is required.');
  let running=0;
  return createServer(async(request,response)=>{
    const send=(status,value)=>{if(!response.destroyed){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}};
    const credential=Buffer.from(request.headers.authorization||''),expected=Buffer.from('Bearer '+token);
    if(credential.length!==expected.length||!timingSafeEqual(credential,expected)){send(401,{error:'Unauthorized.'});request.resume();return;}
    if(request.method!=='POST'||request.url!=='/inspect'){send(404,{error:'Not found.'});request.resume();return;}
    const mime=request.headers['content-type'],format=Object.hasOwn(formats,mime)?formats[mime]:null;if(!format){send(415,{error:'Unsupported media.'});request.resume();return;}
    if(running>=2){send(429,{error:'Inspector busy.'});request.resume();return;}
    running++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);request.once('aborted',()=>controller.abort());
    try{
      let length=0;const chunks=[];for await(const chunk of request){length+=chunk.length;if(length>format.max){send(413,{error:'Media exceeds limits.'});request.resume();return;}chunks.push(chunk);}
      const result=await inspect(Buffer.concat(chunks),mime,{signal:controller.signal});send(200,result);
    }catch{send(controller.signal.aborted?504:415,{error:'Media inspection failed.'});}
    finally{clearTimeout(timer);running--;}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=inspectorServer({token:process.env.INSPECTOR_TOKEN});server.requestTimeout=10000;server.headersTimeout=5000;server.listen(8000,'0.0.0.0');
}
