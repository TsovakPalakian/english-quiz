// One-time CC0 asset import. Runtime/builds never contact these third parties.
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const commit='ec4875a35d265b5431e3ba81fef6cc0ca0281bfc',repo='https://raw.githubusercontent.com/Wh1teDuke/WilhelmSFX/'+commit+'/';
const target=resolve('production/notification-audio'),cache='/private/tmp/english-notification-audio';
mkdirSync(target,{recursive:true});mkdirSync(cache,{recursive:true});
const groups={
  'Animals and birds':[
    [146975,'Cat call'],[763906,'Cat meow'],[686775,'Quiet meow'],[156643,'Friendly cat'],[64015,'Kitten'],[146963,'Cat hiss'],
    [277058,'Dog bark'],[332176,'Deep dog bark'],[100032,'Small dog'],[464406,'Short bark'],[500646,'Wolf howl'],[640986,'Wolf call'],
    [316920,'Chicken'],[842587,'Rooster'],[435508,'Rooster crow'],[623796,'Farm rooster'],[548118,'Hawk'],[556575,'Eagle'],
    [34207,'Garden birds'],[509321,'Bird chirp'],[85405,'Birdcall'],[607242,'Great tit'],[607223,'Small bird'],[47599,'Bird song'],[85404,'Canary'],[519105,'Songbird'],[98448,'Lakeside birds'],[365668,'Nightingale'],
    [555096,'Magpie'],[730487,'Magpie chatter'],[402971,'Magpie in a birch'],[478637,'Magpie robin'],[684509,'Young pigeon'],[795719,'Dove'],[147349,'Morning birds'],
    [558397,'Owl hoot'],['864872_a','Tawny owl'],['864872_b','Owl reply'],[512781,'Crow'],[512780,'Raven'],[56234,'Crows'],[166707,'Seagull'],
    [233146,'Cow'],[275154,'Cow moo'],[59245,'Short moo'],['380042_a','Sheep'],['380042_b','Sheep reply'],[710298,'Sheep bleat'],[710296,'Little sheep'],[273911,'Goat'],[188182,'Goat call'],[675417,'Single goat'],
    ['607226_a','Duck'],['607226_b','Duck quack'],['607226_c','Ducks by the pond'],[184503,'Horse'],[269571,'Horse neigh'],[475483,'Horse snort'],[347036,'Horse whinny'],[392029,'Donkey'],[442906,'Pig oink'],[442904,'Pig squeak'],[527845,'Elephant'],[516829,'Lion'],[675443,'Lion roar'],[527214,'Lion call'],[455593,'Bat chirp']
  ],
  'Frogs and toads':[[536759,'Frog'],[361117,'Frog quack'],['265107_a','Pond frogs'],['265107_b','Evening frogs'],['149092_a','Frog chorus'],['149092_b','Frog reply'],[527846,'Frog croaks']],
  'Insects':[[829810,'Night insects'],[640718,'Cicada'],[515053,'Solo cicada'],[396809,'Cicada call'],[737195,'Cricket'],[164485,'Cricket chirp'],[753271,'Single cricket'],[856767,'Wasp'],[637065,'Katydid chorus'],[827358,'Grasshopper'],[502211,'Beetle']],
  'Water and weather':[[751567,'Ocean'],[441852,'Rolling wave'],[442944,'Ocean wave'],[316744,'Water splash'],[96725,'Small splash'],[398032,'Splash'],[174718,'Water drop'],[166325,'Clear drop'],['387949_a','Water droplets'],['387949_b','Rippling drops'],[165206,'Single drop'],[447910,'Plop'],[506545,'Bubble pop'],[96125,'Bubbles'],[530975,'Rain'],[672701,'Rain on a roof'],[146932,'Wind gust'],[368299,'River'],[574803,'River cascade'],[165108,'Waterfall'],[467777,'Thunder'],[195439,'Distant thunder'],[757203,'Crackling fire'],[687010,'Fire spark'],[471158,'Glowing embers']],
  'Leaves and wood':[[181801,'Breeze in leaves'],[139952,'Falling tree'],[517129,'Dry leaves'],[517139,'Rustling leaves'],[517140,'Leaf crunch'],[517142,'Autumn leaves'],[464690,'Grass step'],[464691,'Soft grass'],[164472,'Branch snap'],[594277,'Twig crack'],[502504,'Wood creak'],[502505,'Quiet wood creak'],[502511,'Wooden creak']],
  'Everyday sounds':[[611113,'Bell ding'],[182879,'Doorbell'],[442280,'Short doorbell'],[107806,'Metal click'],[215772,'Click'],[256116,'Soft click'],[257357,'Button click'],[478197,'Tiny click'],[151214,'Finger snap']]
};
async function remote(url){const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('HTTP '+response.status);return response;}
const tree=await(await remote('https://api.github.com/repos/Wh1teDuke/WilhelmSFX/git/trees/'+commit+'?recursive=1')).json();
const sources=await(await remote(repo+'sources.txt')).text();
const sourceUrls=new Map(sources.split('\n').map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length===2&&parts[1].startsWith('https://freesound.org/')));
async function sourcePage(url,id){const path=cache+'/'+id+'.html';if(!existsSync(path))writeFileSync(path,await(await remote(url)).text());const html=readFileSync(path,'utf8');if(!/creativecommons\.org\/publicdomain\/zero\/1\.0/.test(html))throw Error('Not verified CC0');return html;}
function clip(input,output,{tail=false}={}){
  const converted=cache+'/converted-'+output.split('/').at(-1);execFileSync('/usr/bin/afconvert',[input,converted,'-f','WAVE','-d','LEI16@24000','-c','1']);
  const bytes=readFileSync(converted);let data,channels,rate,bits;
  for(let at=12;at+8<=bytes.length;){const size=bytes.readUInt32LE(at+4),tag=bytes.toString('ascii',at,at+4);if(tag==='fmt '){channels=bytes.readUInt16LE(at+10);rate=bytes.readUInt32LE(at+12);bits=bytes.readUInt16LE(at+22);}if(tag==='data')data=bytes.subarray(at+8,at+8+size);at+=8+size+(size%2);}
  if(!data||channels!==1||rate!==24000||bits!==16)throw Error('Unsupported conversion');
  const count=Math.min(Math.floor(data.length/2),96000),total=Math.floor(data.length/2);let best=0,energy=-1;
  // Pick an audible short passage rather than leading silence in field recordings.
  if(tail)best=total-count;
  else for(let start=0;start<=total-count;start+=6000){let sum=0;for(let i=start;i<start+count;i+=24)sum+=data.readInt16LE(i*2)**2;if(sum>energy){energy=sum;best=start;}}
  let peak=0;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(data.readInt16LE((best+i)*2)));if(peak<20)throw Error('Silent source');
  const wav=Buffer.alloc(44+count*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
  const gain=Math.min(8,13000/peak);for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(data.readInt16LE((best+i)*2)*gain*Math.min(1,i/480,(count-1-i)/480)),44+i*2);
  writeFileSync(output,wav);return {duration:count/24000,sha256:createHash('sha256').update(wav).digest('hex')};
}
const entries=[],failures=[];
async function add(group,key,name){
  const [id,suffix]=String(key).split('_');
  const file=tree.tree.find(row=>row.path.startsWith('Samples/'+id+'__')&&(!suffix||row.path.replace(/\.[^.]+$/,'').endsWith('_'+suffix)));
  if(!file)return failures.push({key,reason:'Missing file'});
  const stem=file.path.split('/').at(-1).replace(/\.[^.]+$/,''),url=sourceUrls.get(stem);if(!url)return failures.push({key,reason:'Missing source'});
  try{
    await sourcePage(url,id);const input=cache+'/'+file.path.split('/').at(-1);if(!existsSync(input))writeFileSync(input,new Uint8Array(await(await remote(repo+file.path.split('/').map(encodeURIComponent).join('/'))).arrayBuffer()));
    const assetId='field-'+String(key).replace('_','-'),path=target+'/'+assetId+'.wav',audio=clip(input,path);
    entries.push({id:assetId,name,group,...audio,source:url,author:stem.split('__')[1],license:'CC0-1.0',file:'/notification-audio/'+assetId+'.wav'});
  }catch(error){failures.push({key,reason:error.message});}
}
// A genuine common-toad recording, separately verified from its author's page.
const toadUrl='https://freesound.org/people/Breviceps/sounds/462863/';
const toadHtml=await sourcePage(toadUrl,'462863'),toadPreview=toadHtml.match(/https:\/\/cdn\.freesound\.org\/previews\/462\/462863_[\w-]+-hq\.mp3/)?.[0];
if(!toadPreview)throw Error('Toad preview missing');const toadInput=cache+'/common-toad.mp3';if(!existsSync(toadInput))writeFileSync(toadInput,new Uint8Array(await(await remote(toadPreview)).arrayBuffer()));
entries.push({id:'common-toad',name:'Common toad (Bufo bufo)',group:'Frogs and toads',...clip(toadInput,target+'/common-toad.wav',{tail:true}),source:toadUrl,author:'Breviceps',license:'CC0-1.0',file:'/notification-audio/common-toad.wav'});
for(const [id,author,key,name] of [[850650,'coleyoung_sounds','american-toads','American toads by the pond']]){
  const source='https://freesound.org/people/'+author+'/sounds/'+id+'/',html=await sourcePage(source,String(id)),preview=html.match(new RegExp('https://cdn\\.freesound\\.org/previews/\\d+/'+id+'_[\\w-]+-hq\\.mp3'))?.[0];if(!preview)throw Error('Toad source missing: '+id);
  const input=cache+'/'+key+'.mp3';if(!existsSync(input))writeFileSync(input,new Uint8Array(await(await remote(preview)).arrayBuffer()));
  entries.push({id:key,name,group:'Frogs and toads',...clip(input,target+'/'+key+'.wav'),source,author,license:'CC0-1.0',file:'/notification-audio/'+key+'.wav'});
}
// Preserve a useful balance of categories; license failures never enter the bundle.
const queue=Object.entries(groups).flatMap(([group,items])=>items.map(([key,name])=>({group,key,name})));
let index=0;await Promise.all(Array.from({length:4},async()=>{for(;;){const item=queue[index++];if(!item)return;await add(item.group,item.key,item.name);}}));
entries.sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name));
if(entries.length<100)throw Error('Only '+entries.length+' verified recordings: '+JSON.stringify(failures));
writeFileSync(resolve('production/notification-catalog.json'),JSON.stringify(entries,null,2)+'\n');
writeFileSync(target+'/SOURCES.json',JSON.stringify({repository:'https://github.com/Wh1teDuke/WilhelmSFX',commit,license:'CC0-1.0',changes:'Mono 24kHz, short excerpt, level normalization and fades',sounds:entries},null,2)+'\n');
writeFileSync(target+'/CC0.txt',await(await remote(repo+'SampleLicenses/CC0%201.0%20Universal.txt')).text());
console.log(JSON.stringify({recordings:entries.length,skipped:failures,includesCommonToad:true}));
