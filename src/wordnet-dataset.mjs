import {LanguageProviderError} from './language-providers.mjs';
import {WORDNET_FILES} from './wordnet-format.mjs';
const fail=()=>{throw new LanguageProviderError('invalid_wordnet_import');};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function openWordNetDataset({db,expectedDigest}={}){
  if(typeof db?.read!=='function'||!/^[a-f0-9]{64}$/.test(expectedDigest||''))fail();
  const [row]=await db.read('SELECT manifest_json,license_notice FROM wn_manifest WHERE id=1',[]);if(!row)fail();
  let manifest;try{manifest=JSON.parse(row.manifest_json);}catch{fail();}
  if(manifest.version!=='3.0'||manifest.sha256!==expectedDigest||!Number.isSafeInteger(manifest.records)||manifest.records<1||!row.license_notice.startsWith('WordNet Release 3.0')||!row.license_notice.includes('Princeton University'))fail();
  if(!manifest.files||Object.keys(manifest.files).length!==WORDNET_FILES.length||WORDNET_FILES.some(name=>!/^[a-f0-9]{64}$/.test(manifest.files[name]||'')))fail();
  if(await digest(JSON.stringify(Object.fromEntries(WORDNET_FILES.map(name=>[name,manifest.files[name]]))))!==expectedDigest||await digest(row.license_notice)!==manifest.files.LICENSE)fail();
  const [count]=await db.read('SELECT count(*) AS records FROM wn_records',[]);if(count?.records!==manifest.records)fail();
  return Object.freeze({version:'3.0',sha256:expectedDigest,licenseNotice:row.license_notice,
    async lookup(word,{signal,limit=8}={}){
      if(signal?.aborted)throw new LanguageProviderError('cancelled');
      if(typeof word!=='string'||!word.trim()||word.length>200||!Number.isSafeInteger(limit)||limit<1||limit>8)throw new LanguageProviderError('invalid_request');
      const rows=await db.read('SELECT word,sense_key,pos,definition,examples_json,forms_json FROM wn_records WHERE word=? ORDER BY sense_number,pos,sense_key LIMIT ?',[word.trim().toLowerCase().replaceAll('_',' '),limit]);
      if(signal?.aborted)throw new LanguageProviderError('cancelled');
      return rows.map(row=>({word:row.word,senseKey:row.sense_key,pos:row.pos,definition:row.definition,examples:JSON.parse(row.examples_json),forms:JSON.parse(row.forms_json)}));
    },
  });
}
