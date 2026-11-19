"""Build the offline HTML edition from the shared web game."""
import base64
import json
from pathlib import Path
import re
import shutil


FILES = ['style.css', 'engine.js', 'ai.js', 'original.js', 'scene-player.js',
         'original-audio.js', 'message-box.js', 'app.js',
         'assets/board.png', 'assets/board-flat.png', 'assets/title-amiga.png']
PREFIX = 'globalThis.BattleChessLocalData='


def build(source, output):
    if output.exists():
        raise FileExistsError(f'Output already exists: {output}. Move or rename it before rebuilding.')
    index = (source / 'index.html').read_text(encoding='utf-8')
    marker = '  <script defer src="engine.js"></script>'
    if index.count(marker) != 1:
        raise ValueError('Expected one engine script in index.html')
    for name in FILES:
        if not (source / name).is_file() or not (source / name).stat().st_size:
            raise ValueError(f'Missing or empty game file: {name}')
    sprites = {name: json.loads((source / 'assets' / filename).read_text(encoding='utf-8'))
               for name, filename in [('dos', 'assets.json'), ('amiga', 'amiga.json')]}
    if any(not data.get('groups') or not data.get('tables') for data in sprites.values()):
        raise ValueError('Invalid sprite data')
    audio = (source / 'original-audio.js').read_text(encoding='utf-8')
    match = re.search(r'const SoundOffsets\s*=\s*Object\.freeze\(\[([\d,\s]+)\]\)', audio)
    if not match:
        raise ValueError('Original sound offsets not found')
    offsets = [int(x.strip()) for x in match.group(1).split(',')]
    if len(offsets) != 15 or len(set(offsets)) != 15:
        raise ValueError('Invalid original sound offsets')
    sounds = {}
    for sound_id, offset in enumerate(offsets):
        block = (source / 'assets' / 'blocks' / f'allcanm1-{offset}.bin').read_bytes()
        if len(block) < 5 or not int.from_bytes(block[:2], 'little') or not int.from_bytes(block[2:4], 'little') or int.from_bytes(block[:2], 'little') > len(block) - 4:
            raise ValueError(f'Invalid sound block: {offset}')
        sounds[str(sound_id)] = base64.b64encode(block).decode('ascii')
    worker = (source / 'ai-worker.js').read_text(encoding='utf-8')
    imports = "importScripts('engine.js', 'ai.js');"
    if worker.count(imports) != 1:
        raise ValueError('Expected worker imports not found')
    worker = (source / 'engine.js').read_text(encoding='utf-8') + '\n' + (source / 'ai.js').read_text(encoding='utf-8') + '\n' + worker.replace(imports, '', 1)
    data = {'sprites': sprites, 'sounds': sounds, 'workerSource': worker}
    output.mkdir(parents=True)
    (output / 'assets').mkdir()
    for name in FILES:
        shutil.copy2(source / name, output / name)
    (output / 'BattleChess.html').write_text(index.replace(marker, '  <script defer src="assets/local-data.js"></script>\n' + marker), encoding='utf-8')
    (output / 'assets' / 'local-data.js').write_text(PREFIX + json.dumps(data, separators=(',', ':'), ensure_ascii=True) + ';\n', encoding='utf-8')


def main():
    root = Path(__file__).resolve().parent
    output = root / 'dist' / 'BattleChess'
    build(root.parent / 'web', output)
    print('HTML game:', output / 'BattleChess.html')


if __name__ == '__main__':
    main()
