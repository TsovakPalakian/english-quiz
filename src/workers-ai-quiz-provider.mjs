// Opt-in REST transport. No implicit fetch, environment secrets or production wiring.
import {LanguageProviderError} from './language-providers.mjs';
import {createModelQuizGenerator,MODEL_QUIZ_INSTRUCTION_VERSION} from './quiz-generation-model.mjs';
import {GenerationIssue} from './quiz-generation.mjs';
import {validateGenerationMetadata} from './quiz-generation-metadata.mjs';

export const WORKERS_QUIZ_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const itemFields={Flip:['front','back'],Choice:['prompt','options','answer'],Type:['prompt','answer'],Gap:['shown','answer','hint'],Build:['parts','answer'],'True / false':['prompt','answer'],Tap:['text','answer'],Reverse:['front','back','options','answer'],Spell:['word','hint'],Letters:['word','hint'],Definition:['prompt','word','options','answer'],Hangman:['word','hint']};
const fail=code=>{throw new LanguageProviderError(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const string=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4000;

function buildInput(request,maxTokens){
  if(!keys(request,['instruction','type','meaning','itemFields','maxItems','maxOutputChars'])||
    !Object.hasOwn(itemFields,request.type)||!string(request.instruction)||
    !keys(request.meaning,['en','translation','definition','part_of_speech'])||
    !['en','translation','definition','part_of_speech'].every(key=>string(request.meaning[key]))||
    !Number.isSafeInteger(request.maxItems)||request.maxItems<1||request.maxItems>5||
    !Number.isSafeInteger(request.maxOutputChars)||request.maxOutputChars<1||request.maxOutputChars>50000)fail('invalid_request');
  const fields=itemFields[request.type];
  if(JSON.stringify(request.itemFields)!==JSON.stringify(fields))fail('invalid_request');
  const itemProperties=Object.fromEntries(fields.map(key=>[key,key==='options'?{type:'array',minItems:2,maxItems:12,items:{type:'string',maxLength:1000}}:
    key==='answer'&&fields.includes('options')?{type:'integer',minimum:0,maximum:11}:{type:'string',minLength:1,maxLength:2000}]));
  const schema={type:'object',additionalProperties:false,required:['type','meaning','content'],properties:{
    type:{type:'string',enum:[request.type]},
    meaning:{type:'object',additionalProperties:false,required:Object.keys(request.meaning),properties:Object.fromEntries(Object.entries(request.meaning).map(([key,value])=>[key,{type:'string',enum:[value]}]))},
    content:{type:'object',additionalProperties:false,required:['explanation','items'],properties:{
      explanation:{type:'string',minLength:1,maxLength:4000},items:{type:'array',minItems:1,maxItems:request.maxItems,items:{type:'object',additionalProperties:false,required:fields,properties:itemProperties}},
    }},
  }};
  return {messages:[{role:'system',content:request.instruction},{role:'user',content:JSON.stringify({type:request.type,meaning:request.meaning,itemFields:fields,maxItems:request.maxItems,maxOutputChars:request.maxOutputChars})}],
    stream:false,max_tokens:maxTokens,temperature:0.2,response_format:{type:'json_schema',json_schema:schema}};
}

async function limitedJSON(response,limit){
  const length=response.headers.get('content-length');
  if(length!==null&&Number(length)>limit){await response.body?.cancel();fail('invalid_provider_result');}
  if(!response.body)fail('invalid_provider_result');
  const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>limit){await reader.cancel();fail('invalid_provider_result');}text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();try{return JSON.parse(text);}catch{fail('invalid_provider_result');}
  }finally{reader.releaseLock();}
}

