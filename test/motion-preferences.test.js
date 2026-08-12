import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MotionPreferences,
  REDUCED_MOTION_MEDIA_QUERY
} from '../js/motion-preferences.js';

function createMediaQueryList(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener(type, listener) {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'change') listeners.delete(listener);
    },
    change(nextMatches) {
      this.matches = nextMatches;
      for (const listener of listeners) listener({ matches: nextMatches });
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

test('端末の動きを減らす設定を初期値として読み取る', () => {
  const mediaQueryList = createMediaQueryList(true);
  let requestedQuery = null;
  const preferences = new MotionPreferences({
    matchMedia: (query) => {
      requestedQuery = query;
      return mediaQueryList;
    }
  });
  const values = [];

  preferences.subscribe((reducedMotion) => values.push(reducedMotion));

  assert.equal(requestedQuery, REDUCED_MOTION_MEDIA_QUERY);
  assert.equal(preferences.reducedMotion, true);
  assert.deepEqual(values, [true]);
});

test('端末設定の変更を購読者へ通知し、同じ値では通知しない', () => {
  const mediaQueryList = createMediaQueryList(false);
  const preferences = new MotionPreferences({
    matchMedia: () => mediaQueryList
  });
  const values = [];
  preferences.subscribe((reducedMotion) => values.push(reducedMotion));

  mediaQueryList.change(true);
  mediaQueryList.change(true);
  mediaQueryList.change(false);

  assert.deepEqual(values, [false, true, false]);
  assert.equal(preferences.reducedMotion, false);
});

test('matchMediaが使えない環境でもゲームを止めず、後から購読解除できる', () => {
  const preferences = new MotionPreferences({ matchMedia: null });
  let calls = 0;
  const unsubscribe = preferences.subscribe(() => {
    calls += 1;
  });

  assert.equal(preferences.reducedMotion, false);
  assert.equal(calls, 1);
  unsubscribe();
  preferences.update(true);
  assert.equal(calls, 1);
});

test('監視解除後は端末設定の変更を受け付けない', () => {
  const mediaQueryList = createMediaQueryList(false);
  const preferences = new MotionPreferences({
    matchMedia: () => mediaQueryList
  });

  preferences.dispose();
  mediaQueryList.change(true);

  assert.equal(mediaQueryList.listenerCount(), 0);
  assert.equal(preferences.reducedMotion, false);
});
