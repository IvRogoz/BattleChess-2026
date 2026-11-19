# Amiga sprite sources and verification

The original project-root `BattleChess.adf` is preserved byte for byte:

- SHA-256: `390db65bc008a89e00b346d582db7c500b1d646c5476086a100cef98a270e405`
- CRC32: `461c87b5`

Downloaded comparison images are also retained:

| Image | Source | CRC32 | Sprite validation |
| --- | --- | --- | --- |
| `Battle_Chess_1988_Interplay_cr_QTX.adf` | [Internet Archive](https://archive.org/details/Battle_Chess_1988_Interplay_cr_QTX) | `461c87b5` | Identical to the supplied image; king group fails. |
| `Battle_Chess_1988_Interplay_cr_QTX_a4.adf` | [Internet Archive](https://archive.org/details/Battle_Chess_1988_Interplay_cr_QTX_a4) | `d151b96e` | King group fails. |
| `Battle_Chess_1988_Interplay_cr_Dragon_Inc.adf` | [Internet Archive](https://archive.org/details/Battle_Chess_1988_Interplay_cr_Dragon_Inc) | `235c445e` | All 33 sprite groups and 1,676 stored frames validate. Used by the exporter. |

The selected image's SHA-256 is
`54ef67e9c8362f6284cccb851cb21c2b355d84de7e40de0040a3f88f0b47d85e`;
its published SHA-1 is `25ceabf525ac67c9e0adf0f141e6bedb776cdbc4`.
These are static resource checks, not a test of the complete Amiga executable.

## Format evidence

All code offsets below are relative to the CODE hunk of the supplied Amiga
executable. That executable's unaffected palette supplies the exported colors.

- The raw resource loader at `0xf9d4` adds two sectors for logical sector
  numbers ≥880. Removing physical sectors 880 and 881 gives the logical resource
  stream, which starts at byte 5120.
- Full-frame metadata uses four bytes: row bytes, height, signed x/y anchors.
  Delta metadata adds a big-endian encoded-bit count. The 12 exact
  `(0,0,1,1,0)` delta records are zero-length hold patches; the same records occur
  in the DOS catalog. Other zero-dimension metadata is rejected.
- Huffman headers are big-endian; the tree and symbol decoder match the DOS
  algorithm. Every selected group ends at its recorded bit position, and every
  individual delta-frame boundary was independently checked.
- Frames contain five contiguous bitplanes. Full images reconstruct scanline
  XOR separately within each plane. Delta patches remain raw. All 47 initial
  silhouettes match the DOS originals at pixel level, including transparent
  padding and signed anchors.
- The supplied disk's actor-king group starts at logical byte 443284 and has
  137 delta patches. Six patches (27–32) fail independent bit-boundary checks;
  their compressed region contains filesystem data. The independently selected
  image differs only in this group within the complete sprite-resource region
  and passes those same checks using the same decoder.
- The active `NewScreen` at executable file offset 75326 is 320×200, depth 5.
  Code `0x5446` passes it to `OpenScreen` through the thunk at `0x11cb6`.
- Code `0x5554` loads 32 RGB4 entries. A4 has a `0x7ffe` data bias, so pointer
  `A4-0x78ec` is DATA offset `0x712`, executable offset `0x126a2`.
- The army flag travels through `0x5660`, `0x3182`, and `0x33b2` to the
  compositor. The helper `0x3cf2` programs minterm `0xf8`, with channels A/B/C
  sourced from planes 2/3/4 at `0x3d7e`/`0x3d8e`/`0x3d9c`. Its Boolean function
  is `A OR (B AND C)`, using the [Amiga minterm truth table](https://wiki.amigaos.net/wiki/Graphics_Minterms).
  Replacing color bit 2 with that result maps blue indices 24–27 to red/magenta
  indices 28–31 and preserves every other palette entry. An exhaustive test
  checks all 32 indices against the original minterm.

The web manifest uses legacy DOS group-family keys for the existing renderer;
`sourceFile`, `sourceOffset`, and `headerOffset` retain actual Amiga provenance.
The single Amiga flat-icon bank maps to the renderer's default flat-bank key.
The native web game's existing board geometry, timing/audio streams and chess
engine are shared by both sprite choices.
