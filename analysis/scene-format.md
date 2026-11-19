# Static scene findings

Source: `unpacked-image.bin`, data segment base 0x5cc20. Offsets below are unpacked image offsets; code has not been executed.

At 0x2b40–0x2b5e perspective mode selects DS:034e for 64 signed little-endian x anchors, DS:03ce for eight signed little-endian y anchors, and DS:0166 for frame lookup. At 0x5e18–0x5eb5 square index i selects x[i] and y[i >> 3], frame ID `lookup[board[i] & 0x3f]`, and color flag `board[i] & 0x40`. Image top-left is anchor minus frame metadata bytes 2 and 3 (0x3fbb–0x400d). The 47 recovered baseline frame images correspond to frame IDs 17 through 63.

Perspective x rows:
```
47 79 111 144 176 209 241 273
44 77 110 143 177 210 243 276
40 75 109 143 177 211 245 280
37 72 107 142 178 213 248 283
34 70 106 142 178 214 250 286
30 67 104 141 179 216 253 290
26 64 103 141 179 217 256 294
22 61 101 140 180 219 259 298
```
Y by row: 43, 61, 79, 99, 119, 141, 163, 187.

Initial board DS:1166 frame IDs: row 0 = 54,31,18,45,25,19,31,53; row 1 = 37 repeated; row 6 = 33 repeated; row 7 = 54,29,17,41,21,20,29,53. These derive from raw initial board and frame lookup; don't infer that row zero maps to a particular algebraic rank without separate coordinate evidence.

A board byte's low three bits identify the piece: 1 bishop, 2 king, 3 knight, 4 pawn, 5 queen, 6 rook. Bits 3–5 select frame orientation via lookup table; bit 6 controls color translation. DS:0166 lookup is at image 0x5cd86, 64 bytes. The initial board is at image 0x5dd86, 64 bytes. Alternate board mode uses DS:03de / DS:045e and frame table DS:01a6 (0x2adc–0x2af4).

Capture: 0x60d3 constructs an eight-byte queued action record at DS:52f0 + 8*i, storing action type at +0, board square at +4, argument at +5, and additional value at +6. For type 5 it derives actor type from board[square] & 7 and stores it in DS:ecc or ecd according to argument (0x6118–0x6141). 0x6167 turns records into linked tasks. For capture tasks, 0x63ea–0x643e selects sequence table DS:103e or 1052 by actor and timing pointer from DS:b0ce/b0d0; 0x6808–0x68dd iterates active tasks; 0x75f6 drives sequence playback, and 0x772d interprets timing bytes. Actor task order follows the generated linked list; no fixed universal capture order is established.

For one task-construction branch at 0xbda0–0xbe91, target-row comparison chooses direction 2 for +1 column, 6 for −1 column, 4 for +8 row, or 0 for −8 row, then queues a type-2 action at 0xbe40. This proves those direction values for that branch only; diagonals and all other movement cases are not yet traced.

The full directional selection at 0xbe96–0xbf3c gives 0=(row−1,col), 1=(row−1,col+1), 2=(row,col+1), 3=(row+1,col+1), 4=(row+1,col), 5=(row+1,col−1), 6=(row,col−1), 7=(row−1,col−1). Move type 6 changes horizontal direction 2 to 1 and 6 to 7 (0xbf3c–0xbf57). The initial action direction and its subsequent queued actions depend on source/target geometry and move type; further capture paths at 0xbf9c onward are not yet fully decoded.

`scene_export.py` emits static JSON from the unpacked image: perspective anchors, initial board, facing lookup, two 36-entry resource matrices, and both variants of two 36-entry timing matrices. Its output lengths were checked with Python; it does not execute the game or claim to reproduce the capture task scheduler.

For action type 1, unpacked code 0x6376–0x63ac selects walk sequence by the piece's current orientation: add `orientation >> 1` to the per-piece base sequence for bishop (1), knight (3), rook (6); add full orientation for king (2), pawn (4), queen (5). Orientation is `(boardByte & 0x38) >> 3`; action type 2 updates this field. The per-piece base pointer is assigned dynamically by resource loading, so the formula identifies a local sequence, not a static global frame ID.

At 0xc1a1–0xc1b4 a type-5 action is queued for destination square with actor argument 0. The setup stores that actor's type in DS:ecc and uses the first resource/timing matrix row. In an ordinary capture the destination occupant is the victim; the corresponding attacker enqueue has not yet been isolated.

## Native browser integration findings (2026-11-19)

The following extend the earlier incomplete trace above. These are static
disassembly/data findings, not observations of a running DOS game.

- Attacker actor 1 is queued at 0xc5d0–0xc5e4. Victim index is
  `6*(victimType-1)+(attackerType-1)`; attacker index is
  `36+6*(attackerType-1)+(victimType-1)` (0x377c–0x37b2,
  0x3955–0x39e2). The combat groups map respectively to the first and second
  six offsets in `web/original.js`'s COMBAT list, as verified against the
  executable's directory at file offset 79509 and loader 0x2e3c.
- Actor player 0x75f6–0x772c waits until both actors exist, then advances each
  independently. Each finished actor waits for both to finish. Timing commands
  `0x80..0xfe` dispatch sounds, low nibble = ID, following byte minus 0x40 =
  pitch adjustment (0x772d–0x77ae). Delay n waits n additional scheduler visits.
