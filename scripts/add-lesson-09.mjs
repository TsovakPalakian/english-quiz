// One published lesson for 9 September 2026, shaped as the lesson editor.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
const lessonId='lesson_2026_09_09';
const phrases=[
  ['make future plans','строить планы на будущее','He makes future plans for the next month.'],
  ['make a to-do list','составить список дел','He makes a to-do list every morning.'],
  ['plan things in advance','планировать заранее','He plans things in advance to be productive.'],
  ['do some work','сделать немного работы','He does some work on his projects.'],
  ['keep fit','поддерживать форму. do exercise, do sport, care about your health','He keeps fit with a short run before breakfast.'],
  ['stay in','остаться дома','He stays in in the morning.'],
  ['go out','выйти из дома','He goes out for business meetings in the afternoon.'],
  ['go on a trip to Pinsk','поехать в поездку в Пинск','He also goes on a trip to another city for a conference.'],
  ['have a lie-in','поваляться в кровати. Stay in bed for some time after waking up','He wakes up late and has a lie-in.'],
  ['have an early night','лечь спать раньше обычного. go to bed earlier that you usually go','He has an early night after a nice dinner.'],
  ['have a nap','вздремнуть днем. sleep for 30 min during the day','He has a nap in the afternoon.'],
  ['have a meal at home','поесть дома','He has a meal at home quickly in the evening.'],
  ['have a good time','хорошо провести время','He has a good time because he finishes all his tasks.'],
  ['come late for appointments','опаздывать на встречи','He sometimes comes late for appointments because he is too busy.']
];
const words=[
  ['make','делать','make future plans'],['future','будущее','make future plans'],['list','список','make a to-do list'],
  ['plan','план','plan things in advance'],['advance','заранее','plan things in advance'],['work','работа','do some work'],
  ['keep','держать','keep fit'],['fit','в форме','keep fit'],['stay','оставаться','stay in'],['go','идти','go out'],
  ['trip','поездка','go on a trip to Pinsk'],['lie-in','валяние в постели','have a lie-in'],['early','ранний','have an early night'],
  ['nap','короткий сон','have a nap'],['meal','еда','have a meal at home'],['home','дом','have a meal at home'],
  ['good','хороший','have a good time'],['time','время','have a good time'],['late','поздний','come late for appointments']
];
function block(id,position,type,tab,content){
  return s('INSERT INTO lesson_blocks(lesson_id,id,position,type,tab,content_json) VALUES(?,?,?,?,?,?)',[lessonId,id,position,type,tab,JSON.stringify(content)]);
}
function link(title,url){return {title,url,description:''};}
export function lesson09Commands(){
  const commands=[s(`INSERT INTO lessons(id,title,description,class_name,unit,lesson,lesson_date,mode,published,hidden_from_students,extra_json)
    VALUES(?,?,?,?,?,?,?,'preview',1,0,'{}')`,[lessonId,'Collocations and Present Simple','Wednesday. Collocations and Present Simple. Level A2.','English A2','Collocations','Present Simple','2026-09-09'])];
  let n=0;
  const add=(type,tab,content)=>{commands.push(block('b09_'+String(n).padStart(2,'0'),n,type,tab,content));n+=1;};
  add('heading','overview',{level:'h2',text:'What you will learn'});
  add('text','overview',{html:'<p>14 collocations about plans, rest and fitness. Present Simple with be and with other verbs. Two days to compare: a busy day and a relaxing day.</p>'});
  add('phrase','phrases',{items:phrases.map(([phrase,meaning,example])=>({phrase,meaning,example}))});
  add('vocab','words',{title:'Additional words',items:words.map(([word,translation,example])=>({word,translation,ipa:'',example}))});
  add('rule','rules',{topic:'ps',compare:false,name:'Present Simple',collapsed:false});
  add('text','rules',{html:'<p><b>be:</b> I am. We / you / they are. He / she / it is. Negative: am not / aren\'t / isn\'t. Questions: Am / Are / Is.</p><p><b>Other verbs:</b> I / we / you / they + verb. He / she / it + verb-s. Negative: don\'t / doesn\'t + verb. Questions: Do / Does + verb. After do/does the verb has no -s.</p><p>She play tennis. → She plays tennis. Does she plays tennis? → Does she play tennis?</p>'});
  add('link','classwork',link('make a sentence · is it true for you?','https://wordwall.net/ru/resource/118706505/02-make-a-sentence-is-it-true-for-you'));
  add('text','classwork',{html:'<p><b>A 30-minute break · choose 3.</b> Watching reels · Working · Going for a walk · Sleeping · Drinking tea · Chatting online · Looking at the window · Doing nothing</p><p><b>What activities do they find relaxing?</b> cooking · playing the guitar · running · doing exercise · reading · having a bath · listening to music</p><p><b>Which sentence best describes your life?</b></p><p>1 My life is too busy. I need more time.</p><p>2 I\'m quite busy, but I have time to do everything I want.</p><p>3 I have too much time and not enough things to do.</p>'});
  add('reading','classwork',{title:'Day 1',text:'He makes future plans for the next month and makes a to-do list every morning. He plans things in advance to be productive and does some work on his projects. He keeps fit with a short run before breakfast. He stays in in the morning, but he goes out for business meetings in the afternoon. He also goes on a trip to another city for a conference. He has a meal at home quickly in the evening. He has a good time because he finishes all his tasks, but he sometimes comes late for appointments because he is too busy.',marks:[]});
  add('reading','classwork',{title:'Day 2',text:'He wakes up late and has a lie-in. Then he makes future plans for his weekend and makes a to-do list for fun activities. He plans things in advance for his hobbies and does some work, but not much. He keeps fit by walking in the park. He stays in his house most of the day, but he goes out for a short walk. He goes on a trip to a lake near the city. He has an early night after a nice dinner and has a nap in the afternoon. He has a meal at home with his family and has a good time with his friends. He comes late for appointments because he doesn\'t care what people say about him.',marks:[]});
  add('task','classwork',{title:'Make a true story about Bob',text:'Hi! My name __ Bob. 1 I have a lie-in every Saturday, but I usually wake up at 6 AM because my cat not understand weekends. 2 I plan things in advance, but my plans __ always wrong. 3 I do some work at my desk, but mostly I think about lunch. 4 I try to keep fit. My favourite sport __ walking to the fridge and back. 5 At 3 PM, I have a nap on my chair. My boss call it "sleep", but I call it "creative thinking". 6 I go on a trip once a year, but I always forget my passport. 7 My life __ simple – I have a nap, eat, and make plans I never follow. Filled: My name is Bob. My cat doesn\'t understand weekends. My plans are always wrong. My favourite sport is walking to the fridge and back. My boss calls it "sleep". My life is simple.',response:''});
  for(const [title,url] of [
    ['Flashcards','https://wordwall.net/ru/resource/118847987/02'],
    ['Make collocations','https://wordwall.net/ru/resource/118696199/make-collocations'],
    ['02','https://wordwall.net/ru/resource/118848497/02'],
    ['LearningApps','https://learningapps.org/view53599574'],
    ['do / does · am / is / are','https://wordwall.net/ru/resource/99233427/do-does-am-is-are'],
    ['do / does or is / am / are','https://wordwall.net/ru/resource/5578473/do-does-or-is-am-are']
  ])add('link','homework',link(title,url));
  add('pdf','pdf',{name:'09.09.2026.pdf',title:'Lesson PDF',size:'',caption:'Collocations and Present Simple.'});
  return commands;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,file,flag,target,...extra]=process.argv.slice(2);
    assert.ok(mode==='--apply'&&flag==='--target'&&target==='english-quiz-production'&&!extra.length);
    const db=new TursoStudyClient({...productionCredentials(file),mode:'production'});
    const existing=await db.read('SELECT id FROM lessons WHERE id=? OR lesson_date=? AND deleted_at IS NULL',[lessonId,'2026-09-09']);
    if(existing.length){console.log(JSON.stringify({status:'already-present',id:existing[0].id}));process.exit(0);}
    await db.atomic(lesson09Commands());
    const [row]=await db.read('SELECT title,lesson_date,published FROM lessons WHERE id=? AND deleted_at IS NULL',[lessonId]);
    const blocks=await db.read('SELECT tab,type FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL ORDER BY position',[lessonId]);
    assert.equal(row.lesson_date,'2026-09-09');assert.equal(row.published,1);assert.equal(blocks.length,lesson09Commands().length-1);
    console.log(JSON.stringify({status:'added',id:lessonId,blocks:blocks.length}));
  }catch(error){console.error('Lesson 9 September stopped: '+error.message);process.exitCode=1;}
}
