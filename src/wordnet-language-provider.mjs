// The importer owns the licensed dataset. This adapter never downloads or changes senses.
import {LanguageProviderError} from './language-providers.mjs';
import {validateDictionaryResult} from './quiz-language-materials.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const positions={n:'noun',v:'verb',a:'adjective',s:'adjective',r:'adverb'};
export function createWordNetAdapter({enabled=false,dataset=null}={}){
  if(typeof enabled!=='boolean')fail('invalid_configuration');
  if(dataset!==null&&(!object(dataset)||dataset.version!=='3.0'||!/^[a-f0-9]{64}$/.test(dataset.sha256)||
    !text(dataset.licenseNotice,20000)||!dataset.licenseNotice.includes('Princeton University')||typeof dataset.lookup!=='function'))fail('invalid_configuration');
  const snapshot=dataset===null?null:{version:dataset.version,sha256:dataset.sha256,lookup:dataset.lookup,licenseNotice:dataset.licenseNotice};
  return {
    id:'wordnet',provider:'princeton-wordnet',model:'wordnet-3.0',version:snapshot?'wn3-'+snapshot.sha256:'unconfigured',billing:'self-hosted',
    capabilities:[{task:'dictionary',locales:['en','en-US','en-GB'],modes:['text']}],
    async invoke(input,{signal}={}){
      if(!enabled)fail('provider_disabled');if(!snapshot)fail('provider_not_configured');if(signal?.aborted)fail('cancelled');
      if(!object(input)||Object.keys(input).some(key=>!['word','meaning'].includes(key))||!text(input.word,200))fail('invalid_request');
      // lookup returns bounded, normalized records from a separately verified WordNet import.
      const records=await snapshot.lookup(input.word,{signal,limit:8});if(signal?.aborted)fail('cancelled');
      if(!Array.isArray(records)||records.length>8)fail('invalid_provider_result');if(!records.length)fail('dictionary_not_found');
      const seen=new Set(),entries=records.map(record=>{
        if(!object(record)||Object.keys(record).some(key=>!['word','senseKey','pos','definition','examples','forms'].includes(key))||
          !Object.hasOwn(positions,record.pos)||!text(record.word,200)||record.word.toLowerCase()!==input.word.trim().toLowerCase()||
          !text(record.senseKey,200)||!/^[^\s%]+%[1-5]:\d{2}:\d{2}:[^:]*:[^:]*$/.test(record.senseKey)||
          Number(record.senseKey.split('%')[1][0])!==({n:1,v:2,a:3,r:4,s:5}[record.pos])||
          record.senseKey.split('%')[0].replaceAll('_',' ').toLowerCase()!==record.word.toLowerCase()||
          seen.has(record.senseKey)||!text(record.definition,4000)||!Array.isArray(record.examples)||record.examples.length>20||
          !record.examples.every(example=>text(example,4000))||!Array.isArray(record.forms)||record.forms.length>30)fail('invalid_provider_result');
        seen.add(record.senseKey);
        return {word:record.word,referenceId:record.senseKey,partOfSpeech:positions[record.pos],definition:record.definition,translation:null,ipa:null,
          forms:record.forms,examples:record.examples.map(en=>({en,translation:null})),
          source:{title:'Princeton WordNet 3.0: '+record.senseKey,url:'https://wordnet.princeton.edu/license-and-commercial-use',license:'WordNet 3.0 license; preserve Princeton copyright, license and disclaimer.'}};
      });
      return validateDictionaryResult({entries});
    },
    validate:validateDictionaryResult,
  };
}
