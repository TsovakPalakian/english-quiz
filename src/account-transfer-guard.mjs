export function assertAccountTransferRunning(env){
  if(env.ACCOUNT_TRANSFER_FROZEN==='true')throw Object.assign(new Error('Account migration is in progress. Please try again shortly.'),{status:503,migrationFrozen:true});
}
