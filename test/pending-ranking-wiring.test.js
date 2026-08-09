import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('ホームの開始操作後に未送信件数と手動再送を表示できる', () => {
  assert.match(html, /id="pending-ranking-panel"[^>]*hidden/);
  assert.match(html, /id="pending-ranking-status"[^>]*role="status"/);
  assert.match(html, /id="pending-ranking-retry"[^>]*type="button"/);
  assert.equal(html.indexOf('id="pending-ranking-panel"') > html.indexOf('class="home-actions"'), true);
  assert.match(css, /\.pending-ranking-panel button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 370px\)[\s\S]*\.pending-ranking-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('端末保存失敗を通信状態とは別の警告として結果画面に残せる', () => {
  assert.match(html, /id="result-ranking-storage-warning"[^>]*role="alert"[^>]*hidden/);
  assert.match(main, /renderRankingStorageWarning\(submission\)/);
  assert.match(main, /画面を閉じると失われます/);
});

test('結果確定後はIndexedDB保存完了より後に通信を開始する', () => {
  const flowStart = main.indexOf('async function preserveFinishedRanking(provisional)');
  const flowEnd = main.indexOf('\nconst gameCallbacks', flowStart);
  const rankingFlow = main.slice(flowStart, flowEnd);
  const prepareAt = rankingFlow.indexOf('await prepareRankingSubmission({');
  const syncAt = rankingFlow.indexOf('syncResultRanking(submission)');

  assert.equal(prepareAt >= 0, true);
  assert.equal(syncAt > prepareAt, true);
});

test('復元した未送信記録は手動操作だけで再送し、タブ間更新は表示へ反映する', () => {
  assert.match(main, /pendingRankingRetry\.addEventListener\('click'/);
  assert.match(main, /new globalThis\.BroadcastChannel\(PENDING_RANKING_CHANNEL_NAME\)/);
  assert.match(main, /pendingRankingChannel\?\.addEventListener\('message'/);
  assert.doesNotMatch(main, /window\.addEventListener\('online'/);
  assert.doesNotMatch(main, /renderPendingRankingPanel\(\);\s*void retryStoredRankingSubmissions\(\);/);
});

test('DB復旧前の手動再送は1操作1件に制限する', () => {
  assert.match(main, /const MAX_MANUAL_PENDING_RETRIES = 1;/);
});
