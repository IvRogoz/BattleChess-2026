# Battle Chess — native browser recreation

The original 1988 game's supplied artwork, title, perspective board, flat board,
walking and turning sprites, rook transformations, paired capture sequences and
sound blocks, connected to a native JavaScript chess engine. This does not run
DOS or emulate the original CPU. The separate `battlechess-web/` fantasy prototype
is not used.

## Play

In PowerShell:

```powershell
Set-Location -LiteralPath 'H:\Programing\BattleChess\web'
python -B serve.py
```

Open [Battle Chess](http://127.0.0.1:8765/), then select **Play Battle Chess**.
Stop the local server with Ctrl+C. No build, package installation, Node.js,
external services, CDN requests or account is required. Opening `index.html`
directly from disk does not provide the HTTP requests used by its assets/worker.

Red plays first (the chess engine's white side); Blue is black. Select a square,
then a highlighted destination. Keyboard: arrow keys move the focus square;
Enter/Space selects; Escape cancels selection or skips the current animation.
A separate accessible board provides named square buttons for assistive tools.

- **Disk:** new game, export a JSON save, import a JSON save, return to title.
- **Move:** take back, replay the previous move/duel, suggest a move, force a
  computer response while it is thinking.
- **Settings:** computer or same-device two-player; Red or Blue for the human;
  original 3D/2D boards; sound; animations; animation speed.
- **Level:** three search depths of the existing native computer opponent.
  This is not a port of the original DOS chess AI.

Checkmate ends with the original king-defeat battle, using a piece attacking the
losing king and preferring the preceding mover. That battle is visual; saved
moves remain legal chess moves, and undo restores the position before mate.

The original animations play on the 3D board. The 2D board and reduced-motion
mode show completed moves directly. Sound starts off and needs a user gesture
to enable. Castling, en passant, all four promotions, checkmate, stalemate,
insufficient material, repetition and the fifty-move rule are supported.
Claimable repetition/fifty-move draws end automatically in this engine.

The current game saves to this origin's local storage when available. Disk /
Save Game also exports a portable JSON file; DOS `CHESS.SAV` files are not this
native save format. Undo reverses one ply in two-player mode and a human/computer
turn in computer mode. Replay does not change the game. New Game confirms before
replacing a played match; invalid saves leave the current game intact.

## Verification

[Open the dependency-free checks](http://127.0.0.1:8765/tests.html) while the
server is running. They use isolated in-memory controller doubles and never
change the saved match. Coverage includes perft (20/400/8,902 and Kiwipete 2,039),
special moves, draws/mate, legal AI responses, save/undo/promotion, stale AI
callbacks, animated castling and captures, all 35 usable capture pairings plus
the unused king/king entry, all walk/turn directions, sound decoding, board hit
testing, and exact original castle-raster reconstruction after rook morphs.

All 25 checks also passed in the available native V8 tool runtime without
Node.js. The controller checks use a renderer/worker/DOM double; they do not
prove browser layout, real worker behavior, browser audio output or animation
appearance. The Codex in-app browser could not start because its sandbox helper
failed initialization, so live browser verification remains outstanding.

The original raster renderer was also composed offline from the actual canvas
renderer and original assets; this was an asset-composition check, not a browser
or desktop screenshot.

## Reconstruction notes

`assets/assets.json` contains the original packed frame pixels and executable
tables. Capture actor 0 is the victim; actor 1 is the attacker. Their individual
sequence/timing streams run together until both finish. Packed sound timing is
used for movement, turns and captures. Nominal playback uses the approximately
110 ms idle BIOS scheduler interval recovered from the executable; browser
scheduling and user input do not reproduce DOS loop jitter or machine workload.
The sound waveform/pitch conversion remains an approximation of the original
hardware's analog output, as documented in `original-audio.js`. One queen-versus-
king cue (sound 11, pitch -64) requests a clamped zero hardware delay; its modern
sample rate cannot be established by this model, so that cue reports unavailable
instead of substituting another pitch.

The exporter was corrected so only full/base frames receive vertical scanline
XOR reconstruction. Delta patches remain raw; applying that extra reconstruction
to patches corrupts the animation. Hash-verified decoded blocks in
`analysis/catalog-assets/` supplied the corrected pixels. Earlier diagnostic
delta-frame PNGs in that directory predate this correction; the web game does
not use those PNGs.

This recreation implements the playable game and original animation resources.
DOS disk/modem support, the original search engine, original binary saves and
the original board-setup editor are not implemented.
