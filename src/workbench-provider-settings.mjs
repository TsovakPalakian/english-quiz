import {StudyError} from './learning-study.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const developer=actor=>{if(!actor?.id||actor.role!=='DEVELOPER'||actor.active===false||actor.active===0||actor.revoked)fail(403,'Developer access required.');};
// Only server-registered identities may receive a budget or processing approval.
export class WorkbenchProviderSettings{
  constructor({providers,access,accounts,quota,authorize}){Object.assign(this,{providers,access,accounts:structuredClone(accounts),quota,authorize});}
  account(scope){const row=this.accounts.find(row=>row.scope===scope);if(!row)fail(400,'Unknown provider account.');return row;}
  async gate(actor){developer(actor);if(await this.authorize()!==true)fail(503,'Provider settings writes are off.');}
  async inspect(actor){
    developer(actor);const accounts=[];
    for(const account of this.accounts){
      let quota=null;try{quota=await this.quota.inspect(actor,account.provider);}catch(error){if(error.code!=='quota_not_configured')throw error;}
      accounts.push({...account,access:await this.access.inspect(actor,account.scope),quota});
    }
    let initialized=true;try{await this.providers.inspect(actor);}catch(error){if(error.code!=='provider_configuration_unavailable')throw error;initialized=false;}
    return {accounts,initialized};
  }
  async confirm(actor,body){
    await this.gate(actor);if(!object(body)||!object(body.policy))fail(400,'Invalid provider policy.');
    const account=this.account(body.scope),catalog=(await this.providers.inspect(actor)).adapters;
    if(!Array.isArray(body.policy.bindings)||!Array.isArray(body.policy.tasks)||body.policy.bindings.some(binding=>!account.bindings.some(row=>['id','provider','model','version','billing'].every(key=>row[key]===binding?.[key])))||
      body.policy.tasks.some(task=>!body.policy.bindings.some(binding=>catalog.find(row=>row.id===binding.id)?.capabilities.some(cap=>cap.task===task))))fail(400,'Policy must use registered provider capabilities.');
    return this.access.confirm(actor,body);
  }
  async budget(actor,body){
    await this.gate(actor);
    if(!object(body)||Object.keys(body).some(key=>!['mutationId','provider','requestLimit'].includes(key))||!this.accounts.some(row=>row.provider===body.provider))fail(400,'Unknown provider budget.');
    // Initial setup cannot reset admissions or silently replace an existing limit.
    return this.quota.initialize(actor,{provider:body.provider,requestLimit:body.requestLimit,windowMs:86400000});
  }
  async limit(actor,body){
    await this.gate(actor);
    if(!object(body)||!this.accounts.some(row=>row.provider===body.provider))fail(400,'Unknown provider budget.');
    const {provider,...change}=body;return this.quota.updateLimit(actor,provider,change);
  }
}
