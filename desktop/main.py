"""Run the unchanged web game in a portable Windows pywebview window."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import ctypes
import sys


PORT = 18765  # A stable origin keeps localStorage saves available between launches.


def application_root():
    return Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent


def web_root():
    root = Path(__file__).resolve().parent
    return root / 'web' if getattr(sys, 'frozen', False) else root.parent / 'web'


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format, *args):
        pass


def square_window(window):
    if sys.getwindowsversion().build >= 22000:
        preference = ctypes.c_int(1)  # DWMWCP_DONOTROUND for this window only.
        ctypes.windll.dwmapi.DwmSetWindowAttribute(
            ctypes.c_void_p(window.native.Handle.ToInt64()), 33,
            ctypes.byref(preference), ctypes.sizeof(preference))


def main():
    if sys.platform != 'win32':
        raise RuntimeError('This desktop build targets 64-bit Windows.')
    import webview

    root, game = application_root(), web_root()
    for name in ['index.html', 'app.js', 'ai-worker.js', 'assets/assets.json', 'assets/amiga.json']:
        if not (game / name).is_file():
            raise FileNotFoundError('Game file is missing: ' + str(game / name))

    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), partial(GameHandler, directory=str(game)))
    except OSError as error:
        raise RuntimeError(f'Battle Chess cannot use local port {PORT}. Close the other desktop instance or application using it.') from error
    thread = Thread(target=server.serve_forever, name='BattleChessAssets', daemon=True)
    thread.start()
    try:
        profile = root / 'data' / 'browser'
        profile.mkdir(parents=True, exist_ok=True)
        webview.settings['WEBVIEW2_RUNTIME_PATH'] = None
        webview.settings['ALLOW_DOWNLOADS'] = True
        window = webview.create_window(
            'Battle Chess', f'http://127.0.0.1:{server.server_port}/',
            width=1060, height=1040, min_size=(640, 720), background_color='#070809')
        window.events.before_show += square_window
        webview.start(gui='edgechromium', private_mode=False, storage_path=str(profile))
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if sys.platform == 'win32':
            ctypes.windll.user32.MessageBoxW(None, str(error), 'Battle Chess could not start', 0x10)
        else:
            print(str(error), file=sys.stderr)
        raise SystemExit(1)
