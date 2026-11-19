# BattleChess 2026

Two complete portable editions of the restoration:

- **BattleChess 2026 Windows x64.zip** — extract and run `BattleChess.exe`.
  Includes Python and the game; uses the system-installed WebView2 runtime.
  No bundled WebView2 runtime or automatic runtime download.
- **BattleChess 2026 HTML.zip** — extract and open `BattleChess.html` directly.
  Includes external graphics/animation/sound data and a local AI worker.
  No HTTP server, Python installation, or internet connection needed to play.
- **SHA256SUMS.txt** — checksums of both packages.

Both editions retain DOS/Amiga selection, Amiga defaults, original battle
animations and sounds, human/computer and local two-player modes, JSON save/load,
and the original DOS/Amiga game-over boxes. Checkmate preserves both kings.
About credits **Ivan Rogoz** as the originator of this restoration effort and
links to [warped3.substack.com](https://warped3.substack.com).

The server-based web version and original source files are retained.
Build caches, development environments, private browser profiles and saved games
are excluded from release packages.

The HTML edition's direct-file loading, actual AI worker, both sprite sets,
sound data, capture/checkmate and save/load are checked in an isolated headless
browser. The native desktop window is not automated or inspected; its launcher
and packaging are checked without opening a window.
