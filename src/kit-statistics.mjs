import {StudyError} from './learning-study.mjs';
import {kitSigned} from './learning-kits.mjs';
import {evaluateKitResponses} from './kit-sessions.mjs';
import {speechProgressPeriods} from './speech-progress-periods.mjs';
const fail=message=>{throw new StudyError(400,message);};
export class KitStatistics{
  constructor(sessions){this.sessions=sessions;this.kits=sessions.kits;this.db=sessions.db;}
  async sessionsFor(actor,{cardId,from=null,to=null}={}){
    kitSigned(actor);await this.kits.card(actor,cardId);
    if([from,to].some(value=>value!==null&&(!Number.isSafeInteger(value)||value<0))||from!==null&&to!==null&&from>=to)fail('Invalid history interval.');
    const rows=await this.db.read('SELECT * FROM qr_session_snapshots WHERE owner_id=? AND card_id=? AND (? IS NULL OR created_at>=?) AND (? IS NULL OR created_at<?) ORDER BY created_at DESC,id DESC LIMIT 501',[actor.id,cardId,from,from,to,to]),sessions=[];
    for(const row of rows.slice(0,500)){
      try{if(row.mode==='exam'&&this.sessions.examPolicy)await this.sessions.examPolicy.access(actor,row);}catch(error){if([403,404].includes(error.status))continue;throw error;}
      const visible=row.mode==='practice'&&row.state==='submitted'||row.mode==='exam'&&row.state==='released'&&(!this.sessions.examPolicy||await this.sessions.examPolicy.resultsVisible(actor,row));
      let score=null,total=null;
      if(visible&&row.type!=='Pronunciation'){const metadata=JSON.parse(row.metadata_json),correct=evaluateKitResponses(row.type,JSON.parse(row.content_json),JSON.parse(row.responses_json),metadata.meaning,metadata);score=correct.filter(Boolean).length;total=correct.length;}
      sessions.push({id:row.id,versionId:row.version_id,type:row.type,mode:row.mode,state:row.state,createdAt:row.created_at,correctCount:score,total,percent:total?Math.round(score/total*1000)/10:null});
    }
    return {sessions,truncated:rows.length>500,affectsLegacyStatistics:false};
  }
  async pronunciation(actor,{cardId,versionId,itemIndex=0,period='week'}={}){
    kitSigned(actor);await this.kits.card(actor,cardId);
    if(typeof versionId!=='string'||!/^[a-f0-9-]{36}$/.test(versionId)||!Number.isSafeInteger(itemIndex)||itemIndex<0||itemIndex>49||!['day','week','month'].includes(period))fail('Invalid pronunciation history selection.');
    const rows=await this.db.read(`SELECT a.id,a.created_at,a.result_json,a.comparison_key,t.value_json FROM qr_speech_attempts a
      JOIN qr_speech_tasks t ON t.id=a.task_id JOIN qr_session_snapshots q ON q.id=json_extract(t.value_json,'$.quizSessionId')
      WHERE a.owner_id=? AND q.owner_id=? AND q.card_id=? AND q.mode='practice' AND q.type='Pronunciation' AND q.version_id=?
      AND json_extract(t.value_json,'$.quizItemIndex')=? AND a.state='complete' AND a.deleted_at IS NULL ORDER BY a.created_at,a.id LIMIT 5001`,[actor.id,actor.id,cardId,versionId,itemIndex]);
    const groups=new Map();for(const row of rows.slice(0,5000)){
      const result=JSON.parse(row.result_json),source=JSON.parse(row.comparison_key);delete source.taskId;
      const key=JSON.stringify({versionId,itemIndex,...source});if(!groups.has(key))groups.set(key,{key,synthetic:result.synthetic,provisional:result.provisional,points:[]});
      groups.get(key).points.push({id:row.id,date:row.created_at,overall:result.overall,...result.scores});
    }
    const series=[...groups.values()];return {series,periods:speechProgressPeriods(series,{period}),truncated:rows.length>5000,basis:'same_template_item_rubric_and_provider',affectsLegacyStatistics:false};
  }
}
