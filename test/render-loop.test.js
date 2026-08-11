import test from 'node:test';
import assert from 'node:assert/strict';

import { RenderLoopController } from '../js/render-loop.js';

function createHarness() {
  let nextFrameId = 0;
  let allowed = true;
  let frameCount = 0;
  const callbacks = new Map();
  const loop = new RenderLoopController({
    requestFrame: (callback) => {
      const frameId = ++nextFrameId;
      callbacks.set(frameId, callback);
      return frameId;
    },
    cancelFrame: (frameId) => {
      callbacks.delete(frameId);
    },
    shouldRun: () => allowed,
    onFrame: () => {
      frameCount += 1;
    }
  });

  return {
    callbacks,
    get frameCount() {
      return frameCount;
    },
    loop,
    setAllowed(value) {
      allowed = value;
    },
    runNextFrame() {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (frameId === undefined) return false;
      callbacks.delete(frameId);
      callback();
      return true;
    }
  };
}

test('有効化しても描画予約は常に1本だけになる', () => {
  const harness = createHarness();

  harness.loop.setEnabled(true);
  harness.loop.refresh();
  harness.loop.setEnabled(true);

  assert.equal(harness.callbacks.size, 1);
  assert.deepEqual(harness.loop.getSnapshot(), {
    enabled: true,
    scheduled: true
  });
});

test('1フレームの完了後だけ次の1本を予約する', () => {
  const harness = createHarness();
  harness.loop.setEnabled(true);

  assert.equal(harness.runNextFrame(), true);
  assert.equal(harness.frameCount, 1);
  assert.equal(harness.callbacks.size, 1);
});

test('非表示中は予約を取り消し、復帰時に1本だけ再開する', () => {
  const harness = createHarness();
  harness.loop.setEnabled(true);
  assert.equal(harness.callbacks.size, 1);

  harness.setAllowed(false);
  harness.loop.refresh();
  assert.equal(harness.callbacks.size, 0);

  harness.setAllowed(true);
  harness.loop.refresh();
  harness.loop.refresh();
  assert.equal(harness.callbacks.size, 1);
});

test('無効化すると保留中の予約を取り消し、復帰しても自動再開しない', () => {
  const harness = createHarness();
  harness.loop.setEnabled(true);
  harness.loop.setEnabled(false);

  assert.equal(harness.callbacks.size, 0);
  assert.deepEqual(harness.loop.getSnapshot(), {
    enabled: false,
    scheduled: false
  });

  harness.setAllowed(true);
  harness.loop.refresh();
  assert.equal(harness.callbacks.size, 0);
});
