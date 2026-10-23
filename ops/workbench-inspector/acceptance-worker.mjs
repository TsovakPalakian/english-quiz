// Operator-only remote preview. Never deploy this probe as a public Worker.
import {createFeedbackEmailTransport} from '../../src/quiz-feedback-delivery.mjs';
let emailAttempted=false;
export default {async fetch(request,env){
  if(request.method!=='POST')return new Response('Not found',{status:404});
  const path=new URL(request.url).pathname;
  if(path==='/inspect'||path==='/origin-inspect'){
    const bytes=new Uint8Array(44+3200),view=new DataView(bytes.buffer),text=new TextEncoder();
    bytes.set(text.encode('RIFF'));view.setUint32(4,bytes.length-8,true);bytes.set(text.encode('WAVEfmt '),8);
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
    view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
    bytes.set(text.encode('data'),36);view.setUint32(40,3200,true);
    if(path==='/origin-inspect'){
      try{
        const response=await fetch('https://inspector.92-5-115-171.sslip.io/inspect',{method:'POST',headers:{'Content-Type':'audio/wav',Authorization:request.headers.get('Authorization')||''},body:bytes,redirect:'manual'});
        return Response.json({status:response.status,contentType:response.headers.get('Content-Type'),bodyBytes:(await response.arrayBuffer()).byteLength});
      }catch{return Response.json({failed:true});}
    }
    return env.WORKBENCH_MEDIA_INSPECTOR.fetch('https://media-inspector.internal/inspect',{method:'POST',headers:{'Content-Type':'audio/wav'},body:bytes});
  }
  if(path==='/email'){
    if(emailAttempted)return new Response('Already attempted',{status:409});
    emailAttempted=true;
    const transport=createFeedbackEmailTransport({enabled:true,binding:env.WORKBENCH_EMAIL,recipientVerified:true,policyRevision:'operator-acceptance-20261023'});
    try{
      await transport.send(transport.prepare({id:crypto.randomUUID(),category:'bug',text:'Lumiscia infrastructure delivery check. Synthetic operator test; no user data or attachments.',attachments:[]}));
      return Response.json({accepted:true,delivered:false});
    }catch{return Response.json({accepted:false,delivered:false},{status:503});}
  }
  return new Response('Not found',{status:404});
}};
