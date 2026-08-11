const UINT32_MAX = 0xffffffff;
const DEFAULT_SEED = 0x6d2b79f5;

function normalizeSeed(value) {
  if (!Number.isInteger(value) || value < 1 || value > UINT32_MAX) {
    throw new RangeError('random seed must be a non-zero uint32');
  }
  return value >>> 0;
}

function createSeed() {
  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const values = globalThis.crypto.getRandomValues(new Uint32Array(1));
      if (values[0] !== 0) return values[0];
    }
  } catch {
    // The time-based fallback still gives each local game an independent seed.
  }

  const fallback = (Date.now() ^ Math.floor(Math.random() * UINT32_MAX)) >>> 0;
  return fallback === 0 ? DEFAULT_SEED : fallback;
}

export class GameRandom {
  constructor(seed = createSeed()) {
    this.state = normalizeSeed(seed);
  }

  next() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    if (this.state === 0) this.state = DEFAULT_SEED;
    return this.state / 0x100000000;
  }

  getState() {
    return this.state;
  }

  setState(state) {
    this.state = normalizeSeed(state);
    return this.state;
  }
}

export function createGameRandomSeed() {
  return createSeed();
}
