// Temporary fence around the exact deployed legacy Worker, not a Turso switch.
const paused=()=>Response.json({error:'Учебные изменения временно приостановлены для переноса. Сохранение не выполнено.'},
  {status:503,headers:{'Cache-Control':'no-store','X-Education-Writes':'frozen'}});
export function frozenEnvironment(env){
  const blocked=()=>{throw new Error('Education writes frozen for migration.');};
  const media=env.MEDIA&&new Proxy(env.MEDIA,{get(target,key){
    if(['put','delete'].includes(key))return (path,...args)=>{
      // Login throttling and logout revocations remain functional. All content,
      // directory and account mutation requests are fenced during this window.
      if(!/^(login-fail\/|revoked-sid\/)/.test(path))return blocked();
      return target[key](path,...args);
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const db=env.DB&&new Proxy(env.DB,{get(target,key){
    if(key==='prepare')return sql=>{
      if(!/^\s*SELECT\b/i.test(sql)||/;|--|\/\*/.test(sql))return blocked();
      return target.prepare(sql);
    };
    if(['exec','batch'].includes(key))return blocked;
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return {...env,MEDIA:media,DB:db};
}
export function migrationFreeze(legacy){return {async fetch(request,env,ctx){
  const url=new URL(request.url),method=request.method;
  const path=url.pathname.replace(/\/+$/,'')||'/';
  const account=(method==='POST'&&['/api/register','/api/login','/api/logout','/api/me/account','/api/me/account/cancel','/api/me/password','/api/me/revoke'].includes(path))
    ||method==='POST'&&/^\/api\/admin\/(users\/[a-f0-9]{16,64}\/(profile|hidden|active|role)|(registrations|changes)\/[a-f0-9]{16,64}\/(approve|reject))$/.test(path)
    ||method==='DELETE'&&/^\/api\/admin\/users\/[a-f0-9]{16,64}$/.test(path);
  if(!['GET','HEAD','OPTIONS'].includes(method)&&!account)return paused();
  // Account operations keep their original handler/storage/permissions. Login
  // alone uses the content fence to prevent copyStateOnce background migration.
  const response=await legacy.fetch(request,account&&path!=='/api/login'?env:frozenEnvironment(env),ctx);
  const headers=new Headers(response.headers);headers.set('X-Education-Writes','frozen');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};}
