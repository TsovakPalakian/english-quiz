// Public-domain source text and media; exercises are original adaptations.
export const sources={
  book:'https://www.gutenberg.org/ebooks/11',
  text:'https://www.gutenberg.org/cache/epub/11/pg11.txt',
  pdf:'https://ftp.gwdg.de/pub/misc/gutenberg/1/11/11-pdf.pdf',
  imagePage:'https://commons.wikimedia.org/wiki/File:The_White_Rabbit_(Tenniel)_-_The_Nursery_Alice_(1890)_-_BL.jpg',
  image:'https://upload.wikimedia.org/wikipedia/commons/4/42/The_White_Rabbit_%28Tenniel%29_-_The_Nursery_Alice_%281890%29_-_BL.jpg',
  audioPage:'https://librivox.org/alices-adventures-in-wonderland-by-lewis-carroll/',
  audio:'https://dn710305.ca.archive.org/0/items/alice_in_wonderland_librivox/wonderland_ch_01_64kb.mp3',
  videoPage:'https://commons.wikimedia.org/wiki/File:Alice_in_Wonderland_(1903)_-_yt.webm',
  video:'https://upload.wikimedia.org/wikipedia/commons/5/54/Alice_in_Wonderland_%281903%29_-_yt.webm'
};
const excerpt='Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "and what is the use of a book," thought Alice "without pictures or conversations?"';
const part=(type,fields)=>({type,tab:'overview',...fields});
const quiz=(quizType,items)=>part('quiz',{quizType,title:quizType+' - Wonderland',items});
const words=[
  {word:'rabbit',translation:'a small animal with long ears',ipa:'/\u02c8r\u00e6b\u026at/',example:'A White Rabbit ran close by Alice.'},
  {word:'curious',translation:'wanting to know or learn more',ipa:'/\u02c8kj\u028a\u0259ri\u0259s/',example:'Alice was curious about the Rabbit.'},
  {word:'bank',translation:'the land beside a river',ipa:'/b\u00e6\u014bk/',example:'Alice was sitting on the bank.'},
  {word:'pocket',translation:'a small bag sewn into clothing',ipa:'/\u02c8p\u0252k\u026at/',example:'The Rabbit took a watch out of his pocket.'}
];
export const allMaterialsBlock={title:'All Materials - Alice in Wonderland',published:true,hidden:false,materials:[
  part('heading',{level:'h2',text:'Down the Rabbit-Hole'}),
  part('text',{html:'<p><strong>Alice\'s Adventures in Wonderland</strong>, Lewis Carroll (1865), Chapter I.</p><p>'+excerpt+'</p>'}),
  part('reading',{title:'Read and select unfamiliar words',text:excerpt,marks:[]}),
  part('image',{title:'The White Rabbit',name:'white-rabbit.jpg',remoteUrl:sources.image,caption:'John Tenniel, The Nursery Alice (1890). British Library / Wikimedia Commons, CC0.'}),
  part('audio',{title:'Chapter 1 - Down the Rabbit-Hole',name:'wonderland-chapter-1.mp3',remoteUrl:sources.audio,caption:'Read by Kristen McQuillin, LibriVox. Public-domain recording; 10:40.'}),
  part('video',{source:'link',title:'Alice in Wonderland - silent film (1903)',url:sources.video}),
  part('pdf',{title:'Alice\'s Adventures in Wonderland - full book',name:'alice-in-wonderland.pdf',remoteUrl:sources.pdf}),
  part('file',{title:'Download the original English text',name:'alice-in-wonderland.txt',remoteUrl:sources.text}),
  part('link',{title:'Read the complete book at Project Gutenberg',url:sources.book,description:'Lewis Carroll, 1865. Public-domain English text and download formats.'}),
  part('cards',{title:'Vocabulary cards',items:words.map(w=>({front:w.word,back:w.translation,example:w.example}))}),
  part('vocab',{title:'Words from the story',items:words}),
  part('wordcard',{word:'rabbit',ru:'\u043a\u0440\u043e\u043b\u0438\u043a',pos:'noun',uk:'/\u02c8r\u00e6b\u026at/',us:'/\u02c8r\u00e6b\u026at/'}),
  part('pronunciation',{word:'Down the Rabbit-Hole',ipa:'/da\u028an \u00f0\u0259 \u02c8r\u00e6b\u026at h\u0259\u028al/',name:'chapter-1-pronunciation.mp3',remoteUrl:sources.audio}),
  part('rule',{topic:'pastc',name:'Past Continuous - was reading',compare:false}),
  part('table',{columns:['Past Simple','Past Continuous','Use'],rows:[['The Rabbit ran.','Alice was sitting.','A completed event / background activity'],['Alice peeped into the book.','Her sister was reading.','A short event / an action in progress']]}),
  part('phrase',{items:[{phrase:'once or twice',meaning:'one or two times',example:'Alice had peeped into the book once or twice.'},{phrase:'nothing to do',meaning:'no activity or task',example:'Alice had nothing to do.'},{phrase:'get tired of',meaning:'become bored with something',example:'Alice was getting tired of sitting.'}]}),
  part('dialogue',{title:'Role-play - adapted from Chapter I',lines:[{speaker:'Alice',text:'What is the use of a book without pictures or conversations?'},{speaker:'White Rabbit',text:'Oh dear! Oh dear! I shall be too late!'},{speaker:'Alice',text:'A rabbit with a watch? How curious!'}]}),
  part('note',{tone:'tip',text:'Was/were + verb-ing describes an activity in progress in the past. Notice "her sister was reading" in the original paragraph.'}),
  part('exercise',{items:[{prompt:'Who was reading the book?',kind:'choice',options:['Alice','Her sister','The Rabbit'],answer:1},{prompt:'Complete: Her sister was ___.',kind:'write',write:'reading'}]}),
  part('task',{title:'Continue the story',text:'Write 60-80 words about what Alice does next. Use two past-simple verbs and two past-continuous verbs. Then compare your story with Chapter I.',response:''}),
  part('divider',{label:'Quiz collection'}),
  quiz('Flip',[{front:'rabbit',back:'a small animal with long ears'}]),
  quiz('Choice',[{prompt:'Why did Alice dislike the book?',options:['It had no pictures or conversations.','It was too heavy.','It was written in French.'],answer:0}]),
  quiz('Type',[{prompt:'Who was sitting beside Alice?',answer:'her sister'}]),
  quiz('Gap',[{shown:'Her sister was ___ (read) a book.',answer:'reading',hint:'Use the -ing form.'}]),
  quiz('Build',[{parts:'was / Alice / on / sitting / the / bank',answer:'Alice was sitting on the bank'}]),
  quiz('Match',words.slice(0,3).map(w=>({left:w.word,right:w.translation}))),
  quiz('True / false',[{prompt:'The book had pictures.',answer:'false'},{prompt:'Alice was sitting beside her sister.',answer:'true'}]),
  quiz('Tap',[{text:'The White Rabbit ran close by Alice.',answer:'Rabbit'}]),
  quiz('Select all',[{prompt:'Which details appear in the first paragraph?',options:['a sister','a book','a train','no pictures'],answers:[0,1,3]}]),
  quiz('Reverse',[{front:'a small animal with long ears',back:'rabbit'}]),
  quiz('Spell',[{word:'rabbit'}]),
  quiz('Letters',[{word:'curious'}]),
  quiz('Listen',[{prompt:'Listen to the first 20 seconds of Chapter 1. Complete: Alice was beginning to get very ___.',answer:'tired'}]),
  quiz('Definition',[{prompt:'A small bag sewn into clothing.',answer:'pocket'}]),
  quiz('Odd one out',[{options:['rabbit','cat','mouse','book'],answer:3}]),
  quiz('Memory',words.map(w=>({left:w.word,right:w.translation}))),
  quiz('Hangman',[{word:'conversation'}]),
  part('text',{html:'<p><strong>Sources and credits</strong></p><ul>'+[
    ['Lewis Carroll - original book (1865), public domain',sources.book],
    ['John Tenniel / British Library - illustration (1890), CC0',sources.imagePage],
    ['Kristen McQuillin / LibriVox - Chapter 1, public-domain recording',sources.audioPage],
    ['Cecil Hepworth and Percy Stow - film (1903), public domain',sources.videoPage],
    ['Project Gutenberg / GWDG mirror - PDF edition',sources.pdf]
  ].map(([label,url])=>'<li><a href="'+url+'" target="_blank" rel="noreferrer">'+label+'</a></li>').join('')+'</ul><p>Exercises, definitions and role-play are original adaptations of the cited story. The complete book includes the Project Gutenberg license.</p>'})
]};
export function groupDemonstrationMaterials(materials){
  const parts=structuredClone(materials);
  for(const [index,part] of parts.entries()){
    if(['quiz','exercise','task'].includes(part.type))Object.assign(part,{assignmentId:part.assignmentId||'alice-task-'+index,gradeMode:'assignment',maxPoints:part.maxPoints??10.1});
  }
  const reading=parts.find(p=>p.type==='exercise'),listening=parts.find(p=>p.quizType==='Listen');
  for(const part of parts)if(['text','reading','image'].includes(part.type)&&!String(part.html||'').includes('Sources and credits'))part.assignmentKey=reading.assignmentId;
  const audio=parts.find(p=>p.type==='audio');if(audio)audio.assignmentKey=listening.assignmentId;
  let filmTask=parts.find(p=>p.assignmentId==='alice-film-task');
  if(!filmTask){filmTask={type:'task',tab:'overview',title:'Watch and describe the silent film',text:'Watch the opening two minutes. Write 40-60 words describing Alice, the White Rabbit and two actions you can see. Use the past continuous for one action.',assignmentId:'alice-film-task',gradeMode:'assignment',maxPoints:10.1};parts.push(filmTask);}
  const video=parts.find(p=>p.type==='video');if(video)video.assignmentKey=filmTask.assignmentId;
  return parts;
}
