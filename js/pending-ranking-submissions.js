import { getGameMode } from './game-modes.js';
import { validatePlayerName } from './player-profile.js';
import {
  isValidRankingClientVersion,
  isValidRankingSubmissionId,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from './ranking-client.js';

export const PENDING_RANKING_DATABASE_NAME = 'sainome-ranking';
export const PENDING_RANKING_OBJECT_STORE = 'pending-submissions-v1';
export const PENDING_RANKING_CHANNEL_NAME = 'sainome-pending-ranking-v1';
export const PENDING_RANKING_STORAGE_VERSION = 1;
export const MAX_PENDING_RANKING_SUBMISSIONS = 50;

const MAX_SCORE = 100_000_000;
const MAX_CLEARED_DICE = 1_000_000;
const MAX_CHAIN = 100_000;
const MAX_CREATED_AT = 8_640_000_000_000_000;
const MAX_SERIALIZED_CHARACTERS = 4096;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')),
      { once: true }
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed')),
      { once: true }
    );
  });
}

async function runTransaction(database, mode, action) {
  const transaction = database.transaction(PENDING_RANKING_OBJECT_STORE, mode);
  const done = transactionDone(transaction);
  try {
    const result = await action(transaction.objectStore(PENDING_RANKING_OBJECT_STORE));
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    await done.catch(() => {});
    throw error;
  }
}

export class IndexedDbRankingStorage {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = PENDING_RANKING_DATABASE_NAME } = {}) {
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      throw new TypeError('IndexedDB is unavailable');
    }
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.databasePromise = null;
  }

  async open() {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, 1);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PENDING_RANKING_OBJECT_STORE)) {
          database.createObjectStore(PENDING_RANKING_OBJECT_STORE, {
            keyPath: 'submissionId'
          });
        }
      });
      request.addEventListener('success', () => {
        const database = request.result;
        database.addEventListener('versionchange', () => {
          database.close();
          this.databasePromise = null;
        });
        resolve(database);
      }, { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    }).catch((error) => {
      this.databasePromise = null;
      throw error;
    });

    return this.databasePromise;
  }

  async list() {
    const database = await this.open();
    return runTransaction(database, 'readonly', (store) => requestResult(store.getAll()));
  }

  async addIfAbsent({ submissionId, serialized, maxItems }) {
    const database = await this.open();
    return runTransaction(database, 'readwrite', async (store) => {
      const existing = await requestResult(store.get(submissionId));
      if (existing !== undefined) return { status: 'existing', record: existing };

      const count = await requestResult(store.count());
      if (count >= maxItems) return { status: 'full', record: null };

      const record = Object.freeze({ submissionId, serialized });
      await requestResult(store.add(record));
      return { status: 'added', record };
    });
  }

  async deleteIfMatch({ submissionId, serialized }) {
    const database = await this.open();
    return runTransaction(database, 'readwrite', async (store) => {
      const existing = await requestResult(store.get(submissionId));
      if (existing === undefined) return { status: 'not-found', record: null };
      if (
        !existing
        || existing.submissionId !== submissionId
        || existing.serialized !== serialized
      ) {
        return { status: 'conflict', record: existing };
      }

      await requestResult(store.delete(submissionId));
      return { status: 'removed', record: existing };
    });
  }
}

function defaultStorage() {
  try {
    return globalThis.indexedDB ? new IndexedDbRankingStorage() : null;
  } catch {
    return null;
  }
}

function requireNonNegativeInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} is invalid`);
  }
  return value;
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('result is required');
  }
  if (result.endedReason !== 'time-up') {
    throw new RangeError('endedReason is invalid');
  }

  const mode = getGameMode(result.modeId);
  return Object.freeze({
    modeId: mode.id,
    score: requireNonNegativeInteger(result.score, 'score', MAX_SCORE),
    clearedDice: requireNonNegativeInteger(
      result.clearedDice,
      'clearedDice',
      MAX_CLEARED_DICE
    ),
    maxChain: requireNonNegativeInteger(result.maxChain, 'maxChain', MAX_CHAIN),
    endedReason: result.endedReason
  });
}

function normalizeSubmission(value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError('submission is required');
  }
  if (!isValidRankingSubmissionId(value.submissionId)) {
    throw new TypeError('submissionId is invalid');
  }
  if (!isValidRankingClientVersion(value.clientVersion)) {
    throw new TypeError('clientVersion is invalid');
  }
  if (value.contractVersion !== RANKING_SUBMISSION_CONTRACT_VERSION) {
    throw new TypeError('contractVersion is invalid');
  }

  const validatedName = validatePlayerName(value.displayName);
  if (!validatedName.ok || validatedName.name !== value.displayName) {
    throw new TypeError('displayName is invalid');
  }

  requireNonNegativeInteger(value.createdAt, 'createdAt', MAX_CREATED_AT);
  return Object.freeze({
    submissionId: value.submissionId,
    contractVersion: value.contractVersion,
    clientVersion: value.clientVersion,
    displayName: validatedName.name,
    result: normalizeResult(value.result),
    createdAt: value.createdAt
  });
}

function serializeSubmission(submission) {
  const serialized = JSON.stringify({
    version: PENDING_RANKING_STORAGE_VERSION,
    submission
  });
  if (serialized.length > MAX_SERIALIZED_CHARACTERS) {
    throw new RangeError('serialized submission is too large');
  }
  return serialized;
}

function decodeRecord(record) {
  if (
    !record
    || !isValidRankingSubmissionId(record.submissionId)
    || typeof record.serialized !== 'string'
    || record.serialized.length > MAX_SERIALIZED_CHARACTERS
  ) {
    throw new TypeError('saved submission record is invalid');
  }
  const saved = JSON.parse(record.serialized);
  if (saved?.version !== PENDING_RANKING_STORAGE_VERSION) {
    throw new TypeError('saved submission version is invalid');
  }

  const submission = normalizeSubmission(saved.submission);
  if (record.submissionId !== submission.submissionId) {
    throw new TypeError('saved submission key does not match its identifier');
  }
  const canonical = serializeSubmission(submission);
  if (canonical !== record.serialized) {
    throw new TypeError('saved submission is not canonical');
  }
  return Object.freeze({ submission, serialized: canonical });
}

function sameSubmission(left, right) {
  return serializeSubmission(left) === serializeSubmission(right);
}

function freezeResult(result) {
  return Object.freeze(result);
}

function sortSubmissions(items) {
  return [...items].sort((left, right) =>
    left.createdAt - right.createdAt
    || left.submissionId.localeCompare(right.submissionId));
}

export class PendingRankingSubmissions {
  constructor({ storage = defaultStorage(), maxItems = MAX_PENDING_RANKING_SUBMISSIONS } = {}) {
    if (!Number.isInteger(maxItems) || maxItems < 1) {
      throw new RangeError('maxItems is invalid');
    }

    this.storage = storage;
    this.maxItems = maxItems;
    this.items = [];
    this.volatileItems = new Map();
    this.corruptedIds = new Set();
    this.storageAvailable = Boolean(storage);
  }

  async refresh() {
    if (!this.storage) {
      this.storageAvailable = false;
      this.items = sortSubmissions(
        [...this.volatileItems.values()].map((entry) => entry.submission)
      );
      return this.getSnapshot();
    }

    let records;
    try {
      records = await this.storage.list();
      if (!Array.isArray(records)) throw new TypeError('saved submissions are invalid');
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      this.items = sortSubmissions(
        [...this.volatileItems.values()].map((entry) => entry.submission)
      );
      return this.getSnapshot();
    }

    const storedItems = new Map();
    const corruptedIds = new Set();
    for (const record of records) {
      try {
        const decoded = decodeRecord(record);
        storedItems.set(decoded.submission.submissionId, decoded);
      } catch {
        corruptedIds.add(String(record?.submissionId ?? 'unknown'));
      }
    }

    for (const [submissionId, volatile] of this.volatileItems) {
      const stored = storedItems.get(submissionId);
      if (stored && stored.serialized !== volatile.serialized) {
        corruptedIds.add(submissionId);
        storedItems.delete(submissionId);
        continue;
      }
      if (stored) {
        this.volatileItems.delete(submissionId);
      } else {
        storedItems.set(submissionId, volatile);
      }
    }

    this.corruptedIds = corruptedIds;
    this.items = sortSubmissions(
      [...storedItems.values()].map((entry) => entry.submission)
    );
    return this.getSnapshot();
  }

  getSnapshot() {
    return Object.freeze({
      items: Object.freeze([...this.items]),
      count: this.items.length,
      corrupted: this.corruptedIds.size > 0,
      corruptedCount: this.corruptedIds.size,
      storageAvailable: this.storageAvailable,
      persisted: this.storageAvailable && this.volatileItems.size === 0,
      volatileCount: this.volatileItems.size
    });
  }

  async enqueue(value) {
    let submission;
    let serialized;
    try {
      submission = normalizeSubmission(value);
      serialized = serializeSubmission(submission);
    } catch {
      return freezeResult({
        ok: false,
        persisted: false,
        code: 'invalid-submission',
        submission: null
      });
    }

    await this.refresh();
    const existing = this.items.find((item) => item.submissionId === submission.submissionId);
    if (existing) {
      const matches = sameSubmission(existing, submission);
      return freezeResult({
        ok: matches,
        persisted: matches && !this.volatileItems.has(existing.submissionId),
        code: matches ? 'already-queued' : 'submission-conflict',
        submission: existing
      });
    }
    if (this.corruptedIds.has(submission.submissionId)) {
      return freezeResult({
        ok: false,
        persisted: false,
        code: 'submission-conflict',
        submission: null
      });
    }

    if (!this.storage) {
      if (this.items.length >= this.maxItems) {
        return freezeResult({
          ok: false, persisted: false, code: 'queue-full', submission: null
        });
      }
      this.volatileItems.set(submission.submissionId, { submission, serialized });
      await this.refresh();
      return freezeResult({
        ok: true,
        persisted: false,
        code: 'storage-unavailable',
        submission
      });
    }

    let added;
    try {
      added = await this.storage.addIfAbsent({
        submissionId: submission.submissionId,
        serialized,
        maxItems: this.maxItems
      });
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      this.volatileItems.set(submission.submissionId, { submission, serialized });
      await this.refresh();
      if (this.corruptedIds.has(submission.submissionId)) {
        this.volatileItems.delete(submission.submissionId);
        await this.refresh();
        return freezeResult({
          ok: false,
          persisted: false,
          code: 'submission-conflict',
          submission: null
        });
      }
      const recovered = this.items.find((item) => item.submissionId === submission.submissionId);
      if (recovered && !this.volatileItems.has(submission.submissionId)) {
        return freezeResult({
          ok: true,
          persisted: true,
          code: 'queued',
          submission: recovered
        });
      }
      return freezeResult({
        ok: true,
        persisted: false,
        code: 'storage-unavailable',
        submission
      });
    }

    if (added?.status === 'full') {
      await this.refresh();
      return freezeResult({
        ok: false,
        persisted: false,
        code: 'queue-full',
        submission: null
      });
    }
    if (added?.status === 'existing') {
      try {
        const saved = decodeRecord(added.record).submission;
        const matches = sameSubmission(saved, submission);
        await this.refresh();
        return freezeResult({
          ok: matches,
          persisted: matches,
          code: matches ? 'already-queued' : 'submission-conflict',
          submission: saved
        });
      } catch {
        await this.refresh();
        return freezeResult({
          ok: false,
          persisted: false,
          code: 'submission-conflict',
          submission: null
        });
      }
    }
    if (added?.status !== 'added') {
      return freezeResult({
        ok: false,
        persisted: false,
        code: 'storage-unavailable',
        submission: null
      });
    }

    this.volatileItems.delete(submission.submissionId);
    await this.refresh();
    return freezeResult({
      ok: true,
      persisted: true,
      code: 'queued',
      submission
    });
  }

  async markAccepted(value) {
    let submission;
    let serialized;
    try {
      submission = normalizeSubmission(value);
      serialized = serializeSubmission(submission);
    } catch {
      return freezeResult({
        ok: false,
        removed: false,
        persisted: false,
        code: 'invalid-submission'
      });
    }

    const volatile = this.volatileItems.get(submission.submissionId);
    if (volatile && volatile.serialized !== serialized) {
      return freezeResult({
        ok: false,
        removed: false,
        persisted: false,
        code: 'submission-conflict'
      });
    }

    if (!this.storage) {
      const removed = this.volatileItems.delete(submission.submissionId);
      await this.refresh();
      return freezeResult({
        ok: true,
        removed,
        persisted: false,
        code: removed ? 'removed' : 'not-found'
      });
    }

    let deletion;
    try {
      deletion = await this.storage.deleteIfMatch({
        submissionId: submission.submissionId,
        serialized
      });
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      await this.refresh();
      return freezeResult({
        ok: false,
        removed: false,
        persisted: false,
        code: 'storage-unavailable'
      });
    }

    if (deletion?.status === 'conflict') {
      await this.refresh();
      return freezeResult({
        ok: false,
        removed: false,
        persisted: false,
        code: 'submission-conflict'
      });
    }
    if (!['removed', 'not-found'].includes(deletion?.status)) {
      await this.refresh();
      return freezeResult({
        ok: false,
        removed: false,
        persisted: false,
        code: 'storage-unavailable'
      });
    }

    const removedVolatile = this.volatileItems.delete(submission.submissionId);
    await this.refresh();
    const removed = deletion.status === 'removed' || removedVolatile;
    return freezeResult({
      ok: true,
      removed,
      persisted: true,
      code: removed ? 'removed' : 'not-found'
    });
  }
}
