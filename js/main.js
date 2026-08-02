import { WebGLSainome } from './webgl-game.js';

const canvas = document.querySelector('#game-canvas');
const stage = document.querySelector('#stage');
const loading = document.querySelector('#loading');
const message = document.querySelector('#message');
const rollCount = document.querySelector('#roll-count');
const chainCount = document.querySelector('#chain-count');
const clearCount = document.querySelector('#clear-count');
const resetButton = document.querySelector('#reset-button');

let pointerStart = null;

const game = new WebGLSainome(canvas, {
  onRoll: (count) => {
    rollCount.textContent = String(count);
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
  }
});

loading.classList.add('hidden');

function directionFromSwipe(deltaX, deltaY) {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? 'right' : 'left';
  return deltaY > 0 ? 'down' : 'up';
}

stage.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  stage.setPointerCapture?.(event.pointerId);
});

stage.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const direction = directionFromSwipe(
    event.clientX - pointerStart.x,
    event.clientY - pointerStart.y
  );
  pointerStart = null;
  if (direction) game.move(direction);
});

stage.addEventListener('pointercancel', () => {
  pointerStart = null;
});

for (const button of document.querySelectorAll('[data-direction]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    game.move(button.dataset.direction);
  });
}

const keyMap = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right'
};

document.addEventListener('keydown', (event) => {
  const direction = keyMap[event.key];
  if (!direction) return;
  event.preventDefault();
  game.move(direction);
});

resetButton.addEventListener('click', () => game.reset());
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());
