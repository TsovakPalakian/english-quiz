import {createInterface} from 'node:readline';
import {allMaterialsBlock} from './practice-all-materials.mjs';

const origin='https://learn-english.east-tarsal.workers.dev';
const choice=(title,items)=>({type:'quiz',tab:'overview',quizType:'Choice',title,items});
const gap=(title,items)=>({type:'quiz',tab:'overview',quizType:'Gap',title,items});
const reading=(title,text)=>({type:'text',tab:'overview',html:`<h3>${title}</h3><p>${text}</p>`});
const block=(title,materials)=>({title,published:true,hidden:false,materials});
export const practiceExams=[
  {title:'Practice A1 - Everyday English',date:'2026-10-11',published:true,hidden:false,blocks:[
    block('A1 Grammar - Present Simple',[
      choice('Choose the correct answer',[
        {prompt:'She ___ English every day.',options:['study','studies','studying'],answer:1},
        {prompt:'___ you live in Yerevan?',options:['Do','Does','Are'],answer:0},
        {prompt:'We ___ at home on Sundays.',options:['stays','stay','staying'],answer:1},
        {prompt:'He ___ coffee.',options:["don't like","doesn't likes","doesn't like"],answer:2}]),
      gap('Complete each sentence',[
        {shown:'My brother ___ (go) to school at eight.',answer:'goes'},
        {shown:'They ___ (not / work) on Saturday.',answer:"do not work"},
        {shown:'Anna ___ (have) two cats.',answer:'has'}])]),
    block('A1 Reading - A New Class',[
      reading('A new class','Lina is nineteen. She lives in Yerevan with her sister. Her English class starts at nine on Monday and Wednesday. She takes the bus to class. After class, she reads in the library. She wants to travel to London next summer.'),
      choice('Read and choose',[
        {prompt:'Who does Lina live with?',options:['Her parents','Her sister','Her teacher'],answer:1},
        {prompt:'How does she travel to class?',options:['By bus','On foot','By train'],answer:0},
        {prompt:'When does her class start?',options:['At eight','At nine','At ten'],answer:1},
        {prompt:'Where does she want to travel?',options:['Paris','Rome','London'],answer:2}]),
      {type:'quiz',tab:'overview',quizType:'Type',title:'Write about yourself',items:[
        {prompt:'Write 3-4 sentences about your daily routine. Include where you live and when you study.'}]}])]},
  {title:'Practice A2 - Travel and Experiences',date:'2026-10-11',published:true,hidden:false,blocks:[
    block('A2 Grammar - Past and Future',[
      choice('Choose the correct tense',[
        {prompt:'Yesterday we ___ a museum.',options:['visit','visited','have visit'],answer:1},
        {prompt:'I ___ to London next week. I have my ticket.',options:['am going','went','go yesterday'],answer:0},
        {prompt:'___ you ever tried sushi?',options:['Did','Do','Have'],answer:2},
        {prompt:'While I was cooking, my friend ___.',options:['arrives','arrived','has arrive'],answer:1}]),
      gap('Use the correct verb form',[
        {shown:'Last summer, they ___ (go) to Italy.',answer:'went'},
        {shown:'I have never ___ (see) snow.',answer:'seen'},
        {shown:'She was ___ (read) when I called.',answer:'reading'}])]),
    block('A2 Vocabulary - Phrasal Verbs',[
      choice('Choose the meaning',[
        {prompt:'Please look after my dog while I travel.',options:['Search for','Take care of','Look at'],answer:1},
        {prompt:'Our plane takes off at six.',options:['Leaves the ground','Arrives','Stops'],answer:0},
        {prompt:'We ran out of water.',options:['Bought water','Had no water left','Spilled some water'],answer:1}]),
      {type:'quiz',tab:'overview',quizType:'Match',title:'Match the expressions',items:[
        {left:'give up',right:'stop trying'},{left:'find out',right:'discover information'},{left:'turn on',right:'start a device'}]}]),
    block('A2 Reading and Writing - A Weekend Trip',[
      reading('A weekend trip','Last Friday, Sam and Maya took a train to a small town near the sea. The weather was rainy, so they visited a local museum instead of going to the beach. On Saturday, the sun came out and they hired bicycles. Their train home was delayed by an hour, but they enjoyed the weekend and plan to return in spring.'),
      {type:'quiz',tab:'overview',quizType:'True / false',title:'True or false?',items:[
        {prompt:'Sam and Maya travelled by car.',answer:'false'},
        {prompt:'They visited the museum because it was raining.',answer:'true'},
        {prompt:'They rode bicycles on Saturday.',answer:'true'},
        {prompt:'Their train home left on time.',answer:'false'}]},
      {type:'quiz',tab:'overview',quizType:'Type',title:'A short message',items:[
        {prompt:'Write 50-70 words to a friend about a weekend trip. Describe transport, weather and one activity. Your teacher will review this answer.'}]}])]},
  {title:'Practice B1 - Opinions and Decisions',date:'2026-10-11',published:true,hidden:false,blocks:[
    block('B1 Grammar and Vocabulary',[
      choice('Choose the correct answer',[
        {prompt:'If I had more time, I ___ another language.',options:['will learn','would learn','learned'],answer:1},
        {prompt:'You ___ wear a seat belt in a car.',options:['must','might','could have'],answer:0},
        {prompt:'This book ___ by a local author last year.',options:['wrote','was written','has writing'],answer:1},
        {prompt:'I look forward to ___ you.',options:['see','saw','seeing'],answer:2}]),
      gap('Complete the sentence',[
        {shown:'If it rains tomorrow, we ___ (stay) at home.',answer:'will stay'},
        {shown:'The report has already been ___ (send).',answer:'sent'}])]),
    block('B1 Reading and Opinion',[
      reading('Learning together','A community centre introduced free language workshops on weekday evenings. At first, attendance was low because many residents worked late. Organisers moved one workshop to Saturday morning and offered childcare. Attendance doubled within a month. Some participants preferred online lessons, but others said that meeting people in person kept them motivated. The centre now offers both formats.'),
      choice('Understand the text',[
        {prompt:'Why was attendance low at first?',options:['The lessons were expensive','Many people worked late','The centre was too small'],answer:1},
        {prompt:'What happened after the schedule changed?',options:['Attendance doubled','The workshops closed','All classes moved online'],answer:0},
        {prompt:'What does the centre offer now?',options:['Only online lessons','Only Saturday lessons','Online and in-person lessons'],answer:2}]),
      {type:'quiz',tab:'overview',quizType:'Type',title:'Express your opinion',items:[
        {prompt:'Write 80-100 words: do you prefer online or in-person language lessons? Give two reasons and one example. This task is reviewed by your teacher.'}]}])]}];

