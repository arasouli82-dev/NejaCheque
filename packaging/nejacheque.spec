# PyInstaller recipe: one folder (dist/NejaCheque) with NejaCheque.exe, a private Python and the web files.
#   pip install -r requirements.txt pyinstaller
#   pyinstaller packaging/nejacheque.spec --noconfirm
# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_submodules

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(SPECPATH, "launch.py")],
    pathex=[ROOT],
    datas=[(os.path.join(ROOT, "web"), "web"), (os.path.join(SPECPATH, "nejacheque.ico"), ".")],
    hiddenimports=collect_submodules("uvicorn") + collect_submodules("pystray") + ["nejacheque.app", "nejacheque.tray"],
    excludes=["tkinter", "pytest", "IPython", "matplotlib", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="NejaCheque",
    icon=os.path.join(SPECPATH, "nejacheque.ico"),
    console=False,              # no black window: the program lives as an icon next to the clock (nejacheque/tray.py)
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="NejaCheque", upx=False)
