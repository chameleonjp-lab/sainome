import {
  formatRemainingSeconds,
  GameFlow,
  SCREEN_PHASES
} from './ui-flow.js';
import {
  DEFAULT_SWIPE_DISTANCE,
  directionFromDiagonalSwipe
} from './input-direction.js';
import {
  DEFAULT_GAME_MODE_ID,
  GAME_MODE_IDS,
  getGameMode
} from './game-modes.js';
import {
  TUTORIAL_SLIDE_COUNT,
  TutorialSlides
} from './tutorial-slides.js';
import { SoundEffects } from './sound-effects.js';
import {
  BestRecords,
  describeBestOutcome
} from './best-records.js';
import {
  createResultShareContent,
  RESULT_SHARE_STATUSES,
  shareResult
} from './result-share.js';
import { PlayerProfile } from './player-profile.js';
import {
  createSubmissionId,
  isValidRankingSubmissionId,
  RankingClient
} from './ranking-client.js?v=20260818-ranking-submit-retry';
import {
  PendingRankingSubmissions,
  PENDING_RANKING_CHANNEL_NAME
} from './pending-ranking-submissions.js?v=20260818-ranking-submit-retry';
import {
  prepareDirectRankingSubmission,
  prepareRankingSubmission,
  classifyRankingFailure,
  SingleFlight,
  submitPendingDirectRanking,
  submitPendingRanking,
  updateIfCurrentRankingSubmission
} from './ranking-submission-flow.js?v=20260818-ranking-submit-retry';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from './supabase-config.js';
import { checkWebGL2Support } from './webgl-support.js';
import {
  GAME_STATE_VERSION,
  GameStateStorage
} from './game-state-storage.js';
import { MotionPreferences } from './motion-preferences.js';
import { isReleaseDiagnosticsEnabled } from './release-diagnostics.js';

const app = document.querySelector('#app');
const motionPreferences = new MotionPreferences();
motionPreferences.subscribe((reducedMotion) => {
  app.dataset.reducedMotion = String(reducedMotion);
});
let canvas = document.querySelector('#game-canvas');
const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const message = document.querySelector('#message');
const remainingTime = document.querySelector('#remaining-time');
const timePanel = document.querySelector('#time-panel');
const scoreCount = document.querySelector('#score-count');
const scorePanel = document.querySelector('#score-panel');
const chainCount = document.querySelector('#chain-count');
const clearCount = document.querySelector('#clear-count');
const homeScreen = document.querySelector('#home-screen');
const countdownScreen = document.querySelector('#countdown-screen');
const countdownValue = document.querySelector('#countdown-value');
const pauseScreen = document.querySelector('#pause-screen');
const pauseButton = document.querySelector('#pause-button');
const resumeButton = document.querySelector('#resume-button');
const retireButton = document.querySelector('#retire-button');
const resultScreen = document.querySelector('#result-screen');
const tutorialScreen = document.querySelector('#tutorial-screen');
const tutorialTitle = document.querySelector('#tutorial-title');
const tutorialProgress = document.querySelector('#tutorial-progress');
const tutorialSlideElements = [...document.querySelectorAll('[data-tutorial-slide]')];
const tutorialDots = [...document.querySelectorAll('#tutorial-dots span')];
const tutorialButton = document.querySelector('#tutorial-button');
const tutorialHomeButton = document.querySelector('#tutorial-home-button');
const tutorialPreviousButton = document.querySelector('#tutorial-previous-button');
const tutorialNextButton = document.querySelector('#tutorial-next-button');
const playerNameInput = document.querySelector('#player-name-input');
const playerNameError = document.querySelector('#player-name-error');
const homeBestScore = document.querySelector('#home-best-score');
const resultScore = document.querySelector('#result-score');
const resultRecordMessage = document.querySelector('#result-record-message');
const resultBestScore = document.querySelector('#result-best-score');
const resultRecordWarning = document.querySelector('#result-record-warning');
const resultRankingStorageWarning = document.querySelector('#result-ranking-storage-warning');
const resultPlayerName = document.querySelector('#result-player-name');
const resultCleared = document.querySelector('#result-cleared');
const resultChain = document.querySelector('#result-chain');
const playNote = document.querySelector('#play-note');
const startButton = document.querySelector('#start-button');
const replayButton = document.querySelector('#replay-button');
const resultHomeButton = document.querySelector('#result-home-button');
const resultShareButton = document.querySelector('#result-share-button');
const resultShareStatus = document.querySelector('#result-share-status');
const resultRankingTitle = document.querySelector('#result-ranking-title');
const resultRankingStatus = document.querySelector('#result-ranking-status');
const resultRankingList = document.querySelector('#result-ranking-list');
const resultRankingRetry = document.querySelector('#result-ranking-retry');
const homeError = document.querySelector('#home-error');
const modeBrand = document.querySelector('#mode-brand');
const homeKicker = document.querySelector('#home-kicker');
const directionButtons = [...document.querySelectorAll('[data-direction]')];
const resultKicker = document.querySelector('#result-kicker');
const playNoteTitle = document.querySelector('#play-note-title');
const playNoteText = document.querySelector('#play-note-text');
const soundToggle = document.querySelector('#sound-toggle');
const soundToggleIcon = document.querySelector('#sound-toggle-icon');
const soundToggleLabel = document.querySelector('#sound-toggle-label');
const soundStatus = document.querySelector('#sound-status');
const pendingRankingPanel = document.querySelector('#pending-ranking-panel');
const pendingRankingStatus = document.querySelector('#pending-ranking-status');
const pendingRankingRetry = document.querySelector('#pending-ranking-retry');
const pendingRankingExport = document.querySelector('#pending-ranking-export');
const pendingRankingRecoveryList = document.querySelector('#pending-ranking-recovery-list');
const pendingRankingRecoveryStatus = document.querySelector('#pending-ranking-recovery-status');
const gameRecoveryPanel = document.querySelector('#game-recovery-panel');
const gameRecoveryStatus = document.querySelector('#game-recovery-status');
const gameRecoveryResume = document.querySelector('#game-recovery-resume');
const gameRecoveryDiscard = document.querySelector('#game-recovery-discard');
const webglRecoveryPanel = document.querySelector('#webgl-recovery-panel');
const webglRecoveryStatus = document.querySelector('#webgl-recovery-status');
const webglRecoveryRecreate = document.querySelector('#webgl-recovery-recreate');
const webglRecoveryHome = document.querySelector('#webgl-recovery-home');
const releaseDiagnosticsPanel = document.querySelector('#release-diagnostics-panel');
const releaseDiagnosticsLoseButton = document.querySelector('#release-diagnostics-lose-button');
const releaseDiagnosticsRestoreButton = document.querySelector('#release-diagnostics-restore-button');
const releaseDiagnosticsOutput = document.querySelector('#release-diagnostics-output');
const releaseDiagnosticsStatus = document.querySelector('#release-diagnostics-status');

const WEBGL_UNAVAILABLE_MESSAGE =
  'この端末またはブラウザでは、3D表示に必要な機能（WebGL 2）が利用できません。ブラウザの設定で3D表示を有効にするか、対応環境でお試しください。';
const WEBGL_LOAD_FAILURE_MESSAGE =
  '3D表示を開始できませんでした。通信状態を確認して、もう一度お試しください。';
const WEBGL_RECOVERY_WAIT_MS = 5_000;
const releaseDiagnosticsEnabled = isReleaseDiagnosticsEnabled();

const flow = new GameFlow();
if (tutorialSlideElements.length !== TUTORIAL_SLIDE_COUNT) {
  throw new Error('Tutorial slide markup does not match the configured count');
}
const tutorial = new TutorialSlides({ count: tutorialSlideElements.length });
const soundEffects = new SoundEffects();
const bestRecords = new BestRecords();
const playerProfile = new PlayerProfile();
const pendingRankingSubmissions = new PendingRankingSubmissions();
const gameStateStorage = new GameStateStorage();
const pendingRankingChannel = createPendingRankingChannel();
const gameStateChannel = createGameStateChannel();
let rankingClient = null;
try {
  rankingClient = new RankingClient({
    url: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY
  });
} catch (error) {
  console.error(error);
}
const numberFormatter = new Intl.NumberFormat('ja-JP');
let game = null;
let gameLoadPromise = null;
let pointerStart = null;
let countdownTimerId = null;
let countdownRunId = 0;
let startPending = false;
let soundTogglePending = false;
let resultSharePending = false;
const rankingPendingRunIds = new Set();
let selectedMode = getGameMode(DEFAULT_GAME_MODE_ID);
let activeMode = selectedMode;
let activePlayerName = playerProfile.getName();
let latestRecordOutcome = null;
let latestRankingSubmission = null;
let activePlayTicket = null;
let rankingRunId = 0;
let pendingRankingRetryCursor = 0;
let resultRankingRetryAction = null;
let recoveryActionCounter = 0;
let recoveryActionPending = false;
const recoveryActionRecords = new Map();
let savedGameRecovery = null;
let gameRecoveryLoadPromise = null;
let gameRecoveryLoaded = false;
let gameStateOperation = Promise.resolve();
let gameStateOperationPending = false;
let webglRecoveryTimerId = null;
let webglRecoveryRunId = 0;
let webglRecoveryVisible = false;
let webglRecoveryActionPending = false;
let releaseDiagnosticsTimerId = null;

