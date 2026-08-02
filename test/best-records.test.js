import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEST_OUTCOMES,
  BEST_RECORDS_STORAGE_KEY,
  BestRecords,
  describeBestOutcome
} from '../js/best-records.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    read: (key) => values.get(key) ?? null
  };
}

test('初回記録を保存し、表示用の結果を返す', () => {
  const storage = memoryStorage();
  const records = new BestRecords({ storage });

  const outcome = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 1200
  });

  assert.equal(outcome.status, BEST_OUTCOMES.FIRST);
  assert.equal(outcome.previousBest, null);
  assert.equal(outcome.bestScore, 1200);
  assert.equal(outcome.persisted, true);
  assert.equal(describeBestOutcome(outcome), '初回記録');

  const saved = JSON.parse(storage.read(BEST_RECORDS_STORAGE_KEY));
  assert.equal(saved.version, 1);
  assert.equal(saved.records[GAME_MODE_IDS.SIXTY_SECONDS].score, 1200);
});

test('60秒と180秒の自己ベストを分ける', () => {
  const records = new BestRecords({ storage: memoryStorage() });

  records.recordResult({ modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 800 });
  records.recordResult({ modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS, score: 4200 });

  assert.equal(records.getBest(GAME_MODE_IDS.SIXTY_SECONDS), 800);
  assert.equal(records.getBest(GAME_MODE_IDS.ONE_EIGHTY_SECONDS), 4200);
});

test('自己ベスト更新時は増加分を返す', () => {
  const records = new BestRecords({ storage: memoryStorage() });
  records.recordResult({ modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 1000 });

  const outcome = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 1450
  });

  assert.equal(outcome.status, BEST_OUTCOMES.NEW);
  assert.equal(outcome.previousBest, 1000);
  assert.equal(outcome.bestScore, 1450);
  assert.equal(outcome.difference, 450);
  assert.equal(describeBestOutcome(outcome), '自己ベスト更新！ +450点');
});

test('同点と未達では保存済みベストを上書きしない', () => {
  const storage = memoryStorage();
  const records = new BestRecords({ storage });
  records.recordResult({ modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 1500 });
  const savedBefore = storage.read(BEST_RECORDS_STORAGE_KEY);

  const tied = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 1500
  });
  const lower = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 900
  });

  assert.equal(tied.status, BEST_OUTCOMES.TIE);
  assert.equal(describeBestOutcome(tied), '自己ベストと同点');
  assert.equal(lower.status, BEST_OUTCOMES.LOWER);
  assert.equal(lower.difference, 600);
  assert.equal(describeBestOutcome(lower), '自己ベストまであと600点');
  assert.equal(records.getBest(GAME_MODE_IDS.SIXTY_SECONDS), 1500);
  assert.equal(storage.read(BEST_RECORDS_STORAGE_KEY), savedBefore);
});

test('壊れた項目だけを無視し、正しい別モードの記録を復元する', () => {
  const storage = memoryStorage({
    [BEST_RECORDS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      records: {
        [GAME_MODE_IDS.SIXTY_SECONDS]: { score: 'broken' },
        [GAME_MODE_IDS.ONE_EIGHTY_SECONDS]: { score: 5000 },
        'unknown-mode': { score: 999999 }
      }
    })
  });
  const records = new BestRecords({ storage });

  assert.equal(records.getBest(GAME_MODE_IDS.SIXTY_SECONDS), null);
  assert.equal(records.getBest(GAME_MODE_IDS.ONE_EIGHTY_SECONDS), 5000);
});

test('保存を拒否されても現在のプレイ中は自己ベストを保持する', () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); }
  };
  const records = new BestRecords({ storage });

  const first = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 700
  });
  const lower = records.recordResult({
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 500
  });

  assert.equal(first.persisted, false);
  assert.equal(lower.bestScore, 700);
  assert.equal(lower.persisted, false);
  assert.equal(records.getBest(GAME_MODE_IDS.SIXTY_SECONDS), 700);
});

test('不正なモードと得点を記録しない', () => {
  const records = new BestRecords({ storage: memoryStorage() });

  assert.throws(
    () => records.recordResult({ modeId: 'unknown', score: 100 }),
    /Unknown game mode/
  );
  assert.throws(
    () => records.recordResult({
      modeId: GAME_MODE_IDS.SIXTY_SECONDS,
      score: Number.NaN
    }),
    /score/
  );
});
