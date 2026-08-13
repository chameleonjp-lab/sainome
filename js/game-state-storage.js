import { getGameMode } from './game-modes.js';
import {
  isValidRankingClientVersion,
  isValidRankingSubmissionId,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from './ranking-client.js';
import { validatePlayerName } from './player-profile.js';

export const GAME_STATE_VERSION = 1;
export const GAME_STATE_DATABASE_NAME = 'sainome-game-state';
export const GAME_STATE_OBJECT_STORE = 'active-play-v1';
export const GAME_STATE_DATABASE_VERSION = 1;
export const GAME_STATE_STORAGE_KEY = 'active-play';

const BOARD_SIZE = 7;
const MAX_DICE = BOARD_SIZE * BOARD_SIZE;
const MAX_SCORE = 100_000_000;
const MAX_COUNTER = 1_000_000;
const MAX_ANIMATION_ELAPSED_MS = 60_000;
const MAX_SERIALIZED_CHARACTERS = 128 * 1024;
const DIE_STATES = new Set(['normal', 'sinking', 'one-clearing', 'buried', 'rising']);
const ORIENTATION_KEYS = ['top', 'bottom', 'front', 'back', 'left', 'right'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function requireSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} is invalid`);
  }
  return value;
}

function requireFiniteNumber(value, name, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} is invalid`);
  }
  return value;
}

function normalizeQuaternion(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError('die quaternion is invalid');
  }
  const quaternion = value.map((component, index) =>
    requireFiniteNumber(component, `die quaternion[${index}]`, { min: -1, max: 1 })
  );
  if (Math.hypot(...quaternion) < Number.EPSILON) {
    throw new RangeError('die quaternion is empty');
  }
  return quaternion;
}

function normalizeOrientation(die) {
  const orientation = {};
  const seen = new Set();
  for (const key of ORIENTATION_KEYS) {
    const value = requireSafeInteger(die[key], `die ${key}`, { min: 1, max: 6 });
    if (seen.has(value)) throw new RangeError('die orientation contains duplicates');
    seen.add(value);
    orientation[key] = value;
  }
  if (
    orientation.top + orientation.bottom !== 7
    || orientation.front + orientation.back !== 7
    || orientation.left + orientation.right !== 7
  ) {
    throw new RangeError('die orientation is inconsistent');
  }
  return orientation;
}

function normalizeDie(value, index, keys) {
  const die = requireObject(value, `dice[${index}]`);
  if (typeof die.id !== 'string' || !/^die-[1-9][0-9]*$/u.test(die.id)) {
    throw new TypeError(`dice[${index}].id is invalid`);
  }
  if (keys.has(die.id)) throw new RangeError('die identifiers must be unique');
  keys.add(die.id);

  const row = requireSafeInteger(die.row, `dice[${index}].row`, { min: 0, max: BOARD_SIZE - 1 });
  const column = requireSafeInteger(die.column, `dice[${index}].column`, { min: 0, max: BOARD_SIZE - 1 });
  const key = `${row},${column}`;
  if (die.key !== key) throw new RangeError(`dice[${index}].key does not match its position`);

  if (typeof die.state !== 'string' || !DIE_STATES.has(die.state)) {
    throw new RangeError(`dice[${index}].state is invalid`);
  }

  return Object.freeze({
    id: die.id,
    key,
    row,
    column,
    state: die.state,
    ...normalizeOrientation(die),
    positionY: requireFiniteNumber(die.positionY, `dice[${index}].positionY`, { min: -2, max: 2 }),
    scale: requireFiniteNumber(die.scale, `dice[${index}].scale`, { min: 0.1, max: 1.5 }),
    quaternion: Object.freeze(normalizeQuaternion(die.quaternion)),
    riseStartY: requireFiniteNumber(die.riseStartY, `dice[${index}].riseStartY`, { min: -2, max: 2 }),
    sinkElapsedMs: requireFiniteNumber(
      die.sinkElapsedMs,
      `dice[${index}].sinkElapsedMs`,
      { min: 0, max: MAX_ANIMATION_ELAPSED_MS }
    ),
    riseElapsedMs: requireFiniteNumber(
      die.riseElapsedMs,
      `dice[${index}].riseElapsedMs`,
      { min: 0, max: MAX_ANIMATION_ELAPSED_MS }
    )
  });
}

