import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  describeRankingFailure,
  shouldEnableRankingRetry
} from '../js/ranking-status-ui.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('ネットワーク失敗は理由と診断情報を表示できる', () => {
  const described = describeRankingFailure({
    code: 'network',
    retryable: true,
    rpcName: 'submit_score',
    gameSlug: 'sainome_300_seconds'
  });

  assert.match(described.summary, /ネットワーク/u);
  assert.equal(described.diagnostic, 'submit_score / sainome_300_seconds');
  assert.equal(described.retryable, true);
  assert.equal(described.isScoreSubmission, true);
});

test('HTTP・サーバーコード・RPC名を診断表示へ含める', () => {
  const described = describeRankingFailure({
    code: 'request-failed',
    retryable: false,
    status: 404,
    rpcName: 'submit_score',
    serverCode: 'PGRST404',
    serverMessage: 'game not found',
    gameSlug: 'sainome_300_seconds'
  });

  assert.match(described.summary, /ゲーム登録/u);
  assert.equal(
    described.diagnostic,
    'submit_score / HTTP 404 / PGRST404 / sainome_300_seconds'
  );
});

test('再試行できる送信失敗では再送ボタンを活性化する', () => {
  assert.equal(shouldEnableRankingRetry({
    detail: {
      code: 'timeout',
      retryable: true,
      rpcName: 'submit_score'
    },
    statusText: 'ランキングは表示しましたが、今回の記録を送信できませんでした',
    buttonText: '記録を再送する'
  }), true);

  assert.equal(shouldEnableRankingRetry({
    detail: {
      code: 'timeout',
      retryable: true,
      rpcName: 'submit_score'
    },
    statusText: '記録を送信しています…',
    buttonText: '通信中…'
  }), false);
});

test('ホームと結果画面に目的が明確なシェアボタンを表示する', () => {
  assert.match(indexHtml, /id="home-share-button"[^>]*>URLと紹介文をシェア</u);
  assert.match(indexHtml, /id="result-share-button"[^>]*>URLとスコアをシェア</u);
});

test('結果画面に送信失敗の詳細表示と再送ボタンを備える', () => {
  assert.match(indexHtml, /id="result-ranking-error-detail"/u);
  assert.match(indexHtml, /id="result-ranking-retry"/u);
  assert.match(indexHtml, /\.\/js\/ranking-status-ui\.js/u);
});
