import {StudyError} from './learning-study.mjs';
export async function d1Readiness(env,actor){
  try{
    if(!env.STUDY_DB||!env.DB)throw Error('Missing binding');
    const marker=await env.STUDY_DB.prepare("SELECT value FROM _study_migration WHERE key='verified'").first();
    if(marker?.value!=='1')throw Error('Unverified import');
    const foreignKeys=await env.STUDY_DB.prepare('PRAGMA foreign_key_check').all();
    if(foreignKeys.results?.length)throw Error('Invalid references');
    if(actor){
      const user=await env.DB.prepare('SELECT id,role,active,is_personal_data_revoked FROM users WHERE id=?').bind(actor.id).first();
      if(!user||user.role!=='DEVELOPER'||user.active!==1||user.is_personal_data_revoked)throw Error('Developer unavailable');
      if(!await env.STUDY_DB.prepare('SELECT id FROM account_refs WHERE id=?').bind(actor.id).first())throw Error('Missing study profile reference');
    }
    return {provider:'d1',connected:true,ready:true,dataTransferred:true,authenticationAdapterReady:true};
  }catch{throw new StudyError(503,'D1 import verification or developer access is incomplete. No database was changed.');}
}
