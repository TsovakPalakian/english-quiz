export function lessonPdfFixture({practice=false}={}){
  const task=(stage,kind,title,text,extra={})=>({stage,kind,title,text,options:[],answer:-1,feedback:'',criteria:'',teacherAnswer:'',pages:[1],generated:kind!=='explanation',...extra});
  const result={title:'Greetings',description:'Introduce yourself.',unit:'',lesson:'',overview:'Learn greetings, practise, then introduce yourself.',warnings:[],
    words:[{word:'hello',meaning:'a greeting',translation:'привет',example:'Hello, Sam.',pages:[1],generated:false}],
    phrases:[{phrase:'How are you?',meaning:'Ask about wellbeing.',translation:'Как дела?',example:'Hello. How are you?',pages:[1],generated:false}],
    rules:[{title:'I am',explanation:'Use I am with your name.',examples:['I am Sam.'],pages:[1],generated:false}],
    classwork:[
      task('explanation','explanation','Names and greetings','Use hello to greet someone. Say I am followed by your name.'),
      task('comprehension','choice','Choose a greeting','Which word is a greeting?',{options:['Hello','Table'],answer:0,feedback:'Hello is used to greet someone.'}),
      task('guided','choice','Complete the introduction','I ___ Sam.',{options:['am','is'],answer:0,feedback:'Use am after I.'}),
      task('independent','open','Introduce yourself','Greet a partner and say your name.',{criteria:'Greeting | 1\nName | 1',teacherAnswer:'Hello. I am Sam.'}),
      task('final','open','Start a conversation','Write a short introduction and ask your partner their name.',{criteria:'Introduction | 1\nQuestion | 1',teacherAnswer:'Hello. I am Sam. What is your name?'}),
    ],
  };
  if(practice){
    result.classwork.push(
      task('comprehension','choice','Understand the introduction','What does I am Sam tell us?',{options:['A name','An age'],answer:0,feedback:'Sam is the speaker’s name.'}),
      task('comprehension','choice','Recognise a question','Which sentence asks about wellbeing?',{options:['How are you?','I am Sam.'],answer:0,feedback:'How are you asks about wellbeing.'}),
      task('guided','choice','Complete a greeting','___, Sam!',{options:['Hello','Am'],answer:0,feedback:'Hello greets a person.'}),
      task('guided','choice','Choose the pronoun','___ am Alex.',{options:['I','She'],answer:0,feedback:'Use I with am.'}),
      task('independent','open','Welcome a classmate','Write a greeting and ask a classmate their name.',{criteria:'Greeting | 1\nQuestion | 1',teacherAnswer:'Hello. What is your name?'}),
    );
    const order=['explanation','comprehension','guided','independent','final'];result.classwork.sort((a,b)=>order.indexOf(a.stage)-order.indexOf(b.stage));
  }
  return result;
}