const MAX_MANUAL_PENDING_RETRIES = 10;
const pendingRankingRetryFlight = new SingleFlight();

playerNameInput.value = activePlayerName;

function createPendingRankingChannel() {
  try {
    return typeof globalThis.BroadcastChannel === 'function'
      ? new globalThis.BroadcastChannel(PENDING_RANKING_CHANNEL_NAME)
      : null;
  } catch {
    return null;
  }
}

function createGameStateChannel() {
  try {
    return typeof globalThis.BroadcastChannel === 'function'
      ? new globalThis.BroadcastChannel('sainome-game-state-v1')
      : null;
  } catch {
    return null;
  }
}

function notifyGameStateChange() {
  try {
    gameStateChannel?.postMessage('changed');
  } catch {
    // The local state remains authoritative when cross-tab notification is unavailable.
  }
}

function formatReleaseDiagnosticValue(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function renderReleaseDiagnostics() {
  if (!releaseDiagnosticsEnabled || !releaseDiagnosticsOutput) return;
  const snapshot = game?.getDiagnosticsSnapshot?.();
  const canUseGame = Boolean(snapshot);
  if (releaseDiagnosticsLoseButton) releaseDiagnosticsLoseButton.disabled = !canUseGame;
  if (releaseDiagnosticsRestoreButton) releaseDiagnosticsRestoreButton.disabled = !canUseGame;

  if (!snapshot) {
    releaseDiagnosticsOutput.textContent = 'ゲーム開始後に診断値を表示します';
    return;
  }

  releaseDiagnosticsOutput.textContent = [
    `画面: ${snapshot.screenPhase}`,
    `WebGL消失: ${snapshot.contextLost ? 'はい' : 'いいえ'}`,
    `描画フレーム: ${snapshot.frameCount}`,
    `描画予約: ${snapshot.scheduledFrames ? 'あり' : 'なし'}`,
    `サイコロ / シーン: ${snapshot.diceCount} / ${snapshot.sceneChildren}`,
    `GPU形状 / テクスチャ: ${formatReleaseDiagnosticValue(snapshot.geometries)} / ${formatReleaseDiagnosticValue(snapshot.textures)}`,
    `直近の描画呼び出し: ${formatReleaseDiagnosticValue(snapshot.renderCalls)}`,
    `アニメーション予約: ${snapshot.animationTasks}`
  ].join('\n');
}

function setupReleaseDiagnostics() {
  if (!releaseDiagnosticsPanel) return;
  releaseDiagnosticsPanel.hidden = !releaseDiagnosticsEnabled;
  if (!releaseDiagnosticsEnabled) return;

  releaseDiagnosticsLoseButton?.addEventListener('click', () => {
    if (!isWebGLRecoveryScreen()) {
      releaseDiagnosticsStatus.textContent = 'ゲーム中に実行してください';
      return;
    }
    const result = game?.forceContextLossForDiagnostics?.();
    releaseDiagnosticsStatus.textContent = result?.ok
      ? 'WebGLを消失させました。5秒後の退避表示、または「WebGLを復元」を確認してください'
      : 'この端末ではWebGL強制消失を実行できません';
    renderReleaseDiagnostics();
  });

  releaseDiagnosticsRestoreButton?.addEventListener('click', () => {
    const result = game?.restoreContextForDiagnostics?.();
    releaseDiagnosticsStatus.textContent = result?.ok
      ? 'WebGLの復元を要求しました。ゲームが同じ状態へ戻るか確認してください'
      : 'WebGL復元を実行できません';
    renderReleaseDiagnostics();
  });

  renderReleaseDiagnostics();
  releaseDiagnosticsTimerId = window.setInterval(renderReleaseDiagnostics, 1_000);
  window.addEventListener('pagehide', () => {
    if (releaseDiagnosticsTimerId === null) return;
    window.clearInterval(releaseDiagnosticsTimerId);
    releaseDiagnosticsTimerId = null;
  }, { once: true });
}

function resetHudDisplay(mode = selectedMode) {
  updateSessionDisplay({
    phase: 'idle',
    remainingMs: mode.durationMs,
    score: 0
  });
  chainCount.textContent = '0';
  chainCount.parentElement.classList.remove('chain-active');
  clearCount.textContent = '0';
}

function getNewGameMode() {
  return getGameMode(DEFAULT_GAME_MODE_ID);
}

function applyModeLabels(mode) {
  modeBrand.textContent = mode.brand;
  homeKicker.textContent = mode.kicker;
  playNoteTitle.textContent = mode.label;
  playNoteText.textContent = mode.id === GAME_MODE_IDS.THREE_HUNDRED_SECONDS
    ? '消したサイコロと同じ数が、ランダムな安全な空きマスに現れる。'
    : '斜めフリックで移動。同じ目を、目の数以上つなげる。';
  const bestScore = bestRecords.getBest(mode.id);
  homeBestScore.textContent = bestScore === null
    ? '記録なし'
    : `${numberFormatter.format(bestScore)}点`;
}

function formatRecordMessage(outcome) {
  return describeBestOutcome(
    outcome,
    (value) => numberFormatter.format(value)
  );
}

function renderResultRecord(outcome) {
  resultRecordMessage.textContent = formatRecordMessage(outcome);
  resultBestScore.textContent = `${numberFormatter.format(outcome.bestScore)}点`;
  resultRecordWarning.hidden = outcome.persisted;
}

function showPlayerNameError(message = '', { invalid = message.length > 0 } = {}) {
  playerNameError.textContent = message;
  playerNameError.hidden = message.length === 0;
  playerNameInput.setAttribute('aria-invalid', String(invalid));
}

function capturePlayerName() {
  const saved = playerProfile.saveName(playerNameInput.value);
  if (!saved.ok) {
    showPlayerNameError(saved.message);
    return null;
  }

  activePlayerName = saved.name;
  playerNameInput.value = saved.name;
  showPlayerNameError(saved.persisted
    ? ''
    : 'この端末へ名前を保存できませんが、今回のランキングには使えます', {
    invalid: false
  });
  return saved.name;
}

function clearRankingRows() {
  resultRankingList.replaceChildren();
}

function notifyPendingRankingChange() {
  try {
    pendingRankingChannel?.postMessage('changed');
  } catch {
    // The local snapshot still updates when cross-tab notification is unavailable.
  }
}

function hasRecoveryRecords(snapshot) {
  return snapshot.corruptedCount > 0
    || snapshot.unverifiedCount > 0
    || snapshot.quarantineCount > 0;
}

function appendRecoveryRecord(record, label, { disabled = false } = {}) {
  const item = document.createElement('li');
  const description = document.createElement('span');
  description.textContent = label;
  const actionId = `recovery-${++recoveryActionCounter}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '確認して削除';
  button.disabled = disabled;
  button.dataset.recoveryAction = actionId;
  recoveryActionRecords.set(actionId, record);
  item.append(description, button);
  pendingRankingRecoveryList.append(item);
}

function renderRecoveryRecords(snapshot) {
  const hasRecovery = hasRecoveryRecords(snapshot);
  recoveryActionRecords.clear();
  pendingRankingRecoveryList.replaceChildren();
  pendingRankingExport.hidden = !hasRecovery;
  pendingRankingRecoveryList.hidden = !hasRecovery;
  pendingRankingRecoveryStatus.hidden = !hasRecovery;
  if (!hasRecovery) {
    pendingRankingRecoveryStatus.textContent = '';
    return;
  }

  const recoveryActionsDisabled = !snapshot.recoveryStorageAvailable;
  for (const record of snapshot.unverifiedItems) {
    appendRecoveryRecord(record, '旧 shared-v1 記録（未検証・自動再送しません）', {
      disabled: recoveryActionsDisabled
    });
  }
  for (const record of snapshot.corruptedItems) {
    appendRecoveryRecord(record, '読み取れない保存データ（元の内容を保持中）', {
      disabled: recoveryActionsDisabled
    });
  }
  for (const record of snapshot.quarantinedItems) {
    appendRecoveryRecord(record, '恒久拒否として隔離した記録（再送しません）', {
      disabled: recoveryActionsDisabled
    });
  }
  pendingRankingRecoveryStatus.textContent = snapshot.recoveryStorageAvailable
    ? '保全データは書き出してから、内容を確認した記録だけ削除できます。'
    : '保全データの読み取りに失敗しました。削除操作は停止しています。';
}

async function renderPendingRankingPanel(message = '') {
  const snapshot = await pendingRankingSubmissions.refresh();
  const hasRecovery = hasRecoveryRecords(snapshot);
  if (snapshot.count === 0 && !hasRecovery) {
    pendingRankingPanel.hidden = true;
    pendingRankingStatus.textContent = '';
    pendingRankingRetry.hidden = true;
    renderRecoveryRecords(snapshot);
    return;
  }

  pendingRankingPanel.hidden = false;
  const statuses = [];
  if (message) {
    statuses.push(message);
  } else if (snapshot.count > 0) {
    statuses.push(snapshot.persisted
      ? `未送信のランキング記録を${snapshot.count}件、端末に保存しています。ゲームはこのまま遊べます`
      : `未送信のランキング記録を${snapshot.count}件、この画面内だけに保持しています。閉じると失われます`);
  }
  if (snapshot.corrupted) {
    statuses.push(
      `確認できない保存データ${snapshot.corruptedCount}件は、上書きせず端末に保持しています`
    );
  }
  if (snapshot.unverified) {
    statuses.push(
      `旧 shared-v1 の未検証記録${snapshot.unverifiedCount}件は、変換・再送せず保全しています`
    );
  }
  if (snapshot.quarantined) {
    statuses.push(
      `恒久拒否として隔離した記録${snapshot.quarantineCount}件は、再送せず保全しています`
    );
  }
  pendingRankingStatus.textContent = statuses.join('。');
  pendingRankingRetry.hidden = snapshot.count === 0;
  pendingRankingRetry.disabled = pendingRankingRetryFlight.active;
  pendingRankingRetry.textContent = pendingRankingRetryFlight.active
    ? '再送中…'
    : '未送信記録を再送';
  renderRecoveryRecords(snapshot);
}

function renderRankingStorageWarning(submission) {
  if (!submission || submission.persisted) {
    resultRankingStorageWarning.hidden = true;
    resultRankingStorageWarning.textContent = '';
    return;
  }

  const messages = {
    'queue-full':
      '未送信記録が上限に達したため、この結果を端末へ保存できませんでした。画面を閉じると失われます。',
    'storage-unavailable':
      'この結果を端末へ保存できませんでした。画面を閉じると失われます。通信に失敗した場合は「記録を再送する」を押してください。',
    'storage-timeout':
      '端末の保存領域の応答が遅いため、結果を一時的に画面へ保持しています。「記録を再送する」を押してください。',
    'submission-conflict':
      '安全な登録番号を確保できなかったため、この結果の送信を止めました。',
    'invalid-submission':
      'この結果を安全な未送信記録として保存できなかったため、送信を止めました。',
    'ticket-unavailable':
      'ランキング送信に失敗しました。結果画面から再試行できます。'
  };
  resultRankingStorageWarning.textContent = messages[submission.pendingSaveCode]
    ?? 'この結果を端末へ保存できませんでした。画面を閉じると失われます。';
  resultRankingStorageWarning.hidden = false;
}

function isBrowserOffline() {
  return globalThis.navigator?.onLine === false;
}

function createDirectSubmissionId() {
  const generated = createSubmissionId();
  if (isValidRankingSubmissionId(generated)) return generated;
  return `direct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

async function exportPendingRankingRecovery() {
  try {
    const content = await pendingRankingSubmissions.exportRecoveryData();
    if (typeof globalThis.Blob !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') {
      pendingRankingRecoveryStatus.textContent =
        'この環境では書き出し機能を使えません。画面を閉じず、別の環境で再試行してください。';
      return;
    }
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const objectUrl = globalThis.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `sainome-ranking-recovery-${Date.now()}.json`;
    anchor.click();
    globalThis.URL.revokeObjectURL(objectUrl);
    pendingRankingRecoveryStatus.textContent = '保全データを書き出しました。内容を確認してから削除してください。';
  } catch (error) {
    console.error(error);
    pendingRankingRecoveryStatus.textContent = '保全データの書き出しに失敗しました。記録は保持しています。';
  }
}

async function deletePendingRankingRecovery(actionId) {
  if (recoveryActionPending) return;
  const record = recoveryActionRecords.get(actionId);
  if (!record || typeof globalThis.confirm !== 'function') return;
  if (!globalThis.confirm('この保全データを書き出して内容を確認しましたか？削除後は元に戻せません。')) {
    return;
  }

  recoveryActionPending = true;
  try {
    const result = await pendingRankingSubmissions.deleteRecoveryRecord(record);
    pendingRankingRecoveryStatus.textContent = result.removed
      ? '確認した保全データを削除しました。'
      : '保全データを削除できませんでした。元の内容は保持しています。';
    if (result.removed) notifyPendingRankingChange();
  } catch (error) {
    console.error(error);
    pendingRankingRecoveryStatus.textContent = '保全データの削除に失敗しました。元の内容は保持しています。';
  } finally {
    recoveryActionPending = false;
    await renderPendingRankingPanel();
  }
}

async function retryStoredRankingSubmissions() {
  let finalMessage = '';
  try {
    const flight = await pendingRankingRetryFlight.run(async () => {
      const initial = await pendingRankingSubmissions.refresh();
      if (initial.count === 0) return '';
      if (isBrowserOffline()) {
        return '現在オフラインのため送信を開始しません。接続後に「未送信記録を再送」を押してください';
      }
      if (!rankingClient) {
        return 'ランキングへ接続できないため、未送信記録を端末に保持しています';
      }

      const batchSize = Math.min(MAX_MANUAL_PENDING_RETRIES, initial.items.length);
      const startIndex = pendingRankingRetryCursor % initial.items.length;
      const batch = Array.from({ length: batchSize }, (_, offset) =>
        initial.items[(startIndex + offset) % initial.items.length]);
      pendingRankingRetryCursor = (startIndex + batchSize) % initial.items.length;
      await renderPendingRankingPanel(`未送信記録${batch.length}件を再送しています…`);
      let retryErrors = 0;
      let cleanupErrors = 0;
      let acceptedCount = 0;
      let quarantinedCount = 0;

      for (const submission of batch) {
        try {
          const { cleanup } = submission.kind === 'direct-name'
            ? await submitPendingDirectRanking({
              rankingClient,
              pendingSubmissions: pendingRankingSubmissions,
              submission
            })
            : await submitPendingRanking({
              rankingClient,
              pendingSubmissions: pendingRankingSubmissions,
              submission
            });
          if (cleanup.ok) acceptedCount += 1;
          else cleanupErrors += 1;
        } catch (error) {
          console.error(error);
          if (classifyRankingFailure(error) === 'permanent') {
            const isolated = await pendingRankingSubmissions.quarantine(submission, {
              reason: 'ranking-submit-permanent-rejection',
              code: error?.serverCode ?? error?.code ?? 'request-rejected'
            });
            if (isolated.ok) {
              quarantinedCount += 1;
              continue;
            }
          }
          retryErrors += 1;
        }
      }

      if (acceptedCount + cleanupErrors + quarantinedCount > 0) notifyPendingRankingChange();
      const messages = [];
      if (acceptedCount > 0) messages.push(`${acceptedCount}件を登録しました`);
      if (quarantinedCount > 0) messages.push(`${quarantinedCount}件を恒久拒否として隔離しました`);
      if (cleanupErrors > 0) {
        messages.push(`${cleanupErrors}件は登録を確認しましたが、端末表示を更新できませんでした`);
      }
      if (retryErrors > 0) {
        messages.push(`${retryErrors}件は通信失敗のため未送信のまま保持しています`);
      }
      return messages.join('。');
    });
    if (!flight.started) return;
    finalMessage = flight.value;
  } catch (error) {
    console.error(error);
    finalMessage = '再送処理を完了できませんでした。未送信記録は保持しています';
  }
  await renderPendingRankingPanel(finalMessage);
}

function renderRankingRows(rows) {
  clearRankingRows();
  for (const row of rows) {
    const item = document.createElement('li');
    item.classList.toggle('is-current-player', row.isCurrentUser === true);

    const position = document.createElement('span');
    position.className = 'ranking-position';
    position.textContent = `${row.rank}位`;

    const name = document.createElement('bdi');
    name.className = 'ranking-name';
    name.dir = 'auto';
    name.textContent = row.displayName;

    const score = document.createElement('span');
    score.className = 'ranking-score';
    score.textContent = `${numberFormatter.format(row.score)}点`;

    item.append(position, name, score);
    resultRankingList.append(item);
  }
}

function isCurrentRankingSubmission(submission) {
  if (!submission) return false;
  const snapshot = flow.getSnapshot();
  return latestRankingSubmission?.runId === submission.runId
    && snapshot.screen === SCREEN_PHASES.RESULT
    && snapshot.result === submission.result;
}

function setRankingPending(submission, pending) {
  if (pending) rankingPendingRunIds.add(submission.runId);
  else rankingPendingRunIds.delete(submission.runId);

  if (!isCurrentRankingSubmission(submission)) return;
  resultRankingRetry.disabled = pending;
  if (pending) resultRankingRetry.textContent = '通信中…';
}

function setResultRankingRetryAction(action, label = '') {
  resultRankingRetryAction = action;
  resultRankingRetry.hidden = !action;
  if (label) resultRankingRetry.textContent = label;
}

async function syncResultRanking(submission, { submit = true } = {}) {
  if (!submission || rankingPendingRunIds.has(submission.runId)) return;
  if (submit && isBrowserOffline()) {
    if (isCurrentRankingSubmission(submission)) {
      resultRankingStatus.textContent =
        '現在オフラインのため記録を送信できません。接続後に「記録を再送する」を押してください';
      setResultRankingRetryAction('submit', '記録を再送する');
    }
    return;
  }

  setRankingPending(submission, true);
  updateIfCurrentRankingSubmission({
    submission,
    isCurrent: isCurrentRankingSubmission,
    update: () => {
      setResultRankingRetryAction(null);
      resultRankingStatus.textContent = submit
        ? '記録を送信しています…'
        : 'ランキングを読み込んでいます…';
    }
  });

  let currentSubmission = submission;
  let submitOutcome = submission.acceptedOutcome ?? null;
  let submitError = null;
  let rankingRows = null;
  let rankingError = null;

  let cleanupError = null;
  if (submit) {
    if (submission.canSubmit === false) {
      submitError = new Error('ranking submission is not safe to send');
    } else {
      try {
        if (!rankingClient) throw new Error('Ranking client is unavailable');
        submitOutcome = await rankingClient.submitScoreDirect({
          displayName: submission.displayName,
          modeId: submission.result.modeId,
          score: submission.result.score
        });
        currentSubmission = Object.freeze({
          ...submission,
          acceptedOutcome: submitOutcome,
          canSubmit: false
        });
        if (submission.kind === 'direct-name') {
          try {
            const cleanup = await pendingRankingSubmissions.markAccepted(currentSubmission);
            if (!cleanup.ok) cleanupError = cleanup;
          } catch (error) {
            console.error(error);
            cleanupError = { ok: false, code: 'storage-unavailable' };
          }
        }
        if (latestRankingSubmission?.runId === submission.runId) {
          latestRankingSubmission = currentSubmission;
        }
      } catch (error) {
        console.error(error);
        submitError = error;
      }
    }
  }

  if (!isBrowserOffline()) {
    try {
      if (!rankingClient) throw new Error('Ranking client is unavailable');
      rankingRows = await rankingClient.getTopRanking(currentSubmission.result.modeId);
    } catch (error) {
      console.error(error);
      rankingError = error;
    }
  }

  if (!isCurrentRankingSubmission(currentSubmission)) {
    setRankingPending(currentSubmission, false);
    return;
  }

  setRankingPending(currentSubmission, false);
  renderRankingStorageWarning(submitError ? currentSubmission : null);
  if (rankingRows) renderRankingRows(rankingRows);
  else clearRankingRows();

  if (submitError) {
    resultRankingStatus.textContent = rankingRows
      ? 'ランキングは表示しましたが、今回の記録を送信できませんでした'
      : '記録を送信できませんでした。通信状態を確認してください';
    const canRetrySubmit = submission.canSubmit !== false && !submission.acceptedOutcome;
    setResultRankingRetryAction(
      canRetrySubmit ? 'submit' : null,
      canRetrySubmit ? '記録を再送する' : ''
    );
  } else if (cleanupError) {
    resultRankingStatus.textContent =
      '記録は登録しましたが、端末の未送信表示を更新できませんでした';
    setResultRankingRetryAction('cleanup', '登録状態を再確認');
  } else if (rankingError) {
    resultRankingStatus.textContent = submitOutcome
      ? '記録は登録しましたが、ランキングを読み込めませんでした'
      : 'ランキングを読み込めませんでした';
    setResultRankingRetryAction('ranking', 'ランキングを再読込');
  } else if (submitOutcome?.isFirstPlay) {
    resultRankingStatus.textContent = '初回記録を登録しました';
    setResultRankingRetryAction(null);
  } else if (submitOutcome?.isNewBest) {
    resultRankingStatus.textContent = 'ランキングの自己ベストを更新しました';
    setResultRankingRetryAction(null);
  } else if (submitOutcome) {
    resultRankingStatus.textContent = '記録を登録しました';
    setResultRankingRetryAction(null);
  } else {
    resultRankingStatus.textContent = rankingRows?.length
      ? 'ランキングを読み込みました'
      : 'ランキングに記録がありません';
    setResultRankingRetryAction(null);
  }
}

async function retryAcceptedResultCleanup(submission) {
  if (!submission?.acceptedOutcome || rankingPendingRunIds.has(submission.runId)) return;
  setRankingPending(submission, true);
  updateIfCurrentRankingSubmission({
    submission,
    isCurrent: isCurrentRankingSubmission,
    update: () => {
      setResultRankingRetryAction(null);
      resultRankingStatus.textContent = '登録状態を確認しています…';
    }
  });

  let cleanup;
  try {
    cleanup = await pendingRankingSubmissions.markAccepted(submission);
  } catch (error) {
    console.error(error);
    cleanup = { ok: false, code: 'storage-unavailable' };
  }
  if (!isCurrentRankingSubmission(submission)) {
    setRankingPending(submission, false);
    return;
  }
  setRankingPending(submission, false);
  if (!cleanup.ok) {
    resultRankingStatus.textContent =
      '端末の未送信表示を更新できませんでした。記録は登録済みとして保持しています';
    setResultRankingRetryAction('cleanup', '登録状態を再確認');
    return;
  }

  notifyPendingRankingChange();
  await renderPendingRankingPanel();
  setResultRankingRetryAction(null);
  await syncResultRanking(submission, { submit: false });
}

function setResultSharePending(pending) {
  resultSharePending = pending;
  resultShareButton.disabled = pending;
  replayButton.disabled = pending || startPending;
  resultHomeButton.disabled = pending;
  resultShareButton.textContent = pending ? '共有中…' : '結果をシェア';
}

function setStartPending(pending) {
  startPending = pending;
  startButton.disabled = pending;
  replayButton.disabled = pending || resultSharePending;
  tutorialButton.disabled = pending;
  tutorialHomeButton.disabled = pending;
  tutorialNextButton.disabled = pending;
  gameRecoveryResume.disabled = pending || gameStateOperationPending;
  gameRecoveryDiscard.disabled = pending || gameStateOperationPending;
  pauseButton.disabled = pending;
  resumeButton.disabled = pending;
  retireButton.disabled = pending;
  playerNameInput.disabled = pending;
  startButton.textContent = pending ? '3D盤面を準備中…' : 'ゲーム開始';
  replayButton.textContent = pending ? '準備中…' : 'もう一度';
  app.setAttribute('aria-busy', String(pending));
  renderTutorial();
}

function pulse(element, className) {
  if (motionPreferences.reducedMotion) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 380);
}

function updateSessionDisplay(snapshot) {
  const seconds = formatRemainingSeconds(snapshot.remainingMs);
  remainingTime.textContent = snapshot.phase === 'finishing' ? '…' : String(seconds);
  scoreCount.textContent = numberFormatter.format(snapshot.score);
  timePanel.classList.toggle(
    'time-warning',
    snapshot.phase === 'running' && seconds > 0 && seconds <= 10
  );
}

function renderSoundToggle(snapshot = soundEffects.getSnapshot()) {
  soundToggle.setAttribute('aria-pressed', String(snapshot.enabled));
  soundToggle.setAttribute(
    'aria-label',
    snapshot.enabled ? '効果音をオフにする' : '効果音をオンにする'
  );
  soundToggleIcon.textContent = snapshot.enabled ? '🔊' : '🔇';
  soundToggleLabel.textContent = snapshot.enabled ? '効果音 オン' : '効果音 オフ';
}

async function preserveFinishedRanking(provisional) {
  let prepared;
  try {
    prepared = await prepareDirectRankingSubmission({
      pendingSubmissions: pendingRankingSubmissions,
      displayName: provisional.displayName,
      result: provisional.result,
      now: () => Date.now(),
      submissionId: createDirectSubmissionId()
    });
    prepared = Object.freeze({
      ...prepared,
      runId: provisional.runId
    });
  } catch (error) {
    console.error(error);
    prepared = Object.freeze({
      ...provisional,
      canSubmit: false,
      persisted: false,
      pendingSaveCode: 'invalid-submission'
    });
  }

  if (latestRankingSubmission?.runId === provisional.runId) {
    latestRankingSubmission = prepared;
    renderRankingStorageWarning(prepared);
    resultRankingStatus.textContent = '記録を送信しています…';
    setResultRankingRetryAction(null);
  }
  await syncResultRanking(prepared);
}

function formatSavedGameSummary(state) {
  const mode = getGameMode(state.game.modeId);
  const seconds = formatRemainingSeconds(
    Math.max(0, mode.durationMs - state.game.session.elapsedMs)
  );
  return `${mode.label}・残り${seconds}秒・${numberFormatter.format(state.game.session.score)}点`;
}

function renderGameRecovery() {
  gameRecoveryResume.textContent = '続きから再開';
  gameRecoveryDiscard.textContent = '保存を削除';
  if (!savedGameRecovery) {
    gameRecoveryPanel.hidden = true;
    gameRecoveryStatus.textContent = '';
    gameRecoveryResume.disabled = false;
    gameRecoveryDiscard.disabled = false;
    return;
  }

  gameRecoveryPanel.hidden = false;
  if (savedGameRecovery.unavailable) {
    gameRecoveryResume.textContent = '保存を再確認';
    gameRecoveryResume.disabled = gameStateOperationPending;
    gameRecoveryDiscard.disabled = true;
    gameRecoveryStatus.textContent =
      '保存領域を確認できないため、新しいプレイを開始できません。保存を再確認してください';
    return;
  }
  if (savedGameRecovery.invalid) {
    gameRecoveryResume.disabled = true;
    gameRecoveryDiscard.disabled = gameStateOperationPending;
    gameRecoveryStatus.textContent =
      '前回のプレイ保存を確認できません。削除するまで新しい保存を上書きしません';
    return;
  }
  gameRecoveryResume.disabled = gameStateOperationPending;
  gameRecoveryDiscard.disabled = gameStateOperationPending;
  gameRecoveryStatus.textContent = formatSavedGameSummary(savedGameRecovery.state);
}

function enqueueGameStateOperation(action) {
  const operation = gameStateOperation.then(action, action);
  gameStateOperation = operation.catch((error) => {
    console.error(error);
  });
  return operation;
}

function createPersistedGameState(snapshot) {
  return {
    version: GAME_STATE_VERSION,
    savedAt: Date.now(),
    displayName: activePlayerName,
    playTicket: activePlayTicket,
    game: snapshot
  };
}

function requestGameStateSave(snapshot) {
  if (!snapshot || flow.getSnapshot().screen !== SCREEN_PHASES.PLAYING) return;
  const persisted = createPersistedGameState(snapshot);
  void enqueueGameStateOperation(async () => {
    const result = await gameStateStorage.save(persisted);
    if (result.ok) {
      const hadSavedGame = Boolean(savedGameRecovery?.serialized);
      savedGameRecovery = { state: persisted, serialized: result.serialized };
      if (!hadSavedGame) notifyGameStateChange();
    } else {
      message.textContent = 'プレイ状態を端末へ保存できません。画面を閉じないでください';
    }
    return result;
  }).catch((error) => {
    console.error(error);
    message.textContent = 'プレイ状態を端末へ保存できません。画面を閉じないでください';
  });
}

async function clearGameState(expectedSerialized = null) {
  let result;
  try {
    result = await enqueueGameStateOperation(() =>
      gameStateStorage.clear({ expectedSerialized })
    );
  } catch (error) {
    console.error(error);
    result = { status: 'unavailable', error };
  }
  if (result.status === 'removed' || result.status === 'not-found') {
    savedGameRecovery = null;
    renderGameRecovery();
    notifyGameStateChange();
  }
  return result;
}

async function clearFinishedGameState() {
  let result;
  try {
    result = await enqueueGameStateOperation(() => {
      const expectedSerialized = savedGameRecovery?.serialized ?? null;
      if (!expectedSerialized) return { status: 'not-found' };
      return gameStateStorage.clear({ expectedSerialized });
    });
  } catch (error) {
    console.error(error);
    result = { status: 'unavailable', error };
  }
  if (result.status === 'removed' || result.status === 'not-found') {
    savedGameRecovery = null;
    renderGameRecovery();
    notifyGameStateChange();
  }
  return result;
}

async function loadGameRecovery({ force = false } = {}) {
  if (force) gameRecoveryLoaded = false;
  if (gameRecoveryLoaded) return;
  if (gameRecoveryLoadPromise) return gameRecoveryLoadPromise;

  gameRecoveryLoadPromise = (async () => {
    const loaded = await gameStateStorage.load();
    if (loaded.status === 'available') {
      savedGameRecovery = loaded;
      if (
        !startPending
        && flow.getSnapshot().screen === SCREEN_PHASES.HOME
        && playerNameInput.value === activePlayerName
      ) {
        playerNameInput.value = loaded.state.displayName;
      }
    } else if (loaded.status === 'invalid' && loaded.serialized) {
      savedGameRecovery = { invalid: true, serialized: loaded.serialized };
    } else if (loaded.status === 'unavailable') {
      savedGameRecovery = { unavailable: true };
    } else {
      savedGameRecovery = null;
    }
    renderGameRecovery();
    gameRecoveryLoaded = true;
  })();

  try {
    await gameRecoveryLoadPromise;
  } finally {
    gameRecoveryLoadPromise = null;
  }
}

function isWebGLRecoveryScreen(screen = flow.getSnapshot().screen) {
  return screen === SCREEN_PHASES.COUNTDOWN
    || screen === SCREEN_PHASES.PLAYING
    || screen === SCREEN_PHASES.PAUSED;
}

function clearWebGLRecoveryTimer() {
  if (webglRecoveryTimerId === null) return;
  window.clearTimeout(webglRecoveryTimerId);
  webglRecoveryTimerId = null;
}

function renderWebGLRecovery() {
  webglRecoveryPanel.hidden = !webglRecoveryVisible;
  webglRecoveryRecreate.disabled = webglRecoveryActionPending;
  webglRecoveryHome.disabled = webglRecoveryActionPending;
}

function hideWebGLRecovery() {
  webglRecoveryRunId += 1;
  clearWebGLRecoveryTimer();
  webglRecoveryVisible = false;
  webglRecoveryActionPending = false;
  webglRecoveryStatus.textContent = '';
  renderWebGLRecovery();
}

function showWebGLRecovery(messageText) {
  if (!isWebGLRecoveryScreen()) return;
  clearWebGLRecoveryTimer();
  webglRecoveryVisible = true;
  webglRecoveryActionPending = false;
  webglRecoveryStatus.textContent = messageText;
  renderWebGLRecovery();
  window.setTimeout(() => webglRecoveryRecreate.focus(), 0);
}

function beginWebGLRecovery() {
  if (!isWebGLRecoveryScreen()) return;
  webglRecoveryRunId += 1;
  const runId = webglRecoveryRunId;
  clearWebGLRecoveryTimer();
  webglRecoveryVisible = true;
  webglRecoveryActionPending = true;
  webglRecoveryStatus.textContent = '3D表示を復元しています…操作を一時停止します';
  renderWebGLRecovery();
  webglRecoveryTimerId = window.setTimeout(() => {
    webglRecoveryTimerId = null;
    if (runId !== webglRecoveryRunId) return;
    showWebGLRecovery(
      '3D表示を自動復元できません。保存地点は端末に残しています。'
    );
  }, WEBGL_RECOVERY_WAIT_MS);
}

function handleWebGLContextRestored() {
  if (!isWebGLRecoveryScreen()) {
    hideWebGLRecovery();
    return;
  }
  hideWebGLRecovery();
  renderFlow();
  if (flow.getSnapshot().screen === SCREEN_PHASES.COUNTDOWN) {
    scheduleCountdown(countdownRunId);
  }
}

function handleWebGLRecoveryFailed() {
  showWebGLRecovery(
    '3D表示の資源を作り直せませんでした。保存地点は端末に残しています。'
  );
}

async function resumeSavedGame() {
  if (gameStateOperationPending) return;
  gameStateOperationPending = true;
  renderGameRecovery();
  setStartPending(true);
  try {
    const loaded = await gameStateStorage.load();
    if (loaded.status !== 'available') {
      if (loaded.status === 'invalid' && loaded.serialized) {
        savedGameRecovery = { invalid: true, serialized: loaded.serialized };
        gameRecoveryLoaded = true;
      } else if (loaded.status === 'unavailable') {
        savedGameRecovery = { unavailable: true };
        gameRecoveryLoaded = false;
      } else {
        savedGameRecovery = null;
        gameRecoveryLoaded = true;
      }
      renderGameRecovery();
      showHomeStartError(loaded.status === 'unavailable'
        ? '保存領域を確認できないため、新しいゲームを開始しません。保存を再確認してください'
        : '前回のプレイを復元できませんでした。保存データは削除していません。');
      return;
    }

    const saved = loaded.state;
    const mode = getGameMode(saved.game.modeId);
    if (!canStartWebGLGame()) return;
    const ready = await ensureGame(mode.id);
    if (!ready) return;

    activeMode = mode;
    selectedMode = mode;
    activePlayerName = saved.displayName;
    activePlayTicket = saved.playTicket;
    playerNameInput.value = saved.displayName;
    applyModeLabels(mode);
    resetHudDisplay(mode);
    game.restoreState(saved.game);
    const snapshot = flow.resumePlaying();
    if (!snapshot) throw new Error('ゲーム画面を再開できませんでした');
    savedGameRecovery = loaded;
    renderFlow(snapshot);
    game.emitStateSnapshot();
  } catch (error) {
    console.error(error);
    showHomeStartError('前回のプレイを復元できませんでした。保存データは削除していません。');
  } finally {
    gameStateOperationPending = false;
    setStartPending(false);
    renderGameRecovery();
  }
}

async function discardSavedGame() {
  if (gameStateOperationPending) return;
  const expectedSerialized = savedGameRecovery?.serialized ?? null;
  if (!expectedSerialized) return;
  if (
    typeof globalThis.confirm === 'function'
    && !globalThis.confirm('前回のプレイ保存を削除しますか？削除後は復元できません。')
  ) return;
  gameStateOperationPending = true;
  renderGameRecovery();
  try {
    const result = await clearGameState(expectedSerialized);
    if (result.status === 'conflict') {
      gameRecoveryStatus.textContent = '別の保存状態が作られたため、削除を止めました。画面を更新して確認してください';
    }
  } catch (error) {
    console.error(error);
    gameRecoveryStatus.textContent = '保存を削除できませんでした。元のデータを保持しています';
  } finally {
    gameStateOperationPending = false;
    renderGameRecovery();
  }
}

const gameCallbacks = {
  onRoll: () => {},
  onMove: () => {
    soundEffects.playFlick();
  },
  onRollStart: () => {
    soundEffects.playRoll();
  },
  onClearStart: ({ chain }) => {
    soundEffects.playClear({ chain });
  },
  onSpawn: ({ count }) => {
    soundEffects.playSpawn({ count });
  },
  onChain: ({ chain, isChain }) => {
    chainCount.textContent = String(chain);
    chainCount.parentElement.classList.toggle('chain-active', chain > 0);
    if (chain > 0 && !motionPreferences.reducedMotion) {
      stage.classList.remove('chain-hit');
      void stage.offsetWidth;
      stage.classList.add('chain-hit');
      window.setTimeout(() => stage.classList.remove('chain-hit'), isChain ? 430 : 300);
    }
  },
  onClear: (count) => {
    clearCount.textContent = String(count);
  },
  onMessage: (text) => {
    message.textContent = text;
  },
  onImpact: () => {
    if (!motionPreferences.reducedMotion) {
      stage.classList.remove('impact');
      void stage.offsetWidth;
      stage.classList.add('impact');
      window.setTimeout(() => stage.classList.remove('impact'), 180);
    }
    if (!motionPreferences.reducedMotion && navigator.vibrate) {
      navigator.vibrate(18);
    }
  },
  onScore: () => {
    pulse(scorePanel, 'score-hit');
  },
  onSessionChange: (snapshot) => {
    updateSessionDisplay(snapshot);
  },
  onStateSnapshot: (snapshot) => {
    requestGameStateSave(snapshot);
  },
  onContextLost: () => {
    if (!isWebGLRecoveryScreen()) return;
    pointerStart = null;
    cancelCountdown();
    beginWebGLRecovery();
  },
  onContextRestored: () => {
    handleWebGLContextRestored();
  },
  onContextRecoveryFailed: () => {
    handleWebGLRecoveryFailed();
  },
  onFinish: (result) => {
    const next = flow.finish(result);
    if (!next) return;
    setStartPending(true);
    const gameStateCleanup = clearFinishedGameState();
    activePlayTicket = null;
    latestRecordOutcome = bestRecords.recordResult(next.result);
    const provisional = Object.freeze({
      runId: ++rankingRunId,
      displayName: activePlayerName,
      result: next.result,
      persisted: true,
      pendingSaveCode: null,
      canSubmit: true
    });
    latestRankingSubmission = provisional;
    clearRankingRows();
    renderFlow(next);
    renderRankingStorageWarning(null);
    resultRankingStatus.textContent = '記録を端末へ保存しています…';
    setResultRankingRetryAction(null);
    void preserveFinishedRanking(provisional);
    void gameStateCleanup.finally(() => {
      setStartPending(false);
      if (
        flow.getSnapshot().screen === SCREEN_PHASES.RESULT
        && latestRankingSubmission === provisional
      ) {
        window.setTimeout(() => replayButton.focus(), 0);
      }
    });
  }
};

async function createGameInstance(initialModeId = DEFAULT_GAME_MODE_ID) {
  if (!gameLoadPromise) {
    gameLoadPromise = import('./webgl-game.js')
      .then(({ WebGLSainome }) => WebGLSainome);
  }
  const WebGLSainome = await gameLoadPromise;
  game = new WebGLSainome(canvas, gameCallbacks, initialModeId, {
    shouldReduceMotion: () => motionPreferences.reducedMotion
  });
  loading.classList.add('hidden');
  return game;
}

function disposeGameInstance({ replaceCanvas = false } = {}) {
  const previousCanvas = canvas;
  game?.dispose?.();
  game = null;
  if (!replaceCanvas) return;

  const nextCanvas = document.createElement('canvas');
  nextCanvas.id = 'game-canvas';
  nextCanvas.tabIndex = -1;
  previousCanvas.replaceWith(nextCanvas);
  canvas = nextCanvas;
}

async function ensureGame(initialModeId = DEFAULT_GAME_MODE_ID) {
  if (game) return true;

  try {
    await createGameInstance(initialModeId);
    return true;
  } catch (error) {
    console.error(error);
    gameLoadPromise = null;
    loading.classList.add('hidden');
    homeError.textContent = WEBGL_LOAD_FAILURE_MESSAGE;
    homeError.hidden = false;
    return false;
  }
}

async function recreateWebGLGame() {
  if (webglRecoveryActionPending) return;
  const phase = flow.getSnapshot().screen;
  if (!isWebGLRecoveryScreen(phase)) return;

  webglRecoveryActionPending = true;
  renderWebGLRecovery();
  let loaded = null;

  try {
    if (
      phase === SCREEN_PHASES.PLAYING
      || phase === SCREEN_PHASES.PAUSED
    ) {
      loaded = await gameStateStorage.load();
      if (loaded.status !== 'available') {
        if (loaded.status === 'invalid' && loaded.serialized) {
          savedGameRecovery = { invalid: true, serialized: loaded.serialized };
        }
        renderGameRecovery();
        throw new Error('A saved gameplay state is unavailable');
      }
    }

    disposeGameInstance({ replaceCanvas: true });
    const ready = await ensureGame(
      phase === SCREEN_PHASES.PLAYING || phase === SCREEN_PHASES.PAUSED
        ? loaded.state.game.modeId
        : activeMode.id
    );
    if (!ready) throw new Error('WebGL recreation failed');

    if (phase === SCREEN_PHASES.PLAYING || phase === SCREEN_PHASES.PAUSED) {
      const saved = loaded.state;
      const mode = getGameMode(saved.game.modeId);
      activeMode = mode;
      selectedMode = mode;
      activePlayerName = saved.displayName;
      activePlayTicket = saved.playTicket;
      playerNameInput.value = saved.displayName;
      applyModeLabels(mode);
      resetHudDisplay(mode);
      game.restoreState(saved.game);
      game.setPaused(phase === SCREEN_PHASES.PAUSED);
      savedGameRecovery = loaded;
      renderFlow(flow.getSnapshot());
      game.emitStateSnapshot();
      renderGameRecovery();
    } else {
      renderFlow(flow.getSnapshot());
    }

    hideWebGLRecovery();
    if (phase === SCREEN_PHASES.COUNTDOWN) {
      scheduleCountdown(countdownRunId);
    }
  } catch (error) {
    console.error(error);
    showWebGLRecovery(
      '3D表示を再生成できませんでした。保存地点を残したまま、ホームへ戻れます。'
    );
  } finally {
    webglRecoveryActionPending = false;
    if (webglRecoveryVisible) renderWebGLRecovery();
  }
}

async function leaveWebGLRecoveryForHome() {
  if (webglRecoveryActionPending) return;
  webglRecoveryActionPending = true;
  renderWebGLRecovery();
  cancelCountdown();
  pointerStart = null;
  const pendingStateOperation = gameStateOperation;
  disposeGameInstance({ replaceCanvas: true });
  hideWebGLRecovery();
  renderFlow(flow.goHome());
  renderGameRecovery();
  void pendingStateOperation.then(() => {
    if (flow.getSnapshot().screen === SCREEN_PHASES.HOME) renderGameRecovery();
  });
  window.setTimeout(() => startButton.focus(), 0);
}

function renderFlow(snapshot = flow.getSnapshot()) {
  if (
    snapshot.screen === SCREEN_PHASES.HOME
    && selectedMode.id !== DEFAULT_GAME_MODE_ID
  ) {
    selectedMode = getNewGameMode();
    applyModeLabels(selectedMode);
    resetHudDisplay(selectedMode);
  }
  app.dataset.screen = snapshot.screen;
  game?.setScreenPhase(snapshot.screen);
  if (!isWebGLRecoveryScreen(snapshot.screen)) hideWebGLRecovery();
  homeScreen.hidden = snapshot.screen !== SCREEN_PHASES.HOME;
  tutorialScreen.hidden = snapshot.screen !== SCREEN_PHASES.TUTORIAL;
  countdownScreen.hidden = snapshot.screen !== SCREEN_PHASES.COUNTDOWN;
  pauseScreen.hidden = snapshot.screen !== SCREEN_PHASES.PAUSED;
  resultScreen.hidden = snapshot.screen !== SCREEN_PHASES.RESULT;
  pauseButton.hidden = snapshot.screen !== SCREEN_PHASES.PLAYING;
  playNote.hidden = snapshot.screen !== SCREEN_PHASES.PLAYING;

  if (snapshot.screen === SCREEN_PHASES.TUTORIAL) renderTutorial();

  if (snapshot.screen === SCREEN_PHASES.COUNTDOWN) {
    countdownValue.textContent = String(snapshot.countdown);
  }

  if (snapshot.screen === SCREEN_PHASES.RESULT && snapshot.result) {
    const resultMode = getGameMode(snapshot.result.modeId);
    resultShareStatus.textContent = '';
    const resultReason = snapshot.result.endedReason === 'retired'
      ? 'RETIRED'
      : 'TIME UP';
    resultKicker.textContent = `${resultMode.label}モード · ${resultReason}`;
    resultRankingTitle.textContent = `${resultMode.label}ランキング`;
    resultPlayerName.textContent = latestRankingSubmission?.displayName ?? activePlayerName;
    resultScore.textContent = numberFormatter.format(snapshot.result.score);
    resultCleared.textContent = numberFormatter.format(snapshot.result.clearedDice);
    resultChain.textContent = numberFormatter.format(snapshot.result.maxChain);
    if (latestRecordOutcome) renderResultRecord(latestRecordOutcome);
  }
}

async function handleResultShare() {
  const snapshot = flow.getSnapshot();
  if (
    resultSharePending
    || snapshot.screen !== SCREEN_PHASES.RESULT
    || !snapshot.result
    || !latestRecordOutcome
  ) return;

  setResultSharePending(true);
  resultShareStatus.textContent = '';

  try {
    const content = createResultShareContent({
      result: snapshot.result,
      recordMessage: formatRecordMessage(latestRecordOutcome),
      pageUrl: window.location.href,
      formatNumber: (value) => numberFormatter.format(value)
    });
    const status = await shareResult(content);
    const messages = {
      [RESULT_SHARE_STATUSES.SHARED]: 'ゲーム結果を共有しました',
      [RESULT_SHARE_STATUSES.COPIED]: 'シェア文をコピーしました',
      [RESULT_SHARE_STATUSES.CANCELLED]: '共有をキャンセルしました',
      [RESULT_SHARE_STATUSES.FAILED]: 'コピーできませんでした'
    };
    resultShareStatus.textContent = messages[status];
  } catch (error) {
    console.error(error);
    resultShareStatus.textContent = 'コピーできませんでした';
  } finally {
    setResultSharePending(false);
  }
}

function renderTutorial(snapshot = tutorial.getSnapshot()) {
  tutorialSlideElements.forEach((slide, index) => {
    slide.hidden = index !== snapshot.index;
  });
  tutorialDots.forEach((dot, index) => {
    dot.classList.toggle('is-active', index === snapshot.index);
  });

  const currentSlide = tutorialSlideElements[snapshot.index];
  tutorialTitle.textContent = currentSlide.dataset.title;
  tutorialProgress.textContent = `${snapshot.number} / ${snapshot.count}`;
  tutorialPreviousButton.disabled = startPending || snapshot.isFirst;
  tutorialNextButton.disabled = startPending;
  let nextLabel = snapshot.isLast
    ? `${selectedMode.label}で始める`
    : '次へ';
  if (startPending) nextLabel = '3D盤面を準備中…';
  tutorialNextButton.textContent = nextLabel;
}

function pauseCountdownTimer() {
  if (countdownTimerId === null) return;
  window.clearTimeout(countdownTimerId);
  countdownTimerId = null;
}

function cancelCountdown() {
  countdownRunId += 1;
  pauseCountdownTimer();
}

function scheduleCountdown(runId) {
  if (document.hidden || webglRecoveryVisible || countdownTimerId !== null) return;
  countdownTimerId = window.setTimeout(() => {
    countdownTimerId = null;
    if (runId !== countdownRunId || document.hidden || webglRecoveryVisible) return;
    const transition = flow.advanceCountdown();
    renderFlow(transition.snapshot);

    if (transition.started) {
      if (!game.startSession()) {
        cancelCountdown();
        activePlayTicket = null;
        showHomeStartError('ゲームを開始できませんでした。もう一度お試しください。');
        return;
      }
      message.textContent = '盤面に沿って斜めにフリック';
      canvas.focus({ preventScroll: true });
      return;
    }

    scheduleCountdown(runId);
  }, 1000);
}

function showHomeStartError(errorMessage) {
  loading.classList.add('hidden');
  homeError.textContent = errorMessage;
  homeError.hidden = false;
  if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) {
    renderFlow(flow.goHome());
  }
  window.setTimeout(() => startButton.focus(), 0);
}

