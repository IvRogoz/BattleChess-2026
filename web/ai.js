(function (root) {
  'use strict';

  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const TIMEOUT = {};

  // ponytail: a small material/center heuristic; deeper strategy would need a richer evaluation.
  function evaluate(game) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const piece = game.board[i];
      if (!piece) continue;
      const type = piece.toLowerCase();
      const white = piece === piece.toUpperCase();
      const row = Math.floor(i / 8), col = i % 8;
      const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
      const positional = type === 'p' ? (white ? 6 - row : row - 1) * 5 :
        (type === 'n' || type === 'b' ? center * 5 : 0);
      score += (white ? 1 : -1) * ((values[type] || 0) + positional);
    }
    return score;
  }

  function ordered(moves) {
    return moves.slice().sort((a, b) => {
      const value = m => (m.captured ? values[m.captured.toLowerCase()] || 0 : 0) +
        (m.promotion ? values[m.promotion.toLowerCase()] || 0 : 0);
      return value(b) - value(a) || a.from - b.from || a.to - b.to ||
        String(a.promotion || '').localeCompare(String(b.promotion || ''));
    });
  }

  root.chooseChessMove = function (fen, options) {
    options = options || {};
    const game = new root.ChessGame(fen);
    if (game.status().over) return null;
    const initial = ordered(game.legalMoves());
    if (!initial.length) return null;
    const depth = Math.max(1, Math.min(3, Math.floor(Number(options.depth) || 1)));
    const requestedTime = Number(options.timeMs);
    const deadline = Date.now() + (Number.isFinite(requestedTime) && requestedTime > 0 ? requestedTime : 800);
    let best = initial[0];

    function search(remaining, alpha, beta, ply) {
      if (Date.now() >= deadline) throw TIMEOUT;
      const state = game.status();
      if (state.over) {
        return state.winner === 'w' ? 100000 - ply : state.winner === 'b' ? -100000 + ply : 0;
      }
      if (!remaining) return evaluate(game);
      const maximize = game.turn === 'w';
      let score = maximize ? -Infinity : Infinity;
      for (const move of ordered(game.legalMoves())) {
        game.move(move.from, move.to, move.promotion || 'q');
        let child;
        try { child = search(remaining - 1, alpha, beta, ply + 1); }
        finally { game.undo(); }
        if (maximize) { score = Math.max(score, child); alpha = Math.max(alpha, score); }
        else { score = Math.min(score, child); beta = Math.min(beta, score); }
        if (beta <= alpha) break;
      }
      return score;
    }

    for (let level = 1; level <= depth; level++) {
      const maximize = game.turn === 'w';
      let score = maximize ? -Infinity : Infinity;
      let levelBest = best;
      try {
        for (const move of initial) {
          if (Date.now() >= deadline) throw TIMEOUT;
          game.move(move.from, move.to, move.promotion || 'q');
          let child;
          try { child = search(level - 1, -Infinity, Infinity, 1); }
          finally { game.undo(); }
          if ((maximize && child > score) || (!maximize && child < score)) {
            score = child;
            levelBest = move;
          }
        }
        best = levelBest;
      } catch (error) {
        if (error !== TIMEOUT) throw error;
        break;
      }
    }
    const result = { from: best.from, to: best.to };
    if (best.promotion) result.promotion = best.promotion;
    return result;
  };
})(globalThis);
