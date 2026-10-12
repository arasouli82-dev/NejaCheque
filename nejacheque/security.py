"""Passwords (PBKDF2), session tokens, and encryption of stored secrets (bot token, SMS key)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

from nejacheque.config import settings

PASSWORD_ITERATIONS = 260_000


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", (password or "").encode("utf-8"), _unb64(salt), int(iterations))
        return hmac.compare_digest(actual, _unb64(digest))
    except Exception:
        return False


def password_problem(password: str) -> str:
    if len(password or "") < 8:
        return "رمز عبور باید دست‌کم ۸ نویسه باشد."
    return ""


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---- stored secrets: HMAC-SHA256 keystream + MAC, keyed from NEJACHEQUE_SECRET_KEY (or a key file in data/)

def _key() -> bytes:
    raw = settings.secret_key
    if not raw:
        path = settings.data_dir / "secret.key"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        raw = path.read_text(encoding="utf-8").strip()
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _stream(key: bytes, nonce: bytes, size: int) -> bytes:
    out, counter = b"", 0
    while len(out) < size:
        counter += 1
        out += hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
    return out[:size]


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    key, nonce, plain = _key(), secrets.token_bytes(16), value.encode("utf-8")
    cipher = bytes(a ^ b for a, b in zip(plain, _stream(key, nonce, len(plain))))
    mac = hmac.new(key, nonce + cipher, hashlib.sha256).digest()
    return "v1:" + base64.urlsafe_b64encode(nonce + cipher + mac).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value or not value.startswith("v1:"):
        return value or ""
    key, raw = _key(), base64.urlsafe_b64decode(value[3:].encode("ascii"))
    nonce, cipher, mac = raw[:16], raw[16:-32], raw[-32:]
    if not hmac.compare_digest(mac, hmac.new(key, nonce + cipher, hashlib.sha256).digest()):
        return ""
    return bytes(a ^ b for a, b in zip(cipher, _stream(key, nonce, len(cipher)))).decode("utf-8")
