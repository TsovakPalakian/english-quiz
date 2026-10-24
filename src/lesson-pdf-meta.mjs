// Server-only: one Gemini call over an uploaded lesson PDF → title + short description.
import {StudyError} from './learning-study.mjs';
import {languageProviderHTTP} from './language-provider-http.mjs';

export const LESSON_PDF_META_MAX_BYTES=25*1024*1024;
const TITLE_MAX=80;
const DESCRIPTION_MAX=240;
const schema=Object.freeze({
  type:'object',
  additionalProperties:false,
  required:['title','description'],
  properties:{
    title:{type:'string',minLength:1,maxLength:TITLE_MAX},
    description:{type:'string',minLength:1,maxLength:DESCRIPTION_MAX},
  },
});
const instruction='You read an English-lesson PDF for teachers. Reply with JSON only: title (concise lesson name, max '+TITLE_MAX+' characters) and description (very short learner-facing summary, max '+DESCRIPTION_MAX+' characters). Use English. Do not invent unrelated topics.';
const base64=bytes=>{let value='';for(let at=0;at<bytes.length;at+=24576)value+=btoa(String.fromCharCode(...bytes.subarray(at,at+24576)));return value;};
const text=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
const fail=(status,message)=>{throw new StudyError(status,message);};
const providerFail=code=>{
  const map={provider_disabled:503,provider_not_configured:503,cancelled:499,timeout:504,rate_limited:429,provider_access_denied:503,provider_unavailable:503,provider_request_rejected:502,invalid_provider_result:502,invalid_configuration:503,input_budget_exceeded:413};
  fail(map[code]||502,code==='rate_limited'?'Gemini rate limit. Try again shortly.':code==='timeout'?'Gemini timed out.':code==='input_budget_exceeded'?'This PDF is too large for analysis.':'Could not analyse this PDF.');
};

export function assertLessonPdfBytes(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length)fail(400,'PDF required.');
  if(bytes.length>LESSON_PDF_META_MAX_BYTES)fail(413,'PDF must be under 25 MB.');
  const head=String.fromCharCode(...bytes.subarray(0,8));
  if(!/^%PDF-(1\.[0-7]|2\.0)/.test(head))fail(415,'This file is not a PDF.');
  return bytes;
}

export function normalizeLessonPdfMeta(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(502,'Could not analyse this PDF.');
  const title=text(value.title).slice(0,TITLE_MAX);
  const description=text(value.description).slice(0,DESCRIPTION_MAX);
  if(!title||!description)fail(502,'Could not analyse this PDF.');
  return {title,description};
}

export async function parseLessonPdfMeta({bytes,apiKey='',model='',fetchImpl=globalThis.fetch,timeoutMs=45000,signal}={}){
  assertLessonPdfBytes(bytes);
  if(typeof model!=='string'||!/^gemini-[a-z0-9][a-z0-9.-]{0,100}$/.test(model))fail(503,'Gemini is not configured.');
  if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey))fail(503,'Gemini is not configured.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)fail(503,'Gemini is not configured.');
  if(typeof fetchImpl!=='function')fail(503,'Gemini is not configured.');
  if(signal?.aborted)fail(499,'Cancelled.');
  const payload={
    systemInstruction:{parts:[{text:instruction}]},
    contents:[{role:'user',parts:[
      {inlineData:{mimeType:'application/pdf',data:base64(bytes)}},
      {text:'Extract title and description for this lesson PDF.'},
    ]}],
    generationConfig:{temperature:0.2,maxOutputTokens:512,responseFormat:{text:{mimeType:'APPLICATION_JSON',schema}}},
  };
  let data;
  try{
    data=await languageProviderHTTP(fetchImpl,'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
      method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),
    },{signal,timeoutMs,maxBytes:100000});
  }catch(error){providerFail(error?.code||'provider_unavailable');}
  try{
    const candidate=data?.candidates?.[0];
    if(data?.promptFeedback?.blockReason||data?.candidates?.length!==1||candidate?.finishReason!=='STOP'||!Array.isArray(candidate.content?.parts))fail(502,'Could not analyse this PDF.');
    const parts=candidate.content.parts.filter(part=>part?.thought!==true);
    if(!parts.length||parts.some(part=>!part||typeof part!=='object'||typeof part.text!=='string'))fail(502,'Could not analyse this PDF.');
    return normalizeLessonPdfMeta(JSON.parse(parts.map(part=>part.text).join('')));
  }catch(error){
    if(error instanceof StudyError)throw error;
    fail(502,'Could not analyse this PDF.');
  }
}
