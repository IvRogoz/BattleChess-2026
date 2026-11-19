# Original sound data: static code findings

Scope: byte offsets below refer to `analysis/unpacked-image.bin`, the unpacked load image, not offsets in the original executable file. This is disassembly and decoded-data evidence only; no code was run and no audio was rendered. `analysis/catalog.json` maps ALLCANM1 offsets to decoded blocks.

## Dispatch and timing

At 0xc83a, the sound dispatcher chooses the routine at 0xc868 or 0xc924 according to byte [0x11aa]. Both select a 10-byte sound-table entry using sound ID * 10 at 0xc87b / 0xc938. In both routines, the first or second word of the selected data block is divided into 1,000,000,000 (constant 0x3b9aca00 at 0xc8b5 / 0xc960; division helper 0xf37a). The caller's third argument contributes `1120 * argument` to the resulting signed 32-bit delay (shift left two at 0xc8d3 / 0xc97e; multiply by 0x118 at 0xc8c9 / 0xc974), clamped to zero if negative. This is consistent with a nanosecond period adjusted by 1.12 microseconds per argument, but the delay loops are calibrated to the machine: the downstream code divides by the measured value at [0x2eb3] and subtracts loop overhead. Exact modern playback pitch for nonzero arguments is therefore an inference, not directly measured.

## Packed 4-bit output path

At 0xc891-0xc8b2, the first little-endian word is loaded as byte count and the second little-endian word as the timing divisor; 0xc8f9-0xc918 passes data pointer +4, count, and calculated delay to far routine 0x10e30. That routine doubles count (0x10e49-0x10e4c), rotates each byte by four bits before each output, inverts it, masks to four bits, and writes `0x90 | value` to port 0xc0 (0x10e81-0x10e9b). Thus original order is high nibble then low nibble, with 4-bit value inverted for that device. It advances to the next byte after every second nibble; the byte is rotated twice in place, restoring its original value. Each nibble is one output step.

Example ALLCANM1 block 12802: decoded prefix `80 16 86 3d`, count 0x1680 = 5760 bytes, divisor 0x3d86 = 15750; 11520 nibble steps. A nominal 15750 steps/s at zero adjustment follows from the 1e9 divisor. The total decoded block is 5767 bytes; only the declared 5760 bytes following the four-byte header are consumed by this path, leaving three trailing bytes outside that call's byte count. This is device attenuation data; mapping to linear PCM amplitude is not established by these instructions.

## One-bit duration path

At 0xc924, 0xc956 reads the first little-endian word as timing divisor. 0xc940-0xc953 calculates the difference between the entry's end and start far pointers using helper 0xf1d6; 0xc9a4-0xc9c3 calls far routine 0x10f21 with data pointer +2, that difference, and calculated delay. The loop at 0x10f6e-0x10f80 toggles bit 1 of port 0x61 once per byte, reads one unsigned byte, and runs the calibrated delay loop that many times (a zero byte wraps through 256 decrements). The data is a sequence of alternating level durations, not 4-bit PCM. The exact duration scaling depends on the calibration and per-iteration instruction overhead. The count passed is the pointer difference; whether the table's end pointer includes or excludes its two-byte header was not resolved here, so do not infer a safe data bound from this listing alone.

Example ALLCANM1 block 78041 starts `0c 7b 00 0e ...`: divisor 31500, then duration bytes `00 0e ...`; its divisor happens to be twice the paired block 12802's 15750. The bytes are not evidence of an amplitude-encoded waveform.

## Unresolved

Sound-table initialization and exact pairing of all resource blocks to IDs have not been traced. Machine-specific calibration, exact analog transfer/amplitude, duration bounds in the second path, and behavior on actual hardware remain unverified. No generated sound files are included.

## Sound ID table (static mapping)

Initialization at image offset 0x29c5 sets the table pointer to `5cc2:2d0e` (image offset 0x5f92e). The loader at 0x365a-0x36a2 takes the sound ID and reads the 32-bit entry indexed by `15 * [0x11aa] + ID`; 0x3678 multiplies the mode by 0x3c bytes, and 0x3684 multiplies it by 15. The mode-0 dispatcher selects the packed 4-bit path, and mode 1 selects the one-bit duration path. These table values exactly match Huffman block header offsets in ALLCANM1. They establish IDs, not which game event or animation calls each ID.

| Sound ID | Packed block offset (mode 0) | Speaker block offset (mode 1) |
|---:|---:|---:|
| 0 | 12802 | 78041 |
| 1 | 17806 | 79330 |
| 2 | 19745 | 79693 |
| 3 | 26280 | 82472 |
| 4 | 29124 | 84901 |
| 5 | 32873 | 85435 |
| 6 | 40242 | 89382 |
| 7 | 46233 | 90826 |
| 8 | 50574 | 91910 |
| 9 | 54549 | 92535 |
| 10 | 57696 | 93777 |
| 11 | 60962 | 95514 |
| 12 | 63464 | 95854 |
| 13 | 67248 | 97247 |
| 14 | 70973 | 98441 |

101368 is the next 32-bit table entry, not an ID 15 in either 15-entry bank. The specific meaning of that following entry has not been established here.

The [Texas Instruments SN76489AN datasheet](https://map.grauw.nl/resources/sound/texas_instruments_sn76489an.pdf) describes nominal 2 dB attenuator steps, but this alone does not establish the channel oscillator state or the machine's mixed and AC-coupled output during this playback routine. Consequently `web/original-audio.js` retains its explicitly approximate centered linear mapping; substituting the datasheet attenuation curve as an exact reconstructed waveform is not supported by this static trace.
