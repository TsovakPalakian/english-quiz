// Deliberately imperfect, deterministic fixtures. No AI, network or paid provider.
import {GenerationIssue} from '../src/quiz-generation.mjs';
export async function localQuizGenerator({type,meaning,attempt}){
  const word=meaning.en,translation=meaning.translation,definition=meaning.definition;
  const sentence=word==='bank'?'She opened an account at the bank.':'A fine drizzle started falling.';
  if(type==='Gap'&&attempt===1)throw new GenerationIssue('temporary_failure');
  if(type==='Listen')throw new GenerationIssue('audio_unavailable',false);
  let item;
  if(type==='Flip')item={front:word,back:translation};
  else if(type==='Type')item={prompt:translation,answer:word};
  else if(type==='Gap')item={shown:sentence.replace(word,'____'),answer:word,hint:translation};
  else if(type==='Choice')item={prompt:word,options:[translation,translation],answer:0}; // Exercises validation/retry/review.
  else if(type==='Build')item={parts:sentence.split(' ').reverse().join(' '),answer:sentence};
  else if(type==='True / false')item={prompt:word+' means '+translation+'.',answer:'true'};
  else if(type==='Tap')item={text:sentence,answer:word};
  else if(type==='Reverse')item={front:translation,back:word,options:[word,word==='bank'?'shop':'storm'],answer:0};
  else if(['Spell','Letters','Hangman'].includes(type))item={word,hint:translation};
  else if(type==='Definition')item={prompt:definition,word,options:[word,word==='bank'?'shop':'storm'],answer:0};
  else throw new GenerationIssue('attempt_limit',false);
  return {explanation:'Local test draft for this meaning: '+definition,items:[item]};
}
