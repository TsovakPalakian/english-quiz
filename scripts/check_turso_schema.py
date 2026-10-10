"""Offline draft-schema checks. No production services or third-party packages."""
import sqlite3
from pathlib import Path


def main():
    db = sqlite3.connect(":memory:")
    source = Path(__file__).resolve().parents[1] / "migrations/turso"
    for name in ("001_content_schema.sql", "002_import_audit.sql", "003_exams.sql", "004_groups.sql", "005_exam_titles.sql", "006_integer_entity_ids.sql"):
        db.executescript((source / name).read_text(encoding="utf-8"))
    assert db.execute("PRAGMA foreign_keys").fetchone() == (1,)

    def rejects(sql):
        try:
            db.execute(sql)
        except sqlite3.IntegrityError:
            return
        raise AssertionError(f"Expected constraint rejection: {sql}")

    db.executemany("INSERT INTO account_refs(id) VALUES (?)", [("student-1",), ("student-2",), ("twin-1",), ("twin-2",)])
    for kind in ("personal", "personal", "shared"):
        db.execute("INSERT INTO study_profiles(kind) VALUES (?)", (kind,))
    p1, p2, pair = [row[0] for row in db.execute("SELECT id FROM study_profiles ORDER BY id")]
    db.executemany("INSERT INTO profile_members VALUES (?,?)", [("student-1", p1), ("student-2", p2), ("twin-1", pair), ("twin-2", pair)])
    assert db.execute("SELECT count(*) FROM profile_members WHERE profile_id=?", (pair,)).fetchone()[0] == 2
    rejects("INSERT INTO profile_members VALUES ('missing-account',1)")
    rejects(f"INSERT INTO profile_members VALUES ('student-1',{p2})")
    rejects("INSERT INTO cards(scope,en,word_key) VALUES ('profile','bad','bad')")
    db.execute("INSERT INTO cards(scope,en,word_key,ru) VALUES ('shared','competitive','competitive','конкурентный')")
    c1 = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("INSERT INTO cards(scope,en,word_key,ru) VALUES ('shared','competitive','competitive','соревновательный')")
    c2 = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.executemany("INSERT INTO profile_cards(profile_id,card_id,place) VALUES (?,?,'mine')", [(p1, c1), (p2, c1)])
    assert db.execute("SELECT count(*) FROM cards").fetchone()[0] == 2
    assert db.execute("SELECT count(DISTINCT card_id) FROM profile_cards").fetchone()[0] == 1
    updated = db.execute("UPDATE cards SET ru='новый перевод', revision=revision+1 WHERE id=? AND revision=1", (c1,)).rowcount
    stale = db.execute("UPDATE cards SET ru='старый перевод', revision=revision+1 WHERE id=? AND revision=1", (c1,)).rowcount
    assert (updated, stale) == (1, 0)
    assert db.execute("SELECT ru FROM cards WHERE id=?", (c1,)).fetchone()[0] == "новый перевод"

    db.execute("INSERT INTO quiz_collections(legacy_word_key) VALUES ('competitive')")
    collection = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.executemany("INSERT INTO card_quiz_collections VALUES (?,?)", [(c1, collection), (c2, collection)])
    db.execute("INSERT INTO quizzes(collection_id,position,type) VALUES (?,?,?)", (collection, 0, "Flip"))
    q1 = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("INSERT INTO quizzes(collection_id,position,type) VALUES (?,?,?)", (collection, 1, "Build"))
    q2 = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("UPDATE quizzes SET deleted_at=unixepoch(),revision=revision+1 WHERE id=? AND revision=1", (q1,))
    assert db.execute("SELECT id FROM quizzes WHERE deleted_at IS NULL").fetchall() == [(q2,)]
    rejects(f"UPDATE quizzes SET items_json='{{}}' WHERE id={q2}")
    rejects(f"DELETE FROM cards WHERE id={c1}")
    db.executemany("INSERT INTO card_progress(profile_id,card_id,learned) VALUES (?,?,?)", [(p1, c1, 1), (p2, c1, 0), (pair, c1, 1)])
    assert db.execute("SELECT learned FROM card_progress WHERE profile_id=?", (p2,)).fetchone()[0] == 0
    assert db.execute("SELECT count(*) FROM card_progress WHERE profile_id=?", (pair,)).fetchone()[0] == 1

    db.execute("INSERT INTO lessons(title,published) VALUES ('Shared lesson',1)")
    lesson = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.execute("INSERT INTO lesson_blocks(lesson_id,position,type) VALUES (?,?,?)", (lesson, 0, "task"))
    block = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    db.executemany("INSERT INTO lesson_responses(profile_id,lesson_id,block_id,response_json) VALUES (?,?,?,?)", [(p1, lesson, block, '"first"'), (p2, lesson, block, '"second"')])
    assert db.execute("SELECT response_json FROM lesson_responses WHERE profile_id=?", (p2,)).fetchone()[0] == '"second"'
    rejects(f"INSERT INTO lesson_responses VALUES ({p1},{lesson},999999,'null',1,0)")
    db.execute("INSERT INTO operation_receipts VALUES ('student-1','mutation','hash','{}',100)")
    rejects("INSERT INTO operation_receipts VALUES ('student-1','mutation','hash','{}',100)")
    db.execute("SAVEPOINT rollback_check")
    db.execute("UPDATE cards SET ru='temporary' WHERE id=?", (c1,))
    db.execute("ROLLBACK TO rollback_check")
    db.execute("RELEASE rollback_check")
    assert db.execute("SELECT ru FROM cards WHERE id=?", (c1,)).fetchone()[0] == "новый перевод"
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    assert db.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall() == [(1,), (2,), (6,)]
    db.close()
    print("OK: schema, references, shared cards/pair, isolated progress/answers, revisions, quiz deletion, rollback")


if __name__ == "__main__":
    main()
