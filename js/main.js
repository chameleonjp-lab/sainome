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
import {
  createSubmissionId,
  RankingClient
} from './ranking-client.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from './supabase-config.js';

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

const flow = new GameFlow();
if (tutorialSlideElements.length !== TUTORIAL_SLIDE_COUNT) {
  throw new Error('Tutorial slide markup does not match the configured count');
}
const tutorial = new TutorialSlides({ count: tutorialSlideElements.length });
const soundEffects = new SoundEffects();
const bestRecords = new BestRecords();
const playerProfile = new PlayerProfile();
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
let rankingRunId = 0;

playerNameInput.value = activePlayerName;

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

function renderRankingRows(rows, displayName) {
  clearRankingRows();
  for (const row of rows) {
    const item = document.createElement('li');
    item.classList.toggle('is-current-player', row.displayName === displayName);

    const position = document.createElement('span');
    position.className = 'ranking-position';
    position.textContent = `${row.rank}位`;

    const name = document.createElement('span');
    name.className = 'ranking-name';
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

async function syncResultRanking(submission) {
  if (!submission || rankingPendingRunIds.has(submission.runId)) return;
  setRankingPending(submission, true);
  resultRankingRetry.hidden = true;
  resultRankingStatus.textContent = '記録を送信しています…';

  let submitOutcome = null;
  let submitError = null;
  let rankingRows = null;
  let rankingError = null;

  try {
    if (!rankingClient) throw new Error('Ranking client is unavailable');
    submitOutcome = await rankingClient.submitScore({
      displayName: submission.displayName,
      modeId: submission.result.modeId,
      score: submission.result.score,
      submissionId: submission.submissionId
    });
  } catch (error) {
    console.error(error);
    submitError = error;
  }

  try {
    if (!rankingClient) throw new Error('Ranking client is unavailable');
    rankingRows = await rankingClient.getTopRanking(submission.result.modeId);
  } catch (error) {
    console.error(error);
    rankingError = error;
  }

  if (!isCurrentRankingSubmission(submission)) {
    setRankingPending(submission, false);
    return;
  }

  setRankingPending(submission, false);

  if (rankingRows) {
    renderRankingRows(rankingRows, submission.displayName);
  } else {
    clearRankingRows();
  }

  if (submitError) {
    resultRankingStatus.textContent = rankingRows
      ? '順位は表示できましたが、今回の記録を送信できませんでした'
      : '記録を送信できませんでした。通信状態を確認してください';
    resultRankingRetry.hidden = false;
    resultRankingRetry.textContent = '記録を再送する';
  } else if (rankingError) {
    resultRankingStatus.textContent = '記録は登録しましたが、ランキングを読み込めませんでした';
    resultRankingRetry.hidden = false;
    resultRankingRetry.textContent = 'ランキングを再読込';
  } else if (rankingRows.length === 0) {
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
    latestRecordOutcome = bestRecords.recordResult(next.result);
    latestRankingSubmission = Object.freeze({
      runId: ++rankingRunId,
      submissionId: createSubmissionId(),
      displayName: activePlayerName,
      result: next.result
    });
    clearRankingRows();
    resultRankingStatus.textContent = 'ランキングを読み込んでいます…';
    resultRankingRetry.hidden = true;
    renderFlow(next);
    void syncResultRanking(latestRankingSubmission);
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
    loading.textContent = '3D表示を開始できませんでした';
    loading.classList.remove('hidden');
    homeError.textContent = '3D表示を読み込めませんでした。通信状態を確認して、もう一度お試しください。';
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

function cancelCountdown() {
  countdownRunId += 1;
  window.clearTimeout(countdownTimerId);
  countdownTimerId = null;
}

function scheduleCountdown(runId) {
  countdownTimerId = window.setTimeout(() => {
    if (runId !== countdownRunId) return;
    const transition = flow.advanceCountdown();
    renderFlow(transition.snapshot);

    if (transition.started) {
      game.reset(activeMode.id);
      message.textContent = '盤面に沿って斜めにフリック';
      canvas.focus({ preventScroll: true });
      return;
    }

    scheduleCountdown(runId);
  }, 1000);
}

async function startRound() {
  if (startPending || flow.getSnapshot().screen === SCREEN_PHASES.COUNTDOWN) return;
  const roundPlayerName = capturePlayerName();
  if (!roundPlayerName) {
    if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) renderFlow(flow.goHome());
    window.setTimeout(() => playerNameInput.focus(), 0);
    return;
  }
  void soundEffects.unlock();
  const roundMode = readSelectedMode();
  setStartPending(true);
  homeError.hidden = true;

  const ready = await ensureGame(roundMode.id);
  setStartPending(false);
  if (!ready) {
    if (flow.getSnapshot().screen !== SCREEN_PHASES.HOME) {
      renderFlow(flow.goHome());
      window.setTimeout(() => startButton.focus(), 0);
    }
    return;
  }

  const snapshot = flow.beginCountdown();
  if (!snapshot) return;
  selectedMode = roundMode;
  activeMode = roundMode;
  activePlayerName = roundPlayerName;
  applyModeLabels(activeMode);
  resetHudDisplay(activeMode);
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
  if (!isCurrentRankingSubmission(latestRankingSubmission)) return;
  void syncResultRanking(latestRankingSubmission);
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
});

applyModeLabels(selectedMode);
resetHudDisplay(selectedMode);
renderSoundToggle();
renderFlow();
