// Local integration harness only. This file is not a deployable entry point.
import {ChatRoom,ChatInbox,chatCall} from '../src/chat-durable.mjs';
import {parseChatPreviewHTML} from '../src/chat-previews.mjs';
export {ChatRoom,ChatInbox};
const users=[{id:'alice',name:'Alice',role:'USER'},{id:'bob',name:'Bob',role:'USER'}];
export default {async fetch(request,env){
  const url=new URL(request.url),actor=users.find(u=>u.id===url.searchParams.get('account'))||users[0];
  if(url.pathname==='/preview-fixture')return Response.json(await parseChatPreviewHTML('<title>Fallback</title><meta property="og:title" content="English lesson"><meta property="og:description" content="Useful practice"><meta property="og:image" content="https://i.ytimg.com/vi/example/default.jpg"><script>throw Error("Not executed")</script>',new URL('https://www.youtube.com/watch?v=example')));
  if(url.pathname==='/seed'){
    for(const user of users)await chatCall(env,'CHAT_INBOX',user.id,'/configure',{profile:user,contacts:users.filter(u=>u!==user),groups:[]});
    return Response.json(await chatCall(env,'CHAT_INBOX','alice','/command',{action:'open',body:{kind:'direct',accountId:'bob'}}));
  }
  if(url.pathname==='/socket')return env.CHAT_INBOX.get(env.CHAT_INBOX.idFromName(actor.id)).fetch(new Request('https://chat.internal/connect?after='+(url.searchParams.get('after')||0),{headers:{Upgrade:'websocket','X-Chat-Internal':env.CONTENT_SESSION_SECRET}}));
  if(url.pathname==='/snapshot')return Response.json(await chatCall(env,'CHAT_INBOX',actor.id,'/snapshot',{}));
  return Response.json(await chatCall(env,'CHAT_INBOX',actor.id,'/command',await request.json()));
}};
