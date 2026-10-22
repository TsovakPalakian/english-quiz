// WordNet 3.0 ASCII files, not heuristic dictionary extraction.
const fail=()=>{throw Error('Invalid WordNet 3.0 source.');};
const kinds={noun:'n',verb:'v',adj:'a',adv:'r'},sensePositions={1:'n',2:'v',3:'a',4:'r',5:'s'};
export const WORDNET_FILES=Object.freeze(['LICENSE','dict/index.sense',...Object.keys(kinds).flatMap(kind=>['dict/data.'+kind,'dict/'+kind+'.exc'])]);
function text(bytes){if(!(bytes instanceof Uint8Array)||bytes.some(byte=>byte>127||byte===0))fail();return new TextDecoder().decode(bytes);}
const lemma=value=>value.replace(/\((?:a|p|ip)\)$/,'').replaceAll('_',' ').toLowerCase();
function gloss(value){
  const parts=value.trim().split(/;\s*(?=")/),definition=parts[0],examples=parts.slice(1);
  if(!definition||examples.some(part=>!/^".*"$/.test(part)))return {definition:value.trim(),examples:[]};
  return {definition,examples:examples.map(part=>part.slice(1,-1))};
}
export function parseWordNetSource(files){
  if(!files||Object.keys(files).length!==WORDNET_FILES.length||WORDNET_FILES.some(name=>!(files[name] instanceof Uint8Array)))fail();
  const licenseNotice=text(files.LICENSE);if(!licenseNotice.startsWith('WordNet Release 3.0')||!licenseNotice.includes('Princeton University')||!licenseNotice.includes('disclaimer'))fail();
  const synsets=new Map(),forms=new Map();
  for(const [kind,position] of Object.entries(kinds)){
    const data=text(files['dict/data.'+kind]);let offset=0;
    for(const line of data.split('\n')){
      const at=offset;offset+=line.length+1;if(!line||line.startsWith('  '))continue;
      const pipe=line.indexOf('|'),fields=line.slice(0,pipe).trim().split(/\s+/),count=parseInt(fields[3],16);
      if(pipe<0||!/^\d{8}$/.test(fields[0])||Number(fields[0])!==at||!/^\d{2}$/.test(fields[1])||!(fields[2]===position||position==='a'&&fields[2]==='s')||!/^[0-9a-f]{2}$/i.test(fields[3])||count<1)fail();
      const words=new Map();let cursor=4;
      for(let i=0;i<count;i++){if(!fields[cursor]||!/^[0-9a-f]{1,2}$/i.test(fields[cursor+1]||''))fail();words.set(lemma(fields[cursor])+':'+parseInt(fields[cursor+1],16),true);cursor+=2;}
      const pointers=fields[cursor++];if(!/^\d{3}$/.test(pointers||''))fail();
      for(let i=0;i<Number(pointers);i++){if(!fields[cursor]||!/^\d{8}$/.test(fields[cursor+1]||'')||!['n','v','a','s','r'].includes(fields[cursor+2])||!/^[0-9a-f]{4}$/i.test(fields[cursor+3]||''))fail();cursor+=4;}
      if(position==='v'){const frames=fields[cursor++];if(!/^\d{2}$/.test(frames||''))fail();for(let i=0;i<Number(frames);i++){if(fields[cursor]!=='+'||!/^\d{2}$/.test(fields[cursor+1]||'')||!/^[0-9a-f]{2}$/i.test(fields[cursor+2]||''))fail();cursor+=3;}}
      const parsed=gloss(line.slice(pipe+1));if(cursor!==fields.length||!parsed.definition)fail();
      synsets.set(position+':'+fields[0],{pos:fields[2],lexFile:Number(fields[1]),words,...parsed});
    }
    for(const line of text(files['dict/'+kind+'.exc']).split('\n')){if(!line.trim())continue;const [form,...bases]=line.trim().split(/\s+/);if(!bases.length)fail();
      for(const base of bases){const key=position+':'+lemma(base);if(!forms.has(key))forms.set(key,new Set());forms.get(key).add(lemma(form));}
    }
  }
  const index=text(files['dict/index.sense']);
  function* records(){
    const seen=new Set();
    for(const line of index.split('\n')){
      if(!line)continue;
      const fields=line.split(' '),match=/^([^\s%]+)%([1-5]):(\d{2}):(\d{2}):([^:]*):([^:]*)$/.exec(fields[0]||'');
      if(fields.length!==4||!match||!/^\d{8}$/.test(fields[1])||!/^\d+$/.test(fields[2])||Number(fields[2])<1||!/^\d+$/.test(fields[3])||seen.has(fields[0]))fail();
      const pos=sensePositions[match[2]],filePos=pos==='s'?'a':pos,word=lemma(match[1]),synset=synsets.get(filePos+':'+fields[1]);
      if(!synset||synset.pos!==pos||synset.lexFile!==Number(match[3])||!synset.words.has(word+':'+Number(match[4])))fail();
      seen.add(fields[0]);
      yield {word,senseKey:fields[0],pos,definition:synset.definition,examples:synset.examples,forms:[...(forms.get(filePos+':'+word)||[])].sort(),senseNumber:Number(fields[2])};
    }
  }
  return {licenseNotice,synsetCount:synsets.size,records};
}
