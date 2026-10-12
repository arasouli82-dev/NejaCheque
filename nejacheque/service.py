"""Neja Cheque server logic.

The page does all the layout and printing in the browser; the server keeps what several people in
the office share and what has to outlive one browser:

  * accounts: managers (users, reminders, backup/restore, deleting register rows) and operators.
  * documents (cheque_docs): templates (with their leaf photo), payees, chequebooks and shared
    settings are one JSON document each, shared by everyone; each user's print queue and
    preferences are private.
  * the register of issued cheques (cheque_issued): written when someone confirms a print, read by
    reports and reminders. Status moves issued -> cleared / bounced / void.
  * received cheques (cheque_received): customers' cheques until they are deposited and cleared.

Reminders: an optional Bale bot and/or SMS line send a daily list. Every server process runs the
reminder loop, but the day's message is claimed with one conditional UPDATE, so it goes out once.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import date, datetime, timedelta
from typing import Any, Optional

import requests

from nejacheque.db import db_connection, utcnow

logger = logging.getLogger("uvicorn.error")

SHARED_KINDS = {"template", "payee", "settings", "book"}
USER_KINDS = {"queue", "prefs"}
MAX_DOC_BYTES = 4_000_000          # a template carries its leaf photo as a data URL
STATUSES = ("issued", "cleared", "bounced", "void")
STATUS_FA = {"issued": "صادرشده", "cleared": "وصول‌شده", "bounced": "برگشتی", "void": "باطل"}
RECEIVED_STATUSES = ("in_hand", "deposited", "cleared", "bounced", "returned", "spent")
RECEIVED_OPEN = ("in_hand", "deposited")      # still waiting for the money
SMS_PROVIDERS = {"kavenegar": "کاوه‌نگار", "smsir": "SMS.ir"}
REMINDER_DOC = ("server", "reminder", "main")
BALE_API = "https://tapi.bale.ai"
_DOC_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
_JDATE = re.compile(r"^\d{4}/\d{2}/\d{2}$")
_GDATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


_TO_ASCII = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def _digits(value: Any) -> str:
    """Only the digits, Persian/Arabic ones turned into ASCII."""
    return re.sub(r"[^0-9]", "", str(value or "").translate(_TO_ASCII))


class ChequeError(ValueError):
    """A request the cheque writer refuses; the message is Persian and shown to the user."""


class ChequeAccessError(PermissionError):
    pass


# ---------------------------------------------------------------- access and users

def role_of(user: dict[str, Any]) -> Optional[str]:
    """'manager' or 'operator' for an active account, else None."""
    return user.get("role") if user.get("is_active") and user.get("role") in ("manager", "operator") else None


def require_role(user: dict[str, Any], manager: bool = False) -> str:
    role = role_of(user)
    if role is None:
        raise ChequeAccessError("این حساب غیرفعال است.")
    if manager and role != "manager":
        raise ChequeAccessError("این کار فقط برای مدیر مجاز است.")
    return role


def list_users() -> list[dict[str, Any]]:
    with db_connection() as conn:
        rows = conn.execute("SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY is_active DESC, full_name, username").fetchall()
    return [{"id": r["id"], "username": r["username"], "name": r["full_name"] or r["username"], "role": r["role"],
             "active": bool(r["is_active"]), "created_at": r["created_at"]} for r in rows]


def _clean_username(value: Any) -> str:
    name = str(value or "").strip()
    if not re.match(r"^[A-Za-z0-9_.@-]{3,40}$", name):
        raise ChequeError("نام کاربری ۳ تا ۴۰ نویسهٔ لاتین، رقم یا . _ - @ باشد.")
    return name


def create_user(data: dict[str, Any]) -> dict[str, Any]:
    from nejacheque.security import hash_password, password_problem
    username, password = _clean_username(data.get("username")), str(data.get("password") or "")
    role = data.get("role") or "operator"
    if role not in ("manager", "operator"):
        raise ChequeError("نقش نامعتبر است.")
    problem = password_problem(password)
    if problem:
        raise ChequeError(problem)
    now = utcnow()
    with db_connection() as conn:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise ChequeError("این نام کاربری از قبل هست.")
        cur = conn.execute("INSERT INTO users (username, full_name, password_hash, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
                           (username, _clean(data.get("name"), 120), hash_password(password), role, now, now))
        new_id = cur.lastrowid
    return next(u for u in list_users() if u["id"] == new_id)


def update_user(user_id: int, data: dict[str, Any], by: dict[str, Any]) -> dict[str, Any]:
    from nejacheque.security import hash_password, password_problem
    sets, args = [], []
    if "name" in data:
        sets.append("full_name = ?"); args.append(_clean(data["name"], 120))
    if "role" in data:
        if data["role"] not in ("manager", "operator"):
            raise ChequeError("نقش نامعتبر است.")
        sets.append("role = ?"); args.append(data["role"])
    if "active" in data:
        sets.append("is_active = ?"); args.append(1 if data["active"] else 0)
    if data.get("password"):
        problem = password_problem(str(data["password"]))
        if problem:
            raise ChequeError(problem)
        sets.append("password_hash = ?"); args.append(hash_password(str(data["password"])))
    if not sets:
        raise ChequeError("تغییری فرستاده نشد.")
    with db_connection() as conn:
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise ChequeError("کاربر پیدا نشد.")
        losing = target["role"] == "manager" and target["is_active"] and (data.get("role") == "operator" or data.get("active") is False)
        if losing and conn.execute("SELECT COUNT(*) FROM users WHERE role = 'manager' AND is_active = 1").fetchone()[0] <= 1:
            raise ChequeError("دست‌کم یک مدیر فعال باید بماند.")
        conn.execute(f"UPDATE users SET {', '.join(sets)}, updated_at = ? WHERE id = ?", (*args, utcnow(), user_id))
        if data.get("active") is False or data.get("password"):
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return next(u for u in list_users() if u["id"] == user_id)


# ---------------------------------------------------------------- documents

def _scope(kind: str, user_id: int) -> str:
    if kind in SHARED_KINDS:
        return "shared"
    if kind in USER_KINDS:
        return f"user:{user_id}"
    raise ChequeError("نوع سند نامعتبر است.")


def _check_id(doc_id: str) -> str:
    if not _DOC_ID.match(doc_id or ""):
        raise ChequeError("شناسهٔ سند نامعتبر است.")
    return doc_id


def save_doc(kind: str, doc_id: str, data: Any, user_id: int) -> str:
    scope, doc_id = _scope(kind, user_id), _check_id(doc_id)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > MAX_DOC_BYTES:
        raise ChequeError("این سند خیلی بزرگ است؛ تصویر برگه را کوچک‌تر کنید.")
    now = utcnow()
    with db_connection() as conn:
        conn.execute(
            """INSERT INTO cheque_docs (scope, kind, doc_id, data_json, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(scope, kind, doc_id) DO UPDATE SET data_json = excluded.data_json,
                   updated_at = excluded.updated_at, updated_by = excluded.updated_by""",
            (scope, kind, doc_id, raw, now, user_id),
        )
    return now


def delete_doc(kind: str, doc_id: str, user_id: int) -> None:
    with db_connection() as conn:
        conn.execute("DELETE FROM cheque_docs WHERE scope = ? AND kind = ? AND doc_id = ?",
                     (_scope(kind, user_id), kind, _check_id(doc_id)))


def _docs(conn, scope: str) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    for row in conn.execute("SELECT kind, doc_id, data_json FROM cheque_docs WHERE scope = ? ORDER BY updated_at",
                            (scope,)):
        try:
            data = json.loads(row["data_json"])
        except ValueError:
            continue
        out.setdefault(row["kind"], []).append({"id": row["doc_id"], "data": data})
    return out


def bootstrap(user: dict[str, Any]) -> dict[str, Any]:
    role = require_role(user)
    with db_connection() as conn:
        shared, mine = _docs(conn, "shared"), _docs(conn, f"user:{user['id']}")
    return {
        "me": {"id": user["id"], "name": user.get("full_name") or user.get("username"), "role": role},
        "templates": [d["data"] for d in shared.get("template", [])],
        "payees": [d["data"] for d in shared.get("payee", [])],
        "books": [d["data"] for d in shared.get("book", [])],
        "settings": (shared.get("settings") or [{"data": {}}])[-1]["data"],
        "queue": (mine.get("queue") or [{"data": None}])[-1]["data"],
        "prefs": (mine.get("prefs") or [{"data": {}}])[-1]["data"],
        "issued": list_issued(),
        "received": list_received(),
    }


# ---------------------------------------------------------------- register of issued cheques

def _issued_row(r) -> dict[str, Any]:
    d = dict(r)
    d["printed_by_name"] = d.pop("printer_name", None) or ""
    return d


def list_issued(limit: int = 5000) -> list[dict[str, Any]]:
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT i.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS printer_name
               FROM cheque_issued i LEFT JOIN users u ON u.id = i.printed_by
               ORDER BY i.id DESC LIMIT ?""", (limit,)).fetchall()
    return [_issued_row(r) for r in rows]


