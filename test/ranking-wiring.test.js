import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('ホームに必須の名前入力と保存案内がある', () => {
  assert.match(html, /for="player-name-input"/);
  assert.match(html, /id="player-name-input"[\s\S]*?autocomplete="nickname"/);
  assert.match(html, /id="player-name-help"/);
  assert.match(html, /ランキングに公開され/);
  assert.match(html, /id="player-name-error"[^>]*role="alert"/);
  assert.match(css, /\.player-name-field input\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /user-select:\s*text/);
  assert.match(css, /\.home-screen, \.tutorial-screen, \.result-screen\s*\{[^}]*align-content:\s*start/s);
});

test('名前欄では長押しによる選択と貼り付けを妨げない', () => {
  assert.match(main, /event\.target\.closest\('input, textarea, a'\)/);
  assert.match(main, /if \(event\.target\.closest\('input, textarea, a'\)\) return/);
});

test('結果画面下部にモード別ランキングと再送操作がある', () => {
  const shareStatusPosition = html.indexOf('id="result-share-status"');
  const rankingPosition = html.indexOf('class="result-ranking"');
  assert.equal(shareStatusPosition > 0, true);
  assert.equal(rankingPosition > shareStatusPosition, true);
  assert.match(html, /id="result-ranking-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="result-ranking-list"/);
  assert.match(html, /id="result-ranking-retry"[^>]*type="button"/);
  assert.match(css, /\.ranking-retry-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.result-screen\s*\{[^}]*align-content:\s*start/s);
});

test('名前を確認してから開始し、結果確定時に名前だけで登録する', () => {
  const startFunction = main.match(/async function startRound\(\)[\s\S]*?\n\}/u)?.[0] ?? '';
  assert.match(startFunction, /capturePlayerName\(\)/);
  assert.equal(
    startFunction.indexOf('capturePlayerName()') < startFunction.indexOf('ensureGame('),
    true
  );
  assert.match(startFunction, /rankingClient\.startPlay\(/);
  assert.equal(
    startFunction.indexOf('rankingClient.startPlay(') < startFunction.indexOf('flow.beginCountdown()'),
    true
  );
  assert.match(main, /async function preserveFinishedRanking[\s\S]*?syncResultRanking\(provisional\)/);
  assert.match(main, /rankingClient\.submitScoreDirect\(/);
  assert.match(main, /rankingClient\.getTopRanking\(currentSubmission\.result\.modeId\)/);
  assert.doesNotMatch(main, /rankingClient\.issuePlay\(/);
});

test('ランキング名と得点はHTML文字列ではなく文字として表示する', () => {
  assert.match(html, /<bdi dir="auto"><strong id="result-player-name"/);
  assert.match(main, /document\.createElement\('bdi'\)/);
  assert.match(main, /name\.dir = 'auto'/);
  assert.match(main, /name\.textContent = row\.displayName/);
  assert.match(main, /score\.textContent = `\$\{numberFormatter\.format\(row\.score\)\}点`/);
  assert.doesNotMatch(main, /resultRankingList\.innerHTML/);
});

test('表示名の一致ではなくDBの本人判定だけでランキング行を強調する', () => {
  assert.match(main, /row\.isCurrentUser === true/);
  assert.doesNotMatch(main, /row\.displayName === displayName/);
});

test('古い通信結果を新しい結果画面へ混ぜない', () => {
  assert.match(main, /rankingPendingRunIds/);
  assert.match(main, /latestRankingSubmission\?\.runId === submission\.runId/);
  assert.match(main, /snapshot\.result === submission\.result/);
  assert.match(main, /if \(!isCurrentRankingSubmission\(submission\)\)/);
});
