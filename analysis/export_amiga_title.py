"""Export the original 32-color Amiga title without changing existing assets."""
import struct
import zlib

from decode_assets import decode
from export_amiga_assets import ROOT, SOURCE, PIXEL_HASH, checked, pixels as planar_pixels


def chunk(kind, payload):
    return (struct.pack('>I', len(payload)) + kind + payload
            + struct.pack('>I', zlib.crc32(kind + payload)))


def main():
    source = checked(ROOT / 'analysis/amiga-sources' / SOURCE, PIXEL_HASH)
    data = source[:880 * 512] + source[882 * 512:]
    offset = 705871
    raw, end, bits = decode(data, offset, '>')
    if len(raw) != 40064 or end - (offset + 8) * 8 != bits - 7:
        raise ValueError('Invalid Amiga title block')
    palette_words = struct.unpack('>32H', raw[40000:])
    if any(value > 0xfff for value in palette_words):
        raise ValueError('Invalid RGB4 title palette')
    dos_title = (ROOT / 'web/assets/blocks/allcanm1-146784.bin').read_bytes()
    if len(dos_title) != 32064 or raw[40000:] != dos_title[32000:]:
        raise ValueError('Title palette does not match the original title resource')

    # Full-screen prediction continues across bitplane boundaries.
    raster = bytearray(raw[:40000])
    for i in range(40, len(raster)):
        raster[i] ^= raster[i - 40]
    pixels = planar_pixels(raster, 40, 200, True)
    if set(pixels) != set(range(32)):
        raise ValueError('Expected all 32 original title colors')
    palette = bytes(((value >> shift) & 15) * 17
                    for value in palette_words for shift in (8, 4, 0))
    scanlines = b''.join(b'\0' + pixels[y * 320:(y + 1) * 320] for y in range(200))
    image = (b'\x89PNG\r\n\x1a\n'
             + chunk(b'IHDR', struct.pack('>IIBBBBB', 320, 200, 8, 3, 0, 0, 0))
             + chunk(b'PLTE', palette)
             + chunk(b'IDAT', zlib.compress(scanlines, 9))
             + chunk(b'IEND', b''))
    target = ROOT / 'web/assets/title-amiga.png'
    if target.exists():
        if target.read_bytes() != image:
            raise ValueError(f'Existing title differs; preserving {target}')
    else:
        target.write_bytes(image)
    print(f'{target}: 320 x 200, 32 used colors, {len(image)} bytes; source block {offset}')


if __name__ == '__main__':
    main()
