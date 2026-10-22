import {LanguageProviderError} from './language-providers.mjs';
import {validateSpeechOutput} from './speech-assessment.mjs';
import {chatFileMime} from './chat-attachments.mjs';
import {languageProviderHTTP,validateTransportOptions} from './language-provider-http.mjs';
export const WHISPER_MODEL='@cf/openai/whisper';
const fail=code=>{throw new LanguageProviderError(code);};
export function createWorkersAIWhisperAdapter({enabled=false,freeTierVerified=false,accountId='',apiToken='',fetchImpl,timeoutMs=30000}={}){
  validateTransportOptions({enabled,freeTierVerified,timeoutMs});
  return {id:'workers-ai-whisper',provider:'cloudflare',model:WHISPER_MODEL,version:'binary-rest-stt-v1',billing:freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'stt',locales:['en-US','en-GB'],modes:['scripted','unscripted']}],
    async invoke(input,{signal}={}){
      if(!enabled)fail('provider_disabled');
      if(!/^[a-f0-9]{32}$/.test(accountId)||typeof apiToken!=='string'||!apiToken.trim()||/[\r\n]/.test(apiToken))fail('provider_not_configured');
      if(!input||Object.keys(input).some(key=>!['bytes','mime','mode','reference','locale'].includes(key))||!(input.bytes instanceof Uint8Array)||!input.bytes.length||input.bytes.length>10*1024*1024||!['audio/wav','audio/mpeg'].includes(input.mime)||chatFileMime(input.bytes,input.mime)!==input.mime||!['scripted','unscripted'].includes(input.mode)||!['en-US','en-GB'].includes(input.locale))fail('invalid_request');
      const result=await languageProviderHTTP(fetchImpl,`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${WHISPER_MODEL}`,{method:'POST',headers:{authorization:'Bearer '+apiToken,'content-type':'application/octet-stream'},body:input.bytes},{signal,timeoutMs,maxBytes:150000});
      if(result?.success!==true||result.errors?.length||!result.result||typeof result.result.text!=='string'||result.result.text.length>6000)fail('invalid_provider_result');
      const text=result.result.text.trim();
      return validateSpeechOutput({quality:text?'ok':'no_speech',transcript:text||null,metrics:{},findings:[]},'stt');
    },validate:value=>validateSpeechOutput(value,'stt'),
  };
}
