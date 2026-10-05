// Point mutations for own content; used only by isolated Turso staging.
import {StudyService,StudyError,statement as s,cardAccess,accessArgs} from './turso-study.mjs';
const bad=(status,message)=>{throw new StudyError(status,message);};
const only=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))bad(400,'Invalid fields.');};
const id=value=>{if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(value))bad(400,'Invalid ID.');return value;};
const rev=value=>{if(!Number.isSafeInteger(value)||value<0)bad(400,'Invalid expectedRevision.');return value;};
const text=(value,max)=>{if(typeof value!=='string'||value.length>max)bad(400,'Invalid content size.');return value;};
export const libraryDto=row=>({...JSON.parse(row.content_json),stageId:row.id,stageRevision:row.revision,stageScope:row.scope,stageLocalMedia:!!row.media_key?.startsWith('stage-local/')});
export class PersonalService extends StudyService {
  async createManagedCard(actor,accountId,body){
    id(accountId);only(body,['mutationId','id','expectedRevision','card']);id(body.id);const expected=rev(body.expectedRevision);
    only(body.card,['en','ru']);const en=text(body.card.en,200).trim(),ru=text(body.card.ru,10000).trim();
    if(!en||!ru)bad(400,'English and translation are required.');
    return this.mutate(actor,body,['create-managed-card',accountId,body.id],async()=>{
      const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[accountId]);
      if(members.length!==1)bad(409,'Target profile has not been imported.');
      const profile=members[0].profile_id,target={id:accountId,role:'USER'};
      const duplicates=await this.db.read(`SELECT c.id FROM cards c WHERE ${cardAccess} AND lower(c.en)=lower(?) AND c.ru=? LIMIT 1`,[...accessArgs(target),en,ru]);
      if(duplicates.length)bad(409,'The same definition exists. Add it by ID instead.');
      const card={word:en,en,ru,place:'mine',stageId:body.id,stageRevision:1,stageScope:'profile',stageLinksRevision:expected+1};
      return {statements:[...this.linkRevisionCommands(profile,expected),
        s("INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES(?,'profile',?,?,?,?)",[body.id,profile,en,en.toLowerCase(),ru]),this.guard(),
        s("INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES(?,?,'mine',(SELECT COALESCE(MIN(position),1)-1 FROM profile_cards WHERE profile_id=? AND place='mine'))",[profile,body.id,profile]),this.guard()],
        result:{id:body.id,revision:expected+1,card}};
    });
  }
  async createOwnCard(actor,body){
    only(body,['mutationId','id','expectedRevision','card']);id(body.id);const expected=rev(body.expectedRevision);
    only(body.card,['en','ru']);const en=text(body.card.en,200).trim(),ru=text(body.card.ru,10000).trim();
    if(!en||!ru)bad(400,'English and translation are required.');
    return this.personal(actor,body,['create-own-card',body.id],async profile=>{
      const duplicates=await this.db.read(`SELECT c.id FROM cards c WHERE ${cardAccess} AND lower(c.en)=lower(?) AND c.ru=? LIMIT 1`,[...accessArgs(actor),en,ru]);
      if(duplicates.length)bad(409,'The same definition exists. Add it by its existing ID instead.');
      const card={word:en,en,ru,place:'mine',stageId:body.id,stageRevision:1,stageScope:'profile',stageLinksRevision:expected+1};
      return {statements:[...this.linkRevisionCommands(profile,expected),
        s("INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES(?,'profile',?,?,?,?)",[body.id,profile,en,en.toLowerCase(),ru]),this.guard(),
        s("INSERT INTO profile_cards(profile_id,card_id,place,position) VALUES(?,?,'mine',(SELECT COALESCE(MIN(position),1)-1 FROM profile_cards WHERE profile_id=? AND place='mine'))",[profile,body.id,profile]),this.guard()],
        result:{id:body.id,revision:expected+1,card}};
    });
  }
  async library(actor){
    if(!actor?.id)bad(401,'Sign in first.');
    const rows=await this.db.read(`SELECT l.* FROM library_items l JOIN profile_library_items p ON p.item_id=l.id
      JOIN profile_members m ON m.profile_id=p.profile_id WHERE m.account_id=? AND l.deleted_at IS NULL
      AND (l.scope='shared' OR l.owner_profile_id=m.profile_id) ORDER BY p.position,l.id`,[actor.id]);
    return rows.map(row=>({kind:row.kind,...libraryDto(row)}));
  }
  validateLibrary(kind,changes){
    if(!['text','song'].includes(kind))bad(400,'Invalid library kind.');
    only(changes,kind==='text'?['title','text']:['title','artist','lyrics','videoUrl','musicUrl','archived']);
    if(!Object.keys(changes).length)bad(400,'Send changed fields only.');
    for(const [key,value] of Object.entries(changes)){
      if(key==='archived'){if(typeof value!=='boolean')bad(400,'Invalid archive flag.');continue;}
      text(value,['lyrics','text'].includes(key)?50_000:1000);
      if(key==='title'&&!value.trim())bad(400,'A title is required.');
      if(['musicUrl','videoUrl'].includes(key)&&value){let url;try{url=new URL(value);}catch{bad(400,'Invalid media URL.');}
        if(url.protocol!=='https:'||url.username||url.password)bad(400,'Only HTTPS media links are allowed.');}
    }
    return changes;
  }
  async createLibrary(actor,body){
    only(body,['mutationId','id','kind','changes']);id(body.id);const changes=this.validateLibrary(body.kind,body.changes);
    if(!changes.title||!changes[body.kind==='text'?'text':'lyrics']?.trim())bad(400,'Title and content are required.');
    return this.personal(actor,body,['create-library',body.id],async profile=>{
      const content={id:body.id,...changes,...(body.kind==='text'?{analysis:null}:{marks:{}}),updatedAt:new Date().toISOString()};
      return {statements:[s("INSERT INTO library_items(id,kind,scope,owner_profile_id,content_json) VALUES(?,?,'profile',?,?)",[body.id,body.kind,profile,JSON.stringify(content)]),this.guard(),
        s('INSERT INTO profile_library_items(profile_id,item_id,position) VALUES(?,?,(SELECT COALESCE(MIN(position),1)-1 FROM profile_library_items WHERE profile_id=?))',[profile,body.id,profile]),this.guard()],
        result:{id:body.id,item:{...content,stageId:body.id,stageRevision:1,stageScope:'profile',kind:body.kind},revision:1}};
    });
  }
  async editLibrary(actor,key,body,deleting=false){
    id(key);only(body,deleting?['mutationId','expectedRevision']:['mutationId','expectedRevision','changes']);const expected=rev(body.expectedRevision);if(!expected)bad(400,'Expected a saved record.');
    return this.personal(actor,body,[deleting?'delete-library':'edit-library',key],async profile=>{
      const [row]=await this.db.read('SELECT l.* FROM library_items l JOIN profile_library_items p ON p.item_id=l.id WHERE p.profile_id=? AND l.id=? AND l.deleted_at IS NULL',[profile,key]);
      if(!row||row.scope!=='profile'||row.owner_profile_id!==profile)bad(404,'Own library item not found. Shared items are read-only here.');
      const changes=deleting?{}:this.validateLibrary(row.kind,body.changes),content={...JSON.parse(row.content_json),...changes,updatedAt:new Date().toISOString()};
      if('text' in changes)content.analysis=null;
      if('lyrics' in changes)content.marks={};
      return {statements:[s(`UPDATE library_items SET ${deleting?'deleted_at=unixepoch()':'content_json=?'},revision=revision+1 WHERE id=? AND owner_profile_id=? AND scope='profile' AND revision=? AND deleted_at IS NULL`,[...(deleting?[]:[JSON.stringify(content)]),key,profile,expected]),this.guard()],
        result:{id:key,revision:expected+1,...(deleting?{deleted:true}:{item:{...content,stageId:key,stageRevision:expected+1,stageScope:'profile',kind:row.kind}})}};
    });
  }
  async editManagedText(actor,accountId,key,body){
    return this.editManagedLibrary(actor,accountId,key,'text',body);
  }
  async createManagedLibrary(actor,accountId,kind,body){
    id(accountId);id(body?.id);only(body,['mutationId','id','changes']);
    if(kind==='song'&&actor?.role!=='DEVELOPER')bad(403,'Developer song management only.');
    const changes=this.validateLibrary(kind,body.changes);
    if(!changes.title||!changes[kind==='text'?'text':'lyrics']?.trim())bad(400,'Title and content are required.');
    return this.mutate(actor,body,['create-managed-library',accountId,kind,body.id],async()=>{
      const members=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[accountId]);
      if(members.length!==1)bad(409,'Target profile has not been imported.');
      const profile=members[0].profile_id,content={id:body.id,...changes,...(kind==='text'?{analysis:null}:{marks:{}}),updatedAt:new Date().toISOString()};
      return {statements:[s("INSERT INTO library_items(id,kind,scope,owner_profile_id,content_json) VALUES(?,?,'profile',?,?)",[body.id,kind,profile,JSON.stringify(content)]),this.guard(),
        s('INSERT INTO profile_library_items(profile_id,item_id,position) VALUES(?,?,(SELECT COALESCE(MIN(position),1)-1 FROM profile_library_items WHERE profile_id=?))',[profile,body.id,profile]),this.guard()],
        result:{id:body.id,revision:1,item:{...content,stageId:body.id,stageRevision:1,stageScope:'profile',kind}}};
    });
  }
  async editManagedLibrary(actor,accountId,key,kind,body,deleting=false){
    id(accountId);id(key);only(body,deleting?['mutationId','expectedRevision']:['mutationId','expectedRevision','changes']);
    if(!['text','song'].includes(kind))bad(400,'Invalid library kind.');
    if(kind==='song'&&actor?.role!=='DEVELOPER')bad(403,'Developer song management only.');
    const expected=rev(body.expectedRevision);if(!expected)bad(400,'Expected a saved text.');
    const changes=deleting?{}:this.validateLibrary(kind,body.changes);
    return this.mutate(actor,body,[deleting?'archive-managed-'+kind:'edit-managed-'+kind,accountId,key],async()=>{
      const profiles=await this.db.read('SELECT profile_id FROM profile_members WHERE account_id=?',[accountId]);
      if(profiles.length!==1)bad(409,'Target profile has not been imported.');
      const profile=profiles[0].profile_id;
      const [row]=await this.db.read(`SELECT l.* FROM library_items l JOIN profile_library_items p ON p.item_id=l.id
        WHERE p.profile_id=? AND l.id=? AND l.kind=? AND l.scope='profile'
        AND l.owner_profile_id=? AND l.deleted_at IS NULL`,[profile,key,kind,profile]);
      if(!row)bad(404,'Target personal text not found. Shared texts are read-only.');
      const content={...JSON.parse(row.content_json),...changes,updatedAt:new Date().toISOString()};
      if('text' in changes)content.analysis=null;
      if('lyrics' in changes)content.marks={};
      return {statements:[s(`UPDATE library_items SET ${deleting?'deleted_at=unixepoch()':'content_json=?'},revision=revision+1 WHERE id=? AND kind=?
        AND scope='profile' AND owner_profile_id=? AND revision=? AND deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM profile_library_items WHERE profile_id=? AND item_id=library_items.id)`,[...(deleting?[]:[JSON.stringify(content)]),key,kind,profile,expected,profile]),this.guard()],
        result:{id:key,revision:expected+1,...(deleting?{deleted:true}:{item:{...libraryDto({...row,content_json:JSON.stringify(content),revision:expected+1}),kind}})}};
    });
  }
  async editManagedCard(actor,accountId,key,body){
    id(accountId);id(key);only(body,['mutationId','expectedRevision','changes']);
    const expected=rev(body.expectedRevision);if(!expected)bad(400,'Expected a saved card.');
    only(body.changes,['ru']);const ru=text(body.changes.ru,10000).trim();if(!ru)bad(400,'Translation required.');
    return this.mutate(actor,body,['edit-managed-card',accountId,key],async()=>{
      const [row]=await this.db.read(`SELECT c.owner_profile_id FROM profile_members m JOIN profile_cards p ON p.profile_id=m.profile_id
        JOIN cards c ON c.id=p.card_id WHERE m.account_id=? AND c.id=? AND c.scope='profile'
        AND c.owner_profile_id=m.profile_id AND c.deleted_at IS NULL LIMIT 1`,[accountId,key]);
      if(!row)bad(404,'Target personal card not found. Shared cards cannot be edited here.');
      return {statements:[s(`UPDATE cards SET ru=?,revision=revision+1,updated_at=unixepoch() WHERE id=?
        AND owner_profile_id=? AND scope='profile' AND revision=? AND deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM profile_members m JOIN profile_cards p ON p.profile_id=m.profile_id
          WHERE m.account_id=? AND p.card_id=cards.id AND m.profile_id=cards.owner_profile_id)`,[ru,key,row.owner_profile_id,expected,accountId]),this.guard()],
        result:{id:key,ru,revision:expected+1}};
    });
  }
}
