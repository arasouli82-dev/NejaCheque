"""SQLite storage. One file (data/nejacheque.sqlite3); the schema is created on start-up."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from nejacheque.config import settings


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@contextmanager
def db_connection() -> Iterator[sqlite3.Connection]:
    path = settings.db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator' CHECK(role IN ('manager', 'operator')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cheque_docs (
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    PRIMARY KEY(scope, kind, doc_id)
);
CREATE TABLE IF NOT EXISTS cheque_issued (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL DEFAULT '',
    bank TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL,
    due_on TEXT NOT NULL,
    amount TEXT NOT NULL,
    payee TEXT NOT NULL DEFAULT '',
    payee_id TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    sayad TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued', 'cleared', 'bounced', 'void')),
    status_note TEXT NOT NULL DEFAULT '',
    printed_by INTEGER,
    printed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    book_id TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cheque_issued_due ON cheque_issued(status, due_on);
CREATE TABLE IF NOT EXISTS cheque_received (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drawer TEXT NOT NULL DEFAULT '',
    drawer_id TEXT NOT NULL DEFAULT '',
    bank TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    sayad TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT '',
    amount TEXT NOT NULL,
    due_date TEXT NOT NULL,
    due_on TEXT NOT NULL,
    received_date TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_hand'
        CHECK(status IN ('in_hand', 'deposited', 'cleared', 'bounced', 'returned', 'spent')),
    status_note TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cheque_received_due ON cheque_received(status, due_on);
"""


def init_db() -> None:
    with db_connection() as conn:
        conn.executescript(SCHEMA)


def log(conn: sqlite3.Connection, user_id, action: str, entity_id="", detail: str = "", ip: str = "") -> None:
    conn.execute("INSERT INTO activity_log (user_id, action, entity_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                 (user_id, action, str(entity_id or ""), detail, ip, utcnow()))
