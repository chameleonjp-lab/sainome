import {
  formatRemainingSeconds,
  GameFlow,
  SCREEN_PHASES
} from './ui-flow.js';
import { directionFromDiagonalSwipe } from './input-direction.js';
import {
  DEFAULT_GAME_MODE_ID,
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
import { RankingClient } from './ranking-client.js';
import {
  PendingRankingSubmissions,
  PENDING_RANKING_CHANNEL_NAME
} from './pending-ranking-submissions.js';
import {
  prepareRankingSubmission,
  classifyRankingFailure,
  SingleFlight,
  submitPendingRanking,
  updateIfCurrentRankingSubmission
} from './ranking-submission-flow.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from './supabase-config.js';
import { checkWebGL2Support } from './webgl-support.js';

const app = document.querySelector('#app');
const canvas = document.querySelector('#game-canvas');
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
const tutorialModeLabel = document.querySelector('#tutorial-mode-label');
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
const modeInputs = [...document.querySelectorAll('input[name="game-mode"]')];
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

const WEBGL_UNAVAILABLE_MESSAGE =
  'この端末またはブラウザでは、3D表示に必要な機能（WebGL 2）が利用できません。ブラウザの設定で3D表示を有効にするか、対応環境でお試しください。';
const WEBGL_LOAD_FAILURE_MESSAGE =
  '3D表示を開始できませんでした。通信状態を確認して、もう一度お試しください。';

const flow = new GameFlow();
if (tutorialSlideElements.length !== TUTORIAL_SLIDE_COUNT) {
  throw new Error('Tutorial slide markup does not match the configured count');
}
const tutorial = new TutorialSlides({ count: tutorialSlideElements.length });
const soundEffects = new SoundEffects();
const bestRecords = new BestRecords();
const playerProfile = new PlayerProfile();
const pendingRankingSubmissions = new PendingRankingSubmissions();
const pendingRankingChannel = createPendingRankingChannel();
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

function readSelectedMode() {
  const checked = modeInputs.find((input) => input.checked);
  return getGameMode(checked?.value ?? DEFAULT_GAME_MODE_ID);
}

function applyModeLabels(mode) {
  modeBrand.textContent = mode.brand;
  homeKicker.textContent = mode.kicker;
  playNoteTitle.textContent = mode.label;
  playNoteText.textContent = mode.id === DEFAULT_GAME_MODE_ID
    ? '斜めフリックで移動。同じ目を、目の数以上つなげる。'
    : '3個以上を一度に消すと、消去数に応じてサイコロが現れる。';
  tutorialModeLabel.textContent = `選択中：${mode.label}`;
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
    'submission-conflict':
      '安全な登録番号を確保できなかったため、この結果の送信を止めました。',
    'invalid-submission':
      'この結果を安全な未送信記録として保存できなかったため、送信を止めました。',
    'ticket-unavailable':
      'プレイ番号を発行できなかったため、このプレイはランキング対象外です。'
  };
  resultRankingStorageWarning.textContent = messages[submission.pendingSaveCode]
    ?? 'この結果を端末へ保存できませんでした。画面を閉じると失われます。';
  resultRankingStorageWarning.hidden = false;
}

