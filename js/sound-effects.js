export const SOUND_PREFERENCE_KEY = 'sainome:sound-enabled:v1';

function readStoredPreference(storage) {
  try {
    return storage?.getItem(SOUND_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredPreference(storage, enabled) {
  try {
    storage?.setItem(SOUND_PREFERENCE_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in private browsing or restricted embeds.
  }
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function createDefaultAudioContext() {
  const AudioContextClass = globalThis.AudioContext
    ?? globalThis.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function disconnectWhenEnded(node, linkedNodes = []) {
  node.addEventListener?.('ended', () => {
    node.disconnect?.();
    for (const linkedNode of linkedNodes) linkedNode.disconnect?.();
  }, { once: true });
}

export class SoundEffects {
  constructor({
    storage = getDefaultStorage(),
    contextFactory = createDefaultAudioContext,
    random = Math.random
  } = {}) {
    this.storage = storage;
    this.contextFactory = contextFactory;
    this.random = random;
    this.enabled = readStoredPreference(storage);
    this.context = null;
    this.masterGain = null;
    this.noiseBuffer = null;
    this.lastClearAt = -Infinity;
  }

  getSnapshot() {
    return Object.freeze({
      enabled: this.enabled,
      available: this.context !== null || this.contextFactory !== null,
      running: this.context?.state === 'running'
    });
  }

  async setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    writeStoredPreference(this.storage, this.enabled);

    if (!this.enabled) {
      await this.suspend();
      return this.getSnapshot();
    }

    await this.unlock();
    return this.getSnapshot();
  }

  ensureContext() {
    if (this.context) return this.context;

    try {
      this.context = this.contextFactory?.() ?? null;
    } catch {
      this.context = null;
    }
    if (!this.context) return null;

    this.masterGain = this.context.createGain();
    this.masterGain.gain.setValueAtTime(0.42, this.context.currentTime);
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  async unlock() {
    if (!this.enabled) return false;
    const context = this.ensureContext();
    if (!context) return false;

    try {
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch {
      return false;
    }
  }

  async suspend() {
    try {
      if (this.context?.state === 'running') await this.context.suspend();
    } catch {
      // Losing audio must never interrupt the game.
    }
  }

  handleVisibility(hidden) {
    if (hidden) void this.suspend();
  }

  getPlayableContext() {
    if (!this.enabled) return null;
    const context = this.ensureContext();
    if (!context) return null;
    if (context.state === 'suspended') void this.unlock();
    return context.state === 'running' ? context : null;
  }

  createNoiseBuffer(context) {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.ceil(context.sampleRate * 0.42);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = this.random() * 2 - 1;
      previous = previous * 0.64 + white * 0.36;
      data[index] = previous;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  playTone({
    when,
    frequency,
    endFrequency = frequency,
    duration,
    gain,
    type = 'sine'
  }) {
    const context = this.getPlayableContext();
    if (!context) return false;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), when);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      when + duration
    );
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(this.masterGain);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.01);
    disconnectWhenEnded(oscillator, [envelope]);
    return true;
  }

  playNoise({ when, duration, gain, frequency, type = 'bandpass', q = 0.9 }) {
    const context = this.getPlayableContext();
    if (!context) return false;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.createNoiseBuffer(context);
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, when);
    filter.Q.setValueAtTime(q, when);
    envelope.gain.setValueAtTime(gain, when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.masterGain);
    source.start(when);
    source.stop(when + duration + 0.01);
    disconnectWhenEnded(source, [filter, envelope]);
    return true;
  }

  playFlick() {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    this.playNoise({
      when: now,
      duration: 0.065,
      gain: 0.13,
      frequency: 1450,
      q: 1.3
    });
    this.playTone({
      when: now,
      frequency: 620,
      endFrequency: 310,
      duration: 0.07,
      gain: 0.075,
      type: 'triangle'
    });
    return true;
  }

  playRoll() {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    for (const [offset, frequency, gain] of [
      [0, 310, 0.18],
      [0.09, 230, 0.16],
      [0.19, 175, 0.22]
    ]) {
      this.playNoise({
        when: now + offset,
        duration: 0.075,
        gain,
        frequency,
        type: 'lowpass',
        q: 0.7
      });
      this.playTone({
        when: now + offset,
        frequency: frequency * 0.62,
        endFrequency: frequency * 0.4,
        duration: 0.085,
        gain: gain * 0.36,
        type: 'square'
      });
    }
    return true;
  }

  playClear({ chain = 1 } = {}) {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    if (now - this.lastClearAt < 0.045) return false;
    this.lastClearAt = now;
    const lift = Math.min(3, Math.max(0, chain - 1)) * 35;
    for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
      this.playTone({
        when: now + index * 0.065,
        frequency: frequency + lift,
        endFrequency: frequency + lift,
        duration: 0.17,
        gain: 0.12 - index * 0.012,
        type: 'triangle'
      });
    }
    return true;
  }

  playSpawn({ count = 1 } = {}) {
    const context = this.getPlayableContext();
    if (!context) return false;
    const now = context.currentTime;
    const strength = Math.min(1.35, 0.9 + Math.max(1, count) * 0.08);
    this.playTone({
      when: now,
      frequency: 105,
      endFrequency: 280,
      duration: 0.24,
      gain: 0.16 * strength,
      type: 'sine'
    });
    this.playTone({
      when: now + 0.11,
      frequency: 560,
      endFrequency: 760,
      duration: 0.22,
      gain: 0.08 * strength,
      type: 'triangle'
    });
    return true;
  }
}
