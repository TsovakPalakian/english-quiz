import {neonAccountEnvironment} from './neon-account-database.mjs';
import {NeonStudyClient} from './neon-study.mjs';
import {neonConnection} from './neon-connection.mjs';
import {STUDY_DATABASE} from './study-database.mjs';
import {DATABASE_CONTROL} from './database-selection.mjs';
import {databaseMedia} from './database-media.mjs';
import {StudyError} from './turso-study.mjs';

// Composition is explicit: neither the learning data nor auth may fall back to D1/Turso.
export function neonApplicationEnvironment(env,{study,auth}={}){
  if(env.DATABASE_SELECTION?.provider!=='neon'||env.DB_PROVIDER!=='neon')throw new StudyError(503,'Neon requires a matching site-wide database selection.');
  if(!study||!auth)neonConnection(env.NEON_DATABASE_URL);
  const accounts=neonAccountEnvironment(env,auth),content=databaseMedia(env.CONTENT_MEDIA,'study/neon/');
  return {...accounts,CONTENT_MEDIA:content,STAGE_MEDIA:content,[DATABASE_CONTROL]:env[DATABASE_CONTROL]||env.CONTENT_MEDIA,[STUDY_DATABASE]:study||new NeonStudyClient(env)};
}
