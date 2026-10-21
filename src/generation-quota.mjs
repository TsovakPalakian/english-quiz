// Local request-count quota. Started or uncertain calls are never refunded.
import {statement as s} from './learning-study.mjs';
import {validateGenerationSource} from './quiz-generation-metadata.mjs';
import {LanguageProviderError} from './language-providers.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
const developer=actor=>{
  if(!actor?.id||actor.role!=='DEVELOPER'||actor.active===false||actor.active===0||actor.revoked)fail('developer_required');
};
const id=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const guard=[s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))')];
export class GenerationQuota{
  constructor(db,{now=Date.now}={}){
    if(typeof db?.read!=='function'||typeof db?.atomic!=='function'||typeof now!=='function')fail('invalid_configuration');
    this.db=db;this.now=now;
  }
  time(){const value=this.now();if(!Number.isSafeInteger(value)||value<0)fail('quota_unavailable');return value;}
  async initialize(actor,policy){
    developer(actor);
    if(!policy||Object.keys(policy).some(k=>!['provider','windowMs','requestLimit'].includes(k))||
      typeof policy.provider!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,199}$/.test(policy.provider)||
      !Number.isSafeInteger(policy.windowMs)||policy.windowMs<1000||policy.windowMs>31*86400000||
      !Number.isSafeInteger(policy.requestLimit)||policy.requestLimit<1||policy.requestLimit>1000000)fail('invalid_configuration');
    const {provider,windowMs,requestLimit}=policy;
    await this.db.atomic([...guard,
      s('INSERT OR IGNORE INTO qr_quota_policies(provider,window_ms,request_limit,created_by,created_at) VALUES(?,?,?,?,?)',[provider,windowMs,requestLimit,actor.id,this.time()]),
      s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_quota_policies WHERE provider=? AND window_ms=? AND request_limit=?)',[provider,windowMs,requestLimit]),
      s('DROP TABLE mutation_guard')]);
    return this.inspect(actor,provider);
  }
  async inspect(actor,provider){
    developer(actor);const [policy]=await this.db.read('SELECT * FROM qr_quota_policies WHERE provider=?',[provider]);
    if(!policy)fail('quota_not_configured');
    const at=this.time(),windowStart=Math.floor(at/policy.window_ms)*policy.window_ms;
    const [row]=await this.db.read("SELECT COUNT(*) AS used FROM qr_quota_reservations WHERE provider=? AND window_start=? AND state<>'released'",[provider,windowStart]);
    return {provider,windowMs:policy.window_ms,requestLimit:policy.request_limit,windowStart,windowEnd:windowStart+policy.window_ms,used:Number(row.used),remaining:Math.max(0,policy.request_limit-Number(row.used))};
  }
  async history(actor,provider,{cursor='',limit=50}={}){
    developer(actor);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||typeof cursor!=='string'||cursor.length>60)fail('invalid_request');
    const match=cursor?/^(\d{1,16}):([a-f0-9-]{36})$/.exec(cursor):null;
    if(cursor&&(!match||!Number.isSafeInteger(Number(match[1]))))fail('invalid_request');
    const rows=await this.db.read(`SELECT id,state,window_start,created_at,changed_at,source_json FROM qr_quota_reservations
      WHERE provider=? ${match?'AND (created_at<? OR (created_at=? AND id<?))':''}
      ORDER BY created_at DESC,id DESC LIMIT ?`,[provider,...(match?[Number(match[1]),Number(match[1]),match[2]]:[]),limit+1]);
    const page=rows.slice(0,limit),last=page.at(-1);
    return {reservations:page.map(row=>({id:row.id,state:row.state,windowStart:row.window_start,createdAt:row.created_at,changedAt:row.changed_at,source:validateGenerationSource(JSON.parse(row.source_json))})),next:rows.length>limit?last.created_at+':'+last.id:null};
  }
  async reserve(source,{signal}={}){
    validateGenerationSource(source);if(signal?.aborted)fail('cancelled');
    const at=this.time(),reservation=crypto.randomUUID();
    try{
      await this.db.atomic([...guard,s(`INSERT INTO qr_quota_reservations(id,provider,window_start,state,source_json,created_at,changed_at)
        SELECT ?,p.provider,CAST(?/p.window_ms AS INTEGER)*p.window_ms,'reserved',?,?,?
        FROM qr_quota_policies p WHERE p.provider=? AND
        (SELECT COUNT(*) FROM qr_quota_reservations r WHERE r.provider=p.provider
          AND r.window_start=CAST(?/p.window_ms AS INTEGER)*p.window_ms AND r.state<>'released')<p.request_limit`,
        [reservation,at,JSON.stringify(source),at,at,source.provider,at]),
        s('INSERT INTO mutation_guard SELECT changes()=1'),s('DROP TABLE mutation_guard')]);
    }catch(error){
      if(error.status===409||/CHECK constraint|check constraint|mutation_guard/i.test(error.message))fail('quota_or_access_denied');
      fail('quota_unavailable');
    }
    if(signal?.aborted){await this.release(reservation);fail('cancelled');}
    return reservation;
  }
  async start(reservation){
    if(!id(reservation))fail('invalid_request');const at=this.time();
    try{
      await this.db.atomic([...guard,s(`UPDATE qr_quota_reservations SET state='started',changed_at=?
        WHERE id=? AND state='reserved' AND created_at<=? AND EXISTS(SELECT 1 FROM qr_quota_policies p
          WHERE p.provider=qr_quota_reservations.provider AND CAST(?/p.window_ms AS INTEGER)*p.window_ms=window_start)`,[at,reservation,at,at]),
        s('INSERT INTO mutation_guard SELECT changes()=1'),s('DROP TABLE mutation_guard')]);
    }catch(error){
      if(error.status===409||/CHECK constraint|check constraint|mutation_guard/i.test(error.message))fail('quota_or_access_denied');
      fail('quota_unavailable');
    }
  }
  async release(reservation){
    if(!id(reservation))fail('invalid_request');
    await this.db.atomic([s("UPDATE qr_quota_reservations SET state='released',changed_at=MAX(created_at,?) WHERE id=? AND state='reserved'",[this.time(),reservation])]);
  }
}
