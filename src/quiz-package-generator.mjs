import {GenerationIssue} from './quiz-generation.mjs';
import {checkGeneratedQuality} from './quiz-generation-model.mjs';
import {validateReviewContent} from './quiz-review-content.mjs';
const fail=code=>{throw new GenerationIssue(code,false);};
const groupTypes=['Match','Memory','Select all','Odd one out'];
const normalized=text=>' '+text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,' ').trim()+' ';
export function createQuizPackageGenerator({generate}={}){
  if(typeof generate!=='function')throw Error('An explicit text generator is required.');
  return async input=>{
    const {type,meaning,preparation,signal}=input;if(signal?.aborted)fail('cancelled');
    if(!preparation||JSON.stringify(preparation.meaning)!==JSON.stringify(meaning))fail('context_required');
    const words=preparation.words.map(row=>row.meaning),target=words[0];let content;
    if(groupTypes.includes(type)){
      if(words.length<(['Match','Memory'].includes(type)?2:3))fail('context_required');
      if(type==='Match'||type==='Memory')content={explanation:words.map(row=>`${row.en}: ${row.translation}. ${row.definition}`).join('\n'),items:words.map(row=>({left:row.en,right:row.translation}))};
      else{
        const chosen=words.slice(0,-1),definitions=chosen.map(row=>`${row.translation} (${row.definition})`).join('; ');
        content={explanation:words.map(row=>`${row.en}: ${row.translation}. ${row.definition}`).join('\n'),items:[{prompt:`${type==='Select all'?'Select all words matching':'Choose the word NOT matching'} these meanings: ${definitions}`,options:words.map(row=>row.en),...(type==='Select all'?{answers:chosen.map((_,index)=>index)}:{answer:words.length-1})}]};
      }
    }else if(type==='Listen'){
      if(!preparation.audio)fail('audio_unavailable');if(words.length<2)fail('context_required');
      content={explanation:`The recording says ${target.en}: ${target.translation}. ${target.definition}`,items:[{prompt:'Listen and choose the translation.',word:target.en,options:words.map(row=>row.translation),answer:0,mediaId:preparation.audio.id}]};
    }else{
      const candidate=await generate({...input,evidence:preparation.dictionary?{definition:preparation.dictionary.definition,examples:preparation.dictionary.examples}:undefined});
      const value=candidate&&Object.hasOwn(candidate,'content')?candidate.content:candidate;
      checkGeneratedQuality(type,value,meaning);
      if(type==='Build'&&value.items.some(item=>!normalized(item.answer).includes(normalized(meaning.en))))throw new GenerationIssue('quality_check_failed');
      if(type==='True / false'&&value.items.some(item=>!normalized(item.prompt).includes(normalized(meaning.en))))throw new GenerationIssue('quality_check_failed');
      return candidate;
    }
    return validateReviewContent(type,content,{mediaQuizzes:type==='Listen'});
  };
}