def _clean(value: Any, size: int) -> str:
    return str(value or "").strip()[:size]


def add_issued(items: list[dict[str, Any]], user_id: int) -> list[dict[str, Any]]:
    if not isinstance(items, list) or not items or len(items) > 500:
        raise ChequeError("فهرست چک‌ها خالی یا بیش از حد بزرگ است.")
    now = utcnow()
    ids = []
    with db_connection() as conn:
        for it in items:
            amount = _digits(it.get("amount"))
            due_date, due_on = str(it.get("due_date") or "").strip(), str(it.get("due_on") or "").strip()
            if not amount or len(amount) > 18:
                raise ChequeError("مبلغ چک نامعتبر است.")
            if not _JDATE.match(due_date) or not _GDATE.match(due_on):
                raise ChequeError("تاریخ سررسید نامعتبر است.")
            cur = conn.execute(
                """INSERT INTO cheque_issued (client_id, bank, template, due_date, due_on, amount, payee, payee_id,
                       reason, sayad, note, status, printed_by, printed_at, updated_at, updated_by, book_id, serial)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?)""",
                (_clean(it.get("client_id"), 32), _clean(it.get("bank"), 80), _clean(it.get("template"), 120),
                 due_date, due_on, amount, _clean(it.get("payee"), 200), _digits(it.get("payee_id"))[:11],
                 _clean(it.get("reason"), 300), _digits(it.get("sayad"))[:16], _clean(it.get("note"), 500),
                 user_id, now, now, user_id, _clean(it.get("book_id"), 64), _clean(it.get("serial"), 40)),
            )
            ids.append(cur.lastrowid)
    return [r for r in list_issued() if r["id"] in ids]


