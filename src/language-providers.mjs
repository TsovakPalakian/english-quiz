// Isolated, in-memory routing. No production imports, endpoints, keys or network.
export const LANGUAGE_TASKS=Object.freeze(['generation','review','tts','stt','pronunciation','conversation','dictionary']);
export function upgradeLanguageSelections(value){
  const keys=Object.keys(value||{}),legacy=LANGUAGE_TASKS.filter(task=>task!=='dictionary');
  if(value&&typeof value==='object'&&!Array.isArray(value)&&keys.length===legacy.length&&legacy.every(task=>Object.hasOwn(value,task)))return {...value,dictionary:null};
  return value;
}
const modes=new Set(['text','scripted','unscripted']);
const billings=new Set(['free-tier','self-hosted','paid','unknown']);
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,199}$/.test(value);
export class LanguageProviderError extends Error{
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new LanguageProviderError(code);};
const teacherConfig=actor=>{
  if(!actor?.id||actor.role!=='DEVELOPER'||actor.active===false||actor.active===0||actor.revoked)fail('developer_required');
};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const list=(values,check)=>Array.isArray(values)&&values.length>0&&new Set(values).size===values.length&&values.every(check);

export class LanguageProviders{
  #adapters=new Map();
  #revision=1;
  #selections=Object.fromEntries(LANGUAGE_TASKS.map(task=>[task,null]));
  #history=[];
  #authorize;
  #freeOnly;
  #quota;
  constructor({adapters=[],freeOnly=true,authorize=async()=>false,quota=null,snapshot=null}={}){
    if(!Array.isArray(adapters)||typeof freeOnly!=='boolean'||typeof authorize!=='function'||
      quota!==null&&!['reserve','start','release'].every(key=>typeof quota?.[key]==='function'))fail('invalid_configuration');
    this.#quota=quota;
    this.#authorize=authorize;this.#freeOnly=freeOnly;
    for(const adapter of adapters){
      if(!exact(adapter,['id','provider','model','version','capabilities','billing','invoke','validate'])||
        !['id','provider','version'].every(key=>token(adapter[key]))||
        !(token(adapter.model)||(typeof adapter.model==='string'&&adapter.model.startsWith('@')&&token(adapter.model.slice(1))))||this.#adapters.has(adapter.id)||
        !billings.has(adapter.billing)||typeof adapter.invoke!=='function'||typeof adapter.validate!=='function'||
        !Array.isArray(adapter.capabilities)||!adapter.capabilities.length)fail('invalid_adapter');
      for(const cap of adapter.capabilities){
        if(!exact(cap,['task','locales','modes'])||!LANGUAGE_TASKS.includes(cap.task)||
          !list(cap.locales,token)||!list(cap.modes,mode=>modes.has(mode)))fail('invalid_adapter');
      }
      const {invoke,validate,...metadata}=adapter;
      this.#adapters.set(adapter.id,{...structuredClone(metadata),invoke,validate});
    }
    // Snapshots come from trusted server storage, never directly from a request.
    if(snapshot!==null){
      snapshot={...snapshot,selections:upgradeLanguageSelections(snapshot.selections)};
      if(!exact(snapshot,['revision','selections'])||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||Object.keys(snapshot.selections||{}).length!==LANGUAGE_TASKS.length)fail('invalid_configuration');
      this.#selections=this.#validateSelections(snapshot.selections);this.#revision=snapshot.revision;
    }
  }
  inspect(actor){
    teacherConfig(actor);
    return structuredClone({revision:this.#revision,freeOnly:this.#freeOnly,selections:this.#selections,
      adapters:[...this.#adapters.values()].map(({invoke,validate,...metadata})=>metadata)});
  }
  history(actor){teacherConfig(actor);return structuredClone(this.#history);}
  #validateSelections(selections){
    if(!exact(selections,LANGUAGE_TASKS)||!Object.keys(selections).length)fail('invalid_configuration');
    const next=structuredClone(this.#selections);
    for(const [task,selection] of Object.entries(selections)){
      if(selection===null){next[task]=null;continue;}
      if(!exact(selection,['adapterId','locale','mode'])||!token(selection.adapterId)||!token(selection.locale)||!modes.has(selection.mode))fail('invalid_selection');
      const adapter=this.#adapters.get(selection.adapterId);
      if(!adapter)fail('adapter_not_registered');
      if(this.#freeOnly&&!['free-tier','self-hosted'].includes(adapter.billing))fail('paid_provider_blocked');
      if(!adapter.capabilities.some(cap=>cap.task===task&&cap.locales.includes(selection.locale)&&cap.modes.includes(selection.mode)))fail('unsupported_capability');
      next[task]=structuredClone(selection);
    }
    return next;
  }
  configure(actor,{expectedRevision,selections}={}){
    teacherConfig(actor);
    if(expectedRevision!==this.#revision)fail('configuration_conflict');
    const next=this.#validateSelections(selections);
    this.#selections=next;this.#revision++;
    this.#history.push({revision:this.#revision,actorId:actor.id,date:new Date().toISOString(),selections:structuredClone(next)});
    // Durable production configuration/audit must be supplied by a later integration.
    if(this.#history.length>100)this.#history.shift();
    return this.inspect(actor);
  }
  async execute(task,payload,{signal,timeoutMs=10000}={}){
    if(!LANGUAGE_TASKS.includes(task)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)fail('invalid_request');
    const selection=this.#selections[task];if(!selection)fail('provider_disabled');
    const adapter=this.#adapters.get(selection.adapterId);
    const source=Object.freeze({task,...selection,provider:adapter.provider,model:adapter.model,version:adapter.version,configurationRevision:this.#revision});
    if(signal?.aborted)fail('cancelled');
    const controller=new AbortController();let timer,abort,reservation;
    const stopped=new Promise((_,reject)=>{
      abort=()=>{controller.abort();reject(new LanguageProviderError('cancelled'));};
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{controller.abort();reject(new LanguageProviderError('timeout'));},timeoutMs);
    });
    try{
      const result=await Promise.race([stopped,(async()=>{
        // Clone before reserving: invalid payloads must not consume a started request.
        const input=structuredClone(payload);
        // The injected gate authenticates callers. Both text tasks share a provider quota.
        // Declaring an adapter free-tier does not prove its account cannot be billed.
        if(await this.#authorize({...source,billing:adapter.billing,freeOnly:this.#freeOnly},{signal:controller.signal})!==true)fail('quota_or_access_denied');
        if(controller.signal.aborted)fail('cancelled');
        if(this.#quota&&['generation','review'].includes(task)){
          reservation=await this.#quota.reserve(source,{signal:controller.signal});
          if(controller.signal.aborted){await this.#quota.release(reservation);fail('cancelled');}
          try{await this.#quota.start(reservation);}catch(error){await this.#quota.release(reservation);throw error;}
          if(controller.signal.aborted)fail('cancelled');
        }
        const raw=await adapter.invoke(input,{source,signal:controller.signal});
        if(controller.signal.aborted)fail('cancelled');
        const data=await adapter.validate(raw,{source,signal:controller.signal});
        if(data===undefined)fail('invalid_provider_result');
        return {data:structuredClone(data),source:{...source}};
      })()]);
      return result;
    }catch(error){
      const failure=error instanceof LanguageProviderError?error:new LanguageProviderError('provider_failed');
      failure.source={...source};
      throw failure;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
}
