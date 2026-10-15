export class DatabaseError extends Error {
  constructor(code,message,{status=503,retryable=false,mayHaveCommitted=false}={}){
    super(message);this.name='DatabaseError';this.code=code;this.status=status;
    this.retryable=retryable;this.mayHaveCommitted=mayHaveCommitted;
  }
}
export const invalid=(code,message)=>new DatabaseError(code,message,{status:400});

export function databaseError(error,{write=false}={}){
  if(error instanceof DatabaseError)return error;
  const chain=[];let item=error;
  for(let i=0;item&&i<5;i++){chain.push(item);item=item.cause||item.sourceError;}
  const codes=chain.map(item=>String(item.code||''));
  const has=pattern=>codes.some(code=>pattern.test(code));
  if(has(/^(40001|40P01|SQLITE_BUSY(?:_SNAPSHOT)?|SQLITE_LOCKED(?:_SHAREDCACHE)?)$/))return new DatabaseError('DB_RETRY_TRANSACTION','The database rolled back a concurrent operation. Retry shortly.',{retryable:true});
  if(has(/^(23505|SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY))$/))return new DatabaseError('DB_CONFLICT','A database record already exists.',{status:409});
  if(has(/^(23\w{3}|SQLITE_CONSTRAINT(?:_\w+)?)$/))return new DatabaseError('DB_CONSTRAINT','The operation violates a database constraint.',{status:409});
  if(has(/^(BLOCKED|SQLITE_READONLY(?:_\w+)?|TOO_MANY_REQUESTS_QUOTA_EXCEEDED)$/))return new DatabaseError('DB_QUOTA','Database access is blocked. Check provider quotas or access permissions.');
  if(has(/^(28\w{3}|UNAUTHORIZED|AUTH_FAILED)$/)||chain.some(item=>[401,403].includes(item.status)))return new DatabaseError('DB_AUTH','Database credentials were rejected.');
  const messages=chain.map(item=>String(item.message||''));
  const timeout=chain.some(item=>['TimeoutError','AbortError'].includes(item.name));
  const transient=timeout||has(/^(08\w{3}|57P0[123]|53300|SERVER_ERROR|HTTP_SERVER_ERROR)$/)
    ||chain.some(item=>[408,425,429,500,502,503,504].includes(item.status))
    ||messages.some(message=>/fetch failed|failed to fetch|network error|connection (?:reset|terminated)|timed? ?out|timeout|HTTP status (?:408|429|500|502|503|504)/i.test(message));
  if(transient)return new DatabaseError(write?'DB_COMMIT_UNKNOWN':timeout?'DB_TIMEOUT':'DB_UNAVAILABLE',write?'The database response was lost. Verify the operation before retrying.':'The database is temporarily unavailable.',{
    status:timeout?504:503,retryable:!write,mayHaveCommitted:write
  });
  if(write&&!has(/^(\w{5}|SQLITE_\w+)$/))return new DatabaseError('DB_COMMIT_UNKNOWN','The database outcome is unknown. Verify the operation before retrying.',{mayHaveCommitted:true});
  return new DatabaseError('DB_QUERY_FAILED','The database operation failed.',{status:500});
}
