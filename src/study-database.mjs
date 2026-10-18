import {StudyError} from './learning-study.mjs';
import {bindChatEncryption} from './chat-encryption.mjs';
import {D1StudyClient} from './d1-study.mjs';

// Server-only request context; headers and request JSON cannot supply this key.
export const STUDY_DATABASE=Symbol('request-study-database');
const noContext=async()=>{throw new StudyError(503,'Database access requires a selected request context.');};
export const STATIC_STUDY_DATABASE=Object.freeze({read:noContext,readMany:noContext,atomic:noContext});

export function studyClient(env){
  if(env[STUDY_DATABASE]===STATIC_STUDY_DATABASE)return STATIC_STUDY_DATABASE;
  if(env.DB_PROVIDER&&env.DB_PROVIDER!=='d1')throw new StudyError(503,'Invalid study database provider. No fallback was used.');
  if(env[STUDY_DATABASE])return bindChatEncryption(env[STUDY_DATABASE],env);
  return bindChatEncryption(new D1StudyClient(env.STUDY_DB),env);
}
