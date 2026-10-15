import assert from 'node:assert/strict';
import {productionCredentials} from './import-turso-production.mjs';
const [file,block,account]=process.argv.slice(2);
assert.match(block||'',/^\d{1,16}$/);assert.match(account||'',/^[a-f0-9]{32}$/);
const {endpoint,token}=productionCredentials(file);
const response=await fetch(endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({requests:[{type:'execute',stmt:{sql:"SELECT state,revision,updated_at FROM assessment_work WHERE kind='exam-block' AND material_id=? AND account_id=?",args:[{type:'integer',value:block},{type:'text',value:account}],want_rows:true}},{type:'close'}]})});
const text=await response.text();let body;try{body=JSON.parse(text);}catch{}
const code=body?.code||body?.error?.code;
console.log(JSON.stringify({httpStatus:response.status,code:/^[A-Z0-9_-]{1,80}$/.test(code||'')?code:null,category:/quota|limit|blocked/i.test(text)?'quota-or-limit':/expired|unauthorized|authentication/i.test(text)?'authorization':response.ok?'ok':'upstream-error'}));
if(response.ok){const result=body?.results?.[0];if(result?.type==='ok')console.log(JSON.stringify({work:result.response?.result?.rows,columns:result.response?.result?.cols?.map(column=>column.name)}));else console.log(JSON.stringify({queryAccepted:false,code:/^[A-Z0-9_-]{1,80}$/.test(result?.error?.code||'')?result.error.code:null}));}
