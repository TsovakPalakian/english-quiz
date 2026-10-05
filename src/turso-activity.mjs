import {StudyService,StudyError,statement as s} from './turso-study.mjs';
const metrics=['answers','correct','exams','examPass','learned','cards','songs','archives','seconds'];
const fail=(status,message)=>{throw new StudyError(status,message);};
export class ActivityService extends StudyService {
  async events(actor,body){
    if(!body||Object.keys(body).some(k=>!['mutationId','events'].includes(k))||!Array.isArray(body.events)||!body.events.length||body.events.length>100)fail(400,'Invalid activity batch.');
    const increments=Object.fromEntries(metrics.map(k=>[k,0])),maps={byArea:{},cardAreas:{},examFail:{}};
    for(const e of body.events){
      if(!e||Object.keys(e).some(k=>!['kind','area','result','seconds'].includes(k))||!['answer','exam','learned','card','song','duration'].includes(e.kind)
        ||typeof e.area!=='string'||! /^[a-zA-Z0-9 _/·-]{0,100}$/.test(e.area)||typeof e.result!=='string'||e.result.length>30)fail(400,'Invalid activity event.');
      if(e.kind==='answer'){if(!['ok','miss'].includes(e.result))fail(400,'Invalid answer event.');increments.answers++;increments.correct+=+(e.result==='ok');}
      if(e.kind==='exam'){if(!['pass','fail'].includes(e.result))fail(400,'Invalid exam event.');increments.exams++;increments.examPass+=+(e.result==='pass');}
      if(e.kind==='learned'){if(e.result!=='ok')fail(400,'Invalid learned event.');increments.learned++;}
      if(e.kind==='card'){if(e.result!=='add')fail(400,'Invalid card event.');increments.cards++;}
      if(e.kind==='song'){if(!['add','archive'].includes(e.result))fail(400,'Invalid song event.');increments[e.result==='add'?'songs':'archives']++;}
      if(e.kind==='duration'){if(!Number.isSafeInteger(e.seconds)||e.seconds<1||e.seconds>300)fail(400,'Invalid study duration.');increments.seconds+=e.seconds;}
      else if(e.seconds!==undefined)fail(400,'Unexpected duration.');
      const map=e.kind==='answer'?maps.byArea:e.kind==='card'?maps.cardAreas:e.kind==='exam'&&e.result==='fail'?maps.examFail:null;
      if(map)map[e.area]=(map[e.area]||0)+1;
    }
    const day=new Date().toISOString().slice(0,10),key='activity:'+day;
    return this.personal(actor,body,['activity'],async profile=>({statements:[
      s("INSERT INTO profile_settings(profile_id,key,value_json) VALUES(?,?,'{}') ON CONFLICT(profile_id,key) DO NOTHING",[profile,key]),
      s('UPDATE profile_settings SET value_json=json_set(value_json,'+metrics.map(()=>"?,COALESCE(json_extract(value_json,?),0)+?").join(',')+'),revision=revision+1 WHERE profile_id=? AND key=?',
        [...metrics.flatMap(k=>['$.'+k,'$.'+k,increments[k]]),profile,key]),this.guard(),
      ...Object.entries(maps).flatMap(([name,values])=>Object.entries(values).flatMap(([area,count])=>{
        const path='$.'+name+'.'+JSON.stringify(area);
        return [s('UPDATE profile_settings SET value_json=json_set(value_json,?,COALESCE(json_extract(value_json,?),0)+?) WHERE profile_id=? AND key=?',[path,path,count,profile,key]),this.guard()];
      }))],result:{day,recorded:body.events.length,increments}}));
  }
  async stats(actor,{from,to,user='',role=''}={}){
    if(!actor?.id)fail(401,'Sign in first.');if(user&&user!==actor.id||role)fail(403,'Only own study statistics are migrated.');
    const today=new Date().toISOString().slice(0,10);to ||= today;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(to)))fail(400,'Invalid dates.');
    from ||= new Date(Date.parse(to)-29*86400000).toISOString().slice(0,10);
    for(const date of [from,to])if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail(400,'Invalid dates.');
    const days=(Date.parse(to)-Date.parse(from))/86400000+1;if(days<1||days>366)fail(400,'Use at most 366 days.');
    const previousTo=new Date(Date.parse(from)-86400000).toISOString().slice(0,10),previousFrom=new Date(Date.parse(from)-days*86400000).toISOString().slice(0,10);
    const rows=await this.db.read("SELECT p.key,p.value_json FROM profile_settings p JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND p.key LIKE 'activity:%' ORDER BY p.key",[actor.id]);
    const series=rows.map(r=>({day:r.key.slice(9),...JSON.parse(r.value_json)}));
    const sum=(a,b)=>Object.fromEntries(metrics.map(k=>[k,series.filter(r=>r.day>=a&&r.day<=b).reduce((n,r)=>n+(r[k]||0),0)]));
    const now=sum(from,to),previous=sum(previousFrom,previousTo);
    const map=name=>{const values={};for(const row of series.filter(r=>r.day>=from&&r.day<=to))for(const [key,n] of Object.entries(row[name]||{}))values[key]=(values[key]||0)+n;return values;};
    return {scope:'user',from,to,previousFrom,previousTo,activity:{...now,tracked:!!rows.length,since:series[0]?.day||'',series:series.filter(r=>r.day>=from&&r.day<=to),
      previousAnswers:previous.answers,previousCorrect:previous.correct,previousExams:previous.exams,previousExamPass:previous.examPass,
      previousLearned:previous.learned,previousCards:previous.cards,previousSongs:previous.songs,previousArchives:previous.archives,previousSeconds:previous.seconds,byArea:map('byArea'),cardAreas:map('cardAreas'),examFail:map('examFail')},
      statisticsSource:'turso-activity',testOnly:true,clientReported:true,legacyHistoryIncluded:false};
  }
}
