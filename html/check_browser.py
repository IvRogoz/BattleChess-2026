"""Smoke-test an exported file in the dedicated offscreen Chromium shell."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'analysis'))
from record_gameplay import Page

BROWSER = Path('C:/Users/ivanr2/AppData/Local/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-win64/chrome-headless-shell.exe')
INSTRUMENT = r"""
window.fetchCalls=[]; window.fetch=(...args)=>{fetchCalls.push(String(args[0])); throw Error('Unexpected fetch');};
window.workerURLs=[]; window.workerMessages=[]; window.workerErrors=[];
const NativeWorker=window.Worker;
window.Worker=class extends NativeWorker {
  constructor(url,...args) { super(url,...args); workerURLs.push(String(url));
    this.addEventListener('message', e=>workerMessages.push(e.data));
    this.addEventListener('error', e=>workerErrors.push(e.message)); }
};
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', nargs='?', type=Path, default=ROOT / 'dist' / 'BattleChess' / 'BattleChess.html')
    args = parser.parse_args()
    html = args.html.resolve(strict=True)
    if not BROWSER.is_file():
        raise FileNotFoundError(BROWSER)
    work = ROOT / '.work' / str(time.time_ns())
    for name in ('profile', 'cache', 'tmp', 'downloads'):
        (work / name).mkdir(parents=True)
    log = (work / 'browser.log').open('w', encoding='utf-8')
    env = dict(os.environ, TEMP=str(work / 'tmp'), TMP=str(work / 'tmp'))
    browser = subprocess.Popen([str(BROWSER), '--headless', '--disable-gpu', '--mute-audio',
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--no-first-run',
        '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
        '--disable-sync', '--disable-default-apps', '--autoplay-policy=no-user-gesture-required',
        '--user-data-dir=' + str(work / 'profile'), '--disk-cache-dir=' + str(work / 'cache'), 'about:blank'],
        stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
    page = None
    try:
        end = time.monotonic() + 30
        while time.monotonic() < end:
            text = (work / 'browser.log').read_text(encoding='utf-8', errors='replace')
            match = re.search(r'DevTools listening on ws://127\.0\.0\.1:(\d+)/', text)
            if match:
                break
            if browser.poll() is not None:
                raise RuntimeError('Headless browser exited: ' + text)
            time.sleep(.1)
        else:
            raise TimeoutError('Headless browser did not start')
        with urlopen('http://127.0.0.1:' + match[1] + '/json/list', timeout=10) as response:
            target = next(x for x in json.load(response) if x['type'] == 'page')
        page = Page(target['webSocketDebuggerUrl'], work)
        page.call('Page.enable'); page.call('Runtime.enable')
        page.call('Browser.setDownloadBehavior', {'behavior': 'allow', 'downloadPath': str(work / 'downloads')})
        page.call('Page.addScriptToEvaluateOnNewDocument', {'source': INSTRUMENT})
        page.call('Page.navigate', {'url': html.as_uri()})
        page.wait("document.getElementById('start') && !document.getElementById('start').disabled", timeout=30)
        assert page.evaluate("document.getElementById('sprites').value==='amiga'")
        assert page.evaluate("document.getElementById('about-dialog').textContent.includes('Ivan Rogoz') && document.getElementById('about-dialog').textContent.includes('Originator of this restoration effort') && !!document.querySelector('#about-dialog a[href=\"https://warped3.substack.com\"]')")
        page.evaluate("document.getElementById('animations').checked=false; document.getElementById('animations').onchange(); document.getElementById('start').click();")
        page.evaluate("document.querySelectorAll('#accessible-board button')[52].click(); document.querySelectorAll('#accessible-board button')[36].click()")
        page.wait("document.getElementById('move-count').textContent==='2'", timeout=30)
        assert page.evaluate("workerURLs.some(url=>url.startsWith('blob:')) && workerMessages.some(m=>m.move) && !workerErrors.length")
        page.evaluate("document.getElementById('mode').value='local'; document.getElementById('mode').onchange(); document.getElementById('new').click(); document.getElementById('new-dialog').close('start');")
        page.wait("document.getElementById('move-count').textContent==='0'", timeout=10)
        for sprites in ('dos', 'amiga'):
            page.evaluate(f"document.getElementById('sprites').value='{sprites}'; document.getElementById('sprites').onchange()")
            assert page.evaluate(f"document.getElementById('sprites').value==='{sprites}'")
        assert page.evaluate("""(async()=>{const c=new AudioContext(); await c.resume();
          for(let i=0;i<15;i++){const s=await OriginalAudio.playId(c,i,0); if(!s.buffer.length) return false; s.stop();}
          await c.close(); return true;})()""")
        page.evaluate("""window.combats=[]; const combat=OriginalAssets.prototype.combat;
          OriginalAssets.prototype.combat=function(...a){combats.push(a);return combat.apply(this,a)};
          const draw=OriginalBoard.prototype.draw; OriginalBoard.prototype.draw=function(c,...a){window.codes=c.slice();return draw.call(this,c,...a)};""")
        fixture = {'version': 1, 'settings': {'mode': 'local', 'human': 'w', 'depth': 1, 'sound': False,
                   'animations': True, 'speed': 2, 'view': '3d', 'sprites': 'amiga'},
                   'moves': [[52,36,'q'],[12,28,'q'],[61,34,'q'],[1,18,'q'],[59,31,'q'],[6,21,'q']]}
        page.evaluate("""(async()=>{const d=new DataTransfer();d.items.add(new File([JSON.stringify(%s)],'save.json',{type:'application/json'}));
          const input=document.getElementById('save-file');input.files=d.files;await input.onchange();})()""" % json.dumps(fixture))
        assert page.evaluate("document.getElementById('move-count').textContent==='6'")
        page.evaluate("document.querySelectorAll('#accessible-board button')[31].click();document.querySelectorAll('#accessible-board button')[13].click()")
        page.wait("document.getElementById('move-count').textContent==='7' && document.getElementById('skip').hidden && !document.getElementById('game-over').hidden", timeout=30)
        assert page.evaluate("combats.length===1 && combats[0][0].toLowerCase()==='q' && combats[0][1].toLowerCase()==='p' && (codes[4]&7)===2 && (codes[60]&7)===2 && (codes[13]&7)===5 && document.getElementById('message-canvas').width===240 && document.getElementById('message-canvas').height===41 && !document.getElementById('status').textContent.includes('Animation')")
        page.evaluate("document.getElementById('sprites').value='dos';document.getElementById('sprites').onchange()")
        assert page.evaluate("!document.getElementById('game-over').hidden && document.getElementById('message-canvas').width===304 && document.getElementById('message-canvas').height===53")
        page.evaluate("document.getElementById('save').click()")
        exported = work / 'downloads' / 'battle-chess-save.json'
        deadline = time.monotonic() + 10
        while not exported.is_file() and time.monotonic() < deadline:
            page.pump(.1)
        saved = json.loads(exported.read_text(encoding='utf-8'))
        assert saved['moves'] == fixture['moves'] + [[31, 13, 'q']]
        assert saved['settings']['sprites'] == 'dos'
        assert page.evaluate('!fetchCalls.length && !workerErrors.length')
        assert not page.errors, page.errors
        print('Offline HTML smoke checks passed:', html)
    finally:
        if page:
            try:
                page.send('Browser.close')
            except Exception:
                pass
            page.socket.close()
        try:
            browser.wait(timeout=10)
        except subprocess.TimeoutExpired:
            browser.terminate()
            browser.wait(timeout=10)
        log.close()


if __name__ == '__main__':
    main()
