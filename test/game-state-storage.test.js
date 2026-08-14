import test from 'node:test';
import assert from 'node:assert/strict';

import { indexedDB } from 'fake-indexeddb';

import {
  deserializePersistedGameState,
  FallbackGameStateStorage,
  GAME_STATE_VERSION,
  GameStateStorage,
  IndexedDbGameStateStorage,
  LocalStorageGameStateStorage,
  serializePersistedGameState
} from '../js/game-state-storage.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

function createDie({ id, row, column, top = 1 } = {}) {
  const orientations = {
    1: { top: 1, bottom: 6, front: 2, back: 5, left: 3, right: 4 },
    2: { top: 2, bottom: 5, front: 6, back: 1, left: 3, right: 4 },
    3: { top: 3, bottom: 4, front: 2, back: 5, left: 6, right: 1 }
  };
  return {
    id,
    key: `${row},${column}`,
    row,
    column,
    state: 'normal',
    ...orientations[top],
    positionY: 0.52,
    scale: 1,
    quaternion: [0, 0, 0, 1],
    sinkElapsedMs: 0,
    riseElapsedMs: 0,
    riseStartY: -0.66
  };
}

function createState(overrides = {}) {
  const game = {
    version: GAME_STATE_VERSION,
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    session: {
      phase: 'running',
      modeId: GAME_MODE_IDS.SIXTY_SECONDS,
      durationMs: 60_000,
      elapsedMs: 1_234,
      score: 900,
      clearedDice: 3,
      maxChain: 1,
      clearEvents: 1,
      specialOneEvents: 0
    },
    player: { row: 3, column: 3, activeKey: '3,3', rotationY: 0 },
    dice: [createDie({ id: 'die-1', row: 3, column: 3, top: 3 }), createDie({ id: 'die-2', row: 2, column: 3, top: 2 })],
    diceSequence: 2,
    rollCount: 1,
    chainCount: 1,
    clearedCount: 3,
    sixtySecondSpawnedCount: 0,
    pendingSpawnCount: 0,
    spawnBlockedNotified: false,
    pendingMatchResolution: false,
    randomState: 0x12345678
  };
  return {
    version: GAME_STATE_VERSION,
    savedAt: 1_785_000_000_000,
    displayName: 'プレイヤー',
    playTicket: {
      submissionId: '11111111-1111-4111-8111-111111111111',
      displayName: 'プレイヤー',
      gameSlug: 'sainome_60_seconds',
      clientVersion: 'sainome-web-2',
      contractVersion: 'sainome-play-v2',
      issuedAt: 1_785_000_000_000,
      earliestSubmitAt: 1_785_000_063_000,
      expiresAt: 1_785_086_400_000
    },
    game: { ...game, ...overrides, session: { ...game.session, ...overrides.session } }
  };
}

function deleteDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener('blocked', () => reject(new Error('game state database deletion blocked')), { once: true });
  });
}

test('ゲーム状態を版付きで正規化し、盤面とプレイ番号を保持する', () => {
  const serialized = serializePersistedGameState(createState());
  const restored = deserializePersistedGameState(serialized);

  assert.equal(restored.version, GAME_STATE_VERSION);
  assert.equal(restored.game.dice[0].top, 3);
  assert.equal(restored.game.player.activeKey, '3,3');
  assert.equal(restored.playTicket.submissionId, '11111111-1111-4111-8111-111111111111');
});

test('未知版、重複位置、面の矛盾は復元しない', () => {
  assert.throws(
    () => serializePersistedGameState(createState({ version: 99 })),
    /version/
  );

  assert.throws(
    () => serializePersistedGameState({
      ...createState(),
      game: {
        ...createState().game,
        dice: [createDie({ id: 'die-1', row: 3, column: 3 }), createDie({ id: 'die-2', row: 3, column: 3 })]
      }
    }),
    /positions/
  );

  assert.throws(
    () => serializePersistedGameState({
      ...createState(),
      game: {
        ...createState().game,
        dice: [{ ...createDie({ id: 'die-1', row: 3, column: 3 }), bottom: 4 }, createDie({ id: 'die-2', row: 2, column: 3 })]
      }
    }),
    /orientation/
  );

  assert.throws(
    () => serializePersistedGameState({
      ...createState(),
      game: {
        ...createState().game,
        player: { row: 3, column: 3, activeKey: '2,3', rotationY: 0 }
      }
    }),
    /player\.activeKey/
  );
});