if(process.argv[1]===new URL(import.meta.url).pathname){
  if(process.stdin.isTTY)process.stdin.setRawMode(true);
  const input=createInterface({input:process.stdin,terminal:false});
  const credentials=await new Promise(resolve=>input.once('line',line=>{input.close();resolve(JSON.parse(line));}));
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  const signed=await login.json();
  if(!login.ok||signed.user?.role!=='DEVELOPER')throw new Error('A successful authorized account login is required.');
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const api=async(path,body)=>{
    const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${value.error||'Request failed'}`);return value;
  };
  if(process.argv.includes('--verify-copy')){
    const {default:assert}=await import('node:assert/strict');
    const before=await api('/api/exams'),exam=before.exams.find(row=>row.title==='Practice A2 - Travel and Experiences');
    const source=exam?.blocks.find(row=>row.title==='All Materials - Alice in Wonderland');
    assert.ok(source);const snapshot=JSON.stringify(source);
    const groups=await api('/api/groups'),group=groups.groups.find(row=>row.title==='Group A1');assert.ok(group);
    const body={mutationId:crypto.randomUUID(),source:{type:'exam-block',id:source.id},destination:{type:'group',id:group.id},title:'Copy demo - Alice in Wonderland'};
    const result=await api('/api/content/copy',body),id=result.ids.find(row=>row.type==='lesson').id;
    assert.deepEqual(await api('/api/content/copy',body),result);
    const copy=(await api('/api/lessons?id='+id)).materials.find(row=>row.id===id);
    assert.equal(copy.title,body.title);assert.equal(copy.blocks.length,source.materials.length);
    assert.equal(new Set(copy.blocks.map(row=>row.type)).size,22);
    assert.ok(copy.blocks.every(row=>!source.materials.some(original=>original.id===row.id)));
    const after=await api('/api/exams');assert.equal(JSON.stringify(after.exams.find(row=>row.id===exam.id).blocks.find(row=>row.id===source.id)),snapshot);
    assert.ok((await api('/api/groups')).groups.find(row=>row.id===group.id).lessonIds.includes(id));
    console.log(JSON.stringify({status:'copy-verified',group:group.title,lessonId:id,materials:copy.blocks.length,originalUnchanged:true,idempotent:true}));
    process.exit(0);
  }
  if(!process.argv.includes('--all-materials')){
    const state=await api('/api/me/state'),themes=await api('/api/me/themes');
    const users=await api('/api/admin/users'),twin=(users.users||[]).find(user=>user.login==='Tsovak');
    const paired=twin?await api('/api/admin/users/'+twin.id+'/state'):null;
    console.log(JSON.stringify({profile:state.stageProfile,pairedProfile:paired?.stageProfile,themes:themes.themes?.map(row=>row.name),pairedThemes:paired?.stats?.customThemes?.map(row=>row.name),needsMerge:!!signed.studyPairNeedsMerge}));
  }
  if(process.argv.includes('--apply')){
    const existing=await api('/api/exams');
    const repairIds=new Set((process.argv.find(arg=>arg.startsWith('--fix-tabs='))||'').slice(11).split(',').filter(Boolean).map(Number));
    for(const exam of practiceExams){
      const previous=existing.exams?.find(row=>row.title===exam.title);
      if(previous){
        if(repairIds.has(previous.id)){
          if(previous.blocks.length!==exam.blocks.length||previous.blocks.some((b,i)=>b.title!==exam.blocks[i].title||b.materials.length!==exam.blocks[i].materials.length))throw new Error('Practice structure changed; repair stopped.');
          const changed={...previous,blocks:previous.blocks.map(b=>({...b,materials:b.materials.map(p=>({...p,tab:p.tab==='work'?'overview':p.tab}))}))};
          const saved=await api('/api/exams',{exam:changed});
          console.log(JSON.stringify({repaired:saved.title,id:saved.id}));
        }else console.log('Already exists: '+exam.title);
        continue;
      }
      const saved=await api('/api/exams',{exam});
      console.log(JSON.stringify({created:saved.title,id:saved.id,blocks:saved.blocks?.length,questions:saved.blocks?.reduce((n,b)=>n+b.materials.reduce((sum,part)=>sum+(part.type==='quiz'?part.items?.length||0:0),0),0)}));
    }
  }
  if(process.argv.includes('--all-materials')){
    const {exams}=await api('/api/exams');
    const exam=exams.find(row=>row.title==='Practice A2 - Travel and Experiences');
    if(!exam)throw new Error('The A2 practice exam is missing; no existing exam was changed.');
    if(exam.blocks.some(b=>b.title===allMaterialsBlock.title))throw new Error('The all-materials block already exists; no duplicate created.');
    const saved=await api('/api/exams',{exam:{...exam,blocks:[...exam.blocks,allMaterialsBlock]}});
    const added=saved.blocks.find(b=>b.title===allMaterialsBlock.title);
    if(!added?.published||added.materials.length!==allMaterialsBlock.materials.length)throw new Error('New block was not acknowledged.');
    console.log(JSON.stringify({exam:saved.title,block:added.title,id:added.id,materials:added.materials.length,types:new Set(added.materials.map(p=>p.type)).size,quizTypes:added.materials.filter(p=>p.type==='quiz').map(p=>p.quizType)}));
  }
}
