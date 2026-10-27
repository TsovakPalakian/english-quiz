import {AssessmentService,gradingQuestions,rubric} from './learning-assessment.mjs';
import {StudyError,statement as s} from './learning-study.mjs';
import {saveBug} from './bug-log.mjs';

const DISCOURSE_CONNECTORS=Object.freeze([
  'furthermore','moreover','in addition','additionally','besides','what is more',
  'however','on the other hand','in contrast','nevertheless','nonetheless','yet','although','while','whereas','conversely','despite this',
  'therefore','consequently','as a result','thus','because of this','hence','for this reason','accordingly',
  'first of all','firstly','secondly','thirdly','finally','in conclusion','to sum up','to conclude','in summary','overall',
  'for example','for instance','such as','to illustrate','namely'
]);

const ACADEMIC_VOCABULARY=Object.freeze([
  'significant','fundamental','perspective','alternative','consequence','implement',
  'establish','contribute','framework','perceive','demonstrate','emphasis','indicate',
  'subsequent','comprehensive','facilitate','impact','analyze','crucial','beneficial',
  'detrimental','essential','substantial','prevalent','evident','primary','potential',
  'dimension','proportion','widespread','acknowledge','illustrate','notion','apparent',
  'considerable','distinct','enable','generate','initial','justify','maintain','objective',
  'principles','reinforce','sustain','underlying','valid','variable'
]);

const SUBORDINATORS=Object.freeze([
  'although','even though','though','because','since','while','whereas','if','unless',
  'whether','after','before','as soon as','so that','in order that','provided that'
]);

const RELATIVE_PRONOUNS=Object.freeze(['which','that','who','whom','whose','where','when','why']);

const WEAK_WORDS=Object.freeze(['good','bad','nice','thing','things','a lot of','stuff']);

