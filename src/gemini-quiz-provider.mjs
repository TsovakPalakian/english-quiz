// Server-only, opt-in transport. Construction never calls the provider.
import {LanguageProviderError} from './language-providers.mjs';
import {buildQuizModelInput} from './workers-ai-quiz-provider.mjs';
import {validateGenerationUsage} from './quiz-generation-metadata.mjs';
import {languageProviderHTTP,validateTransportOptions,transportConfigurationVersion} from './language-provider-http.mjs';
export const GEMINI_QUIZ_MODEL='gemini-3.5-flash-lite';
export const GEMINI_DISPATCH_LIMITS=Object.freeze({minuteRequests:10,dayRequests:400});
const fail=code=>{throw new LanguageProviderError(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function createGeminiQuizAdapter({enabled=false,freeTierVerified=false,allowDataProcessing=false,model=GEMINI_QUIZ_MODEL,apiKey='',termsRevision=null,fetchImpl,timeoutMs=30000,maxTokens=4096,configurationRevision=null}={}){
  validateTransportOptions({enabled,freeTierVerified,timeoutMs});
  if(typeof allowDataProcessing!=='boolean'||typeof model!=='string'||!/^gemini-[a-z0-9][a-z0-9.-]{0,100}$/.test(model)||!Number.isSafeInteger(maxTokens)||maxTokens<512||maxTokens>8192||termsRevision!==null&&(typeof termsRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(termsRevision)))fail('invalid_configuration');
  return {
    id:'gemini-quiz',provider:'google',model,version:'generate-content-json-v2.'+(termsRevision||'unverified')+transportConfigurationVersion(configurationRevision),billing:freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'generation',locales:['en-US','en-GB'],modes:['text']}],
    async invoke(request,{signal}={}){
      if(!enabled)fail('provider_disabled');
      if(!allowDataProcessing||!termsRevision||typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey))fail('provider_not_configured');
      if(signal?.aborted)fail('cancelled');
      const input=buildQuizModelInput(request,maxTokens);
      const payload={systemInstruction:{parts:[{text:input.messages[0].content}]},contents:[{role:'user',parts:[{text:input.messages[1].content}]}],generationConfig:{temperature:0.2,maxOutputTokens:maxTokens,responseFormat:{text:{mimeType:'APPLICATION_JSON',schema:input.response_format.json_schema}}}};
      const encoded=JSON.stringify(payload);
      if(new TextEncoder().encode(encoded).length>12000)fail('input_budget_exceeded');
      const data=await languageProviderHTTP(fetchImpl,'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:encoded},{signal,timeoutMs,maxBytes:150000});
      let usage;
      try{
        const counts={},map={promptTokenCount:'prompt_tokens',candidatesTokenCount:'completion_tokens',totalTokenCount:'total_tokens'};
        for(const [key,target] of Object.entries(map))if(data?.usageMetadata?.[key]!==undefined)counts[target]=data.usageMetadata[key];
        const reasoning=data?.usageMetadata?.thoughtsTokenCount;
        if(reasoning!==undefined){if(!Number.isSafeInteger(reasoning)||reasoning<0||!Number.isSafeInteger(counts.completion_tokens))fail('invalid_provider_result');counts.completion_tokens+=reasoning;}
        usage=validateGenerationUsage(counts);
      }catch{fail('invalid_provider_result');}
      try{
        const candidate=data?.candidates?.[0];
        if(data?.promptFeedback?.blockReason||data?.candidates?.length!==1||candidate?.finishReason!=='STOP'||!Array.isArray(candidate.content?.parts))fail('invalid_provider_result');
        const parts=candidate.content.parts.filter(part=>part?.thought!==true);
        if(!parts.length||parts.some(part=>!object(part)||typeof part.text!=='string'||Object.keys(part).some(key=>!['text','thought','thoughtSignature'].includes(key))))fail('invalid_provider_result');
        const text=parts.map(part=>part.text).join('');
        if(!text.trim()||text.length>request.maxOutputChars||!object(JSON.parse(text)))fail('invalid_provider_result');
        return {text,usage};
      }catch{
        const error=new LanguageProviderError('invalid_provider_result');error.usage=structuredClone(usage);throw error;
      }
    },
    validate(value){
      if(!object(value)||Object.keys(value).some(key=>!['text','usage'].includes(key))||typeof value.text!=='string'||!value.text.trim()||value.text.length>50000)fail('invalid_provider_result');
      try{return {text:value.text,usage:validateGenerationUsage(value.usage)};}catch{fail('invalid_provider_result');}
    },
  };
}
