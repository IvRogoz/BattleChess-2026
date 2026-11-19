"""Headless checks for the chess opponent; run with python tests/test_ai.py."""
import json
from pathlib import Path
import quickjs

root = Path(__file__).resolve().parents[1]
ctx = quickjs.Context()
ctx.eval((root / 'engine.js').read_text(encoding='utf-8-sig'))
ctx.eval((root / 'ai.js').read_text(encoding='utf-8-sig'))


def run(source):
    return json.loads(ctx.eval('JSON.stringify((' + source + '))'))


start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
result = run('''(() => {
  const g = new ChessGame(%s), before = g.fen();
  const move = chooseChessMove(before, {depth: 2, timeMs: 10000});
  return {move, legal: g.legalMoves().some(m => m.from === move.from && m.to === move.to && (m.promotion || null) === (move.promotion || null)), unchanged: g.fen() === before};
})()''' % json.dumps(start))
assert result['legal'] and result['unchanged'], result

mate = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'
result = run('''(() => {
  const g = new ChessGame(%s), move = chooseChessMove(g.fen(), {depth: 1, timeMs: 10000});
  g.move(move.from, move.to, move.promotion || 'q');
  return g.status();
})()''' % json.dumps(mate))
assert result['over'] and result['winner'] == 'w' and result['reason'] == 'checkmate', result

stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'
assert run('chooseChessMove(%s, {depth: 2})' % json.dumps(stalemate)) is None
print('AI checks passed')
