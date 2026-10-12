"""Neja Cheque web server: the pages, sign-in, users and the /api/cheque/* API.

Run:  uvicorn nejacheque.app:app --host 0.0.0.0 --port 8080
The first visit to /login asks for a manager account when there are no users yet.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

from fastapi import Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from nejacheque import __version__
from nejacheque import service as cs
from nejacheque.config import WEB_DIR, settings
from nejacheque.db import db_connection, init_db, log, utcnow
from nejacheque.security import hash_password, new_session_token, password_problem, token_hash, verify_password

COOKIE = "nejacheque_session"
User = Dict[str, Any]

app = FastAPI(title="Neja Cheque", version=__version__, docs_url=None, redoc_url=None)
app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")


@app.on_event("startup")
def startup() -> None:
    init_db()
    if settings.reminders:
        cs.start_reminder_worker()


@app.middleware("http")
async def headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-cache"
    return response


def _error(status: int, kind: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"type": kind, "message": message}})


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


# ---------------------------------------------------------------- pages

@app.get("/", include_in_schema=False)
def page_app():
    return FileResponse(WEB_DIR / "index.html", media_type="text/html")


@app.get("/login", include_in_schema=False)
def page_login():
    return FileResponse(WEB_DIR / "login.html", media_type="text/html")


@app.get("/cheque", include_in_schema=False)
def page_cheque_alias():
    return RedirectResponse("/")


@app.get("/health", include_in_schema=False)
def health():
    return {"ok": True, "version": __version__}


# ---------------------------------------------------------------- sessions

def current_user(request: Request) -> User:
    token = request.cookies.get(COOKIE, "")
    if not token:
        raise _error(401, "authentication_required", "ابتدا وارد شوید.")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    with db_connection() as conn:
        row = conn.execute("""SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                              WHERE s.token_hash = ? AND s.expires_at > ?""", (token_hash(token), now)).fetchone()
    if not row:
        raise _error(401, "invalid_session", "نشست شما تمام شده؛ دوباره وارد شوید.")
    user = dict(row)
    if not user["is_active"]:
        raise _error(403, "inactive_user", "این حساب غیرفعال است.")
    return user


def _public(user: User) -> Dict[str, Any]:
    return {"id": user["id"], "username": user["username"], "name": user["full_name"] or user["username"], "role": user["role"]}


def _start_session(response: Response, user_id: int) -> None:
    token, now = new_session_token(), datetime.now(timezone.utc).replace(microsecond=0)
    with db_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(),))
        conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                     (token_hash(token), user_id, now.isoformat(), (now + timedelta(days=settings.session_days)).isoformat()))
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=settings.cookie_secure,
                        max_age=settings.session_days * 86400, path="/")


_attempts: dict[str, deque] = defaultdict(deque)


def _rate_limit(key: str, limit: int = 8, window: int = 300) -> None:
    q, now = _attempts[key], time.monotonic()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise _error(429, "rate_limited", "تلاش‌های زیادی شد؛ چند دقیقه بعد دوباره امتحان کنید.")
    q.append(now)


def _user_count() -> int:
    with db_connection() as conn:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]


@app.get("/api/auth/state")
def auth_state():
    return {"setup_needed": _user_count() == 0, "version": __version__}


@app.post("/api/auth/setup")
def auth_setup(request: Request, response: Response, body: Dict[str, Any] = Body(...)):
    """First run only: the first account is a manager."""
    if _user_count():
        raise _error(409, "already_set_up", "حساب مدیر از قبل ساخته شده است.")
    try:
        user = cs.create_user({**body, "role": "manager"})
    except cs.ChequeError as exc:
        raise _error(422, "invalid", str(exc)) from exc
    _start_session(response, user["id"])
    with db_connection() as conn:
        log(conn, user["id"], "setup", user["id"], ip=_ip(request))
    return {"user": user}


@app.post("/api/auth/login")
def auth_login(request: Request, response: Response, body: Dict[str, Any] = Body(...)):
    username, password = str(body.get("username") or "").strip(), str(body.get("password") or "")
    _rate_limit(f"{_ip(request)}:{username.lower()}")
    with db_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        raise _error(401, "invalid_credentials", "نام کاربری یا رمز عبور درست نیست.")
    if not row["is_active"]:
        raise _error(403, "inactive_user", "این حساب غیرفعال است.")
    _start_session(response, row["id"])
    with db_connection() as conn:
        log(conn, row["id"], "login", row["id"], ip=_ip(request))
    return {"user": _public(dict(row))}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE, "")
    if token:
        with db_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(user: User = Depends(current_user)):
    return {"user": _public(user)}


@app.post("/api/auth/password")
def auth_password(request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(current_user)):
    _rate_limit(f"pw:{user['id']}")
    if not verify_password(str(body.get("current") or ""), user["password_hash"]):
        raise _error(422, "invalid", "رمز فعلی درست نیست.")
    problem = password_problem(str(body.get("new") or ""))
    if problem:
        raise _error(422, "invalid", problem)
    with db_connection() as conn:
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (hash_password(str(body["new"])), utcnow(), user["id"]))
        log(conn, user["id"], "password_changed", user["id"], ip=_ip(request))
    return {"ok": True}


# ---------------------------------------------------------------- cheque API

def _run(call: Callable[[], Any]) -> Any:
    try:
        return call()
    except cs.ChequeAccessError as exc:
        raise _error(403, "cheque_forbidden", str(exc)) from exc
    except cs.ChequeError as exc:
        raise _error(422, "cheque", str(exc)) from exc


def _log(user: User, request: Request, action: str, entity_id: Any = "", detail: str = "") -> None:
    with db_connection() as conn:
        log(conn, user["id"], action, entity_id, detail, _ip(request))


def operator(user: User = Depends(current_user)) -> User:
    _run(lambda: cs.require_role(user))
    return user


def manager(user: User = Depends(current_user)) -> User:
    _run(lambda: cs.require_role(user, manager=True))
    return user


@app.get("/api/cheque/bootstrap")
def cheque_bootstrap(user: User = Depends(operator)):
    return _run(lambda: cs.bootstrap(user))


@app.get("/api/cheque/access")
def cheque_access(user: User = Depends(current_user)):
    role = cs.role_of(user)
    return {"role": role, "due": cs.due_count() if role else 0}


@app.put("/api/cheque/docs/{kind}/{doc_id}")
def cheque_save_doc(kind: str, doc_id: str, data: Any = Body(...), user: User = Depends(operator)):
    return _run(lambda: {"updated_at": cs.save_doc(kind, doc_id, data, user["id"])})


@app.delete("/api/cheque/docs/{kind}/{doc_id}")
def cheque_delete_doc(kind: str, doc_id: str, user: User = Depends(operator)):
    return _run(lambda: (cs.delete_doc(kind, doc_id, user["id"]), {"ok": True})[1])


@app.get("/api/cheque/issued")
def cheque_issued(user: User = Depends(operator)):
    return {"items": cs.list_issued()}


@app.post("/api/cheque/issued")
def cheque_add_issued(request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(operator)):
    rows = _run(lambda: cs.add_issued(body.get("items") or [], user["id"]))
    _log(user, request, "cheque_printed", ",".join(str(r["id"]) for r in rows))
    return {"items": rows}


@app.patch("/api/cheque/issued/{issued_id}")
def cheque_update_issued(issued_id: int, request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(operator)):
    row = _run(lambda: cs.update_issued(issued_id, body, user["id"]))
    if "status" in body:
        _log(user, request, "cheque_status", issued_id, str(body["status"]))
    return row


@app.delete("/api/cheque/issued/{issued_id}")
def cheque_delete_issued(issued_id: int, request: Request, user: User = Depends(manager)):
    cs.delete_issued(issued_id)
    _log(user, request, "cheque_deleted", issued_id)
    return {"ok": True}


@app.get("/api/cheque/received")
def cheque_received(user: User = Depends(operator)):
    return {"items": cs.list_received()}


@app.post("/api/cheque/received")
def cheque_add_received(request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(operator)):
    row = _run(lambda: cs.add_received(body, user["id"]))
    _log(user, request, "received_added", row["id"])
    return row


@app.patch("/api/cheque/received/{received_id}")
def cheque_update_received(received_id: int, request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(operator)):
    row = _run(lambda: cs.update_received(received_id, body, user["id"]))
    if "status" in body:
        _log(user, request, "received_status", received_id, str(body["status"]))
    return row


@app.delete("/api/cheque/received/{received_id}")
def cheque_delete_received(received_id: int, request: Request, user: User = Depends(manager)):
    cs.delete_received(received_id)
    _log(user, request, "received_deleted", received_id)
    return {"ok": True}


# ---------------------------------------------------------------- manager: users, backup, reminders

@app.get("/api/users")
def users_list(user: User = Depends(manager)):
    return {"items": cs.list_users()}


@app.post("/api/users")
def users_create(request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(manager)):
    row = _run(lambda: cs.create_user(body))
    _log(user, request, "user_created", row["id"], row["username"])
    return row


@app.patch("/api/users/{user_id}")
def users_update(user_id: int, request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(manager)):
    if user_id == user["id"] and (body.get("active") is False or body.get("role") == "operator"):
        raise _error(422, "invalid", "نقش یا وضعیت حساب خودتان را این‌جا نمی‌توانید عوض کنید.")
    row = _run(lambda: cs.update_user(user_id, body, user))
    _log(user, request, "user_updated", user_id, ",".join(k for k in body if k != "password") + (",password" if body.get("password") else ""))
    return row


@app.get("/api/cheque/backup")
def cheque_backup(request: Request, user: User = Depends(manager)):
    _log(user, request, "backup")
    return cs.backup()


@app.post("/api/cheque/restore")
def cheque_restore(request: Request, body: Dict[str, Any] = Body(...), user: User = Depends(manager)):
    result = _run(lambda: cs.restore(body, user["id"]))
    _log(user, request, "restore", detail=str(result))
    return result


@app.get("/api/cheque/reminders")
def cheque_reminders(user: User = Depends(manager)):
    return cs.reminder_settings()


@app.put("/api/cheque/reminders")
def cheque_save_reminders(body: Dict[str, Any] = Body(...), user: User = Depends(manager)):
    return _run(lambda: cs.save_reminder_settings(body, user["id"]))


@app.post("/api/cheque/reminders/discover")
def cheque_discover(body: Dict[str, Any] = Body(default={}), user: User = Depends(manager)):
    return _run(lambda: {"items": cs.discover_chats(str(body.get("token") or ""))})


@app.post("/api/cheque/reminders/test")
def cheque_test_reminder(body: Dict[str, Any] = Body(default={}), user: User = Depends(manager)):
    channel = "sms" if body.get("channel") == "sms" else "bale"
    return _run(lambda: {"sent": cs.send_reminders(force=True, channel=channel)})


@app.exception_handler(404)
async def not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": {"error": {"type": "not_found", "message": "پیدا نشد."}}})
    return RedirectResponse("/")
