import {neon} from '@neondatabase/serverless';
import {StudyError} from './turso-study.mjs';

export function neonConnection(connection){
  let url;try{url=new URL(connection);}catch{throw new StudyError(503,'Neon connection is not configured.');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname)||url.port&&url.port!=='5432'||!url.username||!url.password||!/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)||url.hash||!['require','verify-full'].includes(url.searchParams.get('sslmode')))throw new StudyError(503,'Neon connection configuration is invalid.');
  return url.href;
}
export function neonClient(env){
  return neon(neonConnection(env.NEON_DATABASE_URL),{fetchOptions:{redirect:'manual',signal:AbortSignal.timeout(20_000)}});
}
