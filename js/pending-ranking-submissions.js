import { getGameMode } from './game-modes.js';
import { validatePlayerName } from './player-profile.js';
import {
  isValidRankingClientVersion,
  isValidRankingSubmissionId,
  RANKING_NAME_CONTRACT_VERSION,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from './ranking-client.js';

export const PENDING_RANKING_DATABASE_NAME = 'sainome-ranking';
export const PENDING_RANKING_OBJECT_STORE = 'pending-submissions-v1';
export const PENDING_RANKING_QUARANTINE_OBJECT_STORE = 'quarantined-submissions-v1';
export const PENDING_RANKING_CHANNEL_NAME = 'sainome-pending-ranking-v1';
export const PENDING_RANKING_DATABASE_VERSION = 2;
export const PENDING_RANKING_STORAGE_VERSION = 2;
export const PENDING_RANKING_LEGACY_CONTRACT_VERSION = 'shared-v1';
export const MAX_PENDING_RANKING_SUBMISSIONS = 50;
export const PENDING_RANKING_STORAGE_TIMEOUT_MS = 2_000;

const MAX_SCORE = 100_000_000;
const MAX_CLEARED_DICE = 1_000_000;
const MAX_CHAIN = 100_000;
const MAX_CREATED_AT = 8_640_000_000_000_000;
const MAX_SERIALIZED_CHARACTERS = 4096;
const DIRECT_SUBMISSION_ID_PATTERN = /^direct-[A-Za-z0-9_-]{8,120}$/u;

function isValidPendingSubmissionId(value) {
  return isValidRankingSubmissionId(value) || (
    typeof value === 'string' && DIRECT_SUBMISSION_ID_PATTERN.test(value)
  );
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function storageTimeoutError() {
  const error = new Error('ranking storage operation timed out');
  error.code = 'storage-timeout';
  return error;
}

function withStorageTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(storageTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
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

async function runTransaction(database, storeNames, mode, action) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const transaction = database.transaction(names, mode);
  const done = transactionDone(transaction);
  try {
    const stores = names.map((name) => transaction.objectStore(name));
    const result = await action(stores.length === 1 ? stores[0] : stores, transaction);
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
      const request = this.indexedDB.open(
        this.databaseName,
        PENDING_RANKING_DATABASE_VERSION
      );
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PENDING_RANKING_OBJECT_STORE)) {
          database.createObjectStore(PENDING_RANKING_OBJECT_STORE, {
            keyPath: 'submissionId'
          });
        }
        if (!database.objectStoreNames.contains(PENDING_RANKING_QUARANTINE_OBJECT_STORE)) {
          const store = database.createObjectStore(PENDING_RANKING_QUARANTINE_OBJECT_STORE, {
            keyPath: 'quarantineId'
          });
          store.createIndex('submissionId', 'submissionId', { unique: false });
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
    return runTransaction(
      database,
      PENDING_RANKING_OBJECT_STORE,
      'readonly',
      (store) => requestResult(store.getAll())
    );
  }

  async listQuarantined() {
    const database = await this.open();
    return runTransaction(
      database,
      PENDING_RANKING_QUARANTINE_OBJECT_STORE,
      'readonly',
      (store) => requestResult(store.getAll())
    );
  }

  async addIfAbsent({ submissionId, serialized, maxItems }) {
    const database = await this.open();
    return runTransaction(database, PENDING_RANKING_OBJECT_STORE, 'readwrite', async (store) => {
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
    return runTransaction(database, PENDING_RANKING_OBJECT_STORE, 'readwrite', async (store) => {
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

  async quarantineIfMatch({
    submissionId,
    serialized,
    reason = 'permanent-rejection',
    code = 'request-rejected',
    quarantinedAt = Date.now()
  }) {
    const database = await this.open();
    return runTransaction(
      database,
      [PENDING_RANKING_OBJECT_STORE, PENDING_RANKING_QUARANTINE_OBJECT_STORE],
      'readwrite',
      async ([pendingStore, quarantineStore]) => {
        const quarantineId = `pending:${submissionId}`;
        const existingQuarantine = await requestResult(quarantineStore.get(quarantineId));
        const existing = await requestResult(pendingStore.get(submissionId));

        if (existingQuarantine !== undefined) {
          if (existingQuarantine.serialized !== serialized) {
            return { status: 'conflict', record: existingQuarantine };
          }
          if (existing !== undefined) await requestResult(pendingStore.delete(submissionId));
          return { status: 'already-quarantined', record: existingQuarantine };
        }
        if (existing === undefined) return { status: 'not-found', record: null };
        if (
          !existing
          || existing.submissionId !== submissionId
          || existing.serialized !== serialized
        ) {
          return { status: 'conflict', record: existing };
        }

        const record = Object.freeze({
          quarantineId,
          source: 'pending-submission',
          submissionId,
          serialized,
          reason: String(reason).slice(0, 120),
          code: String(code).slice(0, 80),
          quarantinedAt
        });
        await requestResult(quarantineStore.add(record));
        await requestResult(pendingStore.delete(submissionId));
        return { status: 'quarantined', record };
      }
    );
  }

  async deleteQuarantinedIfMatch({ quarantineId, serialized }) {
    const database = await this.open();
    return runTransaction(
      database,
      PENDING_RANKING_QUARANTINE_OBJECT_STORE,
      'readwrite',
      async (store) => {
        const existing = await requestResult(store.get(quarantineId));
        if (existing === undefined) return { status: 'not-found', record: null };
        if (!existing || existing.serialized !== serialized) {
          return { status: 'conflict', record: existing };
        }
        await requestResult(store.delete(quarantineId));
        return { status: 'removed', record: existing };
      }
    );
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

function normalizeResult(result, { allowRetired = false } = {}) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('result is required');
  }
  const allowedReasons = allowRetired ? ['time-up', 'retired'] : ['time-up'];
  if (!allowedReasons.includes(result.endedReason)) {
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
  requireNonNegativeInteger(value.issuedAt, 'issuedAt', MAX_CREATED_AT);
  requireNonNegativeInteger(value.earliestSubmitAt, 'earliestSubmitAt', MAX_CREATED_AT);
  requireNonNegativeInteger(value.expiresAt, 'expiresAt', MAX_CREATED_AT);
  if (!(value.issuedAt < value.earliestSubmitAt && value.earliestSubmitAt < value.expiresAt)) {
    throw new RangeError('ranking ticket time window is invalid');
  }
  return Object.freeze({
    submissionId: value.submissionId,
    contractVersion: value.contractVersion,
    clientVersion: value.clientVersion,
    displayName: validatedName.name,
    result: normalizeResult(value.result),
    createdAt: value.createdAt,
    issuedAt: value.issuedAt,
    earliestSubmitAt: value.earliestSubmitAt,
    expiresAt: value.expiresAt
  });
}

function normalizeDirectSubmission(value) {
  if (!value || typeof value !== 'object' || value.kind !== 'direct-name') {
    throw new TypeError('direct submission is invalid');
  }
  if (!isValidPendingSubmissionId(value.submissionId)) {
    throw new TypeError('direct submissionId is invalid');
  }
  if (!isValidRankingClientVersion(value.clientVersion)) {
    throw new TypeError('clientVersion is invalid');
  }
  if (value.contractVersion !== RANKING_NAME_CONTRACT_VERSION) {
    throw new TypeError('contractVersion is invalid');
  }

  const validatedName = validatePlayerName(value.displayName);
  if (!validatedName.ok || validatedName.name !== value.displayName) {
    throw new TypeError('displayName is invalid');
  }
  requireNonNegativeInteger(value.createdAt, 'createdAt', MAX_CREATED_AT);

  return Object.freeze({
    kind: 'direct-name',
    submissionId: value.submissionId,
    contractVersion: value.contractVersion,
    clientVersion: value.clientVersion,
    displayName: validatedName.name,
    result: normalizeResult(value.result, { allowRetired: true }),
    createdAt: value.createdAt
  });
}

function normalizePendingSubmission(value) {
  return value?.kind === 'direct-name'
    ? normalizeDirectSubmission(value)
    : normalizeSubmission(value);
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

function recordKey(record) {
  return String(record?.submissionId ?? 'unknown');
}

function isLegacySharedV1Record(record) {
  if (!record || typeof record.serialized !== 'string') return false;
  try {
    const parsed = JSON.parse(record.serialized);
    const submission = parsed?.submission ?? parsed;
    return parsed?.version === PENDING_RANKING_LEGACY_CONTRACT_VERSION
      || parsed?.contractVersion === PENDING_RANKING_LEGACY_CONTRACT_VERSION
      || parsed?.contract_version === PENDING_RANKING_LEGACY_CONTRACT_VERSION
      || submission?.contractVersion === PENDING_RANKING_LEGACY_CONTRACT_VERSION
      || submission?.contract_version === PENDING_RANKING_LEGACY_CONTRACT_VERSION;
  } catch {
    return false;
  }
}

function createRecoveryRecord(record, type, extra = {}) {
  return Object.freeze({
    type,
    submissionId: recordKey(record),
    serialized: typeof record?.serialized === 'string' ? record.serialized : '',
    ...extra
  });
}

function decodeRecord(record) {
  if (
    !record
    || !isValidPendingSubmissionId(record.submissionId)
    || typeof record.serialized !== 'string'
    || record.serialized.length > MAX_SERIALIZED_CHARACTERS
  ) {
    throw new TypeError('saved submission record is invalid');
  }
  const saved = JSON.parse(record.serialized);
  if (saved?.version !== PENDING_RANKING_STORAGE_VERSION) {
    throw new TypeError('saved submission version is invalid');
  }

  const submission = normalizePendingSubmission(saved.submission);
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
  constructor({
    storage = defaultStorage(),
    maxItems = MAX_PENDING_RANKING_SUBMISSIONS,
    storageTimeoutMs = PENDING_RANKING_STORAGE_TIMEOUT_MS
  } = {}) {
    if (!Number.isInteger(maxItems) || maxItems < 1) {
      throw new RangeError('maxItems is invalid');
    }
    if (!Number.isFinite(storageTimeoutMs) || storageTimeoutMs < 1) {
      throw new RangeError('storageTimeoutMs is invalid');
    }

    this.storage = storage;
    this.maxItems = maxItems;
    this.storageTimeoutMs = storageTimeoutMs;
    this.items = [];
    this.volatileItems = new Map();
    this.volatileQuarantinedItems = new Map();
    this.corruptedIds = new Set();
    this.corruptedItems = [];
    this.unverifiedItems = [];
    this.quarantinedItems = [];
    this.storageAvailable = Boolean(storage);
    this.recoveryStorageAvailable = Boolean(storage);
    this.storageFailureCode = null;
  }

  async refresh() {
    if (!this.storage) {
      this.storageAvailable = false;
      this.recoveryStorageAvailable = false;
      this.items = sortSubmissions(
        [...this.volatileItems.values()].map((entry) => entry.submission)
      );
      this.quarantinedItems = [...this.volatileQuarantinedItems.values()];
      return this.getSnapshot();
    }

    let records;
    try {
      records = await withStorageTimeout(this.storage.list(), this.storageTimeoutMs);
      if (!Array.isArray(records)) throw new TypeError('saved submissions are invalid');
      this.storageAvailable = true;
    } catch (error) {
      this.storageAvailable = false;
      this.recoveryStorageAvailable = false;
      if (error?.code === 'storage-timeout') {
        this.storageFailureCode = 'storage-timeout';
        this.storage = null;
      }
      this.items = sortSubmissions(
        [...this.volatileItems.values()].map((entry) => entry.submission)
      );
      return this.getSnapshot();
    }

    const storedItems = new Map();
    const corruptedIds = new Set();
    const corruptedItems = [];
    const unverifiedItems = [];
    for (const record of records) {
      if (isLegacySharedV1Record(record)) {
        unverifiedItems.push(createRecoveryRecord(record, 'unverified', {
          contractVersion: PENDING_RANKING_LEGACY_CONTRACT_VERSION
        }));
        continue;
      }
      try {
        const decoded = decodeRecord(record);
        storedItems.set(decoded.submission.submissionId, decoded);
      } catch {
        const recovery = createRecoveryRecord(record, 'corrupted', {
          reason: 'saved-submission-unreadable'
        });
        corruptedIds.add(recovery.submissionId);
        corruptedItems.push(recovery);
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
    this.corruptedItems = corruptedItems;
    this.unverifiedItems = unverifiedItems;
    this.recoveryStorageAvailable = true;
    if (typeof this.storage.listQuarantined === 'function') {
      try {
        const quarantined = await withStorageTimeout(
          this.storage.listQuarantined(),
          this.storageTimeoutMs
        );
        if (!Array.isArray(quarantined)) throw new TypeError('quarantine records are invalid');
        this.quarantinedItems = [
          ...quarantined
            .filter((record) => record && typeof record.serialized === 'string')
            .map((record) => createRecoveryRecord(record, 'quarantined', {
              quarantineId: String(record.quarantineId ?? ''),
              source: String(record.source ?? 'pending-submission'),
              code: String(record.code ?? 'request-rejected'),
              reason: String(record.reason ?? 'permanent-rejection'),
              quarantinedAt: record.quarantinedAt
            })),
          ...this.volatileQuarantinedItems.values()
        ];
      } catch (error) {
        this.recoveryStorageAvailable = false;
        if (error?.code === 'storage-timeout') {
          this.storageFailureCode = 'storage-timeout';
          this.storage = null;
        }
        this.quarantinedItems = [...this.volatileQuarantinedItems.values()];
      }
    } else {
      this.quarantinedItems = [...this.volatileQuarantinedItems.values()];
    }
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
      corruptedItems: Object.freeze([...this.corruptedItems]),
      unverified: this.unverifiedItems.length > 0,
      unverifiedCount: this.unverifiedItems.length,
      unverifiedItems: Object.freeze([...this.unverifiedItems]),
      quarantined: this.quarantinedItems.length > 0,
      quarantineCount: this.quarantinedItems.length,
      quarantinedItems: Object.freeze([...this.quarantinedItems]),
      recoveryStorageAvailable: this.recoveryStorageAvailable,
      storageAvailable: this.storageAvailable,
      persisted: this.storageAvailable && this.volatileItems.size === 0,
      volatileCount: this.volatileItems.size
    });
  }

  async enqueue(value) {
    let submission;
    let serialized;
    try {
      submission = normalizePendingSubmission(value);
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
    const blockedRecovery = [
      ...this.corruptedItems,
      ...this.unverifiedItems,
      ...this.quarantinedItems
    ].find((record) => record.submissionId === submission.submissionId);
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
    if (blockedRecovery) {
      return freezeResult({
        ok: false,
        persisted: false,
        code: 'submission-conflict',
        submission: null
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
      const storageFailureCode = this.storageFailureCode ?? 'storage-unavailable';
      this.storageFailureCode = null;
      this.volatileItems.set(submission.submissionId, { submission, serialized });
      await this.refresh();
      return freezeResult({
        ok: true,
        persisted: false,
        code: storageFailureCode,
        submission
      });
    }

    let added;
    let storageErrorCode = 'storage-unavailable';
    try {
      added = await withStorageTimeout(
        this.storage.addIfAbsent({
          submissionId: submission.submissionId,
          serialized,
          maxItems: this.maxItems
        }),
        this.storageTimeoutMs
      );
      this.storageAvailable = true;
    } catch (error) {
      storageErrorCode = error?.code === 'storage-timeout'
        ? 'storage-timeout'
        : 'storage-unavailable';
      if (storageErrorCode === 'storage-timeout') {
        this.storageFailureCode = 'storage-timeout';
        this.storage = null;
      }
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
        code: storageErrorCode,
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

  async quarantine(value, {
    reason = 'permanent-rejection',
    code = 'request-rejected'
  } = {}) {
    const normalizedReason = String(reason).slice(0, 120);
    const normalizedCode = String(code).slice(0, 80);
    let submission;
    let serialized;
    try {
      submission = normalizePendingSubmission(value);
      serialized = serializeSubmission(submission);
    } catch {
      return freezeResult({
        ok: false,
        isolated: false,
        persisted: false,
        code: 'invalid-submission'
      });
    }

    await this.refresh();
    const volatile = this.volatileItems.get(submission.submissionId);
    if (volatile && volatile.serialized !== serialized) {
      return freezeResult({
        ok: false,
        isolated: false,
        persisted: false,
        code: 'submission-conflict'
      });
    }

    if (!this.storage) {
      if (!volatile) {
        return freezeResult({
          ok: false,
          isolated: false,
          persisted: false,
          code: 'not-found'
        });
      }
      const record = createRecoveryRecord({
        submissionId: submission.submissionId,
        serialized
      }, 'quarantined', {
        quarantineId: `pending:${submission.submissionId}`,
        source: 'pending-submission',
        reason: normalizedReason,
        code: normalizedCode,
        quarantinedAt: Date.now()
      });
      this.volatileItems.delete(submission.submissionId);
      this.volatileQuarantinedItems.set(record.quarantineId, record);
      await this.refresh();
      return freezeResult({
        ok: true,
        isolated: true,
        persisted: false,
        code: 'quarantined'
      });
    }

    if (typeof this.storage.quarantineIfMatch !== 'function') {
      return freezeResult({
        ok: false,
        isolated: false,
        persisted: false,
        code: 'storage-unavailable'
      });
    }

    let result;
    try {
      result = await this.storage.quarantineIfMatch({
        submissionId: submission.submissionId,
        serialized,
        reason: normalizedReason,
        code: normalizedCode,
        quarantinedAt: Date.now()
      });
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
      return freezeResult({
        ok: false,
        isolated: false,
        persisted: false,
        code: 'storage-unavailable'
      });
    }

    if (!['quarantined', 'already-quarantined'].includes(result?.status)) {
      await this.refresh();
      return freezeResult({
        ok: false,
        isolated: false,
        persisted: false,
        code: result?.status === 'conflict' ? 'submission-conflict' : 'not-found'
      });
    }
    await this.refresh();
    return freezeResult({
      ok: true,
      isolated: true,
      persisted: true,
      code: result.status
    });
  }

  async exportRecoveryData() {
    const snapshot = await this.refresh();
    return JSON.stringify({
      exportVersion: 'sainome-ranking-recovery-v1',
      exportedAt: new Date().toISOString(),
      pending: snapshot.items,
      unverified: snapshot.unverifiedItems,
      corrupted: snapshot.corruptedItems,
      quarantined: snapshot.quarantinedItems
    }, null, 2);
  }

  async deleteRecoveryRecord(record) {
    if (!record || typeof record !== 'object' || typeof record.serialized !== 'string') {
      return freezeResult({ ok: false, removed: false, code: 'invalid-recovery-record' });
    }
    const snapshot = await this.refresh();
    const candidates = record.type === 'quarantined'
      ? snapshot.quarantinedItems
      : [...snapshot.corruptedItems, ...snapshot.unverifiedItems];
    const current = candidates.find((candidate) =>
      candidate.submissionId === record.submissionId
      && candidate.serialized === record.serialized
      && (record.type !== 'quarantined' || candidate.quarantineId === record.quarantineId)
    );
    if (!current) {
      return freezeResult({ ok: false, removed: false, code: 'not-found' });
    }

    if (record.type === 'quarantined') {
      const volatileRemoved = this.volatileQuarantinedItems.delete(record.quarantineId);
      if (volatileRemoved) {
        await this.refresh();
        return freezeResult({ ok: true, removed: true, code: 'removed' });
      }
      if (typeof this.storage?.deleteQuarantinedIfMatch !== 'function') {
        return freezeResult({ ok: false, removed: false, code: 'storage-unavailable' });
      }
      let result;
      try {
        result = await this.storage.deleteQuarantinedIfMatch({
          quarantineId: record.quarantineId,
          serialized: record.serialized
        });
      } catch {
        this.storageAvailable = false;
        this.recoveryStorageAvailable = false;
        return freezeResult({ ok: false, removed: false, code: 'storage-unavailable' });
      }
      await this.refresh();
      return freezeResult({
        ok: result?.status === 'removed' || result?.status === 'not-found',
        removed: result?.status === 'removed',
        code: result?.status ?? 'storage-unavailable'
      });
    }

    if (typeof this.storage?.deleteIfMatch !== 'function') {
      return freezeResult({ ok: false, removed: false, code: 'storage-unavailable' });
    }
    let result;
    try {
      result = await this.storage.deleteIfMatch({
        submissionId: record.submissionId,
        serialized: record.serialized
      });
    } catch {
      this.storageAvailable = false;
      this.recoveryStorageAvailable = false;
      return freezeResult({ ok: false, removed: false, code: 'storage-unavailable' });
    }
    await this.refresh();
    return freezeResult({
      ok: result?.status === 'removed' || result?.status === 'not-found',
      removed: result?.status === 'removed',
      code: result?.status ?? 'storage-unavailable'
    });
  }

  async markAccepted(value) {
    let submission;
    let serialized;
    try {
      submission = normalizePendingSubmission(value);
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
