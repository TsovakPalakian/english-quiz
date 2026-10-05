// Migration policy only, not authorization. Never reads/writes a remote service.
import {createHash} from 'node:crypto';
const login='TsovakDev',validId=value=>typeof value==='string'&&/^[a-f0-9]{16,64}$/.test(value);
const profileId=value=>'profile_'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pairFiles=new Set(['study','settings','added','songs','texts'].map(name=>'pair/tsovak-'+name+'.json'));
export function retainedScope(rows,sourceKeys,prior=null){
  if(!Array.isArray(rows)||rows.some(row=>!row||!validId(row.id)||typeof row.login!=='string')||new Set(rows.map(row=>row.id)).size!==rows.length)
    throw new Error('Invalid account identity snapshot.');
  const matches=rows.filter(row=>row.login.toLowerCase()===login.toLowerCase());
  if(matches.length!==1||matches[0].login!==login||!matches[0].active||matches[0].is_personal_data_revoked)
    throw new Error('Exactly one active, non-revoked TsovakDev is required. No account will be recreated.');
  const account=matches[0],keys=new Set(sourceKeys),paired=keys.has('pair/tsovak-study.json');
  if(!paired&&[...pairFiles].some(key=>keys.has(key)))throw new Error('Incomplete former-pair snapshot. Refusing to drop shared study data.');
  let anchor;
  if(prior){
    const names=['version','retainedLogin','retainedAccountId','profileId','pairedSource','sourcePairAccountIds'];
    if(Object.keys(prior).some(key=>!names.includes(key))||prior.version!==1||prior.retainedLogin!==login||prior.retainedAccountId!==account.id
      ||typeof prior.pairedSource!=='boolean'||!Array.isArray(prior.sourcePairAccountIds))throw new Error('Invalid retained scope anchor.');
    const ids=prior.sourcePairAccountIds;
    if(ids.some(id=>!validId(id))||new Set(ids).size!==ids.length||!ids.includes(account.id)||ids.length!==(prior.pairedSource?2:1))throw new Error('Invalid retained profile identity.');
    const expected=profileId(prior.pairedSource?['pair',[...ids].sort()]:['account',account.id]);
    if(prior.profileId!==expected||prior.pairedSource!==paired)throw new Error('Scope/source changed; refusing to replace the retained profile.');
    const archivedPair=rows.filter(row=>row.login==='Tsovak');
    if(paired&&archivedPair.length&&!(archivedPair.length===1&&ids.includes(archivedPair[0].id)))throw new Error('Former pair identity differs from scope anchor.');
    anchor={...prior,sourcePairAccountIds:[...ids]};
  }else{
    const twins=rows.filter(row=>row.login==='Tsovak');
    if(paired&&twins.length!==1)throw new Error('Use the saved scope anchor to preserve the former pair ID when Tsovak is absent.');
    const ids=paired?[account.id,twins[0].id]:[account.id];
    anchor={version:1,retainedLogin:login,retainedAccountId:account.id,
      profileId:profileId(paired?['pair',[...ids].sort()]:['account',account.id]),pairedSource:paired,sourcePairAccountIds:ids};
  }
  const includesSource=key=>['shared/lessons.json','shared/card-edits.json','shared/card-quizzes.json'].includes(key)
    ||paired&&pairFiles.has(key)||['account-state','added','songs','texts'].some(name=>key===account.id+'/'+name+'.json');
  // Old twin-owned audio is retained only if referenced by the retained pair's
  // song library. This never imports the twin's individual state or membership.
  return {account,anchor,includesSource,mediaAccountIds:[account.id,...anchor.sourcePairAccountIds.filter(id=>id!==account.id)],
    excludedAccounts:rows.length-1};
}
