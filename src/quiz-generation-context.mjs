import {statement as s} from './learning-study.mjs';
import {GenerationIssue} from './quiz-generation.mjs';
import {reviewText} from './quiz-review-content.mjs';
const fail=code=>{throw new GenerationIssue(code,false);};
const keys=['en','translation','definition','part_of_speech'];
const norm=text=>text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,' ').trim();
const meaning=row=>Object.fromEntries(keys.map(key=>[key,reviewText(row[key],2000)]));
const origin=job=>({groupId:job.group_id,lessonId:job.lesson_id,cardId:job.card_id,senseId:job.sense_id});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// References are supplied by trusted source mapping, never guessed from the first sense.
export class QuizGenerationContext{
  constructor({review,dataset=null,resolveReference=null,media=null,resolveAudio=null}={}){
    if(!review?.db||dataset!==null&&(dataset.version!=='3.0'||!/^[a-f0-9]{64}$/.test(dataset.sha256)||typeof dataset.lookup!=='function'||typeof resolveReference!=='function')||resolveAudio!==null&&(typeof resolveAudio!=='function'||typeof media?.available!=='function'||typeof media?.row!=='function'))throw Error('Invalid generation context dependencies.');
    Object.assign(this,{review,db:review.db,dataset,resolveReference,media,resolveAudio});
  }
  async audioRow(id){try{return await this.media.row(id);}catch(error){if(error.status===404)fail('audio_unavailable');throw error;}}
  async capture(actor,job,{signal}={}){
    const ctx=origin(job);await this.review.checkContext(actor,ctx);
    const [target]=await this.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[ctx.senseId]);
    const selected=meaning(target);if(keys.some(key=>!norm(selected[key])))fail('context_required');
    const words=[{...ctx,meaning:selected}],seen=keys.slice(0,3).map(key=>new Set([norm(selected[key])])),
      rows=await this.db.read(`SELECT DISTINCT c.id AS card_id,m.id AS sense_id,m.en,m.translation,m.definition,m.part_of_speech
        FROM lesson_blocks b JOIN cards c ON c.id=b.card_id JOIN qr_card_senses cs ON cs.card_id=c.id JOIN qr_senses m ON m.id=cs.sense_id
        WHERE b.lesson_id=? AND b.type IN ('word','wordcard') AND b.deleted_at IS NULL AND c.deleted_at IS NULL AND c.scope='shared'
        AND c.id<>? AND (SELECT COUNT(*) FROM qr_card_senses WHERE card_id=c.id)=1 ORDER BY c.id,m.id LIMIT 100`,[ctx.lessonId,ctx.cardId]);
    for(const row of rows){const next=meaning(row),values=keys.slice(0,3).map(key=>norm(next[key]));if(values.some((value,index)=>!value||seen[index].has(value)))continue;
      const item={...ctx,cardId:row.card_id,senseId:row.sense_id,meaning:next};await this.review.checkContext(actor,item);words.push(item);values.forEach((value,index)=>seen[index].add(value));if(words.length===5)break;
    }
    let dictionary=null,audio=null;
    if(this.dataset){const referenceId=await this.resolveReference(actor,ctx,{signal});if(referenceId!==null){
      const entries=await this.dataset.lookup(selected.en,{signal,limit:8}),entry=entries.find(row=>row.senseKey===referenceId);
      const positions={n:'noun',v:'verb',a:'adjective',s:'adjective',r:'adverb'};
      if(!entry||norm(entry.word)!==norm(selected.en)||positions[entry.pos]!==selected.part_of_speech.toLowerCase()||norm(entry.definition)!==norm(selected.definition))fail('dictionary_mismatch');
      dictionary={referenceId,datasetVersion:this.dataset.version,digest:this.dataset.sha256,definition:entry.definition,examples:entry.examples.slice(0,5).map(text=>reviewText(text,2000))};
    }}
    if(job.type==='Listen'&&this.resolveAudio){const id=await this.resolveAudio(actor,ctx,{signal});if(id!==null){const asset=await this.audioRow(id),source=JSON.parse(asset.source_json);
      if(asset.purpose!=='quiz'||source.kind!=='tts'||source.text!==selected.en||!await this.media.available('Listen',{items:[{mediaId:id}]}))fail('audio_unavailable');audio={id,digest:asset.digest};
    }}
    if(signal?.aborted)fail('cancelled');return {version:'quiz-context-v1',meaning:selected,words,dictionary,audio};
  }
  async load(actor,job,{signal}={}){
    const [stored]=await this.db.read('SELECT snapshot_json FROM qr_generation_contexts WHERE job_id=? AND cycle=?',[job.id,job.cycle]);
    if(stored){const snapshot=JSON.parse(stored.snapshot_json);await this.assertCurrent(actor,job,snapshot,{signal});return snapshot;}
    if(job.candidate_json)fail('source_changed');
    const snapshot=await this.capture(actor,job,{signal});
    await this.db.atomic([s('DROP TABLE IF EXISTS temp.mutation_guard'),s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),
      ...this.guards(actor,snapshot),
      s(`INSERT INTO qr_generation_contexts(job_id,cycle,snapshot_json) SELECT id,cycle,? FROM qr_generation_jobs
        WHERE id=? AND revision=? AND state='running' AND lease_token=?`,[JSON.stringify(snapshot),job.id,job.revision,job.lease_token]),this.review.guard(),s('DROP TABLE mutation_guard')]);
    return snapshot;
  }
  async assertCurrent(actor,job,snapshot,{signal}={}){
    if(snapshot?.version!=='quiz-context-v1'||!Array.isArray(snapshot.words)||!snapshot.words.length||snapshot.words.length>5||!same(snapshot.meaning,snapshot.words[0].meaning)||!same(origin(job),Object.fromEntries(Object.keys(origin(job)).map(key=>[key,snapshot.words[0][key]]))))fail('source_changed');
    for(const word of snapshot.words){if(word.groupId!==job.group_id||word.lessonId!==job.lesson_id)fail('source_changed');await this.review.checkContext(actor,word);const [current]=await this.db.read('SELECT en,translation,definition,part_of_speech FROM qr_senses WHERE id=?',[word.senseId]);if(!current||!same(meaning(current),word.meaning))fail('source_changed');}
    if(snapshot.dictionary&&(!this.dataset||this.dataset.sha256!==snapshot.dictionary.digest||await this.resolveReference(actor,origin(job),{signal})!==snapshot.dictionary.referenceId))fail('source_changed');
    if(snapshot.audio){if(!this.media||!await this.media.available('Listen',{items:[{mediaId:snapshot.audio.id}]}))fail('audio_unavailable');const asset=await this.audioRow(snapshot.audio.id);if(asset.digest!==snapshot.audio.digest)fail('source_changed');}
    if(signal?.aborted)fail('cancelled');
  }
  guards(actor,snapshot){return snapshot.words.flatMap(word=>[this.review.accessGuard(actor,word),s(`INSERT INTO mutation_guard SELECT EXISTS(SELECT 1 FROM qr_senses WHERE id=? AND en=? AND translation=? AND definition=? AND part_of_speech=?)`,[word.senseId,...keys.map(key=>word.meaning[key])])]);}
  async history(actor,id){const [job]=await this.db.read('SELECT * FROM qr_generation_jobs WHERE id=?',[id]);if(!job)fail('context_required');await this.review.checkContext(actor,origin(job));if(!['ADMIN','DEVELOPER'].includes(actor.role))fail('context_required');return this.db.read('SELECT cycle,snapshot_json FROM qr_generation_contexts WHERE job_id=? ORDER BY cycle',[id]);}
}
