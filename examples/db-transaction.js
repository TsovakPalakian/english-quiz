import {encodeJson,timestamp} from '../db/values.js';

export async function createQuizWithQuestion(db,{ownerId,title,prompt,choices,createdAt=timestamp()}){
  // Generate identities before the batch: no dependency on an INSERT result.
  const quizId=crypto.randomUUID(),questionId=crypto.randomUUID();
  await db.transaction(tx=>{
    tx.execute('INSERT INTO db_example_quizzes(id,owner_id,title,created_at) VALUES(?,?,?,?)',[quizId,ownerId,title,createdAt]);
    tx.execute('INSERT INTO db_example_questions(id,quiz_id,position,prompt,choices_json,published) VALUES(?,?,?,?,?,?)',[questionId,quizId,0,prompt,encodeJson(choices),true]);
  });
  return {quizId,questionId};
}
