# Battle Chess HTML edition

Open `BattleChess.html` directly from the exported folder. Playing requires no
HTTP server or Python installation. Keep the HTML file, scripts and `assets`
folder together. Both DOS and Amiga sprites, sound and About are included.

Automatic local saves depend on the browser's handling of local files. Use
Disk / Save Game and Load Game to keep and restore a portable JSON save.

To create the folder from the shared web source, run `python -B html/build.py`
from the project root. The output is `html/dist/BattleChess`. The builder
refuses to replace an existing output folder.