export function analyzeEssayText(text,{minWords=150}={}){
  const rawText=typeof text==='string'?text.trim():'';
  if(!rawText)return {
    wordCount:0,sentenceCount:0,paragraphCount:0,
    metrics:{taskAchievement:0,coherenceCohesion:0,lexicalResource:0,grammarAccuracy:0},
    overallScore:0,strengths:[],areasForGrowth:['The submitted essay is empty.'],
    feedback:'Please provide a response to receive feedback.'
  };

  const words=rawText.match(/\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g)||[];
  const wordCount=words.length;
  const lowerWords=words.map(w=>w.toLowerCase());
  const uniqueWords=new Set(lowerWords);

  const paragraphs=rawText.split(/\n\s*\n+/).filter(p=>p.trim().length>0);
  const paragraphCount=Math.max(1,paragraphs.length);

  const sentences=rawText.split(/[.!?]+(?:\s+|$)/).filter(s=>s.trim().length>0);
  const sentenceCount=Math.max(1,sentences.length);

  // 1. Task Achievement / Response (0-100)
  let taScore=0;
  if(wordCount<15)taScore=10;
  else if(wordCount<minWords*0.5)taScore=Math.round(20+(wordCount/(minWords*0.5))*30);
  else if(wordCount<minWords)taScore=Math.round(55+((wordCount-minWords*0.5)/(minWords*0.5))*25);
  else taScore=Math.min(100,Math.round(80+Math.min(20,(wordCount-minWords)/5)));

  // 2. Coherence & Cohesion (0-100)
  const detectedConnectors=[];
  const lowerText=rawText.toLowerCase();
  for(const connector of DISCOURSE_CONNECTORS){
    const pattern=new RegExp(`\\b${connector.replace(/\s+/g,'\\s+')}\\b`,'i');
    if(pattern.test(lowerText)&&!detectedConnectors.includes(connector))detectedConnectors.push(connector);
  }
  const paragraphScore=paragraphCount>=3?35:paragraphCount===2?25:15;
  const connectorScore=Math.min(45,detectedConnectors.length*10);
  const avgSentenceLength=wordCount/sentenceCount;
  const lengthVarietyScore=avgSentenceLength>=12&&avgSentenceLength<=28?20:10;
  const ccScore=Math.min(100,Math.max(10,paragraphScore+connectorScore+lengthVarietyScore));

  // 3. Lexical Resource (0-100)
  const ttr=wordCount>0?uniqueWords.size/wordCount:0;
  const ttrScore=Math.min(40,Math.round(ttr*60));
  const detectedAcademic=[];
  for(const word of lowerWords){
    const match=ACADEMIC_VOCABULARY.find(base=>word===base||word===base+'ly'||word===base+'s'||word===base+'es'||word===base+'ed'||word===base+'ing'||(base.length>5&&word.startsWith(base.slice(0,-2))));
    if(match&&!detectedAcademic.includes(match))detectedAcademic.push(match);
  }
  const uniqueAcademic=new Set(detectedAcademic);
  const academicScore=Math.min(35,uniqueAcademic.size*8);
  const weakCount=lowerWords.filter(w=>WEAK_WORDS.includes(w)).length;
  const weakPenalty=Math.min(15,weakCount*3);
  const lrScore=Math.min(100,Math.max(10,25+ttrScore+academicScore-weakPenalty));

  // 4. Grammatical Range & Accuracy (0-100)
  let complexSentenceCount=0;
  let runOnCount=0;
  for(const sentence of sentences){
    const sLower=sentence.toLowerCase();
    const sWords=(sentence.match(/\b\w+\b/g)||[]).length;
    if(sWords>45)runOnCount++;
    const hasSubordinator=SUBORDINATORS.some(sub=>new RegExp(`\\b${sub}\\b`).test(sLower));
    const hasRelative=RELATIVE_PRONOUNS.some(rel=>new RegExp(`\\b${rel}\\b`).test(sLower));
    if(hasSubordinator||hasRelative)complexSentenceCount++;
  }
  const complexRatio=sentenceCount>0?complexSentenceCount/sentenceCount:0;
  const complexScore=Math.min(50,Math.round(complexRatio*100));
  const runOnPenalty=runOnCount*10;
  const graScore=Math.min(100,Math.max(10,35+complexScore-runOnPenalty));

  const metrics={
    taskAchievement:taScore,
    coherenceCohesion:ccScore,
    lexicalResource:lrScore,
    grammarAccuracy:graScore
  };

  const overallScore=Math.round((taScore*0.25+ccScore*0.25+lrScore*0.25+graScore*0.25)*10)/10;

  // Synthesize Strengths and Areas for Growth
  const strengths=[];
  const areasForGrowth=[];

  if(wordCount>=minWords)strengths.push(`Good response length: ${wordCount} words (meets target of ${minWords}).`);
  else areasForGrowth.push(`Word count (${wordCount}) is below the recommended minimum of ${minWords} words.`);

  if(paragraphCount>=3)strengths.push(`Clear paragraph structure with ${paragraphCount} distinct sections.`);
  else areasForGrowth.push('Organize the essay into at least 3-4 distinct paragraphs (Introduction, Body Paragraphs, Conclusion).');

  if(detectedConnectors.length>=3)strengths.push(`Effective cohesive devices detected: ${detectedConnectors.slice(0,4).join(', ')}.`);
  else areasForGrowth.push('Incorporate more transition signals (e.g. "Furthermore", "However", "Consequently") to link ideas.');

  if(uniqueAcademic.size>=3)strengths.push(`Varied academic vocabulary: ${Array.from(uniqueAcademic).slice(0,5).join(', ')}.`);
  else areasForGrowth.push('Enhance lexical resource with formal B2/C1 terms instead of repetitive everyday words.');

  if(complexRatio>=0.3)strengths.push(`Good syntactic variety with ${Math.round(complexRatio*100)}% complex/compound sentences.`);
  else areasForGrowth.push('Practice complex sentence structures using subordinators ("although", "because", "while", "which").');

  if(runOnCount>0)areasForGrowth.push(`Watch sentence boundaries: detected ${runOnCount} overly long run-on sentence(s).`);

  const feedback=[
    '**Overall Impression**: '+((overallScore>=75)?'Well-structured, competent essay demonstrating strong language control.'
      :overallScore>=60?'Solid attempt meeting core communicative goals with room for polish.'
      :'Developing text that would benefit from targeted revision on structure and vocabulary.'),
    '',
    '**Key Strengths**:',
    ...strengths.map(s=>`• ${s}`),
    '',
    '**Areas for Growth**:',
    ...areasForGrowth.map(a=>`• ${a}`)
  ].join('\n');

  return {
    wordCount,
    sentenceCount,
    paragraphCount,
    detectedConnectors,
    academicVocabulary:Array.from(uniqueAcademic),
    metrics,
    overallScore,
    strengths,
    areasForGrowth,
    feedback
  };
}

