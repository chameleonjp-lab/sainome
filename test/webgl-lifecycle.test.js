import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../js/webgl-game.js', import.meta.url),
  'utf8'
);

test('WebGLの描画停止中はゲーム時間と操作を止め、復帰後に再開する', () => {
  assert.match(source, /SimulationPause/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /webglcontextrestored/);
  assert.match(source, /this\.simulationPause\.sync\(!this\.isVisible \|\| this\.contextLost/);
  assert.match(source, /if \(this\.contextLost\) \{[\s\S]*?return;/);
  assert.match(source, /if \(this\.isVisible && !this\.contextLost\) \{[\s\S]*?this\.session\.tick\(now\)/);
  assert.match(source, /this\.simulationPause\.getPausedDuration\(now\)/);
});

test('WebGL開始前に利用可能性を確認し、読み込み失敗時はホーム画面へ案内する', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /checkWebGL2Support/);
  assert.match(main, /function canStartWebGLGame\(\) \{[\s\S]*?if \(game\) return true;/);
  assert.match(main, /if \(!canStartWebGLGame\(\)\) return;/);
  assert.match(main, /loading\.classList\.add\('hidden'\)/);
  assert.match(main, /WebGL 2/);
  assert.match(main, /flow\.goHome\(\)/);
});

test('60秒モードの追加生成は空きマス不足時も残数を保持する', () => {
  assert.match(source, /getSixtySecondSpawnRemaining/);
  assert.match(source, /this\.sixtySecondSpawnedCount/);
  assert.match(source, /this\.sixtySecondSpawnedCount \+= cells\.length/);
});


test('3カウント中に画面を隠すと待機し、復帰後に残りから再開する', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /function pauseCountdownTimer\(\)[\s\S]*?clearTimeout\(countdownTimerId\)/);
  assert.match(main, /if \(document\.hidden \|\| countdownTimerId !== null\) return;/);
  assert.match(main, /countdownTimerId = null;[\s\S]*?runId !== countdownRunId \|\| document\.hidden/);
  assert.match(
    main,
    /if \(document\.hidden\) \{[\s\S]*?pauseCountdownTimer\(\);[\s\S]*?\} else if \(flow\.getSnapshot\(\)\.screen === SCREEN_PHASES\.COUNTDOWN\)/
  );
});

test('画面非表示中の入力と予約移動を復帰後へ持ち越さない', () => {
  assert.match(source, /if \(!this\.isVisible\) return;/);
  assert.match(
    source,
    /if \(this\.isVisible\) \{[\s\S]*?\} else \{[\s\S]*?this\.queuedDirection = null;[\s\S]*?clearTimeout\(this\.queueTimerId\)/
  );

  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );
  assert.match(
    main,
    /if \(document\.hidden\) \{[\s\S]*?pointerStart = null;[\s\S]*?pauseCountdownTimer\(\)/
  );
});

test('3D盤面の準備とセッション開始を3カウントの前後で分離する', () => {
  const resetBody = source.match(
    /  reset\(modeId = this\.mode\.id\) \{[\s\S]*?\n  \}\n\n  startSession\(\)/
  )?.[0] ?? '';
  assert.match(resetBody, /this\.session = new GameSession/);
  assert.match(resetBody, /this\.session\.getSnapshot\(\)/);
  assert.doesNotMatch(resetBody, /this\.session\.start\(/);
  assert.match(
    source,
    /startSession\(\) \{[\s\S]*?phase !== GAME_PHASES\.IDLE[\s\S]*?this\.session\.start\(this\.getGameTime\(\)/
  );

  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );
  const countdownBody = main.match(
    /function scheduleCountdown\(runId\) \{[\s\S]*?\n\}\n\nfunction showHomeStartError/
  )?.[0] ?? '';
  assert.match(countdownBody, /game\.startSession\(\)/);
  assert.doesNotMatch(countdownBody, /game\.reset\(activeMode\.id\)/);

  const startBody = main.match(/async function startRound\(\)[\s\S]*?\n\}/u)?.[0] ?? '';
  assert.equal(
    startBody.indexOf('game.reset(activeMode.id)') < startBody.indexOf('flow.beginCountdown()'),
    true
  );
});
