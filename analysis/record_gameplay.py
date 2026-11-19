"""Record the game in an isolated headless browser, never the OS desktop.

Uses an already-installed chrome-headless-shell, websocket-client and FFmpeg.
No system browser, mouse/keyboard simulation, microphone, or system audio capture.
"""
import argparse
import base64
from functools import partial
from http.server import ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from threading import Thread
import time
from urllib.request import urlopen

import websocket

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from desktop.main import GameHandler


class Page:
    def __init__(self, address, work):
        self.socket = websocket.create_connection(address, timeout=.25, suppress_origin=True)
        self.sequence = 0
        self.work, self.frames, self.errors = work, [], []

    def send(self, method, params=None):
        self.sequence += 1
        self.socket.send(json.dumps({'id': self.sequence, 'method': method, 'params': params or {}}))
        return self.sequence

    def receive(self):
        try:
            message = json.loads(self.socket.recv())
        except websocket.WebSocketTimeoutException:
            return {}
        if message.get('method') == 'Page.screencastFrame':
            data = message['params']
            self.send('Page.screencastFrameAck', {'sessionId': data['sessionId']})
            path = self.work / 'frames' / f'{len(self.frames):06d}.jpg'
            path.write_bytes(base64.b64decode(data['data']))
            self.frames.append((path, data['metadata']['timestamp']))
        elif message.get('method') == 'Runtime.exceptionThrown':
            self.errors.append(message['params']['exceptionDetails'])
        return message

    def call(self, method, params=None, timeout=30):
        request = self.send(method, params)
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            message = self.receive()
            if message.get('id') == request:
                if 'error' in message:
                    raise RuntimeError(message['error'])
                return message.get('result', {})
        raise TimeoutError(method)

    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True,
                                               'awaitPromise': True, 'userGesture': True})
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')

    def pump(self, seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            self.receive()

    def wait(self, expression, timeout=120):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if self.evaluate(expression):
                return
            self.pump(.15)
        raise TimeoutError(expression)


AUDIO_CAPTURE = r"""
(() => {
  const NativeContext = window.AudioContext;
  window.AudioContext = class extends NativeContext {
    constructor(...args) {
      super(...args);
      this.recordingDestination = this.createMediaStreamDestination();
      this.recordingInput = this.createGain();
      this.recordingInput.gain.value = .125;
      this.recordingInput.connect(this.recordingDestination);
      // Keep silence flowing before the first effect so audio timestamps start on time.
      this.recordingSilence = this.createConstantSource();
      this.recordingSilence.offset.value = 0;
      this.recordingSilence.connect(this.recordingDestination);
      this.recordingSilence.start();
      window.recordingContext = this;
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination === this.context.destination && this.context.recordingDestination)
      connect.call(this, this.context.recordingInput);
    return result;
  };
})()
"""


def encode_video(work, output, metadata, ffmpeg, environment):
    lines = (work / 'frames.txt').read_text(encoding='utf-8').splitlines()
    paths = [work / line[6:-1] for line in lines if line.startswith("file '")][:-1]
    durations = [float(line.split(' ', 1)[1]) for line in lines if line.startswith('duration ')]
    assert len(paths) == len(durations)
    offsets, elapsed = [], 0
    for duration in durations:
        offsets.append(elapsed)
        elapsed += duration
    fps, count = 30, math.ceil(metadata['duration'] * 30)
    lead = max(0, metadata['videoStart'] - metadata['audioStart'])
    encoder = subprocess.Popen([
        ffmpeg, '-hide_banner', '-loglevel', 'warning', '-n',
        '-f', 'image2pipe', '-framerate', str(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0',
        '-i', str(work / 'audio.webm'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
        '-af', f'atrim=start={lead},asetpts=PTS-STARTPTS,volume=2,apad',
        '-t', str(count / fps), '-movflags', '+faststart', str(output),
    ], stdin=subprocess.PIPE, env=environment)
    index, cached, image_bytes = 0, -1, None
    try:
        # Feed a frame for every output timestamp, including holds between page updates.
        for frame in range(count):
            while index + 1 < len(paths) and offsets[index + 1] <= frame / fps:
                index += 1
            if cached != index:
                image_bytes, cached = paths[index].read_bytes(), index
            encoder.stdin.write(image_bytes)
        assert index == len(paths) - 1, 'Final game frame was not encoded'
    finally:
        encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError('FFmpeg could not encode the recording.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', type=Path, required=True, help='Existing chrome-headless-shell.exe')
    parser.add_argument('--output', type=Path, default=ROOT / 'recordings' / 'battle-chess-amiga.mp4')
    args = parser.parse_args()
    if args.browser.name.lower() != 'chrome-headless-shell.exe' or not args.browser.is_file():
        raise SystemExit('Use the dedicated, already-installed chrome-headless-shell.exe.')
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('FFmpeg is not installed; no dependencies were changed.')
    output = args.output.resolve()
    if not output.is_relative_to(ROOT) or output.exists():
        raise SystemExit('Output must be a new file inside this project.')
    output.parent.mkdir(parents=True, exist_ok=True)
    work = output.parent / '.work' / str(time.time_ns())
    for name in ['frames', 'profile', 'cache', 'tmp']:
        (work / name).mkdir(parents=True)

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(GameHandler, directory=str(ROOT / 'web')))
    server_thread = Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    log = (work / 'chromium.log').open('w', encoding='utf-8')
    environment = dict(os.environ, TEMP=str(work / 'tmp'), TMP=str(work / 'tmp'))
    browser = subprocess.Popen([
        str(args.browser), '--headless', '--disable-gpu', '--mute-audio',
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
        '--disable-component-update', '--disable-sync', '--disable-default-apps',
        '--autoplay-policy=no-user-gesture-required', '--window-size=1060,1040',
        '--user-data-dir=' + str(work / 'profile'), '--disk-cache-dir=' + str(work / 'cache'),
        'about:blank',
    ], stdout=log, stderr=subprocess.STDOUT, env=environment,
        creationflags=subprocess.CREATE_NO_WINDOW)
    page = None
    try:
        end = time.monotonic() + 30
        address = None
        while time.monotonic() < end:
            text = (work / 'chromium.log').read_text(encoding='utf-8', errors='replace')
            match = re.search(r'DevTools listening on ws://127\.0\.0\.1:(\d+)/', text)
            if match:
                address = 'http://127.0.0.1:' + match[1]
                break
            if browser.poll() is not None:
                raise RuntimeError('Headless browser exited: ' + text)
            time.sleep(.1)
        if not address:
            raise TimeoutError('Headless browser did not expose its isolated DevTools endpoint.')
        with urlopen(address + '/json/list', timeout=10) as response:
            targets = json.load(response)
        target = next(item for item in targets if item['type'] == 'page')
        page = Page(target['webSocketDebuggerUrl'], work)
        page.call('Page.enable')
        page.call('Runtime.enable')
        page.call('Emulation.setDeviceMetricsOverride', {'width': 1060, 'height': 1040, 'deviceScaleFactor': 1, 'mobile': False})
        page.call('Page.addScriptToEvaluateOnNewDocument', {'source': AUDIO_CAPTURE})
        page.call('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/'})
        page.wait("document.getElementById('start') && !document.getElementById('start').disabled")
        assert page.evaluate("document.getElementById('sprites').value") == 'amiga', 'Amiga did not default'
        page.evaluate("""
          window.recordedCombats=[];
          const originalCombat=OriginalAssets.prototype.combat;
          OriginalAssets.prototype.combat=function(...args){recordedCombats.push(args);return originalCombat.apply(this,args);};
          const originalDraw=OriginalBoard.prototype.draw;
          OriginalBoard.prototype.draw=function(codes,...args){window.recordedBoardCodes=codes.slice();return originalDraw.call(this,codes,...args);};
        """)
        page.evaluate("document.getElementById('mode').value='local'; document.getElementById('mode').onchange();")
        page.evaluate("document.getElementById('sound').checked=true; document.getElementById('sound').onchange()")
        audio_start = page.evaluate("""(() => {
          window.audioChunks=[];
          window.audioRecording=new MediaRecorder(recordingContext.recordingDestination.stream,{mimeType:'audio/webm;codecs=opus'});
          audioRecording.ondataavailable=event=>audioChunks.push(event.data);
          audioRecording.start(250);
          return (performance.timeOrigin+performance.now())/1000;
        })()""")
        page.wait('audioChunks.length > 0', timeout=10)
        page.call('Page.startScreencast', {'format': 'jpeg', 'quality': 95, 'maxWidth': 1060, 'maxHeight': 1040, 'everyNthFrame': 1})
        page.pump(2)
        page.evaluate("document.getElementById('start').click()")
        page.pump(1)
        # Scholar's mate ends with the legal pawn capture; both kings stay on the board.
        moves = [(52, 36), (12, 28), (61, 34), (1, 18), (59, 31), (6, 21), (31, 13)]
        for count, (source, destination) in enumerate(moves, 1):
            page.evaluate(f"document.querySelectorAll('#accessible-board button')[{source}].click(); document.querySelectorAll('#accessible-board button')[{destination}].click();")
            page.wait(f"document.getElementById('move-count').textContent==='{count}' && document.getElementById('skip').hidden")
            print(f'Move {count}/{len(moves)} complete; {len(page.frames)} page frames', flush=True)
            page.pump(.8)
        assert page.evaluate("document.getElementById('status').textContent") == 'Check and mate… Game over.'
        assert page.evaluate("JSON.parse(localStorage.getItem('original-battle-chess-v1')).settings.sprites") == 'amiga'
        assert page.evaluate('(recordedBoardCodes[4]&7)===2 && (recordedBoardCodes[60]&7)===2 && (recordedBoardCodes[13]&7)===5'), 'Checkmate board changed'
        assert page.evaluate("recordedCombats.every(pair=>pair[1].toLowerCase()!=='k')"), 'A king capture was animated'
        assert page.evaluate("!document.getElementById('game-over').hidden && document.getElementById('message-text').textContent==='Check and mate...Game over.' && document.getElementById('message-canvas').width===240 && document.getElementById('message-canvas').height===41"), 'Original Amiga game-over box missing'
        page.pump(3)
        video_end = page.evaluate('(performance.timeOrigin+performance.now())/1000')
        audio = page.evaluate("""new Promise(resolve => {
          audioRecording.onstop=()=>{
            const reader=new FileReader();
            reader.onload=()=>resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(new Blob(audioChunks,{type:'audio/webm'}));
          };
          audioRecording.stop();
        })""")
        (work / 'audio.webm').write_bytes(base64.b64decode(audio))
        page.call('Page.stopScreencast')
        assert len(page.frames) > 20, 'No gameplay frames recorded'
        assert not page.errors, page.errors
        assert 0 < video_end - page.frames[0][1] < 600, 'Unexpected video clock or duration'
        assert abs(audio_start - page.frames[0][1]) < 2, 'Audio and video clocks differ'
        timeline = []
        for index, (path, stamp) in enumerate(page.frames):
            following = page.frames[index + 1][1] if index + 1 < len(page.frames) else video_end
            timeline += ["file 'frames/" + path.name + "'", 'duration ' + str(max(.001, following - stamp))]
        timeline.append("file 'frames/" + page.frames[-1][0].name + "'")
        (work / 'frames.txt').write_text('\n'.join(timeline), encoding='utf-8')
        metadata = {'moves': moves, 'sprites': 'amiga', 'sound': 'original game Web Audio only',
                    'pageFrames': len(page.frames), 'duration': video_end - page.frames[0][1],
                    'viewport': [1060, 1040], 'desktopCapture': False, 'browser': str(args.browser),
                    'audioStart': audio_start, 'videoStart': page.frames[0][1],
                    'kingsRetained': True, 'gameOverBox': 'original Amiga',
                    'combats': page.evaluate('recordedCombats')}
        (work / 'recording.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
        encode_video(work, output, metadata, ffmpeg, environment)
        print('Recorded ' + str(output), flush=True)
        print(json.dumps(metadata), flush=True)
    finally:
        if page:
            page.socket.close()
        browser.terminate()
        browser.wait(timeout=15)
        log.close()
        server.shutdown()
        server.server_close()
        server_thread.join()


if __name__ == '__main__':
    main()
