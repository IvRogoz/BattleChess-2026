"""Controller tests in native QuickJS with a synthetic DOM; no browser or UI access."""
import json
from pathlib import Path
import re
import unittest
import quickjs

ROOT = Path(__file__).resolve().parents[1]
IDS = re.findall(r'\bid="([^"]+)"', (ROOT / 'index.html').read_text(encoding='utf-8'))

DOM = r'''
globalThis.window=globalThis;
globalThis.console={error:function(){}};
globalThis.matchMedia=function(){return {matches:true}};
var __storage={},__timers={},__timerId=0;
globalThis.localStorage={getItem:k=>__storage[k]||null,setItem:(k,v)=>{__storage[k]=v}};
globalThis.setTimeout=(fn,ms)=>{__timers[++__timerId]=fn;return __timerId};
globalThis.clearTimeout=id=>{delete __timers[id]};
globalThis.requestAnimationFrame=fn=>fn();
globalThis.__flushTimers=()=>{const pending=__timers;__timers={};for(const fn of Object.values(pending))fn()};
class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attributes={};
    this.events={};this.className='';this._html='';this._text='';this.hidden=false;this.disabled=false;
    this.open=false;this.value='';this.checked=false;this.scrollHeight=0;this.scrollTop=0;
    this.classList={toggle:(n,on)=>{const s=new Set(this.className.split(/\s+/).filter(Boolean));
      if(on===undefined)on=!s.has(n);on?s.add(n):s.delete(n);this.className=[...s].join(' ');return on;},
      contains:n=>this.className.split(/\s+/).includes(n)};
  }
  set innerHTML(v){this._html=v;this.children=[];}
  get innerHTML(){return this._html;}
  set textContent(v){this._text=String(v);this.children=[];}
  get textContent(){return this._text;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.appendChild(n));this._html='';this._text='';}
  addEventListener(type,fn){(this.events[type]||(this.events[type]=[])).push(fn);}
  click(){if(!this.disabled)for(const fn of this.events.click||[])fn({preventDefault(){}});}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);}
}
var __elements={};
globalThis.document={activeElement:null,getElementById:id=>__elements[id],createElement:tag=>new Element(tag)};
'''


def context(saved=None, reduced=True):
    js = quickjs.Context()
    js.eval(DOM)
    js.eval('globalThis.matchMedia=()=>({matches:'+str(reduced).lower()+'});')
    js.eval('for(const id of '+json.dumps(IDS)+')__elements[id]=new Element();')
    if saved:
        js.eval('__storage='+json.dumps(saved)+';')
    for name in ['engine.js', 'ai.js', 'pieces.js', 'app.js']:
        js.eval((ROOT / name).read_text(encoding='utf-8-sig'))
    return js


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.js = context()

    def drain(self):
        for _ in range(100):
            if not self.js.execute_pending_job():
                return
        self.fail('Controller did not settle')

    def state(self):
        return json.loads(self.js.eval('JSON.stringify(BattleChessApp.snapshot())'))

    def move(self, start, end):
        self.js.eval(f'BattleChessApp.select({start});')
        self.drain()
        self.js.eval(f'BattleChessApp.select({end});')
        self.drain()

    def test_bootstrap_and_legal_selection(self):
        self.assertEqual(len(IDS),len(set(IDS)))
        self.assertEqual(self.js.eval('__elements.board.children.flatMap(r=>r.children).length'),64)
        self.js.eval('BattleChessApp.select(52);')
        self.drain()
        self.assertEqual(self.state()['selected'],52)
        self.assertEqual(self.js.eval('__elements.board.children.flatMap(r=>r.children).filter(b=>b.classList.contains("legal")).length'),2)

    def test_local_moves_capture_undo_and_save_restore(self):
        self.js.eval('BattleChessApp.newGame({mode:"local",battles:false});')
        self.move(52,36)
        self.move(11,27)
        self.move(36,27)
        state=self.state()
        self.assertEqual(state['turn'],'b')
        self.assertEqual(state['history'][-1]['captured'],'p')
        self.assertFalse(state['busy'])
        self.assertFalse(self.js.eval('__elements.replayButton.hidden'))
        saved=json.loads(self.js.eval('JSON.stringify(__storage)'))
        restored=context(saved)
        self.assertEqual(json.loads(restored.eval('JSON.stringify(BattleChessApp.snapshot())'))['fen'],state['fen'])
        self.js.eval('BattleChessApp.undo();')
        self.assertEqual(len(self.state()['history']),2)
        self.assertEqual(self.state()['turn'],'w')

    def test_pending_computer_move_cancelled_by_new_game(self):
        self.js.eval('BattleChessApp.newGame({mode:"ai",human:"b"});')
        self.assertTrue(self.state()['thinking'])
        self.js.eval('BattleChessApp.newGame({mode:"local"});__flushTimers();')
        self.drain()
        self.assertEqual(len(self.state()['history']),0)
        self.assertFalse(self.state()['busy'])

    def test_computer_moves_when_human_plays_black(self):
        self.js.eval('BattleChessApp.newGame({mode:"ai",human:"b",depth:1});__flushTimers();')
        self.drain()
        self.assertEqual(len(self.state()['history']),1)
        self.assertEqual(self.state()['turn'],'b')
        self.assertFalse(self.state()['busy'])

    def test_promotion_cancel_cannot_change_new_match_state(self):
        self.js.eval('BattleChessApp.newGame({mode:"local",battles:false});')
        for start,end in [(48,32),(15,31),(32,24),(31,39),(24,16),(39,47),(16,9),(47,54)]:
            self.move(start,end)
        self.js.eval('BattleChessApp.select(9);BattleChessApp.select(0);')
        self.drain()
        self.assertTrue(self.js.eval('__elements.promotionDialog.open'))
        self.js.eval('BattleChessApp.newGame({mode:"ai",human:"b"});')
        self.drain()
        self.assertTrue(self.state()['busy'])
        self.assertTrue(self.state()['thinking'])
        self.assertEqual(len(self.state()['history']),0)

    def test_capture_cutscene_skip_and_replay_do_not_duplicate_moves(self):
        self.js = context(reduced=False)
        self.js.eval('BattleChessApp.newGame({mode:"local",battles:true});')
        for start,end in [(52,36),(11,27)]:
            self.move(start,end)
            self.js.eval('__flushTimers();')
            self.drain()
        self.move(36,27)
        self.assertTrue(self.js.eval('__elements.duelDialog.open'))
        self.assertEqual(len(self.state()['history']),2)
        self.js.eval('__elements.skipBattle.click();')
        self.drain()
        self.js.eval('__flushTimers();')
        self.drain()
        self.assertFalse(self.js.eval('__elements.duelDialog.open'))
        self.assertEqual(len(self.state()['history']),3)
        self.assertFalse(self.state()['busy'])
        self.js.eval('__elements.replayButton.click();')
        self.assertTrue(self.js.eval('__elements.duelDialog.open'))
        self.js.eval('__elements.skipBattle.click();')
        self.drain()
        self.assertEqual(len(self.state()['history']),3)


if __name__=='__main__':
    unittest.main()
