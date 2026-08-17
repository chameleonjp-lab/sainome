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
  assert.match(source, /this\.simulationPause\.sync\([\s\S]*?!this\.isVisible \|\| this\.contextLost/);
  assert.match(source, /if \(this\.contextLost\) \{[\s\S]*?return;/);
  assert.match(source, /if \(this\.isVisible && !this\.contextLost\) \{[\s\S]*?this\.session\.tick\(now\)/);
  assert.match(source, /this\.simulationPause\.getPausedDuration\(now\)/);
});

test('WebGL復元時は描画資源を再構築し、失敗時は退避処理へ渡す', () => {
  assert.match(source, /rebuildRendererResources\(\)/);
  assert.match(source, /this\.renderer\.resetState\?\.\(\)/);
  assert.match(source, /this\.renderer\.render\(this\.scene, this\.camera\)/);
  assert.match(source, /onContextRecoveryFailed/);
  assert.match(source, /onContextRestored/);
  assert.match(source, /dispose\(\) \{/);
  assert.match(source, /removeEventListener\('webglcontextlost'/);
});

test('WebGL消失時はカウントを止め、復元不能なら再生成またはホームへ退避する', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /onContextLost:[\s\S]*?cancelCountdown\(\)/);
  assert.match(main, /onContextRestored:[\s\S]*?handleWebGLContextRestored/);
  assert.match(main, /onContextRecoveryFailed:[\s\S]*?handleWebGLRecoveryFailed/);
  assert.match(main, /function recreateWebGLGame\(\)[\s\S]*?gameStateStorage\.load\(\)/);
  assert.match(main, /hideWebGLRecovery\(\);[\s\S]*?if \(phase === SCREEN_PHASES\.COUNTDOWN\)[\s\S]*?scheduleCountdown/);
  assert.match(main, /function leaveWebGLRecoveryForHome\(\)[\s\S]*?flow\.goHome\(\)/);
  assert.match(main, /if \(document\.hidden \|\| webglRecoveryVisible/);
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

test('消失したWebGLインスタンスは次回開始時に再利用しない', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /if \(game\?\.contextLost\)/);
  assert.match(main, /disposeGameInstance\(\{ replaceCanvas: true \}\)/);
});

test('300秒モードは消去数を保留し、安全な空きマスへランダムに補充する', () => {
  assert.match(source, /GAME_MODE_IDS\.THREE_HUNDRED_SECONDS/);
  assert.match(source, /const spawnCount = this\.pendingSpawnCount/);
  assert.match(source, /this\.pendingSpawnCount = Math\.max\([\s\S]*?cells\.length/);
  assert.match(source, /selectSpawnBatch\(candidates, spawnCount, \(\) => this\.random\.next\(\)\)/);
  assert.doesNotMatch(source, /getSixtySecondSpawnRemaining/);
  assert.doesNotMatch(source, /this\.sixtySecondSpawnedCount \+=/);
});


test('3カウント中に画面を隠すと待機し、復帰後に残りから再開する', () => {
  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(main, /function pauseCountdownTimer\(\)[\s\S]*?clearTimeout\(countdownTimerId\)/);
  assert.match(main, /if \(document\.hidden \|\| webglRecoveryVisible \|\| countdownTimerId !== null\) return;/);
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

test('画面状態に応じて3D描画ループを開始・停止する', () => {
  assert.match(source, /setScreenPhase\(screenPhase\)/);
  assert.match(
    source,
    /screenPhase === SCREEN_PHASES\.COUNTDOWN[\s\S]*?SCREEN_PHASES\.PLAYING/
  );
  assert.match(source, /this\.renderLoop\.setEnabled\(this\.renderActive\)/);
  assert.match(source, /this\.renderLoop\.refresh\(\)/);

  const main = readFileSync(
    new URL('../js/main.js', import.meta.url),
    'utf8'
  );
  assert.match(main, /game\?\.setScreenPhase\(snapshot\.screen\)/);
});

test('移動アニメーションは独自の描画ループを増やさない', () => {
  assert.match(source, /this\.animationFrameTasks = new Set\(\)/);
  assert.match(source, /runAnimationFrameTasks\(\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(step\)/);
});

test('プレイ状態は安全な地点で版付き保存し、乱数状態を含めて復元する', () => {
  assert.match(source, /GAME_STATE_VERSION/);
  assert.match(source, /getStateSnapshot\(\)/);
  assert.match(source, /if \(this\.busy \|\| this\.animationFrameTasks\.size > 0\) return null/);
  assert.match(source, /randomState: this\.random\.getState\(\)/);
  assert.match(source, /restoreState\(value\)/);
  assert.match(source, /normalizeGameRuntimeState\(value\)/);
  assert.match(source, /callbacks\.onStateSnapshot/);
});

test('ゲーム中の乱数は保存可能な専用状態から生成する', () => {
  assert.match(source, /new GameRandom\(\)/);
  assert.match(source, /this\.random\.next\(\)/);
  assert.match(source, /selectSpawnBatch\(candidates, spawnCount, \(\) => this\.random\.next\(\)\)/);
});

test('移動していない時間も安全地点として定期保存する', () => {
  assert.match(source, /STATE_SNAPSHOT_INTERVAL_MS/);
  assert.match(source, /lastStateSnapshotElapsedMs/);
  assert.match(source, /this\.emitStateSnapshot\(\)/);
});
