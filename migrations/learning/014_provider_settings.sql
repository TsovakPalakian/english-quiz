-- Isolated local draft only; no endpoints, credentials or adapter code stored.
CREATE TABLE qr_provider_configuration (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL CHECK(revision>0),
  selections_json TEXT NOT NULL CHECK(json_valid(selections_json)),
  pins_json TEXT NOT NULL CHECK(json_valid(pins_json))
);
CREATE TABLE qr_provider_changes (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  selections_json TEXT NOT NULL CHECK(json_valid(selections_json)),
  pins_json TEXT NOT NULL CHECK(json_valid(pins_json))
);
CREATE TRIGGER qr_provider_configuration_guard BEFORE UPDATE ON qr_provider_configuration
WHEN NEW.id<>OLD.id OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Invalid provider configuration revision'); END;
CREATE TRIGGER qr_provider_configuration_no_delete BEFORE DELETE ON qr_provider_configuration
BEGIN SELECT RAISE(ABORT,'Provider configuration cannot be deleted'); END;
CREATE TRIGGER qr_provider_changes_no_update BEFORE UPDATE ON qr_provider_changes
BEGIN SELECT RAISE(ABORT,'Provider changes are immutable'); END;
CREATE TRIGGER qr_provider_changes_no_delete BEFORE DELETE ON qr_provider_changes
BEGIN SELECT RAISE(ABORT,'Provider changes are append only'); END;
