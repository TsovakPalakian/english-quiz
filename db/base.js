import {DatabaseError,invalid,databaseError} from './errors.js';
import {compile} from './sql.js';

export class BaseAdapter {
  #pending=new Set();#closing=null;#closed=false;#planning=false;#options;#slots=0;#waiters=[];
  constructor(provider,options={}){
    this.provider=provider;
    const {retries=1,baseDelayMs=80,timeoutMs=5000,maxStatements=100,concurrency=4,maxPending=64}=options;
    if(!Number.isInteger(retries)||retries<0||retries>2||!Number.isInteger(baseDelayMs)||baseDelayMs<1||baseDelayMs>1000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxStatements)||maxStatements<1||maxStatements>100||!Number.isInteger(concurrency)||concurrency<1||concurrency>6||!Number.isInteger(maxPending)||maxPending<concurrency||maxPending>256)throw invalid('DB_OPTIONS','Invalid database retry, timeout, concurrency or batch limit.');
    this.#options={...options,retries,baseDelayMs,timeoutMs,maxStatements,concurrency,maxPending};
  }
  get timeoutMs(){return this.#options.timeoutMs;}
  #assertOpen(){
    if(this.#closed||this.#closing)throw new DatabaseError('DB_CLOSED','The request database has been closed.',{status:500});
    if(this.#planning)throw invalid('DB_TRANSACTION_CALLBACK','Inside a transaction, enqueue commands on tx, not on db.');
    if(this.#pending.size>=this.#options.maxPending)throw new DatabaseError('DB_BACKPRESSURE','Too many database operations in this request.');
  }
  #emit(event,failure=false){
    const safe=Object.freeze({provider:this.provider,...event});
    const deliver=callback=>{try{const pending=callback?.(safe);if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{});}catch{}};
    deliver(this.#options.onMetric);
    if(failure)deliver(this.#options.log||((entry)=>console.warn(JSON.stringify(entry))));
  }
  #track(job){this.#pending.add(job);job.then(()=>this.#pending.delete(job),()=>this.#pending.delete(job));return job;}
  #start(operation,write,perform){
    return this.#track((async()=>{
      if(this.#slots>=this.#options.concurrency)await new Promise(resolve=>this.#waiters.push(resolve));else this.#slots++;
      try{return await this.#run(operation,write,perform);}
      finally{const next=this.#waiters.shift();if(next)next();else this.#slots--;}
    })());
  }
  async #run(operation,write,perform){
    const started=Date.now();
    for(let attempt=1;;attempt++){
      try{
        const value=await perform();this.#emit({event:'db.operation',operation,attempt,success:true,durationMs:Date.now()-started});return value;
      }catch(cause){
        const error=databaseError(cause,{write});
        const retry=error.retryable&&attempt<=this.#options.retries;
        this.#emit({event:'db.operation',operation,attempt,success:false,durationMs:Date.now()-started,code:error.code,status:error.status,willRetry:retry,mayHaveCommitted:error.mayHaveCommitted},true);
        if(!retry)throw error;
        const delay=this.#options.baseDelayMs*2**(attempt-1)+Math.floor(Math.random()*this.#options.baseDelayMs);
        await (this.#options.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(delay);
      }
    }
  }
  query(sql,params=[]){
    this.#assertOpen();const command=compile(sql,params,this.provider,'query');
    return this.#start('query',false,()=>this._query(command));
  }
  execute(sql,params=[]){
    this.#assertOpen();const command=compile(sql,params,this.provider,'execute');
    return this.#start('execute',true,()=>this._execute(command));
  }
  transaction(fn){
    this.#assertOpen();
    if(typeof fn!=='function'||fn.constructor?.name==='AsyncFunction')throw invalid('DB_TRANSACTION_CALLBACK','HTTP transactions require a synchronous planning callback. Do not await tx queries.');
    const commands=[];let sealed=false;const handles=new WeakSet();
    const enqueue=operation=>(sql,params=[])=>{
      if(sealed)throw invalid('DB_TRANSACTION_CALLBACK','The transaction plan is already closed.');
      if(commands.length>=this.#options.maxStatements)throw invalid('DB_TRANSACTION_SIZE','The transaction has too many statements.');
      commands.push(compile(sql,params,this.provider,operation));
      const handle=Object.freeze({then(){throw invalid('DB_TRANSACTION_CALLBACK','Transaction results are available only after the atomic HTTP batch finishes.');}});handles.add(handle);return handle;
    };
    this.#planning=true;
    try{
      const returned=fn(Object.freeze({query:enqueue('query'),execute:enqueue('execute')}));
      if(returned&&typeof returned.then==='function'&&!handles.has(returned)){
        Promise.resolve(returned).catch(()=>{});
        throw invalid('DB_TRANSACTION_CALLBACK','Async transaction callbacks are not supported in HTTP mode.');
      }
    }finally{sealed=true;this.#planning=false;}
    if(!commands.length)throw invalid('DB_TRANSACTION_SIZE','A transaction must contain at least one statement.');
    const write=commands.some(command=>command.operation==='execute');
    return this.#start('transaction',write,()=>this._batch(commands,{write}));
  }
  close(){
    if(!this.#closing)this.#closing=(async()=>{
      await Promise.allSettled([...this.#pending]);
      try{await this._close();}catch{this.#emit({event:'db.operation',operation:'close',success:false,code:'DB_CLEANUP_FAILED'},true);}
      finally{this.#closed=true;}
    })();
    return this.#closing;
  }
}
