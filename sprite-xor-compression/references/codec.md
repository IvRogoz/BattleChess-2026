# Codec mechanics and compatibility

This reference defines reusable lossless transforms, not a mandatory file format.
Apply them in the target project's existing language and asset system.

## Canonical frames and registration

Let P be the preceding fully reconstructed canvas and F the desired canvas.
Both have the same dimensions, stride, pixel layout, and byte count. Register
their source rectangles using their signed sprite origins. For example, a frame
whose anchor is (ax, ay) occupies local coordinates starting at (-ax, -ay).

Retain per-frame source bounds, origins, durations, palettes/updates, and events
when they differ. An empty image can still have meaningful metadata. Pixels
outside a source frame use deterministic background bytes; do not erase the
source's transparent pixels or hidden color channels to produce those bytes.

For a new minimal layout, indexed8 uses one byte per index and RGBA8 uses four
bytes per pixel. Other existing layouts are valid when both ends agree exactly.
Preserve palette interpretation independently of index differences. A palette
change can alter the whole visible image even when the index delta is empty.

## Two different XOR operations

### Spatial row prediction for complete frames

Given original bytes S and row stride s:

    E[0:s] = S[0:s]
    E[i] = S[i] XOR S[i-s]       for every i >= s

Use a separate output buffer, or traverse backward for an in-place encoder.
A forward in-place encoder would XOR against already transformed rows.

Reconstruction is deliberately forward:

    S = copy(E)
    S[i] = S[i] XOR S[i-s]       for i from s upward

For planar sprite data, reset prediction at each plane. For interleaved or
packed data, follow its declared row layout. Predictor scope is part of the
format; do not infer it from the display resolution.

Known vector (three rows of two bytes):

    S = [1, 2, 1, 3, 0, 3]
    E = [1, 2, 0, 1, 1, 0]
    inverse(E, stride=2) == S

Spatial prediction makes equal neighboring rows produce zeros. It does not
change the image and is separate from changes between animation frames.

### Temporal XOR patches

    D[i] = P[i] XOR F[i]
    F[i] = P[i] XOR D[i]

Compute D over the registered canonical canvases. To crop a patch, find the
pixel rectangle containing all nonzero D bytes across all channels. Serialize
each patch row with its declared stride. Decode by replacing each covered byte
with `P[canvas_position] XOR D[patch_position]`; uncovered bytes retain P.

Do not skip a patch merely because its alpha channel or rendered appearance is
unchanged. Example: RGBA [10,20,30,0] to [11,20,30,0] requires [1,0,0,0].

Known vector (one row of four indexed pixels):

    P = [0, 7, 0, 4]
    F = [0, 0, 7, 4]
    D = [0, 7, 7, 0]
    cropped rectangle = (x=1, y=0, width=2, height=1)
    cropped bytes = [7, 7]
    apply(P, rectangle, cropped_bytes) == F

This both clears the old pixel and creates the moved pixel. Copying or blending
the patch as though it were a sprite gives the wrong result.

A sequence is cumulative:

    F0 = decode_keyframe(...)
    F1 = apply(F0, patch1)
    F2 = apply(F1, patch2)

Unless the format explicitly declares a different parent, each patch references
the preceding reconstructed frame, not the original keyframe. A hold preserves
pixels but must retain time, events, and metadata updates. Loop restart restores
the first keyframe; a last-to-first delta is valid only if explicitly encoded.

## Huffman coding

Encode the bytes produced by the selected transform. A byte alphabet has at
most 256 symbols. Count frequencies, construct a prefix code, and serialize the
codebook plus payload. Specify a stable tie-break rule for reproducible output.

Use an existing implementation if present. When implementing a new small format,
canonical Huffman codes are a useful choice: store code lengths, assign codes by
(length, symbol), and define code-bit order, byte packing, and final-byte padding.
Do not use an implementation's map iteration order as the format contract.

- Store the decoded byte count and valid payload bit count.
- Empty data has zero decoded bytes and needs no codebook or payload.
- Define the single-symbol case explicitly; a simple new format can assign that
  symbol code 0 of length 1. Match the decoder to that choice.
- Decode exactly the declared number of bytes within the valid bit count.
  Specify whether unused valid bits are forbidden; padding lies outside it.
- Reject duplicate symbols, oversubscribed or otherwise invalid codebooks,
  impossible branches, truncated codewords, and lengths beyond format limits.
- Bound decoded sizes and code lengths before allocations or tree construction.
- Include the dictionary and framing in the compressed-size comparison.
  Small or noisy blocks can be smaller when stored raw.
- Do not independently compress each tiny patch unless measurements justify the
  repeated dictionary cost. Reuse an existing group/clip codebook when suitable.

Known bit-packing vector (one valid canonical codebook):

    code(0) = 0
    code(1) = 10
    code(2) = 110
    code(3) = 111
    input = [0, 1, 0, 2, 3]
    concatenated bits = 0100110111
    MSB-first bytes = [0x4D, 0xC0]
    valid bits = 10
    decoded bytes = 5

