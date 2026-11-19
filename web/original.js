/* Original Battle Chess resource formats; no DOS/CPU runtime is used here. */
(function (root) {
  'use strict';
  const WALK = [0, 5895, 18630, 28556, 42842, 51780];
  const COMBAT = [73745, 105915, 127499, 155354, 183016, 215513,
    241299, 256108, 279298, 302680, 316655, 322341];
  const BASES = [104485, 126969, 154249, 181670, 214253, 240994,
    254271, 278579, 301654, 315793, 321138, 339271];
  const TYPES = { b: 1, k: 2, n: 3, p: 4, q: 5, r: 6 };

  function unpack(frame) {
    if (frame.indices) return frame;
    const packed = root.atob(frame.pixels), stride = Math.ceil(frame.w / 2);
    const indices = new Uint8Array(frame.w * frame.h);
    for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
      indices[y * frame.w + x] = (packed.charCodeAt(y * stride + (x >> 1)) >> (x & 1 ? 0 : 4)) & 15;
    }
    return { w: frame.w, h: frame.h, x: frame.x, y: frame.y, indices };
  }

  // Both metadata anchors are signed bytes (original CBW at 0x3fc1/0x3fec).
  function xor(previous, patch) {
    previous = unpack(previous); patch = unpack(patch);
    const left = Math.min(-previous.x, -patch.x), top = Math.min(-previous.y, -patch.y);
    const right = Math.max(previous.w - previous.x, patch.w - patch.x);
    const bottom = Math.max(previous.h - previous.y, patch.h - patch.y);
    const w = right - left, h = bottom - top, indices = new Uint8Array(w * h);
    for (const frame of [previous, patch]) {
      const dx = -frame.x - left, dy = -frame.y - top;
      for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
        indices[(dy + y) * w + dx + x] ^= frame.indices[y * frame.w + x];
      }
    }
    return { w, h, x: -left, y: -top, indices };
  }

  class OriginalAssets {
    constructor(data) {
      this.data = data;
      this.tables = data.tables;
      this.main = data.groups.find(g => g.file === 'ALLCANM1' && g.metadataOffset === 0);
      this.aux = data.groups.find(g => g.file === 'ALLCANM1' && g.metadataOffset === 10289);
      this.groups = new Map(data.groups.filter(g => g.file === 'ALLCANM2').map(g => [g.metadataOffset, g]));
      this.frames = new WeakMap();
      this.sequences = new Map();
    }
    frame(frame) {
      if (!frame) throw new Error('Missing original frame');
      if (!this.frames.has(frame)) this.frames.set(frame, unpack(frame));
      return this.frames.get(frame);
    }
    standing(code, flat = false) {
      if (flat) {
        const table = this.tables.flatFrames;
        const id = table ? table[code & 63] : -1;
        // The flat bank replaces runtime descriptors 17..22 (0x2a83..0x2d13).
        if (id >= 17 && id < 23) {
          const bank = this.data.groups.find(g => g.file === 'ALLCANM1' && g.metadataOffset === 12303);
          return this.frame(bank.frames[id - 17]);
        }
      }
      const id = this.tables.standingFrames[code & 63];
      return this.frame(id < 17 ? this.aux.frames[id] : this.main.frames[id - 17]);
    }
    base(group, selector) {
      if (selector & 128) return this.frame(this.main.frames[selector & 127]);
      const combatIndex = COMBAT.indexOf(group.metadataOffset);
      if (combatIndex < 0) throw new Error('Animation base has no reference bank');
      return this.frame(this.groups.get(BASES[combatIndex]).frames[selector]);
    }
    sequence(group, index) {
      const key = group.metadataOffset + ':' + index;
      if (this.sequences.has(key)) return this.sequences.get(key);
      const sequence = group.sequences[index];
      if (!sequence) throw new Error('Missing original animation sequence ' + key);
      let frame = this.base(group, sequence.base);
      const frames = [frame];
      for (const patch of sequence.frames) { frame = xor(frame, this.frame(group.frames[patch])); frames.push(frame); }
      this.sequences.set(key, frames);
      return frames;
    }
    walk(code) {
      const type = code & 7, direction = (code >> 3) & 7;
      const index = [1, 3, 6].includes(type) ? direction >> 1 : direction;
      const group = this.groups.get(WALK[type - 1]);
      return this.sequence(group, index);
    }
    turn(code, target) {
      return this.turnPlayers(code, target).flatMap(player => player.sequences[0]);
    }
    turnPlayers(code, target) {
      const type = code & 7, narrow = [1, 3, 6].includes(type);
      let current = (code >> 3) & 7;
      if (narrow && (current & 1) !== (target & 1)) throw new Error('Invalid turn orientation');
      const players = [], group = this.groups.get(WALK[type - 1]);
      const step = (((target - current) & 4) ? -1 : 1) * (narrow ? 2 : 1);
      while (current !== target) {
        const bank = step > 0 ? 8 : 16;
        const index = narrow ? (bank + current) >> 1 : bank + current;
        const frames = this.sequence(group, index).slice(players.length && [1, 2, 5].includes(type) ? 2 : 0);
        const timing = this.tables.motionTimingA[(type - 1) * 24 + 8 + 2 * current + (step > 0 ? 1 : 0)];
        players.push(new BattleChessActorPlayer([0], timing, { 0: frames }));
        current = (current + step + 8) & 7;
      }
      return players;
    }
    combat(attacker, victim) {
      const a = TYPES[attacker.toLowerCase()] - 1, v = TYPES[victim.toLowerCase()] - 1;
      // Actor 0 is the victim; actor 1 is the attacker (0xc1a1 / 0xc5d0).
      return [v * 6 + a, 36 + a * 6 + v].map((index, actor) => {
        const group = this.groups.get(COMBAT[actor ? 6 + a : v]);
        const order = this.tables.resourceLists[index];
        const sequences = {};
        for (const id of order) sequences[id] = this.sequence(group, id);
        return new BattleChessActorPlayer(order, this.tables.timingA[index], sequences);
      });
    }
    point(square, flat = false) {
      const xs = flat && this.tables.flatX || this.tables.squareX;
      const ys = flat && this.tables.flatY || this.tables.squareY;
      return { x: xs[square], y: ys[square >> 3] };
    }
    polygon(square, flat = false) {
      const row = square >> 3, col = square & 7;
      const ys = flat && this.tables.flatY || this.tables.squareY;
      const top = row ? (ys[row - 1] + ys[row]) / 2 : flat ? ys[0] - 9 : 31;
      const bottom = row < 7 ? (ys[row] + ys[row + 1]) / 2 : flat ? ys[7] + 9 : 199;
      const edges = y => {
        const rowPosition = y <= ys[0] ? 0 : y >= ys[7] ? 7 :
          ys.findIndex((value, i) => i < 7 && value <= y && ys[i + 1] > y);
        const next = Math.min(7, rowPosition + 1);
        const blend = next === rowPosition ? 0 : (y - ys[rowPosition]) / (ys[next] - ys[rowPosition]);
        const x = c => this.point(rowPosition * 8 + c, flat).x * (1 - blend) + this.point(next * 8 + c, flat).x * blend;
        const left = col ? (x(col - 1) + x(col)) / 2 : x(0) - (x(1) - x(0)) / 2;
        const right = col < 7 ? (x(col) + x(col + 1)) / 2 : x(7) + (x(7) - x(6)) / 2;
        return [left, right];
      };
      const a = edges(top), b = edges(bottom);
      return [[a[0], top], [a[1], top], [b[1], bottom], [b[0], bottom]];
    }
    hit(x, y, flat = false) {
      for (let square = 0; square < 64; square++) {
        const p = this.polygon(square, flat); let inside = false;
        for (let i = 0, j = 3; i < 4; j = i++) {
          if ((p[i][1] > y) !== (p[j][1] > y) &&
            x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
        }
        if (inside) return square;
      }
      return -1;
    }
    code(piece, square) {
      const type = TYPES[piece.toLowerCase()], red = piece === piece.toUpperCase();
      const initial = this.tables.initialBoard[square];
      if ((initial & 7) === type && !!(initial & 64) === red) return initial;
      return type | (red ? 64 : 0) | ((type === 6 ? this.point(square).x > 160 ? 7 : 3 : type === 1 ? red ? 1 : 3 : red ? 0 : 4) << 3);
    }
    direction(from, to, type) {
      const dr = Math.sign((to >> 3) - (from >> 3)), dc = Math.sign((to & 7) - (from & 7));
      let direction = dr < 0 ? dc < 0 ? 7 : dc > 0 ? 1 : 0 : dr > 0 ? dc < 0 ? 5 : dc > 0 ? 3 : 4 : dc > 0 ? 2 : 6;
      // Knight's four standing directions follow the major component of its L move.
      if (type === 3) direction = Math.abs((to >> 3) - (from >> 3)) > Math.abs((to & 7) - (from & 7)) ? dr < 0 ? 0 : 4 : dc > 0 ? 2 : 6;
      return direction;
    }
  }

  class OriginalBoard {
    constructor(canvas, assets, screens) {
      this.canvas = canvas; this.context = canvas.getContext('2d');
      this.assets = assets; this.screens = screens; this.flat = false; this.cache = new WeakMap();
      this.context.imageSmoothingEnabled = false;
    }
    image(frame, red) {
      let pair = this.cache.get(frame);
      if (!pair) { pair = []; this.cache.set(frame, pair); }
      if (pair[red ? 1 : 0]) return pair[red ? 1 : 0];
      const canvas = document.createElement('canvas'); canvas.width = frame.w; canvas.height = frame.h;
      const context = canvas.getContext('2d'), image = context.createImageData(frame.w, frame.h);
      for (let i = 0; i < frame.indices.length; i++) {
        let index = frame.indices[i];
        if (!index) continue;
        if (red && (index === 1 || index === 9)) index += 3;
        image.data.set(this.assets.data.palette[index], i * 4); image.data[i * 4 + 3] = 255;
      }
      context.putImageData(image, 0, 0); pair[red ? 1 : 0] = canvas; return canvas;
    }
    sprite(frame, red, point) {
      this.context.drawImage(this.image(frame, red), Math.round(point.x - frame.x), Math.round(point.y - frame.y));
    }
    draw(codes, options = {}) {
      const ctx = this.context; ctx.clearRect(0, 0, 320, 200);
      ctx.drawImage(this.screens[this.flat ? 'board-flat' : 'board'], 0, 0);
      for (const [square, color] of options.highlights || []) {
        const polygon = this.assets.polygon(square, this.flat);
        ctx.beginPath(); polygon.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      }
      const actors = [];
      for (let square = 0; square < 64; square++) {
        const code = codes[square];
        if (!code || options.hidden?.has(square)) continue;
        actors.push({ frame: this.assets.standing(code, this.flat), red: !!(code & 64), point: this.assets.point(square, this.flat) });
      }
      actors.push(...(options.actors || []));
      actors.sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
      for (const actor of actors) this.sprite(actor.frame, actor.red, actor.point);
    }
  }
  root.OriginalAssets = OriginalAssets; root.OriginalBoard = OriginalBoard;
  root.BattleChessPixels = { unpack, xor, WALK, COMBAT, BASES, TYPES };
})(globalThis);
