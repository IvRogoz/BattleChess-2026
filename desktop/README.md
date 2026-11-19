# Battle Chess desktop

This Windows x64 pywebview edition runs the same game and artwork as `../web/`.
The web edition remains available with `python -B web/serve.py`.

## Portable game

Run `BattleChess.exe` from the built `dist/BattleChess/` folder. Keep the whole
folder together, including `_internal/`. The package includes Python and uses
the PC's system-installed Microsoft Edge WebView2 Runtime. No browser runtime
is bundled, installed, or downloaded by the game. WebView2 must already be
available on the target PC. No internet connection is required to play.

The desktop game stores its match and preferences in `data/browser/` next to
the executable. Keep this folder to preserve saved games when moving the game.
The game folder must be writable. Desktop and browser saves are separate;
use **Disk / Save Game** and **Disk / Load Game** to transfer JSON saves.
Saving opens a native file dialog; importing uses the existing file picker.

The asset server binds only `127.0.0.1:18765` and stops when the window closes.
Its stable address preserves autosaves between launches. If that port is
occupied, the desktop game reports the conflict rather than loading another
program's server. The web edition's default port 8765 remains available.

## Run from source

The desktop Python environment needs pywebview, and the PC needs the
system-installed Microsoft Edge WebView2 Runtime.

This build uses Python 3.14.2 x64, pywebview 6.2.1, and PyInstaller 6.18.0.
The Python environment is
`desktop/.venv/`; only pywebview is installed there, with the other existing
build dependencies read from the base Python installation.

From the project root, after dependency setup has been approved and completed:

```powershell
& '.\desktop\.venv\Scripts\python.exe' -B '.\desktop\main.py'
```

## Build the portable folder

The build environment also needs PyInstaller. The build script does not
install packages, download runtimes, or replace an existing portable folder.

```powershell
& '.\desktop\.venv\Scripts\python.exe' -B '.\desktop\build.py'
```

Output: `desktop/dist/BattleChess/BattleChess.exe`, its `_internal/` game/Python
files. Source disks, analysis files, and the older prototype
are not packaged. Packaging caches and temporary build output stay under
`desktop/`. Move or rename a previous output folder before rebuilding to
protect its saved games.

The launcher uses pywebview's
[system WebView2, persistent-profile, and download settings](https://pywebview.flowrl.com/api/).

## Checks without opening a window

```powershell
python -B -m unittest discover -s desktop -p 'test_*.py'
```

These checks use a fake webview and real loopback HTTP. They do not inspect or
control the desktop. Actual native rendering, audio, and file dialogs require
a user-run check after the runtime and pywebview have been supplied.
