// Explicit local dependency, never imported by production routes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rmSync} from 'node:fs';
const exec=promisify(execFile);
let compiler;
async function inspector(){
  if(!compiler)compiler=(async()=>{
    const directory=await mkdtemp(join(tmpdir(),'qr-inspector-')),binary=join(directory,'inspect');
    try{await exec('/usr/bin/xcrun',['clang','-fobjc-arc','-Wno-deprecated-declarations','-framework','Foundation','-framework','AVFoundation','-framework','ImageIO','-framework','CoreGraphics','-framework','CoreMedia','-framework','CoreVideo',fileURLToPath(new URL('./inspect-quiz-media.m',import.meta.url)),'-o',binary],{timeout:60000,maxBuffer:20000});process.once('exit',()=>rmSync(directory,{recursive:true,force:true}));return {directory,binary};}
    catch{await rm(directory,{recursive:true,force:true});throw Object.assign(Error('Local media inspector unavailable.'),{status:503});}
  })();
  return compiler;
}
export async function inspectQuizMedia(bytes,mime){
  const engine=await inspector(),directory=await mkdtemp(join(tmpdir(),'qr-media-'));
  try{
    const extension={'image/png':'png','image/jpeg':'jpg','audio/wav':'wav','audio/mpeg':'mp3','video/mp4':'mp4'}[mime];if(!extension)throw Error();
    const path=join(directory,'input.'+extension);await writeFile(path,bytes,{mode:0o600});
    const {stdout}=await exec(engine.binary,[path],{timeout:15000,maxBuffer:2000});return JSON.parse(stdout);
  }catch(error){throw Object.assign(Error(mime==='video/mp4'?'Use a decodable MP4 up to 60 seconds without embedded subtitles or metadata.':'The file could not be safely decoded.'),{status:415,cause:error.stderr?.slice(0,200)});}
  finally{await rm(directory,{recursive:true,force:true});}
}
export async function closeQuizMediaInspector(){if(!compiler)return;try{const engine=await compiler;await rm(engine.directory,{recursive:true,force:true});}finally{compiler=null;}}
export async function localSpeech(text,voice,signal){
  const directory=await mkdtemp(join(tmpdir(),'qr-speech-'));
  try{
    if(!['Samantha','Daniel'].includes(voice))throw Error();
    const input=join(directory,'input.txt'),output=join(directory,'output.wav');await writeFile(input,text,{mode:0o600});
    await exec('/usr/bin/say',['-v',voice,'-r','150','--data-format=LEI16@24000','-f',input,'-o',output],{timeout:20000,maxBuffer:2000,signal});
    return new Uint8Array(await readFile(output));
  }catch{throw Error('Local voice unavailable. No fallback was used.');}
  finally{await rm(directory,{recursive:true,force:true});}
}