function canStartWebGLGame() {
  if (game?.contextLost) {
    disposeGameInstance({ replaceCanvas: true });
  }
  if (game) return true;

  const support = checkWebGL2Support();
  if (support.available) return true;

  showHomeStartError(WEBGL_UNAVAILABLE_MESSAGE);
  return false;
}

async function startRound() {
  if (startPending || flow.getSnapshot().screen === SCREEN_PHASES.COUNTDOWN) return;
  const roundPlayerName = capturePlayerName();
  if (!roundPlayerName) {
    if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) renderFlow(flow.goHome());
    window.setTimeout(() => playerNameInput.focus(), 0);
    return;
  }
  if (!canStartWebGLGame()) return;
  void soundEffects.unlock();
  const roundMode = getNewGameMode();
  setStartPending(true);
  homeError.hidden = true;

  try {
    await loadGameRecovery({ force: true });
  } catch (error) {
    console.error(error);
    setStartPending(false);
    showHomeStartError('前回のプレイ保存を確認できないため、新しいゲームを開始しません');
    return;
  }

  if (savedGameRecovery) {
    setStartPending(false);
    renderGameRecovery();
    showHomeStartError(savedGameRecovery.unavailable
      ? '保存領域を確認できないため、新しいゲームを開始しません。保存を再確認してください'
      : savedGameRecovery.invalid
        ? '確認できない保存データがあるため、新しい保存を上書きしません。先に保存を削除してください'
        : '前回のプレイ保存があります。「続きから再開」するか、保存を明示的に削除してから新しいゲームを始めてください');
    return;
  }

  const ready = await ensureGame(roundMode.id);
  if (!ready) {
    setStartPending(false);
    if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) {
      renderFlow(flow.goHome());
      window.setTimeout(() => startButton.focus(), 0);
    }
    return;
  }

  // プレイ開始時に名前だけでプレイ回数を1回増やす。
  // 通信に失敗してもゲーム自体は開始し、結果画面で送信を再試行できる。
  activePlayTicket = null;
  if (rankingClient) {
    try {
      await rankingClient.startPlay({
        displayName: roundPlayerName,
        modeId: roundMode.id
      });
    } catch (error) {
      console.error(error);
    }
  }
  setStartPending(false);

  selectedMode = roundMode;
  activeMode = roundMode;
  activePlayerName = roundPlayerName;
  applyModeLabels(activeMode);
  resetHudDisplay(activeMode);
  game.reset(activeMode.id);

  const snapshot = flow.beginCountdown();
  if (!snapshot) return;
  cancelCountdown();
  renderFlow(snapshot);
  scheduleCountdown(countdownRunId);
}

