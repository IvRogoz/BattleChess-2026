"""Launcher checks using a fake WebView; no desktop window is opened."""
import importlib.util
from pathlib import Path
import socket
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from urllib.request import urlopen


DESKTOP = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('battle_chess_desktop', DESKTOP / 'main.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
application_root = launcher.application_root


class Event:
    def __iadd__(self, callback):
        self.callback = callback
        return self


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=DESKTOP)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.webview = types.ModuleType('webview')
        self.webview.settings = {}
        self.window = types.SimpleNamespace(events=types.SimpleNamespace(before_show=Event()))
        self.webview.create_window = unittest.mock.Mock(return_value=self.window)
        self.webview.start = unittest.mock.Mock()
        for context in (patch.object(launcher.sys, 'platform', 'win32'),
                        patch.object(launcher, 'application_root', return_value=self.root),
                        patch.dict(sys.modules, {'webview': self.webview})):
            context.start()
            self.addCleanup(context.stop)

    def test_http_and_webview_configuration(self):
        def inspect(**kwargs):
            url = self.webview.create_window.call_args.args[1]
            for path, mime in [('index.html', 'text/html'), ('engine.js', 'text/javascript'),
                               ('ai-worker.js', 'text/javascript'), ('assets/assets.json', 'application/json'),
                               ('assets/blocks/allcanm1-98441.bin', 'application/octet-stream')]:
                with urlopen(url + path) as response:
                    self.assertEqual(response.headers.get_content_type(), mime)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
                    self.assertTrue(response.read())
            self.assertEqual(kwargs, {'gui': 'edgechromium', 'private_mode': False,
                                      'storage_path': str(self.root / 'data' / 'browser')})
        self.webview.start.side_effect = inspect
        with patch.object(launcher, 'PORT', 0):
            launcher.main()
        self.assertIsNone(self.webview.settings.get('WEBVIEW2_RUNTIME_PATH'))
        self.assertTrue(self.webview.settings['ALLOW_DOWNLOADS'])
        self.assertTrue((self.root / 'data' / 'browser').is_dir())
        self.assertEqual(self.webview.create_window.call_args.kwargs['min_size'], (640, 720))
        self.assertIs(self.window.events.before_show.callback, launcher.square_window)
        self.assert_port_released()

    def assert_port_released(self):
        url = self.webview.create_window.call_args.args[1]
        port = int(url.split(':')[2].rstrip('/'))
        with socket.socket() as sock:
            self.assertNotEqual(sock.connect_ex(('127.0.0.1', port)), 0)

    def test_start_failure_releases_port(self):
        self.webview.start.side_effect = RuntimeError('start failed')
        with patch.object(launcher, 'PORT', 0), self.assertRaisesRegex(RuntimeError, 'start failed'):
            launcher.main()
        self.assert_port_released()

    def test_occupied_port_never_creates_window(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            sock.listen()
            with patch.object(launcher, 'PORT', sock.getsockname()[1]), self.assertRaisesRegex(RuntimeError, 'local port'):
                launcher.main()
        self.webview.create_window.assert_not_called()

    def test_missing_game_asset_never_creates_window(self):
        with patch.object(launcher, 'web_root', return_value=self.root), \
             self.assertRaisesRegex(FileNotFoundError, 'Game file is missing'):
            launcher.main()
        self.webview.create_window.assert_not_called()

    def test_source_and_frozen_paths(self):
        with patch.object(launcher.sys, 'frozen', False, create=True):
            self.assertEqual(application_root(), DESKTOP)
            self.assertEqual(launcher.web_root(), DESKTOP.parent / 'web')
        with patch.object(launcher.sys, 'frozen', True, create=True), \
             patch.object(launcher.sys, 'executable', str(self.root / 'BattleChess.exe')), \
             patch.object(launcher, '__file__', str(self.root / 'bundle' / 'main.py')):
            self.assertEqual(application_root(), self.root)
            self.assertEqual(launcher.web_root(), self.root / 'bundle' / 'web')


if __name__ == '__main__':
    unittest.main()