export function normalizeGameRuntimeState(value) {
  const source = requireObject(value, 'game state');
  if (source.version !== GAME_STATE_VERSION) {
    throw new RangeError('game state version is invalid');
  }

  const mode = getGameMode(source.modeId);
  const session = requireObject(source.session, 'game state session');
  if (session.modeId !== mode.id || session.durationMs !== mode.durationMs) {
    throw new RangeError('game state session mode is inconsistent');
  }
  if (session.phase !== 'running' && session.phase !== 'finishing') {
    throw new RangeError('game state session phase is invalid');
  }
  const elapsedMs = requireFiniteNumber(session.elapsedMs, 'session.elapsedMs', {
    min: 0,
    max: mode.durationMs
  });
  const dice = Array.isArray(source.dice) && source.dice.length > 0 && source.dice.length <= MAX_DICE
    ? source.dice
    : null;
  if (!dice) throw new RangeError('game state dice are invalid');

  const diceKeys = new Set();
  const diceByPosition = new Set();
  const normalizedDice = dice.map((die, index) => {
    const normalized = normalizeDie(die, index, diceKeys);
    if (diceByPosition.has(normalized.key)) throw new RangeError('dice positions must be unique');
    diceByPosition.add(normalized.key);
    return normalized;
  });

  const player = requireObject(source.player, 'game state player');
  const playerRow = requireSafeInteger(player.row, 'player.row', { min: 0, max: BOARD_SIZE - 1 });
  const playerColumn = requireSafeInteger(player.column, 'player.column', { min: 0, max: BOARD_SIZE - 1 });
  if (player.activeKey !== null && typeof player.activeKey !== 'string') {
    throw new TypeError('player.activeKey is invalid');
  }
  if (
    player.activeKey !== null
    && player.activeKey !== `${playerRow},${playerColumn}`
  ) {
    throw new RangeError('player.activeKey does not match the player position');
  }
  if (player.activeKey !== null && !normalizedDice.some((die) => die.key === player.activeKey)) {
    throw new RangeError('player.activeKey does not reference a die');
  }

  return Object.freeze({
    version: GAME_STATE_VERSION,
    modeId: mode.id,
    session: Object.freeze({
      phase: session.phase,
      modeId: mode.id,
      durationMs: mode.durationMs,
      elapsedMs,
      score: requireSafeInteger(session.score, 'session.score', { min: 0, max: MAX_SCORE }),
      clearedDice: requireSafeInteger(session.clearedDice, 'session.clearedDice', { min: 0, max: MAX_COUNTER }),
      maxChain: requireSafeInteger(session.maxChain, 'session.maxChain', { min: 0, max: MAX_COUNTER }),
      clearEvents: requireSafeInteger(session.clearEvents, 'session.clearEvents', { min: 0, max: MAX_COUNTER }),
      specialOneEvents: requireSafeInteger(session.specialOneEvents, 'session.specialOneEvents', { min: 0, max: MAX_COUNTER })
    }),
    player: Object.freeze({
      row: playerRow,
      column: playerColumn,
      activeKey: player.activeKey,
      rotationY: requireFiniteNumber(player.rotationY, 'player.rotationY', { min: -Math.PI * 2, max: Math.PI * 2 })
    }),
    dice: Object.freeze(normalizedDice),
    diceSequence: requireSafeInteger(source.diceSequence, 'diceSequence', { min: normalizedDice.length, max: MAX_COUNTER }),
    rollCount: requireSafeInteger(source.rollCount, 'rollCount', { min: 0, max: MAX_COUNTER }),
    chainCount: requireSafeInteger(source.chainCount, 'chainCount', { min: 0, max: MAX_COUNTER }),
    clearedCount: requireSafeInteger(source.clearedCount, 'clearedCount', { min: 0, max: MAX_COUNTER }),
    sixtySecondSpawnedCount: requireSafeInteger(
      source.sixtySecondSpawnedCount,
      'sixtySecondSpawnedCount',
      { min: 0, max: 2 }
    ),
    pendingSpawnCount: requireSafeInteger(source.pendingSpawnCount, 'pendingSpawnCount', { min: 0, max: MAX_DICE }),
    spawnBlockedNotified: source.spawnBlockedNotified === true,
    pendingMatchResolution: source.pendingMatchResolution === true,
    randomState: requireSafeInteger(source.randomState, 'randomState', { min: 1, max: 0xffffffff })
  });
}

