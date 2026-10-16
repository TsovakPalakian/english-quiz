import {TursoStudyClient,StudyError} from './turso-study.mjs';
import {bindChatEncryption} from './chat-encryption.mjs';

// Server-only request context; headers and request JSON cannot supply this key.
export const STUDY_DATABASE=Symbol('request-study-database');
const noContext=async()=>{throw new StudyError(503,'Database access requires a selected request context.');};
export const STATIC_STUDY_DATABASE=Object.freeze({read:noContext,readMany:noContext,atomic:noContext});

export function studyClient(env){
  if(env[STUDY_DATABASE]===STATIC_STUDY_DATABASE)return STATIC_STUDY_DATABASE;
  const provider=env.DATABASE_SELECTION?.provider||env.DB_PROVIDER||'turso';
  if(!['turso','neon'].includes(provider))throw new StudyError(503,'Invalid study database provider. No fallback was used.');
  if(env.DB_PROVIDER&&env.DB_PROVIDER!==provider)throw new StudyError(503,'Study database selection mismatch. No fallback was used.');
  if(env[STUDY_DATABASE])return bindChatEncryption(env[STUDY_DATABASE],env);
  if(provider!=='turso')throw new StudyError(503,'Neon learning-data adapter is not ready. No fallback was used.');
  return bindChatEncryption(new TursoStudyClient({endpoint:'https://'+new URL(env.TURSO_URL).hostname+'/v2/pipeline',token:env.TURSO_AUTH_TOKEN,mode:env.STORAGE_MODE||'test'}),env);
}
