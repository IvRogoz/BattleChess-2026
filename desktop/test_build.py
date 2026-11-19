"""Build script checks without running PyInstaller."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


DESKTOP = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('battle_chess_build', DESKTOP / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=DESKTOP)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        contexts = [patch.object(build, '__file__', str(self.root / 'build.py')),
                    patch.object(build.sys, 'platform', 'win32'),
                    patch.object(build.struct, 'calcsize', return_value=8),
                    patch.object(build.importlib.util, 'find_spec', return_value=object()),
                    patch.object(build.subprocess, 'run'),
                    patch.object(build.shutil, 'copy2')]
        for context in contexts:
            context.start()
            self.addCleanup(context.stop)

    def test_missing_dependency_stops_build(self):
        build.importlib.util.find_spec.return_value = None
        with self.assertRaisesRegex(SystemExit, 'Missing build dependency: webview'):
            build.main()
        build.subprocess.run.assert_not_called()

    def test_existing_output_stops_build(self):
        (self.root / 'dist' / 'BattleChess').mkdir(parents=True)
        with self.assertRaisesRegex(SystemExit, 'Output already exists'):
            build.main()
        build.subprocess.run.assert_not_called()

    def test_build_configuration(self):
        build.main()
        args, kwargs = build.subprocess.run.call_args
        self.assertEqual(args[0], [build.sys.executable, '-B', '-m', 'PyInstaller', '--noconfirm',
                                   '--distpath', str(self.root / 'dist'), '--workpath', str(self.root / 'build'),
                                   str(self.root / 'BattleChess.spec')])
        self.assertEqual(kwargs['cwd'], self.root)
        self.assertTrue(kwargs['check'])
        self.assertEqual(kwargs['env']['PYINSTALLER_CONFIG_DIR'], str(self.root / '.build-cache'))
        self.assertEqual(kwargs['env']['PYTHONDONTWRITEBYTECODE'], '1')
        self.assertEqual(kwargs['env']['TEMP'], str(self.root / '.build-cache' / 'tmp'))
        self.assertEqual(kwargs['env']['TMP'], str(self.root / '.build-cache' / 'tmp'))
        build.shutil.copy2.assert_called_once_with(self.root / 'README.md', self.root / 'dist' / 'BattleChess' / 'README.md')


if __name__ == '__main__':
    unittest.main()
