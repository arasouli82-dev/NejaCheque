"""Desktop launcher: what the «نژا چک» icon runs.

Starts the server on a free port (8080 by default), opens the browser, and prints the addresses
other computers on the network can use. If Neja Cheque is already running on this computer, it
just opens the browser at it instead of starting a second copy.

    python -m nejacheque               # same as the icon
    python -m nejacheque --port 9000 --no-browser
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

from nejacheque import __version__
from nejacheque.config import settings

STATE_FILE = "running.json"        # in the data folder: {"port": …} of the copy that is running


def _console_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            ctypes.windll.kernel32.SetConsoleTitleW("Neja Cheque — نژا چک")
        except Exception:
            pass


def _alive(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.5) as r:
            return json.loads(r.read().decode()).get("ok") is True
    except Exception:
        return False


def _free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def _lan_addresses() -> list[str]:
    found = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:      # no packet is sent
            s.connect(("10.255.255.255", 1))
            found.add(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(ip for ip in found if not ip.startswith("127."))


def _running_port() -> int | None:
    try:
        port = int(json.loads((settings.data_dir / STATE_FILE).read_text(encoding="utf-8"))["port"])
    except Exception:
        return None
    return port if _alive(port) else None


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="nejacheque", description="Neja Cheque — نژا چک")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
    parser.add_argument("--host", default=os.getenv("NEJACHEQUE_HOST", "0.0.0.0"), help="0.0.0.0 = reachable from the network")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args(argv)
    _console_utf8()

    existing = _running_port()
    if existing:                               # second click on the icon: reuse the running copy
        print(f"نژا چک از قبل در حال اجراست: http://localhost:{existing}", flush=True)
        if not args.no_browser:
            webbrowser.open(f"http://localhost:{existing}")
        time.sleep(2)
        return

    port = next((p for p in range(args.port, args.port + 20) if _free(p)), None)
    if port is None:
        print(f"درگاه {args.port} تا {args.port + 19} همه در استفاده‌اند؛ با --port درگاه دیگری بدهید.", flush=True)
        input("برای بستن Enter بزنید…")
        return

    import uvicorn
    from nejacheque.app import app

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / STATE_FILE).write_text(json.dumps({"port": port}), encoding="utf-8")

    def announce() -> None:
        for _ in range(100):
            if _alive(port):
                break
            time.sleep(0.1)
        line = "─" * 52
        print(line, flush=True)
        print(f"  نژا چک {__version__} روشن است", flush=True)
        print(f"  روی همین رایانه:   http://localhost:{port}", flush=True)
        for ip in _lan_addresses():
            print(f"  از رایانه‌های شبکه: http://{ip}:{port}")
        print(f"  پوشهٔ داده‌ها:     {settings.data_dir}", flush=True)
        print("  تا وقتی این پنجره باز است، برنامه کار می‌کند. برای خاموش کردن، ببندیدش.", flush=True)
        print(line, flush=True)
        if not args.no_browser:
            webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=announce, daemon=True).start()
    try:
        uvicorn.run(app, host=args.host, port=port, log_level="warning")
    finally:
        try:
            (settings.data_dir / STATE_FILE).unlink()
        except OSError:
            pass


if __name__ == "__main__":
    main()