def update_issued(issued_id: int, changes: dict[str, Any], user_id: int) -> dict[str, Any]:
    sets, args = [], []
    if "status" in changes:
        if changes["status"] not in STATUSES:
            raise ChequeError("وضعیت نامعتبر است.")
        sets.append("status = ?"); args.append(changes["status"])
    for key, size in (("status_note", 300), ("note", 500)):
        if key in changes:
            sets.append(f"{key} = ?"); args.append(_clean(changes[key], size))
    if not sets:
        raise ChequeError("تغییری فرستاده نشد.")
    with db_connection() as conn:
        cur = conn.execute(f"UPDATE cheque_issued SET {', '.join(sets)}, updated_at = ?, updated_by = ? WHERE id = ?",
                           (*args, utcnow(), user_id, issued_id))
        if not cur.rowcount:
            raise ChequeError("این چک در فهرست نیست.")
    return next(r for r in list_issued() if r["id"] == issued_id)


def delete_issued(issued_id: int) -> None:
    with db_connection() as conn:
        conn.execute("DELETE FROM cheque_issued WHERE id = ?", (issued_id,))


# ---------------------------------------------------------------- received cheques

_RECEIVED_TEXT = {"drawer": 200, "bank": 80, "branch": 120, "serial": 40, "received_date": 10, "reason": 300, "note": 500, "status_note": 300}


