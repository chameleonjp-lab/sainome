import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOUND_PREFERENCE_KEY,
  SoundEffects
} from '../js/sound-effects.js';

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  constructor(context) {
    this.context = context;
  }

  connect() { return this; }
  disconnect() {}
  addEventListener() {}
}

class FakeSource extends FakeNode {
  constructor(context) {
    super(context);
    this.frequency = new FakeParam();
    this.buffer = null;
    this.type = '';
  }

  start() { this.context.started += 1; }
  stop() { this.context.stopped += 1; }
}

class FakeGain extends FakeNode {
  constructor(context) {
    super(context);
    this.gain = new FakeParam();
  }
}

class FakeFilter extends FakeNode {
  constructor(context) {
    super(context);
    this.frequency = new FakeParam();
    this.Q = new FakeParam();
    this.type = '';
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.sampleRate = 100;
    this.state = 'suspended';
    this.destination = new FakeNode(this);
    this.started = 0;
    this.stopped = 0;
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.stateChangeListeners = new Set();
  }

  createGain() { return new FakeGain(this); }
  createOscillator() { return new FakeSource(this); }
  createBufferSource() { return new FakeSource(this); }
  createBiquadFilter() { return new FakeFilter(this); }
  createBuffer() {
    const samples = new Float32Array(42);
    return { getChannelData: () => samples };
  }

  addEventListener(type, listener) {
    if (type === 'statechange') this.stateChangeListeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'statechange') this.stateChangeListeners.delete(listener);
  }

  changeState(state) {
    this.state = state;
    for (const listener of this.stateChangeListeners) listener();
  }

  async resume() {
    this.resumeCalls += 1;
    this.changeState('running');
  }

  async suspend() {
    this.suspendCalls += 1;
    this.changeState('suspended');
  }

  close() {
    this.changeState('closed');
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    read: (key) => values.get(key) ?? null
  };
}

test('初期状態は音なしで、音声機能をまだ作らない', () => {
  let contextCount = 0;
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => {
      contextCount += 1;
      return new FakeAudioContext();
    }
  });

  assert.equal(sounds.getSnapshot().enabled, false);
  assert.equal(sounds.playFlick(), false);
  assert.equal(contextCount, 0);
});

test('保存済みのオン設定を読み、操作後に音声機能を開始する', async () => {
  const storage = memoryStorage({ [SOUND_PREFERENCE_KEY]: 'true' });
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage,
    contextFactory: () => context,
    random: () => 0.5
  });

  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.getSnapshot().running, false);

  assert.equal(await sounds.unlock(), true);
  assert.equal(sounds.playFlick(), true);
  assert.equal(context.started > 0, true);
});

test('音の切り替えを保存し、オフにすると停止する', async () => {
  const storage = memoryStorage();
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage,
    contextFactory: () => context
  });

  const enabled = await sounds.setEnabled(true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.running, true);
  assert.equal(storage.read(SOUND_PREFERENCE_KEY), 'true');
  sounds.playFlick();

  const disabled = await sounds.setEnabled(false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.running, false);
  assert.equal(storage.read(SOUND_PREFERENCE_KEY), 'false');
  assert.equal(context.stopped > 0, true);
  assert.equal(sounds.activeSounds.size, 0);
});

test('フリック・転がり・消去・生成は別の音として再生できる', async () => {
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => context,
    random: () => 0.5
  });
  await sounds.setEnabled(true);

  const before = context.started;
  assert.equal(sounds.playFlick(), true);
  const afterFlick = context.started;
  assert.equal(sounds.playRoll(), true);
  const afterRoll = context.started;
  assert.equal(sounds.playClear({ chain: 2 }), true);
  const afterClear = context.started;
  assert.equal(sounds.playSpawn({ count: 3 }), true);
  const afterSpawn = context.started;

  assert.equal(afterFlick > before, true);
  assert.equal(afterRoll > afterFlick, true);
  assert.equal(afterClear > afterRoll, true);
  assert.equal(afterSpawn > afterClear, true);
});

test('保存機能や音声機能が使えなくてもゲームを止めない', async () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); }
  };
  const sounds = new SoundEffects({
    storage,
    contextFactory: () => { throw new Error('unsupported'); }
  });

  const snapshot = await sounds.setEnabled(true);
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.running, false);
  assert.equal(sounds.playRoll(), false);
});

test('画面が隠れたら再生中の音声を停止する', async () => {
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => context
  });
  await sounds.setEnabled(true);
  sounds.playRoll();

  sounds.handleVisibility(true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.state, 'suspended');
  assert.equal(context.stopped > 0, true);
  assert.equal(sounds.activeSounds.size, 0);
});

test('音声の開始中に画面が隠れた場合も再生状態を残さない', async () => {
  let completeResume;
  const context = new FakeAudioContext();
  context.resume = () => new Promise((resolve) => {
    completeResume = () => {
      context.state = 'running';
      resolve();
    };
  });
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => context
  });

  const enabling = sounds.setEnabled(true);
  sounds.handleVisibility(true);
  completeResume();
  const snapshot = await enabling;

  assert.equal(snapshot.running, false);
  assert.equal(context.state, 'suspended');
});

test('iOSのinterrupted状態は自動再開せず、次の明示操作で一度だけ再開する', async () => {
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => context,
    random: () => 0.5
  });
  await sounds.setEnabled(true);
  sounds.playRoll();
  context.changeState('interrupted');

  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.getSnapshot().state, 'interrupted');
  assert.equal(sounds.activeSounds.size, 0);
  assert.equal(sounds.playFlick(), false);
  assert.equal(context.resumeCalls, 1);

  const firstUnlock = sounds.unlock();
  const secondUnlock = sounds.unlock();
  assert.equal(await firstUnlock, true);
  assert.equal(await secondUnlock, true);
  assert.equal(context.resumeCalls, 2);
  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.playFlick(), true);
});

test('closed状態では設定を変えず、次の明示操作で新しい音声コンテキストを作る', async () => {
  const firstContext = new FakeAudioContext();
  const secondContext = new FakeAudioContext();
  let contextCount = 0;
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => {
      contextCount += 1;
      return contextCount === 1 ? firstContext : secondContext;
    },
    random: () => 0.5
  });

  await sounds.setEnabled(true);
  firstContext.close();
  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.getSnapshot().state, null);
  assert.equal(sounds.playFlick(), false);

  assert.equal(await sounds.unlock(), true);
  assert.equal(contextCount, 2);
  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.getSnapshot().state, 'running');
  assert.equal(sounds.playFlick(), true);
});

test('画面復帰だけでは音声を再開せず、明示操作まで設定を保持する', async () => {
  const context = new FakeAudioContext();
  const sounds = new SoundEffects({
    storage: memoryStorage(),
    contextFactory: () => context
  });
  await sounds.setEnabled(true);
  sounds.handleVisibility(true);
  await new Promise((resolve) => setImmediate(resolve));
  const resumeCallsAfterHide = context.resumeCalls;

  sounds.handleVisibility(false);
  assert.equal(context.resumeCalls, resumeCallsAfterHide);
  assert.equal(sounds.getSnapshot().enabled, true);
  assert.equal(sounds.getSnapshot().running, false);

  assert.equal(await sounds.unlock(), true);
  assert.equal(context.resumeCalls, resumeCallsAfterHide + 1);
  assert.equal(sounds.getSnapshot().enabled, true);
});
