"""The «نژا چک» icon next to the Windows clock: the program runs in the background and this is its handle.

Click (or double-click) opens the app in the browser; the menu shows the network address, opens the
data folder, and turns the program off. Needs pystray + Pillow (Windows only, see requirements.txt);
when they are missing, run() returns False and the launcher keeps the server in the foreground.
"""
from __future__ import annotations

import os
import webbrowser
from typing import Callable

from nejacheque.config import APP_DIR, BASE_DIR


def _image():
    from PIL import Image, ImageDraw

    for path in (BASE_DIR / "nejacheque.ico", APP_DIR / "nejacheque.ico", BASE_DIR / "packaging" / "nejacheque.ico"):
        if path.exists():
            return Image.open(path)
    # fallback: the ن mark drawn by hand (lapis tile, parchment bowl, saffron dot)
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, 63, 63), 14, fill="#1B3170")
    d.arc((14, 10, 50, 50), 0, 180, fill="#F6F0E2", width=7)
    d.regular_polygon((32, 22, 6), 4, fill="#E0A526")
    return img


def run(port: int, lan: list[str], data_dir, stop: Callable[[], None], first_note: str) -> bool:
    try:
        import pystray
    except Exception:
        return False

    local = f"http://localhost:{port}"

    def open_app(icon=None, item=None):
        webbrowser.open(local)

    def open_url(url):
        return lambda icon, item: webbrowser.open(url)

    def open_data(icon, item):
        try:
            os.startfile(str(data_dir))          # type: ignore[attr-defined]  (Windows)
        except Exception:
            pass

    def quit_app(icon, item):
        icon.visible = False
        stop()
        icon.stop()

    items = [pystray.MenuItem("باز کردن نژا چک", open_app, default=True), pystray.Menu.SEPARATOR]
    if lan:
        items.append(pystray.MenuItem("نشانی برای رایانه‌های دیگر شبکه:", None, enabled=False))
        items += [pystray.MenuItem(f"    http://{ip}:{port}", open_url(f"http://{ip}:{port}")) for ip in lan]
        items.append(pystray.Menu.SEPARATOR)
    items += [pystray.MenuItem("پوشهٔ داده‌ها", open_data), pystray.MenuItem("خاموش کردن نژا چک", quit_app)]

    icon = pystray.Icon("NejaCheque", _image(), f"نژا چک — {local}", pystray.Menu(*items))

    def setup(icon):
        icon.visible = True
        if first_note:
            try:
                icon.notify(first_note, "نژا چک روشن است")
            except Exception:
                pass

    try:
        icon.run(setup)
    except Exception:
        return False
    return True