def list_received(limit: int = 5000) -> list[dict[str, Any]]:
    with db_connection() as conn:
        rows = conn.execute(
            """SELECT r.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS created_by_name
               FROM cheque_received r LEFT JOIN users u ON u.id = r.created_by ORDER BY r.id DESC LIMIT ?""", (limit,)).fetchall()
    return [dict(r) for r in rows]


def _received_values(data: dict[str, Any], partial: bool) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, size in _RECEIVED_TEXT.items():
        if key in data:
            out[key] = _clean(data[key], size)
    for key, size in (("drawer_id", 11), ("sayad", 16)):
        if key in data:
            out[key] = _digits(data[key])[:size]
    if "amount" in data or not partial:
        amount = _digits(data.get("amount"))
        if not amount or len(amount) > 18:
            raise ChequeError("مبلغ چک نامعتبر است.")
        out["amount"] = amount
    if "due_date" in data or not partial:
        due_date, due_on = str(data.get("due_date") or "").strip(), str(data.get("due_on") or "").strip()
        if not _JDATE.match(due_date) or not _GDATE.match(due_on):
            raise ChequeError("تاریخ سررسید نامعتبر است.")
        out.update(due_date=due_date, due_on=due_on)
    if "status" in data:
        if data["status"] not in RECEIVED_STATUSES:
            raise ChequeError("وضعیت نامعتبر است.")
        out["status"] = data["status"]
    if not partial and not out.get("drawer"):
        raise ChequeError("نام صادرکنندهٔ چک را بنویسید.")
    return out


def add_received(data: dict[str, Any], user_id: int) -> dict[str, Any]:
    values = _received_values(data, partial=False)
    now = utcnow()
    values.update(created_by=user_id, created_at=now, updated_at=now, updated_by=user_id)
    with db_connection() as conn:
        cur = conn.execute(f"INSERT INTO cheque_received ({', '.join(values)}) VALUES ({', '.join('?' * len(values))})", tuple(values.values()))
        new_id = cur.lastrowid
    return next(r for r in list_received() if r["id"] == new_id)


def update_received(received_id: int, data: dict[str, Any], user_id: int) -> dict[str, Any]:
    values = _received_values(data, partial=True)
    if not values:
        raise ChequeError("تغییری فرستاده نشد.")
    values.update(updated_at=utcnow(), updated_by=user_id)
    with db_connection() as conn:
        cur = conn.execute(f"UPDATE cheque_received SET {', '.join(k + ' = ?' for k in values)} WHERE id = ?", (*values.values(), received_id))
        if not cur.rowcount:
            raise ChequeError("این چک در فهرست نیست.")
    return next(r for r in list_received() if r["id"] == received_id)


def delete_received(received_id: int) -> None:
    with db_connection() as conn:
        conn.execute("DELETE FROM cheque_received WHERE id = ?", (received_id,))


def received_due(conn, days: int, today: Optional[date] = None) -> tuple[list[Any], list[Any]]:
    """(overdue, due within `days`) received cheques whose money has not arrived yet."""
    today = today or date.today()
    end = (today + timedelta(days=days)).isoformat()
    rows = conn.execute(f"""SELECT * FROM cheque_received WHERE status IN ({','.join('?' * len(RECEIVED_OPEN))}) AND due_on <= ?
                            ORDER BY due_on""", (*RECEIVED_OPEN, end)).fetchall()
    return [r for r in rows if r["due_on"] < today.isoformat()], [r for r in rows if r["due_on"] >= today.isoformat()]


