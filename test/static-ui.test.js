import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TUTORIAL_SLIDE_COUNT } from '../js/tutorial-slides.js';

const rootUrl = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', rootUrl), 'utf8');
const css = readFileSync(new URL('css/style.css', rootUrl), 'utf8');
const main = readFileSync(new URL('js/main.js', rootUrl), 'utf8');

test('HTMLの要素識別子は重複しない', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length);
});

test('main.jsが識別子で参照する要素はHTMLに存在する', () => {
  const selectors = [
    ...main.matchAll(/querySelector(?:All)?\('([^']+)'\)/g)
  ].map((match) => match[1]);
  const referencedIds = selectors
    .map((selector) => selector.match(/^#([\w-]+)/)?.[1])
    .filter(Boolean);

  for (const id of referencedIds) {
    assert.match(html, new RegExp(`\\bid="${id}"`), `Missing #${id}`);
  }
});

test('3枚の説明と3個の位置表示がそろっている', () => {
  const slides = [...html.matchAll(/\bdata-tutorial-slide\b/g)];
  const dotsMarkup = html.match(
    /id="tutorial-dots"[\s\S]*?<\/div>/
  )?.[0] ?? '';
  const dots = [...dotsMarkup.matchAll(/<span(?:\s|>)/g)];

  assert.equal(slides.length, TUTORIAL_SLIDE_COUNT);
  assert.equal(dots.length, TUTORIAL_SLIDE_COUNT);
});

test('新しいプレイは180秒だけを案内し、60秒の選択肢を表示しない', () => {
  assert.doesNotMatch(html, /name="game-mode"/);
  assert.doesNotMatch(html, /60秒は短い得点勝負/);
  assert.match(html, /id="remaining-time">180</);
  assert.match(html, /180秒の自己ベスト/);
  assert.match(main, /function getNewGameMode\(\)[\s\S]*?return getGameMode\(DEFAULT_GAME_MODE_ID\)/);
  assert.match(main, /snapshot\.screen === SCREEN_PHASES\.HOME[\s\S]*?selectedMode = getNewGameMode\(\)/);
});

test('プレイ中の盤面外にタップできる斜め4方向を表示する', () => {
  const controls = [...html.matchAll(/data-direction="(up|right|down|left)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(new Set(controls), new Set(['up', 'right', 'down', 'left']));
  for (const arrow of ['↖', '↗', '↙', '↘']) assert.match(html, new RegExp(arrow));
  assert.match(html, /id="direction-controls"[^>]*role="group"/);
  assert.match(css, /\.app\[data-screen="playing"\] \.direction-controls/);
  assert.match(css, /\.direction-control\s*\{[^}]*min-height|\.direction-control\s*\{[\s\S]*?height:\s*clamp\(48px/s);
  assert.match(main, /button\.addEventListener\('click'[\s\S]*?requestMove\(button\.dataset\.direction\)/);
  assert.match(main, /button\.classList\.add\('is-active'\)/);
  assert.match(main, /斜め方向へフリックするか、矢印をタップします/);
});

test('ホームと結果画面から実験場へ戻れる', () => {
  const labUrl = 'https://chameleonjp.codeberg.page/chameleonjp_lab/';
  const escapedLabUrl = labUrl.replaceAll('.', '\\.');

  for (const id of ['home-lab-link', 'result-lab-link']) {
    assert.match(
      html,
      new RegExp(`id="${id}"[\\s\\S]*?href="${escapedLabUrl}"`)
    );
  }
  assert.match(html, /id="home-lab-link"[^>]*class="lab-link home-lab-link"/);
  assert.match(html, /id="result-lab-link"[^>]*class="lab-link result-lab-link"/);
  assert.match(css, /\.lab-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.result-lab-link\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('再読み込み後に保存状態を確認して続きから再開できる', () => {
  for (const id of ['game-recovery-panel', 'game-recovery-status', 'game-recovery-resume', 'game-recovery-discard']) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(main, /GameStateStorage/);
  assert.match(main, /resumeSavedGame/);
  assert.match(main, /discardSavedGame/);
  assert.match(main, /loaded\.status === 'unavailable'[\s\S]*?savedGameRecovery = \{ unavailable: true \}/);
  assert.match(main, /保存領域を確認できないため/);
  assert.match(main, /async function loadGameRecovery\(\{ force = false \} = \{\}\)/);
  assert.match(main, /await loadGameRecovery\(\{ force: true \}\)/);
  assert.match(main, /createGameStateChannel/);
  assert.match(main, /sainome-game-state-v1/);
  assert.match(main, /flow\.getSnapshot\(\)\.screen !== SCREEN_PHASES\.HOME/);
  assert.match(main, /gameStateChannel\?\.close\(\)/);
  const startFunction = main.match(/async function startRound\(\)[\s\S]*?\n\}/u)?.[0] ?? '';
  assert.match(startFunction, /if \(savedGameRecovery\) \{/);
  assert.match(startFunction, /続きから再開/);
  assert.doesNotMatch(startFunction, /clearGameState\(/);
  assert.match(main, /function clearFinishedGameState\(\)[\s\S]*?expectedSerialized = savedGameRecovery\?\.serialized/);
  assert.match(main, /const gameStateCleanup = clearFinishedGameState\(\)/);
  assert.match(main, /gameStateCleanup\.finally\([\s\S]*?setStartPending\(false\)/);
  assert.match(css, /\.game-recovery-panel\s*\{/);
});

test('WebGL復旧失敗時に再生成とホーム退避を選べる', () => {
  for (const id of [
    'webgl-recovery-panel',
    'webgl-recovery-status',
    'webgl-recovery-recreate',
    'webgl-recovery-home'
  ]) {
    assert.match(html, new RegExp(`\\bid="${id}"`));
  }
  assert.match(main, /WEBGL_RECOVERY_WAIT_MS/);
  assert.match(main, /beginWebGLRecovery/);
  assert.match(main, /recreateWebGLGame/);
  assert.match(main, /leaveWebGLRecoveryForHome/);
  assert.match(main, /disposeGameInstance\(\{ replaceCanvas: true \}\)/);
  assert.match(css, /\.webgl-recovery-panel\s*\{/);
});

test('HTMLから読むローカルファイルはすべて存在する', () => {
  const paths = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)]
    .map((match) => match[1]);

  for (const path of paths) {
    const localPath = fileURLToPath(new URL(path, rootUrl));
    assert.equal(existsSync(localPath), true, `Missing ${path}`);
  }
});