function pauseRound() {
  if (
    !game
    || webglRecoveryVisible
    || flow.getSnapshot().screen !== SCREEN_PHASES.PLAYING
  ) return;

  pointerStart = null;
  game.emitStateSnapshot();
  game.setPaused(true);
  const snapshot = flow.pausePlaying();
  if (!snapshot) {
    game.setPaused(false);
    return;
  }
  renderFlow(snapshot);
  window.setTimeout(() => resumeButton.focus(), 0);
}

function resumeRound() {
  if (
    !game
    || webglRecoveryVisible
    || flow.getSnapshot().screen !== SCREEN_PHASES.PAUSED
  ) return;

  const snapshot = flow.resumePaused();
  if (!snapshot) return;
  game.setPaused(false);
  renderFlow(snapshot);
  window.setTimeout(() => pauseButton.focus(), 0);
}

function retireRound() {
  if (
    !game
    || webglRecoveryVisible
    || flow.getSnapshot().screen !== SCREEN_PHASES.PAUSED
  ) return;

  resumeButton.disabled = true;
  retireButton.disabled = true;
  const result = game.retire();
  if (!result) {
    resumeButton.disabled = false;
    retireButton.disabled = false;
  }
}

function requestMove(direction) {
  if (!game || webglRecoveryVisible || !flow.canMove()) return;
  const button = directionButtons.find(
    (candidate) => candidate.dataset.direction === direction
  );
  if (button && !motionPreferences.reducedMotion) {
    button.classList.remove('is-active');
    void button.offsetWidth;
    button.classList.add('is-active');
    window.setTimeout(() => button.classList.remove('is-active'), 180);
  }
  game.move(direction);
}

