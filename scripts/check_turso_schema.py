"""Offline draft-schema checks. No production services or third-party packages."""
import sqlite3
from pathlib import Path


def main():
    db = sqlite3.connect(":memory:")
    source = Path(__file__).resolve().parents[1] / "migrations/turso/001_content_schema.sql"
    db.executescript(source.read_text(encoding="utf-8"))
    db.executescript((source.parent / "002_import_audit.sql").read_text(encoding="utf-8"))
    assert db.execute("PRAGMA foreign_keys").fetchone() == (1,)

    def rejects(sql):
        try:
            db.execute(sql)
        except sqlite3.IntegrityError:
            return
        raise AssertionError(f"Expected constraint rejection: {sql}")

    db.executemany("INSERT INTO account_refs(id) VALUES (?)", [("student-1",), ("student-2",), ("twin-1",), ("twin-2",)])
    db.executemany("INSERT INTO study_profiles(id,kind) VALUES (?,?)", [("p1", "personal"), ("p2", "personal"), ("pair", "shared")])
    db.executemany("INSERT INTO profile_members VALUES (?,?)", [("student-1", "p1"), ("student-2", "p2"), ("twin-1", "pair"), ("twin-2", "pair")])
    assert db.execute("SELECT count(*) FROM profile_members WHERE profile_id='pair'").fetchone()[0] == 2
    rejects("INSERT INTO profile_members VALUES ('missing-account','p1')")
    rejects("INSERT INTO profile_members VALUES ('student-1','p2')")
    rejects("INSERT INTO cards(id,scope,en,word_key) VALUES ('bad','profile','bad','bad')")
    db.execute("INSERT INTO cards(id,scope,en,word_key,ru) VALUES ('c1','shared','competitive','competitive','конкурентный')")
    db.execute("INSERT INTO cards(id,scope,en,word_key,ru) VALUES ('c2','shared','competitive','competitive','соревновательный')")
    db.executemany("INSERT INTO profile_cards(profile_id,card_id,place) VALUES (?,'c1','mine')", [("p1",), ("p2",)])
    assert db.execute("SELECT count(*) FROM cards").fetchone()[0] == 2
    assert db.execute("SELECT count(DISTINCT card_id) FROM profile_cards").fetchone()[0] == 1
    updated = db.execute("UPDATE cards SET ru='новый перевод', revision=revision+1 WHERE id='c1' AND revision=1").rowcount
    stale = db.execute("UPDATE cards SET ru='старый перевод', revision=revision+1 WHERE id='c1' AND revision=1").rowcount
    assert (updated, stale) == (1, 0)
    assert db.execute("SELECT ru FROM cards WHERE id='c1'").fetchone()[0] == "новый перевод"

    db.execute("INSERT INTO quiz_collections(id,legacy_word_key) VALUES ('collection','competitive')")
    db.executemany("INSERT INTO card_quiz_collections VALUES (?,'collection')", [("c1",), ("c2",)])
    db.executemany("INSERT INTO quizzes(id,collection_id,position,type) VALUES (?,'collection',?,?)", [("q1", 0, "Flip"), ("q2", 1, "Build")])
    db.execute("UPDATE quizzes SET deleted_at=unixepoch(),revision=revision+1 WHERE id='q1' AND revision=1")
    assert db.execute("SELECT id FROM quizzes WHERE deleted_at IS NULL").fetchall() == [("q2",)]
    rejects("UPDATE quizzes SET items_json='{}' WHERE id='q2'")
    rejects("DELETE FROM cards WHERE id='c1'")
    db.executemany("INSERT INTO card_progress(profile_id,card_id,learned) VALUES (?,'c1',?)", [("p1", 1), ("p2", 0), ("pair", 1)])
    assert db.execute("SELECT learned FROM card_progress WHERE profile_id='p2'").fetchone()[0] == 0
    assert db.execute("SELECT count(*) FROM card_progress WHERE profile_id='pair'").fetchone()[0] == 1

    db.execute("INSERT INTO lessons(id,title,published) VALUES ('lesson','Shared lesson',1)")
    db.execute("INSERT INTO lesson_blocks(lesson_id,id,position,type) VALUES ('lesson','task',0,'task')")
    db.executemany("INSERT INTO lesson_responses(profile_id,lesson_id,block_id,response_json) VALUES (?,'lesson','task',?)", [("p1", '"first"'), ("p2", '"second"')])
    assert db.execute("SELECT response_json FROM lesson_responses WHERE profile_id='p2'").fetchone()[0] == '"second"'
    rejects("INSERT INTO lesson_responses VALUES ('p1','lesson','missing','null',1,0)")
    db.execute("INSERT INTO operation_receipts VALUES ('student-1','mutation','hash','{}',100)")
    rejects("INSERT INTO operation_receipts VALUES ('student-1','mutation','hash','{}',100)")
    db.execute("SAVEPOINT rollback_check")
    db.execute("UPDATE cards SET ru='temporary' WHERE id='c1'")
    db.execute("ROLLBACK TO rollback_check")
    db.execute("RELEASE rollback_check")
    assert db.execute("SELECT ru FROM cards WHERE id='c1'").fetchone()[0] == "новый перевод"
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    assert db.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall() == [(1,), (2,)]
    db.close()
    print("OK: schema, references, shared cards/pair, isolated progress/answers, revisions, quiz deletion, rollback")


if __name__ == "__main__":
    main()