- Packed sound mode selects capture timing DS:11ba and 144 motion lists at
  DS:1c62; speaker mode selects DS:2010 / DS:2a98 (0xcc46). The motion lists are
  six groups of 24: eight walk directions, followed by sixteen turn lists.
  Walk index `(type-1)*24+direction`; turn index
  `(type-1)*24+8+2*direction+(positiveStep ? 1 : 0)` (0x708d–0x70e4,
  0x63af–0x63c1, 0x74fc–0x751d).
- Ordinary idle input polling waits two BIOS clock ticks before event type 3
  invokes the scheduler (0x184d–0x18f7, 0x059d). This supports a nominal roughly
  110 ms interval; input and workload can affect actual DOS cadence.
- Task 7 stages victim at destination anchor (-9,+5), attacker at (+9,-5), then
  returns the attacker to the exact anchor (0x6584–0x6613, 0xc096–0xc135,
  0xc547–0xc605). Normal walk interpolation uses the full sequence count;
  task-7 staging uses half the count in ordinary cases.
- Turn task 2 steps clockwise or counterclockwise by one direction, or two for
  bishop/knight/rook; 180-degree ties choose negative. It selects the group's
  turn bank and per-facing timing (0x730c–0x7528).
- The post-move king cleanup queues turn task 2 toward direction 0 for red
  or 4 for blue before transferring board occupancy (0xc794–0xc7ec).
- Rook task 6 selects sequence `14+argument`. Arguments 0/1 transform a castle
  into its creature; 2/3 restore it (0x66ec–0x6753, 0x724d). Restored castle
  orientation is 7 for screen x>160 and 3 otherwise. Original internal type map
  at DS:11ac is [0,4,1,5,6,2,3,0]; internal types 3/5 are rook/knight, which
  face directions 0 (victim) and 4 (attacker) in combat; others use 1 and 5.
- Flat lookup DS:01a6 uses runtime descriptors 17–22, replaced by its six-frame
  bank. Default resource 3 selects metadata 12303. Flat anchors are
  x=63+28*column, y=16+24*row; the exact tables are exported from DS:03de/045e.
- Full frame loading applies vertical row XOR after Huffman decoding
  (0x2d3b–0x2d62); delta loading does not (0x3211 returns to 0x310b).
  Animation base selector high bit resolves to 17+(selector&127); low selectors
  resolve to the adjacent combat base bank (0x3026–0x305a). Delta composition
  itself is pixel XOR (blit operation 2, 0x3de7, 0xe74b/0xe792).

The web implementation reconstructs scene staging rather than porting the full
original task generator. Exact input-driven timing, hardware sound transfer,
and every original end-of-game task branch remain unverified.

The mate handler at 0x900a can call the move/animation routine before its final
message. Preparation at 0x91dc–0x92a4 targets the losing side's king, prefers the
preceding piece if its attack test succeeds, otherwise scans opposing attackers.
The native game uses its existing pseudo-move generator with the king's occupancy
retained as a capturable placeholder to find that attacker. It animates defeat
without adding an illegal king capture to the chess history. Original fallback
data and the complete end-of-game task ordering remain unverified.

## Original game-over boxes

The browser deliberately stops at legal checkmate, keeping both kings, then
shows the original message. It does not reproduce the native king-defeat task.
`web/message-box.js` draws the following recovered geometry on the same 320x200
pixel grid as the board, with nearest-neighbour scaling and no backdrop.

DOS addresses refer to `unpacked-image.bin` (DS base `0x5cc20`):

- Handler `0x900a`, message call `0x9098–0x90b5`, message routine `0x1296`.
  Text at DS:`4ed7`: `Check and mate...Game over.`; DS:`4ef3`:
  `Stalemate. How boring!`.
- Normal human-game message mode 2 supplies the two prompt lines:
  `Left Button or <Enter> for New Game.` and
  `Right Button or <Esc> to Resume.`
- Half-width in characters is `floor((max(length,36)+1)/2)`. Checkmate box
  bounds are `(8,80)..(311,132)` inclusive, 304x53. Text starts at `(16,88)`,
  prompts at `(16,104)` and `(16,115)`.
- EGA mode 1 selects BIOS `0x0d` at `0x11017–0x11043`. Colour setup `0x9d–0xdd`
  uses background pen 1, message 15, prompt/border 14. The selected DOS asset
  palette gives blue `#0000aa`, white `#ffffff`, yellow `#ffff55`.
- Border routine `0x1780` fills/background-outlines the outer rectangle then
  draws three successive inset outlines in pen 14 (`0x17bc–0x17e9`).

Amiga offsets refer to the executable reconstructed from the supplied ADF file
data blocks 1434..1607; CODE is executable `[40:73028]`, DATA `[73616:84068]`:

- Handler CODE:`94d8`, call at `953e` through DATA:`36` JMP to CODE:`1294`.
  Message at CODE:`9568` is the same checkmate text. Stalemate at `9584` has
  two exclamation marks: `Stalemate. How boring!!`.
- Prompt CODE:`1386`: `=Left Button= to continue.`
- Half-width uses `floor((max(length,26)+1)/2)`. Checkmate bounds are
  `(40,80)..(279,120)`, 240x41. Text starts `(48,88)`, prompt `(48,104)`.
- IntuiText uses message pen 8, background 27 and prompt 23, with NULL font
  pointer (system Topaz/8). The original RGB4 palette at executable `0x126a2`
  gives `#eedddd`, `#111166`, `#ffee00`, respectively.
- Box routine CODE:`1722` draws four successive outlines in pens 31,30,29,28:
  `#660044`, `#990066`, `#bb1177`, `#ee2277` from outside to inside.
  These original UI colours are independent of the requested red-uniform remap.

Printable font data and its source are retained in `analysis/fonts/`.
