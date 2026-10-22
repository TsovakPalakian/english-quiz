import {StudyError,statement as s} from './learning-study.mjs';
import {exactFields,reviewText} from './quiz-review-content.mjs';
import {kitTeacher} from './learning-kits.mjs';
const fail=(status,message)=>{throw new StudyError(status,message);};
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const namespaces=new Set(['LESSON_DATA','IRREGULAR','GRAMMAR','TENSE_BANK','SPEAKOUT','EVERYDAY','STATE','PERSONAL']);
const normalized=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export class KitLegacyMapping{
  constructor(kits){this.kits=kits;this.review=kits.review;this.db=kits.db;}
  async resolve(actor,body){
    kitTeacher(actor);exactFields(body,['namespace','key']);if(!namespaces.has(body.namespace))fail(400,'Choose a known legacy namespace.');
    const key=reviewText(body.key,500),rows=await this.db.read("SELECT DISTINCT target_id FROM legacy_ids WHERE entity_kind='card' AND source_namespace=? AND source_key=? ORDER BY target_id LIMIT 51",[body.namespace,key]);
    if(rows.length>50)fail(409,'Legacy mapping requires a narrower source key.');const candidates=[];
    for(const row of rows){
      const cardId=Number(row.target_id);if(!Number.isSafeInteger(cardId)||cardId<1)continue;
      try{await this.kits.card(actor,cardId);const [card]=await this.db.read('SELECT en FROM cards WHERE id=?',[cardId]);candidates.push({cardId,word:card.en,senses:await this.kits.senses(actor,cardId)});}catch(error){if(![403,404].includes(error.status))throw error;}
    }
    return {candidates,selectionRequired:true,automaticallyLinked:false};
  }
  async candidates(actor,cardId){
    kitTeacher(actor);await this.kits.card(actor,cardId);const [card]=await this.db.read('SELECT en FROM cards WHERE id=?',[cardId]);
    const rows=await this.db.read('SELECT id,en,part_of_speech,translation,definition FROM qr_senses WHERE lower(trim(en))=lower(trim(?)) ORDER BY id LIMIT 101',[card.en]);
    return {word:card.en,candidates:rows.slice(0,100),truncated:rows.length>100,linked:(await this.kits.senses(actor,cardId)).map(row=>row.id),selectionRequired:true};
  }
  async link(actor,body){
    kitTeacher(actor);exactFields(body,['mutationId','cardId','senseId','expectedSenseIds','reason']);
    if(!uuid(body.senseId)||!Array.isArray(body.expectedSenseIds)||body.expectedSenseIds.length>100||body.expectedSenseIds.some(id=>!uuid(id))||new Set(body.expectedSenseIds).size!==body.expectedSenseIds.length)fail(400,'Use the current explicit meaning selection.');
    const reason=reviewText(body.reason,1000);await this.kits.card(actor,body.cardId);
    return this.review.mutation(actor,body,['explicit-meaning-link',body.cardId],async()=>{
      const [card]=await this.db.read('SELECT en FROM cards WHERE id=?',[body.cardId]),[sense]=await this.db.read('SELECT en FROM qr_senses WHERE id=?',[body.senseId]);
      if(!sense||normalized(card.en)!==normalized(sense.en))fail(400,'The meaning must explicitly match this word.');
      const previous=(await this.kits.senses(actor,body.cardId)).map(row=>row.id).sort();
      if(JSON.stringify(previous)!==JSON.stringify([...body.expectedSenseIds].sort()))fail(409,'Card meanings changed. Reload before linking.');
      if(previous.includes(body.senseId))return {statements:[],result:{cardId:body.cardId,senseId:body.senseId,alreadyLinked:true}};
      return {statements:[this.kits.cardGuard(actor,body.cardId),
        s('INSERT INTO mutation_guard SELECT count(*)=? FROM qr_card_senses WHERE card_id=?',[previous.length,body.cardId]),
        ...previous.map(id=>s('INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_card_senses WHERE card_id=? AND sense_id=?)',[body.cardId,id])),
        s('INSERT INTO qr_card_senses(card_id,sense_id) VALUES(?,?)',[body.cardId,body.senseId]),this.review.guard(),
        s('INSERT INTO qr_card_sense_events(id,card_id,sense_id,actor_id,previous_json,reason,created_at) VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),body.cardId,body.senseId,actor.id,JSON.stringify(previous),reason,Date.now()])
      ],result:{cardId:body.cardId,senseId:body.senseId,alreadyLinked:false}};
    });
  }
}