stage.addEventListener('pointerdown', (event) => {
  if (
    event.target.closest('[data-direction]')
    || webglRecoveryVisible
    || !flow.canMove()
  ) return;
  void soundEffects.unlock();
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  stage.setPointerCapture?.(event.pointerId);
});

stage.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  const direction = directionFromDiagonalSwipe(
    deltaX,
    deltaY
  );
  pointerStart = null;
  if (direction) {
    requestMove(direction);
  } else if (Math.hypot(deltaX, deltaY) >= DEFAULT_SWIPE_DISTANCE) {
    message.textContent = '斜め方向へフリックするか、矢印をタップします';
  }
});

stage.addEventListener('pointercancel', () => {
  pointerStart = null;
});

const keyMap = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right'
};

document.addEventListener('keydown', (event) => {
  const direction = keyMap[event.key];
  if (!direction || webglRecoveryVisible || !flow.canMove()) return;
  event.preventDefault();
  void soundEffects.unlock();
  requestMove(direction);
});

for (const button of directionButtons) {
  button.addEventListener('click', () => {
    void soundEffects.unlock();
    requestMove(button.dataset.direction);
  });
}

pauseButton.addEventListener('click', pauseRound);
resumeButton.addEventListener('click', resumeRound);
retireButton.addEventListener('click', retireRound);
startButton.addEventListener('click', startRound);
replayButton.addEventListener('click', startRound);
gameRecoveryResume.addEventListener('click', () => {
  void resumeSavedGame();
});
gameRecoveryDiscard.addEventListener('click', () => {
  void discardSavedGame();
});
webglRecoveryRecreate.addEventListener('click', () => {
  void recreateWebGLGame();
});
webglRecoveryHome.addEventListener('click', () => {
  void leaveWebGLRecoveryForHome();
});
resultShareButton.addEventListener('click', handleResultShare);
resultRankingRetry.addEventListener('click', () => {
  if (
    !latestRankingSubmission
    || !isCurrentRankingSubmission(latestRankingSubmission)
  ) return;
  if (resultRankingRetryAction === 'ranking') {
    void syncResultRanking(latestRankingSubmission, { submit: false });
  } else if (resultRankingRetryAction === 'cleanup') {
    void retryAcceptedResultCleanup(latestRankingSubmission);
  } else if (
    resultRankingRetryAction === 'submit'
    && latestRankingSubmission.canSubmit !== false
    && !latestRankingSubmission.acceptedOutcome
  ) {
    void syncResultRanking(latestRankingSubmission);
  }
});
pendingRankingRetry.addEventListener('click', () => {
  void retryStoredRankingSubmissions();
});
pendingRankingExport.addEventListener('click', () => {
  void exportPendingRankingRecovery();
});
pendingRankingRecoveryList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-recovery-action]');
  if (!button) return;
  void deletePendingRankingRecovery(button.dataset.recoveryAction);
});
soundToggle.addEventListener('click', async () => {
  if (soundTogglePending) return;
  soundTogglePending = true;
  soundToggle.disabled = true;
  const targetEnabled = !soundEffects.getSnapshot().enabled;
  try {
    let snapshot = await soundEffects.setEnabled(targetEnabled);

    if (targetEnabled && !snapshot.running) {
      soundStatus.textContent = snapshot.available
        ? '効果音は一時中断中です。次の操作で再開します'
        : 'この環境では効果音を開始できませんでした';
    } else {
      soundStatus.textContent = targetEnabled
        ? '効果音をオンにしました'
        : '効果音をオフにしました';
    }

    renderSoundToggle(snapshot);
    if (snapshot.enabled && snapshot.running) soundEffects.playFlick();
  } finally {
    soundTogglePending = false;
    soundToggle.disabled = false;
  }
});
tutorialButton.addEventListener('click', () => {
  if (startPending) return;
  const snapshot = flow.openTutorial();
  if (!snapshot) return;
  selectedMode = getNewGameMode();
  applyModeLabels(selectedMode);
  tutorial.reset();
  renderFlow(snapshot);
  window.setTimeout(() => tutorialTitle.focus(), 0);
});
tutorialHomeButton.addEventListener('click', () => {
  if (startPending) return;
  renderFlow(flow.goHome());
  window.setTimeout(() => tutorialButton.focus(), 0);
});
tutorialPreviousButton.addEventListener('click', () => {
  if (startPending) return;
  renderTutorial(tutorial.previous());
});
tutorialNextButton.addEventListener('click', () => {
  if (startPending) return;
  const snapshot = tutorial.getSnapshot();
  if (snapshot.isLast) {
    startRound();
    return;
  }
  renderTutorial(tutorial.next());
});
resultHomeButton.addEventListener('click', () => {
  cancelCountdown();
  selectedMode = getNewGameMode();
  applyModeLabels(selectedMode);
  resetHudDisplay(selectedMode);
  renderFlow(flow.goHome());
  window.setTimeout(() => startButton.focus(), 0);
});

