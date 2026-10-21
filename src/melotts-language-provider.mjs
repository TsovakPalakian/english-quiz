// Opt-in binary Workers AI transport; no global fetch, credentials or implicit fallback.
import {LanguageProviderError} from './language-providers.mjs';
import {boundedProviderBytes} from './bounded-provider-body.mjs';
import {chatFileMime} from './chat-attachments.mjs';
export const MELOTTS_MODEL='@cf/myshell-ai/melotts';
export const MELOTTS_VOICE=Object.freeze({id:'melotts-en',locale:'en'});
const fail=code=>{throw new LanguageProviderError(code);};
export function createMeloTTSAdapter({enabled=false,freeTierVerified=false,run=null,reuseConditions=null,termsRevision=null}={}){
  if(typeof enabled!=='boolean'||typeof freeTierVerified!=='boolean'||run!==null&&typeof run!=='function'||
    reuseConditions!==null&&(typeof reuseConditions!=='string'||!reuseConditions.trim()||reuseConditions.length>500)||
    termsRevision!==null&&(typeof termsRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(termsRevision)))fail('invalid_configuration');
  return {
    id:'workers-ai-melotts',provider:'cloudflare',model:MELOTTS_MODEL,version:'binary-en-v1.'+(termsRevision||'unverified'),billing:freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'tts',locales:['en'],modes:['text']}],
    async invoke(input,{signal}={}){
      if(!enabled)fail('provider_disabled');if(!run||!reuseConditions||!termsRevision)fail('provider_not_configured');if(signal?.aborted)fail('cancelled');
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['word','meaning','voice'].includes(key))||
        typeof input.word!=='string'||!input.word.trim()||input.word.length>200||input.voice!==MELOTTS_VOICE.id)fail('invalid_request');
      // The server supplies a binding or REST wrapper that returns binary MP3, never a URL to fetch.
      let result=await run(MELOTTS_MODEL,{prompt:input.word,lang:'en'},{signal});
      if(result instanceof Response){
        if(result.status!==200){await result.body?.cancel();fail(result.status===429?'rate_limited':'provider_unavailable');}
        if(result.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='audio/mpeg'){await result.body?.cancel();fail('invalid_provider_result');}
        const length=result.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>10*1024*1024)){await result.body?.cancel();fail('invalid_provider_result');}
        result=result.body;
      }
      const bytes=await boundedProviderBytes(result,10*1024*1024,signal);
      if(chatFileMime(bytes,'audio/mpeg')!=='audio/mpeg')fail('invalid_provider_result');
      return {bytes,mime:'audio/mpeg',voice:MELOTTS_VOICE.id,rights:reuseConditions};
    },
    validate(result){
      if(!result||Object.keys(result).some(key=>!['bytes','mime','voice','rights'].includes(key))||!(result.bytes instanceof Uint8Array)||
        !result.bytes.length||result.bytes.length>10*1024*1024||result.mime!=='audio/mpeg'||result.voice!==MELOTTS_VOICE.id||result.rights!==reuseConditions||
        !reuseConditions||chatFileMime(result.bytes,result.mime)!==result.mime)fail('invalid_provider_result');
      return {...result,bytes:result.bytes.slice()};
    },
  };
}
