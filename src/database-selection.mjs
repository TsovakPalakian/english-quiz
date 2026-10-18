import {StudyError} from './learning-study.mjs';
import {assertAccountTransferRunning} from './account-transfer-guard.mjs';

export const DATABASE_SELECTION_KEY='system/database-selection-v1.json';
export const DATABASE_CONTROL=Symbol('unscoped-database-control-bucket');
// D1 is the only database. Revision 3 was the last live selection; open tabs and chat objects keep that epoch.
export const ACTIVE_DATABASE=Object.freeze({provider:'d1',revision:3,scope:'site'});

function checked(value){
  if(!value||value.provider!=='d1'||!Number.isSafeInteger(value.revision)||value.revision<0||value.scope!=='site')throw new StudyError(503,'Global database configuration is invalid. No fallback was selected.');
  if(value.accountTransferFrozen!==undefined&&typeof value.accountTransferFrozen!=='boolean')throw new StudyError(503,'Invalid account migration state.');
  assertAccountTransferRunning({ACCOUNT_TRANSFER_FROZEN:value.accountTransferFrozen?'true':'false'});
  return {provider:'d1',revision:value.revision,scope:'site',...(value.updatedAt?{updatedAt:value.updatedAt}:{}),...(value.updatedBy?{updatedBy:value.updatedBy}:{})};
}

// Used only by one-off account transfer export fencing; normal requests never read R2.
export async function readDatabaseSelection(bucket,{defaultProvider='d1'}={}){
  if(defaultProvider!=='d1')throw new StudyError(503,'Global database configuration is invalid. No fallback was selected.');
  if(!bucket?.get)throw new StudyError(503,'Global database configuration storage is unavailable.');
  try{
    const object=await bucket.get(DATABASE_SELECTION_KEY);
    if(!object)return {selection:ACTIVE_DATABASE,etag:null};
    return {selection:checked(await object.json()),etag:object.etag};
  }catch(error){if(error instanceof StudyError||error.migrationFrozen)throw error;throw new StudyError(503,'Global database configuration could not be read. No fallback was selected.');}
}
