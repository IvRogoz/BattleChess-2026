"""Static checks of the original digital block decoder; no audio playback."""
import json
from pathlib import Path
import quickjs

base = Path(__file__).resolve().parents[1]
ctx = quickjs.Context()
ctx.eval((base / 'web/original-audio.js').read_text(encoding='utf-8-sig'))
block = (base / 'analysis/catalog-assets/allcanm1-block-012802.bin').read_bytes()
ctx.eval('const block = new Uint8Array(' + json.dumps(list(block)) + ');')
result = json.loads(ctx.eval('JSON.stringify((() => { const d = OriginalAudio.decode(block); return {length:d.samples.length, rate:d.sampleRate, first:Array.from(d.samples.slice(0, 4))}; })())'))
assert result['length'] == 11520 and result['rate'] == 15750, result
assert result['first'] == [0.875, 0.875, 0.125, -0.75], result
assert ctx.eval("(() => { try { OriginalAudio.decode(new Uint8Array([10,0,1,0,255])); return false; } catch (e) { return true; } })()")
print('Original packed audio decoder checks passed; hardware sound unverified')

for offset in (12802, 17806, 19745, 26280, 29124, 32873, 40242, 46233, 50574, 54549, 57696, 60962, 63464, 67248, 70973):
    data = (base / f'analysis/catalog-assets/allcanm1-block-{offset:06}.bin').read_bytes()
    count = int.from_bytes(data[:2], 'little')
    divisor = int.from_bytes(data[2:4], 'little')
    assert 0 < count <= len(data) - 4 and divisor > 0, offset
print('All 15 packed sound headers valid')
