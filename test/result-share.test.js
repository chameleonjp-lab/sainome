import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import {
  createResultShareContent,
  normalizeShareUrl,
  RESULT_SHARE_STATUSES,
  shareResult
} from '../js/result-share.js';

function result(overrides = {}) {
  return {
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 3200,
    clearedDice: 12,
    maxChain: 4,
    ...overrides
  };
}

function content(overrides = {}) {
  return createResultShareContent({
    result: result(),
    recordMessage: '自己ベスト更新！ +400点',
    pageUrl: 'https://example.com/sainome/?from=result#score',
    formatNumber: (value) => new Intl.NumberFormat('ja-JP').format(value),
    ...overrides
  });
}

test('結果と自己ベスト判定をURLの前へまとめる', () => {
  const share = content();

  assert.equal(share.title, 'サイノメ');
  assert.equal(
    share.text,
    'サイノメの60秒モードで3,200点！\n'
      + '消した数12個\n'
      + '自己ベスト更新！ +400点\n'
      + '#サイノメ'
  );
  assert.equal(share.url, 'https://example.com/sainome/');
  assert.equal(share.copyText, `${share.text}\n${share.url}`);
  assert.doesNotMatch(share.text, /連鎖|CHAIN/);
  assert.equal(share.copyText.endsWith(share.url), true);
});

test('300秒モードを60秒へ置き換えずに表示する', () => {
  const share = content({
    result: result({
      modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS,
      score: 900,
      clearedDice: 3,
      maxChain: 1
    }),
    recordMessage: '初回記録'
  });

  assert.match(share.text, /^サイノメの300秒モードで900点！/);
  assert.match(share.text, /初回記録/);
});

test('共有URLから検索文字とページ内位置だけを除く', () => {
  assert.equal(
    normalizeShareUrl('https://example.com/game/index.html?mode=60#result'),
    'https://example.com/game/index.html'
  );
});

test('端末の共有機能が使える場合はコピーしない', async () => {
  let sharedData = null;
  let copied = false;
  const share = content();
  const navigatorObject = {
    canShare: (data) => data.url === share.url,
    share: async (data) => { sharedData = data; },
    clipboard: { writeText: async () => { copied = true; } }
  };

  const status = await shareResult(share, navigatorObject);

  assert.equal(status, RESULT_SHARE_STATUSES.SHARED);
  assert.deepEqual(sharedData, {
    title: share.title,
    text: share.text,
    url: share.url
  });
  assert.equal(copied, false);
});

test('共有機能がない場合は全文をコピーする', async () => {
  let copiedText = null;
  const share = content();
  const navigatorObject = {
    clipboard: { writeText: async (text) => { copiedText = text; } }
  };

  const status = await shareResult(share, navigatorObject);

  assert.equal(status, RESULT_SHARE_STATUSES.COPIED);
  assert.equal(copiedText, share.copyText);
});

test('共有できないデータと判定された場合は全文をコピーする', async () => {
  let shareCalled = false;
  const share = content();
  const navigatorObject = {
    canShare: () => false,
    share: async () => { shareCalled = true; },
    clipboard: { writeText: async () => {} }
  };

  const status = await shareResult(share, navigatorObject);

  assert.equal(status, RESULT_SHARE_STATUSES.COPIED);
  assert.equal(shareCalled, false);
});

test('共有処理が失敗した場合は全文をコピーする', async () => {
  let copiedText = null;
  const share = content();
  const navigatorObject = {
    share: async () => { throw new Error('share unavailable'); },
    clipboard: { writeText: async (text) => { copiedText = text; } }
  };

  const status = await shareResult(share, navigatorObject);

  assert.equal(status, RESULT_SHARE_STATUSES.COPIED);
  assert.equal(copiedText, share.copyText);
});

test('利用者が共有画面を閉じた場合はコピーしない', async () => {
  let copied = false;
  const abortError = new Error('cancelled');
  abortError.name = 'AbortError';
  const navigatorObject = {
    share: async () => { throw abortError; },
    clipboard: { writeText: async () => { copied = true; } }
  };

  const status = await shareResult(content(), navigatorObject);

  assert.equal(status, RESULT_SHARE_STATUSES.CANCELLED);
  assert.equal(copied, false);
});

test('共有もコピーも使えない場合は失敗を返す', async () => {
  const status = await shareResult(content(), {
    clipboard: { writeText: async () => { throw new Error('blocked'); } }
  });

  assert.equal(status, RESULT_SHARE_STATUSES.FAILED);
});

test('不正な得点を共有文へ入れない', () => {
  assert.throws(
    () => content({ result: result({ score: Number.MAX_VALUE }) }),
    /score/
  );
});
