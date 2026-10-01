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
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "accounts.sqlite"
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
    row = conn.execute("SELECT id FROM users WHERE role = 'ADMIN' AND is_personal_data_revoked = 0").fetchone()
    if row:
        return
    salt, digest = hash_password(password)
    conn.execute(
        "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN', 0, ?)",
        (secrets.token_hex(16), login, email, "Teacher", salt, digest, ITERATIONS, now()),
    )
    conn.commit()

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
    return (handler.headers.get("X-Forwarded-For") or handler.client_address[0] or "").split(",")[0].strip()

def too_many_failures(ip):
    row = FAILS.get(ip)
    if not row:
        return False
    if row["until"] > now():
        return True
    if row["until"]:
        FAILS.pop(ip, None)
    return False

def note_failure(ip):
    row = FAILS.setdefault(ip, {"count": 0, "until": 0})
    row["count"] += 1
    if row["count"] >= 8:
        row["until"] = now() + 15 * 60
        row["count"] = 0

def clear_failures(ip):
    FAILS.pop(ip, None)

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
        return state
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
    length = int(handler.headers.get("Content-Length") or 0)
    if length > MAX_BODY:
        return finish(handler, 413, {"error": "That request is too large."})
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
    fields, error = validate_signup(body)
    if error:
        return finish(handler, 400, {"error": error})
    conflict = active_conflict(conn, fields["login"], fields["email"])
    if conflict:
        return finish(handler, 409, {"error": conflict})
    salt, digest = hash_password(fields["password"])
    admin_exists = conn.execute("SELECT id FROM users WHERE role = 'ADMIN' AND is_personal_data_revoked = 0").fetchone()
    created = now()
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
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return start_session(handler, conn, user, {"status": "active", "user": public_user(user)})
    reg_id = secrets.token_hex(16)
    try:
        conn.execute(
            "INSERT INTO registrations (id, login, email, name, password_salt, password_hash, password_iterations, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (reg_id, fields["login"], fields["email"], fields["name"], salt, digest, ITERATIONS, created),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return finish(handler, 409, {"error": "That login or email is already waiting for approval."})
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
        pending = conn.execute(
            "SELECT id FROM registrations WHERE status = 'pending' AND (login = ? OR email = ?)",
            (key, email),
        ).fetchone()
        note_failure(ip)
        if pending:
            return finish(handler, 403, {"error": "This registration is waiting for approval."})
        return finish(handler, 401, {"error": "Wrong login or password."})
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
    conn.commit()
    return finish(handler, 200, {"ok": True}, cookie_header(""))

def my_state(handler, conn):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 401, {"error": "Sign in first."})
    return finish(handler, 200, read_state(conn, user["id"]))

def save_state(handler, conn, body):
    user = current_user(conn, handler)
    if not user:
        return finish(handler, 401, {"error": "Sign in first."})
    state = {
        "added": body.get("added") if isinstance(body.get("added"), list) else [],
        "songs": body.get("songs") if isinstance(body.get("songs"), list) else [],
        "learned": body.get("learned") if isinstance(body.get("learned"), list) else [],
        "variants": body.get("variants") if isinstance(body.get("variants"), dict) else {},
        "stats": body.get("stats") if isinstance(body.get("stats"), dict) else {},
    }
    for song in state["songs"]:
        if isinstance(song, dict):
            song.pop("blob", None)
    write_added(conn, user["id"], state["added"])
    conn.execute(
        "INSERT INTO user_state (user_id, added, songs, learned, variants, stats, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET added = '[]', songs = excluded.songs, learned = excluded.learned, variants = excluded.variants, stats = excluded.stats, updated_at = excluded.updated_at",
        (
            user["id"],
            "[]",
            json.dumps(state["songs"], ensure_ascii=False),
            json.dumps(state["learned"], ensure_ascii=False),
            json.dumps(state["variants"], ensure_ascii=False),
            json.dumps(state["stats"], ensure_ascii=False),
            now(),
        ),
    )
    conn.commit()
    return finish(handler, 200, {"ok": True})

def require_admin(handler, conn):
    user = current_user(conn, handler)
    if not user:
        finish(handler, 401, {"error": "Sign in first."})
        return None
    if user["role"] != "ADMIN":
        finish(handler, 403, {"error": "Teachers only."})
        return None
    return user

def admin(handler, conn, method, path, body):
    admin_user = require_admin(handler, conn)
    if not admin_user:
        return None
    if method == "GET" and path == "/api/admin/registrations":
        rows = conn.execute("SELECT id, login, email, name, status, created_at, decided_at FROM registrations ORDER BY created_at DESC").fetchall()
        return finish(handler, 200, {"registrations": [dict(row) for row in rows]})
    if method == "GET" and path == "/api/admin/users":
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        return finish(handler, 200, {"users": [public_user(row) for row in rows]})
    parts = path.split("/")
    if len(parts) == 5 and parts[2] == "admin" and parts[3] == "users" and method == "GET":
        row = conn.execute("SELECT * FROM users WHERE id = ?", (parts[4],)).fetchone()
        if not row:
            return finish(handler, 404, {"error": "No such account."})
        history = conn.execute(
            "SELECT id, login, email, name, status, created_at, decided_at FROM registrations WHERE user_id = ? OR email = ? ORDER BY created_at DESC",
            (row["id"], row["email"]),
        ).fetchall()
        return finish(handler, 200, {"user": public_user(row), "state": read_state(conn, row["id"]), "registrations": [dict(item) for item in history]})
    if len(parts) == 6 and parts[2] == "admin" and parts[3] == "registrations" and method == "POST":
        return decide(handler, conn, parts[4], parts[5])
    return finish(handler, 404, {"error": "Not found."})

def decide(handler, conn, reg_id, action):
    if action not in ("approve", "reject"):
        return finish(handler, 404, {"error": "Not found."})
    reg = conn.execute("SELECT * FROM registrations WHERE id = ?", (reg_id,)).fetchone()
    if not reg or reg["status"] != "pending":
        return finish(handler, 409, {"error": "This request is no longer waiting."})
    decided = now()
    if action == "reject":
        conn.execute("UPDATE registrations SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'", (decided, reg_id))
        conn.commit()
        return finish(handler, 200, {"ok": True})
    taken = conn.execute(
        "SELECT id FROM users WHERE is_personal_data_revoked = 0 AND (login = ? OR email = ?)",
        (reg["login"], reg["email"]),
    ).fetchone()
    if taken:
        return finish(handler, 409, {"error": "That login or email is already in use."})
    user_id = secrets.token_hex(16)
    try:
        conn.execute("BEGIN")
        conn.execute(
            "INSERT INTO users (id, login, email, name, password_salt, password_hash, password_iterations, role, is_personal_data_revoked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'USER', 0, ?)",
            (user_id, reg["login"], reg["email"], reg["name"], reg["password_salt"], reg["password_hash"], reg["password_iterations"], decided),
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
        conn.rollback()
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
