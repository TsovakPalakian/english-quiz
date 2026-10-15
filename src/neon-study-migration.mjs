import {neonStudyHelpers,studyTracking} from './neon-study-helpers.mjs';
import {neonStudyTables,neonStudyIndexes} from './neon-study-schema.mjs';

export const NEON_STUDY_VERSION=1;
export function studyNamespace(namespace){
  if(namespace!=='english_study'&&!/^english_study_check_[a-f0-9]{16}$/.test(namespace))throw Error('Invalid study namespace');
  return namespace;
}
// Additive: the original account/native foundation schema and all its rows stay intact.
export const neonStudyMigration=[
  ...neonStudyHelpers,
  ...neonStudyTables.map(table=>table.ddl),
  ...neonStudyIndexes,
  ...neonStudyTables.flatMap(table=>studyTracking('english_study.'+table.name,table.identity)),
  'CREATE OR REPLACE TRIGGER chat_notice_outbox AFTER INSERT ON english_study.chat_messages FOR EACH ROW EXECUTE FUNCTION english_study.learning_notice()',
  'CREATE TABLE IF NOT EXISTS english_study.runtime_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
  'INSERT INTO english_study.runtime_migrations(version) VALUES(1) ON CONFLICT DO NOTHING'
];
export function studyMigrationFor(namespace){return neonStudyMigration.map(sql=>sql.replaceAll('english_study',studyNamespace(namespace)));}
