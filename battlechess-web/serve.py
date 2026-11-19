"""Serve this game on loopback only. No build tools or external services required."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from pathlib import Path
import argparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent

    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root)))
    except OSError as error:
        parser.exit(1, f'Could not start the local server: {error}\nTry --port 8766.\n')
    print(f'Battle Chess: http://127.0.0.1:{server.server_port}', flush=True)
    print('Local only. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
