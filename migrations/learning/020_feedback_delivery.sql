-- Isolated pilot only. Provider acceptance is not proof of mailbox delivery.
CREATE TABLE qr_feedback_delivery (
 feedback_id TEXT PRIMARY KEY REFERENCES qr_feedback(id),owner_id TEXT NOT NULL REFERENCES account_refs(id),
 consent_at INTEGER NOT NULL,policy_revision TEXT NOT NULL,recipient TEXT NOT NULL,
 created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','started','accepted','rejected','uncertain')),
 message_id TEXT,error_code TEXT,finished_at INTEGER
);
CREATE INDEX qr_feedback_delivery_deadline ON qr_feedback_delivery(state,deadline_at);
CREATE TRIGGER qr_feedback_delivery_immutable BEFORE UPDATE ON qr_feedback_delivery WHEN
 NEW.feedback_id<>OLD.feedback_id OR NEW.owner_id<>OLD.owner_id OR NEW.consent_at<>OLD.consent_at
 OR NEW.policy_revision<>OLD.policy_revision OR NEW.recipient<>OLD.recipient
 OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at
 OR NOT ((OLD.state='queued' AND NEW.state='started' AND NEW.message_id IS NULL AND NEW.error_code IS NULL AND NEW.finished_at IS NULL)
 OR (OLD.state='started' AND NEW.state='accepted' AND NEW.message_id IS NOT NULL AND NEW.error_code IS NULL AND NEW.finished_at IS NOT NULL)
 OR (OLD.state IN ('queued','started') AND NEW.state IN ('uncertain','rejected') AND NEW.message_id IS NULL AND NEW.error_code IS NOT NULL AND NEW.finished_at IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'Feedback delivery history is immutable'); END;
CREATE TRIGGER qr_feedback_delivery_no_delete BEFORE DELETE ON qr_feedback_delivery BEGIN SELECT RAISE(ABORT,'Feedback delivery history is immutable'); END;