This codebook is an illustration, not a mandated dictionary for those bytes.

## Packet contract and transform order

Adapt the existing asset schema. A new format needs unambiguous equivalents of:

- Container version, numeric endianness, bit order, pixel layout/stride, canvas
  dimensions/origin, palette interpretation, and clip/frame metadata.
- Record kind: complete keyframe, temporal patch, or hold.
- For a patch: parent/reference identity and rectangle coordinates/dimensions.
- Spatial predictor identity and scope for records that use one.
- Entropy coding identity (raw or Huffman), resolved dictionary, decoded byte
  count, payload byte length, valid bit count, and payload location.

Complete frame encode/decode:

    pixels -> optional row XOR -> raw or Huffman -> container
    container -> raw or Huffman decode -> optional inverse row XOR -> pixels

Temporal frame encode/decode:

    previous XOR current -> optional patch crop -> raw or Huffman -> container
    container -> raw or Huffman decode -> XOR patch into parent -> current

Hold: no pixel decoding; preserve pixels and apply this frame's metadata.

For an interleaved patch of width w, height h, and c bytes per pixel without row
padding, its decoded size is w*h*c. For a padded/packed/planar layout, compute the
size from that exact layout. Check multiplication, lengths, offsets, coordinate
ranges, parent availability, and configured allocation limits before decoding.
Reject negative or overflowing dimensions and rectangles outside the canvas.
Do not publish a partly decoded frame after an error.

Seeking requires a reconstructible keyframe and the chain to the requested frame.
A patch is not random-access just because its compressed payload has an offset.
If the engine changes pixel/index layout during import or GPU upload, compare
the bytes before that conversion and validate the conversion separately.

## Validation that proves the pipeline

Test the actual encoder/exporter against the actual target decoder, not two
test-only copies of the same logic. Exact reconstruction includes bytes and
timing/origin/palette/event metadata. The vectors above catch transform direction,
clearing pixels, crop placement, and bit-packing mistakes.

Include fixtures for a one-frame clip, a hold, a moving opaque pixel, a pixel
becoming transparent, hidden RGB changes, differing source bounds/signed anchors,
odd widths, palette-only changes, loop restart, seek across keyframes, empty data,
one repeated symbol, all 256 byte values, and truncated/corrupt packets.

Compare total packaged bytes (including the outer container), cold load/decode
time, worst decode time, and peak memory with the existing pipeline. Entropy
coding or XOR can lose to PNG, an atlas/container compressor, or raw bytes for
some assets. Keep the simpler/faster representation when measurements warrant it.

## Original Battle Chess compatibility only

These facts explain the source technique; do not impose its binary format on
a new game:

| Property | DOS resources | Amiga resources |
| --- | --- | --- |
| Storage | ALLCANM1 / ALLCANM2 | Custom logical resource stream on disk |
| Pixel bytes | Two 4-bit indices per byte, high nibble first | Five contiguous bitplanes, 32 indices |
| Full metadata | Width in pixels, height, signed x/y anchors: four bytes | Row bytes per plane, height, signed x/y anchors: four bytes |
| Delta metadata | Adds a little-endian 16-bit encoded-bit count | Adds a big-endian 16-bit encoded-bit count |
| Huffman header | Two little-endian 32-bit fields | Two big-endian 32-bit fields |
| Base sprites | Huffman then inverse row XOR | Huffman then inverse row XOR separately per plane |
| Temporal patches | Huffman then cumulative pixel XOR | Same mechanism in five-plane data |

The original Huffman tree is embedded and read MSB-first: a leaf marker is
followed by an 8-bit symbol; an internal node recursively reads its left subtree,
consumes a separator bit, then reads its right subtree. This is not canonical
Huffman serialization. Its stored bit-length convention is also legacy-specific
(the verified group check uses declared_bits - 7); never copy that adjustment
into a new format without the original compatibility requirement.

Both originals use the exact delta record (0,0,1,1,0) as a zero-byte/zero-bit hold.
Sequence records contain a sequence count, then length, base selector, and patch
indices for each sequence. The source structure separates six walking groups,
twelve combat delta groups, and their base banks. These counts are game content,
not limits for future animations.

Amiga full-screen title prediction continues across plane boundaries, unlike
its sprite predictor. Do not apply sprite assumptions to every original block.
The original Amiga screen is 320x200 with five planes and RGB4 palette entries.
No target resolution, palette, sprite count, frame timing, or army recoloring
is inherent to the generalized technique.

Provenance: verified BattleChess project sources at the time of skill creation:
`analysis/decode_assets.py`, `analysis/extract_catalog.py`,
`analysis/export_amiga_assets.py`, `analysis/export_amiga_title.py`,
`analysis/scene-format.md`, `analysis/amiga-sources/README.md`, and
`web/original.js`. These names document provenance; the skill does not depend on
that project being present. Reinspect original sources before compatibility edits.
