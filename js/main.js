import { SainomeGame } from './game.js';

const screens = {
  start: document.querySelector('#start-screen'),
  game: document.querySelector('#game-screen'),
  result: document.querySelector('#result-screen')
};

const boardElement = document.querySelector('#board');
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

const savedName = window.localStorage.getItem('sainome-player-name');
if (savedName) playerNameInput.value = savedName;

const game = new SainomeGame({
  onUpdate: render,
  onMessage: (message) => {
    statusMessage.textContent = message;
  },
  onFinish: showResult
});

function switchScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.classList.toggle('active', screenName === name);
  }
}

function render(state) {
  timeDisplay.textContent = String(state.timeLeft);
  scoreDisplay.textContent = state.score.toLocaleString('ja-JP');
  chainDisplay.textContent = String(state.chain);
  timeDisplay.closest('div').classList.toggle('danger', state.timeLeft <= 10);

  const fragment = document.createDocumentFragment();
  for (const row of state.board) {
    for (const die of row) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.row = String(die.row);
      cell.dataset.column = String(die.column);

      const dieElement = document.createElement('div');
      dieElement.className = `die ${die.state}`;
      dieElement.textContent = String(die.top);
      dieElement.setAttribute('aria-label', `上面${die.top}のサイコロ`);
      cell.append(dieElement);

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
  switchScreen('game');
  game.start();
}

function showResult(result) {
  resultScore.textContent = result.score.toLocaleString('ja-JP');
  resultCleared.textContent = String(result.cleared);
  resultChain.textContent = String(result.maxChain);
  window.setTimeout(() => switchScreen('result'), 250);
}

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', () => {
  switchScreen('game');
  game.start();
});
backButton.addEventListener('click', () => switchScreen('start'));
playerNameInput.addEventListener('input', () => playerNameInput.setCustomValidity(''));

for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    game.move(button.dataset.direction);
  });
}

const keyMap = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right'
};

document.addEventListener('keydown', (event) => {
  const direction = keyMap[event.key];
  if (!direction || !screens.game.classList.contains('active')) return;
  event.preventDefault();
  game.move(direction);
});

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());