function normalizePlayTicket(value, displayName, modeId) {
  if (value === null) return null;
  const ticket = requireObject(value, 'playTicket');
  if (!isValidRankingSubmissionId(ticket.submissionId)) {
    throw new TypeError('playTicket.submissionId is invalid');
  }
  if (ticket.displayName !== displayName) {
    throw new RangeError('playTicket.displayName does not match the saved name');
  }
  if (ticket.gameSlug !== RANKING_GAME_SLUGS[modeId]) {
    throw new RangeError('playTicket.gameSlug does not match the saved mode');
  }
  if (ticket.clientVersion !== RANKING_CLIENT_VERSION || !isValidRankingClientVersion(ticket.clientVersion)) {
    throw new RangeError('playTicket.clientVersion is invalid');
  }
  if (ticket.contractVersion !== RANKING_SUBMISSION_CONTRACT_VERSION) {
    throw new RangeError('playTicket.contractVersion is invalid');
  }
  for (const name of ['issuedAt', 'earliestSubmitAt', 'expiresAt']) {
    requireSafeInteger(ticket[name], `playTicket.${name}`, { min: 0 });
  }
  if (!(ticket.issuedAt < ticket.earliestSubmitAt && ticket.earliestSubmitAt < ticket.expiresAt)) {
    throw new RangeError('playTicket time window is invalid');
  }
  return Object.freeze({
    submissionId: ticket.submissionId.toLowerCase(),
    displayName,
    gameSlug: ticket.gameSlug,
    clientVersion: ticket.clientVersion,
    contractVersion: ticket.contractVersion,
    issuedAt: ticket.issuedAt,
    earliestSubmitAt: ticket.earliestSubmitAt,
    expiresAt: ticket.expiresAt
  });
}

export function normalizePersistedGameState(value) {
  const source = requireObject(value, 'persisted game state');
  if (source.version !== GAME_STATE_VERSION) {
    throw new RangeError('persisted game state version is invalid');
  }
  const displayNameResult = validatePlayerName(source.displayName);
  if (!displayNameResult.ok || displayNameResult.name !== source.displayName) {
    throw new TypeError('persisted game state displayName is invalid');
  }

  const game = normalizeGameRuntimeState(source.game);
  return Object.freeze({
    version: GAME_STATE_VERSION,
    savedAt: requireSafeInteger(source.savedAt, 'savedAt', { min: 0 }),
    displayName: source.displayName,
    playTicket: normalizePlayTicket(source.playTicket ?? null, source.displayName, game.modeId),
    game
  });
}

export function serializePersistedGameState(value) {
  const serialized = JSON.stringify(normalizePersistedGameState(value));
  if (serialized.length > MAX_SERIALIZED_CHARACTERS) {
    throw new RangeError('serialized game state is too large');
  }
  return serialized;
}

export function deserializePersistedGameState(serialized) {
  if (typeof serialized !== 'string' || serialized.length === 0) {
    throw new TypeError('serialized game state is invalid');
  }
  if (serialized.length > MAX_SERIALIZED_CHARACTERS) {
    throw new RangeError('serialized game state is too large');
  }
  return normalizePersistedGameState(JSON.parse(serialized));
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(
      transaction.error ?? new Error('game state transaction aborted')
    ), { once: true });
    transaction.addEventListener('error', () => reject(
      transaction.error ?? new Error('game state transaction failed')
    ), { once: true });
  });
}

