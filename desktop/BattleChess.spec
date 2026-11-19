# Bundle the shared web game and Python; use the system-installed WebView2.
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

desktop = Path(SPECPATH)
a = Analysis(
    [str(desktop / 'main.py')],
    pathex=[str(desktop)],
    datas=[(str(desktop.parent / 'web'), 'web')] + collect_data_files('webview', includes=['js/**/*']),
    hiddenimports=['webview.platforms.winforms', 'webview.platforms.edgechromium'],
    excludes=['PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'gi', 'gtk', 'cefpython3'],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name='BattleChess',
    console=False, upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name='BattleChess', upx=False)
