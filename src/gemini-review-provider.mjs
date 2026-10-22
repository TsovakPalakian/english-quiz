import {LanguageProviderError} from './language-providers.mjs';
import {QUIZ_REVIEW_INSTRUCTION_VERSION,REVIEW_DIMENSIONS,createIndependentQuizReviewer,IndependentReviewIssue} from './quiz-independent-review.mjs';
import {validateReviewContent} from './quiz-review-content.mjs';
import {validateGenerationUsage} from './quiz-generation-metadata.mjs';
import {languageProviderHTTP,validateTransportOptions} from './language-provider-http.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.includes(key));
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
function createGeminiReviewTransport({enabled=false,freeTierVerified=false,allowDataProcessing=false,model='',apiKey='',termsRevision=null,fetchImpl,timeoutMs=30000,maxTokens=4096}={}){
  validateTransportOptions({enabled,freeTierVerified,timeoutMs});
  if(typeof allowDataProcessing!=='boolean'||!Number.isSafeInteger(maxTokens)||maxTokens<512||maxTokens>8192||termsRevision!==null&&(typeof termsRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(termsRevision)))fail('invalid_configuration');
  if(model!==''&&!/^gemini-[a-z0-9][a-z0-9.-]{0,100}$/.test(model))fail('invalid_configuration');
  return {id:'gemini-quiz-review',provider:'google',model:model||'unconfigured',version:'generate-content-json-v1.'+(termsRevision||'unverified'),billing:freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'review',locales:['en-US','en-GB'],modes:['text']}],
    async invoke(request,{signal}={}){
      if(!enabled)fail('provider_disabled');
      if(!allowDataProcessing||!model||!termsRevision||typeof apiKey!=='string'||!apiKey.trim()||/[\r\n]/.test(apiKey))fail('provider_not_configured');
      if(!exact(request,['instructionVersion','instruction','checked','dimensions','maxOutputChars'])||request.instructionVersion!==QUIZ_REVIEW_INSTRUCTION_VERSION||typeof request.instruction!=='string'||!request.instruction.trim()||request.instruction.length>5000||JSON.stringify(request.dimensions)!==JSON.stringify(REVIEW_DIMENSIONS)||!Number.isSafeInteger(request.maxOutputChars)||request.maxOutputChars<1||request.maxOutputChars>50000)fail('invalid_request');
      const checked=request.checked;
      if(!exact(checked,['type','meaning','content','revision','level','fingerprint'])||!Number.isSafeInteger(checked.revision)||checked.revision<1||!/^[a-f0-9]{64}$/.test(checked.fingerprint||'')||![null,'A1','A2','B1','B2','C1','C2'].includes(checked.level)||!exact(checked.meaning,['en','translation','definition','part_of_speech'])||!['en','translation','definition','part_of_speech'].every(key=>typeof checked.meaning[key]==='string'&&checked.meaning[key].trim()&&checked.meaning[key].length<=2000))fail('invalid_request');
      try{validateReviewContent(checked.type,checked.content);}catch{fail('invalid_request');}
      const finding=object({dimension:{type:'string',enum:REVIEW_DIMENSIONS},severity:{type:'string',enum:['warning','error']},itemIndex:{type:['integer','null'],minimum:0},message:{type:'string'},suggestion:{type:'string'}});
      const schema=object({fingerprint:{type:'string',enum:[checked.fingerprint]},revision:{type:'integer',enum:[checked.revision]},status:{type:'string',enum:['reviewed','refused']},dimensions:object(Object.fromEntries(REVIEW_DIMENSIONS.map(key=>[key,{type:'string',enum:['pass','issue','not_assessed']}]))),findings:{type:'array',maxItems:100,items:finding}});
      const payload={systemInstruction:{parts:[{text:request.instruction}]},contents:[{role:'user',parts:[{text:JSON.stringify({checked,dimensions:request.dimensions})}]}],generationConfig:{temperature:0,maxOutputTokens:maxTokens,responseFormat:{text:{mimeType:'application/json',schema}}}};
      if(JSON.stringify(payload).length>120000)fail('invalid_request');
      const data=await languageProviderHTTP(fetchImpl,'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload)},{signal,timeoutMs,maxBytes:150000});
      const candidate=data?.candidates?.[0];
      if(data?.promptFeedback?.blockReason||!candidate||candidate.finishReason!=='STOP'||!Array.isArray(candidate.content?.parts))fail('review_refused');
      const parts=candidate.content.parts.filter(part=>!part.thought);
      if(!parts.length||parts.some(part=>typeof part.text!=='string'||Object.keys(part).some(key=>!['text','thoughtSignature','thought'].includes(key))))fail('invalid_provider_result');
      const text=parts.map(part=>part.text).join('');if(!text.trim()||text.length>request.maxOutputChars)fail('invalid_provider_result');
      try{JSON.parse(text);}catch{fail('invalid_provider_result');}
      const usage={},map={promptTokenCount:'prompt_tokens',candidatesTokenCount:'completion_tokens',totalTokenCount:'total_tokens'};
      for(const [key,target] of Object.entries(map))if(data.usageMetadata?.[key]!==undefined)usage[target]=data.usageMetadata[key];
      const reasoning=data.usageMetadata?.thoughtsTokenCount;
      if(reasoning!==undefined){if(!Number.isSafeInteger(reasoning)||reasoning<0||!Number.isSafeInteger(usage.completion_tokens))fail('invalid_provider_result');usage.completion_tokens+=reasoning;}
      try{return {text,usage:validateGenerationUsage(usage)};}catch{fail('invalid_provider_result');}
    },
    validate(value){if(!exact(value,['text','usage'])||typeof value.text!=='string'||!value.text.trim()||value.text.length>50000)fail('invalid_provider_result');try{return {text:value.text,usage:validateGenerationUsage(value.usage)};}catch{fail('invalid_provider_result');}},
  };
}
// Match the saved review/pipeline contract: input snapshot -> validated advisory result.
export function createGeminiReviewAdapter(options={}){
  const transport=createGeminiReviewTransport(options),enabled=options.enabled===true;
  const reviewer=createIndependentQuizReviewer({enabled:true,source:{provider:transport.provider,model:transport.model,version:transport.version},timeoutMs:options.timeoutMs??30000,complete:async(request,settings)=>{
    try{return await transport.invoke(request,settings);}catch(error){
      const code=({rate_limited:'quota_exceeded',provider_not_configured:'review_not_configured',provider_disabled:'review_not_configured',invalid_provider_result:'invalid_review_response'})[error.code]||error.code;
      if(['review_refused','quota_exceeded','review_not_configured','invalid_review_response','cancelled','timeout'].includes(code))throw new IndependentReviewIssue(code);
      throw error;
    }
  }});
  return {...transport,
    async invoke(input,{signal}={}){
      if(!enabled)fail('provider_disabled');
      if(!exact(input,['type','meaning','content','revision','level']))fail('invalid_request');
      try{return {result:await reviewer({...input,signal})};}
      catch(error){if(error instanceof IndependentReviewIssue)fail(error.code);throw error;}
    },
    validate(value){
      const result=value?.result;
      if(!exact(value,['result'])||!result||result.requiresTeacherReview!==true||result.instructionVersion!==QUIZ_REVIEW_INSTRUCTION_VERSION||!['checked','needs_attention','incomplete'].includes(result.status)||result.source?.provider!==transport.provider||result.source?.model!==transport.model||result.source?.version!==transport.version)fail('invalid_provider_result');
      return structuredClone(value);
    },
  };
}
