import {StudyError} from './turso-study.mjs';
export function validateColorDocument(value,text){
  if(!value||!Array.isArray(value.runs)||value.runs.length>2000||Object.keys(value).some(key=>key!=='runs'))throw new StudyError(400,'Invalid text formatting.');
  for(const run of value.runs)if(!run||typeof run.text!=='string'||Object.keys(run).some(key=>!['text','marks'].includes(key))||Object.keys(run.marks||{}).some(key=>key!=='color')||run.marks?.color&&!/^#[a-f0-9]{6}$/i.test(run.marks.color))throw new StudyError(400,'Invalid text color.');
  if(value.runs.map(run=>run.text).join('')!==text)throw new StudyError(400,'Text formatting does not match its content.');
  return value;
}
