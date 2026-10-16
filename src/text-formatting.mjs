import {StudyError} from './learning-study.mjs';
export function validateColorDocument(value,text,full=false){
  if(!value||!Array.isArray(value.runs)||value.runs.length>2000||Object.keys(value).some(key=>key!=='runs'))throw new StudyError(400,'Invalid text formatting.');
  for(const run of value.runs){
    const marks=run?.marks||{},allowed=full?['color','bold','italic','underline','strike','size','family']:['color'];
    if(!run||typeof run.text!=='string'||Object.keys(run).some(key=>!['text','marks'].includes(key))||typeof marks!=='object'||Array.isArray(marks)||Object.keys(marks).some(key=>!allowed.includes(key))||marks.color&&!/^#[a-f0-9]{6}$/i.test(marks.color))throw new StudyError(400,'Invalid text color.');
    if(full&&(['bold','italic','underline','strike'].some(key=>marks[key]!=null&&typeof marks[key]!=='boolean')||marks.size!=null&&(!Number.isFinite(marks.size)||marks.size<10||marks.size>96)||marks.family!=null&&!['serif','sans','mono','georgia','verdana','palatino','trebuchet','courier'].includes(marks.family)))throw new StudyError(400,'Invalid text formatting.');
  }
  if(value.runs.map(run=>run.text).join('')!==text)throw new StudyError(400,'Text formatting does not match its content.');
  return value;
}
