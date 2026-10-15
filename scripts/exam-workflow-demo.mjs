import {allMaterialsBlock} from './practice-all-materials.mjs';
const material=(type,fields)=>({type,tab:'overview',...fields});
const block=(title,materials)=>({title,published:true,hidden:false,materials});
export function examWorkflowDemo(groupId){
  const source=structuredClone(allMaterialsBlock.materials).filter(part=>part.quizType!=='Flip');
  for(const [i,part] of source.entries()){
    part.assignmentId='demo-material-'+i;delete part.assignmentKey;
    if(['task','quiz','exercise','cards','vocab'].includes(part.type)){
      part.scoringVersion=3;part.maxPoints=['Match','Memory'].includes(part.quizType)?4:part.type==='task'?4:1;
      for(const item of part.items||[])item.maxPoints=1;
    }
    if(part.type==='rule')part.ruleSnapshot='<h3>Past continuous</h3><p>Use was/were + verb-ing for an action in progress in the past.</p><p>Her sister was reading a book.</p>';
    if(part.quizType==='Type'&&part.items[0])part.items[0].maxPoints=2;
  }
  const intro=source.filter(part=>!['quiz','exercise','task','cards','vocab'].includes(part.type));
  const vocabulary=source.filter(part=>['cards','vocab'].includes(part.type));
  const quizzes=source.filter(part=>part.type==='quiz');
  const answer=(id,title,html,settings)=>material('text',{assignmentId:id,answerEnabled:true,scoringVersion:3,title,html,maxPoints:3,...settings});
  const written=[
    material('text',{html:'<p>1. Write the plural of child. 2. Say how you feel today and why. 3. Write three sentences about your routine.</p>'}),
    answer('demo-exact','Plural of child','<p>children</p>',{checkMode:'exact',allowedAnswers:'children',ignoreCase:true,ignoreWhitespace:true,ignorePunctuation:true}),
    answer('demo-meaning','How are you today? Why?',"<p>I'm fine because I slept well.</p>",{checkMode:'meaning',answerPurpose:'example',criteria:'Relevance | 1\nReason | 1\nUnderstandable English | 1'}),
    answer('demo-manual','Describe your daily routine','<p>I get up at seven. I study English in the morning. I go for a walk in the evening.</p>',{checkMode:'teacher',criteria:'Relevant details | 1\nSentence structure | 1\nVocabulary | 1'})
  ];
  const group=material('task',{contentGroup:true,assignmentId:'demo-content-group',title:'Reading resources'});
  const task=material('task',{assignmentId:'demo-task-group',scoringVersion:3,title:'Read and answer',text:'Read the text and answer the two questions.'});
  const nested=material('task',{contentGroup:true,assignmentId:'demo-nested',assignmentKey:'demo-task-group',title:'Helpful materials'});
  const grouped=[group,material('text',{assignmentKey:group.assignmentId,html:'<p>Alice is sitting by the river. Her sister is reading.</p>'}),material('note',{assignmentKey:group.assignmentId,tone:'tip',text:'A Content group combines resources without extra points.'}),task,nested,material('text',{assignmentKey:nested.assignmentId,html:'<p>Anna lives in Yerevan. She studies English every Monday.</p>'}),material('quiz',{assignmentKey:task.assignmentId,assignmentId:'demo-group-choice',scoringVersion:3,quizType:'Choice',title:'Choose the city',items:[{prompt:'Where does Anna live?',options:['London','Yerevan'],answer:1,maxPoints:2}]}),answer('demo-group-answer','When does Anna study?','<p>Every Monday.</p>',{assignmentKey:task.assignmentId,checkMode:'exact',allowedAnswers:'every Monday\non Monday\non Mondays',ignoreCase:true,ignoreWhitespace:true,ignorePunctuation:true})];
  return {title:'A1 Complete Exam Demo',groupId,date:new Date().toISOString().slice(0,10),published:true,hidden:false,blocks:[block('01 - Content and media',intro),block('02 - Vocabulary',vocabulary),block('03 - Quiz collection: all 16 types',quizzes),block('04 - Written answers and checking modes',written),block('05 - Task and Content group combinations',grouped),block('06 - Questions and independent task',source.filter(part=>['exercise','task'].includes(part.type)))]};
}
