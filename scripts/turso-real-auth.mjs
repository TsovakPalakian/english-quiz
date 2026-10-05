// Local staging auth: bounded, read-only production users queries. No credentials
// are exported, no production sessions/content are created or changed.
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pbkdf2Sync,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {StudyError} from '../src/turso-study.mjs';
import {mediaRange} from '../src/turso-media.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fields='id,login,email,name,role,password_salt,password_hash,password_iterations,active,is_personal_data_revoked,created_at';
const loginSql=`SELECT ${fields} FROM users WHERE is_personal_data_revoked=0 AND (login=? OR email=?) LIMIT 1`;
const currentSql=`SELECT ${fields} FROM users WHERE id=? LIMIT 1`;
const proof=hash=>createHash('sha256').update(hash).digest('hex');
const publicUser=row=>({id:row.id,login:row.login,email:row.email,name:row.name||'',role:row.role,revoked:false,createdAt:row.created_at||0});
const valid=row=>row && row.active===1 && !row.is_personal_data_revoked && ['ADMIN','DEVELOPER','USER'].includes(row.role);

export function cloudflareAccountSource({fetchImpl=fetch,limit=50,clock=Date.now,tokenProvider}={}) {
  const config=readFileSync(resolve(root,'wrangler.toml'),'utf8');
  const account=config.match(/^account_id\s*=\s*"([a-f0-9]{32})"/m)?.[1];
  const database=config.match(/^database_id\s*=\s*"([a-f0-9-]{36})"/m)?.[1];
  const bucket=config.match(/^bucket_name\s*=\s*"([a-z0-9-]+)"/m)?.[1];
  if(account!=='22f73bd94b002b9aee8eed13d261cf13' || database!=='00083392-f0d6-4c56-a0a3-cd1a6a16bd67' || bucket!=='learn-english-media')throw new Error('Unexpected production account configuration.');
  const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
  let used=0,windowStart=clock();
  function token(){
    if(tokenProvider)return tokenProvider(); // Dependency injection for offline tests only.
    if(process.env.CLOUDFLARE_API_TOKEN)return process.env.CLOUDFLARE_API_TOKEN;
    const saved=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
    const bearer=saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],expiry=saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
    if(!bearer || !expiry || Date.parse(expiry)<=clock())throw new StudyError(503,'Wrangler login expired. Refresh the existing Cloudflare login.');
    return bearer;
  }
  async function request(path,method,body){
    let response;
    try{response=await fetchImpl(base+path,{method,redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
    catch(error){if(error instanceof StudyError)throw error;throw new StudyError(503,'Account verification unavailable. No automatic retry.');}
    return response;
  }
  async function query(sql,params){
    if(![loginSql,currentSql].includes(sql))throw new StudyError(500,'Only fixed users authentication SELECTs are allowed.');
    if(clock()-windowStart>=3_600_000){used=0;windowStart=clock();}
    if(used>=limit)throw new StudyError(503,'Local auth query budget reached (50/hour). Production data was not changed.');
    used++;
    const response=await request(`/d1/database/${database}/query`,'POST',{sql,params});
    if(!response.ok)throw new StudyError(503,'Account database unavailable.');
    const data=await response.json();
    if(!data.success || data.result?.length!==1 || !data.result[0].success || !Array.isArray(data.result[0].results))throw new StudyError(503,'Account verification failed.');
    return data.result[0].results[0]||null;
  }
  return {
    async readMedia(key,range=''){
      if(!/^[A-Za-z0-9_/-]{1,200}$/.test(key)||key.includes('..'))throw new StudyError(400,'Invalid media request.');
      mediaRange(range);
      // Production R2 is read-only. No PUT/DELETE or study D1 requests.
      const response=await fetchImpl(base+'/r2/buckets/'+bucket+'/objects/'+key.split('/').map(encodeURIComponent).join('/'),{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{Authorization:'Bearer '+token(),...(range?{Range:range}:{})}});
      if(![200,206,404,416].includes(response.status))throw new StudyError(503,'Media read unavailable.');return response;
    },
    byLogin:login=>query(loginSql,[login,login.toLowerCase()]),
    byId:id=>query(currentSql,[id]),
    async gone(id){
      if(!/^[a-f0-9]{16,64}$/.test(id))throw new StudyError(503,'Invalid account identity.');
      const response=await request(`/r2/buckets/${bucket}/objects/gone/${id}`,'GET');
      await response.body?.cancel();
      if(response.status===404)return false;
      if(response.status===200)return true;
      throw new StudyError(503,'Account revocation verification unavailable.');
    },
    health:()=>({d1AuthQueries:used,d1AuthQueryLimit:limit})
  };
}
export class RealStageAuth {
  constructor(source,{clock=Date.now}={}){this.source=source;this.clock=clock;this.sessions=new Map();this.failures=[];}
  async login(body){
    const login=String(body?.login||'').trim(),password=body?.password;
    if(Object.keys(body||{}).some(k=>!['login','password'].includes(k)) || !login || login.length>120 || typeof password!=='string' || !password || password.length>32)throw new StudyError(400,'Enter your existing login and password.');
    this.failures=this.failures.filter(time=>this.clock()-time<900_000);
    if(this.failures.length>=8)throw new StudyError(429,'Too many local login attempts. Wait 15 minutes.');
    // Count before awaiting; concurrent guesses cannot bypass the bound.
    const attempt=this.clock();this.failures.push(attempt);
    const row=await this.source.byLogin(login);
    if(!valid(row) || row.password_iterations!==100_000 || !/^[a-f0-9]{32}$/.test(row.password_salt) || !/^[a-f0-9]{64}$/.test(row.password_hash))throw new StudyError(401,'Wrong login or password.');
    const actual=pbkdf2Sync(password,Buffer.from(row.password_salt,'hex'),100_000,32,'sha256');
    if(!timingSafeEqual(actual,Buffer.from(row.password_hash,'hex')) || await this.source.gone(row.id))throw new StudyError(401,'Wrong login or password.');
    this.failures=this.failures.filter(time=>time!==attempt);
    for(const [key,session] of this.sessions)if(session.expires<=this.clock())this.sessions.delete(key);
    const token=randomBytes(24).toString('hex');
    this.sessions.set(token,{id:row.id,proof:proof(row.password_hash),expires:this.clock()+3_600_000});
    return {token,user:publicUser(row)};
  }
  cookie(request){return request.headers.cookie?.match(/(?:^|;\s*)turso_real=([a-f0-9]{48})(?:;|$)/)?.[1];}
  async current(request){
    const token=this.cookie(request),session=this.sessions.get(token);
    if(!session || session.expires<=this.clock()){this.sessions.delete(token);return null;}
    // Exactly one live users SELECT per protected HTTP request, never per SQL
    // subquery/card. No JWT-only fallback or role cache; fail closed on quotas.
    const row=await this.source.byId(session.id);
    if(!valid(row) || proof(row.password_hash)!==session.proof || await this.source.gone(session.id)){
      this.sessions.delete(token);return null;
    }
    return publicUser(row);
  }
  logout(request){this.sessions.delete(this.cookie(request));}
}
