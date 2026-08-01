import { SainomeGame } from './game.js';

const screens = {
  start: document.querySelector('#start-screen'),
  game: document.querySelector('#game-screen'),
  result: document.querySelector('#result-screen')
};

const boardElement = document.querySelector('#board');
const gameStage = document.querySelector('#game-stage');
const chainBurst = document.querySelector('#chain-burst');
const countdown = document.querySelector('#countdown');
const timeDisplay = document.querySelector('#time-display');
const scoreDisplay = document.querySelector('#score-display');
const chainDisplay = document.querySelector('#chain-display');
const statusMessage = document.querySelector('#status-message');
const playerNameInput = document.querySelector('#player-name');
const startButton = document.querySelector('#start-button');
const retryButton = document.querySelector('#retry-button');
const backButton = document.querySelector('#back-button');
const resultScore = document.querySelector('#result-score');
const resultCleared = document.querySelector('#result-cleared');
const resultChain = document.querySelector('#result-chain');
const resultRank = document.querySelector('#result-rank');
const bestMessage = document.querySelector('#best-message');

const PIP_POSITIONS = {
  1: [4],
  2: [1, 7],
  3: [1, 4, 7],
  4: [1, 2, 6, 7],
  5: [1, 2, 4, 6, 7],
  6: [1, 2, 3, 5, 6, 7]
};

let countdownRunning = false;
let pointerStart = null;

const savedName = window.localStorage.getItem('sainome-player-name');
if (savedName) playerNameInput.value = savedName;

const game = new SainomeGame({
  onUpdate: render,
  onMessage: (message) => { statusMessage.textContent = message; },
  onLand: () => triggerStage('impact', 260),
  onBlocked: () => triggerStage('chain-hit', 240),
  onChain: ({ chain, count }) => showChainBurst(chain, count),
  onFinish: showResult
});

function switchScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.classList.toggle('active', screenName === name);
  }
}

function createFace(name, value) {
  const face = document.createElement('div');
  face.className = `face ${name}`;
  face.setAttribute('aria-hidden', 'true');
  for (const position of PIP_POSITIONS[value] ?? []) {
    const pip = document.createElement('i');
    pip.className = `pip p${position}`;
    face.append(pip);
  }
  return face;
}

function createDieElement(die) {
  const scene = document.createElement('div');
  scene.className = 'die-scene';

  const cube = document.createElement('div');
  const rollingClass = die.state === 'rolling' && die.rollDirection
    ? ` rolling-${die.rollDirection}`
    : '';
  cube.className = `die-cube ${die.state}${rollingClass}`;
  cube.setAttribute('aria-label', `上面${die.top}のサイコロ`);

  const faces = {
    top: die.top,
    bottom: die.bottom,
    front: die.front,
    back: die.back,
    left: die.left,
    right: die.right
  };
  for (const [name, value] of Object.entries(faces)) cube.append(createFace(name, value));
  scene.append(cube);
  return scene;
}

function render(state) {
  timeDisplay.textContent = String(state.timeLeft);
  scoreDisplay.textContent = state.score.toLocaleString('ja-JP');
  chainDisplay.textContent = String(state.chain);
  timeDisplay.closest('.hud-item').classList.toggle('danger', state.timeLeft <= 10);

  const fragment = document.createDocumentFragment();
  for (const row of state.board) {
    for (const die of row) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.row = String(die.row);
      cell.dataset.column = String(die.column);
      cell.append(createDieElement(die));

      if (state.player.row === die.row && state.player.column === die.column) {
        const player = document.createElement('div');
        player.className = 'player';
        player.setAttribute('aria-label', 'プレイヤー');
        cell.append(player);
      }
      fragment.append(cell);
    }
  }
  boardElement.replaceChildren(fragment);
}

async function runCountdown() {
  if (countdownRunning) return false;
  countdownRunning = true;
  for (const value of ['3', '2', '1', 'GO']) {
    countdown.textContent = value;
    countdown.classList.remove('active');
    void countdown.offsetWidth;
    countdown.classList.add('active');
    await wait(value === 'GO' ? 500 : 620);
  }
  countdown.classList.remove('active');
  countdownRunning = false;
  return true;
}

async function beginGame() {
  switchScreen('game');
  statusMessage.textContent = '構えろ';
  const completed = await runCountdown();
  if (completed && screens.game.classList.contains('active')) game.start();
}

function startGame() {
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.focus();
    playerNameInput.setCustomValidity('プレイヤー名を入力してください');
    playerNameInput.reportValidity();
    return;
  }
  playerNameInput.setCustomValidity('');
  window.localStorage.setItem('sainome-player-name', name);
  void beginGame();
}

function getRank(score) {
  if (score >= 30000) return 'S';
  if (score >= 20000) return 'A';
  if (score >= 12000) return 'B';
  if (score >= 6000) return 'C';
  return 'D';
}

function showResult(result) {
  resultScore.textContent = result.score.toLocaleString('ja-JP');
  resultCleared.textContent = String(result.cleared);
  resultChain.textContent = String(result.maxChain);
  resultRank.textContent = getRank(result.score);

  const previousBest = Number(window.localStorage.getItem('sainome-best-score') || 0);
  if (result.score > previousBest) {
    window.localStorage.setItem('sainome-best-score', String(result.score));
    bestMessage.textContent = previousBest > 0 ? '自己記録を更新' : '最初の記録を刻んだ';
  } else {
    bestMessage.textContent = `自己記録 ${previousBest.toLocaleString('ja-JP')}`;
  }
  window.setTimeout(() => switchScreen('result'), 350);
}

function triggerStage(className, duration) {
  gameStage.classList.remove(className);
  void gameStage.offsetWidth;
  gameStage.classList.add(className);
  window.setTimeout(() => gameStage.classList.remove(className), duration);
}

function showChainBurst(chain, count) {
  chainBurst.textContent = chain > 1 ? `${chain} CHAIN` : `${count} BREAK`;
  chainBurst.classList.remove('show');
  void chainBurst.offsetWidth;
  chainBurst.classList.add('show');
  triggerStage('chain-hit', 450);
  if (navigator.vibrate) navigator.vibrate(chain > 1 ? [25, 35, 45] : 25);
}

function directionFromSwipe(deltaX, deltaY) {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 26) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? 'right' : 'left';
  return deltaY > 0 ? 'down' : 'up';
}

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', () => void beginGame());
backButton.addEventListener('click', () => switchScreen('start'));
playerNameInput.addEventListener('input', () => playerNameInput.setCustomValidity(''));

for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    game.requestMove(button.dataset.direction);
  });
}

boardElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  boardElement.setPointerCapture?.(event.pointerId);
});
boardElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const direction = directionFromSwipe(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (direction) game.requestMove(direction);
});
boardElement.addEventListener('pointercancel', () => { pointerStart = null; });

const keyMap = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right'
};

document.addEventListener('keydown', (event) => {
  const direction = keyMap[event.key];
  if (!direction || !screens.game.classList.contains('active')) return;
  event.preventDefault();
  game.requestMove(direction);
});

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
