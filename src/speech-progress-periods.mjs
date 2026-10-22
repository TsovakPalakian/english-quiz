import {StudyError} from './learning-study.mjs';
export function speechProgressPeriods(series,{period='week'}={}){
  if(!['day','week','month'].includes(period))throw new StudyError(400,'Use day, week or month.');
  const start=value=>{const date=new Date(value),day=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());return period==='month'?Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1):period==='week'?day-((date.getUTCDay()+6)%7)*86400000:day;};
  return series.map(group=>{
    const buckets=new Map();for(const point of group.points){const date=new Date(start(point.date)).toISOString().slice(0,10);if(!buckets.has(date))buckets.set(date,[]);buckets.get(date).push(point);}
    return {key:group.key,synthetic:group.synthetic,provisional:group.provisional,editedTranscript:!!group.editedTranscript,period,timezone:'UTC',buckets:[...buckets].map(([date,points])=>({date,attempts:points.length,metrics:Object.fromEntries(['overall','accuracy','fluency','prosody','grammar','vocabulary','task'].map(metric=>{const values=points.map(point=>point[metric]).filter(Number.isFinite);return [metric,values.length?{count:values.length,average:Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10,best:Math.max(...values),first:values[0],last:values.at(-1)}:null];}))}))};
  });
}
