# Headless Battle Chess gameplay

`battle-chess-amiga-game-over.mp4` is the updated recording, with original game
sound and the recreated Amiga game-over message held on screen at the end.
It uses the same legal moves and retains both kings. The earlier video is
preserved below.

`battle-chess-amiga.mp4` shows a short legal two-player game using Amiga
graphics and the red uniform palette, including the legal capture `Qxf7#`.
The game then ends at checkmate with both kings on the board. The moves are
`e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#` (Scholar's mate).

The video is rendered by a dedicated headless Chromium with a separate
project-local profile. Frames come from its offscreen game page; audio comes
directly from the game's Web Audio graph. No OS desktop, system browser,
mouse, microphone, or system audio loopback is recorded.

The reusable script is `analysis/record_gameplay.py`. It uses the existing
`websocket-client`, dedicated `chrome-headless-shell.exe`, and FFmpeg; it
does not install anything or use Node.js. From this project root:

```powershell
python -B analysis/record_gameplay.py --browser 'C:\Users\ivanr2\AppData\Local\ms-playwright\chromium_headless_shell-1208\chrome-headless-shell-win64\chrome-headless-shell.exe' --output recordings/new-gameplay.mp4
```

Choose a new output filename; the script preserves existing files. Temporary
frames, audio, logs, recording metadata and the isolated browser profile are
under `.work/`, which is ignored by Git.

`game-over-amiga.png` and `game-over-dos.png` show the recreated original message
boxes, captured from the isolated offscreen game page. The corresponding
`-board.png` files include the final legal checkmate position with both kings.
These are captures of the recreation, not screenshots from the original games.
The earlier `battle-chess-amiga.mp4` predates the addition of these message boxes.
