"""Settings come from environment variables (or a .env file next to the project)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"


def _load_dotenv() -> None:
    env = BASE_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    return os.getenv(name, "1" if default else "0").strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    data_dir: Path
    secret_key: str
    cookie_secure: bool
    session_days: int
    reminders: bool

    @property
    def db_path(self) -> Path:
        return self.data_dir / "nejacheque.sqlite3"


settings = Settings(
    data_dir=Path(os.getenv("NEJACHEQUE_DATA_DIR", str(BASE_DIR / "data"))),
    secret_key=os.getenv("NEJACHEQUE_SECRET_KEY", ""),
    cookie_secure=_flag("NEJACHEQUE_COOKIE_SECURE"),
    session_days=int(os.getenv("NEJACHEQUE_SESSION_DAYS", "14")),
    reminders=_flag("NEJACHEQUE_REMINDERS", True),
)
