"""Accounts for the English quiz. Manual approval, no outbound email.

Passwords and session tokens are stored only as hashes. Revoking personal
data keeps the row and starts a new account on the next registration.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "accounts.sqlite"
SHARED_CARD_QUIZZES_PATH = ROOT / "shared-card-quizzes.json"
SHARED_QUIZ_LOCK = threading.Lock()
SCHEMA = (ROOT / "schema.sql").read_text(encoding="utf-8")
ITERATIONS = 100000
SESSION_SECONDS = 180 * 24 * 3600
MAX_BODY = 8_000_000
LOGIN_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
FAILS = {}
ALLOWED_ORIGINS = {"http://127.0.0.1:8766", "http://localhost:8766"}

def now():
    return int(time.time())

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    seed_admin(conn)
    return conn

def seed_admin(conn):
    login = os.environ.get("ADMIN_LOGIN", "").strip()
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not login or not email or not password:
        return
    try:
        conn.execute("BEGIN IMMEDIATE")
        # Match register bootstrap: any historical teacher blocks re-mint after revoke.
        ever = conn.execute(
            "SELECT id FROM users WHERE role IN ('ADMIN', 'DEVELOPER') LIMIT 1"
        ).fetchone()
        if ever:
            conn.commit()
            return
        salt, digest = hash_password(password)
        conn.execute(
            "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 0, ?)",
            (secrets.token_hex(16), login, email, "Teacher", salt, digest, ITERATIONS, now()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        try:
            conn.rollback()
        except Exception:
            pass
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def prune_fails():
    t = now()
    # Drop expired lockouts and idle counters first.
    for ip in list(FAILS.keys()):
        row = FAILS.get(ip) or {}
        until = int(row.get("until") or 0)
        seen = int(row.get("seen") or 0)
        if until and until <= t:
            FAILS.pop(ip, None)
        elif not until and seen and t - seen > 3600:
            FAILS.pop(ip, None)
    # Hard cap including locked IPs — evict oldest by seen.
    if len(FAILS) > 5000:
        ordered = sorted(
            FAILS.items(),
            key=lambda item: int((item[1] or {}).get("seen") or 0),
        )
        for ip, _ in ordered[: len(FAILS) - 5000]:
            FAILS.pop(ip, None)


def note_failure(ip):
    prune_fails()
    row = FAILS.setdefault(ip, {"count": 0, "until": 0, "seen": now()})
    row["seen"] = now()
    row["count"] += 1
    if row["count"] >= 8:
        row["until"] = now() + 15 * 60
        row["count"] = 0


def clear_failures(ip):
    FAILS.pop(ip, None)


def clean_theme_name(value):
    name = str(value or "").strip()
    if not re.match(r"^[a-z0-9-]{1,48}$", name):
        return ""
    return name


def clean_custom_themes(value):
    color_keys = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc"]
    hex_re = re.compile(r"^#[0-9A-Fa-f]{6}$")
    wash_re = re.compile(r"^#[0-9A-Fa-f]{8}$")
    if not isinstance(value, list):
        return []
    out = []
    for row in value[:8]:
        if not isinstance(row, dict):
            continue
        theme_id = str(row.get("id") or "")[:40]
        if not theme_id.startswith("user-"):
            continue
        name = re.sub(r"[\u0000-\u001f]", "", str(row.get("name") or "Picture"))[:64] or "Picture"
        src = row.get("vars") if isinstance(row.get("vars"), dict) else {}
        vars_out = {}
        for key in color_keys:
            val = src.get(key)
            if isinstance(val, str) and hex_re.match(val):
                vars_out[key] = val
        wash = src.get("--photo-wash")
        if isinstance(wash, str) and wash_re.match(wash):
            vars_out["--photo-wash"] = wash
        scheme = src.get("color-scheme")
        if scheme in ("dark", "light"):
            vars_out["color-scheme"] = scheme
        if not vars_out.get("--bg") or not vars_out.get("--card") or not vars_out.get("--acc"):
            continue
        photo = ""
        raw_photo = row.get("photo")
        if isinstance(raw_photo, str) and raw_photo.startswith("data:image/jpeg;base64,") and len(raw_photo) <= 450000:
            photo = raw_photo
        theme = {
            "id": theme_id,
            "name": name,
            "bg": vars_out["--bg"],
            "card": vars_out["--card"],
            "acc": vars_out["--acc"],
            "vars": vars_out,
            "photo": photo,
        }
        owner = row.get("owner")
        if isinstance(owner, str) and re.match(r"^[A-Za-z0-9_-]{1,32}$", owner):
            theme["owner"] = owner
        out.append(theme)
    return out

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITERATIONS).hex()
    return salt, digest

def check_password(password, salt, digest):
    fresh = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), ITERATIONS).hex()
    return hmac.compare_digest(fresh, digest)

def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def public_user(row):
    return {
        "id": row["id"],
        "login": row["login"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "revoked": bool(row["is_personal_data_revoked"]),
        "createdAt": row["created_at"],
    }

def read_cookie(header):
    for part in (header or "").split(";"):
        part = part.strip()
        if part.startswith("enquiz_sid="):
            return part.split("=", 1)[1]
    return ""

def cookie_header(token):
    if not token:
        return "enquiz_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    return "enquiz_sid=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d" % (token, SESSION_SECONDS)

def client_ip(handler):
    # Do not trust X-Forwarded-For on the local server — clients can forge it to bypass lockout.
    return (handler.client_address[0] or "").strip() or "unknown"

def too_many_failures(ip):
    prune_fails()
    row = FAILS.get(ip)
    if not row:
        return False
    if row["until"] > now():
        return True
    if row["until"]:
        FAILS.pop(ip, None)
    return False

def current_user(conn, handler):
    token = read_cookie(handler.headers.get("Cookie"))
    if not token:
        return None
    row = conn.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        (token_hash(token), now()),
    ).fetchone()
    if not row or row["is_personal_data_revoked"]:
        return None
    try:
        if row["active"] == 0:
            return None
    except (KeyError, IndexError):
        pass
    return row

def empty_state():
    return {"added": [], "songs": [], "learned": [], "variants": {}, "stats": {}}

def read_added(conn, user_id, fallback):
    rows = conn.execute("SELECT card FROM user_added WHERE user_id = ? ORDER BY idx", (user_id,)).fetchall()
    if not rows:
        return fallback
    cards = []
    for row in rows:
        try:
            cards.append(json.loads(row["card"]))
        except json.JSONDecodeError:
            continue
    return cards

def write_added(conn, user_id, cards):
    conn.execute("DELETE FROM user_added WHERE user_id = ?", (user_id,))
    conn.executemany(
        "INSERT INTO user_added (user_id, idx, card) VALUES (?, ?, ?)",
        [(user_id, index, json.dumps(card, ensure_ascii=False)) for index, card in enumerate(cards)],
    )

def read_state(conn, user_id):
    row = conn.execute("SELECT * FROM user_state WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        state = empty_state()
        state["added"] = read_added(conn, user_id, [])
    else:
        try:
            state = {
                "added": json.loads(row["added"]),
                "songs": json.loads(row["songs"]),
                "learned": json.loads(row["learned"]),
                "variants": json.loads(row["variants"]),
                "stats": json.loads(row["stats"]),
            }
        except json.JSONDecodeError:
            state = empty_state()
    state["added"] = read_added(conn, user_id, state["added"])
    stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
    stats = dict(stats)
    # Shared quizzes live in their own file, never in the per-user database row.
    stats.pop("cardQuizzes", None)
    stats["cardQuizzes"] = read_shared_card_quizzes(conn)
    state["stats"] = stats
    return state

def active_conflict(conn, login, email):
    hit = conn.execute(
        "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND (login = ? OR email = ?)",
        (login, email),
    ).fetchone()
    if hit:
        return "That login or email is already in use."
    hit = conn.execute(
        "SELECT id FROM registrations WHERE status = 'pending' AND (login = ? OR email = ?)",
        (login, email),
    ).fetchone()
    if hit:
        return "That login or email is already waiting for approval."
    return ""

def validate_signup(body):
    login = str(body.get("login") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "")
    name = str(body.get("name") or "").strip()[:80]
    if not LOGIN_RE.match(login):
        return None, "Login needs 3 to 32 letters, numbers, dots, dashes or underscores."
    if not EMAIL_RE.match(email) or len(email) > 120:
        return None, "Enter a valid email."
    if len(password) < 8 or len(password) > 32:
        return None, "Password needs 8 to 32 characters."
    return {"login": login, "email": email, "password": password, "name": name}, ""

def handle(handler, method, parsed):
    path = parsed.path.rstrip("/") or "/"
    try:
        length = int(handler.headers.get("Content-Length") or 0)
    except ValueError:
        return finish(handler, 400, {"error": "The request was not valid."})
    if length < 0 or length > MAX_BODY:
        return finish(handler, 413 if length > MAX_BODY else 400, {"error": "That request is too large." if length > MAX_BODY else "The request was not valid."})
    raw = handler.rfile.read(length) if length else b""
    body = {}
    if raw:
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return finish(handler, 400, {"error": "The request was not valid."})
    conn = db()
    try:
        return route(handler, conn, method, path, body)
    finally:
        conn.close()

def route(handler, conn, method, path, body):
    if method == "POST" and path == "/api/register":
        return register(handler, conn, body)
    if method == "POST" and path == "/api/login":
        return login(handler, conn, body)
    if method == "POST" and path == "/api/logout":
        return logout(handler, conn)
    if method == "GET" and path == "/api/me":
        return me(handler, conn)
    if method == "POST" and path == "/api/me/revoke":
        return revoke(handler, conn)
    if method == "GET" and path == "/api/me/state":
        return my_state(handler, conn)
    if method == "PUT" and path == "/api/me/state":
        return save_state(handler, conn, body)
    if path.startswith("/api/admin"):
        return admin(handler, conn, method, path, body)
    return finish(handler, 404, {"error": "Not found."})

def register(handler, conn, body):
    ip = client_ip(handler)
    if too_many_failures(ip):
        return finish(handler, 429, {"error": "Too many attempts. Wait and try again."})
    fields, error = validate_signup(body)
    if error:
        note_failure(ip)
        return finish(handler, 400, {"error": error})
    conflict = active_conflict(conn, fields["login"], fields["email"])
    if conflict:
        note_failure(ip)
        return finish(handler, 409, {"error": conflict})
    salt, digest = hash_password(fields["password"])
    created = now()
    try:
        conn.execute("BEGIN IMMEDIATE")
        # One-shot bootstrap: any historical ADMIN/DEVELOPER blocks re-bootstrap after revoke.
        admin_exists = conn.execute(
            "SELECT id FROM users WHERE role IN ('ADMIN', 'DEVELOPER') LIMIT 1"
        ).fetchone()
        if not admin_exists:
            user_id = secrets.token_hex(16)
            conn.execute(
                "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 0, ?)",
                (user_id, fields["login"], fields["email"], fields["name"], salt, digest, ITERATIONS, created),
            )
            reg_id = secrets.token_hex(16)
            conn.execute(
                "INSERT INTO registrations (id, login, email, name, password_salt, password_hash, password_iterations, status, user_id, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)",
                (reg_id, fields["login"], fields["email"], fields["name"], salt, digest, ITERATIONS, user_id, created, created),
            )
            conn.commit()
            clear_failures(ip)
            user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return start_session(handler, conn, user, {"status": "active", "user": public_user(user)})
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        note_failure(ip)
        return finish(handler, 409, {"error": "Registration is busy. Try again."})
    reg_id = secrets.token_hex(16)
    try:
        conn.execute(
            "INSERT INTO registrations (id, login, email, name, password_salt, password_hash, password_iterations, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (reg_id, fields["login"], fields["email"], fields["name"], salt, digest, ITERATIONS, created),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        note_failure(ip)
        return finish(handler, 409, {"error": "That login or email is already waiting for approval."})
    # Count successful pending inserts toward IP lockout (registration flood).
    note_failure(ip)
    return finish(handler, 200, {"status": "pending"})

def login(handler, conn, body):
    ip = client_ip(handler)
    if too_many_failures(ip):
        return finish(handler, 429, {"error": "Too many attempts. Wait and try again."})
    key = str(body.get("login") or "").strip()
    password = str(body.get("password") or "")
    email = key.lower()
    row = conn.execute(
        "SELECT * FROM users WHERE is_personal_data_revoked = 0 AND (login = ? OR email = ?)",
        (key, email),
    ).fetchone()
    if not row or not check_password(password, row["password_salt"], row["password_hash"]):
        note_failure(ip)
        # Same message for pending vs unknown — avoid account-existence oracle.
        return finish(handler, 401, {"error": "Wrong login or password."})
    try:
        if row["active"] == 0:
            return finish(handler, 403, {"error": "This account is deactivated."})
    except (KeyError, IndexError):
        pass
    clear_failures(ip)
    return start_session(handler, conn, row, {"user": public_user(row)})

def start_session(handler, conn, user, payload):
    token = secrets.token_hex(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash(token), user["id"], now() + SESSION_SECONDS),
    )
    conn.commit()
    return finish(handler, 200, payload, cookie_header(token))

def logout(handler, conn):
    token = read_cookie(handler.headers.get("Cookie"))
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        conn.commit()
    return finish(handler, 200, {"ok": True}, cookie_header(""))

def me(handler, conn):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 200, {"user": None})
    return finish(handler, 200, {"user": public_user(user)})

def revoke(handler, conn):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 401, {"error": "Sign in first."})
    conn.execute(
        "UPDATE users SET is_personal_data_revoked = 1, revoked_at = ? WHERE id = ?",
        (now(), user["id"]),
    )
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    try:
        conn.execute("DELETE FROM user_state WHERE user_id = ?", (user["id"],))
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("DELETE FROM user_added WHERE user_id = ?", (user["id"],))
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("DELETE FROM user_card_gone WHERE user_id = ?", (user["id"],))
    except sqlite3.OperationalError:
        pass
    conn.commit()
    return finish(handler, 200, {"ok": True}, cookie_header(""))

def write_state(conn, user_id, state, commit=True):
    added = state.get("added") if isinstance(state.get("added"), list) else []
    songs = state.get("songs") if isinstance(state.get("songs"), list) else []
    learned = state.get("learned") if isinstance(state.get("learned"), list) else []
    variants = state.get("variants") if isinstance(state.get("variants"), dict) else {}
    stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
    stats = dict(stats)
    stats.pop("cardQuizzes", None)
    for song in songs:
        if isinstance(song, dict):
            song.pop("blob", None)
    write_added(conn, user_id, added)
    conn.execute(
        "INSERT INTO user_state (user_id, added, songs, learned, variants, stats, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET added = '[]', songs = excluded.songs, learned = excluded.learned, variants = excluded.variants, stats = excluded.stats, updated_at = excluded.updated_at",
        (
            user_id,
            "[]",
            json.dumps(songs, ensure_ascii=False),
            json.dumps(learned, ensure_ascii=False),
            json.dumps(variants, ensure_ascii=False),
            json.dumps(stats, ensure_ascii=False),
            now(),
        ),
    )
    if commit:
        conn.commit()


def clean_day_links(value):
    if not isinstance(value, dict):
        return {}
    out = {}
    for day, pack in list(value.items())[:40]:
        if not isinstance(pack, dict):
            continue
        next_pack = {}
        for kind in ("classwork", "homework"):
            rows = pack.get(kind) if isinstance(pack.get(kind), list) else []
            cleaned = []
            for item in rows[:40]:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()[:120]
                href = str(item.get("href") or "").strip()[:500]
                if not title or not href:
                    continue
                if re.match(r"^(javascript|data|vbscript):", href, re.I):
                    continue
                if not re.match(r"^https?://", href, re.I):
                    href = "https://" + href
                if not re.match(r"^https?://", href, re.I):
                    continue
                cleaned.append({"title": title, "href": href})
            next_pack[kind] = cleaned
        out[str(day)[:40]] = next_pack
    return out


def clean_text_record(item):
    if not isinstance(item, dict):
        return None
    text = str(item.get("text") or "")
    if len(text) > 2000000:
        return {"error": "long"}
    text_id = str(item.get("id") or "")[:40]
    title = str(item.get("title") or "")[:160]
    if not text_id or not title:
        return None
    analysis = item.get("analysis")
    if not isinstance(analysis, dict):
        analysis = None
    return {
        "id": text_id,
        "title": title,
        "text": text,
        "updatedAt": str(item.get("updatedAt") or ""),
        "analysis": analysis,
    }


def clean_texts_list(incoming):
    out = []
    seen = {}
    for item in incoming or []:
        clean = clean_text_record(item)
        if isinstance(clean, dict) and clean.get("error") == "long":
            return None, "That text is too long. Limit is 2000000 characters."
        if not clean:
            continue
        prev = seen.get(clean["id"])
        if not prev or str(clean.get("updatedAt") or "") >= str(prev.get("updatedAt") or ""):
            seen[clean["id"]] = clean
    out = sorted(seen.values(), key=lambda row: str(row.get("updatedAt") or ""), reverse=True)[:200]
    return out, None


def plain_card_quizzes(value):
    if not isinstance(value, dict):
        return {}
    out = {}
    for key, quizzes in value.items():
        word = str(key or "").lower().strip()[:120]
        if not word or not isinstance(quizzes, list):
            continue
        # Cap quiz rows per word; empty list is a delete tombstone.
        out[word] = quizzes[:40]
        if len(out) >= 2000:
            break
    return out


def read_shared_card_quizzes(conn):
    try:
        return plain_card_quizzes(json.loads(SHARED_CARD_QUIZZES_PATH.read_text(encoding="utf-8")))
    except (OSError, TypeError, json.JSONDecodeError):
        return {}


def write_shared_card_quizzes(conn, patch):
    # This is intentionally file-backed: shared quizzes must not consume database rows.
    with SHARED_QUIZ_LOCK:
        current = read_shared_card_quizzes(conn)
        current.update(plain_card_quizzes(patch))
        temp_path = SHARED_CARD_QUIZZES_PATH.with_suffix(".json.tmp")
        temp_path.write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
        os.replace(temp_path, SHARED_CARD_QUIZZES_PATH)
        return current


def card_key(card):
    return (card.get("place") or "mine") + "|" + str(card.get("word") or "").strip().lower()


def apply_state_op(conn, user, body):
    """Apply one Worker-compatible state op without wiping unrelated fields."""
    state = read_state(conn, user["id"])
    op = body.get("op")
    if op == "delete-card":
        word = str(body.get("word") or "").strip()
        if not word:
            return ("error", 400, "The request was not valid.")
        key = (body.get("place") or "mine") + "|" + word.lower()
        state["added"] = [item for item in state.get("added") or [] if card_key(item) != key]
    elif op == "put-card":
        card = body.get("card")
        if not isinstance(card, dict) or not str(card.get("word") or "").strip():
            return ("error", 400, "The request was not valid.")
        next_card = dict(card)
        next_card.pop("blob", None)
        keep = card_key(next_card)
        drop = ""
        if body.get("replaceWord"):
            drop = (body.get("replacePlace") or next_card.get("place") or "mine") + "|" + str(body.get("replaceWord") or "").strip().lower()
        state["added"] = [item for item in state.get("added") or [] if card_key(item) != keep and card_key(item) != drop]
        state["added"].append(next_card)
        state["added"] = state["added"][-5000:]
    elif op == "put-text-card":
        card = body.get("card")
        if not isinstance(card, dict) or not str(card.get("word") or "").strip():
            return ("error", 400, "The request was not valid.")
        next_card = dict(card)
        next_card.pop("blob", None)
        keep = card_key(next_card)
        state["added"] = [item for item in state.get("added") or [] if card_key(item) != keep]
        state["added"].append(next_card)
        state["added"] = state["added"][-5000:]
    elif op == "put-song":
        song = body.get("song")
        if not isinstance(song, dict) or not song.get("id"):
            return ("error", 400, "The request was not valid.")
        copy = dict(song)
        copy.pop("blob", None)
        copy["id"] = str(copy["id"])[:80]
        songs = [item for item in state.get("songs") or [] if not (isinstance(item, dict) and item.get("id") == copy["id"])]
        songs.append(copy)
        state["songs"] = songs[-500:]
    elif op == "put-variant":
        # Worker shape: { word, lines }. Legacy local alias: { key, value }.
        variants = state.get("variants") if isinstance(state.get("variants"), dict) else {}
        word = str(body.get("word") or body.get("key") or "").strip()[:120]
        lines = body.get("lines") if "lines" in body else body.get("value")
        if not word or not isinstance(lines, list):
            return ("error", 400, "The request was not valid.")
        try:
            raw = json.dumps(lines, ensure_ascii=False)
        except (TypeError, ValueError):
            return ("error", 400, "The request was not valid.")
        if len(raw) > 100000:
            return ("error", 400, "The request was not valid.")
        variants[word] = lines[:200]
        if len(variants) > 2000:
            for old in list(variants.keys())[: len(variants) - 2000]:
                variants.pop(old, None)
        state["variants"] = variants
    elif op == "put-edit":
        stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
        edits = stats.get("cardEdits") if isinstance(stats.get("cardEdits"), dict) else {}
        edit_id = str(body.get("id") or "").strip()[:120]
        edit = body.get("edit")
        if not edit_id or not isinstance(edit, dict):
            return ("error", 400, "The request was not valid.")
        try:
            if len(json.dumps(edit, ensure_ascii=False)) > 50000:
                return ("error", 400, "The request was not valid.")
        except (TypeError, ValueError):
            return ("error", 400, "The request was not valid.")
        edits[edit_id] = edit
        keys = list(edits.keys())
        if len(keys) > 2000:
            for old in keys[: len(keys) - 2000]:
                edits.pop(old, None)
        stats["cardEdits"] = edits
        state["stats"] = stats
    elif op == "put-mistake" or op == "delete-mistake":
        stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
        mistakes = stats.get("mistakes") if isinstance(stats.get("mistakes"), list) else []
        if op == "put-mistake":
            mistake = body.get("mistake") if isinstance(body.get("mistake"), dict) else {}
            en = str(mistake.get("en") or "").strip()[:120]
            typ = str(mistake.get("type") or "").strip()[:40]
            if not en or not typ:
                return ("error", 400, "The request was not valid.")
            mistakes = [item for item in mistakes if not (item and item.get("en") == en and item.get("type") == typ)]
            misses = mistake.get("misses", 0)
            try:
                misses = int(misses)
            except (TypeError, ValueError):
                misses = 0
            if misses > 0:
                try:
                    streak = int(mistake.get("streak") or 0)
                except (TypeError, ValueError):
                    streak = 0
                mistakes.append({
                    "en": en,
                    "type": typ,
                    "misses": min(999, max(1, misses)),
                    "streak": min(99, max(0, streak)),
                })
        else:
            en = str(body.get("en") or "").strip()[:120]
            typ = str(body.get("type") or "").strip()[:40]
            if not en or not typ:
                return ("error", 400, "The request was not valid.")
            mistakes = [item for item in mistakes if not (item and item.get("en") == en and item.get("type") == typ)]
        stats["mistakes"] = mistakes[-500:]
        state["stats"] = stats
    elif op == "put-setting":
        stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
        key = body.get("key")
        if key == "lyricSize":
            try:
                size = int(body.get("value"))
            except (TypeError, ValueError):
                return ("error", 400, "The request was not valid.")
            if size < 14 or size > 40:
                return ("error", 400, "The request was not valid.")
            stats["lyricSize"] = size
        elif key == "demonstratives":
            value = body.get("value")
            if value is None:
                stats["demonstratives"] = None
            elif not isinstance(value, dict):
                return ("error", 400, "The request was not valid.")
            else:
                try:
                    raw = json.dumps(value, ensure_ascii=False)
                except (TypeError, ValueError):
                    return ("error", 400, "The request was not valid.")
                if len(raw) > 200000:
                    return ("error", 400, "The request was not valid.")
                stats["demonstratives"] = json.loads(raw)
        elif key == "dayLinks":
            stats["dayLinks"] = clean_day_links(body.get("value"))
        elif key == "cardQuizzes":
            write_shared_card_quizzes(conn, body.get("value"))
            stats.pop("cardQuizzes", None)
        elif key == "customThemes":
            stats["customThemes"] = clean_custom_themes(body.get("value"))
        elif key == "theme":
            theme = clean_theme_name(body.get("value"))
            if not theme:
                return ("error", 400, "The request was not valid.")
            stats["theme"] = theme
        elif key == "hiddenLessons":
            stats["hiddenLessons"] = [str(x or "").strip() for x in (body.get("value") or []) if str(x or "").strip()][:200]
        elif key == "allowedLessons":
            stats["allowedLessons"] = [str(x or "").strip() for x in (body.get("value") or []) if str(x or "").strip()][:200]
        else:
            return ("error", 400, "The request was not valid.")
        state["stats"] = stats
    else:
        return ("error", 400, "The request was not valid.")
    write_state(conn, user["id"], state, commit=False)
    return ("ok", 200, {"ok": True})


def my_state(handler, conn):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 401, {"error": "Sign in first."})
    return finish(handler, 200, read_state(conn, user["id"]))

def save_state(handler, conn, body):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 401, {"error": "Sign in first."})
    if isinstance(body, dict) and body.get("op"):
        if body.get("op") == "put-setting" and body.get("key") == "allowedLessons":
            if user["role"] not in ("ADMIN", "DEVELOPER"):
                return finish(handler, 403, {"error": "You cannot do that."})
        if body.get("op") == "put-setting" and body.get("key") == "cardQuizzes":
            if user["role"] not in ("ADMIN", "DEVELOPER"):
                return finish(handler, 403, {"error": "You cannot do that."})
        try:
            conn.execute("BEGIN IMMEDIATE")
            live = conn.execute(
                "SELECT id, is_personal_data_revoked FROM users WHERE id = ?",
                (user["id"],),
            ).fetchone()
            if not live or live["is_personal_data_revoked"]:
                conn.rollback()
                return finish(handler, 401, {"error": "Sign in first."})
            kind, code, payload = apply_state_op(conn, user, body)
            if kind == "error":
                conn.rollback()
                return finish(handler, code, {"error": payload})
            conn.commit()
            return finish(handler, code, payload)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
    # Full-snapshot bodies used to overwrite the whole account; SPA only sends ops.
    return finish(handler, 400, {"error": "The request was not valid."})

def require_admin(handler, conn):
    user = current_user(conn, handler)
    if not user:
        finish(handler, 401, {"error": "Sign in first."})
        return None
    if user["role"] not in ("ADMIN", "DEVELOPER"):
        finish(handler, 403, {"error": "Teachers only."})
        return None
    return user

def admin(handler, conn, method, path, body):
    admin_user = require_admin(handler, conn)
    if not admin_user:
        return None
    if method == "GET" and path == "/api/admin/registrations":
        rows = conn.execute("SELECT id, login, email, name, status, created_at, decided_at FROM registrations ORDER BY created_at DESC").fetchall()
        regs = [dict(row) for row in rows]
        if admin_user["role"] != "DEVELOPER":
            # Only hide emails of currently hidden accounts — revoked emails must
            # still show pending re-signups (Worker forReviewer behavior).
            hidden_emails = {
                str(u["email"]).lower()
                for u in conn.execute(
                    "SELECT email FROM users WHERE hidden = 1 AND is_personal_data_revoked = 0"
                ).fetchall()
            }
            regs = [r for r in regs if str(r.get("email") or "").lower() not in hidden_emails]
        return finish(handler, 200, {"registrations": regs})
    if method == "GET" and path == "/api/admin/users":
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        users = []
        for row in rows:
            if admin_user["role"] != "DEVELOPER":
                if row["role"] == "DEVELOPER" or row["is_personal_data_revoked"]:
                    continue
                try:
                    if row["hidden"]:
                        continue
                except (KeyError, IndexError):
                    pass
            users.append(public_user(row))
        return finish(handler, 200, {"users": users})
    parts = path.split("/")
    if len(parts) == 5 and parts[2] == "admin" and parts[3] == "users" and method == "GET":
        target, err = managed_target(admin_user, conn, parts[4])
        if err:
            return finish(handler, err[0], {"error": err[1]})
        history = conn.execute(
            "SELECT id, login, email, name, status, created_at, decided_at FROM registrations WHERE user_id = ? OR email = ? ORDER BY created_at DESC",
            (target["id"], target["email"]),
        ).fetchall()
        state = read_state(conn, target["id"])
        if not allow_songs(admin_user, target):
            state = dict(state)
            state["songs"] = []
            added = state.get("added") if isinstance(state.get("added"), list) else []
            state["added"] = [item for item in added if (item or {}).get("place") != "music"]
        return finish(handler, 200, {"user": public_user(target), "state": state, "registrations": [dict(item) for item in history]})
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "users" and parts[5] == "state" and method == "GET":
        target, err = managed_target(admin_user, conn, parts[4])
        if err:
            return finish(handler, err[0], {"error": err[1]})
        state = read_state(conn, target["id"])
        if not allow_songs(admin_user, target):
            state = dict(state)
            state["songs"] = []
            added = state.get("added") if isinstance(state.get("added"), list) else []
            state["added"] = [item for item in added if (item or {}).get("place") != "music"]
        return finish(handler, 200, state)
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "users" and parts[5] == "state" and method == "PUT":
        target, err = managed_target(admin_user, conn, parts[4])
        if err:
            return finish(handler, err[0], {"error": err[1]})
        if isinstance(body, dict) and body.get("op") == "put-setting" and body.get("key") == "cardQuizzes":
            return finish(handler, 403, {"error": "You cannot do that."})
        if not allow_songs(admin_user, target):
            op = body.get("op") if isinstance(body, dict) else ""
            place = ""
            if op in ("put-card", "put-text-card") and isinstance(body.get("card"), dict):
                place = body["card"].get("place") or ""
            elif isinstance(body, dict):
                place = body.get("place") or ""
            if op == "put-song" or place == "music":
                return finish(handler, 403, {"error": "You cannot do that."})
        try:
            conn.execute("BEGIN IMMEDIATE")
            live = conn.execute(
                "SELECT id, is_personal_data_revoked FROM users WHERE id = ?",
                (target["id"],),
            ).fetchone()
            if not live or live["is_personal_data_revoked"]:
                conn.rollback()
                return finish(handler, 404, {"error": "No such account."})
            kind, code, payload = apply_state_op(conn, target, body if isinstance(body, dict) else {})
            if kind == "error":
                conn.rollback()
                return finish(handler, code, {"error": payload})
            conn.commit()
            return finish(handler, code, payload)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "users" and parts[5] == "texts" and method == "GET":
        target, err = managed_target(admin_user, conn, parts[4])
        if err:
            return finish(handler, err[0], {"error": err[1]})
        state = read_state(conn, target["id"])
        stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
        texts = stats.get("texts") if isinstance(stats.get("texts"), list) else []
        return finish(handler, 200, {"texts": texts})
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "users" and parts[5] == "texts" and method == "PUT":
        target, err = managed_target(admin_user, conn, parts[4])
        if err:
            return finish(handler, err[0], {"error": err[1]})
            incoming = body.get("texts") if isinstance(body, dict) and isinstance(body.get("texts"), list) else []
            cleaned, err = clean_texts_list(incoming)
            if err:
                return finish(handler, 413, {"error": err})
            try:
                conn.execute("BEGIN IMMEDIATE")
                live = conn.execute(
                    "SELECT id, is_personal_data_revoked FROM users WHERE id = ?",
                    (target["id"],),
                ).fetchone()
                if not live or live["is_personal_data_revoked"]:
                    conn.rollback()
                    return finish(handler, 404, {"error": "No such account."})
                state = read_state(conn, target["id"])
                stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}
                stats["texts"] = cleaned
                state["stats"] = stats
                write_state(conn, target["id"], state, commit=False)
                conn.commit()
                return finish(handler, 200, {"ok": True, "texts": stats["texts"]})
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "registrations" and method == "POST":
        return decide(handler, conn, admin_user, parts[4], parts[5])
    return finish(handler, 404, {"error": "Not found."})


def allow_songs(actor, target):
    return actor["role"] == "DEVELOPER"


def registration_visible_to(actor, conn, reg):
    if not reg:
        return False
    if actor["role"] == "DEVELOPER":
        return True
    email = str(reg["email"] if hasattr(reg, "keys") else reg.get("email") or "").lower()
    if not email:
        return True
    hit = conn.execute(
        "SELECT id FROM users WHERE hidden = 1 AND is_personal_data_revoked = 0 AND lower(email) = ?",
        (email,),
    ).fetchone()
    return not hit


def managed_target(actor, conn, user_id):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row or row["is_personal_data_revoked"]:
        return None, (404, "No such account.")
    try:
        if row["active"] == 0:
            return None, (404, "No such account.")
    except (KeyError, IndexError):
        pass
    if actor["role"] != "DEVELOPER":
        try:
            if row["hidden"]:
                return None, (404, "No such account.")
        except (KeyError, IndexError):
            pass
    if actor["role"] != "DEVELOPER" and row["role"] == "DEVELOPER":
        return None, (404, "No such account.")
    if actor["role"] == "ADMIN" and row["role"] != "USER":
        return None, (403, "You cannot do that.")
    if row["role"] not in ("USER", "ADMIN"):
        return None, (403, "Only student and teacher accounts can be opened.")
    return row, None

def decide(handler, conn, admin_user, reg_id, action):
    if action not in ("approve", "reject"):
        return finish(handler, 404, {"error": "Not found."})
    reg = conn.execute("SELECT * FROM registrations WHERE id = ?", (reg_id,)).fetchone()
    if not reg or reg["status"] != "pending":
        return finish(handler, 409, {"error": "This request is no longer waiting."})
    if not registration_visible_to(admin_user, conn, reg):
        return finish(handler, 404, {"error": "No such account."})
    decided = now()
    if action == "reject":
        conn.execute("UPDATE registrations SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'", (decided, reg_id))
        conn.commit()
        return finish(handler, 200, {"ok": True})
    user_id = secrets.token_hex(16)
    try:
        conn.execute("BEGIN IMMEDIATE")
        live = conn.execute(
            "SELECT * FROM registrations WHERE id = ? AND status = 'pending'",
            (reg_id,),
        ).fetchone()
        if not live:
            conn.rollback()
            return finish(handler, 409, {"error": "This request is no longer waiting."})
        taken = conn.execute(
            "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND (login = ? OR email = ?)",
            (live["login"], live["email"]),
        ).fetchone()
        if taken:
            conn.rollback()
            return finish(handler, 409, {"error": "That login or email is already in use."})
        conn.execute(
            "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'USER', 0, ?)",
            (user_id, live["login"], live["email"], live["name"], live["password_salt"], live["password_hash"], live["password_iterations"], decided),
        )
        updated = conn.execute(
            "UPDATE registrations SET status = 'approved', user_id = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
            (user_id, decided, reg_id),
        )
        if updated.rowcount != 1:
            conn.rollback()
            return finish(handler, 409, {"error": "This request is no longer waiting."})
        conn.commit()
    except sqlite3.IntegrityError:
        try:
            conn.rollback()
        except Exception:
            pass
        return finish(handler, 409, {"error": "That login or email is already in use."})
    return finish(handler, 200, {"ok": True})

def allowed_origin(handler):
    origin = handler.headers.get("Origin") or ""
    if origin in ALLOWED_ORIGINS:
        return origin
    return "http://127.0.0.1:8766"

def preflight(handler):
    handler.send_response(204)
    handler.send_header("Access-Control-Allow-Origin", allowed_origin(handler))
    handler.send_header("Access-Control-Allow-Credentials", "true")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Vary", "Origin")
    handler.end_headers()

def finish(handler, code, payload, cookie=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    origin = allowed_origin(handler)
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", origin)
    handler.send_header("Access-Control-Allow-Credentials", "true")
    handler.send_header("Vary", "Origin")
    if cookie:
        handler.send_header("Set-Cookie", cookie)
    handler.end_headers()
    handler.wfile.write(body)
