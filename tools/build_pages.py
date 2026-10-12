"""Assembles the website for GitHub Pages: docs/ plus the app itself as an online demo at /demo/.

    python tools/build_pages.py _site

The demo is web/ unchanged except its config: no server (everything stays in the visitor's browser),
a download link instead of sign-out, and its own title and description for search engines.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://arasouli82-dev.github.io/NejaCheque/"
DOWNLOAD = "https://github.com/arasouli82-dev/NejaCheque/releases/latest"


def main(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(ROOT / "docs", out)
    demo = out / "demo"
    shutil.copytree(ROOT / "web", demo, ignore=shutil.ignore_patterns("login.html"))
    page = demo / "index.html"
    html = page.read_text(encoding="utf-8")
    replacements = [
        ('window.CHEQUE_CONFIG = {standalone: true, product: "نژا چک", serverName: "نژا چک", loginUrl: "/login"};',
         f'window.CHEQUE_CONFIG = {{standalone: false, demo: true, product: "نژا چک", serverName: "نژا چک", downloadUrl: "{DOWNLOAD}"}};'),
        ("<title>نژا چک</title>",
         "<title>چاپ چک آنلاین رایگان | نژا چک</title>\n"
         f'<link rel="canonical" href="{SITE}demo/">\n'
         f'<meta property="og:image" content="{SITE}og.jpg">\n'
         '<meta property="og:title" content="چاپ چک آنلاین رایگان | نژا چک">'),
        ('<meta name="description" content="نژا چک: صدور، چاپ و پیگیری چک‌های صیادی — ساختهٔ علی رسولی‌نژاد">',
         '<meta name="description" content="چاپ چک صیادی آنلاین و رایگان در مرورگر، بدون نصب: قالب همهٔ بانک‌ها، مبلغ و تاریخ به حروف، چاپ با هر پرینتری.">'),
    ]
    for old, new in replacements:
        if old not in html:
            raise SystemExit(f"demo build: text not found: {old[:60]}")
        html = html.replace(old, new)
    page.write_text(html, encoding="utf-8")
    print(f"site ready in {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "_site"))
