const at=value=>Date.parse('2026-10-'+value+'+04:00');
const row=(id,error,path,times,extra={})=>({id:id.repeat(32),method:'POST',path,status:503,error,hits:times.length,accounts:['Preview teacher'],firstAt:times[0],lastAt:times.at(-1),timeZone:'Asia/Yerevan',resolved:false,resolvedAt:null,occurrences:times.map(at=>({at,inferred:false})),resolutions:[],undatedOccurrences:0,request:{method:'POST',url:path,context:{application:{name:'Lumiscia',service:'local-preview',host:'localhost'}}},response:{status:503,body:JSON.stringify({error})},...extra});
export function previewBugs(){
  return [
    row('1','Analysis service temporarily unavailable.','/api/analyze',[at('18T11:20:00'),at('20T09:10:00'),at('20T10:45:00')],{resolutions:[{at:at('19T15:00:00')}]}),
    row('2','Connection interrupted. Saving is not confirmed.','/api/assessment',[at('19T16:30:00')]),
    row('3','Personal card saving from selected text.','/unsupported',[at('18T12:10:00'),at('18T12:15:00'),at('19T17:25:00')],{status:0,resolved:true,resolvedAt:at('20T11:00:00'),resolutions:[{at:at('20T11:00:00')}]}),
    row('4','Request to a private .env file.','/api/staging/.env',[at('18T12:00:00'),at('19T23:20:00')],{method:'GET',resolved:true,resolvedAt:at('19T23:50:00'),resolutions:[{at:at('19T23:50:00')}]}),
    row('5','Old module loading failure.','/color-picker.js',[at('15T12:00:00'),at('18T14:00:00')],{hits:9,resolved:true,undatedOccurrences:7,occurrences:[{at:at('15T12:00:00'),inferred:true},{at:at('18T14:00:00'),inferred:true}]}),
  ];
}
