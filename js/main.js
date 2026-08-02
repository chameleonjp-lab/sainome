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
const resultScore = document.querySelector('#result-score');
const resultCleared = document.querySelector('#result-cleared');
const resultChain = document.querySelector('#result-chain');
const playNote = document.querySelector('#play-note');
const startButton = document.querySelector('#start-button');
const replayButton = document.querySelector('#replay-button');
const resultHomeButton = document.querySelector('#result-home-button');
const homeError = document.querySelector('#home-error');
const modeBrand = document.querySelector('#mode-brand');
const homeKicker = document.querySelector('#home-kicker');
const modeInputs = [...document.querySelectorAll('input[name="game-mode"]')];
const resultKicker = document.querySelector('#result-kicker');
const playNoteTitle = document.querySelector('#play-note-title');
const playNoteText = document.querySelector('#play-note-text');

const flow = new GameFlow();
if (tutorialSlideElements.length !== TUTORIAL_SLIDE_COUNT) {
  throw new Error('Tutorial slide markup does not match the configured count');
}
const tutorial = new TutorialSlides({ count: tutorialSlideElements.length });
const numberFormatter = new Intl.NumberFormat('ja-JP');
let game = null;
let gameLoadPromise = null;
let pointerStart = null;
let countdownTimerId = null;
let countdownRunId = 0;
let startPending = false;
let selectedMode = getGameMode(DEFAULT_GAME_MODE_ID);
let activeMode = selectedMode;

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
}

function setStartPending(pending) {
  startPending = pending;
  startButton.disabled = pending;
  replayButton.disabled = pending;
  tutorialButton.disabled = pending;
  tutorialHomeButton.disabled = pending;
  tutorialNextButton.disabled = pending;
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
    resultKicker.textContent = `${resultMode.label}モード · TIME UP`;
    resultScore.textContent = numberFormatter.format(snapshot.result.score);
    resultCleared.textContent = numberFormatter.format(snapshot.result.clearedDice);
    resultChain.textContent = numberFormatter.format(snapshot.result.maxChain);
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

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());

applyModeLabels(selectedMode);
resetHudDisplay(selectedMode);
renderFlow();
