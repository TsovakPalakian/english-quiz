import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement as s} from '../src/turso-study.mjs';
const link=(title,url)=>({title,url,description:''});
const phrase=rows=>({items:rows.map(([phrase,meaning,example])=>({phrase,meaning,example:example||''}))});
const vocab=(title,rows)=>({title,items:rows.map(([word,translation,example])=>({word,translation,ipa:'',example:example||''}))});
function lesson(id,meta,blocks){
  const commands=[s(`INSERT INTO lessons(id,title,description,class_name,unit,lesson,lesson_date,mode,published,hidden_from_students,extra_json)
    VALUES(?,?,?,?,?,?,?,'preview',1,0,'{}')`,[id,...meta])];
  blocks.forEach(([type,tab,content],position)=>commands.push(s(
    'INSERT INTO lesson_blocks(lesson_id,id,position,type,tab,content_json) VALUES(?,?,?,?,?,?)',
    [id,id+'_'+String(position).padStart(2,'0'),position,type,tab,JSON.stringify(content)])));
  return commands;
}
const lessons=[
  lesson('lesson_2026_09_14',['Adverbs of frequency','Monday. Adverbs of frequency. Level A2.','English A2','Frequency','How often','2026-09-14'],[
    ['heading','overview',{level:'h2',text:'What you will learn'}],
    ['text','overview',{html:'<p>How often + Present Simple. Adverbs that say how regularly something happens, and phrases that say how many times. Two collocations: achieve a goal, beat others.</p><p>How often are you check your phone? → How often do you check your phone? Do you afraid of Monday mornings? → Are you afraid of Monday mornings?</p>'}],
    ['phrase','phrases',phrase([
      ['always','всегда','Are you always so happy?'],['usually','обычно','She is usually at home in the evening.'],
      ['often','часто',''],['occasionally','время от времени','He is occasionally tired after work.'],
      ['rarely','редко',''],['hardly ever','почти никогда','He hardly ever has a nap.'],
      ['never','никогда','I am never late for appointments.'],['most days','в большинство дней','Are you busy most days?'],
      ['once in a while','изредка','The scale slide writes once in while.'],['once a week','раз в неделю',''],
      ['twice a week','два раза в неделю','We study twice a week.'],['3 times a week','три раза в неделю','Does she keep fit 3 times a week?'],
      ['3 times a year','три раза в год',''],['achieve a goal','достичь цели','reach, come to'],
      ['beat others','победить других','He beat me at chess.']
    ])],
    ['rule','rules',{topic:'ps',compare:false,name:'Present Simple',collapsed:false}],
    ['text','rules',{html:'<p>How often asks about a habit. An action: How often do you…? A state with be: How often are you…?</p><p>always, usually, often, occasionally, rarely, hardly ever, never say how regular a habit feels. once a week, twice a week, 3 times a week say a number of times.</p><p>We study twice a week. He runs most days. He usually listens to music. He is never tired after running.</p>'}],
    ['link','classwork',link('03','https://wordwall.net/ru/resource/119086527/03')],
    ['task','classwork',{title:'am / is / are / do / does',text:'Student 1: How often __ you check your phone? Where ___ your passport now? _______ your colleague use social media at work? ______ you sing in the shower? ______ your colleague secretly have a nap? What ___ the best thing about waking up early? How often ___ your neighbour play loud music? ______ you afraid of Monday mornings? Check: do · is · does · do · does · is · does · are',response:''}],
    ['pdf','pdf',{name:'14.09.2026.pdf',title:'Lesson PDF',size:'',caption:'Adverbs of frequency.'}]
  ]),
  lesson('lesson_2026_09_16',['Small talk','Wednesday. Small talk. Level B1.','English A2','Speaking','Small talk','2026-09-16'],[
    ['heading','overview',{level:'h2',text:'What you will learn'}],
    ['text','overview',{html:'<p>How to start, keep and end a short conversation with a stranger. How often + do/are. Polite requests with Do you mind if I…? Present Perfect in How long have you worked here?</p>'}],
    ['phrase','phrases',phrase([
      ['Is anyone sitting here?','Здесь кто-нибудь сидит?','Excuse me, is anyone sitting here?'],
      ['Do you mind if I charge my phone here?','Вы не против, если я заряжу здесь телефон?',''],
      ['Do you know if there’s a cafe near here?','Вы не знаете, есть ли рядом кафе?',''],
      ['How long have you worked here?','Как долго вы здесь работаете?',''],
      ['It’s a lovely day, isn’t it?','Прекрасный день, правда?',''],
      ['Is this your first time here?','Вы здесь первый раз?',''],
      ['Help yourself.','Угощайтесь.','Sure! Help yourself.'],
      ['What/How about you?','А ты? / А как ты?',''],['And you?','А ты? / А вы?',''],
      ['Go ahead.','Пожалуйста, садитесь.','No, go ahead.'],['Not at all.','Нисколько.',''],
      ['Be my guest.','Пожалуйста, будьте как дома.',''],['I’m George, by the way','Я Джордж, кстати.',''],
      ['Nice talking to you','Было приятно поговорить.','Nice talking to you. See you later.'],
      ['Have a good time.','Хорошо провести время.',''],['I’ve got to go.','Мне пора идти.','That’s my bus. I’ve got to go.'],
      ['That’s my bus.','Это мой автобус.',''],['See you later.','Увидимся позже.',''],
      ['Ok, nice to meet you.','Хорошо, приятно познакомиться.',''],
      ['once a month','раз в месяц',''],['twice a month','два раза в месяц',''],['5 times a year','пять раз в год',''],
      ['stranger','незнакомец','I don\'t usually talk to strangers.']
    ])],
    ['rule','rules',{topic:'ps',compare:false,name:'Present Simple',collapsed:false}],
    ['rule','rules',{topic:'pp',compare:false,name:'Present Perfect',collapsed:false}],
    ['text','rules',{html:'<p>Do you mind if I + verb. No, not at all and Go ahead mean yes, you may. Yes here can sound like a refusal.</p><p>How often do you sit on benches? An action takes do. How often are you tired of walking? A state with be takes are.</p><p>How long have you worked here? The period started in the past and continues until now.</p>'}],
    ['link','classwork',link('how often · student 1','https://wordwall.net/ru/resource/119031666/03-how-often-are-you-do-you-student-1')],
    ['link','classwork',link('how often · student 2','https://wordwall.net/ru/resource/119031707/03-how-often-are-you-do-you-student-2')],
    ['link','classwork',link('sorting out','https://wordwall.net/ru/resource/119186978/04-sorting-out')],
    ['reading','classwork',{title:'Happy to chat benches',text:'Most of us spend part of our day surrounded by strangers, perhaps when travelling to work, sitting in a park or a cafe or visiting the supermarket. We are together with other people, but nobody talks. However, research shows that starting up a conversation with a stranger can make you feel happier and enjoy your day more. When Allison Owen-Jones saw a man sitting alone on a bench in the park, she wanted to talk to him, but she felt uncomfortable because she was not sure he would want to chat. Then she had an idea: Happy to chat benches. The sign said: Sit here if you don\'t mind someone stopping to say hello. The idea was a success. Now these benches can be found in several countries including Canada, the USA, Australia, Switzerland and Ukraine. So, the next time you see someone sitting alone, give them a smile and say hello.',marks:[]}],
    ['task','classwork',{title:'Over to you',text:'1 How often do you talk to people you don\'t know? 2 Do you like small talk? 3 Would happy to chat benches be a good idea where you live? 4 Think of 5 topics that are okay to talk about with strangers.',response:''}],
    ['link','homework',link('Flashcards','https://wordwall.net/ru/resource/119364241?wwmethod=link&wwshareintent=student')],
    ['link','homework',link('making a conversation','https://wordwall.net/ru/resource/95566681/english/so-intermediate-3rd-edition-unit-1c-making-a')],
    ['link','homework',link('Flashcards 2','https://wordwall.net/ru/resource/119365101?wwmethod=link&wwshareintent=student')],
    ['pdf','pdf',{name:'16.09.2026.pdf',title:'Lesson PDF',size:'',caption:'Small talk.'}]
  ]),
  lesson('lesson_2026_09_21',['Weather, small talk, likes and dislikes','Monday. Weather, small talk, likes. Level A2.','English A2','Weather','Small talk','2026-09-21'],[
    ['heading','overview',{level:'h2',text:'What you will learn'}],
    ['text','overview',{html:'<p>How to describe weather with It\'s + adjective and There\'s + noun. Small-talk lines. Like and dislike patterns. Weather happening now: We are having a thunderstorm.</p>'}],
    ['vocab','words',vocab('Weather',[['humid','влажный, душный','It\'s humid.'],['damp','сырой','It\'s damp.'],['wet','мокрый','It\'s wet.'],['dry','сухой','It\'s sunny and dry.'],['windy','ветреный','It\'s windy and cloudy.'],['chilly','прохладный','It\'s chilly.'],['boiling','очень жаркий','It\'s boiling.'],['freezing','морозный','It\'s freezing.'],['mild','мягкий','It\'s mild.'],['drizzle','морось','There\'s drizzle.'],['shower','короткий сильный дождь','There is a shower.'],['thunderstorm','гроза','There\'s a thunderstorm.'],['heavy rain','сильный дождь','There\'s heavy rain.'],['sunny','солнечный','It\'s sunny.'],['cloudy','облачный','It\'s cloudy.'],['rainy','дождливый','It\'s rainy.'],['snowy','снежный','It\'s snowy.'],['pleasant','приятный','It\'s pleasant.'],['warm','теплый','It\'s warm.'],['cold','холодный','It\'s cold.'],['hot','жаркий','It\'s hot.']])],
    ['phrase','phrases',phrase([
      ['Do you mind if I take this chair?','Вы не против, если я возьму этот стул?',''],
      ['Do you know if there is an ATM near here?','Вы не знаете, есть ли банкомат поблизости?',''],
      ['Excuse me, is anyone sitting here?','Извините, здесь кто-нибудь сидит?',''],
      ['Is this your first time here?','Вы здесь первый раз?',''],
      ['How long have you worked here?','Как долго вы здесь работаете?',''],
      ['That\'s my bus.','Это мой автобус.',''],['I\'ve got to go.','Мне пора идти.',''],['Help yourself!','Угощайтесь.','']
    ])],
    ['rule','rules',{topic:'pc',compare:false,name:'Present Continuous',collapsed:false}],
    ['rule','rules',{topic:'pp',compare:false,name:'Present Perfect',collapsed:false}],
    ['text','rules',{html:'<p>It\'s plus an adjective: It\'s humid, It\'s chilly. There\'s plus a noun: There\'s drizzle, There\'s a thunderstorm. It\'s hot and rainy means humid.</p><p>We are having a thunderstorm. We are having a few showers. This is weather at the moment of speaking.</p><p>How long have you worked here? The period started in the past and continues until now.</p><p>I\'m keen on / I\'m into / I\'m interested in plus a noun or -ing. I prefer dancing to doing sport. I don\'t mind and I can\'t stand plus -ing. After keen on, do not use a bare infinitive.</p>'}],
    ['link','classwork',link('Classwork','https://wordwall.net/ru/resource/119542975/05-best-weather-for')],
    ['link','homework',link('Weather flashcards','https://wordwall.net/ru/resource/119605817')],
    ['link','homework',link('Navigate 1.4','https://wordwall.net/ru/resource/107569088/navigate-pre-int-14-2')],
    ['link','homework',link('Likes flashcards','https://wordwall.net/ru/resource/119607073')],
    ['link','homework',link('true / false','https://wordwall.net/ru/resource/119607967')],
    ['link','homework',link('type the verb','https://wordwall.net/ru/resource/119608490')],
    ['pdf','pdf',{name:'21.09.2026.pdf',title:'Lesson PDF',size:'',caption:'Weather, small talk, likes and dislikes.'}]
  ]),
  lesson('lesson_2026_09_23',['Holidays','Wednesday. Holidays and preferences. Level B1.','English A2','Holidays','Past Simple','2026-09-23'],[
    ['heading','overview',{level:'h2',text:'What you will learn'}],
    ['text','overview',{html:'<p>How to say you love, like, prefer or can\'t stand something. Past Simple, including was/were, for a holiday story. One second-conditional question.</p><p>I\'m keen on cycle. → I\'m keen on cycling. I prefer tennis than volleyball. → I prefer tennis to volleyball. Did you went? → Did you go?</p>'}],
    ['phrase','phrases',phrase([
      ['They really love …','Им очень нравится …',''],['They prefer …','Они предпочитают …',''],
      ['They can’t stand …','Они терпеть не могут …',''],['They don’t mind when …','Они не против, когда …',''],
      ['They quite like …','Им довольно нравится …',''],['I really love (when) …','Мне очень нравится (когда) …','I really love cycling'],
      ['I quite like …','Мне довольно нравится …','I quite like camping.'],['I prefer … to …','Я предпочитаю …','I prefer tennis to volleyball.'],
      ['I can’t stand (when)…','Я терпеть не могу (когда)…','I can’t stand long winters.'],
      ['I don’t mind (when) …','Я не против (когда) …','I don’t mind doing housework.'],
      ['I’m keen on','Мне очень нравится','I’m keen on cycling'],['I enjoy …','Мне нравится заниматься …',''],
      ['I’m really interested in …','Мне правда интересно …','I am interested in classical music.'],
      ['I’m into …','Я увлекаюсь …','I am into yoga.'],
      ['flip flops','шлепанцы',''],['street food','уличная еда',''],['gardening','садоводство','']
    ])],
    ['rule','rules',{topic:'pasts',compare:false,name:'Past Simple',collapsed:false}],
    ['rule','rules',{topic:'could',compare:false,name:'could',collapsed:false}],
    ['rule','rules',{topic:'second',compare:false,name:'Second Conditional',collapsed:false}],
    ['text','rules',{html:'<p>Affirmative: V2 or verb-ed. Negative and question: didn\'t / Did + base form. I / he / she / it was. You / we / they were. Markers: last week, yesterday, in 1991, 3 months ago. Can → could.</p><p>What would you do if you couldn\'t find your phone?</p><p>After keen on, into, enjoy, mind and can\'t stand, use a noun or -ing.</p>'}],
    ['task','classwork',{title:'A holiday in Scotland',text:'Two summers ago we had a holiday in Scotland. We 1 ____ (drive) there from London, but our car 2 ____ (break) down and we 3 ____ (spend) the first night in Birmingham. When we 4 ____ (get) to Edinburgh we 5 ____ (go) to our hotel, but they 6 ____ (not can) find our reservation, and they 7 ____ (be) full. We 8 ____ (not know) what to do, but we 9 ____ (find) a Bed and Breakfast and we 10 ____ (stay) there for the week. We 11 ____ (see) the castle and 12 ____ (buy) a lot of souvenirs. We 13 ____ (want) to go to Loch Ness, but we 14 ____ (not have) much time and it 15 ____ (be) quite far away. The weather 16 ____ (not be) very good. It 17 ____ (start) raining the day we 18 ____ (leave) London, and it never 19 ____ (stop)! Answers: drove, broke down, spent, got, went, couldn\'t find, were, didn\'t know, found, stayed, saw, bought, wanted, didn\'t have, was, wasn\'t, started, left, stopped.',response:''}],
    ['link','homework',link('Flashcards','https://wordwall.net/ru/resource/119364241?wwmethod=link&wwshareintent=student')],
    ['link','homework',link('making a conversation','https://wordwall.net/ru/resource/95566681/english/so-intermediate-3rd-edition-unit-1c-making-a')],
    ['link','homework',link('Flashcards 2','https://wordwall.net/ru/resource/119365101?wwmethod=link&wwshareintent=student')],
    ['pdf','pdf',{name:'23.09.2026.pdf',title:'Lesson PDF',size:'',caption:'Holidays and preferences.'}]
  ])
];
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,file,flag,target,...extra]=process.argv.slice(2);
    assert.ok(mode==='--apply'&&flag==='--target'&&target==='english-quiz-production'&&!extra.length);
    const db=new TursoStudyClient({...productionCredentials(file),mode:'production'});
    const added=[];
    for(const commands of lessons){
      const id=commands[0].args[0].value;
      const date=commands[0].args[6].value;
      const existing=await db.read('SELECT id FROM lessons WHERE deleted_at IS NULL AND (id=? OR lesson_date=?)',[id,date]);
      if(existing.length){added.push({id,status:'already-present'});continue;}
      await db.atomic(commands);
      const blocks=await db.read('SELECT id FROM lesson_blocks WHERE lesson_id=? AND deleted_at IS NULL',[id]);
      assert.equal(blocks.length,commands.length-1);
      added.push({id,status:'added',blocks:blocks.length});
    }
    console.log(JSON.stringify(added));
  }catch(error){console.error('Lessons stopped: '+error.message);process.exitCode=1;}
}
