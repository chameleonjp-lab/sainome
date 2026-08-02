import test from 'node:test';
import assert from 'node:assert/strict';

import { Dice, BASE_ORIENTATION } from '../js/dice.js';
import {
  boardKey,
  findSpecialOneClear,
  findTriggeredGroups,
  getFloorApproachAction,
  listPlayerSafeSpawnCandidates,
  listSpawnCandidates,
  selectBuriedRescue,
  selectSpawnBatch,
  selectSpawnCandidate
} from '../js/board-rules.js';

function die(id, row, column, top, state = 'normal') {
  return {
    id,
    row,
    column,
    top,
    state
  };
}

function diceMap(...dice) {
  return new Map(dice.map((item) => [boardKey(item.row, item.column), item]));
}

test('サイコロを右へ転がすと左面が上になる', () => {
  const item = new Dice('die-1', 0, 0, { ...BASE_ORIENTATION });

  item.roll('right', 0, 1);

  assert.equal(item.top, 3);
  assert.equal(item.bottom, 4);
  assert.equal(item.left, 6);
  assert.equal(item.right, 1);
  assert.deepEqual({ row: item.row, column: item.column }, { row: 0, column: 1 });
});

test('反対方向へ戻すと6面と座標が元に戻る', () => {
  const item = new Dice('die-1', 3, 3, { ...BASE_ORIENTATION });

  item.roll('up', 2, 3);
  item.roll('down', 3, 3);
  item.roll('left', 3, 2);
  item.roll('right', 3, 3);

  assert.deepEqual(
    {
      top: item.top,
      bottom: item.bottom,
      front: item.front,
      back: item.back,
      left: item.left,
      right: item.right,
      row: item.row,
      column: item.column
    },
    { ...BASE_ORIENTATION, row: 3, column: 3 }
  );
});

test('上面2が縦横に2個つながると消去対象になる', () => {
  const map = diceMap(
    die('a', 2, 2, 2),
    die('b', 2, 3, 2),
    die('c', 3, 3, 5)
  );

  const groups = findTriggeredGroups(map, 7);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].value, 2);
  assert.deepEqual(groups[0].additions.map((item) => item.id).sort(), ['a', 'b']);
  assert.equal(groups[0].isChain, false);
});

