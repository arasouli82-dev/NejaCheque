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
    datas=[(os.path.join(ROOT, "web"), "web")],
    hiddenimports=collect_submodules("uvicorn") + ["nejacheque.app"],
    excludes=["tkinter", "pytest", "IPython", "matplotlib", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="NejaCheque",
    icon=os.path.join(SPECPATH, "nejacheque.ico"),
    console=True,               # the window shows the addresses; closing it stops the program
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="NejaCheque", upx=False)
