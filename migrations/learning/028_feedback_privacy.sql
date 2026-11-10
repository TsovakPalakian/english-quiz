-- Draft only; retention is explicitly configured by the trusted composition.
ALTER TABLE qr_feedback ADD COLUMN deleted_at INTEGER;
ALTER TABLE qr_feedback ADD COLUMN expires_at INTEGER;
ALTER TABLE qr_feedback ADD COLUMN privacy_consent_at INTEGER;
DROP TRIGGER qr_feedback_no_update;
CREATE TRIGGER qr_feedback_no_update BEFORE UPDATE ON qr_feedback WHEN
 NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.card_id IS NOT OLD.card_id
 OR NEW.sense_id IS NOT OLD.sense_id OR NEW.version_id IS NOT OLD.version_id OR NEW.category IS NOT OLD.category
 OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
 OR NEW.privacy_consent_at IS NOT OLD.privacy_consent_at OR OLD.deleted_at IS NOT NULL
 OR NEW.deleted_at IS NULL OR NEW.description<>'' OR NEW.attachments_json<>'[]'
BEGIN SELECT RAISE(ABORT,'Only feedback privacy erasure is allowed'); END;
CREATE INDEX qr_feedback_expiration ON qr_feedback(expires_at) WHERE deleted_at IS NULL;
CREATE TABLE qr_feedback_purge (
 media_id TEXT PRIMARY KEY REFERENCES qr_media(id),requested_at INTEGER NOT NULL,
 finished_at INTEGER,error_code TEXT
);
DROP TRIGGER qr_media_immutable;
CREATE TRIGGER qr_media_immutable BEFORE UPDATE ON qr_media WHEN
 NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.purpose IS NOT OLD.purpose
 OR NEW.digest IS NOT OLD.digest OR NEW.mime IS NOT OLD.mime OR NEW.bytes IS NOT OLD.bytes OR NEW.created_at IS NOT OLD.created_at
 OR NOT (
   (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND NEW.name=OLD.name
    AND NEW.descriptor_json=OLD.descriptor_json AND NEW.source_json=OLD.source_json)
   OR (OLD.purpose='feedback' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS OLD.deleted_at
    AND NEW.name='Deleted attachment' AND NEW.descriptor_json='{}' AND NEW.source_json='{}')
 )
BEGIN SELECT RAISE(ABORT,'Media is immutable except private feedback erasure'); END;
CREATE TABLE qr_author_visibility (
 version_id TEXT PRIMARY KEY REFERENCES qr_versions(id),author_id TEXT NOT NULL REFERENCES account_refs(id),
 public_name INTEGER NOT NULL CHECK(public_name IN (0,1)),public_group INTEGER NOT NULL CHECK(public_group IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>0),changed_at INTEGER NOT NULL
);
CREATE TRIGGER qr_author_visibility_identity BEFORE UPDATE ON qr_author_visibility
WHEN NEW.version_id<>OLD.version_id OR NEW.author_id<>OLD.author_id OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Author visibility identity is immutable'); END;
CREATE TRIGGER qr_author_visibility_no_delete BEFORE DELETE ON qr_author_visibility
BEGIN SELECT RAISE(ABORT,'Withdraw public attribution instead'); END;
