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

const MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;

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
    modeId: MODE_ID,
    session: {
      phase: 'running',
      modeId: MODE_ID,
      durationMs: 300_000,
      elapsedMs: 1_234,
      score: 900,
      clearedDice: 3,
      maxChain: 1,
      clearEvents: 1,
      specialOneEvents: 0
    },
    player: { row: 3, column: 3, activeKey: '3,3', rotationY: 0 },
    dice: [
      createDie({ id: 'die-1', row: 3, column: 3, top: 3 }),
      createDie({ id: 'die-2', row: 2, column: 3, top: 2 })
    ],
    diceSequence: 2,
    rollCount: 1,
    chainCount: 1,
    clearedCount: 3,
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
      gameSlug: 'sainome_300_seconds',
      clientVersion: 'sainome-web-3',
      contractVersion: 'sainome-play-v2',
      issuedAt: 1_785_000_000_000,
      earliestSubmitAt: 1_785_000_303_000,
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
  assert.equal(restored.game.modeId, MODE_ID);
  assert.equal(restored.game.dice[0].top, 3);
  assert.equal(restored.game.player.activeKey, '3,3');
  assert.equal(restored.playTicket.gameSlug, 'sainome_300_seconds');
  assert.equal(restored.playTicket.submissionId, '11111111-1111-4111-8111-111111111111');
  assert.equal(restored.game.session.maxChain, 0);
  assert.equal(restored.game.chainCount, 0);
});

