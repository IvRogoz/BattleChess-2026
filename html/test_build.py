"""Check the offline export against its shared web source."""
import base64
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent
WEB = ROOT.parent / 'web'
spec = importlib.util.spec_from_file_location('html_build', ROOT / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value and not value.startswith(('data:', '#', 'http:', 'https:')):
                self.paths.append(value)


class BuildTests(unittest.TestCase):
    def test_export_and_overwrite_guard(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            output = Path(tmp) / 'BattleChess'
            original = (WEB / 'index.html').read_bytes()
            builder.build(WEB, output)
            self.assertEqual((WEB / 'index.html').read_bytes(), original)
            html = (output / 'BattleChess.html').read_text(encoding='utf-8')
            self.assertLess(html.index('assets/local-data.js'), html.index('engine.js'))
            refs = References(); refs.feed(html)
            for path in refs.paths:
                self.assertTrue((output / path).is_file(), path)
            payload = (output / 'assets' / 'local-data.js').read_text(encoding='utf-8')
            self.assertTrue(payload.startswith(builder.PREFIX) and payload.endswith(';\n'))
            data = json.loads(payload[len(builder.PREFIX):-2])
            for name, filename in [('dos', 'assets.json'), ('amiga', 'amiga.json')]:
                self.assertEqual(data['sprites'][name], json.loads((WEB / 'assets' / filename).read_text(encoding='utf-8')))
            offsets = re.search(r'const SoundOffsets\s*=\s*Object\.freeze\(\[([\d,\s]+)\]\)', (WEB / 'original-audio.js').read_text(encoding='utf-8')).group(1)
            offsets = [x.strip() for x in offsets.split(',')]
            self.assertEqual(set(data['sounds']), {str(i) for i in range(len(offsets))})
            self.assertEqual(len(data['sounds']), 15)
            for sound_id, encoded in data['sounds'].items():
                offset = offsets[int(sound_id)]
                self.assertEqual(base64.b64decode(encoded), (WEB / 'assets' / 'blocks' / f'allcanm1-{offset}.bin').read_bytes())
            self.assertNotIn('importScripts(', data['workerSource'])
            self.assertIn((WEB / 'engine.js').read_text(encoding='utf-8'), data['workerSource'])
            self.assertIn((WEB / 'ai.js').read_text(encoding='utf-8'), data['workerSource'])
            with self.assertRaises(FileExistsError):
                builder.build(WEB, output)
            self.assertEqual((output / 'BattleChess.html').read_text(encoding='utf-8'), html)


if __name__ == '__main__':
    unittest.main()
