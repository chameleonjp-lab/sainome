import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEST_OUTCOMES,
  BEST_RECORDS_STORAGE_KEY,
  BestRecords,
  describeBestOutcome
} from '../js/best-records.js';
import { GAME_MODE_IDS } from '../js/game-modes.js';

const MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;

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

  const outcome = records.recordResult({ modeId: MODE_ID, score: 1200 });

  assert.equal(outcome.status, BEST_OUTCOMES.FIRST);
  assert.equal(outcome.previousBest, null);
  assert.equal(outcome.bestScore, 1200);
  assert.equal(outcome.persisted, true);
  assert.equal(describeBestOutcome(outcome), '初回記録');

  const saved = JSON.parse(storage.read(BEST_RECORDS_STORAGE_KEY));
  assert.equal(saved.version, 1);
  assert.equal(saved.records[MODE_ID].score, 1200);
});

test('自己ベスト更新時は増加分を返す', () => {
  const records = new BestRecords({ storage: memoryStorage() });
  records.recordResult({ modeId: MODE_ID, score: 1000 });

  const outcome = records.recordResult({ modeId: MODE_ID, score: 1450 });

  assert.equal(outcome.status, BEST_OUTCOMES.NEW);
  assert.equal(outcome.previousBest, 1000);
  assert.equal(outcome.bestScore, 1450);
  assert.equal(outcome.difference, 450);
  assert.equal(describeBestOutcome(outcome), '自己ベスト更新！ +450点');
});

test('同点と未達では保存済みベストを上書きしない', () => {
  const storage = memoryStorage();
  const records = new BestRecords({ storage });
  records.recordResult({ modeId: MODE_ID, score: 1500 });
  const savedBefore = storage.read(BEST_RECORDS_STORAGE_KEY);

  const tied = records.recordResult({ modeId: MODE_ID, score: 1500 });
  const lower = records.recordResult({ modeId: MODE_ID, score: 900 });

  assert.equal(tied.status, BEST_OUTCOMES.TIE);
  assert.equal(describeBestOutcome(tied), '自己ベストと同点');
  assert.equal(lower.status, BEST_OUTCOMES.LOWER);
  assert.equal(lower.difference, 600);
  assert.equal(describeBestOutcome(lower), '自己ベストまであと600点');
  assert.equal(records.getBest(MODE_ID), 1500);
  assert.equal(storage.read(BEST_RECORDS_STORAGE_KEY), savedBefore);
});

test('廃止モードと壊れた項目を無視し、300秒記録だけを復元する', () => {
  const storage = memoryStorage({
    [BEST_RECORDS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      records: {
        '60-seconds': { score: 9999 },
        '180-seconds': { score: 8888 },
        [MODE_ID]: { score: 5000 },
        'unknown-mode': { score: 7777 }
      }
    })
  });
  const records = new BestRecords({ storage });

  assert.equal(records.getBest(MODE_ID), 5000);
  assert.throws(() => records.getBest('60-seconds'), /Unknown game mode/);
  assert.throws(() => records.getBest('180-seconds'), /Unknown game mode/);
});

test('壊れたJSONと安全に扱えない数値を記録として使わない', () => {
  const malformed = new BestRecords({
    storage: memoryStorage({ [BEST_RECORDS_STORAGE_KEY]: '{broken' })
  });
  assert.equal(malformed.getBest(MODE_ID), null);

  const unsafe = new BestRecords({
    storage: memoryStorage({
      [BEST_RECORDS_STORAGE_KEY]: JSON.stringify({
        version: 1,
        records: {
          [MODE_ID]: { score: Number.MAX_VALUE }
        }
      })
    })
  });
  assert.equal(unsafe.getBest(MODE_ID), null);
});

test('複数タブ相当の古い状態から保存しても高い記録を失わない', () => {
  const storage = memoryStorage();
  const firstTab = new BestRecords({ storage });
  const secondTab = new BestRecords({ storage });

  firstTab.recordResult({ modeId: MODE_ID, score: 1600 });
  const lowerFromSecondTab = secondTab.recordResult({ modeId: MODE_ID, score: 1200 });
  const higherFromSecondTab = secondTab.recordResult({ modeId: MODE_ID, score: 4800 });

  const restored = new BestRecords({ storage });
  assert.equal(lowerFromSecondTab.status, BEST_OUTCOMES.LOWER);
  assert.equal(lowerFromSecondTab.bestScore, 1600);
  assert.equal(higherFromSecondTab.status, BEST_OUTCOMES.NEW);
  assert.equal(restored.getBest(MODE_ID), 4800);
});

test('保存を拒否されても現在のプレイ中は自己ベストを保持する', () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); }
  };
  const records = new BestRecords({ storage });

  const first = records.recordResult({ modeId: MODE_ID, score: 700 });
  const lower = records.recordResult({ modeId: MODE_ID, score: 500 });

  assert.equal(first.persisted, false);
  assert.equal(lower.bestScore, 700);
  assert.equal(lower.persisted, false);
  assert.equal(records.getBest(MODE_ID), 700);
});

test('不正なモードと得点を記録しない', () => {
  const records = new BestRecords({ storage: memoryStorage() });

  assert.throws(
    () => records.recordResult({ modeId: 'unknown', score: 100 }),
    /Unknown game mode/
  );
  assert.throws(
    () => records.recordResult({ modeId: MODE_ID, score: Number.NaN }),
    /score/
  );
  assert.throws(
    () => records.recordResult({ modeId: MODE_ID, score: 1.5 }),
    /score/
  );
});