test('廃止モードの保存状態は復元しない', () => {
  const legacy = createState({
    modeId: '60-seconds',
    session: { modeId: '60-seconds', durationMs: 60_000 }
  });
  assert.throws(() => serializePersistedGameState(legacy), /Unknown game mode/);
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
        dice: [
          createDie({ id: 'die-1', row: 3, column: 3 }),
          createDie({ id: 'die-2', row: 3, column: 3 })
        ]
      }
    }),
    /positions/
  );

  assert.throws(
    () => serializePersistedGameState({
      ...createState(),
      game: {
        ...createState().game,
        dice: [
          { ...createDie({ id: 'die-1', row: 3, column: 3 }), bottom: 4 },
          createDie({ id: 'die-2', row: 2, column: 3 })
        ]
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

  assert.equal((await storage.load()).status, 'unavailable');
  const saved = await storage.save(createState());
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


test('guest consent stays blank through persisted game recovery', () => {
  const state = { ...createState(), displayName: '', playTicket: null };
  const recovered = deserializePersistedGameState(serializePersistedGameState(state));
  assert.equal(recovered.displayName, '');
  assert.deepEqual(recovered.game, deserializePersistedGameState(serializePersistedGameState(createState())).game);
});

test('active state retains its new receipt identity and keeps old/guest saves without minting an ID',async()=>{
 const {captureRankingRun}=await import('../js/ranking-run.js');
 const state=createState();state.playTicket=null;state.rankingRun=captureRankingRun(state.displayName,MODE_ID);
 const restored=deserializePersistedGameState(serializePersistedGameState(state));
 assert.deepEqual(restored.rankingRun,state.rankingRun);
 delete state.rankingRun;
 assert.equal(deserializePersistedGameState(serializePersistedGameState(state)).rankingRun,null);
 state.displayName='';
 assert.equal(deserializePersistedGameState(serializePersistedGameState(state)).rankingRun,null);
});

function localStorageFixture(entries = []) {
  const values = new Map(entries);
  return { values, storage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  } };
}

test('local fallback saves and clears only Sainome, preserving another game legacy key', async () => {
  const foreign = '{"game":"another-game","score":42}';
  const {values, storage:localStorage} = localStorageFixture([['active-play', foreign]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  assert.equal(await adapter.load(), undefined);
  const serialized = serializePersistedGameState(createState());
  await adapter.save(serialized);
  assert.equal(values.get('active-play'), foreign);
  assert.equal((await adapter.load()).serialized, serialized);
  assert.equal((await adapter.clearIfMatch(serialized)).status, 'removed');
  assert.equal(values.get('active-play'), foreign);
  assert.equal(await adapter.load(), undefined);
});

test('valid legacy Sainome state is copied unchanged and not resurrected after acceptance', async () => {
  const serialized = serializePersistedGameState(createState());
  const {values, storage:localStorage} = localStorageFixture([['active-play', serialized]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  assert.equal((await adapter.load()).serialized, serialized);
  assert.equal(values.get('active-play'), serialized);
  assert.equal((await adapter.clearIfMatch(serialized)).status, 'removed');
  assert.equal(values.get('active-play'), serialized);
  assert.equal(await new LocalStorageGameStateStorage({localStorage}).load(), undefined);
});

test('new fallback state wins over legacy and a stale acceptance cannot clear it', async () => {
  const old = serializePersistedGameState(createState());
  const next = serializePersistedGameState(createState({session:{score:1234}}));
  const {values, storage:localStorage} = localStorageFixture([['active-play', old]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  await adapter.load();
  await adapter.save(next);
  assert.equal((await adapter.clearIfMatch(old)).status, 'conflict');
  assert.equal((await adapter.load()).serialized, next);
  assert.equal(values.get('active-play'), old);
});

test('failed migration or tombstone writes preserve original and current recoverable state', async () => {
  const old = serializePersistedGameState(createState());
  const {values, storage:localStorage} = localStorageFixture([['active-play', old]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  const set = localStorage.setItem;
  localStorage.setItem = () => {throw new Error('quota');};
  await assert.rejects(adapter.load(), /quota/);
  assert.equal(values.get('active-play'), old);
  localStorage.setItem = set;
  await adapter.load();
  localStorage.setItem = () => {throw new Error('quota');};
  await assert.rejects(adapter.clearIfMatch(old), /quota/);
  assert.equal((await adapter.load()).serialized, old);
  assert.equal(values.get('active-play'), old);
});

test('schema-compatible legacy state without explicit Sainome identity is preserved, never adopted', async () => {
  const state = createState(); state.playTicket = null;
  const legacy = serializePersistedGameState(state);
  const {values, storage:localStorage} = localStorageFixture([['active-play', legacy]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  assert.equal(await adapter.load(), undefined);
  assert.deepEqual([...values], [['active-play', legacy]]);
});

test('failed removal after import-disable marker keeps new save and never mutates legacy', async () => {
  const legacy = serializePersistedGameState(createState());
  const {values, storage:localStorage} = localStorageFixture([['active-play', legacy]]);
  const adapter = new LocalStorageGameStateStorage({localStorage});
  await adapter.load();
  localStorage.removeItem = () => {throw new Error('SecurityError');};
  await assert.rejects(adapter.clearIfMatch(legacy), /SecurityError/);
  assert.equal((await new LocalStorageGameStateStorage({localStorage}).load()).serialized, legacy);
  assert.equal(values.get('active-play'), legacy);
});

test('corrupt namespaced data is surfaced rather than silently replaced by legacy', async () => {
  const legacy = serializePersistedGameState(createState());
  const {values, storage:localStorage} = localStorageFixture([
    ['active-play', legacy], ['sainome.active-play.v1', '{broken']
  ]);
  const storage = new GameStateStorage({adapter:new LocalStorageGameStateStorage({localStorage})});
  assert.equal((await storage.load()).status, 'invalid');
  assert.equal(values.get('active-play'), legacy);
  assert.equal(values.get('sainome.active-play.v1'), '{broken');
});

test('explicit custom local storage key never imports or marks the generic legacy key', async () => {
  const legacy = serializePersistedGameState(createState());
  const {values, storage:localStorage} = localStorageFixture([['active-play', legacy]]);
  const adapter = new LocalStorageGameStateStorage({localStorage, storageKey:'custom-game'});
  assert.equal(await adapter.load(), undefined);
  await adapter.save('custom state');
  assert.equal((await adapter.clearIfMatch('custom state')).status, 'removed');
  assert.deepEqual([...values], [['active-play', legacy]]);
});
