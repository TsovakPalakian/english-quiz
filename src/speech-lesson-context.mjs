import {StudyError,recordId,lessonAccess,statement as s} from './learning-study.mjs';
import {kitSigned} from './learning-kits.mjs';
export const lessonSpeechContext=value=>value.cardId==null&&value.senseId==null;
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
  if(!lessonSpeechContext(value))return review.checkContext(actor,value);
  const query=access(actor,value),[row]=await review.db.read(query.sql,query.args);if(!row)throw new StudyError(403,'This lesson is not available for this account.');return row;
}
export function speechContextGuard(review,actor,value){
  if(!lessonSpeechContext(value))return review.accessGuard(actor,value);
  const query=access(actor,value);return s('INSERT INTO mutation_guard SELECT EXISTS('+query.sql+')',query.args);
}
