import {LanguageProviderError} from './language-providers.mjs';
import {validateSpeechOutput} from './speech-assessment.mjs';
import {chatFileMime} from './chat-attachments.mjs';
import {languageProviderHTTP,validateTransportOptions,transportConfigurationVersion} from './language-provider-http.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
export const AZURE_REFERENCE_VOICES=Object.freeze([{id:'en-US-JennyNeural',locale:'en-US'},{id:'en-GB-SoniaNeural',locale:'en-GB'}].map(Object.freeze));
const xml=value=>value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function settings(options){
  const {enabled=false,freeTierVerified=false,resourceName='',region='',apiKey='',fetchImpl,timeoutMs=30000,termsRevision=null}=options;
  validateTransportOptions({enabled,freeTierVerified,timeoutMs});
  if(termsRevision!==null&&(typeof termsRevision!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(termsRevision)))fail('invalid_configuration');
  if(typeof region!=='string'||region!==''&&!/^[a-z][a-z0-9]{1,31}$/.test(region))fail('invalid_configuration');
  return {enabled,freeTierVerified,resourceName,region,apiKey,fetchImpl,timeoutMs,termsRevision,configurationVersion:transportConfigurationVersion(options.configurationRevision)+(region?'.regional-'+region+'-v2':'')};
}
function gate(config,kind='stt'){
  if(!config.enabled)fail('provider_disabled');
  if(!/^[a-z][a-z0-9-]{1,62}$/.test(config.resourceName)||typeof config.apiKey!=='string'||!config.apiKey.trim()||/[\r\n]/.test(config.apiKey)||!config.termsRevision)fail('provider_not_configured');
  return config.region?'https://'+config.region+'.'+kind+'.speech.microsoft.com':'https://'+config.resourceName+'.cognitiveservices.azure.com';
}
// The short-audio REST API accepts PCM16 mono 16 kHz, not arbitrary browser codecs.
export function azurePcmDuration(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<44||bytes.length>1000000||chatFileMime(bytes,'audio/wav')!=='audio/wav')fail('unsupported_audio_format');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),name=at=>String.fromCharCode(...bytes.subarray(at,at+4));
  if(view.getUint32(4,true)+8!==bytes.length)fail('unsupported_audio_format');
  let at=12,format=false,length=null;
  while(at+8<=bytes.length){const tag=name(at),size=view.getUint32(at+4,true),start=at+8;if(size>bytes.length-start)fail('unsupported_audio_format');
    if(tag==='fmt '){if(format||size<16||view.getUint16(start,true)!==1||view.getUint16(start+2,true)!==1||view.getUint32(start+4,true)!==16000||view.getUint32(start+8,true)!==32000||view.getUint16(start+12,true)!==2||view.getUint16(start+14,true)!==16)fail('unsupported_audio_format');format=true;}
    if(tag==='data'){if(length!==null||!size||size%2)fail('unsupported_audio_format');length=size;}
    at=start+size+(size%2);
  }
  if(at!==bytes.length||!format||length===null||length/32000>30)fail('unsupported_audio_format');return length/32000;
}
function score(value){if(value===undefined||value===null)return null;if(!Number.isFinite(value)||value<0||value>100)fail('invalid_provider_result');return value;}
export function createAzurePronunciationAdapter(options={}){
  const config=settings(options);
  return {id:'azure-pronunciation',provider:'microsoft-azure',model:'speech-pronunciation-scripted',version:'rest-hundredmark-v1.'+(config.termsRevision||'unverified')+config.configurationVersion,billing:config.freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'pronunciation',locales:['en-US','en-GB'],modes:['scripted']}],
    async invoke(input,{signal}={}){
      const host=gate(config);
      if(!input||Object.keys(input).some(key=>!['bytes','mime','mode','reference','locale'].includes(key))||input.mime!=='audio/wav'||input.mode!=='scripted'||!['en-US','en-GB'].includes(input.locale)||typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>2000)fail('invalid_request');
      azurePcmDuration(input.bytes);
      const params={ReferenceText:input.reference,GradingSystem:'HundredMark',Granularity:'FullText',Dimension:'Comprehensive',EnableMiscue:false,EnableProsodyAssessment:false};
      const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(params))));
      const data=await languageProviderHTTP(config.fetchImpl,host+(config.region?'':'/stt')+'/speech/recognition/conversation/cognitiveservices/v1?language='+input.locale+'&format=detailed',
        {method:'POST',headers:{'Ocp-Apim-Subscription-Key':config.apiKey,'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000',Accept:'application/json','Pronunciation-Assessment':encoded},body:input.bytes},{signal,timeoutMs:config.timeoutMs,maxBytes:150000});
      const quality={InitialSilenceTimeout:'no_speech',BabbleTimeout:'noise',NoMatch:'no_speech'}[data?.RecognitionStatus];
      if(quality)return validateSpeechOutput({quality,transcript:null,metrics:{accuracy:null,fluency:null,prosody:null},findings:[]},'pronunciation');
      if(data?.RecognitionStatus!=='Success'||!Array.isArray(data.NBest)||!data.NBest.length)fail('invalid_provider_result');
      const best=data.NBest[0],metrics=best.PronunciationAssessment||best;
      // Full-text scores do not establish word/phoneme confidence; never invent findings.
      return validateSpeechOutput({quality:'ok',transcript:best.Display||data.DisplayText,metrics:{accuracy:score(metrics.AccuracyScore),fluency:score(metrics.FluencyScore),prosody:null},findings:[]},'pronunciation');
    },validate:value=>validateSpeechOutput(value,'pronunciation'),
  };
}
export function createAzureTTSAdapter(options={}){
  const config=settings(options),rights=options.reuseConditions;
  if(rights!==undefined&&(typeof rights!=='string'||!rights.trim()||rights.length>500))fail('invalid_configuration');
  return {id:'azure-tts',provider:'microsoft-azure',model:'speech-neural-standard',version:'pcm16-v1.'+(config.termsRevision||'unverified')+config.configurationVersion,billing:config.freeTierVerified?'free-tier':'unknown',
    capabilities:[{task:'tts',locales:['en-US','en-GB'],modes:['text']}],
    async invoke(input,{source,signal}={}){
      const host=gate(config,'tts');if(!rights)fail('provider_not_configured');
      const voice=AZURE_REFERENCE_VOICES.find(row=>row.id===input?.voice);
      if(!input||Object.keys(input).some(key=>!['word','meaning','voice'].includes(key))||typeof input.word!=='string'||!input.word.trim()||input.word.length>200||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.word)||!voice||source?.locale&&source.locale!==voice.locale)fail('invalid_request');
      const ssml='<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="'+voice.locale+'"><voice name="'+voice.id+'">'+xml(input.word)+'</voice></speak>';
      const bytes=await languageProviderHTTP(config.fetchImpl,host+'/tts/cognitiveservices/v1',{method:'POST',headers:{'Ocp-Apim-Subscription-Key':config.apiKey,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-16khz-16bit-mono-pcm','User-Agent':'Lumiscia'},body:ssml},{signal,timeoutMs:config.timeoutMs,mime:'audio/wav',mimeAliases:['audio/x-wav','audio/wave'],maxBytes:1000000});
      azurePcmDuration(bytes);return {bytes,mime:'audio/wav',voice:voice.id,rights};
    },
    validate(value){if(!value||Object.keys(value).some(key=>!['bytes','mime','voice','rights'].includes(key))||value.mime!=='audio/wav'||!AZURE_REFERENCE_VOICES.some(row=>row.id===value.voice)||value.rights!==rights)fail('invalid_provider_result');azurePcmDuration(value.bytes);return {...value,bytes:value.bytes.slice()};},
  };
}
