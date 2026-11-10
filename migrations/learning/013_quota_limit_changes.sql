-- Isolated local draft only. Keeps reservations and window identity unchanged.
ALTER TABLE qr_quota_policies ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE qr_quota_policies ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE qr_quota_policies ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE qr_quota_policies ADD COLUMN change_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE qr_quota_policies ADD COLUMN mutation_id TEXT;
CREATE TABLE qr_quota_limit_changes (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL REFERENCES qr_quota_policies(provider),
  revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  old_limit INTEGER NOT NULL,
  new_limit INTEGER NOT NULL,
  reason TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  UNIQUE(provider,revision)
);
DROP TRIGGER qr_quota_policy_no_update;
CREATE TRIGGER qr_quota_policy_update_guard BEFORE UPDATE ON qr_quota_policies
WHEN NEW.provider<>OLD.provider OR NEW.window_ms<>OLD.window_ms OR NEW.created_by<>OLD.created_by
  OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.request_limit=OLD.request_limit
  OR NEW.request_limit>1000000 OR length(NEW.updated_by)=0 OR length(trim(NEW.change_reason))=0
  OR length(NEW.change_reason)>500 OR NEW.updated_at<MAX(OLD.created_at,OLD.updated_at)
  OR NEW.mutation_id IS NULL OR length(NEW.mutation_id)<>36
BEGIN SELECT RAISE(ABORT,'Invalid quota policy revision'); END;
CREATE TRIGGER qr_quota_policy_audit AFTER UPDATE ON qr_quota_policies
BEGIN INSERT INTO qr_quota_limit_changes(mutation_id,provider,revision,actor_id,old_limit,new_limit,reason,changed_at)
  VALUES(NEW.mutation_id,NEW.provider,NEW.revision,NEW.updated_by,OLD.request_limit,NEW.request_limit,NEW.change_reason,NEW.updated_at); END;
CREATE TRIGGER qr_quota_changes_no_update BEFORE UPDATE ON qr_quota_limit_changes
BEGIN SELECT RAISE(ABORT,'Quota limit changes are immutable'); END;
CREATE TRIGGER qr_quota_changes_no_delete BEFORE DELETE ON qr_quota_limit_changes
BEGIN SELECT RAISE(ABORT,'Quota limit changes are append only'); END;
