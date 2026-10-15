// Compatibility views keep the account handler's integer flags and epoch dates.
// The underlying tables retain native PostgreSQL booleans and timestamps.
const common=['id','login','email','name','password_salt','password_hash','password_iterations'];
export const authColumns={
  users:[...common,'role','is_personal_data_revoked','revoked_at','hidden','active','created_at'],
  registrations:[...common,'status','role','user_id','created_at','decided_at'],
  account_changes:['id','user_id','login','email','name','from_login','from_email','from_name','role','status','created_at','decided_at']
};
const flags=new Set(['is_personal_data_revoked','hidden','active']);
const dates=new Set(['created_at','revoked_at','decided_at']);
function readColumn(column){
  if(flags.has(column))return `${column}::integer AS ${column}`;
  if(dates.has(column))return `EXTRACT(EPOCH FROM ${column})::bigint AS ${column}`;
  return column;
}
function writeColumn(table,column){
  const value=`NEW.${column}`;
  if(flags.has(column))return `COALESCE(${value},${column==='active'?1:0})<>0`;
  if(dates.has(column))return column==='created_at'?`COALESCE(to_timestamp(${value}),now())`:`to_timestamp(NULLIF(${value},0))`;
  if(column==='user_id'&&table==='registrations')return `NULLIF(${value},'')`;
  if(['name','from_name'].includes(column))return `COALESCE(${value},'')`;
  if(column==='role')return `COALESCE(${value},'USER')`;
  return value;
}
export const neonAuthSchema=[
  'CREATE SCHEMA IF NOT EXISTS english_auth',
  'REVOKE ALL ON SCHEMA english_auth FROM PUBLIC',
  ...Object.entries(authColumns).flatMap(([table,columns])=>[
    `CREATE OR REPLACE VIEW english_auth.${table} AS SELECT ${columns.map(readColumn).join(',')} FROM english_app.${table}`,
    `CREATE OR REPLACE FUNCTION english_auth.write_${table}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,english_app,english_auth AS $auth$
    BEGIN
      IF TG_OP='DELETE' THEN
        ${table==='users'?`DELETE FROM english_app.sessions WHERE user_id=OLD.id; DELETE FROM english_app.user_profiles WHERE user_id=OLD.id;`:''}
        DELETE FROM english_app.${table} WHERE id=OLD.id;
        RETURN OLD;
      ELSIF TG_OP='INSERT' THEN
        INSERT INTO english_app.${table}(${columns.join(',')}) VALUES(${columns.map(column=>writeColumn(table,column)).join(',')});
      ELSE
        UPDATE english_app.${table} SET ${columns.map(column=>`${column}=${writeColumn(table,column)}`).join(',')} WHERE id=OLD.id;
      END IF;
      ${table==='users'?'INSERT INTO english_app.account_refs(id) VALUES(NEW.id) ON CONFLICT(id) DO NOTHING;':''}
      RETURN NEW;
    END $auth$`,
    `DO $auth$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='english_auth.${table}'::regclass AND tgname='write_account' AND NOT tgisinternal) THEN CREATE TRIGGER write_account INSTEAD OF INSERT OR UPDATE OR DELETE ON english_auth.${table} FOR EACH ROW EXECUTE FUNCTION english_auth.write_${table}(); END IF; END $auth$`
  ]),
  'INSERT INTO english_app.schema_migrations(version) VALUES(3) ON CONFLICT(version) DO NOTHING'
];
