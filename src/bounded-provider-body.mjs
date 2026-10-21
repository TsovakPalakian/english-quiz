import {LanguageProviderError} from './language-providers.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
// Bound binary responses before storing audio or encoding email attachments.
export async function boundedProviderBytes(body,limit,signal){
  if(!Number.isSafeInteger(limit)||limit<1)fail('invalid_configuration');
  if(signal?.aborted)fail('cancelled');
  if(body instanceof ArrayBuffer)body=new Uint8Array(body);
  if(body instanceof Uint8Array){if(!body.length||body.length>limit)fail('invalid_provider_result');return body.slice();}
  if(typeof body?.getReader!=='function')fail('invalid_provider_result');
  const reader=body.getReader(),chunks=[];let size=0;
  const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      const {done,value}=await reader.read();if(signal?.aborted)fail('cancelled');if(done)break;
      if(!(value instanceof Uint8Array)||value.length>limit-size||chunks.length>=16384){await reader.cancel();fail('invalid_provider_result');}
      size+=value.length;chunks.push(value.slice());
    }
    if(!size)fail('invalid_provider_result');const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
  }finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}
