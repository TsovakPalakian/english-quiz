// Read-only structural preflight, not a schema installer or permission to migrate production.
import {studyTokens} from './d1-study.mjs';
const tables=['account_refs','cards','lessons','lesson_blocks','class_groups','class_group_lessons','class_group_students','catalog_documents','operation_receipts','qr_senses','qr_card_senses','qr_versions','qr_events','qr_generation_jobs','qr_provider_configuration','qr_sense_metadata','qr_publication','qr_session_snapshots','qr_media','qr_feedback','qr_feedback_delivery','qr_speech_tasks','qr_speech_attempts','qr_speech_usage','qr_speech_corrections','qr_speech_shares','qr_speech_text_reviews'];
const triggers=['qr_approved_no_update','qr_approved_no_delete','qr_snapshot_immutable','qr_media_immutable','qr_speech_attempts_immutable','qr_speech_text_immutable'];
tables.push('qr_language_access','qr_language_access_changes','qr_language_access_usage','qr_generation_contexts','qr_dispatch_settings','qr_dispatch_events','qr_preparation_outbox','qr_speech_dialogues','qr_speech_dialogue_turns','qr_speech_disputes','qr_feedback_purge','qr_author_visibility');
tables.push('qr_card_sense_events','qr_exam_sessions');
triggers.push('qr_speech_tasks_no_update','qr_speech_tasks_no_delete','qr_dialogue_identity','qr_dialogue_turn_identity','qr_speech_dispute_identity','qr_feedback_no_update','qr_author_visibility_identity');
triggers.push('qr_card_sense_events_no_update','qr_exam_sessions_no_update');
export async function learningWorkbenchReadiness(db,{studyBridge=false}={}){
  const rows=await db.read("SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','trigger')"),byName=new Map(rows.map(row=>[row.name,row]));
  const missing=[...tables.filter(name=>byName.get(name)?.type!=='table'),...triggers.filter(name=>byName.get(name)?.type!=='trigger')],incompatible=[];
  if(studyBridge)missing.push(...['exams','exam_blocks','exam_instances','assessment_work','assessment_history'].filter(name=>byName.get(name)?.type!=='table'));
  if(byName.has('qr_media')){
    const tokens=studyTokens(byName.get('qr_media').sql),start=tokens.findIndex((token,index)=>token.toLowerCase()==='purpose'&&tokens[index+1]?.toUpperCase()==='IN');
    if(start<0||!tokens.slice(start,tokens.indexOf(')',start)).includes("'speech'"))incompatible.push('media-speech-purpose-upgrade-required');
  }
  if(byName.has('qr_speech_corrections')&&!(await db.read('PRAGMA table_info(qr_speech_corrections)')).some(row=>row.name==='revision'))incompatible.push('speech-correction-revision-required');
  if(byName.has('qr_speech_tasks')){const columns=await db.read('PRAGMA table_info(qr_speech_tasks)');if(['card_id','sense_id'].some(name=>!columns.some(column=>column.name===name&&column.notnull===0)))incompatible.push('lesson-speech-upgrade-required');}
  if(byName.has('qr_feedback')){const columns=await db.read('PRAGMA table_info(qr_feedback)');if(['deleted_at','expires_at','privacy_consent_at'].some(name=>!columns.some(column=>column.name===name)))incompatible.push('feedback-privacy-upgrade-required');}
  return {ready:!missing.length&&!incompatible.length,missing,incompatible,structuralOnly:true,appliedChanges:false,productionApproved:false};
}
