"""Settings come from environment variables (or a .env file next to the project / the installed program)."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)          # running from the Windows installer build (PyInstaller)
# read-only program files (web/) sit next to the code, or inside the bundle when frozen
BASE_DIR = Path(getattr(sys, "_MEIPASS", "")) if FROZEN else Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
# where a .env may sit: the project folder, or the folder of NejaCheque.exe
APP_DIR = Path(sys.executable).resolve().parent if FROZEN else BASE_DIR


def default_data_dir() -> Path:
    """Project ./data when run from source; a per-machine folder when installed (Program Files is read-only)."""
    if not FROZEN:
        return BASE_DIR / "data"
    if os.name == "nt":
        root = os.getenv("PROGRAMDATA") or os.getenv("LOCALAPPDATA") or str(Path.home())
        return Path(root) / "NejaCheque"
    return Path.home() / ".nejacheque"


def _load_dotenv() -> None:
    env = APP_DIR / ".env"
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
    data_dir=Path(os.getenv("NEJACHEQUE_DATA_DIR", str(default_data_dir()))),
    secret_key=os.getenv("NEJACHEQUE_SECRET_KEY", ""),
    cookie_secure=_flag("NEJACHEQUE_COOKIE_SECURE"),
    session_days=int(os.getenv("NEJACHEQUE_SESSION_DAYS", "14")),
    reminders=_flag("NEJACHEQUE_REMINDERS", True),
)
