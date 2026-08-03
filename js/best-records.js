import { getGameMode } from './game-modes.js';

export const BEST_RECORDS_STORAGE_KEY = 'sainome.best-records.v1';
export const BEST_RECORDS_VERSION = 1;

export const BEST_OUTCOMES = Object.freeze({
  FIRST: 'first',
  NEW: 'new',
  TIE: 'tie',
  LOWER: 'lower'
});

function normalizeScore(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('score must be a non-negative safe integer');
  }
  return value;
}

function resolveMode(modeId) {
  return getGameMode(modeId).id;
}

function readRecords(storage) {
  const records = new Map();
  if (!storage?.getItem) return records;

  try {
    const raw = storage.getItem(BEST_RECORDS_STORAGE_KEY);
    if (!raw) return records;

    const payload = JSON.parse(raw);
    if (payload?.version !== BEST_RECORDS_VERSION || !payload.records) {
      return records;
    }

    for (const [modeId, value] of Object.entries(payload.records)) {
      try {
        const normalizedModeId = resolveMode(modeId);
        const score = normalizeScore(value?.score);
        records.set(normalizedModeId, { score, persisted: true });
      } catch {
        // Ignore only the invalid entry so another mode can still be restored.
      }
    }
  } catch {
    // Storage access and malformed JSON must never prevent the game from starting.
  }

  return records;
}

function createPayload(records) {
  return JSON.stringify({
    version: BEST_RECORDS_VERSION,
    records: Object.fromEntries(
      [...records].map(([modeId, record]) => [modeId, { score: record.score }])
    )
  });
}

export function describeBestOutcome(outcome, formatScore = String) {
  switch (outcome.status) {
    case BEST_OUTCOMES.FIRST:
      return '初回記録';
    case BEST_OUTCOMES.NEW:
      return `自己ベスト更新！ +${formatScore(outcome.difference)}点`;
    case BEST_OUTCOMES.TIE:
      return '自己ベストと同点';
    case BEST_OUTCOMES.LOWER:
      return `自己ベストまであと${formatScore(outcome.difference)}点`;
    default:
      throw new TypeError('unknown best outcome');
  }
}

export class BestRecords {
  constructor({ storage } = {}) {
    this.storage = storage;
    if (storage === undefined) {
      try {
        this.storage = globalThis.localStorage;
      } catch {
        this.storage = null;
      }
    }
    this.records = readRecords(this.storage);
  }

  getBest(modeId) {
    this.syncFromStorage();
    const normalizedModeId = resolveMode(modeId);
    return this.records.get(normalizedModeId)?.score ?? null;
  }

  recordResult({ modeId, score }) {
    this.syncFromStorage();
    const normalizedModeId = resolveMode(modeId);
    const normalizedScore = normalizeScore(score);
    const previous = this.records.get(normalizedModeId) ?? null;
    const previousBest = previous?.score ?? null;

    let status = BEST_OUTCOMES.FIRST;
    if (previousBest !== null) {
      if (normalizedScore > previousBest) status = BEST_OUTCOMES.NEW;
      else if (normalizedScore === previousBest) status = BEST_OUTCOMES.TIE;
      else status = BEST_OUTCOMES.LOWER;
    }

    const improvesBest = status === BEST_OUTCOMES.FIRST || status === BEST_OUTCOMES.NEW;
    if (improvesBest) {
      this.records.set(normalizedModeId, {
        score: normalizedScore,
        persisted: false
      });
    }

    const current = this.records.get(normalizedModeId);
    if (current && !current.persisted) this.persist();

    const best = this.records.get(normalizedModeId);
    const difference = previousBest === null
      ? 0
      : Math.abs(normalizedScore - previousBest);

    return Object.freeze({
      modeId: normalizedModeId,
      score: normalizedScore,
      previousBest,
      bestScore: best.score,
      status,
      difference,
      persisted: best.persisted
    });
  }

  syncFromStorage() {
    const storedRecords = readRecords(this.storage);
    for (const [modeId, stored] of storedRecords) {
      const current = this.records.get(modeId);
      if (!current || stored.score > current.score) {
        this.records.set(modeId, stored);
      } else if (stored.score === current.score) {
        current.persisted = true;
      }
    }
  }

  persist() {
    if (!this.storage?.setItem) return false;

    try {
      this.storage.setItem(
        BEST_RECORDS_STORAGE_KEY,
        createPayload(this.records)
      );
      for (const record of this.records.values()) record.persisted = true;
      return true;
    } catch {
      return false;
    }
  }
}
