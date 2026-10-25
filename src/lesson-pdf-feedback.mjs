// Only imported objective exercises have learner feedback. Open-task sample
// answers remain teacher-only even after a learner submits an answer.
export function lessonPdfExerciseFeedback(type,content){
  return type==='exercise'&&content?.pdfImport?.section==='classwork'&&typeof content.pdfTeacherNotes==='string'
    ?content.pdfTeacherNotes:'';
}
