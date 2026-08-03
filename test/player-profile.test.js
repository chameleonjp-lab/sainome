import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYER_PROFILE_STORAGE_KEY,
  PlayerProfile,
  validatePlayerName
} from '../js/player-profile.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    read: (key) => values.get(key) ?? null
  };
}

test('名前の前後と連続する空白を整えて保存する', () => {
  const storage = memoryStorage();
  const profile = new PlayerProfile({ storage });

  const saved = profile.saveName('  サイ  ノメ  ');

  assert.deepEqual(saved, {
    ok: true,
    name: 'サイ ノメ',
    length: 5,
    persisted: true
  });
  assert.equal(profile.getName(), 'サイ ノメ');
  assert.deepEqual(JSON.parse(storage.read(PLAYER_PROFILE_STORAGE_KEY)), {
    version: 1,
    name: 'サイ ノメ'
  });
});

test('全角英数字を統一して次回起動時に復元する', () => {
  const storage = memoryStorage();
  new PlayerProfile({ storage }).saveName('ＡＢＣ１２３');

  const restored = new PlayerProfile({ storage });

  assert.equal(restored.getName(), 'ABC123');
});

test('空欄と20文字超過を開始用の名前として認めない', () => {
  assert.equal(validatePlayerName('　 ').code, 'empty');
  assert.equal(validatePlayerName('あ'.repeat(21)).code, 'too-long');
  assert.equal(validatePlayerName('あ'.repeat(20)).ok, true);
});

test('改行、不可視文字、表示方向を変える文字を認めない', () => {
  assert.equal(validatePlayerName('名前\n別名').code, 'invalid-characters');
  assert.equal(validatePlayerName('名前\u200b別名').code, 'invalid-characters');
  assert.equal(validatePlayerName('名前\u202e別名').code, 'invalid-characters');
});

test('壊れた保存値は空の名前として扱う', () => {
  const brokenJson = new PlayerProfile({
    storage: memoryStorage({ [PLAYER_PROFILE_STORAGE_KEY]: '{broken' })
  });
  const brokenName = new PlayerProfile({
    storage: memoryStorage({
      [PLAYER_PROFILE_STORAGE_KEY]: JSON.stringify({
        version: 1,
        name: 'あ'.repeat(21)
      })
    })
  });

  assert.equal(brokenJson.getName(), '');
  assert.equal(brokenName.getName(), '');
});

test('端末が保存を拒否しても現在の名前は利用できる', () => {
  const profile = new PlayerProfile({
    storage: {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    }
  });

  const saved = profile.saveName('プレイヤー');

  assert.equal(saved.ok, true);
  assert.equal(saved.persisted, false);
  assert.equal(profile.getName(), 'プレイヤー');
});
