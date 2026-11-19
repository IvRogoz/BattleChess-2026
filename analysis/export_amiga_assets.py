"""Export the Amiga sprite resources using the original game's planar format."""
import base64
import hashlib
import json
import struct
from pathlib import Path

from decode_assets import decode

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'Battle_Chess_1988_Interplay_cr_Dragon_Inc.adf'
PIXEL_HASH = '54ef67e9c8362f6284cccb851cb21c2b355d84de7e40de0040a3f88f0b47d85e'
PALETTE_HASH = '390db65bc008a89e00b346d582db7c500b1d646c5476086a100cef98a270e405'
WALK = [0, 5895, 18630, 28556, 42842, 51780]
COMBAT = [73745, 105915, 127499, 155354, 183016, 215513, 241299, 256108, 279298, 302680, 316655, 322341]
BASE = [104485, 126969, 154249, 181670, 214253, 240994, 254271, 278579, 301654, 315793, 321138, 339271]


def checked(path, expected):
    data = path.read_bytes()
    if len(data) != 901120 or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Unexpected source: {path}')
    return data


def signed(value):
    return value if value < 128 else value - 256


def pixels(raw, stride, height, delta):
    plane_size = stride * height
    planes = [bytearray(raw[p * plane_size:(p + 1) * plane_size]) for p in range(5)]
    if not delta:
        for plane in planes:
            for i in range(stride, plane_size):
                plane[i] ^= plane[i - stride]
    return bytes(sum(((plane[i] >> bit) & 1) << p for p, plane in enumerate(planes))
                 for i in range(plane_size) for bit in range(7, -1, -1))


