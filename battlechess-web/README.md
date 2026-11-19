# Battle Chess — The King's Table

A local browser chess game inspired by Battle Chess, with original SVG fantasy armies and animated capture duels. No original game artwork or audio is included.

## Play locally

From this folder:

```powershell
python serve.py
```

Open [the local game](http://127.0.0.1:8765). Stop the server with Ctrl+C. To choose another port, use `python serve.py --port 8766`.

There is no build step, external font/CDN request, Node.js dependency, account, or hosted backend. Game logic and the computer opponent run in your browser. Python is used only for the local static server and optional tests.

## Playing

- Select a piece, then a highlighted destination. A ring marks a capture.
- Play the computer at three search depths, choose either army, or play a friend on the same device.
- Captures open a brief battle sequence. Skip or Escape completes the capture immediately; Replay repeats its animation without changing the position.
- Castling, en passant, all four promotions, check/checkmate, stalemate, repetition, the fifty-move draw, and insufficient material are included. Claimable draws are automatically ended by this game.
- Undo reverses a full turn against the computer, or one move in two-player mode. Flip changes the viewing side.
- Arrow keys move board focus; Enter/Space selects a square. Escape clears a selection.
- Sound is optional and off initially. Reduced-motion preferences disable movement and capture animations.
- Your current match saves in this browser's local storage when available. New battle replaces that save.

## Checks

The optional test dependency is native Python QuickJS, with no browser or Node.js:

```powershell
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
```

Engine checks include initial-position perft (20 / 400 / 8,902), Kiwipete, castling through check, pinned en passant, underpromotion, checkmate, repetition, and undo. Computer checks cover legal move selection, mate in one, stalemate, and unchanged input state. Controller checks use a synthetic DOM to exercise selection, capture/skip/replay, save/restore, promotion cancellation, undo, and stale computer work.

**Verification limit:** native JavaScript tests and local HTTP checks do not verify the rendered page, responsiveness, actual browser audio, or the appearance/timing of animations. Those remain **UNVERIFIED - NOT FINISHED**; no browser or computer UI was accessed.
