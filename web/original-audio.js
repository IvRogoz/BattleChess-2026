/* Original packed 4-bit sound blocks from ALLCANM1, not a DOS emulator.
 * See analysis/sound-format.md. The SN76489 attenuation-to-speaker transfer
 * and machine calibration are unknown; centered linear nibble output and the
 * calculated nominal rate are approximations, not hardware-exact audio. */
(function (root) {
  'use strict';

  const SoundOffsets = Object.freeze([12802, 17806, 19745, 26280, 29124, 32873, 40242, 46233, 50574, 54549, 57696, 60962, 63464, 67248, 70973]);
  const blocks = new Map();

  function decode(bytes, pitchAdjustment) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.length < 4) throw new Error('Sound block is missing its header');
    const count = bytes[0] | bytes[1] << 8;
    const divisor = bytes[2] | bytes[3] << 8;
    if (!count || !divisor || count > bytes.length - 4) throw new Error('Invalid packed sound block');
    const adjustment = pitchAdjustment === undefined ? 0 : Number(pitchAdjustment);
    if (!Number.isInteger(adjustment) || adjustment < -64 || adjustment > 63) {
      throw new Error('Invalid original pitch adjustment');
    }
    const periodNs = 1000000000 / divisor + 1120 * adjustment;
    if (periodNs <= 0) throw new Error('Invalid sound period');
    const samples = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const value = bytes[4 + i];
      // 0x88 is the observed quiet level; linear scaling is an approximation.
      samples[2 * i] = ((value >> 4) - 8) / 8;
      samples[2 * i + 1] = ((value & 15) - 8) / 8;
    }
    return { samples, sampleRate: 1000000000 / periodNs };
  }

  function play(context, bytes, pitchAdjustment) {
    const decoded = decode(bytes, pitchAdjustment);
    // Use the context rate to support nominal rates outside AudioBuffer limits.
    const bufferRate = context.sampleRate;
    const buffer = context.createBuffer(1, decoded.samples.length, bufferRate);
    buffer.copyToChannel(decoded.samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = decoded.sampleRate / bufferRate;
    source.connect(context.destination);
    source.start();
    return source;
  }

  async function playId(context, id, pitchAdjustment, options) {
    if (!Number.isInteger(id) || id < 0 || id >= SoundOffsets.length) {
      throw new Error('Invalid original sound ID');
    }
    const base = (options && options.basePath) || 'assets/blocks/';
    const url = base.replace(/\/?$/, '/') + 'allcanm1-' + SoundOffsets[id] + '.bin';
    if (!blocks.has(url)) {
      const pending = fetch(url).then(response => {
        if (!response.ok) throw new Error('Unable to load original sound: ' + response.status);
        return response.arrayBuffer();
      }).then(buffer => new Uint8Array(buffer));
      blocks.set(url, pending);
      pending.catch(() => { if (blocks.get(url) === pending) blocks.delete(url); });
    }
    return play(context, await blocks.get(url), pitchAdjustment);
  }

  root.OriginalAudio = Object.freeze({ SoundOffsets, decode, play, playId });
})(globalThis);
