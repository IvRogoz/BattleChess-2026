// Runs the unchanged controller against isolated browser doubles.
globalThis.runControllerChecks = async function (appSource, assetData, amigaData = assetData) {
  const results = [];
  function assert(value, message) { if (!value) throw Error(message); }
  async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.stack || String(e) }); } }
  async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
  async function setup(saved) {
    const elements = new Map(), store = new Map(), workers = [], frames = new Map(), errors = [];
    let frameId = 0, now = 0, lastCodes, provider;
    const turns = [];
    class TestAssets extends OriginalAssets {
      turnPlayers(code, target) { turns.push([code, target]); return super.turnPlayers(code, target); }
    }
    if (saved !== undefined) store.set('original-battle-chess-v1', JSON.stringify(saved));
    class Element {
      constructor(id) { this.id = id; this.children = []; this.listeners = {}; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.textContent = ''; this.files = []; }
      setAttribute() {}
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
      append(child) { this.children.push(child); }
      replaceChildren(...children) { this.children = children; }
      click() { if (!this.disabled) { this.onclick?.(); for (const fn of this.listeners.click || []) fn({ target: this }); } }
      focus() { document.activeElement = this; }
      showModal() { this.open = true; }
      close(value) { this.open = false; this.returnValue = value || ''; for (const fn of this.listeners.close || []) fn({ target: this }); }
      contains() { return false; }
      getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 200 }; }
    }
    const document = {
      activeElement: null,
      getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); },
      createElement(tag) { return new Element(tag); }, querySelectorAll() { return []; }, addEventListener() {}
    };
    const $ = id => document.getElementById(id);
    class Board { constructor(canvas, assets) { this.flat = false; this.assets = assets; } draw(codes) { lastCodes = codes.slice(); provider = this.assets.data.spriteSet || 'dos'; } }
    class Image { set src(value) { Promise.resolve().then(() => this.onload()); } }
    class Worker { constructor() { workers.push(this); } postMessage(data) { this.request = data; } terminate() { this.terminated = true; } respond(move) { this.onmessage({ data: { move } }); } }
    const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
    const raf = fn => { const id = ++frameId; frames.set(id, fn); return id; };
    const cancelRaf = id => frames.delete(id);
    const timer = () => 1;
    new Function('document', 'window', 'matchMedia', 'localStorage', 'fetch', 'Image', 'Worker', 'OriginalBoard', 'OriginalAssets', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'console', appSource)(
      document, {}, () => ({ matches: false }), storage, async url => ({ ok: true, json: async () => url.endsWith('amiga.json') ? amigaData : assetData }), Image, Worker, Board, TestAssets, raf, cancelRaf, timer, () => {}, { error: (...args) => errors.push(args.map(String).join(' ')) });
    await settle();
    assert(!$('start').disabled && !$('loading').textContent.startsWith('Unable'), 'startup failed: ' + $('loading').textContent);
    return {
      $, workers, store, errors, turns, get codes() { return lastCodes; }, get provider() { return provider; },
      async flush() { for (let i = 0; frames.size && i < 10000; i++) { const pending = [...frames.values()]; frames.clear(); now += 220; pending.forEach(fn => fn(now)); await settle(); } assert(!frames.size, 'animation did not finish'); await settle(); },
      async move(from, to) { $('accessible-board').children[from >> 3].children[from & 7].click(); $('accessible-board').children[to >> 3].children[to & 7].click(); await settle(); },
      async load(data) { $('save-file').files = [{ size: 100, text: async () => JSON.stringify(data) }]; await $('save-file').onchange(); await settle(); },
      saved() { return JSON.parse(store.get('original-battle-chess-v1')); }
    };
  }
  const settings = { mode: 'local', human: 'w', depth: 1, sound: false, animations: false, speed: 1, view: '3d' };
  const save = moves => ({ version: 1, settings: { ...settings }, moves });
  await check('Local move, save, undo and restore', async () => {
    const app = await setup(save([])); app.$('start').click(); await app.move(52, 36);
    assert(app.$('move-count').textContent === '1' && app.saved().moves.length === 1, 'move/save failed');
    const restored = await setup(app.saved()); assert(restored.$('move-count').textContent === '1', 'restore failed');
    app.$('undo').click(); await settle(); assert(app.$('move-count').textContent === '0' && app.saved().moves.length === 0, 'undo failed');
    const invalid = await setup(save([[52, 20, 'q']])); assert(invalid.$('move-count').textContent === '0', 'illegal save restored');
  });
  await check('Castling and en passant update renderer codes', async () => {
    const castle = await setup(save([[52,36,'q'],[12,28,'q'],[62,45,'q'],[1,18,'q'],[61,52,'q'],[6,21,'q']]));
    castle.$('start').click(); await castle.move(60,62);
    assert(!castle.codes[60] && !castle.codes[63] && (castle.codes[62] & 7) === 2 && (castle.codes[61] & 7) === 6, 'castling codes');
    const ep = await setup(save([[52,36,'q'],[8,16,'q'],[36,28,'q'],[11,27,'q']]));
    ep.$('start').click(); await ep.move(28,19);
    assert(!ep.codes[28] && !ep.codes[27] && (ep.codes[19] & 7) === 4, 'en passant codes');
  });
  await check('Promotion cancel and knight promotion', async () => {
    const app = await setup(save([[48,32,'q'],[9,25,'q'],[32,25,'q'],[8,16,'q'],[25,17,'q'],[14,22,'q'],[17,9,'q'],[15,23,'q']]));
    app.$('start').click(); await app.move(9,0); assert(app.$('promotion').open, 'promotion dialog missing');
    app.$('promotion-cancel').click(); await settle(); assert(app.$('move-count').textContent === '8', 'cancel changed position');
    await app.move(0,0); assert(app.$('promotion').open, 'promotion dialog did not reopen');
    app.$('promotion-choices').children[3].click(); await settle();
    assert(app.$('move-count').textContent === '9' && (app.codes[0] & 7) === 3 && app.saved().moves[8][2] === 'n', 'knight promotion failed');
  });
  await check('Animation skip and replay do not add moves', async () => {
    const initial = save([]); initial.settings.animations = true;
    const app = await setup(initial); app.$('start').click(); await app.move(52,36);
    assert(!app.$('skip').hidden, 'animation not started'); app.$('skip').click(); await settle();
    assert(app.$('move-count').textContent === '1', 'skip changed move count');
    app.$('replay').click(); await app.flush(); assert(app.$('move-count').textContent === '1' && app.saved().moves.length === 1, 'replay changed move count');
    assert(!app.errors.length, 'animation errors: ' + app.errors.join('; '));
  });
  await check('Kings turn to idle after moves and captures', async () => {
    const scenarios = [
      { moves: [[51,35,'q'],[11,27,'q']], from: 60, to: 51, idle: 0 },
      { moves: [[51,35,'q'],[11,27,'q'],[60,51,'q']], from: 4, to: 11, idle: 4 },
      { moves: [[52,36,'q'],[11,27,'q'],[60,52,'q'],[27,36,'q'],[52,44,'q'],[8,16,'q']], from: 44, to: 36, idle: 0, capture: true },
      { moves: [[51,35,'q'],[12,28,'q'],[35,28,'q'],[4,12,'q'],[48,40,'q'],[12,20,'q'],[40,32,'q']], from: 20, to: 28, idle: 4, capture: true },
      { moves: [[52,36,'q'],[12,28,'q'],[62,45,'q'],[1,18,'q'],[61,52,'q'],[6,21,'q']], from: 60, to: 62, idle: 0 }
    ];
    for (const sprites of ['dos', 'amiga']) for (const scenario of scenarios) {
      const initial = save(scenario.moves); initial.settings.animations = true; initial.settings.sprites = sprites;
      const app = await setup(initial); app.$('start').click(); await app.move(scenario.from, scenario.to); await app.flush();
      const label = sprites + ' king ' + scenario.from + '→' + scenario.to;
      assert(app.$('move-count').textContent === String(scenario.moves.length + 1), label + ' illegal fixture');
      assert((app.codes[scenario.to] & 7) === 2 && (app.codes[scenario.to] >> 3 & 7) === scenario.idle, label + ' idle code');
      assert(app.turns.some(([code, target]) => (code & 7) === 2 && target === scenario.idle && (!scenario.capture || (code >> 3 & 7) === 5)), label + ' missing idle turn');
      const restored = await setup(app.saved());
      assert(restored.codes[scenario.to] === app.codes[scenario.to], label + ' restore');
      app.turns.length = 0; app.$('replay').click(); await app.flush();
      assert(app.turns.some(([code, target]) => (code & 7) === 2 && target === scenario.idle), label + ' replay turn');
      app.$('undo').click(); await settle();
      assert((app.codes[scenario.from] & 7) === 2, label + ' undo');
      await app.move(scenario.from, scenario.to); app.$('skip').click(); await settle();
      assert((app.codes[scenario.to] >> 3 & 7) === scenario.idle, label + ' skip');
      assert(!app.errors.length, label + ': ' + app.errors.join('; '));
    }
  });
  await check('Animated castling and captures complete without errors', async () => {
    const scenarios = [
      { name: 'castle', moves: [[52,36,'q'],[12,28,'q'],[62,45,'q'],[1,18,'q'],[61,52,'q'],[6,21,'q']], from: 60, to: 62, empty: [60,63], pieces: [[62,2],[61,6]] },
      { name: 'pawn capture', moves: [[52,36,'q'],[11,27,'q']], from: 36, to: 27, empty: [36], pieces: [[27,4]] },
      { name: 'rook capture', moves: [[48,32,'q'],[9,25,'q'],[32,25,'q'],[8,24,'q']], from: 56, to: 24, empty: [56], pieces: [[24,6]] },
      { name: 'knight capture', moves: [[52,36,'q'],[11,27,'q'],[62,45,'q'],[12,28,'q']], from: 45, to: 28, empty: [45], pieces: [[28,3]] },
      { name: 'promotion capture', moves: [[48,32,'q'],[9,25,'q'],[32,25,'q'],[8,16,'q'],[25,17,'q'],[14,22,'q'],[17,9,'q'],[15,23,'q']], from: 9, to: 0, empty: [9], pieces: [[0,3]], promotion: true }
    ];
    for (const sprites of ['dos', 'amiga']) for (const scenario of scenarios) {
      const initial = save(scenario.moves); initial.settings.animations = true; initial.settings.sprites = sprites;
      const app = await setup(initial); app.$('start').click(); await app.move(scenario.from, scenario.to);
      if (scenario.promotion) { assert(app.$('promotion').open, 'promotion dialog missing'); app.$('promotion-choices').children[3].click(); await settle(); }
      await app.flush();
      assert(!app.errors.length, sprites + ' ' + scenario.name + ': ' + app.errors.join('; '));
      assert(app.$('move-count').textContent === String(scenario.moves.length + 1), scenario.name + ' move count');
      for (const square of scenario.empty) assert(!app.codes[square], scenario.name + ' occupied ' + square);
      for (const [square, type] of scenario.pieces) assert((app.codes[square] & 7) === type, scenario.name + ' piece ' + square);
    }
  });
  await check('Sprite selection persists across restore, load, new game and replay', async () => {
    const app = await setup(save([])); app.$('start').click();
    assert(app.$('sprites').value === 'dos' && app.provider === 'dos', 'old save did not default to DOS');
    await app.move(52,36); const codes = JSON.stringify(app.codes);
    app.$('sprites').value = 'amiga'; app.$('sprites').onchange(); await settle();
    assert(app.$('sprites').value === 'amiga' && app.provider === (amigaData.spriteSet || 'dos') && JSON.stringify(app.codes) === codes && app.$('move-count').textContent === '1' && app.saved().settings.sprites === 'amiga', 'switch did not preserve game');
    const stored = app.saved(), restored = await setup(stored);
    assert(restored.$('sprites').value === 'amiga' && restored.provider === (amigaData.spriteSet || 'dos'), 'restore lost selection');
    const loaded = await setup(save([])); await loaded.load(stored);
    assert(loaded.$('sprites').value === 'amiga' && loaded.provider === (amigaData.spriteSet || 'dos') && loaded.$('move-count').textContent === '1', 'disk load lost selection');
    app.$('replay').click(); await app.flush();
    assert(app.provider === (amigaData.spriteSet || 'dos') && app.$('move-count').textContent === '1' && !app.errors.length, 'replay lost selection or changed history');
    app.$('new').click(); app.$('new-dialog').close('start'); await settle();
    assert(app.$('sprites').value === 'amiga' && app.provider === (amigaData.spriteSet || 'dos') && app.$('move-count').textContent === '0', 'new game lost selection');
    app.$('sprites').value = 'dos'; app.$('sprites').onchange(); await settle();
    assert(app.$('sprites').value === 'dos' && app.provider === 'dos' && app.saved().settings.sprites === 'dos', 'switch back failed');
  });
  await check('Sprite selector is disabled during animation', async () => {
    const initial = save([]); initial.settings.animations = true;
    const app = await setup(initial); app.$('start').click(); await app.move(52,36);
    assert(app.$('sprites').disabled, 'selector enabled during animation');
    await app.flush(); assert(!app.$('sprites').disabled && !app.errors.length, 'selector remained disabled or animation failed');
  });
  await check('Sprite switch during AI thinking preserves worker', async () => {
    const initial = save([]); initial.settings.mode = 'ai';
    const app = await setup(initial); app.$('start').click(); await app.move(52,36);
    const worker = app.workers.at(-1); assert(worker, 'worker missing');
    app.$('sprites').value = 'amiga'; app.$('sprites').onchange(); await settle();
    assert(!worker.terminated && app.$('status').textContent.includes('thinking'), 'switch interrupted AI');
    worker.respond({ from: 12, to: 28 }); await settle();
    assert(app.$('move-count').textContent === '2' && app.provider === (amigaData.spriteSet || 'dos'), 'AI response or sprite selection lost');
  });
  await check('Animated checkmate, replay, undo and reload', async () => {
    const initial = save([[53,45,'q'],[12,28,'q'],[54,38,'q']]); initial.settings.animations = true;
    const app = await setup(initial); app.$('start').click(); await app.move(3,39); await app.flush();
    assert(!app.errors.length, 'mate animation: ' + app.errors.join('; '));
    assert(app.$('move-count').textContent === '4' && app.saved().moves.length === 4, 'mate saved an extra move');
    assert((app.codes[60] & 7) === 5 && !(app.codes[60] & 64) && !app.codes[39], 'mate renderer codes');
    const savedMate = app.saved();
    app.$('replay').click(); await app.flush();
    assert(!app.errors.length && app.$('move-count').textContent === '4' && app.saved().moves.length === 4, 'mate replay changed history or failed');
    app.$('undo').click(); await settle();
    assert(app.$('move-count').textContent === '3' && (app.codes[60] & 7) === 2 && (app.codes[60] & 64), 'undo did not restore king');
    const restored = await setup(savedMate);
    assert(restored.$('move-count').textContent === '4' && (restored.codes[60] & 7) === 5 && !(restored.codes[60] & 64) && !restored.codes[39], 'mate reload codes');
  });
  await check('Stale AI callbacks after new, load and undo', async () => {
    for (const action of ['new', 'load', 'undo']) {
      const initial = save([]); initial.settings.mode = 'ai';
      const app = await setup(initial); app.$('start').click(); await app.move(52,36);
      const old = app.workers.at(-1); assert(old, 'AI worker missing');
      if (action === 'new') { app.$('new').click(); app.$('new-dialog').close('start'); }
      if (action === 'load') await app.load(save([]));
      if (action === 'undo') app.$('undo').click();
      await settle(); old.respond({ from: 12, to: 28 }); await settle();
      assert(app.$('move-count').textContent === '0', 'stale AI moved after ' + action);
    }
  });
  await check('Stale AI errors preserve current worker', async () => {
    for (const kind of ['error', 'message']) {
      const initial = save([]); initial.settings.mode = 'ai';
      const app = await setup(initial); app.$('start').click(); await app.move(52,36);
      const old = app.workers.at(-1); app.$('undo').click(); await settle(); await app.move(52,36);
      const current = app.workers.at(-1); assert(current && current !== old, 'replacement worker missing');
      if (kind === 'error') old.onerror({ preventDefault() {} });
      else old.onmessage({ data: { error: 'stale' } });
      await settle();
      assert(!current.terminated && app.$('status').textContent.includes('thinking'), 'stale ' + kind + ' disrupted current worker');
    }
  });
  await check('New game dialog clears previous confirmation', async () => {
    const app = await setup(save([])); app.$('start').click(); await app.move(52,36);
    app.$('new').click(); app.$('new-dialog').close('start'); await settle();
    await app.move(52,36); app.$('new').click();
    assert(app.$('new-dialog').returnValue !== 'start', 'previous confirmation remained');
    app.$('new-dialog').close('cancel'); await settle();
    assert(app.$('move-count').textContent === '1', 'cancel started a new game');
  });
  await check('Human black schedules opening AI', async () => {
    const initial = save([]); initial.settings.mode = 'ai'; initial.settings.human = 'b';
    const app = await setup(initial); app.$('start').click(); await settle();
    assert(app.workers.length === 1 && app.workers[0].request.fen.includes(' w '), 'opening worker missing');
    app.workers[0].respond({ from: 52, to: 36 }); await settle();
    assert(app.$('move-count').textContent === '1', 'opening AI move failed');
  });
  return results;
};
