import test from 'node:test';
import assert from 'node:assert/strict';

import { Dice, BASE_ORIENTATION } from '../js/dice.js';
import {
  boardKey,
  findSpecialOneClear,
  findTriggeredGroups,
  listSpawnCandidates,
  planFloorPush,
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

test('上昇中のサイコロは通常の接続消去に含めない', () => {
  const map = diceMap(
    die('a', 2, 2, 2),
    die('b', 2, 3, 2, 'rising')
  );

  assert.deepEqual(findTriggeredGroups(map, 7), []);
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

test('床から押す計画は1マス先が空いている通常サイコロだけ許可する', () => {
  const pushed = die('push', 1, 1, 4);
  const map = diceMap(pushed);

  const plan = planFloorPush(map, 3, pushed, { row: 0, column: 1 });

  assert.deepEqual(plan, {
    allowed: true,
    fromKey: '1,1',
    fromRow: 1,
    fromColumn: 1,
    destinationKey: '1,2',
    destinationRow: 1,
    destinationColumn: 2
  });
  assert.deepEqual({ row: pushed.row, column: pushed.column, top: pushed.top }, {
    row: 1,
    column: 1,
    top: 4
  });
});

test('盤面外または他のサイコロがある方向へは押せない', () => {
  const edgeDie = die('edge', 0, 0, 3);
  const blockedDie = die('blocked', 1, 1, 5);
  const obstacle = die('obstacle', 1, 2, 2);
  const map = diceMap(edgeDie, blockedDie, obstacle);

  assert.deepEqual(
    planFloorPush(map, 3, edgeDie, { row: -1, column: 0 }),
    { allowed: false, reason: 'edge' }
  );
  assert.deepEqual(
    planFloorPush(map, 3, blockedDie, { row: 0, column: 1 }),
    { allowed: false, reason: 'occupied' }
  );
});

test('沈下中と上昇中のサイコロは床から押せない', () => {
  for (const state of ['sinking', 'rising']) {
    const item = die(state, 1, 1, 2, state);
    assert.deepEqual(
      planFloorPush(diceMap(item), 3, item, { row: 0, column: 1 }),
      { allowed: false, reason: 'not-pushable' }
    );
  }
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
