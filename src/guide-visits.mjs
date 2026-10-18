import {StudyError,statement as s} from './learning-study.mjs';

const namespace='guide-visits';
const key='v1';
const fail=(status,message)=>{throw new StudyError(status,message);};

function visitorId(raw){
  const text=String(raw||'').trim().slice(0,80);
  if(!/^[A-Za-z0-9._:-]{8,80}$/.test(text))fail(400,'Invalid visitor.');
  return text;
}

export class GuideVisits{
  constructor(db){this.db=db;}

  async #load(){
    const [row]=await this.db.read('SELECT value_json FROM catalog_documents WHERE namespace=? AND key=?',[namespace,key]);
    if(!row)return null;
    try{
      const value=JSON.parse(row.value_json);
      return {
        views:Number.isSafeInteger(value?.views)&&value.views>=0?value.views:0,
        visitors:value?.visitors&&typeof value.visitors==='object'&&!Array.isArray(value.visitors)?value.visitors:{},
        raw:row.value_json,
      };
    }catch{
      return {views:0,visitors:{},raw:row.value_json};
    }
  }

  statsOf(value){
    return {views:value?.views||0,uniques:Object.keys(value?.visitors||{}).length};
  }

  async stats(){
    return this.statsOf(await this.#load()||{views:0,visitors:{}});
  }

  async hit(rawVisitor,attempt=0){
    const id=visitorId(rawVisitor);
    const current=await this.#load();
    const now=Date.now();
    const base=current||{views:0,visitors:{}};
    const next={
      views:(base.views||0)+1,
      visitors:{...base.visitors,[id]:now},
    };
    const entries=Object.entries(next.visitors).sort((a,b)=>b[1]-a[1]).slice(0,5000);
    next.visitors=Object.fromEntries(entries);
    const payload=JSON.stringify({views:next.views,visitors:next.visitors});
    try{
      if(!current){
        await this.db.atomic([s('INSERT INTO catalog_documents(namespace,key,value_json) VALUES(?,?,?)',[namespace,key,payload])]);
      }else{
        await this.db.atomic([
          s('DROP TABLE IF EXISTS temp.guide_visit_guard'),
          s('CREATE TEMP TABLE guide_visit_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
          s('INSERT INTO guide_visit_guard SELECT EXISTS(SELECT 1 FROM catalog_documents WHERE namespace=? AND key=? AND value_json=?)',[namespace,key,current.raw]),
          s('UPDATE catalog_documents SET value_json=? WHERE namespace=? AND key=? AND value_json=?',[payload,namespace,key,current.raw]),
          s('INSERT INTO guide_visit_guard SELECT changes()=1'),
          s('DROP TABLE guide_visit_guard'),
        ]);
      }
    }catch(error){
      if(attempt<4&&(/UNIQUE|unique|PRIMARY|CHECK constraint|check constraint|guide_visit_guard/i.test(error.message||'')))return this.hit(rawVisitor,attempt+1);
      throw error;
    }
    return this.statsOf(next);
  }
}
