export function lessonPdfFixture(){
  const task=(stage,kind,title,text,extra={})=>({stage,kind,title,text,options:[],answer:-1,feedback:'',criteria:'',teacherAnswer:'',pages:[1],generated:kind!=='explanation',...extra});
  return {title:'Greetings',description:'Introduce yourself.',unit:'',lesson:'',overview:'Learn greetings, practise, then introduce yourself.',warnings:[],
    words:[{word:'hello',meaning:'a greeting',translation:'',example:'Hello, Sam.',pages:[1],generated:false}],
    phrases:[{phrase:'How are you?',meaning:'Ask about wellbeing.',example:'Hello. How are you?',pages:[1],generated:false}],
    rules:[{title:'I am',explanation:'Use I am with your name.',examples:['I am Sam.'],pages:[1],generated:false}],
    classwork:[
      task('explanation','explanation','Names and greetings','Use hello to greet someone. Say I am followed by your name.'),
      task('comprehension','choice','Choose a greeting','Which word is a greeting?',{options:['Hello','Table'],answer:0,feedback:'Hello is used to greet someone.'}),
      task('guided','choice','Complete the introduction','I ___ Sam.',{options:['am','is'],answer:0,feedback:'Use am after I.'}),
      task('independent','open','Introduce yourself','Greet a partner and say your name.',{criteria:'Greeting | 1\nName | 1',teacherAnswer:'Hello. I am Sam.'}),
      task('final','open','Start a conversation','Write a short introduction and ask your partner their name.',{criteria:'Introduction | 1\nQuestion | 1',teacherAnswer:'Hello. I am Sam. What is your name?'}),
    ],
  };
}
