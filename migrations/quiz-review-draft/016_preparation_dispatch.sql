-- Local opt-in only. Source saves never invoke a network/model from these triggers.
CREATE TABLE qr_dispatch_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),revision INTEGER NOT NULL CHECK(revision>0));
INSERT INTO qr_dispatch_settings VALUES(1,0,1);
CREATE TABLE qr_dispatch_setting_events(revision INTEGER PRIMARY KEY,actor_id TEXT NOT NULL,enabled INTEGER NOT NULL,reason TEXT NOT NULL,changed_at INTEGER NOT NULL);
CREATE TABLE qr_preparation_outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),card_id INTEGER NOT NULL REFERENCES cards(id),
  event_revision INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','retry','waiting','done','attention','ignored')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),issue TEXT NOT NULL DEFAULT '',
  lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(lesson_id,card_id)
);
CREATE INDEX qr_dispatch_due ON qr_preparation_outbox(state,next_at,lease_until);
CREATE TABLE qr_dispatch_events(id INTEGER PRIMARY KEY AUTOINCREMENT,outbox_id INTEGER NOT NULL REFERENCES qr_preparation_outbox(id),revision INTEGER NOT NULL,state TEXT NOT NULL,issue TEXT NOT NULL,changed_at INTEGER NOT NULL DEFAULT(unixepoch()*1000),UNIQUE(outbox_id,revision));
CREATE TRIGGER qr_dispatch_created AFTER INSERT ON qr_preparation_outbox BEGIN
  INSERT INTO qr_dispatch_events(outbox_id,revision,state,issue) VALUES(NEW.id,NEW.revision,NEW.state,NEW.issue);
END;
CREATE TRIGGER qr_dispatch_updated AFTER UPDATE ON qr_preparation_outbox BEGIN
  INSERT INTO qr_dispatch_events(outbox_id,revision,state,issue) VALUES(NEW.id,NEW.revision,NEW.state,NEW.issue);
END;
CREATE TRIGGER qr_dispatch_identity BEFORE UPDATE ON qr_preparation_outbox
WHEN NEW.id<>OLD.id OR NEW.lesson_id<>OLD.lesson_id OR NEW.card_id<>OLD.card_id OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Invalid dispatch revision'); END;
CREATE TRIGGER qr_dispatch_no_delete BEFORE DELETE ON qr_preparation_outbox BEGIN SELECT RAISE(ABORT,'Dispatch history is append only'); END;
CREATE TRIGGER qr_dispatch_event_no_update BEFORE UPDATE ON qr_dispatch_events BEGIN SELECT RAISE(ABORT,'Dispatch history is immutable'); END;
CREATE TRIGGER qr_dispatch_event_no_delete BEFORE DELETE ON qr_dispatch_events BEGIN SELECT RAISE(ABORT,'Dispatch history is append only'); END;
CREATE TRIGGER qr_dispatch_setting_no_update BEFORE UPDATE ON qr_dispatch_setting_events BEGIN SELECT RAISE(ABORT,'Dispatch settings history is immutable'); END;
CREATE TRIGGER qr_dispatch_setting_no_delete BEFORE DELETE ON qr_dispatch_setting_events BEGIN SELECT RAISE(ABORT,'Dispatch settings history is append only'); END;
CREATE TRIGGER qr_dispatch_settings_revision BEFORE UPDATE ON qr_dispatch_settings
WHEN NEW.id<>OLD.id OR NEW.revision<>OLD.revision+1 BEGIN SELECT RAISE(ABORT,'Invalid dispatch settings revision'); END;
CREATE TRIGGER qr_dispatch_settings_no_delete BEFORE DELETE ON qr_dispatch_settings BEGIN SELECT RAISE(ABORT,'Dispatch settings cannot be deleted'); END;
CREATE TRIGGER qr_word_added AFTER INSERT ON lesson_blocks
WHEN NEW.type IN('word','wordcard') AND NEW.deleted_at IS NULL AND (SELECT enabled FROM qr_dispatch_settings WHERE id=1)=1
BEGIN
  INSERT INTO qr_preparation_outbox(lesson_id,card_id) SELECT NEW.lesson_id,c.id FROM cards c WHERE c.id=NEW.card_id AND c.scope='shared' AND c.deleted_at IS NULL
  ON CONFLICT(lesson_id,card_id) DO UPDATE SET state='queued',attempts=0,issue='',next_at=0,lease_token=NULL,lease_until=0,revision=revision+1,event_revision=event_revision+1;
END;
CREATE TRIGGER qr_word_restored AFTER UPDATE ON lesson_blocks
WHEN NEW.type IN('word','wordcard') AND NEW.deleted_at IS NULL AND (NEW.card_id IS NOT OLD.card_id OR NEW.type<>OLD.type OR OLD.deleted_at IS NOT NULL)
  AND (SELECT enabled FROM qr_dispatch_settings WHERE id=1)=1
BEGIN
  INSERT INTO qr_preparation_outbox(lesson_id,card_id) SELECT NEW.lesson_id,c.id FROM cards c WHERE c.id=NEW.card_id AND c.scope='shared' AND c.deleted_at IS NULL
  ON CONFLICT(lesson_id,card_id) DO UPDATE SET state='queued',attempts=0,issue='',next_at=0,lease_token=NULL,lease_until=0,revision=revision+1,event_revision=event_revision+1;
END;
CREATE TRIGGER qr_word_sense_added AFTER INSERT ON qr_card_senses
WHEN (SELECT enabled FROM qr_dispatch_settings WHERE id=1)=1
BEGIN
  INSERT INTO qr_preparation_outbox(lesson_id,card_id) SELECT DISTINCT b.lesson_id,c.id FROM lesson_blocks b JOIN cards c ON c.id=b.card_id
  WHERE c.id=NEW.card_id AND c.scope='shared' AND c.deleted_at IS NULL AND b.deleted_at IS NULL AND b.type IN('word','wordcard')
  ON CONFLICT(lesson_id,card_id) DO UPDATE SET state='queued',attempts=0,issue='',next_at=0,lease_token=NULL,lease_until=0,revision=revision+1,event_revision=event_revision+1;
END;
CREATE TRIGGER qr_word_group_added AFTER INSERT ON class_group_lessons
WHEN (SELECT enabled FROM qr_dispatch_settings WHERE id=1)=1
BEGIN
  INSERT INTO qr_preparation_outbox(lesson_id,card_id) SELECT DISTINCT NEW.lesson_id,c.id FROM lesson_blocks b JOIN cards c ON c.id=b.card_id
  WHERE b.lesson_id=NEW.lesson_id AND c.scope='shared' AND c.deleted_at IS NULL AND b.deleted_at IS NULL AND b.type IN('word','wordcard')
  ON CONFLICT(lesson_id,card_id) DO UPDATE SET state='queued',attempts=0,issue='',next_at=0,lease_token=NULL,lease_until=0,revision=revision+1,event_revision=event_revision+1;
END;
