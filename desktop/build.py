"""Build a portable folder without installing or downloading dependencies."""
from pathlib import Path
import importlib.util
import os
import shutil
import struct
import subprocess
import sys


def main():
    if sys.platform != 'win32' or struct.calcsize('P') != 8:
        raise SystemExit('Build with 64-bit Python on Windows.')
    for module in ['webview', 'PyInstaller']:
        if importlib.util.find_spec(module) is None:
            raise SystemExit('Missing build dependency: ' + module + '. No packages were installed.')

    root = Path(__file__).resolve().parent
    output = root / 'dist' / 'BattleChess'
    if output.exists():
        raise SystemExit('Output already exists: ' + str(output) + '. Move or rename it before rebuilding; its data folder may contain saved games.')

    # Keep packaging caches local to this project instead of touching shared caches.
    temporary = root / '.build-cache' / 'tmp'
    temporary.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, PYINSTALLER_CONFIG_DIR=str(root / '.build-cache'),
                       PYTHONDONTWRITEBYTECODE='1', TEMP=str(temporary), TMP=str(temporary))
    subprocess.run([
        sys.executable, '-B', '-m', 'PyInstaller', '--noconfirm',
        '--distpath', str(root / 'dist'), '--workpath', str(root / 'build'),
        str(root / 'BattleChess.spec'),
    ], cwd=root, env=environment, check=True)
    shutil.copy2(root / 'README.md', output / 'README.md')
    print('Portable game: ' + str(output / 'BattleChess.exe'))


if __name__ == '__main__':
    main()
