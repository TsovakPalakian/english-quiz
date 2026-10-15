import {DatabaseError,withDatabase} from '../db/index.js';
import {decodeJson} from '../db/values.js';

export async function quizQuestionsEndpoint(request,db,actor){
  if(!actor?.id)return Response.json({error:'Sign in first.'},{status:401});
  if(request.method!=='GET')return Response.json({error:'Use GET.'},{status:405,headers:{Allow:'GET'}});
  const match=/^\/api\/db-example\/quizzes\/([A-Za-z0-9_-]{1,80})\/questions$/.exec(new URL(request.url).pathname);
  if(!match)return Response.json({error:'Not found.'},{status:404});
  // Example ownership policy; no answer keys are returned by this endpoint.
  const rows=await db.query(`SELECT q.id,q.prompt,q.choices_json
    FROM db_example_questions q JOIN db_example_quizzes quiz ON quiz.id=q.quiz_id
    WHERE q.quiz_id=? AND quiz.owner_id=? AND q.published=?
    ORDER BY q.position,q.id LIMIT ?`,[match[1],actor.id,true,100]);
  return Response.json({questions:rows.map(row=>({id:row.id,prompt:row.prompt,choices:decodeJson(row.choices_json)}))},{headers:{'Cache-Control':'private, no-store'}});
}

export function createQuizExampleWorker({authenticate=async()=>null,databaseOptions={}}={}){
  return {async fetch(request,env){
    try{
      const actor=await authenticate(env,request);
      if(!actor?.id)return Response.json({error:'Sign in first.'},{status:401,headers:{'Cache-Control':'no-store'}});
      return await withDatabase(env,db=>quizQuestionsEndpoint(request,db,actor),databaseOptions);
    }catch(error){
      const known=error instanceof DatabaseError;
      return Response.json({error:known?error.message:'Request failed.',...(known?{code:error.code,mayHaveCommitted:error.mayHaveCommitted}:{})},{status:known?error.status:500,headers:{'Cache-Control':'no-store'}});
    }
  }};
}

// Composition must inject the real account verifier. Unconfigured examples fail
// closed, rather than trusting an actor ID supplied by a browser or URL.
export default createQuizExampleWorker();
