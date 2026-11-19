/* Static translation of the per-actor capture frame/timer loop in
 * CHESS.EXE unpacked image 0x75f6–0x77aa. The caller owns the two-actor
 * barrier, scene staging, audio and pixel composition. */
class BattleChessActorPlayer {
  constructor(sequenceOrder, timing, sequences) {
    this.order = sequenceOrder;
    this.timing = timing;
    this.sequences = sequences;
    this.orderIndex = 0;
    this.timingIndex = 0;
    this.frameIndex = 0;
    this.currentSequence = null;
    this.countdown = 0;
    this.done = false;
  }

  tick() {
    if (this.done) return { done: true, events: [] };
    if (this.countdown > 0) {
      this.countdown--;
      return { done: false, events: [] };
    }
    const events = [];
    while (this.timingIndex < this.timing.length && this.timing[this.timingIndex] >= 0x80) {
      const code = this.timing[this.timingIndex++];
      if (code === 0xff) { this.timingIndex--; break; }
      if (this.timingIndex >= this.timing.length) throw new Error('Truncated timing command');
      events.push({ code: code & 15, value: this.timing[this.timingIndex++] - 0x40 });
    }
    if (this.timingIndex < this.timing.length && this.timing[this.timingIndex] !== 0xff) {
      this.countdown = this.timing[this.timingIndex++];
    }
    if (this.currentSequence === null) {
      if (this.orderIndex >= this.order.length || this.order[this.orderIndex] === 0xff) {
        this.done = true;
        return { done: true, events };
      }
      const id = this.order[this.orderIndex++];
      const frames = this.sequences[id];
      if (!frames || !frames.length) throw new Error(`Missing animation sequence ${id}`);
      this.currentSequence = frames;
      this.frameIndex = 0;
    }
    const frame = this.currentSequence[this.frameIndex++];
    const kind = this.frameIndex === 1 ? 'base' : 'xor';
    if (this.frameIndex === this.currentSequence.length || this.currentSequence[this.frameIndex] === 0xffff) {
      this.currentSequence = null;
    }
    return { done: false, events, kind, frame };
  }
}
globalThis.BattleChessActorPlayer = BattleChessActorPlayer;
