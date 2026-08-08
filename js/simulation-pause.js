function requireFiniteTime(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

export class SimulationPause {
  constructor() {
    this.startedAt = null;
    this.totalPausedMs = 0;
  }

  begin(now) {
    const current = requireFiniteTime(now, 'now');
    if (this.startedAt === null) this.startedAt = current;
    return this.getSnapshot(current);
  }

  end(now) {
    const current = requireFiniteTime(now, 'now');
    if (this.startedAt !== null) {
      this.totalPausedMs += Math.max(0, current - this.startedAt);
      this.startedAt = null;
    }
    return this.getSnapshot(current);
  }

  sync(shouldPause, now) {
    return shouldPause ? this.begin(now) : this.end(now);
  }

  getPausedDuration(now) {
    const current = requireFiniteTime(now, 'now');
    const activePause = this.startedAt === null
      ? 0
      : Math.max(0, current - this.startedAt);
    return this.totalPausedMs + activePause;
  }

  getSnapshot(now) {
    return Object.freeze({
      paused: this.startedAt !== null,
      pausedMs: this.getPausedDuration(now)
    });
  }
}