export function createWorkersAIQuizAdapter({enabled=false,freeTierVerified=false,accountId='',apiToken='',fetchImpl,timeoutMs=15000,maxTokens=1024}={}){
  if(typeof enabled!=='boolean'||typeof freeTierVerified!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isSafeInteger(maxTokens)||maxTokens<128||maxTokens>2048)fail('invalid_configuration');
  return {
    id:'workers-ai-quiz',provider:'cloudflare',model:WORKERS_QUIZ_MODEL,version:'rest-v1-json-v1',billing:freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'generation',locales:['en-US','en-GB'],modes:['text']}],
    async invoke(request,{signal}={}){
      if(!enabled)fail('provider_disabled');
      if(typeof fetchImpl!=='function'||!/^[a-f0-9]{32}$/.test(accountId)||typeof apiToken!=='string'||!apiToken.trim()||/[\r\n]/.test(apiToken))fail('provider_not_configured');
      if(signal?.aborted)fail('cancelled');
      const input=buildInput(request,maxTokens),controller=new AbortController();let abort,timer;
      const stopped=new Promise((_,reject)=>{
        abort=()=>{controller.abort();reject(new LanguageProviderError('cancelled'));};signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>{controller.abort();reject(new LanguageProviderError('timeout'));},timeoutMs);
      });
      try{
        return await Promise.race([stopped,(async()=>{
          const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WORKERS_QUIZ_MODEL}`,{
            method:'POST',redirect:'error',credentials:'omit',signal:controller.signal,
            headers:{authorization:`Bearer ${apiToken}`,'content-type':'application/json'},body:JSON.stringify(input),
          });
          if(response.status!==200){
            await response.body?.cancel();
            fail(response.status===429?'rate_limited':[401,403].includes(response.status)?'provider_access_denied':response.status>=500?'provider_unavailable':'provider_request_rejected');
          }
          if(!response.headers.get('content-type')?.toLowerCase().includes('application/json')){await response.body?.cancel();fail('invalid_provider_result');}
          const envelope=await limitedJSON(response,100000);
          if(controller.signal.aborted)fail('cancelled');
          if(!object(envelope)||envelope.success!==true||!object(envelope.result)||envelope.errors?.length)fail('invalid_provider_result');
          const raw=envelope.result.response;
          const text=typeof raw==='string'?raw:object(raw)?JSON.stringify(raw):null;
          if(!text||text.length>request.maxOutputChars)fail('invalid_provider_result');
          let parsed;try{parsed=JSON.parse(text);}catch{fail('invalid_provider_result');}
          if(!object(parsed))fail('invalid_provider_result');
          const usage={};
          for(const key of ['prompt_tokens','completion_tokens','total_tokens']){
            const value=envelope.result.usage?.[key];if(value!==undefined){if(!Number.isSafeInteger(value)||value<0)fail('invalid_provider_result');usage[key]=value;}
          }
          return {text,usage};
        })()]);
      }catch(error){if(error instanceof LanguageProviderError)throw error;fail('provider_unavailable');}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    },
    validate(result){
      if(!keys(result,['text','usage'])||typeof result.text!=='string'||!object(result.usage))fail('invalid_provider_result');
      return structuredClone(result);
    },
  };
}

export function createRoutedQuizGenerator({providers,timeoutMs=20000,includeMetadata=false}={}){
  if(typeof providers?.execute!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000||typeof includeMetadata!=='boolean')throw new Error('A language-provider registry and valid options are required.');
  return async input=>{
    let generation;
    const generate=createModelQuizGenerator({enabled:true,complete:async(request,{signal})=>{
      try{
        const result=await providers.execute('generation',request,{signal,timeoutMs});
        if(includeMetadata)generation=validateGenerationMetadata({source:result.source,usage:result.data.usage,instructionVersion:MODEL_QUIZ_INSTRUCTION_VERSION,generatedAt:new Date().toISOString(),contentRevision:1});
        return result.data.text;
      }catch(error){
        if(['rate_limited','quota_or_access_denied'].includes(error.code))throw new GenerationIssue('quota_exceeded',false);
        if(['provider_disabled','provider_not_configured','provider_access_denied','provider_request_rejected','invalid_request'].includes(error.code))throw new GenerationIssue('provider_not_configured',false);
        if(error.code==='invalid_provider_result'||error.status===400)throw new GenerationIssue('invalid_model_response');
        if(error.code==='timeout')throw new GenerationIssue('timeout');
        if(error.code==='cancelled')throw new GenerationIssue('cancelled',false);
        throw new GenerationIssue('temporary_failure');
      }
    }});
    const content=await generate(input);
    return includeMetadata?{content,generation}:content;
  };
}
