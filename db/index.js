import {D1Adapter} from './d1.js';
import {DatabaseError} from './errors.js';
export {DatabaseError} from './errors.js';

export function createDatabase(env,options={}){
  if(env?.DB_PROVIDER==='d1')return new D1Adapter(env,options);
  throw new DatabaseError('DB_PROVIDER','DB_PROVIDER must be exactly d1.',{status:500});
}
export async function withDatabase(env,fn,options={}){
  if(typeof fn!=='function')throw new DatabaseError('DB_CALLBACK','withDatabase requires a request callback.',{status:500});
  const db=createDatabase(env,options);
  try{return await fn(db);}finally{await db.close();}
}
