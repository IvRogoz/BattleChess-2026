(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const army = side => side === 'w' ? 'Red' : 'Blue';
  const color = piece => piece === piece.toUpperCase() ? 'w' : 'b';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = 'original-battle-chess-v1';
  const TICK = 2000 / 18.2065;
  const spriteSets = {};
  const localData = globalThis.BattleChessLocalData;
  let game = new ChessGame(), assets, board, codes, ready = false, started = false;
  let settings = { mode: 'ai', human: 'w', depth: 2, sound: false, animations: !reduced, speed: 1, view: '3d', sprites: 'amiga' };
  let selected = -1, focus = 52, legal = [], busy = false, thinking = false, epoch = 0, skipRequested = false;
  let worker = null, workerURL = null, aiTimer = null, cancelAnimation = null, pendingPromotion = null;
  let audio = null, sounds = new Set(), soundEpoch = 0, lastReplay = null, storageWarning = '', animationWarning = '';
  let dismissedResult = '', resultKey = '';
  document.querySelectorAll('nav button, nav input, nav select, .actions button').forEach(control => { control.disabled = true; });

  function closeMenus() { document.querySelectorAll('nav details').forEach(menu => { menu.open = false; }); }
  function tell(message) { $('status').textContent = message; }
  function stopSounds() { soundEpoch++; for (const source of sounds) source.stop(); sounds.clear(); }
  function stopWorker() {
    worker?.terminate(); worker = null;
    if (workerURL) { URL.revokeObjectURL(workerURL); workerURL = null; }
  }
  function cancelWork() {
    dismissedResult = '';
    epoch++;
    clearTimeout(aiTimer); aiTimer = null;
    stopWorker();
    if (cancelAnimation) cancelAnimation();
    if (pendingPromotion) pendingPromotion(null);
    stopSounds(); busy = false; thinking = false;
  }
  async function sound(events) {
    if (!settings.sound || !audio) return;
    const token = soundEpoch;
    for (const event of events) {
      try {
        const source = await OriginalAudio.playId(audio, event.code, event.value);
        if (token !== soundEpoch || !settings.sound) { source.stop(); continue; }
        sounds.add(source); source.onended = () => sounds.delete(source);
      } catch (error) { tell('Sound unavailable: ' + error.message); }
    }
  }
  function readSettings(source) {
    return { mode: source.mode === 'local' ? 'local' : 'ai', human: source.human === 'b' ? 'b' : 'w',
      depth: [1, 2, 3].includes(source.depth) ? source.depth : 2,
      sound: !!source.sound, animations: !!source.animations && !reduced,
      speed: [.5, 1, 2].includes(source.speed) ? source.speed : 1, view: source.view === '2d' ? '2d' : '3d',
      sprites: source.sprites === 'dos' ? 'dos' : 'amiga' };
  }
  function savedGame() { return { version: 1, settings, moves: game.history.map(m => [m.from, m.to, m.promotion || 'q']) }; }
  function parseSave(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.moves) || raw.moves.length > 2000) throw Error('Invalid Battle Chess save.');
    const restored = new ChessGame();
    for (const move of raw.moves) {
      if (!Array.isArray(move) || move.length !== 3 || !Number.isInteger(move[0]) || !Number.isInteger(move[1]) ||
          !['q', 'r', 'b', 'n'].includes(move[2]) || restored.status().over || !restored.move(...move)) throw Error('The save contains an illegal move.');
    }
    return { game: restored, settings: readSettings(raw.settings || {}) };
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(savedGame())); storageWarning = ''; }
    catch (_) { storageWarning = 'Browser storage unavailable; use Disk / Save Game.'; }
  }
  function updateCodes(position, move) {
    const result = position.slice(), code = result[move.from];
    result[move.from] = 0;
    if (move.captured && !position[move.to]) result[move.to + (color(move.piece) === 'w' ? 8 : -8)] = 0;
    const type = code & 7;
    const direction = type === 2 ? code & 64 ? 0 : 4 :
      type === 6 ? assets.point(move.to).x > 160 ? 7 : 3 :
      move.captured ? [3, 6].includes(type) ? 4 : 5 : assets.direction(move.from, move.to, type);
    result[move.to] = (code & 71) | direction << 3;
    if (move.promotion) result[move.to] = assets.code(color(move.piece) === 'w' ? move.promotion.toUpperCase() : move.promotion, move.to);
    if (move.piece.toLowerCase() === 'k' && Math.abs(move.to - move.from) === 2) {
      const row = move.from & ~7, from = row + (move.to > move.from ? 7 : 0), to = row + (move.to > move.from ? 5 : 3);
      result[to] = assets.code(color(move.piece) === 'w' ? 'R' : 'r', to); result[from] = 0;
    }
    return result;
  }
  function rebuild() {
    codes = assets.tables.initialBoard.slice(); lastReplay = null;
    for (const move of game.history) { const before = codes; codes = updateCodes(codes, move); lastReplay = { before, move }; }
  }
  function syncControls() {
    assets = spriteSets[settings.sprites]; board.assets = assets;
    for (const id of ['mode', 'human', 'depth', 'speed', 'view', 'sprites']) $(id).value = String(settings[id]);
    for (const id of ['sound', 'animations']) $(id).checked = settings[id];
    $('human').disabled = settings.mode === 'local';
    board.flat = settings.view === '2d';
  }
  function dismissResult() {
    dismissedResult = game.fen() + '|' + settings.sprites;
    $('game-over').hidden = true; resultKey = ''; $('board').focus();
  }
  function confirmResult() {
    if (settings.sprites === 'dos') { newGame(); $('board').focus(); }
    else dismissResult();
  }
  function renderResult(state) {
    const key = game.fen() + '|' + settings.sprites;
    if (!started || busy || thinking || !state.over || dismissedResult === key) {
      $('game-over').hidden = true; resultKey = '';
      if (!state.over) dismissedResult = '';
      return;
    }
    if (resultKey === key) return;
    const box = OriginalMessageBox.draw($('message-canvas'), settings.sprites, state);
    Object.assign($('game-over').style, { left: box.left / 320 * 100 + '%', top: box.top / 200 * 100 + '%',
      width: box.width / 320 * 100 + '%', height: box.height / 200 * 100 + '%' });
    $('message-text').textContent = box.message;
    $('message-confirm').setAttribute('aria-label', box.prompt);
    $('message-resume').setAttribute('aria-label', box.resume);
    $('message-resume').hidden = !box.resume;
    resultKey = key; closeMenus(); $('game-over').hidden = false; $('message-confirm').focus();
  }
  function render() {
    if (!ready) return;
    const state = game.status();
    const highlights = [];
    const last = game.history.at(-1);
    if (last) highlights.push([last.from, '#aaa'], [last.to, '#aaa']);
    if (selected >= 0) highlights.push([selected, '#ffff55'], ...legal.map(m => [m.to, m.captured ? '#ff5555' : '#fff']));
    if (state.check && !state.over) highlights.push([game.board.indexOf(game.turn === 'w' ? 'K' : 'k'), '#ff5555']);
    if (document.activeElement === $('board')) highlights.push([focus, '#55ffff']);
    if (!busy) board.draw(codes, { highlights });
    $('turn').textContent = state.over ? state.winner ? army(state.winner) + ' wins' : 'Draw' : army(game.turn) + ' to move';
    const draws = { stalemate: 'Stalemate. How boring!', 'threefold': 'Draw by threefold repetition.',
      'fifty-move': 'Draw by the fifty-move rule.', 'insufficient-material': 'Draw: insufficient material.' };
    tell(busy ? 'The pieces are taking the field…' : thinking ? 'The computer is thinking…' : animationWarning ||
      (state.over ? state.winner ? 'Check and mate… Game over.' : draws[state.reason] :
      state.check ? army(game.turn) + ' is in check.' : storageWarning ||
      (settings.mode === 'local' ? 'Two players · ' + army(game.turn) + ' has command.' : 'Human: ' + army(settings.human) + ' · Computer: ' + army(settings.human === 'w' ? 'b' : 'w'))));
    $('selection').textContent = selected < 0 ? 'Select a piece, then its destination.' :
      army(color(game.board[selected])) + ' ' + names[game.board[selected].toLowerCase()] + ' on ' + ChessGame.square(selected) + ' · choose a highlighted square.';
    for (const id of ['undo', 'takeback']) $(id).disabled = !game.history.length || !started;
    for (const id of ['replay', 'hint']) $(id).disabled = busy || thinking || !started || (id === 'replay' ? !lastReplay : state.over);
    $('force').disabled = !thinking;
    $('skip').hidden = !busy;
    for (const id of ['view', 'animations', 'speed', 'sprites']) $(id).disabled = busy;
    $('history').replaceChildren();
    for (let i = 0; i < game.history.length; i += 2) {
      const item = document.createElement('li'); item.textContent = game.history[i].san.padEnd(10) + (game.history[i + 1]?.san || ''); $('history').append(item);
    }
    $('move-count').textContent = String(game.history.length);
    const createGrid = !$('accessible-board').children.length;
    for (let r = 0; r < 8; r++) {
      const row = createGrid ? document.createElement('div') : $('accessible-board').children[r]; row.setAttribute('role', 'row');
      for (let c = 0; c < 8; c++) {
        const square = r * 8 + c, piece = game.board[square];
        const button = createGrid ? document.createElement('button') : row.children[c];
        button.setAttribute('role', 'gridcell'); button.setAttribute('aria-selected', String(square === selected));
        button.setAttribute('aria-disabled', String(busy || thinking || !started || state.over));
        button.textContent = ChessGame.square(square) + (piece ? ' ' + army(color(piece)) + ' ' + names[piece.toLowerCase()] : ' empty');
        if (createGrid) { button.addEventListener('click', () => select(square)); row.append(button); }
      }
      if (createGrid) $('accessible-board').append(row);
    }
    renderResult(state);
  }
  function ticks(callback, token) {
    return new Promise((resolve, reject) => {
      let frame, previous, accumulated = 0, settled = false;
      const finish = () => { if (settled) return; settled = true; cancelAnimationFrame(frame); cancelAnimation = null; resolve(false); };
      cancelAnimation = finish;
      function step(now) {
        if (token !== epoch) { finish(); return; }
        accumulated += previous === undefined ? TICK : Math.min(now - previous, TICK * 2);
        previous = now;
        try {
          let done = false;
          while (accumulated >= TICK / settings.speed && !done) {
            accumulated -= TICK / settings.speed; done = callback();
          }
          if (done) { settled = true; cancelAnimation = null; resolve(true); }
          else frame = requestAnimationFrame(step);
        } catch (error) { settled = true; cancelAnimation = null; reject(error); }
      }
      frame = requestAnimationFrame(step);
    });
  }
  async function walk(position, code, from, to, hidden, actors, token, half = false) {
    const frames = assets.walk(code), length = half ? Math.max(1, Math.floor(frames.length / 2)) : frames.length;
    const timing = half ? [] : assets.tables.motionTimingA[((code & 7) - 1) * 24 + (code >> 3 & 7)];
    const player = new BattleChessActorPlayer([0], timing, { 0: frames });
    let index = 0;
    return ticks(() => {
      const step = player.tick();
      if (step.events.length) sound(step.events);
      if (!step.frame) return player.done;
      const amount = Math.min(1, (index + 1) / length);
      const actor = { frame: step.frame, red: !!(code & 64), point: { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount } };
      board.draw(position, { hidden, actors: [...actors, actor] }); index++;
      return index >= length;
    }, token);
  }
  async function playFrames(frames, position, code, point, hidden, actors, token) {
    if (!frames.length) return true;
    let index = 0;
    return ticks(() => {
      board.draw(position, { hidden, actors: [...actors, { frame: frames[index++], red: !!(code & 64), point }] });
      return index >= frames.length;
    }, token);
  }
  async function turn(position, code, target, point, hidden, actors, token) {
    for (const player of assets.turnPlayers(code, target)) {
      if (!await ticks(() => {
        const step = player.tick();
        if (step.events.length) sound(step.events);
        if (step.frame) board.draw(position, { hidden, actors: [...actors, { frame: step.frame, red: !!(code & 64), point }] });
        return player.done;
      }, token)) return false;
    }
    return true;
  }
  async function rookMorph(position, code, point, restore, forward, hidden, actors, token) {
    const group = assets.groups.get(BattleChessPixels.WALK[5]);
    return playFrames(assets.sequence(group, (restore ? 16 : 14) + (forward ? 0 : 1)), position, code, point, hidden, actors, token);
  }
  async function travel(position, code, from, to, hidden, actors, token) {
    let current = from;
    const targetRow = to >> 3, targetCol = to & 7;
    const destinations = [];
    if ((code & 7) === 3) {
      const vertical = Math.abs(targetRow - (from >> 3)) > Math.abs(targetCol - (from & 7));
      destinations.push(vertical ? targetRow * 8 + (from & 7) : (from & ~7) + targetCol);
    }
    destinations.push(to);
    for (const end of destinations) {
      while (current !== end) {
        const row = current >> 3, col = current & 7;
        const next = (row + Math.sign((end >> 3) - row)) * 8 + col + Math.sign((end & 7) - col);
        const direction = assets.direction(current, next, code & 7);
        if (!await turn(position, code, direction, assets.point(current), hidden, actors, token)) return false;
        code = (code & 71) | direction << 3;
        if (!await walk(position, code, assets.point(current), assets.point(next), hidden, actors, token)) return false;
        current = next;
      }
    }
    return code;
  }
  async function animateMove(before, move, token) {
    if (!settings.animations || reduced || board.flat || skipRequested) return;
    const hidden = new Set([move.from]);
    let movingCode = before[move.from];
    const rookForward = (move.from >> 3) > (move.to >> 3) || (move.from >> 3) === (move.to >> 3) && !!(movingCode & 64);
    if ((movingCode & 7) === 6) {
      if (!await rookMorph(before, movingCode, assets.point(move.from), false, rookForward, hidden, [], token)) return;
      movingCode = (movingCode & 71) | (rookForward ? 0 : 4) << 3;
    }
    if (move.captured) {
      const victimSquare = before[move.to] ? move.to : move.to + (color(move.piece) === 'w' ? 8 : -8);
      hidden.add(victimSquare);
      const target = assets.point(victimSquare), origin = assets.point(move.from);
      const victimPoint = { x: target.x - 9, y: target.y + 5 }, attackerPoint = { x: target.x + 9, y: target.y - 5 };
      const vType = before[victimSquare] & 7, aType = before[move.from] & 7;
      const victimCode = (before[victimSquare] & 71) | ([3, 6].includes(vType) ? 0 : 1) << 3;
      const attackerCode = (movingCode & 71) | ([3, 6].includes(aType) ? 4 : 5) << 3;
      const victim = { frame: assets.standing(victimCode), red: !!(victimCode & 64), point: victimPoint };
      const waitingAttacker = { frame: assets.standing(movingCode), red: !!(movingCode & 64), point: origin };
      if (vType === 6 && !await rookMorph(before, before[victimSquare], target, false, false, hidden, [waitingAttacker], token)) return;
      const currentVictim = vType === 6 ? (before[victimSquare] & 71) | 4 << 3 : before[victimSquare];
      if (!await turn(before, currentVictim, victimCode >> 3 & 7, target, hidden, [waitingAttacker], token)) return;
      const dr = Math.sign((victimSquare >> 3) - (move.from >> 3)), dc = Math.sign((victimSquare & 7) - (move.from & 7));
      let approach = victimSquare - dr * 8 - dc;
      if (aType === 3) {
        const verticalFirst = Math.abs((victimSquare >> 3) - (move.from >> 3)) > Math.abs((victimSquare & 7) - (move.from & 7));
        approach = victimSquare - (verticalFirst ? dc : dr * 8);
      }
      let approachCode = movingCode;
      if (approach !== move.from) {
        approachCode = await travel(before, movingCode, move.from, approach, hidden,
          [{ ...victim, point: target }], token);
        if (!approachCode) return;
      }
      const approachPoint = assets.point(approach);
      // Stage around the captured square, as original task 7 modes 0/1 do.
      const staged = await ticks((() => {
        const frames = assets.walk(approachCode), victimFrames = assets.walk(victimCode);
        const length = Math.max(1, Math.floor(frames.length / 2));
        let i = 0;
        return () => {
          const progress = Math.min(1, ++i / length);
          board.draw(before, { hidden, actors: [
            { frame: victimFrames[Math.min(i - 1, victimFrames.length - 1)], red: victim.red, point: { x: target.x - 9 * progress, y: target.y + 5 * progress } },
            { frame: frames[(i - 1) % frames.length], red: !!(attackerCode & 64), point: { x: approachPoint.x + (attackerPoint.x - approachPoint.x) * progress, y: approachPoint.y + (attackerPoint.y - approachPoint.y) * progress } }
          ] });
          return i >= length;
        };
      })(), token);
      if (!staged || token !== epoch) return;
      if (!await turn(before, approachCode, attackerCode >> 3 & 7, attackerPoint, hidden, [victim], token)) return;
      const players = assets.combat(move.piece, move.captured);
      const actors = [victim, { frame: assets.standing(attackerCode), red: !!(attackerCode & 64), point: attackerPoint }];
      if (!await ticks(() => {
        for (let i = 0; i < players.length; i++) {
          const result = players[i].tick();
          if (result.frame) actors[i].frame = result.frame;
          if (result.events.length) sound(result.events);
        }
        board.draw(before, { hidden, actors });
        return players.every(player => player.done);
      }, token)) return;
      if (!await walk(before, attackerCode, attackerPoint, assets.point(move.to), hidden, [], token, true)) return;
      movingCode = attackerCode;
    } else {
      movingCode = await travel(before, movingCode, move.from, move.to, hidden, [], token);
      if (!movingCode) return;
    }
    if ((movingCode & 7) === 2 && !await turn(before, movingCode, movingCode & 64 ? 0 : 4, assets.point(move.to), hidden, [], token)) return;
    if ((movingCode & 7) === 6) {
      const direction = move.captured ? 4 : assets.direction(move.from, move.to, 6);
      const restoreForward = [2, 6].includes(direction) ? !!(movingCode & 64) : direction === 0;
      const restoreCode = (movingCode & 71) | (restoreForward ? 0 : 4) << 3;
      if (!await turn(before, (movingCode & 71) | direction << 3, restoreForward ? 0 : 4, assets.point(move.to), hidden, [], token)) return;
      if (!await rookMorph(before, restoreCode, assets.point(move.to), true, restoreForward, hidden, [], token)) return;
    }
    if (move.piece.toLowerCase() === 'k' && Math.abs(move.to - move.from) === 2) {
      const row = move.from & ~7, from = row + (move.to > move.from ? 7 : 0), to = row + (move.to > move.from ? 5 : 3);
      const position = before.slice(); position[move.from] = 0; position[move.to] = updateCodes(before, move)[move.to];
      const rookHidden = new Set([from]), forward = !!(before[from] & 64), rookCode = (before[from] & 71) | (forward ? 0 : 4) << 3;
      if (!await rookMorph(position, before[from], assets.point(from), false, forward, rookHidden, [], token)) return;
      const walked = await travel(position, rookCode, from, to, rookHidden, [], token);
      if (!walked || !await turn(position, walked, forward ? 0 : 4, assets.point(to), rookHidden, [], token)) return;
      await rookMorph(position, rookCode, assets.point(to), true, forward, rookHidden, [], token);
    }
  }
  async function playMove(from, to, promotion = 'q') {
    if (busy) return;
    const before = codes.slice(), move = game.move(from, to, promotion);
    if (!move) return;
    selected = -1; legal = []; busy = true; animationWarning = ''; skipRequested = false;
    codes = updateCodes(before, move); lastReplay = { before, move };
    const token = epoch; save(); render();
    try {
      await animateMove(before, move, token);
    }
    catch (error) { console.error(error); animationWarning = 'Animation could not finish: ' + error.message; }
    if (token !== epoch) return;
    stopSounds(); busy = false; render(); scheduleAI();
  }
  function promotionChoice() {
    return new Promise(resolve => {
      pendingPromotion = choice => { pendingPromotion = null; $('promotion').close(); resolve(choice); };
      $('promotion-choices').replaceChildren();
      for (const piece of ['q', 'r', 'b', 'n']) {
        const button = document.createElement('button'); button.textContent = names[piece];
        button.addEventListener('click', () => pendingPromotion?.(piece)); $('promotion-choices').append(button);
      }
      $('promotion').showModal();
    });
  }
  async function select(square) {
    if (!ready || !started || busy || thinking || pendingPromotion || game.status().over || (settings.mode === 'ai' && game.turn !== settings.human)) return;
    const destination = legal.find(move => move.to === square);
    if (selected >= 0 && destination) {
      const token = epoch, from = selected;
      const promotion = destination.promotion ? await promotionChoice() : 'q';
      if (promotion && token === epoch) await playMove(from, square, promotion);
      return;
    }
    const piece = game.board[square];
    selected = piece && color(piece) === game.turn && square !== selected ? square : -1;
    legal = selected < 0 ? [] : game.legalMoves(selected); focus = square; render();
  }
  function scheduleAI() {
    if (!started || busy || thinking || settings.mode !== 'ai' || game.turn === settings.human || game.status().over) return;
    thinking = true; const token = epoch, fen = game.fen(); render();
    const finish = move => {
      if (token !== epoch || fen !== game.fen() || !thinking) return;
      thinking = false; stopWorker();
      if (move) playMove(move.from, move.to, move.promotion || 'q'); else render();
    };
    const fallback = () => {
      if (token !== epoch || fen !== game.fen() || !thinking) return;
      stopWorker();
      aiTimer = setTimeout(() => {
        if (token !== epoch || fen !== game.fen() || !thinking) return;
        try { finish(chooseChessMove(fen, { depth: settings.depth, timeMs: 800 })); }
        catch (error) { thinking = false; render(); tell('Computer could not move: ' + error.message); }
      }, 30);
    };
    try {
      if (localData) workerURL = URL.createObjectURL(new Blob([localData.workerSource], { type: 'text/javascript' }));
      worker = new Worker(workerURL || 'ai-worker.js');
      worker.onmessage = event => event.data.error ? fallback() : finish(event.data.move);
      worker.onerror = event => { event.preventDefault(); fallback(); };
      worker.postMessage({ id: token, fen, depth: settings.depth });
    } catch (_) { fallback(); }
  }
  function takeBack() {
    if (!game.history.length) return;
    cancelWork(); game.undo();
    if (settings.mode === 'ai' && game.turn !== settings.human && game.history.length) game.undo();
    selected = -1; legal = []; rebuild(); save(); render(); scheduleAI();
  }
  function newGame() {
    cancelWork(); game = new ChessGame(); selected = -1; legal = []; animationWarning = ''; rebuild(); save(); syncControls(); render(); scheduleAI();
  }
  function askNew() {
    closeMenus();
    if (!game.history.length) newGame();
    else { $('new-dialog').returnValue = 'cancel'; $('new-dialog').showModal(); }
  }
  async function replay() {
    if (!lastReplay || busy || thinking) return;
    dismissedResult = '';
    closeMenus(); const token = epoch, replayData = lastReplay; busy = true; skipRequested = false; render();
    try {
      await animateMove(replayData.before, replayData.move, token);
    }
    catch (error) { console.error(error); animationWarning = 'Replay could not finish: ' + error.message; }
    if (token === epoch) { stopSounds(); busy = false; render(); }
  }
  $('board').addEventListener('click', event => {
    const rect = $('board').getBoundingClientRect();
    const square = assets?.hit((event.clientX - rect.left) * 320 / rect.width, (event.clientY - rect.top) * 200 / rect.height, board.flat);
    if (square >= 0) select(square);
  });
  $('board').addEventListener('keydown', event => {
    const directions = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (event.key in directions) { event.preventDefault(); focus = Math.max(0, Math.min(63, focus + directions[event.key])); render(); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(focus); }
  });
  $('board').addEventListener('focus', render); $('board').addEventListener('blur', render);
  document.addEventListener('keydown', event => {
    if ($('about-dialog').open) return;
    if (!$('game-over').hidden && !$('new-dialog').open && !$('promotion').open &&
        (event.key === 'Escape' || event.key === 'Enter' &&
        [ $('message-confirm'), $('message-resume') ].includes(document.activeElement))) {
      event.preventDefault();
      if (event.key === 'Enter' && document.activeElement !== $('message-resume')) confirmResult(); else dismissResult();
      return;
    }
    if (event.key !== 'Escape') return;
    closeMenus();
    if (cancelAnimation) { skipRequested = true; cancelAnimation(); }
    else { selected = -1; legal = []; render(); }
  });
  document.addEventListener('click', event => {
    for (const menu of document.querySelectorAll('nav details')) if (!menu.contains(event.target)) menu.open = false;
  });
  document.querySelectorAll('nav details').forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) for (const other of document.querySelectorAll('nav details')) if (other !== menu) other.open = false;
  }));
  $('new').onclick = askNew; $('new-shortcut').onclick = askNew;
  $('about').onclick = () => { closeMenus(); $('about-dialog').showModal(); };
  $('message-confirm').onclick = confirmResult;
  $('message-resume').onclick = dismissResult;
  $('game-over').addEventListener('contextmenu', event => { event.preventDefault(); dismissResult(); });
  $('new-dialog').addEventListener('close', () => { if ($('new-dialog').returnValue === 'start') newGame(); });
  $('undo').onclick = () => { closeMenus(); takeBack(); }; $('takeback').onclick = takeBack;
  $('skip').onclick = () => { skipRequested = true; cancelAnimation?.(); };
  $('replay').onclick = replay;
  $('promotion-cancel').onclick = () => pendingPromotion?.(null);
  $('promotion').addEventListener('cancel', event => { event.preventDefault(); pendingPromotion?.(null); });
  $('start').onclick = () => {
    started = true; $('splash').hidden = true; $('board').focus(); render(); scheduleAI();
  };
  $('title').onclick = () => { closeMenus(); cancelWork(); rebuild(); started = false; $('splash').hidden = false; render(); };
  $('hint').onclick = () => {
    closeMenus(); if (busy || thinking || game.status().over) return;
    const move = chooseChessMove(game.fen(), { depth: settings.depth, timeMs: 400 });
    if (!move) return; selected = move.from; legal = game.legalMoves(selected); focus = move.to; render();
    tell('Suggested move: ' + ChessGame.square(move.from) + ' to ' + ChessGame.square(move.to) + '.');
  };
  $('force').onclick = () => {
    closeMenus(); if (!thinking) return;
    cancelWork(); const move = chooseChessMove(game.fen(), { depth: 1, timeMs: 100 });
    if (move) playMove(move.from, move.to, move.promotion || 'q');
  };
  for (const id of ['mode', 'human', 'depth']) $(id).onchange = () => {
    cancelWork(); rebuild(); settings[id] = id === 'depth' ? Number($(id).value) : $(id).value;
    selected = -1; legal = []; syncControls(); save(); render(); scheduleAI();
  };
  for (const id of ['view', 'speed', 'animations', 'sprites']) $(id).onchange = () => {
    settings[id] = id === 'speed' ? Number($(id).value) : id === 'animations' ? $(id).checked : $(id).value;
    syncControls(); save(); render();
  };
  $('sound').onchange = async () => {
    settings.sound = $('sound').checked;
    if (settings.sound) {
      try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); }
      catch (_) { settings.sound = false; $('sound').checked = false; tell('Audio is not available in this browser.'); }
    } else stopSounds();
    save();
  };
  $('save').onclick = () => {
    closeMenus(); const blob = new Blob([JSON.stringify(savedGame(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'battle-chess-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('load').onclick = () => { closeMenus(); $('save-file').value = ''; $('save-file').click(); };
  $('save-file').onchange = async () => {
    const file = $('save-file').files[0]; if (!file) return;
    const token = epoch, position = game.fen();
    try {
      if (file.size > 250000) throw Error('Save file is too large.');
      const restored = parseSave(JSON.parse(await file.text()));
      if (token !== epoch || position !== game.fen()) { tell('Game load cancelled because the current game changed.'); return; }
      cancelWork(); game = restored.game; settings = restored.settings; settings.sound = false;
      selected = -1; legal = []; animationWarning = ''; syncControls(); rebuild(); save(); render(); scheduleAI();
    } catch (error) { tell('Could not load game: ' + error.message); }
  };
  async function init() {
    try {
      await Promise.all([['dos', 'assets/assets.json'], ['amiga', 'assets/amiga.json']].map(async ([name, url]) => {
        if (localData) { spriteSets[name] = new OriginalAssets(localData.sprites[name]); return; }
        const response = await fetch(url);
        if (!response.ok) throw Error(name + ' artwork request failed: HTTP ' + response.status);
        spriteSets[name] = new OriginalAssets(await response.json());
      }));
      assets = spriteSets.dos;
      const screens = {};
      await Promise.all(['board', 'board-flat'].map(name => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => { screens[name] = image; resolve(); };
        image.onerror = () => reject(Error('Unable to load ' + name)); image.src = 'assets/' + assets.data.screens[name].path;
      })));
      board = new OriginalBoard($('board'), assets, screens);
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) { const restored = parseSave(JSON.parse(raw)); game = restored.game; settings = restored.settings; settings.sound = false; }
      } catch (_) { storageWarning = 'Saved game could not be restored. Starting a new game.'; }
      ready = true;
      document.querySelectorAll('nav button, nav input, nav select, .actions button').forEach(control => { control.disabled = false; });
      syncControls(); rebuild(); render();
      $('start').disabled = false; $('start').textContent = game.history.length ? 'Continue Game' : 'Play Battle Chess';
    } catch (error) {
      $('loading').hidden = false; $('loading').textContent = 'Unable to load Battle Chess: ' + error.message + '. Serve this folder with python -B serve.py.';
      tell('The original game data could not be loaded.');
    }
  }
  init();
})();
