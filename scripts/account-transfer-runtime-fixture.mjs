// Local integration harness only; never deploy this entry point.
import chat,{ChatRoom,ChatInbox,ChatBridge} from './chat-runtime-fixture.mjs';
import {chatCall} from '../src/chat-durable.mjs';
import {accountTransferWorker} from '../src/account-transfer.mjs';
export {ChatRoom,ChatInbox,ChatBridge};
export default accountTransferWorker({async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/identity'){
    const binding=env[{room:'CHAT_ROOM',inbox:'CHAT_INBOX',bridge:'CHAT_BRIDGE'}[url.searchParams.get('kind')]];
    return Response.json({id:binding.idFromName(url.searchParams.get('name')).toString()});
  }
  if(url.pathname==='/bridge-fixture'){
    const actor={id:'alice',role:'USER'};
    if(request.method==='POST'){
      for(const action of ['reserve','activate'])await chatCall(env,'CHAT_BRIDGE','global','/signup-username',{action,login:'alice',reservationId:'fixture-signup',userId:'alice'});
      return Response.json(await chatCall(env,'CHAT_BRIDGE','global','/profile',{actor,phone:'+10000000000',birthday:'2000-01-01',phoneVisible:false,birthdayVisible:false}));
    }
    return Response.json(await chatCall(env,'CHAT_BRIDGE','global','/profile',{actor,read:true}));
  }
  return chat.fetch(request,env,ctx);
}});