async function runTransaction(database, mode, action) {
  const transaction = database.transaction(GAME_STATE_OBJECT_STORE, mode);
  const done = transactionDone(transaction);
  try {
    const store = transaction.objectStore(GAME_STATE_OBJECT_STORE);
    const result = await action(store);
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

export class IndexedDbGameStateStorage {
  constructor({ indexedDB = globalThis.indexedDB, databaseName = GAME_STATE_DATABASE_NAME } = {}) {
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
      const request = this.indexedDB.open(this.databaseName, GAME_STATE_DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(GAME_STATE_OBJECT_STORE)) {
          database.createObjectStore(GAME_STATE_OBJECT_STORE, { keyPath: 'key' });
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

  async load() {
    const database = await this.open();
    return runTransaction(database, 'readonly', (store) =>
      requestResult(store.get(GAME_STATE_STORAGE_KEY))
    );
  }

  async save(serialized) {
    const database = await this.open();
    return runTransaction(database, 'readwrite', async (store) => {
      const record = { key: GAME_STATE_STORAGE_KEY, serialized };
      await requestResult(store.put(record));
      return record;
    });
  }

  async clearIfMatch(expectedSerialized = null) {
    const database = await this.open();
    return runTransaction(database, 'readwrite', async (store) => {
      const existing = await requestResult(store.get(GAME_STATE_STORAGE_KEY));
      if (existing === undefined) return { status: 'not-found' };
      if (expectedSerialized !== null && existing.serialized !== expectedSerialized) {
        return { status: 'conflict', record: existing };
      }
      await requestResult(store.delete(GAME_STATE_STORAGE_KEY));
      return { status: 'removed', record: existing };
    });
  }
}

export class LocalStorageGameStateStorage {
  constructor({ localStorage = globalThis.localStorage, storageKey = GAME_STATE_STORAGE_KEY } = {}) {
    if (!localStorage || typeof localStorage.getItem !== 'function') {
      throw new TypeError('localStorage is unavailable');
    }
    this.localStorage = localStorage;
    this.storageKey = storageKey;
  }

  async load() {
    const serialized = this.localStorage.getItem(this.storageKey);
    return serialized === null ? undefined : { key: this.storageKey, serialized };
  }

  async save(serialized) {
    this.localStorage.setItem(this.storageKey, serialized);
    return { key: this.storageKey, serialized };
  }

  async clearIfMatch(expectedSerialized = null) {
    const existingSerialized = this.localStorage.getItem(this.storageKey);
    if (existingSerialized === null) return { status: 'not-found' };
    if (expectedSerialized !== null && existingSerialized !== expectedSerialized) {
      return { status: 'conflict', record: { key: this.storageKey, serialized: existingSerialized } };
    }
    this.localStorage.removeItem(this.storageKey);
    return { status: 'removed', record: { key: this.storageKey, serialized: existingSerialized } };
  }
}

export class FallbackGameStateStorage {
  constructor({ primary, fallback } = {}) {
    for (const [name, storage] of [['primary', primary], ['fallback', fallback]]) {
      if (!storage
        || typeof storage.load !== 'function'
        || typeof storage.save !== 'function'
        || typeof storage.clearIfMatch !== 'function') {
        throw new TypeError(`${name} storage is invalid`);
      }
    }
    this.primary = primary;
    this.fallback = fallback;
    this.usingFallback = false;
    this.primaryError = null;
  }

  async load() {
    if (this.usingFallback) return this.fallback.load();
    try {
      return await this.primary.load();
    } catch (error) {
      this.usingFallback = true;
      this.primaryError = error;
      return this.fallback.load();
    }
  }

  async save(serialized) {
    if (this.usingFallback) return this.fallback.save(serialized);
    try {
      return await this.primary.save(serialized);
    } catch (error) {
      this.usingFallback = true;
      this.primaryError = error;
      return this.fallback.save(serialized);
    }
  }

  async clearIfMatch(expectedSerialized = null) {
    if (this.usingFallback) return this.fallback.clearIfMatch(expectedSerialized);
    try {
      return await this.primary.clearIfMatch(expectedSerialized);
    } catch (error) {
      this.usingFallback = true;
      this.primaryError = error;
      const result = await this.fallback.clearIfMatch(expectedSerialized);
      if (result.status === 'not-found') {
        return { status: 'unavailable', error };
      }
      return result;
    }
  }
}

function createDefaultAdapter() {
  let fallback = null;
  try {
    if (globalThis.localStorage) fallback = new LocalStorageGameStateStorage();
  } catch {
    fallback = null;
  }

  try {
    if (globalThis.indexedDB) {
      const primary = new IndexedDbGameStateStorage();
      return fallback
        ? new FallbackGameStateStorage({ primary, fallback })
        : primary;
    }
  } catch {
    // Fall through to localStorage when IndexedDB is unavailable.
  }
  return fallback;
}

export class GameStateStorage {
  constructor({ adapter = createDefaultAdapter() } = {}) {
    this.adapter = adapter;
  }

  get available() {
    return Boolean(this.adapter);
  }

  async load() {
    if (!this.adapter) return Object.freeze({ status: 'unavailable' });
    let record = null;
    try {
      record = await this.adapter.load();
    } catch (error) {
      return Object.freeze({ status: 'unavailable', error });
    }
    if (!record) return Object.freeze({ status: 'empty' });
    try {
      const state = deserializePersistedGameState(record.serialized);
      return Object.freeze({ status: 'available', state, serialized: record.serialized });
    } catch (error) {
      return Object.freeze({
        status: 'invalid',
        error,
        serialized: record?.serialized ?? null
      });
    }
  }

  async save(state) {
    if (!this.adapter) return Object.freeze({ ok: false, code: 'storage-unavailable' });
    const serialized = serializePersistedGameState(state);
    try {
      await this.adapter.save(serialized);
    } catch (error) {
      return Object.freeze({ ok: false, code: 'storage-unavailable', error });
    }
    return Object.freeze({ ok: true, serialized });
  }

  async clear({ expectedSerialized = null } = {}) {
    if (!this.adapter) return Object.freeze({ status: 'unavailable' });
    try {
      return await this.adapter.clearIfMatch(expectedSerialized);
    } catch (error) {
      return Object.freeze({ status: 'unavailable', error });
    }
  }
}
