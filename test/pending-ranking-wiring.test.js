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
  assert.match(html, /id="pending-ranking-export"[^>]*type="button"/);
  assert.match(html, /id="pending-ranking-recovery-list"[^>]*hidden/);
  assert.equal(html.indexOf('id="pending-ranking-panel"') > html.indexOf('class="home-actions"'), true);
  assert.match(css, /\.pending-ranking-panel button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 370px\)[\s\S]*\.pending-ranking-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('端末保存失敗を通信状態とは別の警告として結果画面に残せる', () => {
  assert.match(html, /id="result-ranking-storage-warning"[^>]*role="alert"[^>]*hidden/);
  assert.match(main, /renderRankingStorageWarning\(submission\)/);
  assert.match(main, /画面を閉じると失われます/);
});

test('開始は名前だけ、終了時は直接送信して結果画面で順位を読む', () => {
  assert.match(main, /await rankingClient\.startPlay\(/);
  assert.match(main, /await syncResultRanking\(prepared\)/);
  assert.match(main, /prepareDirectRankingSubmission\(/);
  assert.match(main, /pendingRankingSubmissions\.markAccepted\(/);
  assert.match(main, /submitPendingDirectRanking\(/);
  assert.match(main, /rankingClient\.submitScoreDirect\(/);
  assert.match(main, /rankingClient\.getTopRanking\(/);
  assert.doesNotMatch(main, /rankingClient\.issuePlay\(/);
  assert.doesNotMatch(main, /プレイ番号を発行できなかった/);
});

test('復元した未送信記録は手動操作だけで再送し、タブ間更新は表示へ反映する', () => {
  assert.match(main, /pendingRankingRetry\.addEventListener\('click'/);
  assert.match(main, /new globalThis\.BroadcastChannel\(PENDING_RANKING_CHANNEL_NAME\)/);
  assert.match(main, /pendingRankingChannel\?\.addEventListener\('message'/);
  assert.doesNotMatch(main, /window\.addEventListener\('online'/);
  assert.doesNotMatch(main, /renderPendingRankingPanel\(\);\s*void retryStoredRankingSubmissions\(\);/);
});

test('結果画面の再送と順位再読込を別操作に分ける', () => {
  assert.match(main, /resultRankingRetryAction === 'submit'/);
  assert.match(main, /resultRankingRetryAction === 'ranking'/);
  assert.match(main, /syncResultRanking\(latestRankingSubmission, \{ submit: false \}\)/);
  assert.match(main, /resultRankingRetryAction === 'submit' && latestRankingSubmission\.canSubmit/);
});


test('結果画面の再挑戦は保存削除完了まで無効化する', () => {
  const finishStart = main.indexOf('onFinish: (result) => {');
  const finishEnd = main.indexOf('\n};', finishStart);
  const finish = main.slice(finishStart, finishEnd);

  const disableAt = finish.indexOf('setStartPending(true);');
  const cleanupAt = finish.indexOf('clearFinishedGameState();');
  const enableAt = finish.indexOf('setStartPending(false);', cleanupAt);

  assert.equal(finishStart >= 0, true);
  assert.equal(disableAt >= 0, true);
  assert.equal(cleanupAt > disableAt, true);
  assert.match(finish, /gameStateCleanup\.finally\(\(\) => \{/);
  assert.equal(enableAt > cleanupAt, true);
  assert.match(main, /replayButton\.disabled = pending \|\| resultSharePending;/);
});