export function mapAnalysisToRubric(analysis,criteriaString,maxPoints=100){
  const criteriaList=rubric(criteriaString);
  const {metrics,overallScore}=analysis;

  if(!criteriaList.length){
    const scaledPoints=Math.round((overallScore/100)*maxPoints*10)/10;
    return {
      criteriaScores:{'Task Achievement':scaledPoints},
      totalPoints:scaledPoints,
      maxPoints
    };
  }

  const scores={};
  let totalPoints=0;
  const totalMax=criteriaList.reduce((sum,c)=>sum+c.max,0);

  for(const crit of criteriaList){
    const name=crit.label.toLowerCase();
    let normalized=overallScore; // fallback to composite

    if(/task|response|achievement|content/i.test(name)){
      normalized=metrics.taskAchievement;
    }else if(/coher|cohes|structure|organiz|flow/i.test(name)){
      normalized=metrics.coherenceCohesion;
    }else if(/lexic|vocab|word|range/i.test(name)){
      normalized=metrics.lexicalResource;
    }else if(/gramm|accura|syntax|mechanic/i.test(name)){
      normalized=metrics.grammarAccuracy;
    }

    const points=Math.round((normalized/100)*crit.max*10)/10;
    scores[crit.label]=points;
    totalPoints+=points;
  }

  return {
    criteriaScores:scores,
    totalPoints:Math.round(totalPoints*10)/10,
    maxPoints:totalMax
  };
}

export async function essayCopilot(db,env,actor,{id,studentId,partId,index=0,expectedRevision,targetMinWords=150}){
  if(!['ADMIN','DEVELOPER'].includes(actor?.role)||actor.id===studentId){
    throw new StudyError(403,'Teacher review only.');
  }

  const assessment=new AssessmentService(db);
  const work=await assessment.get(actor,{kind:'exam-block',id,studentId});
  if(!work.saved||work.state==='published'||work.revision!==expectedRevision){
    throw new StudyError(409,'Open the current submitted work before requesting a recommendation.');
  }

  const question=gradingQuestions(work.materials).find(q=>q.part.id===partId&&q.index===index);
  if(!question||(!['task','exercise'].includes(question.part.type)&&question.part.checkMode!=='meaning')){
    throw new StudyError(400,'Choose an open response task.');
  }

  const answer=work.answers[partId]?.[index]||'';
  if(typeof answer!=='string'||answer.length>10000){
    throw new StudyError(400,'The answer is too long for automatic review.');
  }

  const analysis=analyzeEssayText(answer,{minWords:targetMinWords});
  const mapped=mapAnalysisToRubric(analysis,question.part.criteria,question.max);

  const result={
    status:'recommended',
    provider:'cefr-sla-copilot',
    criteriaScores:mapped.criteriaScores,
    totalPoints:mapped.totalPoints,
    maxPoints:mapped.maxPoints,
    metrics:analysis.metrics,
    wordCount:analysis.wordCount,
    sentenceCount:analysis.sentenceCount,
    paragraphCount:analysis.paragraphCount,
    strengths:analysis.strengths,
    areasForGrowth:analysis.areasForGrowth,
    feedback:analysis.feedback,
    requiresTeacher:true
  };

  // Optional external AI model enhancement if EXAM_REVIEW_URL is configured
  if(['local','external'].includes(env.EXAM_REVIEW_PROVIDER)&&env.EXAM_REVIEW_URL){
    try{
      const endpoint=new URL(env.EXAM_REVIEW_URL);
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json',...(env.EXAM_REVIEW_KEY?{Authorization:'Bearer '+env.EXAM_REVIEW_KEY}:{})},
        signal:AbortSignal.timeout(15000),
        body:JSON.stringify({
          task:'Analyze essay according to CEFR criteria and provide critique.',
          model:env.EXAM_REVIEW_MODEL||undefined,
          data:{
            question:String(question.part.title||'').slice(0,2000),
            answer,
            criteria:String(question.part.criteria||'').slice(0,3000),
            preliminaryScores:mapped.criteriaScores
          }
        })
      });
      if(response.ok){
        const text=await response.text();
        const value=JSON.parse(text);
        if(typeof value.explanation==='string'&&value.explanation.length<4000){
          result.feedback=`${analysis.feedback}\n\n**AI Co-pilot Analysis**:\n${value.explanation}`;
          result.provider=value.model||env.EXAM_REVIEW_PROVIDER;
        }
      }
    }catch{
      // Safe fallback to deterministic SLA analysis; no credentials or network errors exposed.
    }
  }

  return {
    ...result,
    revision:work.revision,
    cached:false
  };
}
