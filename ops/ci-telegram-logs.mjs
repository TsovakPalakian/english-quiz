const API='https://api.github.com';
export function shouldAttachCILogs(env=process.env){
  return env.CI_ATTACH_LOGS==='true'&&[env.TEST_RESULT,env.TEST_EXECUTION,env.DEPLOY_RESULT].includes('failure');
}
async function boundedText(response,limit){
  if(!response.body)return '';
  const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Log response exceeds the size limit.');}text+=decoder.decode(value,{stream:true});}
    return text+decoder.decode();
  }finally{reader.releaseLock();}
}
export function sanitizeCILogs(text,env={}){
  let result=String(text);
  const values=Object.entries(env).filter(([key,value])=>/TOKEN|SECRET|PASSWORD|ACCESS_KEY/.test(key)&&typeof value==='string'&&value.length>=8).map(([,value])=>value).sort((a,b)=>b.length-a.length);
  for(const value of values)result=result.split(value).join('[REDACTED]');
  result=result.replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]');
  result=result.replace(/((?:[A-Z_]*(?:TOKEN|SECRET|PASSWORD|ACCESS_KEY)[A-Z_]*|Authorization)\s*[:=]\s*)[^\r\n]+/gi,'$1[REDACTED]');
  return result.replace(/https?:\/\/[^\s<>"']+/gi,url=>{
    try{const parsed=new URL(url);if([...parsed.searchParams.keys()].some(key=>/signature|^sig$|token|credential|secret|password|^key$/i.test(key)))return parsed.origin+parsed.pathname+'?[REDACTED]';}catch{}
    return url;
  });
}
export async function collectCILogs(env=process.env,{fetchImpl=globalThis.fetch}={}){
  const repository=env.GITHUB_REPOSITORY,run=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT||'1';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!/^\d+$/.test(run||'')||!/^\d+$/.test(attempt)||!env.GITHUB_TOKEN)throw Error('GitHub log access is not configured.');
  const request=(url,headers={})=>fetchImpl(url,{headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
  const headers={Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'};
  const jobs=[];
  for(let page=1;page<=3;page++){
    const response=await request(`${API}/repos/${repository}/actions/runs/${run}/attempts/${attempt}/jobs?per_page=100&page=${page}`,headers);
    if(!response.ok)throw Error('GitHub job metadata could not be downloaded.');
    const data=JSON.parse(await boundedText(response,1024*1024));
    if(!Array.isArray(data.jobs))throw Error('Invalid GitHub job metadata.');
    jobs.push(...data.jobs);if(data.jobs.length<100)break;
  }
  const parts=[`Lumiscia CI logs\nRepository: ${repository}\nRun: ${run}\nAttempt: ${attempt}\nhttps://github.com/${repository}/actions/runs/${run}\n`];
  for(const name of ['test','deploy']){
    const job=jobs.find(row=>row.name===name&&row.status==='completed');
    parts.push(`\n===== ${name} =====`);
    if(!job){parts.push('No completed job logs available for this attempt.');continue;}
    parts.push('Result: '+String(job.conclusion||'unknown'));
    if(!Number.isSafeInteger(job.id)||job.id<1){parts.push('Invalid job identity; logs unavailable.');continue;}
    try{
      let response=await request(`${API}/repos/${repository}/actions/jobs/${job.id}/logs`,headers);
      for(let redirects=0;[301,302,303,307,308].includes(response.status);redirects++){
        if(redirects>=3)throw Error('Too many log redirects.');
        const location=new URL(response.headers.get('location'));
        if(location.protocol!=='https:'||location.username||location.password||![API.slice(8),'github.com'].includes(location.hostname)&&!location.hostname.endsWith('.githubusercontent.com')&&!location.hostname.endsWith('.blob.core.windows.net'))throw Error('Unsafe log redirect.');
        response=await request(location.href);
      }
      if(!response.ok)throw Error('Job log download failed.');
      parts.push(await boundedText(response,8*1024*1024));
    }catch{parts.push('Logs unavailable or oversized. Open this job in GitHub Actions.');}
  }
  return {name:`lumiscia-ci-${run}-attempt-${attempt}.txt`,text:sanitizeCILogs(parts.join('\n'),env)};
}