test('IndexedDBへ保存した状態を再読み込みし、完全一致時だけ削除する', async () => {
  const databaseName = `sainome-game-state-test-${process.pid}-${Date.now()}`;
  const adapter = new IndexedDbGameStateStorage({ indexedDB, databaseName });
  const storage = new GameStateStorage({ adapter });
  const state = createState();
  try {
    const saved = await storage.save(state);
    assert.equal(saved.ok, true);
    const loaded = await storage.load();
    assert.equal(loaded.status, 'available');
    assert.deepEqual(loaded.state.game, deserializePersistedGameState(saved.serialized).game);

    const conflict = await storage.clear({ expectedSerialized: `${saved.serialized}-changed` });
    assert.equal(conflict.status, 'conflict');
    assert.equal((await storage.load()).status, 'available');

    const removed = await storage.clear({ expectedSerialized: saved.serialized });
    assert.equal(removed.status, 'removed');
    assert.equal((await storage.load()).status, 'empty');
  } finally {
    const database = adapter.databasePromise ? await adapter.databasePromise : null;
    database?.close();
    await deleteDatabase(databaseName);
  }
});

test('壊れたIndexedDB保存値は削除せず無効状態として返す', async () => {
  const databaseName = `sainome-game-state-invalid-${process.pid}-${Date.now()}`;
  const adapter = new IndexedDbGameStateStorage({ indexedDB, databaseName });
  const storage = new GameStateStorage({ adapter });
  try {
    await adapter.save('{"version":99}');
    const loaded = await storage.load();
    assert.equal(loaded.status, 'invalid');
    const raw = await adapter.load();
    assert.equal(raw.serialized, '{"version":99}');
  } finally {
    const database = adapter.databasePromise ? await adapter.databasePromise : null;
    database?.close();
    await deleteDatabase(databaseName);
  }
});

test('保存領域のI/O失敗は破損データと区別して扱う', async () => {
  const failure = new Error('storage unavailable');
  const storage = new GameStateStorage({
    adapter: {
      async load() { throw failure; },
      async save() { throw failure; },
      async clearIfMatch() { throw failure; }
    }
  });

  assert.equal((await storage.load()).status, 'unavailable');
  assert.equal((await storage.save(createState())).code, 'storage-unavailable');
  assert.equal((await storage.clear()).status, 'unavailable');
});

test('IndexedDBの実行時失敗後はlocalStorageへ切り替えて保存と復元を続ける', async () => {
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const fallback = new LocalStorageGameStateStorage({ localStorage });
  const failure = new Error('IndexedDB open failed');
  const primary = {
    async load() { throw failure; },
    async save() { throw failure; },
    async clearIfMatch() { throw failure; }
  };
  const storage = new GameStateStorage({
    adapter: new FallbackGameStateStorage({ primary, fallback })
  });
  const state = createState();

  assert.equal((await storage.load()).status, 'unavailable');
  const saved = await storage.save(state);
  assert.equal(saved.ok, false);
  assert.equal(saved.code, 'storage-unavailable');
  assert.equal((await storage.load()).status, 'unavailable');
});

test('保存先の復旧前は、空のlocalStorageを保存なしとみなさない', async () => {
  const values = new Map();
  const fallback = new LocalStorageGameStateStorage({
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    }
  });
  let primaryAvailable = false;
  const primary = {
    async load() {
      if (!primaryAvailable) throw new Error('IndexedDB unavailable');
      return undefined;
    },
    async save() { throw new Error('IndexedDB unavailable'); },
    async clearIfMatch() { throw new Error('IndexedDB unavailable'); }
  };
  const storage = new GameStateStorage({
    adapter: new FallbackGameStateStorage({ primary, fallback })
  });

  assert.equal((await storage.load()).status, 'unavailable');
  primaryAvailable = true;
  assert.equal((await storage.load()).status, 'empty');
});

test('IndexedDBが失敗しlocalStorageにも対象がない削除は成功扱いにしない', async () => {
  const fallback = new LocalStorageGameStateStorage({
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  });
  const primary = {
    async load() { throw new Error('IndexedDB unavailable'); },
    async save() { throw new Error('IndexedDB unavailable'); },
    async clearIfMatch() { throw new Error('IndexedDB unavailable'); }
  };
  const storage = new GameStateStorage({
    adapter: new FallbackGameStateStorage({ primary, fallback })
  });

  const result = await storage.clear({ expectedSerialized: 'saved-state' });
  assert.equal(result.status, 'unavailable');
});


test('IndexedDBへの保存失敗時は保存対象をlocalStorageへ退避する', async () => {
  const values = new Map();
  const fallback = new LocalStorageGameStateStorage({
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    }
  });
  const primary = {
    async load() { throw new Error('IndexedDB unavailable'); },
    async save() { throw new Error('IndexedDB unavailable'); },
    async clearIfMatch() { throw new Error('IndexedDB unavailable'); }
  };
  const storage = new GameStateStorage({
    adapter: new FallbackGameStateStorage({ primary, fallback })
  });
  const saved = await storage.save(createState());

  assert.equal(saved.ok, true);
  assert.equal((await storage.load()).status, 'available');
  const removed = await storage.clear({ expectedSerialized: saved.serialized });
  assert.equal(removed.status, 'removed');
  assert.equal((await storage.load()).status, 'unavailable');
});
