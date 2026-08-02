export const SCREEN_PHASES = Object.freeze({
  HOME: 'home',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULT: 'result'
});

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function normalizeResult(result) {
  if (!result || !Number.isFinite(result.score) || result.score < 0) {
    throw new TypeError('result must include a non-negative finite score');
  }

  return Object.freeze({
    score: result.score,
    clearedDice: Math.max(0, Number(result.clearedDice) || 0),
    maxChain: Math.max(0, Number(result.maxChain) || 0),
    endedReason: result.endedReason ?? 'time-up'
  });
}

function freezeSnapshot(flow) {
  return Object.freeze({
    screen: flow.screen,
    countdown: flow.countdown,
    result: flow.result,
    canMove: flow.screen === SCREEN_PHASES.PLAYING
  });
}

export function formatRemainingSeconds(remainingMs) {
  if (!Number.isFinite(remainingMs)) return 0;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export class GameFlow {
  constructor({ countdownFrom = 3 } = {}) {
    this.countdownFrom = requirePositiveInteger(countdownFrom, 'countdownFrom');
    this.screen = SCREEN_PHASES.HOME;
    this.countdown = 0;
    this.result = null;
  }

  beginCountdown() {
    if (
      this.screen !== SCREEN_PHASES.HOME
      && this.screen !== SCREEN_PHASES.RESULT
    ) return null;

    this.screen = SCREEN_PHASES.COUNTDOWN;
    this.countdown = this.countdownFrom;
    this.result = null;
    return this.getSnapshot();
  }

  advanceCountdown() {
    if (this.screen !== SCREEN_PHASES.COUNTDOWN) {
      return Object.freeze({ started: false, snapshot: this.getSnapshot() });
    }

    if (this.countdown > 1) {
      this.countdown -= 1;
      return Object.freeze({ started: false, snapshot: this.getSnapshot() });
    }

    this.countdown = 0;
    this.screen = SCREEN_PHASES.PLAYING;
    return Object.freeze({ started: true, snapshot: this.getSnapshot() });
  }

  finish(result) {
    if (this.screen !== SCREEN_PHASES.PLAYING) return null;
    this.result = normalizeResult(result);
    this.screen = SCREEN_PHASES.RESULT;
    this.countdown = 0;
    return this.getSnapshot();
  }

  goHome() {
    this.screen = SCREEN_PHASES.HOME;
    this.countdown = 0;
    this.result = null;
    return this.getSnapshot();
  }

  canMove() {
    return this.screen === SCREEN_PHASES.PLAYING;
  }

  getSnapshot() {
    return freezeSnapshot(this);
  }
}
