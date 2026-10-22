import {StudyError,recordId,lessonAccess,cardAccess,accessArgs,statement as s} from './learning-study.mjs';
import {kitSigned} from './learning-kits.mjs';
export const lessonSpeechContext=value=>value.cardId==null&&value.senseId==null;
function templateAccess(actor,value){
  kitSigned(actor);
  return {sql:`SELECT c.id FROM qr_speech_tasks t JOIN qr_session_snapshots q ON q.id=json_extract(t.value_json,'$.quizSessionId')
    JOIN cards c ON c.id=q.card_id WHERE t.id=? AND q.id=? AND q.owner_id=? AND q.type='Pronunciation' AND q.mode='practice'
    AND t.card_id=q.card_id AND t.sense_id=? AND c.deleted_at IS NULL AND ${cardAccess}`,
    args:[value.speechTaskId,value.quizSessionId,actor.id,value.senseId,...accessArgs(actor)]};
}
function access(actor,value){
  kitSigned(actor);recordId(value.groupId);recordId(value.lessonId);
  if(!lessonSpeechContext(value))throw new StudyError(400,'Use a lesson context without a partial word binding.');
  const staff=['ADMIN','DEVELOPER'].includes(actor.role);
  return {sql:`SELECT l.id FROM class_groups g JOIN class_group_lessons gl ON gl.group_id=g.id JOIN lessons l ON l.id=gl.lesson_id
    WHERE g.id=? AND l.id=? AND g.deleted_at IS NULL AND l.deleted_at IS NULL AND
    (?=1 OR (g.hidden_from_students=0 AND EXISTS(SELECT 1 FROM class_group_students gs WHERE gs.group_id=g.id AND gs.account_id=?))) AND ${lessonAccess}`,
    args:[value.groupId,value.lessonId,+staff,actor.id,+staff,actor.id,actor.id]};
}
export async function checkSpeechContext(review,actor,value){
  if(value.quizSessionId){const query=templateAccess(actor,value),[row]=await review.db.read(query.sql,query.args);if(!row)throw new StudyError(403,'Private pronunciation practice is unavailable.');return row;}
  if(!lessonSpeechContext(value))return review.checkContext(actor,value);
  const query=access(actor,value),[row]=await review.db.read(query.sql,query.args);if(!row)throw new StudyError(403,'This lesson is not available for this account.');return row;
}
export function speechContextGuard(review,actor,value){
  if(value.quizSessionId){const query=templateAccess(actor,value);return s('INSERT INTO mutation_guard SELECT EXISTS('+query.sql+')',query.args);}
  if(!lessonSpeechContext(value))return review.accessGuard(actor,value);
  const query=access(actor,value);return s('INSERT INTO mutation_guard SELECT EXISTS('+query.sql+')',query.args);
}