test('斜めだけで接するサイコロはつながらない', () => {
  const map = diceMap(
    die('a', 2, 2, 2),
    die('b', 3, 3, 2)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('必要数より少ない同じ目は消去対象にならない', () => {
  const map = diceMap(
    die('a', 1, 1, 4),
    die('b', 1, 2, 4),
    die('c', 1, 3, 4)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('沈下中のまとまりへ同じ目を足すと追加分だけが連鎖対象になる', () => {
  const map = diceMap(
    die('a', 3, 1, 3, 'sinking'),
    die('b', 3, 2, 3, 'sinking'),
    die('c', 3, 3, 3, 'sinking'),
    die('d', 2, 3, 3),
    die('e', 1, 3, 4)
  );

  const groups = findTriggeredGroups(map, 7);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isChain, true);
  assert.deepEqual(groups[0].additions.map((item) => item.id), ['d']);
});

test('沈下中を含めても必要数へ届かない場合は連鎖しない', () => {
  const map = diceMap(
    die('a', 3, 2, 4, 'sinking'),
    die('b', 3, 3, 4)
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('1の目は通常の接続消去に含めない', () => {
  const map = diceMap(die('one', 0, 0, 1));

  assert.deepEqual(findTriggeredGroups(map, 7), []);
});

test('上昇中と床に沈んだサイコロは通常の接続消去に含めない', () => {
  for (const state of ['rising', 'buried']) {
    const map = diceMap(
      die('a', 2, 2, 2),
      die('b', 2, 3, 2, state)
    );

    assert.deepEqual(findTriggeredGroups(map, 7), []);
  }
});

test('沈下中のサイコロへ1が隣接すると盤面上の1が特殊消去対象になる', () => {
  const map = diceMap(
    die('sink', 2, 2, 3, 'sinking'),
    die('trigger', 2, 3, 1),
    die('remote', 6, 6, 1),
    die('other', 1, 1, 2)
  );

  const special = findSpecialOneClear(map, 7);

  assert.equal(special.trigger.id, 'trigger');
  assert.deepEqual(special.members.map((item) => item.id).sort(), ['remote', 'trigger']);
});

test('プレイヤーが乗っている1は特殊消去対象から保護する', () => {
  const map = diceMap(
    die('sink', 2, 2, 2, 'sinking'),
    die('standing', 2, 3, 1),
    die('remote', 5, 5, 1)
  );

  const special = findSpecialOneClear(map, 7, 'standing');

  assert.equal(special.protected.id, 'standing');
  assert.deepEqual(special.members.map((item) => item.id), ['remote']);
});

test('1が沈下中のサイコロと斜めに接するだけでは特殊消去しない', () => {
  const map = diceMap(
    die('sink', 2, 2, 2, 'sinking'),
    die('one', 3, 3, 1)
  );

  assert.equal(findSpecialOneClear(map, 7), null);
});

test('再出現候補から既存サイコロとプレイヤーの床マスを除く', () => {
  const map = diceMap(die('occupied', 0, 0, 4));
  const candidates = listSpawnCandidates(map, 2, new Set([boardKey(1, 1)]));

  assert.deepEqual(candidates, [
    { row: 0, column: 1, key: '0,1' },
    { row: 1, column: 0, key: '1,0' }
  ]);
});

test('追加生成はプレイヤーの現在地と上下左右を避ける', () => {
  const candidates = listPlayerSafeSpawnCandidates(new Map(), 3, 1, 1);

  assert.deepEqual(candidates, [
    { row: 0, column: 0, key: '0,0' },
    { row: 0, column: 2, key: '0,2' },
    { row: 2, column: 0, key: '2,0' },
    { row: 2, column: 2, key: '2,2' }
  ]);
});

test('1回の追加生成では異なる2マスを選ぶ', () => {
  const candidates = [
    { row: 0, column: 0, key: '0,0' },
    { row: 0, column: 1, key: '0,1' },
    { row: 1, column: 0, key: '1,0' }
  ];

  assert.deepEqual(
    selectSpawnBatch(candidates, 2, () => 0).map((item) => item.key),
    ['0,0', '0,1']
  );
  assert.equal(candidates.length, 3);
});

test('床からは空きマスを歩き、近くの通常サイコロへ登る', () => {
  assert.equal(getFloorApproachAction(null), 'walk');
  assert.equal(getFloorApproachAction(die('normal', 1, 1, 2)), 'climb');
  assert.equal(
    getFloorApproachAction(die('buried', 1, 1, 2, 'buried'), -0.24),
    'climb'
  );
});

test('沈下・上昇中のサイコロは床に近い高さだけ登れる', () => {
  const sinking = die('sinking', 1, 1, 2, 'sinking');
  const rising = die('rising', 1, 1, 2, 'rising');

  assert.equal(getFloorApproachAction(sinking, 0.30), 'climb');
  assert.equal(getFloorApproachAction(rising, 0.31), 'blocked');
});

test('再出現候補の乱数が範囲端でも有効なマスを選ぶ', () => {
  const candidates = [
    { row: 0, column: 0, key: '0,0' },
    { row: 0, column: 1, key: '0,1' }
  ];

  assert.equal(selectSpawnCandidate(candidates, () => 0).key, '0,0');
  assert.equal(selectSpawnCandidate(candidates, () => 1).key, '0,1');
  assert.equal(selectSpawnCandidate([], () => 0), null);
});

test('消去完了時はプレイヤーが乗っているサイコロを床の戻り道として優先する', () => {
  const first = die('first', 2, 2, 3, 'sinking');
  const standing = die('standing', 5, 5, 3, 'sinking');

  assert.equal(
    selectBuriedRescue([first, standing], 2, 2, 'standing').id,
    'standing'
  );
});

test('足元の指定がなければプレイヤーに最も近い消去サイコロを床へ残す', () => {
  const far = die('far', 0, 0, 4, 'sinking');
  const near = die('near', 3, 4, 4, 'sinking');

  assert.equal(
    selectBuriedRescue([far, near], 3, 3).id,
    'near'
  );
  assert.equal(selectBuriedRescue([], 3, 3), null);
});
