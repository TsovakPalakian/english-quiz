// Isolated SQL-backed settings. Transports and credentials remain server-injected.
import {LanguageProviders,LanguageProviderError,LANGUAGE_TASKS,upgradeLanguageSelections} from './language-providers.mjs';
import {statement as s} from './learning-study.mjs';
const fail=code=>{throw new LanguageProviderError(code);};
const developer=actor=>{if(!actor?.id||actor.role!=='DEVELOPER'||actor.active===false||actor.active===0||actor.revoked)fail('developer_required');};
const empty=()=>Object.fromEntries(LANGUAGE_TASKS.map(task=>[task,null]));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const canonical=value=>JSON.stringify(value,(_,item)=>object(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const identity=adapter=>({id:adapter.id,provider:adapter.provider,model:adapter.model,version:adapter.version,billing:adapter.billing});
const system={id:'provider-settings',role:'DEVELOPER'};
export class StoredLanguageProviders{
  #db;#options;#catalog;#now;
  constructor(db,options={}, {now=Date.now}={}){
    if(typeof db?.read!=='function'||typeof db?.atomic!=='function'||typeof now!=='function'||Object.hasOwn(options,'snapshot'))fail('invalid_configuration');
    const checked=new LanguageProviders(options).inspect(system);
    this.#db=db;this.#now=now;
    this.#options={...options,adapters:(options.adapters||[]).map(({invoke,validate,...metadata})=>({...structuredClone(metadata),invoke,validate}))};
    this.#catalog=checked;
  }
  async initialize(actor){
    developer(actor);
    try{await this.#db.atomic([s('INSERT OR IGNORE INTO qr_provider_configuration(id,revision,selections_json,pins_json) VALUES(1,1,?,?)',[JSON.stringify(empty()),'{}'])]);}
    catch{fail('provider_configuration_unavailable');}
    return this.inspect(actor);
  }
  async #read(){
    try{
      const [row]=await this.#db.read('SELECT * FROM qr_provider_configuration WHERE id=1');
      if(!row||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error();
      const selections=upgradeLanguageSelections(JSON.parse(row.selections_json)),pins=JSON.parse(row.pins_json);
      if(!exact(selections,LANGUAGE_TASKS)||Object.keys(selections).length!==LANGUAGE_TASKS.length||!exact(pins,LANGUAGE_TASKS))throw Error();
      return {revision:row.revision,selections,pins};
    }catch{fail('provider_configuration_unavailable');}
  }
  #registry(selections,revision){return new LanguageProviders({...this.#options,snapshot:{revision,selections}});}
  #pin(task,state){
    const selection=state.selections[task];if(selection===null)return;
    const adapter=this.#catalog.adapters.find(row=>row.id===selection?.adapterId);
    if(!adapter||canonical(state.pins[task])!==canonical(identity(adapter)))fail('provider_configuration_changed');
  }
  async inspect(actor){
    developer(actor);const state=await this.#read(),unavailable=[];
    for(const task of LANGUAGE_TASKS)if(state.selections[task]!==null){
      try{this.#registry({...empty(),[task]:state.selections[task]},state.revision);this.#pin(task,state);}
      catch(error){unavailable.push({task,code:error instanceof LanguageProviderError?error.code:'provider_configuration_unavailable'});}
    }
    return {...structuredClone(this.#catalog),revision:state.revision,selections:structuredClone(state.selections),unavailable};
  }
  async #replay(actor,mutationId,request){
    let row;try{[row]=await this.#db.read('SELECT * FROM qr_provider_changes WHERE mutation_id=?',[mutationId]);}catch{fail('provider_configuration_unavailable');}
    if(!row)return null;
    if(row.actor_id!==actor.id||row.request_json!==request)fail('configuration_conflict');
    return {revision:row.revision,selections:JSON.parse(row.selections_json)};
  }
  async configure(actor,body){
    developer(actor);
    if(!exact(body,['mutationId','expectedRevision','selections','reason'])||typeof body.mutationId!=='string'||!/^[a-f0-9-]{36}$/.test(body.mutationId)||
      !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>=Number.MAX_SAFE_INTEGER||
      !exact(body.selections,LANGUAGE_TASKS)||!Object.keys(body.selections).length||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>500)fail('invalid_configuration');
    const reason=body.reason.trim(),request=canonical({expectedRevision:body.expectedRevision,selections:body.selections,reason});
    const previous=await this.#replay(actor,body.mutationId,request);if(previous)return previous;
    const state=await this.#read();if(state.revision!==body.expectedRevision)fail('configuration_conflict');
    const revision=state.revision+1,selections={...state.selections,...structuredClone(body.selections)};
    this.#registry(selections,revision);
    const pins={};
    for(const task of LANGUAGE_TASKS)if(selections[task]!==null){
      if(!Object.hasOwn(body.selections,task))this.#pin(task,state);
      pins[task]=identity(this.#catalog.adapters.find(row=>row.id===selections[task].adapterId));
    }
    const at=this.#now();if(!Number.isSafeInteger(at)||at<0)fail('provider_configuration_unavailable');
    try{
      await this.#db.atomic([
        s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
        s('UPDATE qr_provider_configuration SET revision=?,selections_json=?,pins_json=? WHERE id=1 AND revision=?',[revision,JSON.stringify(selections),JSON.stringify(pins),state.revision]),
        s('INSERT INTO mutation_guard SELECT changes()=1'),
        s('INSERT INTO qr_provider_changes(mutation_id,revision,actor_id,changed_at,reason,request_json,selections_json,pins_json) VALUES(?,?,?,?,?,?,?,?)',[body.mutationId,revision,actor.id,at,reason,request,JSON.stringify(selections),JSON.stringify(pins)]),
        s('DROP TABLE mutation_guard')]);
    }catch(error){
      const saved=await this.#replay(actor,body.mutationId,request);if(saved)return saved;
      if(error.status===409||/constraint/i.test(error.message))fail('configuration_conflict');
      fail('provider_configuration_unavailable');
    }
    return {revision,selections:structuredClone(selections)};
  }
  async history(actor,{before=null,limit=50}={}){
    developer(actor);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||before!==null&&(!Number.isSafeInteger(before)||before<2))fail('invalid_request');
    let rows;try{rows=await this.#db.read(`SELECT revision,actor_id,changed_at,reason,selections_json,pins_json FROM qr_provider_changes ${before===null?'':'WHERE revision<?'} ORDER BY revision DESC LIMIT ?`,[...(before===null?[]:[before]),limit+1]);}catch{fail('provider_configuration_unavailable');}
    const page=rows.slice(0,limit);
    return {changes:page.map(row=>({revision:row.revision,actorId:row.actor_id,changedAt:row.changed_at,reason:row.reason,selections:JSON.parse(row.selections_json),adapters:JSON.parse(row.pins_json)})),next:rows.length>limit?page.at(-1).revision:null};
  }
  async execute(task,payload,options){
    if(!LANGUAGE_TASKS.includes(task))fail('invalid_request');
    const state=await this.#read();this.#pin(task,state);
    if(options?.expectedConfigurationRevision!==undefined&&state.revision!==options.expectedConfigurationRevision)fail('provider_configuration_changed');
    return this.#registry({...empty(),[task]:state.selections[task]},state.revision).execute(task,payload,options);
  }
}
