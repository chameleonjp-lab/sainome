import {
  formatRemainingSeconds,
  GameFlow,
  SCREEN_PHASES
} from './ui-flow.js';
import { directionFromDiagonalSwipe } from './input-direction.js';

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
const resultScore = document.querySelector('#result-score');
const resultCleared = document.querySelector('#result-cleared');
const resultChain = document.querySelector('#result-chain');
const playNote = document.querySelector('#play-note');
const startButton = document.querySelector('#start-button');
const replayButton = document.querySelector('#replay-button');
const resultHomeButton = document.querySelector('#result-home-button');
const homeError = document.querySelector('#home-error');

const flow = new GameFlow();
const numberFormatter = new Intl.NumberFormat('ja-JP');
let game = null;
let gameLoadPromise = null;
let pointerStart = null;
let countdownTimerId = null;
let countdownRunId = 0;
let startPending = false;

function resetHudDisplay() {
  updateSessionDisplay({ phase: 'idle', remainingMs: 60_000, score: 0 });
  chainCount.textContent = '0';
  chainCount.parentElement.classList.remove('chain-active');
  clearCount.textContent = '0';
}

function setStartPending(pending) {
  startPending = pending;
  startButton.disabled = pending;
  replayButton.disabled = pending;
  startButton.textContent = pending ? '3D盤面を準備中…' : 'ゲーム開始';
  replayButton.textContent = pending ? '準備中…' : 'もう一度';
  app.setAttribute('aria-busy', String(pending));
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

const gameCallbacks = {
  onRoll: () => {},
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
    renderFlow(next);
    window.setTimeout(() => replayButton.focus(), 0);
  }
};

async function ensureGame() {
  if (game) return true;
  if (!gameLoadPromise) {
    gameLoadPromise = import('./webgl-game.js').then(({ WebGLSainome }) => {
      game = new WebGLSainome(canvas, gameCallbacks);
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
  countdownScreen.hidden = snapshot.screen !== SCREEN_PHASES.COUNTDOWN;
  resultScreen.hidden = snapshot.screen !== SCREEN_PHASES.RESULT;
  playNote.hidden = snapshot.screen !== SCREEN_PHASES.PLAYING;

  if (snapshot.screen === SCREEN_PHASES.COUNTDOWN) {
    countdownValue.textContent = String(snapshot.countdown);
  }

  if (snapshot.screen === SCREEN_PHASES.RESULT && snapshot.result) {
    resultScore.textContent = numberFormatter.format(snapshot.result.score);
    resultCleared.textContent = numberFormatter.format(snapshot.result.clearedDice);
    resultChain.textContent = numberFormatter.format(snapshot.result.maxChain);
  }
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
      game.reset();
      message.textContent = '盤面に沿って斜めにフリック';
      canvas.focus({ preventScroll: true });
      return;
    }

    scheduleCountdown(runId);
  }, 1000);
}

async function startRound() {
  if (startPending || flow.getSnapshot().screen === SCREEN_PHASES.COUNTDOWN) return;
  setStartPending(true);
  homeError.hidden = true;

  const ready = await ensureGame();
  setStartPending(false);
  if (!ready) return;

  const snapshot = flow.beginCountdown();
  if (!snapshot) return;
  resetHudDisplay();
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
  requestMove(direction);
});

startButton.addEventListener('click', startRound);
replayButton.addEventListener('click', startRound);
resultHomeButton.addEventListener('click', () => {
  cancelCountdown();
  resetHudDisplay();
  renderFlow(flow.goHome());
  window.setTimeout(() => startButton.focus(), 0);
});

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());

resetHudDisplay();
renderFlow();
