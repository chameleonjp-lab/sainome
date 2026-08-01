import { Dice } from './dice.js';

const BOARD_SIZE = 5;
const GAME_SECONDS = 60;
const DIRECTIONS = {
  up: { row: -1, column: 0 },
  down: { row: 1, column: 0 },
  left: { row: 0, column: -1 },
  right: { row: 0, column: 1 }
};

export class SainomeGame {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.board = [];
    this.player = { row: 2, column: 2 };
    this.score = 0;
    this.cleared = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.timeLeft = GAME_SECONDS;
    this.running = false;
    this.inputLocked = false;
    this.pendingDirection = null;
    this.timerId = null;
    this.chainTimerId = null;
    this.diceSequence = 0;
  }

  start() {
    this.stopTimers();
    this.score = 0;
    this.cleared = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.timeLeft = GAME_SECONDS;
    this.running = true;
    this.inputLocked = false;
    this.pendingDirection = null;
    this.player = { row: 2, column: 2 };
    this.createBoard();
    this.emitState();
    this.callbacks.onMessage?.('盤面をスワイプして移動');

    this.timerId = window.setInterval(() => {
      if (!this.running) return;
      this.timeLeft -= 1;
      this.emitState();
      if (this.timeLeft <= 0) this.finish();
    }, 1000);
  }

  createBoard() {
    this.board = Array.from({ length: BOARD_SIZE }, (_, row) =>
      Array.from({ length: BOARD_SIZE }, (_, column) => this.createDice(row, column))
    );
    this.reduceOpeningMatches();
  }

  createDice(row, column) {
    this.diceSequence += 1;
    const die = new Dice(`dice-${this.diceSequence}`, row, column);
    die.rollDirection = null;
    return die;
  }

  reduceOpeningMatches() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const groups = this.findAllValidGroups();
      if (groups.length === 0) return;
      for (const group of groups) {
        for (const die of group) Object.assign(die, Dice.randomOrientation());
      }
    }
  }

  requestMove(direction) {
    if (!this.running || !DIRECTIONS[direction]) return;
    if (this.inputLocked) {
      this.pendingDirection = direction;
      return;
    }
    void this.move(direction);
  }

  async move(direction) {
    if (!this.running || this.inputLocked || !DIRECTIONS[direction]) return;

    const delta = DIRECTIONS[direction];
    const nextRow = this.player.row + delta.row;
    const nextColumn = this.player.column + delta.column;

    if (!this.isInside(nextRow, nextColumn)) {
      this.callbacks.onMessage?.('その先に盤面はない');
      this.callbacks.onBlocked?.(direction);
      return;
    }

    this.inputLocked = true;
    const currentDie = this.board[this.player.row][this.player.column];
    const targetDie = this.board[nextRow][nextColumn];
    currentDie.state = 'rolling';
    currentDie.rollDirection = direction;
    this.emitState();

    await this.wait(210);
    if (!this.running) return;

    const oldRow = this.player.row;
    const oldColumn = this.player.column;
    currentDie.roll(direction, nextRow, nextColumn);
    targetDie.row = oldRow;
    targetDie.column = oldColumn;
    this.board[nextRow][nextColumn] = currentDie;
    this.board[oldRow][oldColumn] = targetDie;
    this.player = { row: nextRow, column: nextColumn };
    currentDie.state = 'normal';
    currentDie.rollDirection = null;
    this.emitState();
    this.callbacks.onLand?.();

    await this.resolveMatches();
    this.inputLocked = false;

    const queued = this.pendingDirection;
    this.pendingDirection = null;
    if (queued && this.running) void this.move(queued);
  }

  async resolveMatches() {
    const groups = this.findAllValidGroups();
    if (groups.length === 0) {
      this.callbacks.onMessage?.('目と同じ数だけ、縦か横につなぐ');
      return;
    }

    const uniqueDice = [...new Map(groups.flat().map((die) => [die.id, die])).values()];
    this.chain += 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    window.clearTimeout(this.chainTimerId);
    this.chainTimerId = window.setTimeout(() => {
      this.chain = 0;
      this.emitState();
    }, 1900);

    for (const die of uniqueDice) die.state = 'matched';
    this.callbacks.onMessage?.(`${this.chain}連鎖・${uniqueDice.length}個`);
    this.callbacks.onChain?.({ chain: this.chain, count: uniqueDice.length });
    this.emitState();
    await this.wait(620);
    if (!this.running) return;

    for (const die of uniqueDice) die.state = 'deleting';
    this.emitState();
    await this.wait(280);
    if (!this.running) return;

    const multiplier = this.getChainMultiplier();
    let gained = 0;
    for (const die of uniqueDice) {
      gained += die.top * 100 * multiplier;
      this.board[die.row][die.column] = this.createDice(die.row, die.column);
    }

    this.cleared += uniqueDice.length;
    this.score += Math.round(gained);
    this.callbacks.onScore?.(Math.round(gained));
    this.emitState();
  }

  findAllValidGroups() {
    const visited = new Set();
    const groups = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let column = 0; column < BOARD_SIZE; column += 1) {
        const start = this.board[row][column];
        if (!start || visited.has(start.id)) continue;

        const group = [];
        const queue = [start];
        visited.add(start.id);

        while (queue.length > 0) {
          const die = queue.shift();
          group.push(die);

          for (const delta of Object.values(DIRECTIONS)) {
            const nextRow = die.row + delta.row;
            const nextColumn = die.column + delta.column;
            if (!this.isInside(nextRow, nextColumn)) continue;
            const neighbor = this.board[nextRow][nextColumn];
            if (!neighbor || visited.has(neighbor.id) || neighbor.top !== start.top) continue;
            visited.add(neighbor.id);
            queue.push(neighbor);
          }
        }

        if (start.top >= 2 && group.length >= start.top) groups.push(group);
      }
    }

    return groups;
  }

  getChainMultiplier() {
    if (this.chain >= 5) return 4;
    if (this.chain === 4) return 3;
    if (this.chain === 3) return 2;
    if (this.chain === 2) return 1.5;
    return 1;
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    this.inputLocked = true;
    this.pendingDirection = null;
    this.timeLeft = 0;
    this.stopTimers();
    this.emitState();
    this.callbacks.onFinish?.({ score: this.score, cleared: this.cleared, maxChain: this.maxChain });
  }

  stopTimers() {
    window.clearInterval(this.timerId);
    window.clearTimeout(this.chainTimerId);
    this.timerId = null;
    this.chainTimerId = null;
  }

  emitState() {
    this.callbacks.onUpdate?.({
      board: this.board,
      player: this.player,
      score: this.score,
      cleared: this.cleared,
      chain: this.chain,
      maxChain: this.maxChain,
      timeLeft: this.timeLeft,
      running: this.running
    });
  }

  isInside(row, column) {
    return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
  }

  wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}
