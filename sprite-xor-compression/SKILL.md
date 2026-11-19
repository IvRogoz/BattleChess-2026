---
name: sprite-xor-compression
description: "Implement lossless sprite-animation asset compression using base frames, temporal XOR patches, row XOR prediction, and Huffman coding. Use when building or optimizing sprite animation storage, import, loading, or playback for games, or applying the Battle Chess compression technique to another engine."
---

# Sprite XOR Compression

Transfer the useful Battle Chess techniques to the current game's asset pipeline.
Keep the implementation in the project's existing language, engine, and tooling.
Support indexed-color and full-color sprite frames without imposing DOS packing,
Amiga bitplanes, an engine, a backend, or a new dependency.

Read [references/codec.md](references/codec.md) before implementing an encoder,
decoder, file format, or patch compositor. It contains the exact transform order,
test vectors, and the legacy-format distinctions.

## Establish the contract

Inspect the affected importer/exporter, asset container, animation player, and
their callers before editing. Identify:

- Pixel layout, row stride, palette behavior, alpha representation, sprite bounds,
  and signed origins/anchors.
- Frame durations, events, sequence order, looping, seeking, and frame reuse.
- Target memory, load-time, and decode-time constraints, and the existing
  compression/GPU upload path.

Reuse an existing suitable codec or pipeline before introducing a parallel one.
The skill supplies a technique, not permission to replace the requested design.
Preserve applicable project instructions and approval boundaries. Do not install
dependencies or change environments, lockfiles, or tool versions without explicit
prior approval.

## Preserve pixels and animation semantics

- Work on decoded pixel/index bytes in a documented, identical layout on both
  sides. Keep the source unchanged and retain the original metadata needed to
  reconstruct its frame bounds and anchors.
- Compare frames in a common coordinate system relative to the sprite origin.
  For a new minimal implementation, use one canvas per clip enclosing all frame
  bounds, with deterministic bytes outside each source frame. Do not invent a
  movement, crop, scale, palette, or origin change.
- Keep palette updates explicit. Preserve per-frame palettes or expand to exact
  color bytes when required; never silently quantize colors to enable XOR.
- Preserve alpha bytes, premultiplication conventions, and RGB beneath zero
  alpha. Determine changed pixels from every stored channel, not visible alpha.
  Any lossy normalization needs separate user authorization.
- A delta is a bitwise difference. Never render it directly or alpha-blend it
  onto the previous frame.

## Encode and decode

1. Begin each clip with an independently decodable keyframe.
2. For a complete frame, consider vertical row XOR prediction before Huffman
   coding. Prediction uses the previous original row; reconstruction uses the
   previous reconstructed row. Keep row and plane boundaries explicit.
3. For each subsequent frame, compute `delta = previous XOR current` in the
   canonical coordinate system. Store the smallest pixel rectangle containing
   every changed byte when its bounds and overhead make this worthwhile.
4. An unchanged image can use a hold record with no pixel payload. Retain its
   duration, events, and metadata changes.
5. Consider Huffman coding for the transformed bytes. Keep temporal patches spatially
   unpredicted by default, matching the verified Battle Chess sprite technique.
   Compare actual serialized sizes with raw storage and a complete keyframe.
   Include dictionaries, headers, palettes, rectangles, and seek tables in costs.
   Choose a representation meeting the target's decode and seek constraints.
6. Decode entropy coding first, undo row prediction for a complete frame when
   flagged, or XOR a temporal patch into its declared reconstructed predecessor.
   A hold leaves pixels unchanged while advancing animation metadata.
7. Preserve the original duration/event scheduler. Compression does not define
   playback speed. Upload only restored frames through the existing render path.

Use explicit keyframes for seeking, independent entry points, and loop restart.
For a seek, decode from the preceding usable keyframe. Do not interpret a delta
as an independent frame. Choose keyframe placement from actual access patterns
and measured costs; do not add an arbitrary interval or configuration surface.

Reuse the existing asset schema where practical. If a new container is needed,
make version, layout, byte/bit order, predictor scope, references, lengths, and
bounds explicit as described in the reference. Wire up both exporter and runtime
loader, packaging, and animation callers; an exporter alone is incomplete.

## Validate the result

- Test the actual encoder and runtime decoder together. Compare every restored
  pixel/index byte and all frame metadata with the source, including hidden RGB.
- Cover holds, moving/clearing pixels, alpha changes, palette updates, odd widths,
  signed origins, differing frame bounds, loops, seeks, and keyframe resets.
- Exercise empty and single-symbol Huffman payloads, partial final bytes,
  truncated input, invalid codebooks, invalid parents, and out-of-bounds patches.
- Check reverse row-predictor encoding and forward reconstruction using the
  reference vectors. Keep a small deterministic regression test in the project
  for the implemented pipeline.
- Measure total bytes, load/decode time, and peak working memory against the
  existing asset path. Report measured results; do not promise that XOR/Huffman
  shrinks every animation. Reuse raw or existing storage when it performs better.

Respect restrictions on desktop/screen access. Byte-level checks do not require
UI automation. Report any runtime or hardware verification that was not done.
