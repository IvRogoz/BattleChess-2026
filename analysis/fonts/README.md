# Original message-box fonts

`web/message-box.js` embeds the 95 printable ASCII glyphs (8 rows per glyph,
8 bits per row, most significant bit on the left). No fonts are installed.

- DOS: extracted unchanged from the supplied `CHESS.EXE` unpacked image,
  `analysis/unpacked-image.bin`, offset `0x61044 + character * 8`
  (DS base `0x5cc20`, font DS:`4424`).
- Amiga: original Kickstart 1.3 Topaz/8 bitmap data, archived in
  [hoard-of-bitfonts](https://github.com/robhagemans/hoard-of-bitfonts/blob/master/amiga/amiga-ks13-topaz-08.yaff).
  The downloaded YAFF source is retained here with its provenance comments:
  Kickstart v1.3 rev34.5 (1987), ROM SHA1
  `891e9a547772fe0c6c19b610baf8bc4ea7fcb785`, character data at ROM `0x9134`.
  Topaz is the original Amiga/Commodore system font, not a newly designed font.

The source is bitmap data only; no package, font engine, runtime or dependency
was installed. Message dimensions, strings, colours and border geometry were
recovered separately from the supplied DOS executable and `BattleChess.adf`.