def group(data, start, file, canonical, delta):
    pos = start
    metadata = []
    entry_size = 6 if delta else 4
    while data[pos:pos + entry_size] != bytes(entry_size):
        entry = struct.unpack_from('>4BH' if delta else '>4B', data, pos)
        # Both originals use this exact zero-byte, zero-bit record to hold the current image.
        hold = delta and entry == (0, 0, 1, 1, 0)
        if not hold and (not entry[0] or not entry[1]):
            raise ValueError(f'Invalid frame metadata at {pos}')
        metadata.append(entry)
        pos += entry_size
    pos += entry_size
    sequences = []
    if delta:
        count = data[pos]
        pos += 1
        for _ in range(count):
            length, base = data[pos:pos + 2]
            pos += 2
            frames = list(data[pos:pos + length])
            if len(frames) != length or any(i >= len(metadata) for i in frames):
                raise ValueError(f'Invalid sequence at {pos}')
            sequences.append({'base': base, 'frames': frames})
            pos += length
    header = pos
    body, end_bits, declared = decode(data, header, '>')
    if len(body) != sum(m[0] * m[1] * 5 for m in metadata):
        raise ValueError(f'Invalid decoded size at {header}')
    if end_bits - (header + 8) * 8 != declared - 7:
        raise ValueError(f'Invalid compressed length at {header}')
    if delta and sum(m[4] for m in metadata) != declared - 7:
        raise ValueError(f'Invalid frame bit counts at {header}')
    frames = []
    pos = 0
    for w, h, x, y, *_ in metadata:
        size = w * h * 5
        indexed = pixels(body[pos:pos + size], w, h, delta)
        frames.append({'w': w * 8, 'h': h, 'x': signed(x), 'y': signed(y),
                       'rawX': x, 'rawY': y, 'encoding': 'indexed8',
                       'pixels': base64.b64encode(indexed).decode('ascii')})
        pos += size
    return ({'file': file, 'kind': 'delta' if delta else 'base', 'metadataOffset': canonical,
             'sourceFile': SOURCE, 'sourceOffset': start, 'headerOffset': header,
             'frames': frames, 'sequences': sequences}, header + 8 + declared // 8)


def validate(groups, dos):
    originals = {(g['file'], g['kind'], g['metadataOffset']): g for g in dos['groups']}
    for a, b in zip(groups[0]['frames'], originals['ALLCANM1', 'base', 0]['frames'], strict=True):
        ap = base64.b64decode(a['pixels'])
        packed = base64.b64decode(b['pixels'])
        for y in range(min(-a['y'], -b['y']), max(a['h'] - a['y'], b['h'] - b['y'])):
            for x in range(min(-a['x'], -b['x']), max(a['w'] - a['x'], b['w'] - b['x'])):
                ax, ay, bx, by = x + a['x'], y + a['y'], x + b['x'], y + b['y']
                av = ap[ay * a['w'] + ax] if 0 <= ax < a['w'] and 0 <= ay < a['h'] else 0
                bv = ((packed[by * ((b['w'] + 1) // 2) + bx // 2] >> (4 if bx % 2 == 0 else 0)) & 15) if 0 <= bx < b['w'] and 0 <= by < b['h'] else 0
                if bool(av) != bool(bv):
                    raise ValueError('Standing silhouette differs from DOS')
    sequence_count = 0
    for g in groups:
        d = originals[g['file'], g['kind'], g['metadataOffset']]
        if [len(s['frames']) for s in g['sequences']] != [len(s['frames']) for s in d['sequences']]:
            raise ValueError('Sequence lengths differ from DOS')
        sequence_count += len(g['sequences'])
    if sequence_count != 253:
        raise ValueError(f'Unexpected sequence count: {sequence_count}')


def main():
    target = ROOT / 'web/assets/amiga.json'
    source = checked(ROOT / 'analysis/amiga-sources' / SOURCE, PIXEL_HASH)
    original = checked(ROOT / 'BattleChess.adf', PALETTE_HASH)
    data = source[:880 * 512] + source[882 * 512:]
    executable = b''.join(original[n * 512 + 24:n * 512 + 24 + struct.unpack_from('>I', original, n * 512 + 12)[0]] for n in range(1434, 1608))
    if len(executable) != 84716 or struct.unpack_from('>5hBBHH4I', executable, 75326)[2:5] != (320, 200, 5):
        raise ValueError('Unexpected executable screen data')
    palette = [[((v >> shift) & 15) * 17 for shift in (8, 4, 0)] for v in struct.unpack_from('>32H', executable, 0x126a2)]
    # User-requested red uniforms; keep the original palette intact on the source disk.
    palette[28:32] = [[238, 34, 34], [187, 17, 17], [153, 0, 0], [102, 0, 0]]
    specs = [('ALLCANM1', x, False) for x in (0, 10289, 12303)]
    specs += [('ALLCANM2', x, True) for x in WALK]
    for delta, base in zip(COMBAT, BASE, strict=True):
        specs += [('ALLCANM2', delta, True), ('ALLCANM2', base, False)]
    groups, pos = [], 5120
    for file, canonical, delta in specs:
        result, pos = group(data, pos, file, canonical, delta)
        groups.append(result)
    if len(groups) != 33 or sum(len(g['frames']) for g in groups) != 1676:
        raise ValueError('Unexpected group or frame count')
    dos = json.loads((ROOT / 'web/assets/assets.json').read_text(encoding='utf-8'))
    validate(groups, dos)
    output = {'version': 1, 'spriteSet': 'amiga', 'palette': palette,
              'redMap': {'24': 28, '25': 29, '26': 30, '27': 31},
              'sources': {'pixels': {'file': SOURCE, 'sha256': PIXEL_HASH, 'url': 'https://archive.org/download/Battle_Chess_1988_Interplay_cr_Dragon_Inc/Battle_Chess_1988_Interplay_cr_Dragon_Inc.adf'},
                          'palette': {'file': 'BattleChess.adf', 'sha256': PALETTE_HASH, 'executableOffset': '0x126a2'}},
              'sourceNote': 'Pixel stream omits sectors 880 and 881. Group file/metadataOffset values are DOS compatibility keys; sourceOffset and headerOffset identify Amiga logical stream offsets. Red uniform palette entries 28–31 are customized from magenta to red.',
              'groups': groups, 'blocks': [], 'screens': dos['screens'], 'tables': dos['tables']}
    serialized = json.dumps(output, separators=(',', ':'))
    if target.exists():
        if target.read_text(encoding='utf-8') != serialized:
            raise ValueError(f'Existing manifest differs; preserving {target}')
    else:
        target.write_text(serialized, encoding='utf-8')
    print(f'{len(groups)} groups, 1676 frames, 47 silhouettes, 253 sequences; {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
