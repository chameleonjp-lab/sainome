import test from 'node:test';
import assert from 'node:assert/strict';

import { SimulationPause } from '../js/simulation-pause.js';

test('描画停止中の時間を一度だけ数える', () => {
  const pause = new SimulationPause();

  pause.begin(100);
  pause.begin(150);

  assert.equal(pause.getPausedDuration(350), 250);
  assert.deepEqual(pause.end(400), { paused: false, pausedMs: 300 });
  assert.equal(pause.getPausedDuration(500), 300);
});

test('表示停止と描画停止が重なっても二重に加算しない', () => {
  const pause = new SimulationPause();

  pause.sync(true, 100);
  pause.sync(true, 200);
  pause.sync(false, 450);

  assert.equal(pause.getPausedDuration(500), 350);
});

test('時刻が戻っても停止時間を負にしない', () => {
  const pause = new SimulationPause();

  pause.begin(500);
  pause.end(400);

  assert.equal(pause.getPausedDuration(450), 0);
});

test('不正な時刻を受け付けない', () => {
  const pause = new SimulationPause();

  assert.throws(() => pause.begin(Number.NaN), /now must be finite/);
  assert.throws(() => pause.getPausedDuration(Infinity), /now must be finite/);
});