playerNameInput.addEventListener('input', () => {
  if (!playerNameError.hidden) showPlayerNameError();
});
playerNameInput.addEventListener('change', () => {
  const saved = playerProfile.saveName(playerNameInput.value);
  if (!saved.ok) {
    showPlayerNameError(saved.message);
    return;
  }
  playerNameInput.value = saved.name;
  showPlayerNameError(saved.persisted
    ? ''
    : 'この端末へ名前を保存できませんが、今回のランキングには使えます', {
    invalid: false
  });
});

document.addEventListener('contextmenu', (event) => {
  if (event.target.closest('input, textarea, a')) return;
  event.preventDefault();
});
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  soundEffects.handleVisibility(document.hidden);
  if (document.hidden) {
    pointerStart = null;
    pauseCountdownTimer();
  } else if (flow.getSnapshot().screen === SCREEN_PHASES.COUNTDOWN) {
    scheduleCountdown(countdownRunId);
  }
  if (!document.hidden) void renderPendingRankingPanel();
});
pendingRankingChannel?.addEventListener('message', () => {
  void renderPendingRankingPanel();
});
gameStateChannel?.addEventListener('message', () => {
  if (
    flow.getSnapshot().screen !== SCREEN_PHASES.HOME
    || startPending
    || gameStateOperationPending
  ) return;
  void loadGameRecovery({ force: true }).catch((error) => {
    console.error(error);
  });
});
window.addEventListener('pagehide', () => {
  try {
    gameStateChannel?.close();
  } catch {
    // Closing an unavailable channel is harmless.
  }
}, { once: true });

setupReleaseDiagnostics();
applyModeLabels(selectedMode);
resetHudDisplay(selectedMode);
renderSoundToggle();
renderFlow();
void renderPendingRankingPanel();
void loadGameRecovery().catch((error) => {
  console.error(error);
});