function isBrowserOffline() {
  return globalThis.navigator?.onLine === false;
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
          const { cleanup } = await submitPendingRanking({
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
              code: error?.code ?? 'request-rejected'
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
  const shouldSubmit = submit && !submission.acceptedOutcome;
  if (!shouldSubmit && !submission.acceptedOutcome) return;
  if (shouldSubmit && isBrowserOffline()) {
    if (isCurrentRankingSubmission(submission)) {
      resultRankingStatus.textContent =
        '現在オフラインのため送信を開始しません。接続後に「記録を再送する」を押してください';
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
      resultRankingStatus.textContent = shouldSubmit
        ? '記録を送信しています…'
        : 'ランキングを再読み込みしています…';
    }
  });

  let currentSubmission = submission;
  let submitOutcome = submission.acceptedOutcome ?? null;
  let submitError = null;
  let rankingRows = null;
  let rankingError = null;
  let pendingCleanupError = false;
  let isolated = false;

  if (shouldSubmit) {
    try {
      if (!rankingClient) throw new Error('Ranking client is unavailable');
      const submitted = await submitPendingRanking({
        rankingClient,
        pendingSubmissions: pendingRankingSubmissions,
        submission
      });
      submitOutcome = submitted.outcome;
      pendingCleanupError = !submitted.cleanup.ok;
      currentSubmission = Object.freeze({
        ...submission,
        acceptedOutcome: submitOutcome
      });
      if (latestRankingSubmission?.runId === submission.runId) {
        latestRankingSubmission = currentSubmission;
      }
      updateIfCurrentRankingSubmission({
        submission: currentSubmission,
        isCurrent: isCurrentRankingSubmission,
        update: () => renderRankingStorageWarning(null)
      });
      notifyPendingRankingChange();
      await renderPendingRankingPanel();
    } catch (error) {
      console.error(error);
      submitError = error;
      if (classifyRankingFailure(error) === 'permanent') {
        const quarantined = await pendingRankingSubmissions.quarantine(submission, {
          reason: 'ranking-submit-permanent-rejection',
          code: error?.code ?? 'request-rejected'
        });
        isolated = quarantined.ok;
        if (isolated) {
          notifyPendingRankingChange();
          await renderPendingRankingPanel();
        }
      }
    }
  }

  const submitFailureKind = submitError ? classifyRankingFailure(submitError) : null;
  const shouldLoadRanking = !submitError
    || (submitFailureKind === 'permanent' && !isBrowserOffline());
  if (shouldLoadRanking) {
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

  if (rankingRows) {
    renderRankingRows(rankingRows);
  } else {
    clearRankingRows();
  }

  if (submitError && isolated) {
    resultRankingStatus.textContent = rankingRows
      ? '今回の記録は受け付けられなかったため隔離しました。ランキングを表示しています'
      : '今回の記録は受け付けられなかったため隔離しました';
    setResultRankingRetryAction(null);
  } else if (submitError && submitFailureKind === 'permanent') {
    resultRankingStatus.textContent =
      '今回の記録は受け付けられませんでした。保全に失敗したため記録は保持しています';
    setResultRankingRetryAction(null);
  } else if (submitError) {
    const failureMessage = rankingRows
      ? '順位は表示できましたが、今回の記録を送信できませんでした'
      : '記録を送信できませんでした。通信状態を確認してください';
    resultRankingStatus.textContent = currentSubmission.persisted
      ? `${failureMessage}。未送信記録は端末に保存しています`
      : `${failureMessage}。端末にも保存できないため、この画面を閉じないでください`;
    setResultRankingRetryAction('submit', '記録を再送する');
  } else if (pendingCleanupError) {
    resultRankingStatus.textContent =
      '記録は登録しましたが、端末の未送信表示を更新できませんでした';
    setResultRankingRetryAction('cleanup', '登録状態を再確認');
  } else if (rankingError) {
    resultRankingStatus.textContent = '記録は登録しましたが、ランキングを読み込めませんでした';
    setResultRankingRetryAction('ranking', 'ランキングを再読込');
  } else if (rankingRows?.length === 0) {
    resultRankingStatus.textContent = '記録を登録しました。ランキングは集計中です';
  } else if (submitOutcome.wasDuplicate) {
    resultRankingStatus.textContent = '登録済みの記録とランキングを確認しました';
  } else if (submitOutcome.isFirstPlay) {
    resultRankingStatus.textContent = '初回記録を登録しました';
  } else if (submitOutcome.isNewBest) {
    resultRankingStatus.textContent = 'ランキングの自己ベストを更新しました';
  } else {
    resultRankingStatus.textContent = '記録を登録しました';
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
  replayButton.disabled = pending;
  resultHomeButton.disabled = pending;
  resultShareButton.textContent = pending ? '共有中…' : '結果をシェア';
}

function setStartPending(pending) {
  startPending = pending;
  startButton.disabled = pending;
  replayButton.disabled = pending;
  tutorialButton.disabled = pending;
  tutorialHomeButton.disabled = pending;
  tutorialNextButton.disabled = pending;
  playerNameInput.disabled = pending;
  for (const input of modeInputs) input.disabled = pending;
  startButton.textContent = pending ? '3D盤面を準備中…' : 'ゲーム開始';
  replayButton.textContent = pending ? '準備中…' : 'もう一度';
  app.setAttribute('aria-busy', String(pending));
  renderTutorial();
}

function pulse(element, className) {
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
    prepared = await prepareRankingSubmission({
      pendingSubmissions: pendingRankingSubmissions,
      displayName: provisional.displayName,
      result: provisional.result,
      playTicket: provisional.playTicket
    });
  } catch (error) {
    console.error(error);
    if (latestRankingSubmission?.runId === provisional.runId) {
      const failed = Object.freeze({
        ...provisional,
        pendingSaveCode: 'storage-unavailable'
      });
      latestRankingSubmission = failed;
      renderRankingStorageWarning(failed);
      resultRankingStatus.textContent = '記録を安全に保存できないため、今回の送信を止めました';
      resultRankingRetry.hidden = true;
    }
    return;
  }

  const submission = Object.freeze({ ...prepared, runId: provisional.runId });
  const isLatest = latestRankingSubmission?.runId === provisional.runId;
  if (isLatest) latestRankingSubmission = submission;
  notifyPendingRankingChange();
  await renderPendingRankingPanel();

  if (submission.pendingSaveCode === 'ticket-unavailable') {
    if (isLatest && isCurrentRankingSubmission(submission)) {
      renderRankingStorageWarning(submission);
      resultRankingStatus.textContent =
        'このプレイはランキング対象外です。次回の開始時に受付を再試行します';
      setResultRankingRetryAction(null);
    }
    if (rankingClient) {
      try {
        const rankingRows = await rankingClient.getTopRanking(submission.result.modeId);
        if (isCurrentRankingSubmission(submission)) renderRankingRows(rankingRows);
      } catch (error) {
        console.error(error);
      }
    }
    return;
  }

  if (isLatest && isCurrentRankingSubmission(submission)) {
    renderRankingStorageWarning(submission);
    if (submission.canSubmit) {
      resultRankingStatus.textContent = 'ランキングを読み込んでいます…';
      setResultRankingRetryAction(null);
    } else {
      resultRankingStatus.textContent = '記録を安全に送信できないため、今回の送信を止めました';
      setResultRankingRetryAction(null);
    }
  }

  if (submission.canSubmit) void syncResultRanking(submission);
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
    if (chain > 0) {
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
    stage.classList.remove('impact');
    void stage.offsetWidth;
    stage.classList.add('impact');
    window.setTimeout(() => stage.classList.remove('impact'), 180);
    if (navigator.vibrate) navigator.vibrate(18);
  },
  onScore: () => {
    pulse(scorePanel, 'score-hit');
  },
  onSessionChange: (snapshot) => {
    updateSessionDisplay(snapshot);
  },
  onFinish: (result) => {
    const next = flow.finish(result);
    if (!next) return;
    const playTicket = activePlayTicket;
    activePlayTicket = null;
    latestRecordOutcome = bestRecords.recordResult(next.result);
    const provisional = Object.freeze({
      runId: ++rankingRunId,
      displayName: activePlayerName,
      result: next.result,
      playTicket,
      persisted: false,
      pendingSaveCode: 'preparing',
      canSubmit: false
    });
    latestRankingSubmission = provisional;
    clearRankingRows();
    renderFlow(next);
    renderRankingStorageWarning(null);
    resultRankingStatus.textContent = '記録を端末へ保存しています…';
    setResultRankingRetryAction(null);
    void preserveFinishedRanking(provisional);
    window.setTimeout(() => replayButton.focus(), 0);
  }
};

async function ensureGame(initialModeId = DEFAULT_GAME_MODE_ID) {
  if (game) return true;
  if (!gameLoadPromise) {
    gameLoadPromise = import('./webgl-game.js').then(({ WebGLSainome }) => {
      game = new WebGLSainome(canvas, gameCallbacks, initialModeId);
      loading.classList.add('hidden');
      return game;
    });
  }

  try {
    await gameLoadPromise;
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

function renderFlow(snapshot = flow.getSnapshot()) {
  app.dataset.screen = snapshot.screen;
  homeScreen.hidden = snapshot.screen !== SCREEN_PHASES.HOME;
  tutorialScreen.hidden = snapshot.screen !== SCREEN_PHASES.TUTORIAL;
  countdownScreen.hidden = snapshot.screen !== SCREEN_PHASES.COUNTDOWN;
  resultScreen.hidden = snapshot.screen !== SCREEN_PHASES.RESULT;
  playNote.hidden = snapshot.screen !== SCREEN_PHASES.PLAYING;

  if (snapshot.screen === SCREEN_PHASES.TUTORIAL) renderTutorial();

  if (snapshot.screen === SCREEN_PHASES.COUNTDOWN) {
    countdownValue.textContent = String(snapshot.countdown);
  }

  if (snapshot.screen === SCREEN_PHASES.RESULT && snapshot.result) {
    const resultMode = getGameMode(snapshot.result.modeId);
    resultShareStatus.textContent = '';
    resultKicker.textContent = `${resultMode.label}モード · TIME UP`;
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
  if (document.hidden || countdownTimerId !== null) return;
  countdownTimerId = window.setTimeout(() => {
    countdownTimerId = null;
    if (runId !== countdownRunId || document.hidden) return;
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
  const roundMode = readSelectedMode();
  setStartPending(true);
  homeError.hidden = true;

  const ready = await ensureGame(roundMode.id);
  if (!ready) {
    setStartPending(false);
    if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) {
      renderFlow(flow.goHome());
      window.setTimeout(() => startButton.focus(), 0);
    }
    return;
  }

  // サーバー発行番号は3カウントより前に取得する。失敗してもゲームは開始するが、
  // 結果確定後に番号を遡って発行することはしない。
  activePlayTicket = null;
  if (rankingClient) {
    try {
      activePlayTicket = await rankingClient.issuePlay({
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

function requestMove(direction) {
  if (!game || !flow.canMove()) return;
  game.move(direction);
}

stage.addEventListener('pointerdown', (event) => {
  if (!flow.canMove()) return;
  void soundEffects.unlock();
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  stage.setPointerCapture?.(event.pointerId);
});

stage.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const direction = directionFromDiagonalSwipe(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y
  );
  pointerStart = null;
  if (direction) requestMove(direction);
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
  if (!direction || !flow.canMove()) return;
  event.preventDefault();
  void soundEffects.unlock();
  requestMove(direction);
});

startButton.addEventListener('click', startRound);
replayButton.addEventListener('click', startRound);
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
  } else if (resultRankingRetryAction === 'submit' && latestRankingSubmission.canSubmit) {
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
      snapshot = await soundEffects.setEnabled(false);
      soundStatus.textContent = 'この環境では効果音を開始できませんでした';
    } else {
      soundStatus.textContent = targetEnabled
        ? '効果音をオンにしました'
        : '効果音をオフにしました';
    }

    renderSoundToggle(snapshot);
    if (snapshot.enabled) soundEffects.playFlick();
  } finally {
    soundTogglePending = false;
    soundToggle.disabled = false;
  }
});
tutorialButton.addEventListener('click', () => {
  if (startPending) return;
  const snapshot = flow.openTutorial();
  if (!snapshot) return;
  selectedMode = readSelectedMode();
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
  selectedMode = readSelectedMode();
  applyModeLabels(selectedMode);
  resetHudDisplay(selectedMode);
  renderFlow(flow.goHome());
  window.setTimeout(() => startButton.focus(), 0);
});

for (const input of modeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked || flow.getSnapshot().screen !== SCREEN_PHASES.HOME) return;
    selectedMode = readSelectedMode();
    applyModeLabels(selectedMode);
    resetHudDisplay(selectedMode);
  });
}

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

applyModeLabels(selectedMode);
resetHudDisplay(selectedMode);
renderSoundToggle();
renderFlow();
void renderPendingRankingPanel();