def due_soon(conn, days: int, today: Optional[date] = None) -> tuple[list[Any], list[Any]]:
    """(overdue, due within `days`) cheques still marked issued."""
    today = today or date.today()
    end = (today + timedelta(days=days)).isoformat()
    rows = conn.execute("""SELECT * FROM cheque_issued WHERE status = 'issued' AND due_on <= ? ORDER BY due_on""",
                        (end,)).fetchall()
    return [r for r in rows if r["due_on"] < today.isoformat()], [r for r in rows if r["due_on"] >= today.isoformat()]


# ---------------------------------------------------------------- backup

def backup() -> dict[str, Any]:
    with db_connection() as conn:
        docs = [dict(r) for r in conn.execute("SELECT kind, doc_id, data_json FROM cheque_docs WHERE scope = 'shared'")]
        issued = [dict(r) for r in conn.execute("SELECT * FROM cheque_issued ORDER BY id")]
        received = [dict(r) for r in conn.execute("SELECT * FROM cheque_received ORDER BY id")]
    return {"chequenegar_backup": 1, "created_at": utcnow(),
            "docs": [{"kind": d["kind"], "id": d["doc_id"], "data": json.loads(d["data_json"])} for d in docs],
            "issued": issued, "received": received}


def restore(data: dict[str, Any], user_id: int) -> dict[str, int]:
    """Replaces the shared documents and the register with a backup (private queues are kept)."""
    if not isinstance(data, dict) or data.get("chequenegar_backup") != 1:
        raise ChequeError("این فایل پشتیبان نژا چک نیست.")
    docs, issued, received = data.get("docs") or [], data.get("issued") or [], data.get("received") or []
    now = utcnow()
    cols = ("client_id", "bank", "template", "due_date", "due_on", "amount", "payee", "payee_id", "reason", "sayad",
            "note", "status", "status_note", "printed_by", "printed_at", "updated_at", "updated_by", "book_id", "serial")
    rcols = ("drawer", "drawer_id", "bank", "branch", "sayad", "serial", "amount", "due_date", "due_on", "received_date", "reason",
             "note", "status", "status_note", "created_by", "created_at", "updated_at", "updated_by")
    ints = ("printed_by", "updated_by", "created_by")
    with db_connection() as conn:
        conn.execute("DELETE FROM cheque_docs WHERE scope = 'shared'")
        conn.execute("DELETE FROM cheque_issued")
        conn.execute("DELETE FROM cheque_received")
        for d in docs:
            if d.get("kind") not in SHARED_KINDS:
                continue
            conn.execute("INSERT INTO cheque_docs (scope, kind, doc_id, data_json, updated_at, updated_by) VALUES ('shared', ?, ?, ?, ?, ?)",
                         (d["kind"], _check_id(str(d.get("id"))), json.dumps(d.get("data"), ensure_ascii=False), now, user_id))
        for r in issued:
            if r.get("status") not in STATUSES:
                r["status"] = "issued"
            conn.execute(f"INSERT INTO cheque_issued ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                         tuple(r.get(c) if r.get(c) is not None else (None if c in ints else "") for c in cols))
        for r in received:
            if r.get("status") not in RECEIVED_STATUSES:
                r["status"] = "in_hand"
            conn.execute(f"INSERT INTO cheque_received ({', '.join(rcols)}) VALUES ({', '.join('?' * len(rcols))})",
                         tuple(r.get(c) if r.get(c) is not None else (None if c in ints else now if c.endswith("_at") else "") for c in rcols))
    return {"docs": len(docs), "issued": len(issued), "received": len(received)}


# ---------------------------------------------------------------- reminders

def _reminder_raw(conn) -> dict[str, Any]:
    row = conn.execute("SELECT data_json FROM cheque_docs WHERE scope = ? AND kind = ? AND doc_id = ?", REMINDER_DOC).fetchone()
    try:
        return json.loads(row["data_json"]) if row else {}
    except ValueError:
        return {}


def reminder_settings(public: bool = True) -> dict[str, Any]:
    with db_connection() as conn:
        raw = _reminder_raw(conn)
    out = {"enabled": bool(raw.get("enabled")), "days": int(raw.get("days") or 3), "hour": int(raw.get("hour") or 9),
           "chat_ids": raw.get("chat_ids") or [], "last_sent": raw.get("last_sent") or "", "has_token": bool(raw.get("token")),
           "sms_enabled": bool(raw.get("sms_enabled")), "sms_provider": raw.get("sms_provider") or "kavenegar",
           "sms_sender": raw.get("sms_sender") or "", "sms_numbers": raw.get("sms_numbers") or [], "has_sms_key": bool(raw.get("sms_key")),
           "providers": SMS_PROVIDERS}
    if not public:
        from nejacheque.security import decrypt_secret
        out["token"] = decrypt_secret(raw["token"]) if raw.get("token") else ""
        out["sms_key"] = decrypt_secret(raw["sms_key"]) if raw.get("sms_key") else ""
    return out


def save_reminder_settings(data: dict[str, Any], user_id: int) -> dict[str, Any]:
    from nejacheque.security import encrypt_secret
    with db_connection() as conn:
        raw = _reminder_raw(conn)
        raw["enabled"] = bool(data.get("enabled"))
        raw["days"] = max(0, min(60, int(data.get("days") or 3)))
        raw["hour"] = max(0, min(23, int(data.get("hour") or 9)))
        chats = [str(c).strip() for c in (data.get("chat_ids") or []) if re.match(r"^-?\d{3,20}$", str(c).strip())]
        raw["chat_ids"] = chats[:10]
        token = str(data.get("token") or "").strip()
        if token:
            raw["token"] = encrypt_secret(token)
        elif data.get("clear_token"):
            raw.pop("token", None)
        if "sms_enabled" in data:
            raw["sms_enabled"] = bool(data.get("sms_enabled"))
            provider = str(data.get("sms_provider") or "kavenegar")
            if provider not in SMS_PROVIDERS:
                raise ChequeError("سامانهٔ پیامک نامعتبر است.")
            raw["sms_provider"] = provider
            raw["sms_sender"] = _digits(data.get("sms_sender"))[:20]
            numbers = [_mobile(n) for n in (data.get("sms_numbers") or [])]
            raw["sms_numbers"] = [n for n in numbers if n][:10]
            key = str(data.get("sms_key") or "").strip()
            if key:
                raw["sms_key"] = encrypt_secret(key)
        conn.execute(
            """INSERT INTO cheque_docs (scope, kind, doc_id, data_json, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(scope, kind, doc_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at,
                   updated_by = excluded.updated_by""",
            (*REMINDER_DOC, json.dumps(raw, ensure_ascii=False), utcnow(), user_id),
        )
    return reminder_settings()


def _bale(token: str, method: str, data: Optional[dict] = None) -> Any:
    try:
        response = requests.post(f"{BALE_API}/bot{token}/{method}", data=data or {}, timeout=(10, 30))
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise ChequeError("ارتباط با بله برقرار نشد.") from exc
    if not body.get("ok"):
        if response.status_code in (401, 404):
            raise ChequeError("توکن ربات بله نامعتبر است.")
        raise ChequeError(str(body.get("description") or "خطای بله"))
    return body.get("result")


def discover_chats(token: str) -> list[dict[str, Any]]:
    """Chats that recently wrote to the bot, so a manager can pick a chat id instead of hunting for it."""
    token = token or reminder_settings(public=False).get("token") or ""
    if not token:
        raise ChequeError("اول توکن ربات بله را وارد کنید.")
    seen: dict[str, dict[str, Any]] = {}
    for upd in _bale(token, "getUpdates", {"limit": 100}) or []:
        chat = ((upd.get("message") or upd.get("channel_post") or {}).get("chat")) or {}
        if chat.get("id") is not None:
            name = chat.get("title") or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")])) or chat.get("username") or ""
            seen[str(chat["id"])] = {"id": str(chat["id"]), "name": name, "type": chat.get("type", "")}
    return list(seen.values())


def _mobile(value: Any) -> str:
    """09xxxxxxxxx from 09.., 9.., +989.., 00989.. (Persian digits allowed); '' if it is not a mobile number."""
    digits = _digits(value)
    for prefix in ("0098", "98"):
        if digits.startswith(prefix) and len(digits) == len(prefix) + 10:
            digits = "0" + digits[len(prefix):]
    if len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits if re.match(r"^09\d{9}$", digits) else ""


def send_sms(provider: str, key: str, sender: str, numbers: list[str], text: str) -> None:
    if not key or not numbers:
        raise ChequeError("کلید سامانهٔ پیامک و دست‌کم یک شماره لازم است.")
    try:
        if provider == "kavenegar":
            response = requests.post(f"https://api.kavenegar.com/v1/{key}/sms/send.json",
                                     data={"receptor": ",".join(numbers), "sender": sender, "message": text}, timeout=(10, 30))
            body = response.json()
            ok = (body.get("return") or {}).get("status") == 200
            message = (body.get("return") or {}).get("message")
        elif provider == "smsir":
            response = requests.post("https://api.sms.ir/v1/send/bulk", headers={"X-API-KEY": key, "Accept": "application/json"},
                                     json={"lineNumber": int(sender or 0), "messageText": text, "mobiles": numbers}, timeout=(10, 30))
            body = response.json()
            ok = body.get("status") == 1
            message = body.get("message")
        else:
            raise ChequeError("سامانهٔ پیامک نامعتبر است.")
    except requests.RequestException as exc:
        raise ChequeError("ارتباط با سامانهٔ پیامک برقرار نشد.") from exc
    except ValueError as exc:
        raise ChequeError("پاسخ سامانهٔ پیامک خوانا نبود.") from exc
    if not ok:
        raise ChequeError(f"سامانهٔ پیامک پیام را نپذیرفت: {message or response.status_code}")


def _fmt_amount(amount: str) -> str:
    return f"{int(amount):,}".replace(",", "٬").translate(_FA_DIGITS)


def reminder_text(days: int, today: Optional[date] = None, short: bool = False) -> Optional[str]:
    with db_connection() as conn:
        overdue, soon = due_soon(conn, days, today)
        r_overdue, r_soon = received_due(conn, days, today)
    if not (overdue or soon or r_overdue or r_soon):
        return None
    fa = lambda n: str(n).translate(_FA_DIGITS)
    total = lambda rows: _fmt_amount(str(sum(int(r["amount"]) for r in rows)))
    if short:                                   # SMS: one short message
        parts = []
        if overdue or soon:
            parts.append(f"صادره: {fa(len(overdue))} سررسیدگذشته، {fa(len(soon))} تا {fa(days)} روز ({total(overdue + soon)} ریال)")
        if r_overdue or r_soon:
            parts.append(f"دریافتی: {fa(len(r_overdue))} سررسیدگذشته، {fa(len(r_soon))} تا {fa(days)} روز ({total(r_overdue + r_soon)} ریال)")
        return "یادآوری نژا چک — " + "؛ ".join(parts)
    lines = ["🔔 یادآوری نژا چک"]
    sections = (("چک‌های صادره — سررسید گذشته و هنوز وصول‌نشده:", overdue, "payee"),
                (f"چک‌های صادره — سررسید تا {fa(days)} روز آینده:", soon, "payee"),
                ("چک‌های دریافتی — سررسید گذشته و هنوز وصول‌نشده:", r_overdue, "drawer"),
                (f"چک‌های دریافتی — سررسید تا {fa(days)} روز آینده (برای خواباندن به حساب):", r_soon, "drawer"))
    for title, rows, who in sections:
        if rows:
            lines.append("")
            lines.append(title)
            for r in rows[:30]:
                lines.append(f"• {r['due_date'].translate(_FA_DIGITS)} — {r[who] or 'بی‌نام'} — {_fmt_amount(r['amount'])} ریال ({r['bank']})")
    return "\n".join(lines)


def send_reminders(force: bool = False, now: Optional[datetime] = None, channel: str = "") -> int:
    """Sends today's list once over Bale and/or SMS; returns how many chats/numbers it went to.
    force (the "send a test" button) sends now over one `channel`, even with nothing due."""
    now = now or datetime.now()
    cfg = reminder_settings(public=False)
    bale_on = bool(cfg.get("token") and cfg["chat_ids"]) and (cfg["enabled"] if not force else channel == "bale")
    sms_on = bool(cfg.get("sms_key") and cfg["sms_numbers"]) and (cfg["sms_enabled"] if not force else channel == "sms")
    if force and not (bale_on or sms_on):
        raise ChequeError("توکن ربات و دست‌کم یک گفتگو لازم است." if channel == "bale" else "کلید سامانهٔ پیامک و دست‌کم یک شماره لازم است.")
    if not force and (not (bale_on or sms_on) or now.hour < cfg["hour"] or cfg["last_sent"] == now.date().isoformat()):
        return 0
    text = reminder_text(cfg["days"], now.date())
    if not force:
        # claim today's run (one process wins when several run this loop)
        with db_connection() as conn:
            raw = _reminder_raw(conn)
            if raw.get("last_sent") == now.date().isoformat():
                return 0
            prev = json.dumps(raw, ensure_ascii=False)
            raw["last_sent"] = now.date().isoformat()
            cur = conn.execute("UPDATE cheque_docs SET data_json = ? WHERE scope = ? AND kind = ? AND doc_id = ? AND data_json = ?",
                               (json.dumps(raw, ensure_ascii=False), *REMINDER_DOC, prev))
            if not cur.rowcount:
                return 0
    if not text:
        if force:
            text = "🔔 نژا چک: چکی در روزهای پیش رو سررسید ندارد."
        else:
            return 0
    sent = 0
    if bale_on:
        for chat in cfg["chat_ids"]:
            try:
                _bale(cfg["token"], "sendMessage", {"chat_id": chat, "text": text})
                sent += 1
            except ChequeError as exc:
                if force:
                    raise
                logger.warning("Cheque reminder to %s failed: %s", chat, exc)
    if sms_on:
        short = reminder_text(cfg["days"], now.date(), short=True) or "یادآوری نژا چک: چکی در روزهای پیش رو سررسید ندارد."
        try:
            send_sms(cfg["sms_provider"], cfg["sms_key"], cfg["sms_sender"], cfg["sms_numbers"], short)
            sent += len(cfg["sms_numbers"])
        except ChequeError as exc:
            if force:
                raise
            logger.warning("Cheque SMS reminder failed: %s", exc)
    return sent


_thread: Optional[threading.Thread] = None
_stop = threading.Event()


def start_reminder_worker() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return

    def loop() -> None:
        while not _stop.wait(600):
            try:
                send_reminders()
            except Exception as exc:  # noqa: BLE001 - a bad token or network must not kill the loop
                logger.warning("Cheque reminder loop: %s", exc)

    _stop.clear()
    _thread = threading.Thread(target=loop, name="cheque-reminders", daemon=True)
    _thread.start()


def due_count() -> int:
    """Issued and received cheques that are overdue or fall due within the reminder window."""
    with db_connection() as conn:
        days = int(_reminder_raw(conn).get("days") or 3)
        return sum(len(rows) for rows in (*due_soon(conn, days), *received_due(conn, days)))
