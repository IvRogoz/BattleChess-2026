"""Export verified static board and capture control data from the unpacked image."""
import json
import struct
from pathlib import Path

image = Path(__file__).with_name('unpacked-image.bin').read_bytes()
base = 0x5cc20

def lists(offset):
    pos = base + offset
    result = []
    for _ in range(72):
        end = image.index(b'\xff', pos)
        result.append(list(image[pos:end]))
        pos = end + 1
    return [result[:36], result[36:]]

def words(offset, count):
    return list(struct.unpack_from(f'<{count}h', image, base + offset))

print(json.dumps({
    'perspective_x': words(0x34e, 64),
    'perspective_y': words(0x3ce, 8),
    'initial_board': list(image[base + 0x1166:base + 0x11a6]),
    'perspective_facing_frames': list(image[base + 0x166:base + 0x1a6]),
    'resource_lists': lists(0x0f08),
    'timing_variant_0': lists(0x11ba),
    'timing_variant_1': lists(0x2010),
}))
