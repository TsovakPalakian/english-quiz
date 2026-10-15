import {invalid} from './errors.js';

export function encodeJson(value){
  try{const result=JSON.stringify(value);if(result!==undefined)return result;}catch{}
  throw invalid('DB_JSON','The value must be JSON serializable.');
}
export function decodeJson(value){
  if(typeof value!=='string')return value;
  try{return JSON.parse(value);}catch{throw invalid('DB_JSON','The stored value is not valid JSON.');}
}
export function encodeBoolean(value){
  if(typeof value!=='boolean')throw invalid('DB_BOOLEAN','Expected a boolean.');return value?1:0;
}
export function decodeBoolean(value){
  if([true,1,'1'].includes(value))return true;
  if([false,0,'0'].includes(value))return false;
  throw invalid('DB_BOOLEAN','Expected a boolean or an integer flag.');
}
export function timestamp(value=new Date()){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))throw invalid('DB_TIMESTAMP','Expected a valid timestamp.');
  return date.toISOString();
}
