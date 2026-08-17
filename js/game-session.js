import {
  DEFAULT_GAME_MODE_ID,
  getGameMode
} from './game-modes.js';

export const DEFAULT_GAME_DURATION_MS = getGameMode().durationMs;
export const SCORE_UNIT = 100;

const PHASES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  FINISHING: 'finishing',
  FINISHED: 'finished'
});

export const GAME_PHASES = PHASES;

function requireFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function calculateClearScore({
  value,
  count,
  chain = 1,
  type = 'normal'
}) {
  if (type !== 'normal' && type !== 'special-one') {
    throw new RangeError(`Unknown clear type: ${type}`);
  }

  const normalizedCount = requirePositiveInteger(count, 'count');
  const normalizedChain = requirePositiveInteger(chain, 'chain');
  const normalizedValue = requirePositiveInteger(value, 'value');

  if (normalizedValue > 6) {
    throw new RangeError('value must be between 1 and 6');
  }
  if (type === 'normal' && normalizedValue < 2) {
    throw new RangeError('normal clears require a value between 2 and 6');
  }
  if (type === 'special-one' && normalizedValue !== 1) {
    throw new RangeError('special-one clears require value 1');
  }

  return normalizedValue * normalizedCount * SCORE_UNIT * normalizedChain;
}

function freezeSnapshot(session) {
  return Object.freeze({
    phase: session.phase,
    modeId: session.modeId,
    durationMs: session.durationMs,
    elapsedMs: session.elapsedMs,
    remainingMs: Math.max(0, session.durationMs - session.elapsedMs),
    score: session.score,
    clearedDice: session.clearedDice,
    maxChain: session.maxChain,
    clearEvents: session.clearEvents,
    specialOneEvents: session.specialOneEvents,
    endedReason: session.phase === PHASES.FINISHED ? session.endedReason : null
  });
}

export class GameSession {
  constructor({ modeId = DEFAULT_GAME_MODE_ID, durationMs } = {}) {
    const mode = getGameMode(modeId);
    const resolvedDuration = durationMs ?? mode.durationMs;
    requirePositiveInteger(resolvedDuration, 'durationMs');
    if (resolvedDuration !== mode.durationMs) {
      throw new RangeError('durationMs must match the selected game mode');
    }
    this.modeId = mode.id;
    this.durationMs = resolvedDuration;
    this.startedAt = 0;
    this.lastNow = 0;
    this.phase = PHASES.IDLE;
    this.elapsedMs = 0;
    this.score = 0;
    this.clearedDice = 0;
    this.maxChain = 0;
    this.clearEvents = 0;
    this.specialOneEvents = 0;
    this.endedReason = null;
    this.result = null;
  }

  start(now = 0) {
    const startTime = requireFiniteNumber(now, 'now');
    this.startedAt = startTime;
    this.lastNow = startTime;
    this.phase = PHASES.RUNNING;
    this.elapsedMs = 0;
    this.score = 0;
    this.clearedDice = 0;
    this.maxChain = 0;
    this.clearEvents = 0;
    this.specialOneEvents = 0;
    this.result = null;
    return this.getSnapshot();
  }

  restore(snapshot, now = 0) {
    const currentTime = requireFiniteNumber(now, 'now');
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('session snapshot is required');
    }
    if (snapshot.modeId !== this.modeId || snapshot.durationMs !== this.durationMs) {
      throw new RangeError('session snapshot mode does not match');
    }
    if (snapshot.phase !== PHASES.RUNNING && snapshot.phase !== PHASES.FINISHING) {
      throw new RangeError('session snapshot phase is invalid');
    }
    const elapsedMs = requireFiniteNumber(snapshot.elapsedMs, 'elapsedMs');
    if (elapsedMs < 0 || elapsedMs > this.durationMs) {
      throw new RangeError('elapsedMs is invalid');
    }

    this.startedAt = currentTime - elapsedMs;
    this.lastNow = currentTime;
    this.phase = snapshot.phase;
    this.elapsedMs = elapsedMs;
    this.score = requireNonNegativeInteger(snapshot.score, 'score');
    this.clearedDice = requireNonNegativeInteger(snapshot.clearedDice, 'clearedDice');
    this.maxChain = requireNonNegativeInteger(snapshot.maxChain, 'maxChain');
    this.clearEvents = requireNonNegativeInteger(snapshot.clearEvents, 'clearEvents');
    this.specialOneEvents = requireNonNegativeInteger(snapshot.specialOneEvents, 'specialOneEvents');
    this.endedReason = null;
    this.result = null;
    return this.getSnapshot();
  }

  tick(now) {
    const currentTime = requireFiniteNumber(now, 'now');
    if (this.phase !== PHASES.RUNNING) return this.getSnapshot();

    this.lastNow = Math.max(this.lastNow, currentTime);
    const elapsed = Math.max(0, this.lastNow - this.startedAt);
    this.elapsedMs = Math.min(this.durationMs, elapsed);

    if (this.elapsedMs >= this.durationMs) {
      this.phase = PHASES.FINISHING;
    }

    return this.getSnapshot();
  }

  isAcceptingInput() {
    return this.phase === PHASES.RUNNING;
  }

  recordClear(clear) {
    if (this.phase !== PHASES.RUNNING && this.phase !== PHASES.FINISHING) {
      return null;
    }

    const type = clear?.type ?? 'normal';
    const value = clear?.value;
    const count = clear?.count;
    const chain = clear?.chain ?? 1;
    const points = calculateClearScore({ value, count, chain, type });

    this.score += points;
    this.clearedDice += count;
    this.maxChain = Math.max(this.maxChain, chain);
    this.clearEvents += 1;
    if (type === 'special-one') this.specialOneEvents += 1;

    return Object.freeze({
      type,
      value,
      count,
      chain,
      points,
      totalScore: this.score
    });
  }

  retire(now = this.lastNow) {
    const currentTime = requireFiniteNumber(now, 'now');
    if (this.phase !== PHASES.RUNNING && this.phase !== PHASES.FINISHING) {
      return null;
    }
    if (this.phase === PHASES.RUNNING) this.tick(currentTime);
    this.phase = PHASES.FINISHED;
    this.endedReason = 'retired';
    this.result = freezeSnapshot(this);
    return this.result;
  }

  finishWhenSettled(hasPendingWork = false) {
    if (this.phase !== PHASES.FINISHING || hasPendingWork) return null;
    this.phase = PHASES.FINISHED;
    this.elapsedMs = this.durationMs;
    this.endedReason = 'time-up';
    this.result = freezeSnapshot(this);
    return this.result;
  }

  getSnapshot() {
    return freezeSnapshot(this);
  }

  getResult() {
    return this.result;
  }
}
