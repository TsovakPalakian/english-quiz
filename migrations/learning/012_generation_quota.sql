-- Isolated local draft only. Never applied by production startup.
CREATE TABLE qr_quota_policies (
  provider TEXT PRIMARY KEY NOT NULL,
  window_ms INTEGER NOT NULL CHECK(window_ms>0),
  request_limit INTEGER NOT NULL CHECK(request_limit>0),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE qr_quota_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL REFERENCES qr_quota_policies(provider),
  window_start INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','started','released')),
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  created_at INTEGER NOT NULL,
  changed_at INTEGER NOT NULL CHECK(changed_at>=created_at)
);
CREATE INDEX qr_quota_window ON qr_quota_reservations(provider,window_start,state);
CREATE TRIGGER qr_quota_policy_no_update BEFORE UPDATE ON qr_quota_policies
BEGIN SELECT RAISE(ABORT,'Quota policies are immutable in the local pilot'); END;
CREATE TRIGGER qr_quota_policy_no_delete BEFORE DELETE ON qr_quota_policies
BEGIN SELECT RAISE(ABORT,'Quota policies are immutable in the local pilot'); END;
CREATE TRIGGER qr_quota_reservation_no_delete BEFORE DELETE ON qr_quota_reservations
BEGIN SELECT RAISE(ABORT,'Quota reservations are append only'); END;
CREATE TRIGGER qr_quota_reservation_transition BEFORE UPDATE ON qr_quota_reservations
WHEN OLD.state<>'reserved' OR NEW.state NOT IN ('started','released') OR NEW.id<>OLD.id
  OR NEW.provider<>OLD.provider OR NEW.window_start<>OLD.window_start
  OR NEW.source_json<>OLD.source_json OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'Quota reservation is immutable'); END;
