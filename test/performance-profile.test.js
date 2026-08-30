import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPerformanceProfile,
  isTouchPerformanceTarget
} from '../js/performance-profile.js';

test('標準環境は従来の時間と描画品質を使う', () => {
  const profile = getPerformanceProfile({
    isTouch: false
  });

  assert.deepEqual(profile.actionTimings, {
    rollMs: 280,
    hopMs: 210,
    walkMs: 170,
    stepDownMs: 230
  });
  assert.equal(profile.pixelRatioCap, 2);
  assert.equal(profile.antialias, true);
  assert.equal(profile.shadows, true);
});

test('タッチ環境は移動時間と描画負荷を下げる', () => {
  const profile = getPerformanceProfile({
    isTouch: true
  });

  assert.deepEqual(profile.actionTimings, {
    rollMs: 215,
    hopMs: 155,
    walkMs: 125,
    stepDownMs: 165
  });
  assert.equal(profile.pixelRatioCap, 1.5);
  assert.equal(profile.antialias, false);
  assert.equal(profile.shadows, false);
});

test('タッチ点数または粗いポインターを検出できる', () => {
  assert.equal(isTouchPerformanceTarget({
    navigatorObject: { maxTouchPoints: 1 },
    matchMedia: () => ({ matches: false })
  }), true);
  assert.equal(isTouchPerformanceTarget({
    navigatorObject: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: true })
  }), true);
  assert.equal(isTouchPerformanceTarget({
    navigatorObject: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false })
  }), false);
});
