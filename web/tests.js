(async function () {
  'use strict';
  const output = document.getElementById('results');
  const lines = [];
  let passed = 0, failed = 0;
  function assert(value, message) { if (!value) throw new Error(message || 'Assertion failed'); }
  async function test(name, fn) {
    try { await fn(); passed++; lines.push('PASS ' + name); }
    catch (error) { failed++; lines.push('FAIL ' + name + ': ' + (error.stack || error)); }
    output.textContent = lines.join('\n');
  }
  function perft(game, depth) {
    if (!depth) return 1;
    let count = 0;
    for (const move of game.legalMoves()) {
      game.move(move.from, move.to, move.promotion);
      count += perft(game, depth - 1);
      game.undo();
    }
    return count;
  }
  await test('Initial perft: 20, 400, 8902', () => {
    const game = new ChessGame();
    [20, 400, 8902].forEach((expected, i) => assert(perft(game, i + 1) === expected, 'depth ' + (i + 1)));
  });
  await test('Kiwipete perft depth 2', () => {
    assert(perft(new ChessGame('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2) === 2039);
  });
  await test('Castling through attack and pinned en passant', () => {
    assert(!new ChessGame('k4r2/8/8/8/8/8/8/4K2R w K - 0 1').legalMoves(60).some(m => m.to === 62));
    assert(!new ChessGame('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1').legalMoves(28).some(m => m.to === 19));
  });
  await test('All promotions and undo', () => {
    for (const promotion of 'qrbn') {
      const game = new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), fen = game.fen();
      assert(game.move(8, 0, promotion)?.promotion === promotion && game.board[0] === promotion.toUpperCase(), promotion);
      assert(game.undo() && game.fen() === fen, 'undo ' + promotion);
    }
  });
  await test('Checkmate, stalemate and repetition', () => {
    const game = new ChessGame();
    for (const [a, b] of [[53, 45], [12, 28], [54, 38], [3, 39]]) assert(game.move(a, b));
    assert(game.status().reason === 'checkmate' && game.history[3].san === 'Qh4#');
    assert(new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason === 'stalemate');
    const repeated = new ChessGame();
    for (let i = 0; i < 2; i++) for (const [a, b] of [[62, 45], [6, 21], [45, 62], [21, 6]]) assert(repeated.move(a, b));
    assert(repeated.status().reason === 'threefold');
  });
  await test('AI legal move, unchanged position and mate', () => {
    const game = new ChessGame(), fen = game.fen(), move = chooseChessMove(fen, { depth: 2, timeMs: 10000 });
    assert(move && game.legalMoves().some(m => m.from === move.from && m.to === move.to && (m.promotion || null) === (move.promotion || null)));
    assert(game.fen() === fen);
    const mate = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    const winning = chooseChessMove(mate.fen(), { depth: 1, timeMs: 10000 });
    assert(winning && mate.move(winning.from, winning.to, winning.promotion || 'q'));
    assert(mate.status().reason === 'checkmate' && mate.status().winner === 'w');
    assert(chooseChessMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1') === null);
  });
  let assets, dosAssets, amigaAssets;
  await test('Load DOS assets', async () => {
    const response = await fetch('assets/assets.json');
    assert(response.ok, 'HTTP ' + response.status);
    dosAssets = new OriginalAssets(await response.json());
  });
  await test('Load Amiga assets', async () => {
    const response = await fetch('assets/amiga.json'); assert(response.ok, 'HTTP ' + response.status);
    amigaAssets = new OriginalAssets(await response.json());
    assert(amigaAssets.data.palette.length === 32, 'expected 32-color palette');
    assert(amigaAssets.data.groups.reduce((n, group) => n + group.frames.length, 0) === 1676, 'unexpected Amiga frame count');
  });
  await test('Five-bit pixels and exact army colors survive rendering', () => {
    const frame = BattleChessPixels.unpack({ w: 2, h: 1, x: 0, y: 0, encoding: 'indexed8', pixels: 'GBs=' });
    assert(frame.indices[0] === 24 && frame.indices[1] === 27, 'Amiga palette indices truncated');
    for (const [provider, source, expected] of [
      [amigaAssets, [24, 27], [238, 34, 119, 255, 102, 0, 68, 255]],
      [dosAssets, [1, 9], [170, 0, 0, 255, 255, 85, 85, 255]]
    ]) {
      const renderer = new OriginalBoard(document.createElement('canvas'), provider, {});
      const image = renderer.image({ w: 2, h: 1, x: 0, y: 0, indices: new Uint8Array(source) }, true);
      assert(Array.from(image.getContext('2d').getImageData(0, 0, 2, 1).data).every((value, i) => value === expected[i]), 'army palette mismatch');
    }
    let rejected = false;
    try { BattleChessPixels.unpack({ w: 2, h: 1, encoding: 'indexed8', pixels: '' }); } catch (_) { rejected = true; }
    assert(rejected, 'truncated indexed pixels accepted');
  });
  await test('Amiga red army matches the original F8 blitter minterm', () => {
    for (let index = 0; index < 32; index++) {
      const a = index >> 2 & 1, b = index >> 3 & 1, c = index >> 4 & 1;
      const bit = 0xf8 >> (4 * a + 2 * b + c) & 1;
      const expected = index & ~4 | bit << 2;
      assert((amigaAssets.redMap[index] ?? index) === expected, 'palette entry ' + index);
    }
  });
  function frameCheck(frame) {
    assert(frame && Number.isInteger(frame.w) && Number.isInteger(frame.h) && frame.w > 0 && frame.h > 0 && frame.w <= 512 && frame.h <= 512, 'invalid frame dimensions');
    assert(Number.isFinite(frame.x) && Number.isFinite(frame.y) && Math.abs(frame.x) <= 512 && Math.abs(frame.y) <= 512, 'invalid frame anchor');
    assert(frame.indices && frame.indices.length === frame.w * frame.h, 'invalid frame buffer');
  }
  for (const [label, provider] of [['DOS', dosAssets], ['Amiga', amigaAssets]]) {
  assets = provider;
  await test(label + ': 32 initial standing sprites in both views', () => {
    assert(assets, 'assets unavailable');
    const codes = assets.tables.initialBoard.filter(Boolean);
    assert(codes.length === 32, 'expected 32 pieces');
    for (const code of codes) for (const flat of [false, true]) {
      const frame = assets.standing(code, flat);
      frameCheck(frame);
      assert(frame.indices.some(pixel => pixel !== 0), 'empty standing sprite');
    }
  });
  await test(label + ': walk animations for every piece and orientation', () => {
    assert(assets, 'assets unavailable');
    for (let type = 1; type <= 6; type++) for (let direction = 0; direction < 8; direction++) {
      const frames = assets.walk(type | direction << 3);
      assert(frames.length > 0, 'missing walk ' + type + '/' + direction);
      frames.forEach(frameCheck);
    }
  });
  await test(label + ': turning frames for every valid direction', () => {
    for (let type = 1; type <= 6; type++) for (let from = 0; from < 8; from++) for (let to = 0; to < 8; to++) {
      if ([1, 3, 6].includes(type) && (from & 1) !== (to & 1)) continue;
      const frames = assets.turn(type | from << 3, to);
      assert(from === to || frames.length > 0, 'missing turn'); frames.forEach(frameCheck);
    }
  });
  await test(label + ': rook morphs reconstruct the exact original castle raster', () => {
    const group = assets.groups.get(51780), expected = assets.frame(assets.main.frames[38]);
    const pixel = (frame, x, y) => {
      x += frame.x; y += frame.y;
      return x >= 0 && y >= 0 && x < frame.w && y < frame.h ? frame.indices[y * frame.w + x] : 0;
    };
    for (const id of [16, 17]) {
      const actual = assets.sequence(group, id).at(-1);
      const left = Math.min(-actual.x, -expected.x), top = Math.min(-actual.y, -expected.y);
      const right = Math.max(actual.w - actual.x, expected.w - expected.x), bottom = Math.max(actual.h - actual.y, expected.h - expected.y);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) assert(pixel(actual, x, y) === pixel(expected, x, y), 'corrupted delta raster ' + id);
    }
  });
  await test(label + ': all 36 combat pairings and both actors', () => {
    assert(assets, 'assets unavailable');
    for (const attacker of 'bknpqr') for (const victim of 'bknpqr') {
      const players = assets.combat(attacker, victim);
      assert(players.length === 2, attacker + '/' + victim);
      for (const player of players) {
        let ticks = 0, frames = 0;
        while (!player.done && ticks++ < 10000) {
          const step = player.tick();
          if (step.frame) { frameCheck(step.frame); frames++; }
          for (const event of step.events) assert(Number.isInteger(event.code) && event.code >= 0 && event.code <= 14 && Number.isInteger(event.value) && event.value >= -64 && event.value <= 63, 'invalid sound event');
        }
        assert(player.done && (frames > 0 || attacker === 'k' && victim === 'k' && player.order.length === 0), 'unfinished combat ' + attacker + '/' + victim);
      }
    }
  });
  await test(label + ': board anchors hit all squares in both views', () => {
    assert(assets, 'assets unavailable');
    for (const flat of [false, true]) for (let square = 0; square < 64; square++) {
      const point = assets.point(square, flat);
      assert(assets.hit(point.x, point.y, flat) === square, 'square ' + square + ', flat ' + flat);
    }
  });
  }
  await test('Original sound blocks decode and reject invalid headers', async () => {
    for (const offset of OriginalAudio.SoundOffsets) {
      const response = await fetch('assets/blocks/allcanm1-' + offset + '.bin');
      assert(response.ok, 'sound block ' + offset + ': HTTP ' + response.status);
      const bytes = new Uint8Array(await response.arrayBuffer()), decoded = OriginalAudio.decode(bytes);
      const count = bytes[0] | bytes[1] << 8;
      assert(decoded.samples.length === count * 2 && decoded.sampleRate > 0, 'sound length ' + offset);
      for (let i = 0; i < count; i++) {
        assert(decoded.samples[i * 2] === ((bytes[i + 4] >> 4) - 8) / 8 && decoded.samples[i * 2 + 1] === ((bytes[i + 4] & 15) - 8) / 8, 'sound sample ' + offset + '/' + i);
      }
    }
    for (const bytes of [[], [0, 0, 1, 0], [1, 0, 0, 0, 0], [2, 0, 1, 0, 0]]) {
      let rejected = false;
      try { OriginalAudio.decode(new Uint8Array(bytes)); } catch (_) { rejected = true; }
      assert(rejected, 'invalid header accepted');
    }
  });
  await test('Load controller checks', async () => {
    const response = await fetch('app.js'); assert(response.ok, 'controller HTTP ' + response.status);
    const results = await runControllerChecks(await response.text(), dosAssets.data, amigaAssets.data);
    for (const result of results) await test(result.name, () => assert(result.passed, result.error));
  });
  lines.push('', passed + ' passed, ' + failed + ' failed');
  output.textContent = lines.join('\n');
  document.title = (failed ? 'FAIL' : 'PASS') + ' - Battle Chess tests (' + passed + '/' + (passed + failed) + ')';
})();
